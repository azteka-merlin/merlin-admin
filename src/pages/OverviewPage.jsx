import React from "react";
import { actionLabel, actionTone, appStats, describeAuditLog, formatDateTime, initials } from "../lib/admin-ui";

export default function OverviewPage({ licenses, auditLogs, navigate, openModal, loadLicenses, loadAuditLogs, refreshingOverview }) {
  const recentLogs = [...auditLogs].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)).slice(0, 5);

  return (
    <section className="page">
      <div className="page__header">
        <div>
          <p className="eyebrow">Visão geral</p>
          <h1>Resumo das licenças cadastradas no Merlin.</h1>
          <p className="page__meta">{formatDateTime(new Date().toISOString())}</p>
        </div>
      </div>

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
