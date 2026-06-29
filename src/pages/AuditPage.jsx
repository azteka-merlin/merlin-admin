import React from "react";
import { actionLabel, actionTone, describeAuditLog, formatDateTime, initials, listAuditActions } from "../lib/admin-ui";

export default function AuditPage({
  auditSearch,
  setAuditSearch,
  auditActionFilter,
  setAuditActionFilter,
  auditAdminFilter,
  setAuditAdminFilter,
  auditAdminOptions,
  auditLogs,
  loadingAuditLogs,
  filteredAuditLogs,
  loadAuditLogs
}) {
  return (
    <section className="page">
      <div className="page__header page__header--split">
        <div>
          <p className="eyebrow">Auditoria</p>
          <h1>Acompanhe os eventos administrativos do Merlin.</h1>
        </div>
        <button className="button button--ghost" onClick={loadAuditLogs} disabled={loadingAuditLogs}>
          {loadingAuditLogs ? "Atualizando..." : "Atualizar logs"}
        </button>
      </div>

      <section className="panel panel--audit">
        <div className="filters filters--audit">
          <label className="field-shell field-shell--search">
            <span>Buscar</span>
            <input
              value={auditSearch}
              onChange={(event) => setAuditSearch(event.target.value)}
              placeholder="Buscar por admin, ação ou entidade..."
            />
          </label>

          <label className="field-shell">
            <span>Ação</span>
            <select value={auditActionFilter} onChange={(event) => setAuditActionFilter(event.target.value)}>
              <option value="all">Todas as ações</option>
              {listAuditActions(auditLogs).map((action) => (
                <option key={action} value={action}>
                  {actionLabel(action)}
                </option>
              ))}
            </select>
          </label>

          <label className="field-shell">
            <span>Administrador</span>
            <select value={auditAdminFilter} onChange={(event) => setAuditAdminFilter(event.target.value)}>
              <option value="all">Todos os admins</option>
              {auditAdminOptions.map((admin) => (
                <option key={String(admin.id || admin.name)} value={String(admin.id || admin.name)}>
                  {admin.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loadingAuditLogs ? (
          <div className="empty-state">
            <h3>Carregando auditoria</h3>
            <p>Buscando os eventos administrativos mais recentes.</p>
          </div>
        ) : !filteredAuditLogs.length ? (
          <div className="empty-state">
            <h3>Nenhum evento encontrado</h3>
            <p>Ajuste os filtros ou aguarde novas ações administrativas.</p>
          </div>
        ) : (
          <div className="audit-list">
            {filteredAuditLogs.map((log) => (
              <article className="audit-card" key={log.id}>
                <div className="audit-card__head">
                  <div className="user-cell user-cell--audit">
                    <span className={`avatar avatar--tone-${actionTone(log.action)}`}>{initials(log.actorName)}</span>
                    <div>
                      <strong>{log.actorName}</strong>
                      <p>{actionLabel(log.action)}</p>
                    </div>
                  </div>
                  <span className={`badge badge--${actionTone(log.action)}`}>{actionLabel(log.action)}</span>
                </div>

                <div className="audit-card__body">
                  <p>{describeAuditLog(log)}</p>
                  <dl className="audit-card__meta">
                    <div>
                      <dt>Data</dt>
                      <dd>{formatDateTime(log.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>Admin ID</dt>
                      <dd>{log.adminUserId || "--"}</dd>
                    </div>
                    <div>
                      <dt>Entidade</dt>
                      <dd>{log.entityType ? `${log.entityType} #${log.entityId || "--"}` : "--"}</dd>
                    </div>
                  </dl>

                  {log.metadata && (
                    <div className="audit-card__details">
                      <span>Metadados</span>
                      <code>{JSON.stringify(log.metadata)}</code>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
