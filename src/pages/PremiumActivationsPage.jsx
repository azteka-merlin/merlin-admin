import React from "react";
import Modal from "../components/Modal";
import { formatDateTimeBrt as formatDateTime, maskKey, maskTechnicalValue } from "../lib/admin-ui";
import { retryDisplay } from "../lib/premium-admin";

function statusLabel(status) {
  return { active: "Ativa", reserved: "Reservada", processing: "Processando", expired: "Encerrada", failed: "Falhou" }[status] || status;
}
function statusTone(status) {
  if (status === "active") return "success";
  if (status === "reserved" || status === "processing") return "warning";
  if (status === "failed") return "danger";
  return "muted";
}

function RetryModal({ activation, busy, onClose, onConfirm }) {
  const review = activation.retry?.status === "review";
  const normalReview = review && activation.status !== "active";
  const [confirmed, setConfirmed] = React.useState(false);
  const dialogRef = React.useRef(null);
  React.useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.querySelector("[data-initial-focus]")?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  function onKeyDown(event) {
    if (event.key === "Escape" && !busy) { event.preventDefault(); onClose(); }
    if (event.key !== "Tab") return;
    const buttons = [...dialogRef.current.querySelectorAll("button:not([disabled]), input:not([disabled]), a[href], [tabindex='0']")];
    if (!buttons.length) return;
    const first = buttons[0]; const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  return <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={review ? "Verificar tentativa" : "Liberar nova tentativa"} onKeyDown={onKeyDown}>
    <Modal title={review ? "Verificar tentativa" : "Liberar nova tentativa"}
      subtitle={`${activation.userName || "Esta pessoa"} · ${activation.gameName || activation.appId}`} onClose={onClose} closeDisabled={busy}
      actions={<><button type="button" className="button button--ghost" data-initial-focus onClick={onClose} disabled={busy}>Cancelar</button>
        <button type="button" className="button button--primary" onClick={() => onConfirm(review)} disabled={busy || review && !confirmed}>{busy ? "Confirmando..." : normalReview ? "Confirmar falha" : "Liberar por 15 minutos"}</button></>}>
      {review && <p className="premium-publish-note">Não foi possível confirmar o resultado anterior. Confira pelo suporte antes de liberar novamente.</p>}
      {normalReview ? <p className="plain-copy">Depois da conferência, o launcher poderá consultar a disponibilidade para uma nova ativação. Como a tentativa anterior não foi concluída, a próxima seguirá os limites e as vagas disponíveis naquele momento.</p> : <>
        <p className="plain-copy">Somente esta pessoa poderá tentar ativar este jogo novamente, com acompanhamento do suporte. A liberação dura 15 minutos e não consome outra ativação mensal do Bronze.</p>
        <p className="plain-copy">A vaga continua reservada para ela. Os avisos de vaga para outras pessoas não serão disparados. Se ela não tentar dentro do prazo, os bloqueios anteriores continuam valendo.</p>
      </>}
      {review && <label className="premium-retry-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />Confirmei pelo suporte que a tentativa anterior não funcionou.</label>}
    </Modal>
  </div>;
}

export default function PremiumActivationsPage({ activations, loading, search, setSearch, statusFilter, setStatusFilter, loadActivations, releaseActivation, retryActivation, busyAction, notify }) {
  const [retryTarget, setRetryTarget] = React.useState(null);
  const [now, setNow] = React.useState(Date.now);
  React.useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const query = search.trim().toLowerCase();
  const filtered = React.useMemo(() => activations.filter((activation) => {
    if (statusFilter !== "all" && activation.status !== statusFilter) return false;
    return !query || [activation.userName, activation.licenseKey, activation.gameName, activation.appId, activation.hwid, activation.failureReason].some((value) => String(value || "").toLowerCase().includes(query));
  }), [activations, query, statusFilter]);
  const retryBusy = !!retryTarget && busyAction === `retry-premium-activation-${retryTarget.id}`;

  async function handleRelease(activation) {
    const player = activation.userName || `licença #${activation.licenseId}`;
    if (!window.confirm(`Liberar o cooldown de ${player} para ${activation.gameName || `o app ${activation.appId}`}? A ativação continuará contabilizada.`)) return;
    try { await releaseActivation(activation.id); notify("Cooldown liberado. A ativação permanece contabilizada."); }
    catch (error) { notify(error.message || "Não foi possível liberar o cooldown."); }
  }
  async function handleRetry(confirmedFailure) {
    try {
      const retry = await retryActivation(retryTarget.id, confirmedFailure);
      setRetryTarget(null);
      notify(retry ? "Nova tentativa liberada apenas para esta pessoa, por 15 minutos." : "Falha confirmada pelo suporte. O launcher já pode consultar a disponibilidade novamente.");
    } catch (error) { notify(error.message || "Não foi possível liberar a nova tentativa."); }
  }
  return <section className="page">
    <div className="page__header page__header--split"><div><p className="eyebrow">Premium</p><h1>Ativações premium</h1><p>Consulte o histórico, libere um cooldown ou acompanhe uma nova tentativa pelo suporte.</p></div>
      <button className="button button--ghost" onClick={loadActivations} disabled={loading}>{loading ? "Atualizando..." : "Atualizar lista"}</button></div>
    <section className="panel panel--audit">
      <div className="filters filters--audit"><label className="field-shell field-shell--search"><span>Buscar</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Usuário, licença, jogo, app ID..." /></label>
        <label className="field-shell"><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Todas as ativações</option><option value="active">Somente ativas</option><option value="reserved">Reservadas</option><option value="processing">Processando</option><option value="failed">Com falha</option><option value="expired">Encerradas</option></select></label></div>
      {loading ? <div className="empty-state"><h3>Carregando ativações</h3><p>Buscando o histórico de ativações premium.</p></div> : !filtered.length ? <div className="empty-state"><h3>Nenhuma ativação encontrada</h3><p>Ajuste a busca ou o filtro para localizar uma ativação.</p></div> : <div className="audit-list">{filtered.map((activation) => {
        const retry = retryDisplay(activation, now);
        const actionBusy = !!busyAction;
        return <article className="audit-card" key={activation.id}>
          <div className="audit-card__head"><div className="user-cell user-cell--audit"><span className={`avatar avatar--tone-${statusTone(activation.status)}`}>{String(activation.userName || "?").slice(0, 1).toUpperCase()}</span><div><strong>{activation.userName || "Usuário sem nome"}</strong><p>{activation.gameName || `App ${activation.appId}`}</p></div></div><span className={`badge badge--${statusTone(activation.status)}`}>{statusLabel(activation.status)}</span></div>
          <div className="audit-card__body"><dl className="audit-card__meta"><div><dt>Licença</dt><dd title={activation.licenseKey}>{maskKey(activation.licenseKey || "--")}</dd></div><div><dt>App ID</dt><dd>{activation.appId}</dd></div><div><dt>Ativada em</dt><dd>{formatDateTime(activation.activatedAt || activation.createdAt)}</dd></div></dl>
            <dl className="audit-card__meta"><div><dt>Cooldown até</dt><dd>{activation.cooldownUntil ? formatDateTime(activation.cooldownUntil) : "--"}</dd></div><div><dt>HWID</dt><dd title={activation.hwid || "--"}>{activation.hwid ? maskTechnicalValue(activation.hwid, 10, 4) : "--"}</dd></div><div><dt>Falha</dt><dd title={activation.failureReason || "--"}>{activation.failureReason || "--"}</dd></div></dl></div>
          {activation.retryOf && <p className="premium-retry-note">Nova tentativa da ativação #{activation.retryOf}. A ativação mensal é contabilizada uma única vez.</p>}
          {retry.label && <div className="premium-retry-note"><span className={`badge badge--${retry.tone}`}>{retry.label}</span>{retry.expiresAt && <span>Disponível até {formatDateTime(retry.expiresAt)} · {Math.ceil((new Date(retry.expiresAt).getTime() - now) / 60000)} min restantes</span>}</div>}
          {(activation.status === "active" || retry.canGrant) && <div className="premium-activation__actions">
            {activation.status === "active" && <button className="button button--ghost" onClick={() => handleRelease(activation)} disabled={actionBusy || activation.retry?.status === "review" || activation.retry?.status === "processing" || activation.retry?.status === "available" && !retry.canGrant}>{busyAction === `release-premium-activation-${activation.id}` ? "Liberando..." : "Liberar cooldown"}</button>}
            {retry.canGrant && <button className="button button--primary" type="button" disabled={actionBusy} onClick={() => setRetryTarget(activation)}>{retry.review ? "Verificar tentativa" : "Nova tentativa"}</button>}
          </div>}
        </article>;
      })}</div>}
    </section>
    {retryTarget && <RetryModal activation={retryTarget} busy={retryBusy} onClose={() => !retryBusy && setRetryTarget(null)} onConfirm={handleRetry} />}
  </section>;
}
