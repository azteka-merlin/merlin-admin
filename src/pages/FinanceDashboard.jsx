import React from "react";
import { formatDateTimeBrt } from "../lib/admin-ui";

const CATEGORIES = [
  ["paid", "Pagantes ativos"],
  ["all", "Todos, incl. pendências"],
  ["card_auto", "Cartão automático"],
  ["pix", "Pix manual"],
  ["card_ending", "Cartão sem renovação"],
  ["lifetime", "Vitalício pago"],
  ["attention", "Cobrança em atenção"],
];

const CATEGORY_LABELS = Object.fromEntries(CATEGORIES);
const PERIOD_LABELS = { monthly: "Mensal", semiannual: "Semestral", annual: "Anual", lifetime: "Vitalício" };

function money(cents) {
  if (typeof cents !== "number") return "Valor indisponível";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function Metric({ label, value, note, onClick }) {
  const Tag = onClick ? "button" : "article";
  return <Tag type={onClick ? "button" : undefined} className={`stat-card finance-metric${onClick ? " finance-metric--link" : ""}`} onClick={onClick}>
    <span>{label}</span><strong>{value}</strong><small>{note}</small>
  </Tag>;
}

export function FinanceOverview({ dashboard, loading, error, periodDays, setPeriodDays, refresh, showSubscribers }) {
  const summary = dashboard?.summary;
  return <div className="finance-content" id="payments-summary-panel" role="tabpanel" aria-labelledby="payments-summary-tab">
    <div className="finance-toolbar">
      <label className="field-shell"><span>Recebimento</span><select value={periodDays} onChange={(event) => setPeriodDays(Number(event.target.value))}><option value={30}>Últimos 30 dias</option><option value={90}>Últimos 90 dias</option><option value={365}>Últimos 12 meses</option></select></label>
      <button className="button button--ghost button--sm" onClick={refresh} disabled={loading}>{loading ? "Atualizando..." : "Atualizar dados"}</button>
    </div>
    {error && <div className="billing-mail-error" role="alert">{error}</div>}
    {!dashboard && loading ? <div className="empty-state"><h3>Carregando resumo</h3><p>Consultando licenças e pagamentos confirmados.</p></div> : dashboard && <>
      <p className="finance-asof">Dados de {formatDateTimeBrt(dashboard.generatedAt)} · contagens de licenças, não de pessoas únicas</p>
      {dashboard.reconciliation?.unmatchedPaidCheckouts > 0 && <div className="billing-mail-error" role="status">Atenção: {dashboard.reconciliation.unmatchedPaidCheckouts} checkout(s) Stripe marcado(s) como pago(s) neste período não têm lançamento correspondente em pagamentos. O valor recebido abaixo pode estar incompleto; confira Transações antes de usá-lo como fechamento.</div>}
      <div className="stats-grid finance-stats">
        <Metric label="Pagantes ativos" value={summary.paidActive} note={`de ${summary.activeAccess} licenças com acesso válido`} onClick={() => showSubscribers("paid")} />
        <Metric label="Cartão automático" value={summary.cardAutomatic} note="Assinaturas que seguem renovando" onClick={() => showSubscribers("card_auto")} />
        <Metric label="Pix manual" value={summary.pixManual} note="Próximo Pix depende do cliente" onClick={() => showSubscribers("pix")} />
        <Metric label={`Recebido registrado em ${periodDays} dias`} value={money(summary.receivedCents)} note={`${summary.receivedCount} pagamentos lançados como pagos`} />
      </div>
      <section className="panel finance-panel">
        <div className="section-heading"><div><p className="eyebrow">Composição</p><h2>Quem está pagando hoje</h2></div></div>
        <div className="finance-split">
          <button onClick={() => showSubscribers("card_ending")}><strong>{summary.cardEnding}</strong><span>Cartão sem próxima renovação</span></button>
          <button onClick={() => showSubscribers("lifetime")}><strong>{summary.paidLifetime}</strong><span>Vitalício pago</span></button>
          <button onClick={() => showSubscribers("attention")}><strong>{summary.paymentAttention}</strong><span>Cobrança em atenção</span></button>
        </div>
        <p className="finance-note">Gratuitos e vitalícios legados não entram em “pagantes”. Cartão com cancelamento agendado continua pagante enquanto o acesso estiver válido, mas não entra em “cartão automático”.</p>
      </section>
      <section className="panel finance-panel">
        <div className="section-heading"><div><p className="eyebrow">Próximos 30 dias</p><h2>Previsão de renovação</h2></div></div>
        <div className="finance-forecast">
          <div><span>Cartão automático · estimativa</span><strong>{money(summary.nextCardCents)}</strong><small>{summary.nextCardCount} próximas cobranças no período</small></div>
          <div><span>Pix · potencial, não garantido</span><strong>{money(summary.nextPixPotentialCents)}</strong><small>{summary.nextPixPotentialCount} licenças com vencimento no período</small></div>
        </div>
        <p className="finance-note">Estimativa pelo preço de tabela atual para o próximo vencimento, não uma fatura emitida. Descontos, impostos e mudanças de plano podem alterar o valor. {summary.unpricedRenewals > 0 && `${summary.unpricedRenewals} renovação(ões) sem preço disponível ficaram fora da soma. `}{summary.pendingChangeRenewals > 0 && `${summary.pendingChangeRenewals} com alteração pendente ficaram fora da soma.`}</p>
      </section>
      <section className="panel finance-panel">
        <div className="section-heading"><div><p className="eyebrow">Caixa registrado</p><h2>Pagamentos confirmados</h2></div></div>
        <div className="finance-forecast"><div><span>Stripe</span><strong>{money(summary.receivedStripeCents)}</strong><small>Inclui pagamentos avulsos do provedor</small></div><div><span>Mercado Pago Pix</span><strong>{money(summary.receivedPixCents)}</strong><small>Pagamentos confirmados no período</small></div></div>
        <p className="finance-note">Valores brutos em BRL registrados como pagos; registros reembolsados são excluídos. Não representa lucro líquido, taxas dos provedores ou reconhecimento contábil.</p>
      </section>
    </>}
  </div>;
}

export function FinanceSubscribers({ dashboard, loading, error, refresh, category, setCategory, openLicense }) {
  const [query, setQuery] = React.useState("");
  const [tier, setTier] = React.useState("all");
  const normalized = query.trim().toLowerCase();
  const payers = (dashboard?.payers || []).filter((payer) =>
    (category === "all" || (category === "paid" ? payer.category !== "attention" : payer.category === category))
    && (tier === "all" || payer.tier === tier)
    && (!normalized || `${payer.name} ${payer.licenseId}`.toLowerCase().includes(normalized)));

  return <div className="finance-content" id="payments-subscribers-panel" role="tabpanel" aria-labelledby="payments-subscribers-tab">
    <div className="finance-toolbar"><p className="finance-asof">{dashboard ? `Atualizado em ${formatDateTimeBrt(dashboard.generatedAt)}` : "Licenças pagas com acesso válido"}</p><button className="button button--ghost button--sm" onClick={refresh} disabled={loading}>{loading ? "Atualizando..." : "Atualizar dados"}</button></div>
    {error && <div className="billing-mail-error" role="alert">{error}</div>}
    {!dashboard && !loading ? null : <section className="panel finance-panel">
      <div className="section-heading"><div><p className="eyebrow">Assinantes</p><h2>Licenças pagantes</h2></div><span className="finance-count">{payers.length} resultado{payers.length === 1 ? "" : "s"}</span></div>
      <div className="filters finance-filters">
        <label className="field-shell field-shell--search"><span>Buscar licença</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome ou número da licença" /></label>
        <label className="field-shell"><span>Tipo de pagamento</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="field-shell"><span>Plano</span><select value={tier} onChange={(event) => setTier(event.target.value)}><option value="all">Todos os planos</option><option value="bronze">Bronze</option><option value="prata">Prata</option><option value="ouro">Ouro</option></select></label>
      </div>
      {loading && !dashboard ? <div className="empty-state"><h3>Carregando assinantes</h3></div> : payers.length === 0 ? <div className="empty-state"><h3>Nenhuma licença encontrada</h3><p>Ajuste os filtros ou atualize os dados.</p></div> : <div className="finance-license-list">
        {payers.map((payer) => <article className="finance-license" key={payer.licenseId}>
          <div className="finance-license__head"><div><strong>{payer.name}</strong><small>Licença #{payer.licenseId}</small></div><span className={`badge badge--${payer.category === "attention" ? "warning" : "success"}`}>{CATEGORY_LABELS[payer.category]}</span></div>
          <div className="finance-license__details"><div><span>Plano</span><strong>{payer.tier[0].toUpperCase() + payer.tier.slice(1)} · {PERIOD_LABELS[payer.period]}</strong></div><div><span>Próximo vencimento</span><strong>{payer.nextDueAt ? formatDateTimeBrt(payer.nextDueAt) : "Sem vencimento"}</strong></div><div><span>Preço de tabela</span><strong>{payer.period === "lifetime" ? "Pagamento único" : money(payer.amountCents)}</strong></div></div>
          {payer.attentionReason && <p className="finance-note">{payer.attentionReason}</p>}
          {payer.hasPendingChange && <p className="finance-note">Alteração de plano pendente: próximo valor não projetado.</p>}
          <button className="button button--ghost button--sm" onClick={() => openLicense(payer.licenseId)}>Ver licença</button>
        </article>)}
      </div>}
    </section>}
  </div>;
}
