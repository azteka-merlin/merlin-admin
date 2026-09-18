import React from "react";
import { formatDateTime } from "../lib/admin-ui";

const tabs = [
  { key: "missing", label: "Sem data", countKey: "withoutReleaseDate", description: "Todos os jogos que ainda não possuem data de lançamento." },
  { key: "processing", label: "Processando", countKey: "processing", description: "Consultas que o cron está executando neste momento." },
  { key: "pending", label: "Aguardando", countKey: "pending", description: "Jogos preparados para a próxima rodada da fila." },
  { key: "retry", label: "Em retry", countKey: "retry", description: "A Steam não retornou uma confirmação; serão tentados novamente." },
  { key: "paused", label: "Pausados", countKey: "paused", description: "Jogos pausados manualmente e fora do processamento automático." },
  { key: "failed", label: "Falhou", countKey: "failed", description: "Após 10 tentativas sem resultado, o jogo aguarda uma decisão sua." },
];

function statusLabel(status) {
  return ({ processing: "Processando", pending: "Aguardando", retry: "Em retry", paused: "Pausado", failed: "Falhou", completed: "Concluído" })[status] || status;
}

function confirmAction(action, count) {
  const label = action === "delete" ? "excluir" : action === "reprocess" ? "reprocessar" : action === "pause" ? "pausar" : "retomar";
  return window.confirm(`${label[0].toUpperCase()}${label.slice(1)} ${count === 1 ? "este jogo" : `${count} jogos`}?`);
}

export default function CatalogQueuePage({ summary, queue, loading, actionBusy, onLoad, onTogglePause, onJobAction, onBulkAction }) {
  const [tab, setTab] = React.useState("missing");
  const [selected, setSelected] = React.useState(() => new Set());
  const activeTab = tabs.find((item) => item.key === tab) || tabs[0];
  const totalPages = Math.max(1, Math.ceil((queue.total || 0) / (queue.limit || 50)));
  const selectedIds = [...selected];
  const selectableIds = (queue.items || []).map((game) => game.appId);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const isFailedTab = tab === "failed";
  const isPausedTab = tab === "paused";

  React.useEffect(() => setSelected(new Set()), [queue.status, queue.page]);

  function changeTab(nextTab) {
    setTab(nextTab);
    setSelected(new Set());
    onLoad(nextTab, 1, queue.limit || 50);
  }

  function changeLimit(event) {
    onLoad(tab, 1, Number(event.target.value));
  }

  function toggleSelected(appId) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(appId)) next.delete(appId); else next.add(appId);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectableIds));
  }

  async function runOne(appId, action) {
    if (!confirmAction(action, 1)) return;
    await onJobAction(appId, action, tab, queue.page || 1, queue.limit || 50);
  }

  async function runBulk(action) {
    if (!selectedIds.length || !confirmAction(action, selectedIds.length)) return;
    await onBulkAction(selectedIds, action, tab, queue.page || 1, queue.limit || 50);
    setSelected(new Set());
  }

  return (
    <section className="page">
      <div className="page__header page__header--split">
        <div>
          <p className="eyebrow">Catálogo público</p>
          <h1>Fila de datas de lançamento</h1>
          <p className="page__meta">A Steam oficial valida DRM, categoria e a data de lançamento.</p>
        </div>
        <div className="catalog-queue__top-actions">
          <button className={`button ${summary.queuePaused ? "button--primary" : "button--danger"}`} onClick={() => onTogglePause(!summary.queuePaused)} disabled={loading || actionBusy}>
            {summary.queuePaused ? "Retomar fila" : "Pausar fila"}
          </button>
          <button className="button button--ghost" onClick={() => onLoad(tab, queue.page || 1, queue.limit || 50)} disabled={loading || actionBusy}>
            {loading ? "Atualizando..." : "Atualizar dados"}
          </button>
        </div>
      </div>

      {summary.queuePaused && <div className="notice notice--warning">A fila automática está pausada. Os jobs permanecem guardados até você retomá-la.</div>}

      <div className="stats-grid catalog-queue__summary">
        <article className="stat-card"><p>Com data</p><strong>{summary.withReleaseDate || 0}</strong><span>de {summary.totalGames || 0} jogos</span></article>
        <article className="stat-card"><p>Sem data</p><strong>{summary.withoutReleaseDate || 0}</strong><span>na fila de enriquecimento</span></article>
        <article className="stat-card"><p>Processando</p><strong>{summary.processing || 0}</strong><span>consultas em andamento</span></article>
        <article className="stat-card"><p>Falhou</p><strong>{summary.failed || 0}</strong><span>após 10 tentativas</span></article>
      </div>

      <section className="panel panel--audit catalog-queue">
        <div className="catalog-queue__tabs" role="tablist" aria-label="Estados da fila">
          {tabs.map((item) => <button key={item.key} role="tab" aria-selected={tab === item.key} className={`catalog-queue__tab ${tab === item.key ? "is-active" : ""}`} onClick={() => changeTab(item.key)}>
            <span>{item.label}</span><strong>{summary[item.countKey] || 0}</strong>
          </button>)}
        </div>

        <div className="section-heading catalog-queue__heading">
          <div><h2>{activeTab.label}</h2><p className="field-grid__note">{activeTab.description}</p></div>
          <div className="catalog-queue__page-size"><span className="badge badge--muted">{queue.total || 0} itens</span><label>Por página <select value={queue.limit || 50} onChange={changeLimit} disabled={loading || actionBusy}><option value="10">10</option><option value="50">50</option><option value="100">100</option><option value="500">500</option></select></label></div>
        </div>

        {selectedIds.length > 0 && <div className="catalog-queue__bulk-actions">
          <strong>{selectedIds.length} selecionado{selectedIds.length > 1 ? "s" : ""}</strong>
          {isFailedTab ? <button className="button button--ghost button--sm" onClick={() => runBulk("reprocess")} disabled={loading || actionBusy}>Reprocessar selecionados</button> : isPausedTab ? <button className="button button--primary button--sm" onClick={() => runBulk("resume")} disabled={loading || actionBusy}>Retomar selecionados</button> : <button className="button button--ghost button--sm" onClick={() => runBulk("pause")} disabled={loading || actionBusy}>Pausar selecionados</button>}
          <button className="button button--danger button--sm" onClick={() => runBulk("delete")} disabled={loading || actionBusy}>Excluir selecionados</button>
        </div>}

        {loading ? <div className="empty-state"><h3>Atualizando fila</h3><p>Buscando o estado mais recente.</p></div> : !queue.items?.length ? <div className="empty-state"><h3>Nenhum jogo nesta aba</h3><p>A fila está limpa para este estado.</p></div> : <>
          <div className="table-shell catalog-queue__table-wrap">
            <table className="catalog-queue__table">
              <thead><tr><th><input type="checkbox" aria-label="Selecionar todos os jogos desta página" checked={allSelected} onChange={toggleAll} /></th><th>Jogo</th><th>Status</th><th>Tentativas</th><th>Próxima tentativa</th><th>Última atividade</th><th>Ações</th></tr></thead>
              <tbody>{queue.items.map((game) => <tr key={game.appId}>
                <td><input type="checkbox" aria-label={`Selecionar ${game.name}`} checked={selected.has(game.appId)} onChange={() => toggleSelected(game.appId)} /></td>
                <td><div className="catalog-queue__game"><div><strong>{game.name}</strong><small>App ID {game.appId} · {game.category}</small></div></div></td>
                <td><span className={`badge badge--${game.status === "retry" || game.status === "failed" ? "warning" : game.status === "processing" ? "success" : "muted"}`}>{statusLabel(game.status)}</span></td>
                <td>{game.attempts || 0}/10</td>
                <td>{game.status === "processing" ? (game.lockedUntil ? `até ${formatDateTime(game.lockedUntil)}` : "Agora") : formatDateTime(game.nextAttemptAt)}</td>
                <td>{formatDateTime(game.updatedAt)}</td>
                <td><div className="catalog-queue__row-actions">
                  {game.status === "failed" ? <button className="button button--ghost button--sm" onClick={() => runOne(game.appId, "reprocess")} disabled={loading || actionBusy}>Reprocessar</button> : game.status === "paused" ? <button className="button button--ghost button--sm" onClick={() => runOne(game.appId, "resume")} disabled={loading || actionBusy}>Retomar</button> : game.status !== "completed" && <button className="button button--ghost button--sm" onClick={() => runOne(game.appId, "pause")} disabled={loading || actionBusy}>Pausar</button>}
                  <button className="button button--danger button--sm" onClick={() => runOne(game.appId, "delete")} disabled={loading || actionBusy}>Excluir</button>
                </div></td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="table-footer">
            <span className="field-grid__note">Página {queue.page || 1} de {totalPages}</span>
            <div className="pager"><button className="button button--ghost button--sm" disabled={loading || actionBusy || (queue.page || 1) <= 1} onClick={() => onLoad(tab, (queue.page || 1) - 1, queue.limit || 50)}>Anterior</button><button className="button button--ghost button--sm" disabled={loading || actionBusy || (queue.page || 1) >= totalPages} onClick={() => onLoad(tab, (queue.page || 1) + 1, queue.limit || 50)}>Próxima</button></div>
          </div>
        </>}
      </section>
    </section>
  );
}
