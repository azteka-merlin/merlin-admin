import React from "react";
import { actionLabel, actionTone, appStats, describeAuditLog, formatDateTime, initials } from "../lib/admin-ui";

export default function OverviewPage({ licenses, auditLogs, navigate, openModal, loadLicenses, loadAuditLogs, refreshingOverview, apiRequest }) {
  const recentLogs = [...auditLogs].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)).slice(0, 5);
  const [serviceStatus, setServiceStatus] = React.useState(null);
  const [statusError, setStatusError] = React.useState('');
  const [loadingStatus, setLoadingStatus] = React.useState(false);
  async function loadServiceStatus() {
    setLoadingStatus(true); setStatusError('');
    try { setServiceStatus(await apiRequest('/panel-api/service-status')); }
    catch { setStatusError('Não foi possível consultar o monitor.'); }
    finally { setLoadingStatus(false); }
  }

  return (
    <section className="page">
      <div className="page__header">
        <div>
          <p className="eyebrow">Visão geral</p>
          <h1>Resumo das licenças cadastradas no Merlin.</h1>
          <p className="page__meta">{formatDateTime(new Date().toISOString())}</p>
        </div>
      </div>

      <section className="panel">
        <div className="section-heading"><div><p className="eyebrow">Disponibilidade</p><h2>Status dos serviços</h2></div>
          <button className="button button--ghost button--sm" onClick={loadServiceStatus} disabled={loadingStatus}>{loadingStatus ? 'Consultando...' : 'Consultar status'}</button>
        </div>
        {statusError && <p role="alert">{statusError}</p>}
        {serviceStatus?.enabled === false && <p>Monitor desativado.</p>}
        {serviceStatus?.schemaVersion === 1 && <div>
          <p>{serviceStatus.incidents?.length ? `${serviceStatus.incidents.length} incidente(s) confirmado(s)` : 'Nenhum incidente confirmado; dados insuficientes não representam disponibilidade comprovada.'}</p>
          {serviceStatus.suspiciousGames > 0 && <p>Adicionar jogos: falhas operacionais recentes em {serviceStatus.suspiciousGames} jogo(s); ainda sem confirmação de impacto geral.</p>}
          {serviceStatus.suspiciousCorrections > 0 && <p>Correções: falhas recentes em {serviceStatus.suspiciousCorrections} jogo(s); relatos diretos do Launcher são apenas indícios.</p>}
          {serviceStatus.catalogSuspicions > 0 && <p>Catálogo da Ryuu: {serviceStatus.catalogSuspicions} falha(s) recente(s) na consulta; aguardando confirmação quando ainda não houver incidente.</p>}
          {serviceStatus.catalog?.latest && <p>Última consulta de Correções: Ryuu {serviceStatus.catalog.latest.available ? 'disponível' : 'indisponível'} ({serviceStatus.catalog.latest.remoteCount} itens); {serviceStatus.catalog.latest.overrideCount} override(s) ativos; {formatDateTime(new Date(serviceStatus.catalog.latest.at).toISOString())}.</p>}
          {serviceStatus.catalog?.lastHealth && <p>Ryuu /health após falha do catálogo: {serviceStatus.catalog.lastHealth.result} · {formatDateTime(new Date(serviceStatus.catalog.lastHealth.at).toISOString())}.</p>}
          {(serviceStatus.incidents || []).map(incident => <p key={incident.id}>{incident.feature === 'corrections' ? 'Correções' : 'Adicionar jogos'}: limitação desde {formatDateTime(incident.startedAt)}</p>)}
          {Object.values(serviceStatus.diagnostics || {}).map(check => <p key={check.source}>{check.source}: {check.result} · {formatDateTime(check.checkedAt)} · {check.responseMs} ms{check.lastValidAt ? ` · última resposta válida: ${formatDateTime(check.lastValidAt)}` : ''}</p>)}
          {(serviceStatus.history || []).slice(-3).reverse().map(event => <p key={event.revision}>{event.feature === 'corrections' ? 'Correções' : 'Adicionar jogos'} · {event.action === 'expired_unknown' ? 'estado desconhecido' : event.action === 'recovered_probable' ? 'recuperação provável' : event.action === 'recovered_observed' ? 'recuperação observada' : 'incidente iniciado'} · {formatDateTime(event.at)}</p>)}
        </div>}
      </section>

      <div className="stats-grid">
        {appStats(licenses).map((card) => (
          <article className="stat-card" key={card.label}>
            <div className={`stat-card__dot stat-card__dot--${card.tone}`}></div>
            <p>{card.label}</p>
            <strong>{card.value}</strong>
            <span>{card.note}</span>
          </article>
        ))}
      </div>

      <div className="overview-grid">
        <section className="panel panel--recent-licenses">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Atividade recente</p>
              <h2>Últimos eventos administrativos</h2>
            </div>
            <button className="button button--ghost button--sm" onClick={() => navigate("audit")}>
              Ver auditoria
            </button>
          </div>

          <div className="recent-list recent-list--licenses">
            {recentLogs.map((log) => (
              <button className="recent-item recent-item--license" key={log.id} onClick={() => navigate("audit")}>
                <span className={`avatar avatar--tone-${actionTone(log.action)}`}>{initials(log.actorName)}</span>
                <div className="recent-item__body">
                  <strong>{log.actorName}</strong>
                  <p>{actionLabel(log.action)} · {describeAuditLog(log)}</p>
                </div>
                <div className="recent-item__aside">
                  <span className={`badge badge--${actionTone(log.action)}`}>{actionLabel(log.action)}</span>
                  <time>{formatDateTime(log.createdAt)}</time>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Ações</p>
              <h2>Acesso rápido</h2>
            </div>
          </div>
          <div className="quick-grid">
            <button className="quick-card" onClick={() => openModal("create")}>
              <strong>Nova licença</strong>
              <p>Cadastrar usuário e definir validade</p>
            </button>
            <button className="quick-card" onClick={() => navigate("licenses")}>
              <strong>Buscar licença</strong>
              <p>Consultar por nome, telefone ou chave</p>
            </button>
            <button className="quick-card" onClick={() => Promise.all([loadLicenses(), loadAuditLogs()])} disabled={refreshingOverview}>
              <strong>{refreshingOverview ? "Atualizando dados" : "Atualizar dados"}</strong>
              <p>Recarregar licenças e auditoria</p>
            </button>
            <button className="quick-card" onClick={() => navigate("overrides")}>
              <strong>Gerenciar overrides</strong>
              <p>Configurar manifests e fixes por appId</p>
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}
