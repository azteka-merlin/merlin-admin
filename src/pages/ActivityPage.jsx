import React from "react";
import { formatDateTime, initials, maskTechnicalValue, userActivityLabel } from "../lib/admin-ui";

export default function ActivityPage({
  activitySearch,
  setActivitySearch,
  activityActionFilter,
  setActivityActionFilter,
  activityStatusFilter,
  setActivityStatusFilter,
  loadingUserActivityLogs,
  filteredUserActivityLogs,
  loadUserActivityLogs
}) {
  return (
    <section className="page">
      <div className="page__header page__header--split">
        <div>
          <p className="eyebrow">Atividade</p>
          <h1>Acompanhe login e ativação de jogos dos usuários.</h1>
        </div>
        <button className="button button--ghost" onClick={loadUserActivityLogs} disabled={loadingUserActivityLogs}>
          {loadingUserActivityLogs ? "Atualizando..." : "Atualizar atividade"}
        </button>
      </div>

      <section className="panel panel--audit">
        <div className="filters filters--audit">
          <label className="field-shell field-shell--search">
            <span>Buscar</span>
            <input
              value={activitySearch}
              onChange={(event) => setActivitySearch(event.target.value)}
              placeholder="Nome, chave, appId, IP..."
            />
          </label>

          <label className="field-shell">
            <span>Ação</span>
            <select value={activityActionFilter} onChange={(event) => setActivityActionFilter(event.target.value)}>
              <option value="all">Todas as ações</option>
              <option value="user_login_success">Login do usuário</option>
              <option value="game_activation_success">Ativação liberada</option>
              <option value="game_activation_denied">Ativação negada</option>
            </select>
          </label>

          <label className="field-shell">
            <span>Status</span>
            <select value={activityStatusFilter} onChange={(event) => setActivityStatusFilter(event.target.value)}>
              <option value="all">Todos os status</option>
              <option value="success">Success</option>
              <option value="denied">Denied</option>
            </select>
          </label>
        </div>

        {loadingUserActivityLogs ? (
          <div className="empty-state">
            <h3>Carregando atividade</h3>
            <p>Buscando os eventos de usuário mais recentes.</p>
          </div>
        ) : !filteredUserActivityLogs.length ? (
          <div className="empty-state">
            <h3>Nenhuma atividade encontrada</h3>
            <p>Ajuste os filtros ou aguarde novos eventos de login e ativação.</p>
          </div>
        ) : (
          <div className="audit-list">
            {filteredUserActivityLogs.map((log) => (
              <article className="audit-card" key={log.id}>
                <div className="audit-card__head">
                  <div className="user-cell user-cell--audit">
                    <span className={`avatar avatar--tone-${log.status === "denied" ? "danger" : "success"}`}>{initials(log.userName)}</span>
                    <div>
                      <strong>{log.userName}</strong>
                      <p>{userActivityLabel(log.action)}</p>
                    </div>
                  </div>
                  <span className={`badge badge--${log.status === "denied" ? "danger" : "success"}`}>{log.status}</span>
                </div>

                <div className="audit-card__body">
                  <dl className="audit-card__meta">
                    <div>
                      <dt>Licença</dt>
                      <dd className="truncate-text" title={log.licenseKey}>{log.licenseKey}</dd>
                    </div>
                    <div>
                      <dt>App ID</dt>
                      <dd className="truncate-text" title={log.appId || "--"}>{log.appId || "--"}</dd>
                    </div>
                    <div>
                      <dt>IP</dt>
                      <dd className="truncate-text" title={log.ipAddress || "--"}>{log.ipAddress || "--"}</dd>
                    </div>
                  </dl>

                  <dl className="audit-card__meta">
                    <div>
                      <dt>HWID</dt>
                      <dd className="truncate-text" title={log.hwid || "--"}>
                        {log.hwid ? maskTechnicalValue(log.hwid, 10, 4) : "--"}
                      </dd>
                    </div>
                    <div>
                      <dt>Motivo</dt>
                      <dd className="truncate-text" title={log.reason || "--"}>{log.reason || "--"}</dd>
                    </div>
                    <div>
                      <dt>Data</dt>
                      <dd>{formatDateTime(log.createdAt)}</dd>
                    </div>
                  </dl>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
