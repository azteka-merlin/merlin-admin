import React, { useEffect, useRef, useState } from "react";
import { formatDateTimeBrt } from "../lib/admin-ui";

const ROOT = "/panel-api/game-images";
const STATES = { queued: "Na fila", processing: "Baixando", stored: "Salva no R2", missing: "Sem imagem", failed: "Falhou" };
const TRIGGERS = { catalog: "Site do Merlin", launcher: "Launcher", activation: "Adicionar jogo", admin: "Admin" };
const ERRORS = { dispatch_failed: "Falha ao enviar à fila", download_failed: "Origem momentaneamente indisponível", job_expired: "A tarefa expirou" };
const REQUEUEABLE = new Set(["failed", "missing"]);
const VALID_APP_ID = /^[1-9]\d{0,11}$/;
const FIRST_PAGE = { cursor: null, offset: 0 };
const ACTIVITY_POLL_MS = 3000;
const BADGES = { processing: "warning", stored: "success", failed: "danger" };

export default function GameImagesPage({ apiRequest, notify }) {
  const request = useRef(apiRequest);
  request.current = apiRequest;
  const [view, setView] = useState("queue");
  const [appId, setAppId] = useState("");
  const [filter, setFilter] = useState("");
  const [pages, setPages] = useState([FIRST_PAGE]);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState(null);
  const [activity, setActivity] = useState(null);
  const [activityError, setActivityError] = useState(false);
  const [activityRevision, setActivityRevision] = useState(0);
  const previousActivity = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { cursor, offset } = pages.at(-1);
  const currentPage = data?.view === view && data.cursor === cursor && data.filter === filter ? data : null;
  const rows = currentPage?.rows || [];
  const metrics = activity ?? data;

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ view });
    if (cursor) params.set("cursor", cursor);
    if (filter) params.set("appId", filter);
    setLoading(true);
    setError("");
    request.current(ROOT + "?" + params, { signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) setData({ ...result, view, cursor, filter });
    }).catch((cause) => {
      if (!controller.signal.aborted) setError(cause.message || "Não foi possível consultar as imagens.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [view, cursor, filter, revision]);

  useEffect(() => {
    const controller = new AbortController();
    let timer;
    async function loadActivity() {
      try {
        const result = await request.current(ROOT + "/processing", { signal: controller.signal });
        if (controller.signal.aborted) return;
        setActivity(result);
        setActivityError(false);
        const key = JSON.stringify([result.backlog, result.rows.map(row => [row.appId, row.startedAt])]);
        if (previousActivity.current && previousActivity.current !== key) setRevision(value => value + 1);
        previousActivity.current = key;
      } catch {
        if (!controller.signal.aborted) setActivityError(true);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, ACTIVITY_POLL_MS);
      }
    }
    function poll() {
      if (document.hidden) timer = setTimeout(poll, ACTIVITY_POLL_MS);
      else void loadActivity();
    }
    void loadActivity();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [activityRevision]);

  function refresh() {
    setRevision(value => value + 1);
    setActivityRevision(value => value + 1);
  }

  function selectView(nextView) {
    setPages([FIRST_PAGE]);
    setView(nextView);
  }

  function search(event) {
    event.preventDefault();
    const value = appId.trim();
    if (value && !VALID_APP_ID.test(value)) {
      notify("Informe um AppID válido.");
      return;
    }
    setFilter(value);
    setPages([FIRST_PAGE]);
  }

  async function enqueue(value) {
    const id = value.trim();
    if (!VALID_APP_ID.test(id)) {
      notify("Informe um AppID válido.");
      return;
    }
    setBusy(true);
    try {
      const result = await request.current(ROOT + "/" + id, { method: "POST", mutate: true });
      const messages = {
        queued: "Imagem adicionada à fila.", pending: "Essa imagem já está na fila.",
        stored: "Essa imagem já está no acervo.", disabled: "A fila está indisponível neste ambiente.",
      };
      notify(messages[result.status] || "Não foi possível enviar a imagem.");
      if (result.status !== "disabled") {
        setAppId(id);
        setFilter(id);
        selectView(result.status === "stored" ? "assets" : "queue");
        setRevision(value => value + 1);
      }
    } catch (cause) {
      notify(cause.message || "Não foi possível enviar a imagem.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="page">
    <div className="page__header page__header--split">
      <div><h1>Imagens dos jogos</h1><p className="field-grid__note">Acompanhe os downloads e consulte o acervo usado pelo site e pelo Launcher.</p></div>
      <button className="button button--ghost" disabled={loading} onClick={refresh}>{loading ? "Atualizando…" : "Atualizar"}</button>
    </div>
    {data && !data.enabled && <div className="notice notice--warning">A fila de imagens está indisponível neste ambiente.</div>}
    {error && <div className="notice notice--warning" role="alert">{error}</div>}
    <div className="stats-grid catalog-queue__summary">
      <article className="stat-card"><p>Mensagens na fila</p><strong>{metrics?.backlog ?? "—"}</strong>{metrics?.oldestAt && <span>Mais antiga {formatDateTimeBrt(metrics.oldestAt)}</span>}</article>
    </div>
    <section className="panel panel--audit" aria-labelledby="game-images-processing">
      <div className="section-heading">
        <h2 id="game-images-processing">Em processamento</h2>
        <span className="badge badge--muted">{activity?.rows.length ?? "—"}</span>
      </div>
      {activityError && <p className="field-grid__note" role="status">Falha ao atualizar os downloads em andamento.</p>}
      {activity?.rows.length ? <div className="table-shell catalog-queue__table-wrap">
        <table className="catalog-queue__table">
          <thead><tr><th>Jogo</th><th>Estado</th><th>Solicitado por</th><th>Início</th><th>Tentativa</th></tr></thead>
          <tbody>{activity.rows.map(row => <tr key={row.appId}>
            <td><div className="catalog-queue__game"><div>
              {row.name && <strong>{row.name}</strong>}<small>AppID {row.appId}</small>
            </div></div></td>
            <td><span className="badge badge--warning">{STATES.processing}</span></td>
            <td>{TRIGGERS[row.trigger] || "—"}</td>
            <td>{formatDateTimeBrt(row.startedAt)}</td>
            <td>{row.attempts}</td>
          </tr>)}</tbody>
        </table>
      </div> : activity ? <p className="field-grid__note">Nenhuma imagem baixando agora.</p> : !activityError && <p className="field-grid__note">Consultando downloads…</p>}
    </section>
    <section className="panel panel--audit">
      <div className="catalog-queue__tabs" role="group" aria-label="Imagens dos jogos">
        <button type="button" className={"catalog-queue__tab " + (view === "queue" ? "is-active" : "")} aria-pressed={view === "queue"} onClick={() => selectView("queue")}>Fila de imagens</button>
        <button type="button" className={"catalog-queue__tab " + (view === "assets" ? "is-active" : "")} aria-pressed={view === "assets"} onClick={() => selectView("assets")}>Acervo</button>
      </div>
      <form className="section-heading catalog-queue__heading" onSubmit={search}>
        <label className="field-shell"><span>AppID</span><input inputMode="numeric" maxLength={12} value={appId} onChange={event => setAppId(event.target.value)} placeholder="Buscar por AppID" /></label>
        <div className="catalog-queue__top-actions">
          <button className="button button--ghost" type="submit">Buscar</button>
          {filter && <button className="button button--ghost" type="button" onClick={() => { setAppId(""); setFilter(""); setPages([FIRST_PAGE]); }}>Limpar</button>}
          <button className="button button--primary" type="button" disabled={!data?.enabled || busy || !VALID_APP_ID.test(appId.trim())} onClick={() => { void enqueue(appId); }}>Enfileirar AppID</button>
        </div>
      </form>
      <div className="table-shell catalog-queue__table-wrap" aria-busy={loading}>
        <table className="catalog-queue__table">
          <thead><tr><th>AppID</th><th>{view === "queue" ? "Estado" : "Imagem"}</th><th>Solicitado por</th><th>Atualizado em</th><th>{view === "queue" ? "Tentativas" : "Tamanho"}</th><th>Ação</th></tr></thead>
          <tbody>
            {rows.map(row => <tr key={row.appId}>
              <td>{row.appId}</td>
              <td>{view === "queue" ? <><span className={"badge badge--" + (BADGES[row.status] || "muted")}>{STATES[row.status] || row.status}</span>{row.error && <p className="field-grid__note">{ERRORS[row.error] || row.error}</p>}</> :
                <a href={"/api/public/game-images/" + row.appId} target="_blank" rel="noreferrer"><img src={"/api/public/game-images/" + row.appId} width="82" height="38" alt={"Imagem de " + row.appId} loading="lazy" style={{ objectFit: "contain" }} /></a>}</td>
              <td>{TRIGGERS[row.trigger] || "—"}</td>
              <td>{formatDateTimeBrt(row.updatedAt)}</td>
              <td>{view === "queue" ? row.attempts : Math.round(row.size / 1024) + " KB"}</td>
              <td>{view === "queue" && REQUEUEABLE.has(row.status) ? <button className="button button--ghost button--sm" disabled={busy || !data.enabled} onClick={() => { void enqueue(row.appId); }}>Tentar novamente</button> :
                row.status === "stored" ? <a href={"/api/public/game-images/" + row.appId} target="_blank" rel="noreferrer">Abrir imagem</a> : "—"}</td>
            </tr>)}
            {!rows.length && <tr><td colSpan={6}>{loading ? "Carregando…" : "Nenhuma imagem nesta consulta."}</td></tr>}
          </tbody>
        </table>
      </div>
      {(rows.length > 0 || pages.length > 1 || currentPage?.nextCursor) && <div className="table-footer">
        <span aria-live="polite">{rows.length ? "Mostrando " + (offset + 1) + " a " + (offset + rows.length) +
          (currentPage.nextCursor ? "" : " de " + (offset + rows.length)) : "Nenhum registro nesta página"}</span>
        <nav className="pager" aria-label="Paginação de imagens">
          <button type="button" className="icon-button" aria-label="Página anterior" disabled={loading || pages.length === 1}
            onClick={() => setPages(value => value.slice(0, -1))}>{"<"}</button>
          <span className="pager__current" aria-current="page" aria-label={"Página " + pages.length}>{pages.length}</span>
          <button type="button" className="icon-button" aria-label="Próxima página" disabled={loading || !currentPage?.nextCursor}
            onClick={() => setPages(value => [...value, { cursor: currentPage.nextCursor, offset: offset + rows.length }])}>{">"}</button>
        </nav>
      </div>}
    </section>
  </section>;
}
