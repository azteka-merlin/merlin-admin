import React from "react";
import { formatDateTime, maskKey, maskTechnicalValue } from "../lib/admin-ui";

function statusLabel(status) {
  return {
    active: "Ativa",
    reserved: "Reservada",
    processing: "Processando",
    expired: "Encerrada",
    failed: "Falhou"
  }[status] || status;
}

function statusTone(status) {
  if (status === "active") return "success";
  if (status === "reserved" || status === "processing") return "warning";
  if (status === "failed") return "danger";
  return "muted";
}

export default function PremiumActivationsPage({
  activations,
  loading,
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  loadActivations,
  releaseActivation,
  busyAction,
  notify
}) {
  const query = search.trim().toLowerCase();
  const filtered = React.useMemo(() => activations.filter((activation) => {
    if (statusFilter !== "all" && activation.status !== statusFilter) return false;
    if (!query) return true;
    return [
      activation.userName,
      activation.licenseKey,
      activation.gameName,
      activation.appId,
      activation.hwid,
      activation.failureReason
    ].some((value) => String(value || "").toLowerCase().includes(query));
  }), [activations, query, statusFilter]);

  async function handleRelease(activation) {
    const player = activation.userName || `licença #${activation.licenseId}`;
    if (!window.confirm(`Liberar o cooldown de ${player} para ${activation.gameName || `o app ${activation.appId}`}? A ativação continuará contabilizada.`)) return;

    try {
      await releaseActivation(activation.id);
      notify("Cooldown liberado. A ativação permanece contabilizada.");
    } catch (error) {
      notify(error.message || "Não foi possível liberar o cooldown.");
    }
  }

  return (
    <section className="page">
      <div className="page__header page__header--split">
        <div>
          <p className="eyebrow">Premium</p>
          <h1>Ativações premium</h1>
          <p>Consulte as ativações e libere manualmente um cooldown quando uma falha impedir nova tentativa.</p>
        </div>
        <button className="button button--ghost" onClick={loadActivations} disabled={loading}>
          {loading ? "Atualizando..." : "Atualizar lista"}
        </button>
      </div>

      <section className="panel panel--audit">
        <div className="filters filters--audit">
          <label className="field-shell field-shell--search">
            <span>Buscar</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Usuário, licença, jogo, app ID..." />
          </label>
          <label className="field-shell">
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Todas as ativações</option>
              <option value="active">Somente ativas</option>
              <option value="reserved">Reservadas</option>
              <option value="processing">Processando</option>
              <option value="failed">Com falha</option>
              <option value="expired">Encerradas</option>
            </select>
          </label>
        </div>

        {loading ? (
          <div className="empty-state"><h3>Carregando ativações</h3><p>Buscando o histórico de ativações premium.</p></div>
        ) : !filtered.length ? (
          <div className="empty-state"><h3>Nenhuma ativação encontrada</h3><p>Ajuste a busca ou o filtro para localizar uma ativação.</p></div>
        ) : (
          <div className="audit-list">
            {filtered.map((activation) => (
              <article className="audit-card" key={activation.id}>
                <div className="audit-card__head">
                  <div className="user-cell user-cell--audit">
                    <span className={`avatar avatar--tone-${statusTone(activation.status)}`}>{String(activation.userName || "?").slice(0, 1).toUpperCase()}</span>
                    <div><strong>{activation.userName || "Usuário sem nome"}</strong><p>{activation.gameName || `App ${activation.appId}`}</p></div>
                  </div>
                  <span className={`badge badge--${statusTone(activation.status)}`}>{statusLabel(activation.status)}</span>
                </div>
                <div className="audit-card__body">
                  <dl className="audit-card__meta">
                    <div><dt>Licença</dt><dd title={activation.licenseKey}>{maskKey(activation.licenseKey || "--")}</dd></div>
                    <div><dt>App ID</dt><dd>{activation.appId}</dd></div>
                    <div><dt>Ativada em</dt><dd>{formatDateTime(activation.activatedAt || activation.createdAt)}</dd></div>
                  </dl>
                  <dl className="audit-card__meta">
                    <div><dt>Cooldown até</dt><dd>{activation.cooldownUntil ? formatDateTime(activation.cooldownUntil) : "--"}</dd></div>
                    <div><dt>HWID</dt><dd title={activation.hwid || "--"}>{activation.hwid ? maskTechnicalValue(activation.hwid, 10, 4) : "--"}</dd></div>
                    <div><dt>Falha</dt><dd title={activation.failureReason || "--"}>{activation.failureReason || "--"}</dd></div>
                  </dl>
                </div>
                {activation.status === "active" && (
                  <div className="premium-activation__actions">
                    <button className="button button--ghost" onClick={() => handleRelease(activation)} disabled={busyAction === `release-premium-activation-${activation.id}`}>
                      {busyAction === `release-premium-activation-${activation.id}` ? "Liberando..." : "Liberar cooldown"}
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
