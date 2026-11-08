import React from "react";
import { formatDateTimeBrt } from "../lib/admin-ui";

const featureLabel = { corrections: "Correções", add_games: "Adicionar jogos" };
const actionLabel = {
  opened: "Incidente iniciado",
  recovered_observed: "Recuperação observada",
  recovered_probable: "Recuperação provável",
  expired_unknown: "Evidência expirada; estado desconhecido",
  ryuu_paused_automatic: "Catálogo da Ryuu pausado após 10 falhas confirmadas",
  ryuu_paused_admin: "Catálogo da Ryuu pausado pelo Admin",
  ryuu_reenabled_admin: "Catálogo da Ryuu reativado pelo Admin",
  ryuu_failure_counter_recovered: "Contador de falhas zerado após quatro sucessos da Ryuu",
  mitigated_by_overrides: "Catálogo limitado mitigado pelos overrides"
};

export default function ServiceIncidentsPage({ apiRequest, notify }) {
  const [status, setStatus] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  async function refresh() {
    setLoading(true);
    try { setStatus(await apiRequest("/panel-api/service-status")); setError(""); }
    catch (failure) { setError(failure.message || "Não foi possível consultar os incidentes."); }
    finally { setLoading(false); }
  }

  React.useEffect(() => { void refresh(); }, []);

  async function changeRyuu(enabled) {
    setBusy(true);
    try {
      await apiRequest("/panel-api/service-status/corrections-source", {
        method: "POST", mutate: true, body: { enabled }
      });
      await refresh();
      notify(enabled ? "Catálogo da Ryuu reativado." : "Catálogo da Ryuu pausado; somente overrides serão exibidos.");
    } catch (failure) { notify(failure.message || "Não foi possível alterar a fonte de Correções."); }
    finally { setBusy(false); }
  }

  const source = status?.catalog;
  const enabled = status?.correctionsSource?.ryuuEnabled !== false;

  return <section className="page alerts-page">
    <div className="page__header page__header--split">
      <div><p className="eyebrow">Operações</p><h1>Incidentes dos serviços</h1><p>Estado atual, evidências recentes e controle da fonte de Correções.</p></div>
      <button className="button button--ghost" onClick={refresh} disabled={loading}>{loading ? "Consultando..." : "Atualizar"}</button>
    </div>
    {error && <p className="alerts-error" role="alert">{error}</p>}
    {status?.enabled === false && <div className="panel"><p>Monitor de instabilidades desativado neste ambiente.</p></div>}
    {status?.schemaVersion === 1 && <>
      <section className="panel service-incidents-control">
        <div><p className="eyebrow">Correções</p><h2>Catálogo da Ryuu</h2>
          <p>{enabled ? "Ativo: catálogo da Ryuu combinado com os overrides." : "Pausado: somente os overrides são listados. A reativação é manual."}</p>
          <p>Falhas confirmadas do catálogo e timeouts de ativação da Ryuu: {source?.confirmedFailures || 0} de {source?.threshold || 10}.</p>
          {(source?.confirmedFailures || 0) > 0 && <p>Sucessos consecutivos da Ryuu: {source?.counterRecovery || 0} de 4 para zerar as falhas.</p>}
          {source?.pausedAt && <p>Pausado em {formatDateTimeBrt(new Date(source.pausedAt).toISOString())} ({source.pausedBy === "automatic" ? "automaticamente" : "pelo Admin"}).</p>}
          {source?.lastHealth && <p>Último /health: {source.lastHealth.result} · {formatDateTimeBrt(new Date(source.lastHealth.at).toISOString())}.</p>}
        </div>
        <label className="service-incidents-switch"><input type="checkbox" checked={enabled} disabled={busy} onChange={event => changeRyuu(event.target.checked)} /> Usar catálogo da Ryuu</label>
      </section>
      <section className="panel"><div className="section-heading"><h2>Incidentes ativos</h2><span className="badge badge--muted">{status.incidents?.length || 0}</span></div>
        {status.incidents?.length ? <div className="alerts-list__items">{status.incidents.map(incident => <article className="alerts-item" key={incident.id}>
          <strong>{featureLabel[incident.feature] || incident.feature}</strong><span>{incident.messageKey === "corrections_catalog_limited" ? "Catálogo da Ryuu com instabilidade" : "Instabilidade parcial"}</span><small>Desde {formatDateTimeBrt(incident.startedAt)}</small>
        </article>)}</div> : <p>Nenhum incidente confirmado no momento.</p>}
      </section>
      <section className="panel"><div className="section-heading"><h2>Histórico recente</h2></div>
        {status.history?.length ? <div className="alerts-events">{[...status.history].reverse().map(event => <div className="alerts-event" key={event.revision}>
          <strong>{featureLabel[event.feature] || event.feature}</strong> · {actionLabel[event.action] || event.action}<p>{formatDateTimeBrt(event.at)}</p>
        </div>)}</div> : <p>Sem eventos registrados.</p>}
      </section>
    </>}
  </section>;
}
