import React from "react";
import { formatDateTimeBrt } from "../lib/admin-ui";

const STATUS_LABELS = { open: "Aberto", acknowledged: "Reconhecido", resolved: "Resolvido" };
const STATUS_TONES = { open: "danger", acknowledged: "warning", resolved: "success" };
const TYPE_LABELS = { steam_connection: "Conexão Steam" };
const PUSH_SCOPE = "/admin-alerts/";
const PAGE_SIZE = 50;

function base64UrlToUint8Array(value) {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

export default function AlertsPage({ apiRequest, notify }) {
  const [alerts, setAlerts] = React.useState([]);
  const [selectedId, setSelectedId] = React.useState(new URLSearchParams(window.location.search).get("id"));
  const [selected, setSelected] = React.useState(null);
  const [status, setStatus] = React.useState("active");
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(false);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [pushConfig, setPushConfig] = React.useState(null);
  const [pushState, setPushState] = React.useState("checking");

  async function refresh(quiet = false) {
    if (!quiet) setLoading(true);
    try {
      const payload = await apiRequest(`/panel-api/alerts?limit=${PAGE_SIZE}`);
      const latest = payload.alerts || [];
      if (quiet) {
        setAlerts((current) => {
          const ids = new Set(latest.map((alert) => alert.id));
          return [...latest, ...current.filter((alert) => !ids.has(alert.id))];
        });
      } else {
        setAlerts(latest);
        setHasMore(Boolean(payload.hasMore));
      }
      setError("");
    } catch (failure) {
      if (!quiet) setError(failure.message || "Não foi possível carregar os alertas.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  async function loadMore() {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const payload = await apiRequest(`/panel-api/alerts?limit=${PAGE_SIZE}&offset=${alerts.length}`);
      setAlerts((current) => {
        const ids = new Set(current.map((alert) => alert.id));
        return [...current, ...(payload.alerts || []).filter((alert) => !ids.has(alert.id))];
      });
      setHasMore(Boolean(payload.hasMore));
    } catch (failure) {
      notify(failure.message || "Não foi possível carregar mais alertas.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function loadDetail(id, quiet = false) {
    if (!id) return;
    if (!quiet) setDetailLoading(true);
    try {
      const payload = await apiRequest(`/panel-api/alerts/${encodeURIComponent(id)}`);
      setSelected(payload.alert || null);
    } catch (failure) {
      if (!quiet) notify(failure.message || "Não foi possível abrir o alerta.");
    } finally {
      if (!quiet) setDetailLoading(false);
    }
  }

  React.useEffect(() => {
    refresh();
    let active = true;
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (active) setPushState("unsupported");
        return;
      }
      try {
        const config = await apiRequest("/panel-api/alerts/push-config");
        if (!active) return;
        setPushConfig(config);
        if (!config.available) {
          setPushState("unconfigured");
        } else if (Notification.permission === "denied") {
          setPushState("denied");
        } else {
          const registration = await navigator.serviceWorker.getRegistration(PUSH_SCOPE);
          const subscription = await registration?.pushManager.getSubscription();
          if (active) setPushState(subscription ? "enabled" : "disabled");
        }
      } catch {
        if (active) setPushState("unconfigured");
      }
    })();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh(true);
    }, 30000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  React.useEffect(() => {
    if (!selectedId) return undefined;
    loadDetail(selectedId);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") loadDetail(selectedId, true);
    }, 30000);
    return () => window.clearInterval(timer);
  }, [selectedId]);

  function selectAlert(id) {
    setSelectedId(id);
    setSelected(null);
    window.history.replaceState({}, "", `/alerts?id=${encodeURIComponent(id)}`);
  }

  async function changeStatus(nextStatus) {
    if (!selectedId || busy) return;
    setBusy(true);
    try {
      await apiRequest(`/panel-api/alerts/${encodeURIComponent(selectedId)}/status`, {
        method: "POST", mutate: true, body: { status: nextStatus }
      });
      await Promise.all([refresh(true), loadDetail(selectedId, true)]);
      notify(nextStatus === "resolved" ? "Alerta resolvido." : "Alerta reconhecido.");
    } catch (failure) {
      notify(failure.message || "Não foi possível atualizar o alerta.");
    } finally {
      setBusy(false);
    }
  }

  async function enablePush() {
    if (!pushConfig?.available || !pushConfig.publicKey || busy || (isIos() && !isStandalone())) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushState(permission === "denied" ? "denied" : "disabled");
        return;
      }
      const registration = await navigator.serviceWorker.register("/admin-alerts/sw.js", { scope: PUSH_SCOPE });
      const subscription = await registration.pushManager.getSubscription()
        || await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(pushConfig.publicKey)
        });
      await apiRequest("/panel-api/alerts/push-subscriptions", {
        method: "POST", mutate: true, body: subscription.toJSON()
      });
      setPushState("enabled");
      notify("Notificações ativadas neste dispositivo.");
    } catch (failure) {
      notify(failure.message || "Não foi possível ativar as notificações.");
      setPushState("disabled");
    } finally {
      setBusy(false);
    }
  }

  async function disablePush() {
    if (busy) return;
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration(PUSH_SCOPE);
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await apiRequest("/panel-api/alerts/push-subscriptions", {
          method: "DELETE", mutate: true, body: { endpoint: subscription.endpoint }
        });
        await subscription.unsubscribe();
      }
      setPushState("disabled");
      notify("Notificações desativadas neste dispositivo.");
    } catch (failure) {
      notify(failure.message || "Não foi possível desativar as notificações.");
    } finally {
      setBusy(false);
    }
  }

  const filtered = alerts.filter((alert) => status === "all"
    || (status === "active" ? alert.status !== "resolved" : alert.status === status));
  const openCount = alerts.filter((alert) => alert.status === "open").length;
  const needsIosInstall = isIos() && !isStandalone();

  return (
    <section className="page alerts-page">
      <div className="page__header page__header--split">
        <div>
          <p className="eyebrow">Operações</p>
          <h1>Alertas</h1>
          <p>Acompanhe incidentes do Merlin e as tentativas que deram origem a cada alerta.</p>
        </div>
        <button className="button button--ghost" onClick={() => refresh()} disabled={loading}>
          {loading ? "Atualizando..." : "Atualizar alertas"}
        </button>
      </div>

      <div className="alerts-summary">
        <div className="panel alerts-summary__count"><strong>{openCount}</strong><span>Precisam de atenção</span></div>
        <div className="panel alerts-push">
          <div><strong>Notificações neste celular</strong><p>Um aviso por incidente. Os detalhes permanecem protegidos no Admin.</p></div>
          {pushState === "enabled" ? (
            <button className="button button--ghost" onClick={disablePush} disabled={busy}>Desativar</button>
          ) : pushState === "disabled" ? (
            <button className="button button--primary" onClick={enablePush} disabled={busy || needsIosInstall}>{needsIosInstall ? "Instale o Admin" : busy ? "Ativando..." : "Ativar avisos"}</button>
          ) : <span className="badge badge--muted">{{ checking: "Verificando...", unsupported: "Indisponível neste navegador", denied: "Bloqueado no celular", unconfigured: "Aguardando configuração" }[pushState]}</span>}
          {needsIosInstall && <p className="alerts-push__hint">No iPhone, adicione o Admin à Tela de Início e abra por esse ícone antes de ativar os avisos.</p>}
        </div>
      </div>

      <div className="alerts-layout">
        <div className="panel alerts-list">
          <div className="alerts-list__header">
            <strong>Incidentes</strong>
            <select aria-label="Filtrar alertas" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="active">Em andamento</option>
              <option value="all">Todos</option>
              <option value="open">Abertos</option>
              <option value="acknowledged">Reconhecidos</option>
              <option value="resolved">Resolvidos</option>
            </select>
          </div>
          {error && <p className="alerts-error">{error}</p>}
          {loading && !alerts.length ? <div className="empty-state"><h3>Carregando alertas</h3></div>
            : !filtered.length ? <div className="empty-state"><h3>Nenhum alerta por aqui</h3><p>Novos incidentes aparecerão nesta lista.</p></div>
              : <div className="alerts-list__items">{filtered.map((alert) => (
                <button type="button" key={alert.id} className={`alerts-item ${selectedId === alert.id ? "is-selected" : ""}`} onClick={() => selectAlert(alert.id)}>
                  <span className="alerts-item__top"><strong>{alert.title}</strong><span className={`badge badge--${STATUS_TONES[alert.status] || "muted"}`}>{STATUS_LABELS[alert.status] || alert.status}</span></span>
                  <span>{TYPE_LABELS[alert.type] || alert.type} · {alert.occurrence_count} {alert.occurrence_count === 1 ? "ocorrência" : "ocorrências"}</span>
                  <small>Última: {formatDateTimeBrt(alert.last_occurred_at)}</small>
                </button>
              ))}</div>}
          {hasMore && <button className="button button--ghost alerts-list__more" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Carregando..." : "Carregar mais alertas"}</button>}
        </div>

        <div className="panel alerts-detail">
          {!selectedId ? <div className="empty-state"><h3>Selecione um incidente</h3><p>Veja aqui o contexto técnico e o histórico das tentativas.</p></div>
            : detailLoading && !selected ? <div className="empty-state"><h3>Carregando detalhes...</h3></div>
              : selected ? <>
                <div className="alerts-detail__header">
                  <div><span className="eyebrow">{TYPE_LABELS[selected.type] || selected.type}</span><h2>{selected.title}</h2><p>{selected.summary}</p></div>
                  <span className={`badge badge--${STATUS_TONES[selected.status] || "muted"}`}>{STATUS_LABELS[selected.status] || selected.status}</span>
                </div>
                <div className="alerts-detail__meta">
                  <span>Primeira falha: <strong>{formatDateTimeBrt(selected.first_occurred_at)}</strong></span>
                  <span>Última falha: <strong>{formatDateTimeBrt(selected.last_occurred_at)}</strong></span>
                  <span>Ocorrências: <strong>{selected.occurrence_count}</strong></span>
                </div>
                {selected.status !== "resolved" && <div className="alerts-detail__actions">
                  {selected.status === "open" && <button className="button button--ghost" onClick={() => changeStatus("acknowledged")} disabled={busy}>Reconhecer</button>}
                  <button className="button button--primary" onClick={() => changeStatus("resolved")} disabled={busy}>Marcar como resolvido</button>
                </div>}
                <h3>Ocorrências recentes</h3>
                <div className="alerts-events">{selected.events?.map((event) => <article key={event.id} className="alerts-event">
                  <div className="alerts-event__head"><strong>{event.gameName || (event.appId ? `App ${event.appId}` : "Worker")}</strong><time>{formatDateTimeBrt(event.occurredAt)}</time></div>
                  <p>{event.message}</p>
                  <div className="alerts-event__links">
                    {event.licenseId && <span>Licença #{event.licenseId}</span>}
                    {event.appId && <span>AppID {event.appId}</span>}
                    <span>{event.source}</span>
                  </div>
                  <details><summary>Payload técnico filtrado</summary><pre>{JSON.stringify(event.payload, null, 2)}</pre></details>
                </article>)}</div>
                {selected.events?.length >= 100 && <p className="alerts-detail__note">Mostrando as 100 ocorrências mais recentes.</p>}
              </> : <div className="empty-state"><h3>Não foi possível abrir o alerta</h3><button className="button button--ghost" onClick={() => loadDetail(selectedId)}>Tentar novamente</button></div>}
        </div>
      </div>
    </section>
  );
}
