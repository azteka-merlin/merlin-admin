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
const RECEIPT_PERIODS = [["monthly", "Mensal"], ["semiannual", "Semestral"], ["annual", "Anual"]];

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
  const [customDays, setCustomDays] = React.useState(String(periodDays));
  const [periodChoice, setPeriodChoice] = React.useState([30, 90, 365, 1095].includes(periodDays) ? String(periodDays) : "custom");
  const [tier, setTier] = React.useState("all");
  const summary = dashboard?.summary;
  const receipts = dashboard?.tierReceipts || [];
  const selectedReceipts = receipts.filter(row => tier === "all" ? row.tier !== "unknown" : row.tier === tier);
  const selectedTotal = selectedReceipts.reduce((sum, row) => sum + Number(row.amount_cents || 0), 0);
  const selectedCount = selectedReceipts.reduce((sum, row) => sum + Number(row.payment_count || 0), 0);
  const unknownReceipts = receipts.find(row => row.tier === "unknown");
  const activePayers = (dashboard?.payers || []).filter(payer => payer.category !== "attention" && payer.hasPositivePayment && (tier === "all" || payer.tier === tier)).length;
  const snapshots = (dashboard?.monthlySubscriberSnapshots || []).filter(row => tier === "all" || row.tier === tier);
  const snapshotDays = snapshots.length ? Math.min(...snapshots.map(row => Number(row.days))) : 0;
  const monthlyAverage = snapshotDays ? snapshots.reduce((sum, row) => sum + Number(row.subscriber_days), 0) / snapshotDays : null;
  return <div className="finance-content" id="payments-summary-panel" role="tabpanel" aria-labelledby="payments-summary-tab">
    <div className="finance-toolbar report-filters">
      <label className="field-shell"><span>Período</span><select value={periodChoice} onChange={event => { const value = event.target.value; setPeriodChoice(value); if (value !== "custom") setPeriodDays(Number(value)); }}><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="365">Último ano</option><option value="1095">Últimos 3 anos</option><option value="custom">Escolher dias</option></select></label>
      {periodChoice === "custom" && <form className="finance-toolbar" onSubmit={event => { event.preventDefault(); const days = Number(customDays); if (Number.isInteger(days) && days >= 1 && days <= 1095) setPeriodDays(days); }}><label className="field-shell"><span>Quantos dias?</span><input type="number" min="1" max="1095" required value={customDays} onChange={event => setCustomDays(event.target.value)} /></label><button className="button button--ghost button--sm" type="submit">Aplicar</button></form>}
      <label className="field-shell"><span>Plano</span><select value={tier} onChange={event => setTier(event.target.value)}><option value="all">Todos os planos</option><option value="bronze">Bronze</option><option value="prata">Prata</option><option value="ouro">Ouro</option></select></label>
      <button className="button button--ghost button--sm" onClick={refresh} disabled={loading}>{loading ? "Atualizando..." : "Atualizar dados"}</button>
    </div>
    {error && <div className="billing-mail-error" role="alert">{error}</div>}
    {!dashboard && loading ? <div className="empty-state"><h3>Carregando resumo</h3><p>Consultando licenças e pagamentos confirmados.</p></div> : dashboard && <>
      <p className="finance-asof">Dados de {formatDateTimeBrt(dashboard.generatedAt)} · contagens de licenças, não de pessoas únicas</p>
      {dashboard.reconciliation?.unmatchedPaidCheckouts > 0 && <div className="billing-mail-error" role="status">Atenção: {dashboard.reconciliation.unmatchedPaidCheckouts} checkout(s) Stripe marcado(s) como pago(s) neste período não têm lançamento correspondente em pagamentos. O valor recebido abaixo pode estar incompleto; confira Transações antes de usá-lo como fechamento.</div>}
      <section className="panel finance-panel">
        <div className="section-heading"><h2>Resumo</h2><span className="finance-note">Últimos {periodDays} dias</span></div>
        <div className="finance-forecast report-summary"><div><span>Faturamento</span><strong>{money(selectedTotal)}</strong><small>{selectedCount} pagamentos</small></div><div><span>Pagantes ativos hoje</span><strong>{activePayers}</strong><small>Licenças pagas</small></div><div><span>Média de assinantes no mês</span><strong>{monthlyAverage === null ? "Sem dados ainda" : monthlyAverage.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</strong><small>{snapshotDays ? `${snapshotDays} dia(s) registrado(s) neste mês` : "Primeira contagem pendente"}</small></div></div>
        {unknownReceipts && <p className="finance-note">{unknownReceipts.payment_count} pagamento(s) sem plano identificado ({money(Number(unknownReceipts.amount_cents))}) ficaram fora do faturamento por plano.</p>}
        <details className="finance-note"><summary>Como são calculados?</summary>O faturamento considera pagamentos confirmados, sem descontar taxas. A média usa a contagem diária de assinaturas pagas ativas neste mês. Gratuitos, testes e vitalícios não entram na média. O histórico começou a ser registrado em novembro de 2026.</details>
      </section>
      <details className="panel finance-panel"><summary>Mais detalhes financeiros</summary>
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
        <div className="finance-projection-periods">
          {RECEIPT_PERIODS.map(([period, label]) => {
            const projection = summary.nextRenewalsByPeriod?.[period] || {};
            return <article className="finance-period-card" key={period}>
              <span className="finance-period-title">{label}</span>
              <div className="finance-period-row"><span>Cartão automático · estimativa</span><b>{money(projection.cardCents ?? 0)}</b></div>
              <small>{projection.cardCount ?? 0} cobranças previstas</small>
              <div className="finance-period-row"><span>Pix · potencial, não garantido</span><b>{money(projection.pixPotentialCents ?? 0)}</b></div>
              <small>{projection.pixPotentialCount ?? 0} licenças vencem no período</small>
            </article>;
          })}
        </div>
        <p className="finance-note">Total estimado no cartão: {money(summary.nextCardCents)} · potencial via Pix: {money(summary.nextPixPotentialCents)}. Cálculo pelo preço de tabela atual para o próximo vencimento, não uma fatura emitida; Pix depende de o cliente gerar e pagar. Descontos, impostos e mudanças de plano podem alterar o valor. {summary.unpricedRenewals > 0 && `${summary.unpricedRenewals} renovação(ões) sem preço disponível ficaram fora da soma. `}{summary.pendingChangeRenewals > 0 && `${summary.pendingChangeRenewals} com alteração pendente ficaram fora da soma.`}</p>
      </section>
      <section className="panel finance-panel">
        <div className="section-heading"><div><p className="eyebrow">Caixa registrado</p><h2>Pagamentos confirmados</h2></div></div>
        <div className="finance-forecast"><div><span>Stripe</span><strong>{money(summary.receivedStripeCents)}</strong><small>Inclui pagamentos avulsos do provedor</small></div><div><span>Mercado Pago Pix</span><strong>{money(summary.receivedPixCents)}</strong><small>Pagamentos confirmados no período</small></div></div>
        <div>
          <p className="finance-period-title">Por periodicidade do plano</p>
          <div className="finance-period-breakdown">
            {RECEIPT_PERIODS.map(([period, label]) => {
              const received = summary.receivedByPeriod?.[period] || {};
              return <article className="finance-period-card" key={period}>
                <span>{label}</span><strong>{money(received.amountCents ?? 0)}</strong>
                <small>{received.paymentCount ?? 0} pagamentos no período selecionado</small>
              </article>;
            })}
            <article className="finance-period-card">
              <span>Vitalício / avulso</span><strong>{money(summary.receivedByPeriod?.lifetime?.amountCents ?? 0)}</strong>
              <small>{summary.receivedByPeriod?.lifetime?.paymentCount ?? 0} pagamentos</small>
            </article>
            {(summary.receivedByPeriod?.other?.amountCents ?? 0) > 0 && <article className="finance-period-card">
              <span>Sem periodicidade identificada</span><strong>{money(summary.receivedByPeriod.other.amountCents)}</strong>
              <small>{summary.receivedByPeriod.other.paymentCount} pagamentos; não classificados como mensal, semestral ou anual</small>
            </article>}
          </div>
        </div>
        <p className="finance-note">O valor mensal, semestral ou anual representa o total pago por planos daquela periodicidade na data de cada pagamento — não uma média mensal. Vitalícios/avulsos ficam à parte. Valores brutos registrados como pagos; não representam lucro líquido nem descontam taxas dos provedores. Registros reembolsados são excluídos.</p>
      </section>
      </details>
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

export function FinanceLifecycle({ dashboard, loading, error, refresh, periodDays, setPeriodDays }) {
  const lifecycle = dashboard?.lifecycle;
  const distribution = lifecycle?.retention?.paidPeriodDistribution;
  const periodLabel = periodDays === 365 ? "12 meses" : `${periodDays} dias`;
  return <div className="finance-content" id="payments-lifecycle-panel" role="tabpanel" aria-labelledby="payments-lifecycle-tab">
    <div className="finance-toolbar">
      <label className="field-shell"><span>Janela para churn e retorno</span><select value={periodDays} onChange={(event) => setPeriodDays(Number(event.target.value))}>{![30, 90, 365].includes(periodDays) && <option value={periodDays}>Últimos {periodDays} dias</option>}<option value={30}>Últimos 30 dias</option><option value={90}>Últimos 90 dias</option><option value={365}>Últimos 12 meses</option></select></label>
      <button className="button button--ghost button--sm" onClick={refresh} disabled={loading}>{loading ? "Atualizando..." : "Atualizar dados"}</button>
    </div>
    {error && <div className="billing-mail-error" role="alert">{error}</div>}
    {!dashboard && loading ? <div className="empty-state"><h3>Carregando indicadores</h3><p>Conferindo períodos pagos, vencimentos e reativações.</p></div> : lifecycle && <>
      <p className="finance-asof">Atualizado em {formatDateTimeBrt(dashboard.generatedAt)} · contagens de licenças, não de pessoas únicas</p>
      <section className="panel finance-panel">
        <div className="section-heading"><div><p className="eyebrow">1 · Retenção</p><h2>Quantos períodos pagos cada cliente completou</h2></div></div>
        <p className="finance-note">Mostra licenças recorrentes que continuam ativas, agrupadas pelo número de cobranças de período confirmadas. Três períodos = contratação inicial + duas renovações. Cobranças de upgrade não contam como renovação.</p>
        <div className="finance-lifecycle-buckets">
          <article><span>1 período</span><strong>{distribution?.onePeriod ?? 0}</strong><small>Ainda sem renovação confirmada</small></article>
          <article><span>2 períodos</span><strong>{distribution?.twoPeriods ?? 0}</strong><small>Uma renovação confirmada</small></article>
          <article><span>3 períodos</span><strong>{distribution?.threePeriods ?? 0}</strong><small>Duas renovações confirmadas</small></article>
          <article><span>4 ou mais</span><strong>{distribution?.fourOrMorePeriods ?? 0}</strong><small>Três ou mais renovações</small></article>
        </div>
        <p className="finance-note">Base classificada: {lifecycle.retention.activeRecurringLicenses} licenças ativas. {lifecycle.retention.unclassifiedCardLicenses > 0 && `${lifecycle.retention.unclassifiedCardLicenses} licença(s) com faturas Stripe antigas sem motivo registrado foram excluídas dos grupos para não contar upgrades como renovações. `}Pagamentos Stripe só entram quando a fatura identifica contratação ou ciclo; no Pix, entram pagamentos recorrentes confirmados.</p>
      </section>
      <section className="panel finance-panel">
        <div className="section-heading"><div><p className="eyebrow">2 · Churn</p><h2>Acessos pagos que expiraram</h2></div><span className="finance-count">{periodLabel}</span></div>
        <div className="finance-lifecycle-highlight"><strong>{lifecycle.churn.expiredPaidLicenses}</strong><span>licenças recorrentes com vencimento no período, incluindo vencimentos anteriores capturados quando o cliente reativou</span></div>
        <p className="finance-note">Conta uma licença uma vez quando o acesso pago vence e existe histórico de pagamento recorrente. Não inclui teste ou licença vitalícia.</p>
      </section>
      <section className="panel finance-panel">
        <div className="section-heading"><div><p className="eyebrow">3 · Retorno</p><h2>Clientes que voltaram a pagar após expirar</h2></div><span className="finance-count">{periodLabel}</span></div>
        <div className="finance-lifecycle-highlight"><strong>{lifecycle.returned.paidAgainAfterExpiry}</strong><span>licenças reativadas com novo pagamento confirmado</span></div>
        <p className="finance-note">Exige pagamento anterior, licença já expirada no início da nova compra e pagamento atual confirmado. Conversão de acesso gratuito para pago não entra. Reativações anteriores a este registro de evidência não são inferidas.</p>
      </section>
    </>}
  </div>;
}
