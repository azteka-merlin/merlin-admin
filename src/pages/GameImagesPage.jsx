import React, { useEffect, useRef, useState } from "react";
import { formatDateTimeBrt } from "../lib/admin-ui";

const ROOT = "/panel-api/game-images";
const STATES = { queued: "Na fila", processing: "Baixando", stored: "Salva no R2", missing: "Sem imagem", failed: "Falhou" };
const TRIGGERS = { catalog: "Site do Merlin", launcher: "Launcher", activation: "Adicionar jogo", admin: "Admin" };
const ERRORS = { dispatch_failed: "Falha ao enviar à fila", download_failed: "Origem momentaneamente indisponível", job_expired: "A tarefa expirou" };
const REQUEUEABLE = new Set(["failed", "missing"]);
const VALID_APP_ID = /^[1-9]\d{0,11}$/;

export default function GameImagesPage({ apiRequest, notify }) {
  const request = useRef(apiRequest);
  request.current = apiRequest;
  const [view, setView] = useState("queue");
  const [appId, setAppId] = useState("");
  const [filter, setFilter] = useState("");
  const [cursors, setCursors] = useState([null]);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const cursor = cursors.at(-1);
  const rows = data?.view === view ? data.rows : [];

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ view });
    if (cursor) params.set("cursor", cursor);
    if (filter) params.set("appId", filter);
    setLoading(true);
    setError("");
    request.current(ROOT + "?" + params, { signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) setData({ ...result, view });
    }).catch((cause) => {
      if (!controller.signal.aborted) setError(cause.message || "Não foi possível consultar as imagens.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [view, cursor, filter, revision]);

  useEffect(() => {
    if (!data?.enabled || loading || error || busy ||
        !(data.backlog > 0 || data.rows.some(row => row.status === "queued" || row.status === "processing"))) return;
    const timer = setTimeout(() => setRevision(value => value + 1), 5000);
    return () => clearTimeout(timer);
  }, [data, loading, error, busy]);

  function selectView(nextView) {
    setCursors([null]);
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
    setCursors([null]);
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
      <button className="button button--ghost" disabled={loading} onClick={() => setRevision(value => value + 1)}>{loading ? "Atualizando…" : "Atualizar"}</button>
    </div>
    {data && !data.enabled && <div className="notice notice--warning">A fila de imagens está indisponível neste ambiente.</div>}
    {error && <div className="notice notice--warning" role="alert">{error}</div>}
    <div className="stats-grid catalog-queue__summary">
      <article className="stat-card"><p>Mensagens na fila</p><strong>{data?.backlog ?? "—"}</strong><span>{data?.oldestAt ? "Mais antiga " + formatDateTimeBrt(data.oldestAt) : "Download em segundo plano"}</span></article>
    </div>
    <section className="panel panel--audit">
      <div className="catalog-queue__tabs" role="group" aria-label="Imagens dos jogos">
        <button type="button" className={"catalog-queue__tab " + (view === "queue" ? "is-active" : "")} aria-pressed={view === "queue"} onClick={() => selectView("queue")}>Fila de imagens</button>
        <button type="button" className={"catalog-queue__tab " + (view === "assets" ? "is-active" : "")} aria-pressed={view === "assets"} onClick={() => selectView("assets")}>Acervo</button>
      </div>
      <form className="section-heading catalog-queue__heading" onSubmit={search}>
        <label className="field-shell"><span>AppID</span><input inputMode="numeric" maxLength={12} value={appId} onChange={event => setAppId(event.target.value)} placeholder="Buscar por AppID" /></label>
        <div className="catalog-queue__top-actions">
          <button className="button button--ghost" type="submit">Buscar</button>
          {filter && <button className="button button--ghost" type="button" onClick={() => { setAppId(""); setFilter(""); setCursors([null]); }}>Limpar</button>}
          <button className="button button--primary" type="button" disabled={!data?.enabled || busy || !VALID_APP_ID.test(appId.trim())} onClick={() => { void enqueue(appId); }}>Enfileirar AppID</button>
        </div>
      </form>
      <div className="table-shell catalog-queue__table-wrap" aria-busy={loading}>
        <table className="catalog-queue__table">
          <thead><tr><th>AppID</th><th>{view === "queue" ? "Estado" : "Imagem"}</th><th>Solicitado por</th><th>Atualizado em</th><th>{view === "queue" ? "Tentativas" : "Tamanho"}</th><th>Ação</th></tr></thead>
          <tbody>
            {rows.map(row => <tr key={row.appId}>
              <td>{row.appId}</td>
              <td>{view === "queue" ? <><span className="badge badge--muted">{STATES[row.status] || row.status}</span>{row.error && <p className="field-grid__note">{ERRORS[row.error] || row.error}</p>}</> :
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
      <div className="catalog-queue__top-actions catalog-queue__heading">
        <button className="button button--ghost" disabled={loading || cursors.length === 1} onClick={() => setCursors(value => value.slice(0, -1))}>Anterior</button>
        <span aria-live="polite">Página {cursors.length}</span>
        <button className="button button--ghost" disabled={loading || data?.view !== view || !data?.nextCursor} onClick={() => setCursors(value => [...value, data.nextCursor])}>Próxima</button>
      </div>
    </section>
  </section>;
}
