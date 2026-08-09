import React from "react";
import { formatDateTime, maskTechnicalValue } from "../lib/admin-ui";

function formatMoney(amountCents, currency) {
  if (typeof amountCents !== "number") return "--";
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: (currency || "brl").toUpperCase()
    }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${(currency || "brl").toUpperCase()}`;
  }
}

function planLabel(planType) {
  if (planType === "monthly") return "Mensal";
  if (planType === "lifetime") return "Vitalício";
  return planType || "--";
}

function statusLabel(status) {
  const value = String(status || "").toLowerCase();
  const labels = {
    active: "Ativo",
    action_required: "Ação necessária",
    canceled: "Cancelado",
    complete: "Completo",
    completed: "Concluído",
    dispute_open: "Em contestação",
    disputed: "Contestada",
    expired: "Expirado",
    failed: "Falhou",
    open: "Aberto",
    paid: "Pago",
    past_due: "Pagamento pendente",
    pending: "Pendente",
    processed: "Processado",
    processing: "Processando",
    refunded: "Reembolsado",
    unpaid: "Não pago"
  };
  return labels[value] || (status ? String(status).replaceAll("_", " ") : "--");
}

function statusTone(status) {
  const value = String(status || "").toLowerCase();
  if (["paid", "complete", "completed", "active", "processed"].includes(value)) return "success";
  if (["open", "processing", "pending", "past_due", "action_required"].includes(value)) return "warning";
  if (["failed", "expired", "canceled", "refunded", "disputed", "dispute_open"].includes(value)) return "danger";
  return "muted";
}

function paymentStatusLabel(payment) {
  return payment.paymentRecordStatus || payment.paymentStatus || payment.checkoutStatus || "--";
}

function eventLabel(eventType) {
  const labels = {
    "charge.dispute.closed": "Contestação encerrada",
    "charge.dispute.created": "Contestação aberta",
    "charge.dispute.funds_withdrawn": "Fundos da contestação retirados",
    "charge.refunded": "Pagamento reembolsado",
    "checkout.session.completed": "Checkout concluído",
    "checkout.session.expired": "Checkout expirado",
    "customer.subscription.deleted": "Assinatura encerrada",
    "customer.subscription.updated": "Assinatura atualizada",
    "invoice.paid": "Fatura paga",
    "invoice.payment_action_required": "Fatura exige ação",
    "invoice.payment_failed": "Falha no pagamento da fatura"
  };
  return labels[eventType] || String(eventType || "").replaceAll("_", " ");
}

export default function PaymentsPage({
  paymentSearch,
  setPaymentSearch,
  paymentLogs,
  paymentEvents,
  filteredPaymentLogs,
  loadingPaymentLogs,
  loadPaymentLogs,
  onSyncCheckout,
  onSyncLicense,
  busyAction
}) {
  return (
    <section className="page page--payments">
      <div className="page__header page__header--split">
        <div>
          <p className="eyebrow">Pagamentos</p>
          <h1>Acompanhe compras, webhooks e reconcilie a Stripe quando precisar.</h1>
        </div>
        <button className="button button--ghost" onClick={loadPaymentLogs} disabled={loadingPaymentLogs}>
          {loadingPaymentLogs ? "Atualizando..." : "Atualizar pagamentos"}
        </button>
      </div>

      <section className="panel panel--audit">
        <div className="filters filters--audit">
          <label className="field-shell field-shell--search">
            <span>Buscar</span>
            <input
              value={paymentSearch}
              onChange={(event) => setPaymentSearch(event.target.value)}
              placeholder="E-mail, sessao, assinatura, licenca..."
            />
          </label>
        </div>

        {loadingPaymentLogs ? (
          <div className="empty-state">
            <h3>Carregando pagamentos</h3>
            <p>Buscando checkouts e eventos recentes da Stripe.</p>
          </div>
        ) : !filteredPaymentLogs.length ? (
          <div className="empty-state">
            <h3>Nenhum pagamento encontrado</h3>
            <p>Ajuste a busca ou aguarde novas tentativas de checkout.</p>
          </div>
        ) : (
          <div className="payment-list">
            {filteredPaymentLogs.map((payment) => {
              const actionKey = `sync-checkout-${payment.providerSessionId}`;
              const licenseActionKey = `sync-license-${payment.licenseId}`;
              const evidence = payment.checkoutEvidence || {};
              return (
                <article className="audit-card payment-card" key={`${payment.checkoutId}-${payment.paymentId || "checkout"}`}>
                  <div className="audit-card__head payment-card__head">
                    <div className="payment-card__title">
                      <strong>{payment.email || "E-mail nao informado"}</strong>
                      <p>{planLabel(payment.planType)} · {formatMoney(payment.amountCents, payment.currency)}</p>
                    </div>
                    <span className={`badge badge--${statusTone(paymentStatusLabel(payment))}`} title={paymentStatusLabel(payment)}>
                      {statusLabel(paymentStatusLabel(payment))}
                    </span>
                  </div>

                  <div className="audit-card__body">
                    <dl className="audit-card__meta payment-card__meta">
                      <div>
                        <dt>Checkout</dt>
                        <dd className="truncate-text" title={payment.providerSessionId}>
                          {maskTechnicalValue(payment.providerSessionId, 14, 8)}
                        </dd>
                      </div>
                      <div>
                        <dt>Licenca</dt>
                        <dd className="truncate-text" title={payment.licenseKey || "--"}>
                          {payment.licenseId ? `#${payment.licenseId} · ${payment.licenseName || payment.licenseKey || "--"}` : "--"}
                        </dd>
                      </div>
                      <div>
                        <dt>Criado em</dt>
                        <dd>{formatDateTime(payment.checkoutCreatedAt)}</dd>
                      </div>
                    </dl>

                    <dl className="audit-card__meta payment-card__meta">
                      <div>
                        <dt>Assinatura</dt>
                        <dd className="truncate-text" title={payment.providerSubscriptionId || "--"}>
                          {payment.providerSubscriptionId ? maskTechnicalValue(payment.providerSubscriptionId, 12, 6) : "--"}
                        </dd>
                      </div>
                      <div>
                        <dt>Pagamento</dt>
                        <dd className="truncate-text" title={payment.providerPaymentId || "--"}>
                          {payment.providerPaymentId ? maskTechnicalValue(payment.providerPaymentId, 12, 6) : "--"}
                        </dd>
                      </div>
                      <div>
                        <dt>IP / Pais</dt>
                        <dd className="truncate-text" title={`${payment.checkoutIp || "--"} ${payment.checkoutCountry || ""}`}>
                          {payment.checkoutIp || "--"}{payment.checkoutCountry ? ` · ${payment.checkoutCountry}` : ""}
                        </dd>
                      </div>
                    </dl>

                    <details className="payment-technical">
                      <summary>Dados tecnicos do checkout</summary>
                      <dl className="audit-card__meta payment-card__meta">
                        <div>
                          <dt>Price ID</dt>
                          <dd className="truncate-text" title={payment.providerPriceId || "--"}>{payment.providerPriceId || "--"}</dd>
                        </div>
                        <div>
                          <dt>Expira em</dt>
                          <dd>{formatDateTime(payment.providerSessionExpiresAt)}</dd>
                        </div>
                        <div>
                          <dt>Concluido em</dt>
                          <dd>{formatDateTime(payment.completedAt)}</dd>
                        </div>
                      </dl>
                      <div className="audit-card__details">
                        <span>User agent</span>
                        <code>{payment.checkoutUserAgent || "--"}</code>
                      </div>
                      <div className="audit-card__details">
                        <span>Evidencias</span>
                        <code>{JSON.stringify(evidence)}</code>
                      </div>
                    </details>

                    <div className="payment-actions">
                      <button
                        className="button button--ghost"
                        onClick={() => onSyncCheckout(payment.providerSessionId)}
                        disabled={busyAction === actionKey}
                      >
                        {busyAction === actionKey ? "Sincronizando..." : "Sincronizar checkout"}
                      </button>
                      {payment.licenseId && (
                        <button
                          className="button button--ghost"
                          onClick={() => onSyncLicense(payment.licenseId)}
                          disabled={busyAction === licenseActionKey}
                        >
                          {busyAction === licenseActionKey ? "Sincronizando..." : "Sincronizar licenca"}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel panel--audit">
        <div className="page__header page__header--split payment-events-header">
          <div>
            <p className="eyebrow">Webhooks</p>
            <h2>Eventos Stripe recentes</h2>
          </div>
          <span>{paymentEvents.length} eventos</span>
        </div>

        {!paymentEvents.length ? (
          <div className="empty-state">
            <h3>Nenhum webhook recente</h3>
            <p>Quando a Stripe enviar eventos, eles aparecem aqui.</p>
          </div>
        ) : (
          <div className="payment-event-list">
            {paymentEvents.map((event) => (
              <article className="payment-event" key={event.id}>
                <div>
                  <strong>{eventLabel(event.eventType)}</strong>
                  <p className="truncate-text" title={event.providerEventId}>{event.providerEventId}</p>
                  {event.errorMessage && <code>{event.errorMessage}</code>}
                </div>
                <div className="payment-event__aside">
                  <span className={`badge badge--${statusTone(event.processingStatus)}`} title={event.processingStatus}>
                    {statusLabel(event.processingStatus)}
                  </span>
                  <small>{formatDateTime(event.processedAt || event.rawCreatedAt || event.createdAt)}</small>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
