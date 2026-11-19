import React, { useEffect, useRef, useState } from "react";
import ActivityCalendar from "../components/ActivityCalendar";
import { activityBounds, addDays, todayInBrasilia } from "../lib/activity-period";
import { formatDate, formatDateTimeBrt, initials, maskTechnicalValue, userActivityLabel } from "../lib/admin-ui";

function manifestSourceLabel(source) {
  return ({
    depotbox: "DepotBox",
    ryu: "Ryuu",
    "steam-api": "Steam API",
    "r2-override": "Override",
    hubcap: "Hubcap",
    skyflare: "Skyflare",
  })[source] || source || "--";
}

const TODAY = { mode: "today" };
const LAST_WEEK = { mode: "week" };

function periodLabel(period) {
  const today = todayInBrasilia();
  if (period.mode === "today") return formatDate(today);
  if (period.mode === "week") return formatDate(addDays(today, -6)) + " a " + formatDate(today);
  if (period.mode === "range") return formatDate(period.start) + " a " + formatDate(period.end);
  const date = formatDate(period.start);
  if (period.startTime === "00:00" && period.endTime === "23:59") return date;
  return date + " · " + period.startTime + "–" + period.endTime;
}

export default function ActivityPage({ apiRequest }) {
  const request = useRef(apiRequest);
  request.current = apiRequest;
  const [period, setPeriod] = useState(TODAY);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [activitySearch, setActivitySearch] = useState("");
  const [search, setSearch] = useState("");
  const [activityActionFilter, setActivityActionFilter] = useState("all");
  const [activityStatusFilter, setActivityStatusFilter] = useState("all");
  const [loadingUserActivityLogs, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState("");
  const [pages, setPages] = useState([null]);
  const [revision, setRevision] = useState(0);
  const cursor = pages.at(-1);

  useEffect(() => {
    const controller = new AbortController();
    const bounds = activityBounds(period);
    if (!bounds) return;
    const params = new URLSearchParams({ ...bounds, limit: "25" });
    if (activityActionFilter !== "all") params.set("action", activityActionFilter);
    if (activityStatusFilter !== "all") params.set("status", activityStatusFilter);
    if (search) params.set("search", search);
    if (cursor) {
      params.set("beforeAt", cursor.beforeAt);
      params.set("beforeId", String(cursor.beforeId));
    }
    setLoading(true);
    setError("");
    request.current("/panel-api/user-activity?" + params, { signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) setSnapshot(result);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause.message || "Não foi possível carregar a atividade.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [period, search, activityActionFilter, activityStatusFilter, cursor, revision]);

  function pickPeriod(next) {
    setPeriod(next);
    setPages([null]);
  }

  function refresh() {
    setPages([null]);
    setRevision(value => value + 1);
  }

  const filteredUserActivityLogs = snapshot?.logs || [];
  return (
    <section className="page">
      <div className="page__header page__header--split">
        <div>
          <p className="eyebrow">Atividade</p>
          <h1>Acompanhe login e ativação de jogos dos usuários.</h1>
        </div>
        <button className="button button--ghost" onClick={refresh} disabled={loadingUserActivityLogs}>
          {loadingUserActivityLogs ? "Atualizando..." : "Atualizar atividade"}
        </button>
      </div>

      <section className="panel panel--audit">
        <div className="activity-period">
          <div className="catalog-queue__tabs" role="group" aria-label="Período da atividade">
            <button type="button" className={"catalog-queue__tab " + (period.mode === "today" ? "is-active" : "")} aria-pressed={period.mode === "today"} onClick={() => pickPeriod(TODAY)}>Hoje</button>
            <button type="button" className={"catalog-queue__tab " + (period.mode === "week" ? "is-active" : "")} aria-pressed={period.mode === "week"} onClick={() => pickPeriod(LAST_WEEK)}>Últimos 7 dias</button>
            <button type="button" className={"catalog-queue__tab " + (period.mode === "day" || period.mode === "range" ? "is-active" : "")} aria-haspopup="dialog" onClick={() => setCalendarOpen(true)}>Calendário</button>
          </div>
          <span className="field-grid__note">{periodLabel(period)} · Brasília</span>
        </div>
        {calendarOpen && <ActivityCalendar period={period} onApply={pickPeriod} onClose={() => setCalendarOpen(false)} />}
        <form className="filters filters--audit activity-filters" onSubmit={event => {
          event.preventDefault();
          setSearch(activitySearch.trim());
          setPages([null]);
        }}>
          <label className="field-shell field-shell--search">
            <span>Buscar</span>
            <input
              maxLength={160}
              value={activitySearch}
              onChange={(event) => setActivitySearch(event.target.value)}
              placeholder="Nome, chave, appId, IP..."
            />
          </label>

          <label className="field-shell">
            <span>Ação</span>
            <select value={activityActionFilter} onChange={(event) => { setActivityActionFilter(event.target.value); setPages([null]); }}>
              <option value="all">Todas as ações</option>
              <option value="user_login_success">Login do usuário</option>
              <option value="hwid_reset_success">Redefinição de HWID</option>
              <option value="game_activation_success">Ativação liberada</option>
              <option value="game_activation_denied">Ativação negada</option>
              <option value="premium_activation_success">Ativação premium liberada</option>
              <option value="premium_activation_failed">Ativação premium falhou</option>
            </select>
          </label>

          <label className="field-shell">
            <span>Status</span>
            <select value={activityStatusFilter} onChange={(event) => { setActivityStatusFilter(event.target.value); setPages([null]); }}>
              <option value="all">Todos os status</option>
              <option value="success">Sucesso</option>
              <option value="denied">Negado</option>
            </select>
          </label>
          <button className="button button--ghost" type="submit">Buscar</button>
        </form>

        {error ? <div className="notice notice--warning" role="alert">{error}</div> : loadingUserActivityLogs ? (
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
                  <span className={`badge badge--${log.status === "denied" ? "danger" : "success"}`}>{log.status === "denied" ? "Negado" : "Sucesso"}</span>
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
                      <dt>{log.action === "game_activation_success" ? "Fonte do ZIP" : "Motivo"}</dt>
                      <dd className="truncate-text" title={log.action === "game_activation_success" ? manifestSourceLabel(log.metadata?.source) : log.reason || "--"}>
                        {log.action === "game_activation_success" ? manifestSourceLabel(log.metadata?.source) : log.reason || "--"}
                      </dd>
                    </div>
                    <div>
                      <dt>Launcher</dt>
                      <dd>{log.launcherVersion || "—"}</dd>
                    </div>
                    <div>
                      <dt>Data</dt>
                      <dd>{formatDateTimeBrt(log.createdAt)}</dd>
                    </div>
                  </dl>
                </div>
              </article>
            ))}
          </div>
        )}
        {(pages.length > 1 || snapshot?.nextCursor) && <nav className="catalog-queue__top-actions catalog-queue__heading" aria-label="Paginação da atividade">
          <button type="button" className="button button--ghost" disabled={loadingUserActivityLogs || pages.length === 1} onClick={() => setPages(value => value.slice(0, -1))}>Anterior</button>
          <span aria-live="polite">Página {pages.length}</span>
          <button type="button" className="button button--ghost" disabled={loadingUserActivityLogs || !!error || !snapshot?.nextCursor} onClick={() => setPages(value => [...value, snapshot.nextCursor])}>Próxima</button>
        </nav>}
      </section>
    </section>
  );
}
