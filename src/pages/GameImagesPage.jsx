import React, { useEffect, useRef, useState } from "react";
import { formatDateTimeBrt } from "../lib/admin-ui";

const ROOT = "/panel-api/game-images";
const VIEWS = [
  ["queued", "Na fila"],
  ["processing", "Em processamento"],
  ["completed", "Concluídos"],
];
const STATES = { queued: "Na fila", processing: "Baixando", stored: "Salva no acervo", missing: "Sem imagem", failed: "Falhou" };
const TRIGGERS = { catalog: "Site do Merlin", launcher: "Launcher", activation: "Adicionar jogo", admin: "Admin", import: "Importação em lote" };
const ERRORS = { dispatch_failed: "Falha ao enviar à fila", download_failed: "Origem momentaneamente indisponível", job_expired: "A tarefa expirou" };
const VALID_APP_ID = /^[1-9]\d{0,11}$/;
const BADGES = { processing: "warning", stored: "success", failed: "danger" };
const POLL_MS = 3000;
const QUEUE_POLL_MS = 10000;
const PAGE_SIZE = 20;
const EMPTY = {
  queued: "Nenhuma imagem aguardando na fila.",
  processing: "Nenhuma imagem baixando agora.",
  completed: "Nenhuma imagem salva nesta consulta.",
  failed: "Nenhuma falha nesta consulta.",
};

function pageSequence(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const nearby = [...new Set([1, current - 1, current, current + 1, total])]
    .filter(page => page >= 1 && page <= total).sort((a, b) => a - b);
  return nearby.flatMap((page, index) =>
    index > 0 && page - nearby[index - 1] > 1 ? ["gap-" + page, page] : [page]);
}

function ImagePagination({ page, limit, total, onPageChange }) {
  if (total <= limit) return null;
  const pages = Math.ceil(total / limit);
  return <div className="table-footer game-images__footer">
    <span>Mostrando {(page - 1) * limit + 1} a {Math.min(page * limit, total)} de {total.toLocaleString("pt-BR")}</span>
    <nav className="pager game-images__pager" aria-label="Paginação de imagens">
      <button type="button" className="button button--ghost button--sm" disabled={page === 1} onClick={() => onPageChange(page - 1)}>Anterior</button>
      {pageSequence(page, pages).map(entry => typeof entry === "number"
        ? <button type="button" key={entry} aria-label={"Página " + entry} aria-current={entry === page ? "page" : undefined}
            className={"button button--sm game-images__page " + (entry === page ? "button--primary" : "button--ghost")}
            onClick={() => onPageChange(entry)}>{entry}</button>
        : <span key={entry} aria-hidden="true">…</span>)}
      <button type="button" className="button button--ghost button--sm" disabled={page === pages} onClick={() => onPageChange(page + 1)}>Próxima</button>
    </nav>
  </div>;
}

export default function GameImagesPage({ apiRequest, notify }) {
  const request = useRef(apiRequest);
  request.current = apiRequest;
  const [view, setView] = useState("queued");
  const [outcome, setOutcome] = useState("completed");
  const [page, setPage] = useState(1);
  const [appId, setAppId] = useState("");
  const [filter, setFilter] = useState("");
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState(null);
  const [activity, setActivity] = useState(null);
  const [activityError, setActivityError] = useState(false);
  const [activityRevision, setActivityRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedFailures, setSelectedFailures] = useState([]);
  const dashboardView = view === "completed" ? outcome : view;
  const current = data?.view === dashboardView && data.requestedPage === page && data.filter === filter ? data : null;
  const activeRows = activity?.rows.filter(row => !filter || row.appId === filter) || [];
  const activePage = Math.min(page, Math.max(1, Math.ceil(activeRows.length / PAGE_SIZE)));
  const visible = view === "processing" ? {
    rows: activeRows.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE),
    total: activeRows.length, page: activePage, limit: PAGE_SIZE,
  } : current;
  const bulkImport = activity?.bulkImport;

  useEffect(() => {
    if (dashboardView === "processing") return;
    const controller = new AbortController();
    let timer;
    let shouldPoll = dashboardView === "queued";
    const params = new URLSearchParams({ view: dashboardView, page: String(page) });
    if (filter) params.set("appId", filter);
    async function loadDashboard() {
      try {
        const result = await request.current(ROOT + "/dashboard?" + params, { signal: controller.signal });
        if (controller.signal.aborted) return;
        shouldPoll = dashboardView === "queued" || result.preparing === true;
        setData({ ...result, view: dashboardView, requestedPage: page, filter });
        setError("");
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause.message || "Não foi possível consultar as imagens.");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          if (shouldPoll) timer = setTimeout(poll, QUEUE_POLL_MS);
        }
      }
    }
    function poll() {
      if (document.hidden) timer = setTimeout(poll, QUEUE_POLL_MS);
      else void loadDashboard();
    }
    setLoading(true);
    setError("");
    void loadDashboard();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [dashboardView, page, filter, revision]);

  useEffect(() => {
    const controller = new AbortController();
    let timer;
    async function loadActivity() {
      try {
        const result = await request.current(ROOT + "/processing", { signal: controller.signal });
        if (controller.signal.aborted) return;
        setActivity(result);
        setActivityError(false);
      } catch {
        if (!controller.signal.aborted) setActivityError(true);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, POLL_MS);
      }
    }
    function poll() {
      if (document.hidden) timer = setTimeout(poll, POLL_MS);
      else void loadActivity();
    }
    void loadActivity();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [activityRevision]);

  function refresh() {
    setRevision(value => value + 1);
    setActivityRevision(value => value + 1);
  }

  function selectView(next) {
    setPage(1);
    setView(next);
    setError("");
  }

  function search(event) {
    event.preventDefault();
    const value = appId.trim();
    if (value && !VALID_APP_ID.test(value)) {
      notify("Informe um AppID válido.");
      return;
    }
    setFilter(value);
    setPage(1);
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
        if (result.status === "stored") setOutcome("completed");
        selectView(result.status === "stored" ? "completed" : "queued");
        refresh();
      }
    } catch (cause) {
      notify(cause.message || "Não foi possível enviar a imagem.");
    } finally {
      setBusy(false);
    }
  }

  const initialLoading = view === "processing" ? !activity && !activityError : loading && !current;
  const rows = visible?.rows || [];
  const selectableFailures = view === "completed" && outcome === "failed"
    ? rows.filter(row => row.status === "failed" || row.status === "missing")
    : [];
  const allFailuresSelected = selectableFailures.length > 0
    && selectableFailures.every(row => selectedFailures.includes(row.appId));

  useEffect(() => setSelectedFailures([]), [dashboardView, page, filter, revision]);

  function togglePageFailures() {
    const pageIds = selectableFailures.map(row => row.appId);
    setSelectedFailures(allFailuresSelected
      ? selectedFailures.filter(id => !pageIds.includes(id))
      : [...new Set([...selectedFailures, ...pageIds])]);
  }

  async function retrySelectedFailures() {
    const ids = [...selectedFailures];
    if (!ids.length || busy) return;
    setBusy(true);
    let next = 0;
    let retried = 0;
    const retriedIds = new Set();
    const workers = Array.from({ length: Math.min(4, ids.length) }, async () => {
      while (next < ids.length) {
        const id = ids[next++];
        try {
          const result = await request.current(ROOT + "/" + id, { method: "POST", mutate: true });
          if (["queued", "pending", "stored"].includes(result.status)) {
            retried++;
            retriedIds.add(id);
          }
        } catch { }
      }
    });
    await Promise.all(workers);
    setData(previous => previous?.view === "failed" && previous.requestedPage === page && previous.filter === filter
      ? { ...previous, total: Math.max(0, previous.total - retriedIds.size), rows: previous.rows.filter(row => !retriedIds.has(row.appId)) }
      : previous);
    setSelectedFailures(ids.filter(id => !retriedIds.has(id)));
    setBusy(false);
    setActivityRevision(value => value + 1);
    notify(retried
      ? `${retried} ${retried === 1 ? "jogo reenviado" : "jogos reenviados"} para a fila.`
      : "Não foi possível reenviar os jogos selecionados.");
  }

  return <section className="page">
    <div className="page__header page__header--split">
      <div><h1>Imagens dos jogos</h1></div>
      <button className="button button--ghost" onClick={refresh}>Atualizar</button>
    </div>
    {activity && !activity.enabled && <div className="notice notice--warning">A fila de imagens está indisponível neste ambiente.</div>}
    {bulkImport && <section className="panel" aria-label="Importação em lote">
      <div className="section-heading">
        <div>
          <h2>Importação em lote</h2>
          <p className="field-grid__note">{bulkImport.processed.toLocaleString("pt-BR")} de {bulkImport.total.toLocaleString("pt-BR")} AppIDs encaminhados ou já presentes</p>
        </div>
        <span className={"badge badge--" + (bulkImport.status === "completed" ? "success" : "warning")}>{bulkImport.status === "completed" ? "Envio concluído" : "Encaminhando à fila"}</span>
      </div>
      <progress aria-label="AppIDs verificados na importação" value={bulkImport.processed} max={bulkImport.total} style={{ width: "100%" }} />
    </section>}
    <section className="panel panel--audit">
      <div className="catalog-queue__tabs" role="group" aria-label="Status das imagens">
        {VIEWS.map(([key, label]) => <button type="button" key={key} aria-pressed={view === key}
          className={"catalog-queue__tab " + (view === key ? "is-active" : "")}
          onClick={() => selectView(key)}>{label}</button>)}
      </div>
      <form className="section-heading catalog-queue__heading game-images__filters" onSubmit={search}>
        <label className="field-shell"><span>AppID</span><input inputMode="numeric" maxLength={12} value={appId} onChange={event => setAppId(event.target.value)} placeholder="Buscar por AppID" /></label>
        {view === "completed" && <label className="field-shell"><span>Resultado</span><select value={outcome} onChange={event => { setOutcome(event.target.value); setPage(1); }}>
          <option value="completed">Imagens salvas</option>
          <option value="failed">Falhas e sem imagem</option>
        </select></label>}
        <div className="catalog-queue__top-actions">
          <button className="button button--ghost" type="submit">Buscar</button>
          {filter && <button className="button button--ghost" type="button" onClick={() => { setAppId(""); setFilter(""); setPage(1); }}>Limpar</button>}
          <button className="button button--primary" type="button" disabled={!activity?.enabled || busy || !VALID_APP_ID.test(appId.trim())} onClick={() => { void enqueue(appId); }}>Enfileirar AppID</button>
        </div>
      </form>
      {view === "completed" && outcome === "failed" && <div className="section-heading game-images__bulk-actions">
        <label><input type="checkbox" checked={allFailuresSelected} onChange={togglePageFailures} /> Selecionar falhas desta página</label>
        <button className="button button--primary" type="button" disabled={!selectedFailures.length || busy || !activity?.enabled}
          onClick={() => { void retrySelectedFailures(); }}>
          {busy ? "Reenviando…" : `Tentar novamente${selectedFailures.length ? ` (${selectedFailures.length})` : ""}`}
        </button>
      </div>}
      {view === "completed" && current?.updatedAt && <p className="field-grid__note">Histórico atualizado em {formatDateTimeBrt(current.updatedAt)}</p>}
      {view === "processing" && activityError && <p className="field-grid__note" role="status">Falha ao atualizar os downloads em andamento.</p>}
      {view !== "processing" && error && <div className="notice notice--warning" role="alert">{error}</div>}
      <div className="table-shell catalog-queue__table-wrap" aria-busy={initialLoading}>
        <table className="catalog-queue__table">
          <thead><tr>{selectableFailures.length > 0 && <th><input type="checkbox" aria-label="Selecionar falhas desta página" checked={allFailuresSelected} onChange={togglePageFailures} /></th>}<th>{view === "processing" ? "Jogo" : "AppID"}</th><th>Estado</th><th>Solicitado por</th><th>{view === "processing" ? "Início" : "Atualizado em"}</th><th>{dashboardView === "completed" ? "Tamanho" : "Tentativas"}</th>{view === "completed" && <th>Ação</th>}</tr></thead>
          <tbody>
            {rows.map(row => {
              const status = view === "processing" ? "processing" : row.status;
              const image = "/api/public/game-images/" + row.appId;
              return <tr key={row.appId}>
                {selectableFailures.length > 0 && <td><input type="checkbox" aria-label={`Selecionar AppID ${row.appId}`} checked={selectedFailures.includes(row.appId)} onChange={() => setSelectedFailures(previous => previous.includes(row.appId) ? previous.filter(id => id !== row.appId) : [...previous, row.appId])} /></td>}
                <td>{row.name ? <><strong>{row.name}</strong><br /><small>AppID {row.appId}</small></> : row.appId}</td>
                <td><span className={"badge badge--" + (BADGES[status] || "muted")}>{STATES[status] || status}</span>{row.error && <p className="field-grid__note">{ERRORS[row.error] || row.error}</p>}</td>
                <td>{TRIGGERS[row.trigger] || "—"}</td>
                <td>{formatDateTimeBrt(row.startedAt || row.updatedAt)}</td>
                <td>{status === "stored" ? Math.round(row.size / 1024) + " KB" : row.attempts}</td>
                {view === "completed" && <td>{status === "stored"
                  ? <a href={image} target="_blank" rel="noreferrer"><img src={image} width="82" height="38" alt={"Imagem de " + row.appId} loading="lazy" style={{ objectFit: "contain" }} /></a>
                  : <button className="button button--ghost button--sm" disabled={busy || !activity?.enabled} onClick={() => { void enqueue(row.appId); }}>Tentar novamente</button>}</td>}
              </tr>;
            })}
            {!rows.length && <tr><td colSpan={(view === "completed" ? 6 : 5) + (selectableFailures.length > 0 ? 1 : 0)}>{current?.preparing
              ? <span role="status">Preparando o histórico de imagens…</span>
              : initialLoading ? "Carregando…" : EMPTY[dashboardView]}</td></tr>}
          </tbody>
        </table>
      </div>
      {visible && <ImagePagination page={visible.page} limit={visible.limit} total={visible.total} onPageChange={setPage} />}
    </section>
  </section>;
}
