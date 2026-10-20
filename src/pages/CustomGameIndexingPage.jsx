import React, { useCallback, useEffect, useRef, useState } from "react";
import { formatDateTimeBrt } from "../lib/admin-ui";

const ROOT = "/panel-api/custom-games/indexing";
const ACTIVE_STATUSES = new Set(["queued", "processing"]);
const STATUS_LABELS = {
  ready: "Pronto", missing: "Sem índice", queued: "Na fila", processing: "Indexando",
  completed: "Concluído", failed: "Falhou", cancelled: "Cancelado",
};
const PHASE_LABELS = { queued: "Aguardando o serviço de indexação", downloading: "Baixando pacote para indexação",
  indexing: "Calculando hashes dos arquivos", publishing: "Salvando índice", completed: "Índice concluído",
  failed: "Falha na indexação", cancelled: "Indexação cancelada" };

function sizeLabel(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GiB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MiB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${value} B`;
}

function StatusBadge({ status }) {
  const color = status === "ready" || status === "completed" ? "success"
    : status === "failed" ? "danger" : status === "processing" ? "warning" : "muted";
  return <span className={`badge badge--${color}`}>{STATUS_LABELS[status] || status}</span>;
}

function JobProgress({ job }) {
  const total = Math.max(0, Number(job.totalBytes) || 0);
  const done = Math.max(0, Number(job.processedBytes) || 0);
  const totalFiles = Math.max(0, Number(job.totalFiles) || 0);
  const processedFiles = Math.max(0, Number(job.processedFiles) || 0);
  const complete = job.status === "completed";
  const processing = job.status === "processing";
  const percent = total > 0 ? Math.min(100, Math.floor(done / total * 100)) : complete ? 100 : null;
  return <div className="custom-game-indexing__progress">
    {(processing || complete || done > 0) && <progress aria-label={`Progresso de ${job.gameName || "indexação"}`}
      max="100" {...(percent !== null ? { value: complete ? 100 : percent } : {})} />}
    <span>{PHASE_LABELS[job.phase] || STATUS_LABELS[job.status]}</span>
    {(total > 0 || totalFiles > 0) && <small>
      {total > 0 ? `${sizeLabel(done)} / ${sizeLabel(total)}${percent !== null ? ` · ${percent}%` : ""}` : ""}
      {total > 0 && totalFiles > 0 ? " · " : ""}
      {totalFiles > 0 ? `${processedFiles.toLocaleString("pt-BR")} / ${totalFiles.toLocaleString("pt-BR")} arquivos` : ""}
    </small>}
    {job.error && <p className="custom-game-indexing__error">{job.error}</p>}
  </div>;
}

export default function CustomGameIndexingPage({ apiRequest, notify }) {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [jobFilter, setJobFilter] = useState("all");
  const requestRef = useRef(apiRequest);
  const controllerRef = useRef(null);
  const mounted = useRef(false);
  requestRef.current = apiRequest;

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    try {
      const result = await requestRef.current(ROOT, { signal: controller.signal });
      if (!mounted.current || controller.signal.aborted) return;
      setSnapshot(result || { summary: {}, games: [], jobs: [] });
      setError("");
    } catch (cause) {
      if (!mounted.current || controller.signal.aborted) return;
      setError(cause.message || "Não foi possível consultar a fila de indexação.");
    } finally {
      if (mounted.current && !controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; controllerRef.current?.abort(); };
  }, [load]);

  const activeCount = (snapshot?.jobs || []).filter(job => ACTIVE_STATUSES.has(job.status)).length;
  const heartbeatTime = Date.parse(snapshot?.workerLastSeenAt || "");
  const workerAvailable = Boolean(snapshot?.workerConfigured && (snapshot?.executionMode === "cloudflare-queues"
    || (Number.isFinite(heartbeatTime) && Date.now() - heartbeatTime < 5 * 60 * 1000)));
  useEffect(() => {
    if (!snapshot || !activeCount || !workerAvailable || error || busyAction || loading) return;
    const timer = setTimeout(() => { void load(); }, 5000);
    return () => clearTimeout(timer);
  }, [snapshot, activeCount, workerAvailable, error, busyAction, loading, load]);

  async function enqueue(mode, gameId) {
    setBusyAction(gameId || mode);
    try {
      const result = await requestRef.current(ROOT, {
        method: "POST", mutate: true, body: { mode, ...(gameId ? { gameId } : {}) },
      });
      const count = Number(result.queued) || 0;
      notify(count ? `${count} ${count === 1 ? "jogo adicionado" : "jogos adicionados"} à fila de indexação.`
        : "Os jogos selecionados já têm índice ou estão na fila.");
      if (mounted.current) await load();
    } catch (cause) { notify(cause.message || "Não foi possível adicionar os jogos à fila."); }
    finally { if (mounted.current) setBusyAction(""); }
  }

  async function jobAction(job, action) {
    setBusyAction(job.id);
    try {
      await requestRef.current(`${ROOT}/${encodeURIComponent(job.id)}/${action}`, { method: "POST", mutate: true });
      notify(action === "retry" ? "Jogo devolvido à fila de indexação." : "Cancelamento solicitado.");
      if (mounted.current) await load();
    } catch (cause) { notify(cause.message || "Não foi possível atualizar esta tarefa."); }
    finally { if (mounted.current) setBusyAction(""); }
  }

  const summary = snapshot?.summary || {};
  const games = snapshot?.games || [];
  const jobs = snapshot?.jobs || [];
  const readyCount = games.filter(game => game.indexStatus === "ready").length;
  const searchValue = search.trim().toLocaleLowerCase("pt-BR");
  const shownGames = games.filter(game => String(game.name || "").toLocaleLowerCase("pt-BR").includes(searchValue));
  const shownJobs = jobs.filter(job => (jobFilter === "all" || (jobFilter === "active" ? ACTIVE_STATUSES.has(job.status) : job.status === jobFilter))
    && String(job.gameName || "").toLocaleLowerCase("pt-BR").includes(searchValue));
  const actionsDisabled = Boolean(busyAction) || !snapshot || Boolean(error);

  return <section className="page page--custom-game-indexing">
    <div className="page__header page__header--split">
      <div><p className="eyebrow">Baixe e Jogue</p><h1>Integridade e indexação</h1><p>Hashes de cada arquivo instalado, incluindo os arquivos dentro dos ZIPs.</p></div>
      <div className="page__actions">
        <button className="button button--ghost" onClick={() => { void load(); }} disabled={loading || Boolean(busyAction)}>{loading ? "Consultando…" : "Atualizar dados"}</button>
        <button className="button button--primary" onClick={() => { void enqueue("missing"); }} disabled={actionsDisabled || !(summary.missing || summary.failed)}>Indexar pendentes</button>
      </div>
    </div>
    <div className="custom-game-indexing__intro panel">
      <div><h2>Preparar a verificação de integridade</h2><p>Jogos enviados por pasta reaproveitam os hashes existentes. Os ZIPs são lidos e descompactados pelo serviço de indexação para gerar a lista de arquivos e seus hashes. O jogo fica disponível durante o processamento.</p></div>
      <button className="button button--ghost button--sm" onClick={() => { void enqueue("all"); }} disabled={actionsDisabled || !games.length}>Reindexar catálogo</button>
    </div>
    {snapshot && !workerAvailable && <div className="notice notice--warning" role="status"><strong>{snapshot.workerConfigured ? "O serviço de indexação não está conectado" : "O serviço de indexação precisa ser configurado"}</strong><p>Os jogos podem ser adicionados à fila. Para processar os ZIPs, inicie o serviço de indexação do servidor e clique em Atualizar dados. Esta página acompanha o trabalho do serviço.</p>{snapshot.workerLastSeenAt && <small>Última conexão: {formatDateTimeBrt(snapshot.workerLastSeenAt)}</small>}</div>}
    {error && <div className="custom-games-admin-error custom-game-indexing__load-error" role="alert"><div><strong>Não foi possível atualizar a fila</strong><p>{error}</p><small>A consulta automática foi interrompida. Tente novamente para acompanhar o estado atual.</small></div><button className="button button--ghost button--sm" onClick={() => { void load(); }} disabled={loading}>Tentar novamente</button></div>}
    {loading && !snapshot ? <div className="empty-state"><h3>Consultando indexação…</h3></div> : snapshot && <>
      <div className="stats-grid custom-game-indexing__summary">
        <article className="stat-card"><p>Prontos para verificar</p><strong>{readyCount}</strong><span>de {games.length} jogos</span></article>
        <article className="stat-card"><p>Sem índice</p><strong>{summary.missing || 0}</strong><span>aguardando inclusão na fila</span></article>
        <article className="stat-card"><p>Em andamento</p><strong>{(summary.queued || 0) + (summary.processing || 0)}</strong><span>{summary.processing || 0} indexando · {summary.queued || 0} na fila</span></article>
        <article className="stat-card"><p>Falhas</p><strong>{summary.failed || 0}</strong><span>consulte o erro e tente novamente</span></article>
      </div>
      <section className="panel custom-game-indexing__panel">
        <div className="section-heading"><div><h2>Jogos do catálogo</h2><p className="field-grid__note">O índice descreve os arquivos da versão atual de cada jogo.</p></div></div>
        <label className="field"><span>Buscar jogo</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome do jogo" /></label>
        {shownGames.length ? <div className="table-shell custom-game-indexing__table-wrap"><table className="custom-game-indexing__table">
          <thead><tr><th>Jogo</th><th>Integridade</th><th>Arquivos</th><th>Última indexação</th><th>Ação</th></tr></thead>
          <tbody>{shownGames.map(game => <tr key={game.id}>
            <td><strong>{game.name || "Rascunho sem nome"}</strong><small>{game.packageType === "folder" ? "Pasta" : "ZIP"}</small></td>
            <td><StatusBadge status={game.indexStatus} /></td>
            <td>{game.fileCount != null ? Number(game.fileCount).toLocaleString("pt-BR") : "—"}</td>
            <td>{formatDateTimeBrt(game.indexedAt)}</td>
            <td>{ACTIVE_STATUSES.has(game.indexStatus) ? <span className="field-grid__note">Acompanhe na fila abaixo</span>
              : game.packageType === "folder" && game.indexStatus === "ready" ? <span className="field-grid__note">Hashes do envio</span>
                : <button className="button button--ghost button--sm" disabled={actionsDisabled} onClick={() => { void enqueue(game.indexStatus === "ready" ? "all" : "missing", game.id); }}>{busyAction === game.id ? "Adicionando…" : game.indexStatus === "ready" ? "Reindexar" : "Indexar"}</button>}</td>
          </tr>)}</tbody>
        </table></div> : <div className="empty-state"><h3>{games.length ? "Nenhum jogo encontrado" : "Nenhum jogo com pacote cadastrado"}</h3></div>}
      </section>
      <section className="panel custom-game-indexing__panel">
        <div className="section-heading custom-game-indexing__queue-heading"><div><h2>Fila de indexação</h2><p className="field-grid__note">{activeCount && workerAvailable && !error ? "Atualiza a cada 5 segundos enquanto há tarefas na fila." : "As tarefas concluídas e os erros ficam disponíveis para consulta."}</p></div>
          <label className="custom-game-indexing__filter">Exibir <select value={jobFilter} onChange={event => setJobFilter(event.target.value)}><option value="all">Todas</option><option value="active">Na fila e indexando</option><option value="failed">Falhas</option><option value="completed">Concluídas</option><option value="cancelled">Canceladas</option></select></label>
        </div>
        {shownJobs.length ? <div className="custom-game-indexing__jobs">{shownJobs.map(job => <article className="custom-game-indexing__job" key={job.id}>
          <div className="custom-game-indexing__job-heading"><div><h3>{job.gameName || "Rascunho sem nome"}</h3><small>{job.packageType === "folder" ? "Pasta" : "ZIP"} · {formatDateTimeBrt(job.updatedAt)}</small></div><StatusBadge status={job.status} /></div>
          <JobProgress job={job} />
          <div className="custom-game-indexing__job-actions">{ACTIVE_STATUSES.has(job.status)
            ? <button className="button button--danger button--soft button--sm" disabled={actionsDisabled || job.phase === "publishing"} onClick={() => { void jobAction(job, "cancel"); }}>{job.phase === "publishing" ? "Finalizando…" : busyAction === job.id ? "Cancelando…" : "Cancelar"}</button>
            : (job.status === "failed" || job.status === "cancelled") && <button className="button button--ghost button--sm" disabled={actionsDisabled} onClick={() => { void jobAction(job, "retry"); }}>{busyAction === job.id ? "Adicionando…" : "Tentar novamente"}</button>}</div>
        </article>)}</div> : <div className="empty-state"><h3>Nenhuma tarefa nesta seleção</h3><p>Use Indexar pendentes para preparar os jogos sem índice.</p></div>}
      </section>
    </>}
  </section>;
}
