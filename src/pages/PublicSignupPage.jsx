import React, { useEffect, useMemo, useState } from "react";
import { formatDateTime } from "../lib/admin-ui";

const unitLabels = {
  days: "Dias",
  weeks: "Semanas",
  months: "Meses",
  years: "Anos"
};

const defaultSettings = {
  enabled: false,
  durationAmount: 30,
  durationUnit: "days",
  isLifetime: false,
  description: ""
};

const defaultBilling = {
  billingEnabled: false,
  monthlyEnabled: true,
  lifetimeEnabled: true,
  monthlyPriceId: "",
  lifetimePriceId: "",
  prices: { monthly: null, lifetime: null }
};

function buildPreview(settings) {
  if (settings.isLifetime) {
    return "Novas chaves criadas pelo site serao vitalicias.";
  }

  const amount = Number(settings.durationAmount) || 1;
  const unit = unitLabels[settings.durationUnit] || "Dias";
  return `Novas chaves criadas pelo site vencerao em ${amount} ${unit.toLowerCase()}.`;
}

function formatMoney(amountCents, currency) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: String(currency || "brl").toUpperCase()
  }).format((Number(amountCents) || 0) / 100);
}

function formatStripePrice(price) {
  if (!price) {
    return "Informe e salve um Price ID para consultar a Stripe.";
  }

  const value = formatMoney(price.amountCents, price.currency);
  return price.recurringInterval === "month" ? `${value} / mes` : value;
}

function PriceSummary({ label, price }) {
  return (
    <div className="price-summary">
      <span>{label}</span>
      <strong>{formatStripePrice(price)}</strong>
      {price?.productName && <em>{price.productName}</em>}
      {price?.syncedAt && (
        <small>
          Stripe sincronizado em {formatDateTime(price.syncedAt)}
          {price.stale ? " - snapshot antigo" : ""}
        </small>
      )}
    </div>
  );
}

export default function PublicSignupPage({ publicSignup, onSave, saving, onRefresh }) {
  const [draft, setDraft] = useState({
    settings: { ...defaultSettings, ...(publicSignup.settings || {}) },
    billing: { ...defaultBilling, ...(publicSignup.billing || {}) }
  });

  useEffect(() => {
    setDraft({
      settings: { ...defaultSettings, ...(publicSignup.settings || {}) },
      billing: { ...defaultBilling, ...(publicSignup.billing || {}) }
    });
  }, [publicSignup.settings, publicSignup.billing]);

  const preview = useMemo(() => buildPreview(draft.settings), [draft.settings]);
  const metrics = publicSignup.metrics || {};
  const billing = draft.billing || defaultBilling;

  function updateSettings(next) {
    setDraft((current) => ({ ...current, settings: { ...current.settings, ...next } }));
  }

  function updateBilling(next) {
    setDraft((current) => ({ ...current, billing: { ...current.billing, ...next } }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSave({
      enabled: Boolean(draft.settings.enabled),
      durationAmount: Number(draft.settings.durationAmount) || 1,
      durationUnit: draft.settings.durationUnit || "days",
      isLifetime: Boolean(draft.settings.isLifetime),
      billing: {
        billingEnabled: Boolean(billing.billingEnabled),
        monthlyEnabled: Boolean(billing.monthlyEnabled),
        lifetimeEnabled: Boolean(billing.lifetimeEnabled),
        monthlyPriceId: billing.monthlyPriceId || "",
        lifetimePriceId: billing.lifetimePriceId || ""
      }
    });
  }

  return (
    <section className="page">
      <div className="page__header page__header--split">
        <div>
          <p className="eyebrow">Cadastro publico</p>
          <h1>Configure a criacao de chaves pela pagina publica do Merlin.</h1>
        </div>
        <button className="button button--ghost" onClick={onRefresh}>
          Atualizar
        </button>
      </div>

      <div className="settings-layout">
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Status</p>
              <h2>Criacao de chave pelo site</h2>
            </div>
          </div>

          <form className="settings-form" onSubmit={handleSubmit}>
            <label className="toggle-field">
              <input
                type="checkbox"
                checked={Boolean(draft.settings.enabled)}
                onChange={(event) => updateSettings({ enabled: event.target.checked })}
              />
              <div>
                <strong>Permitir criacao de chave pelo site</strong>
                <span>Quando ativado, visitantes poderao criar uma chave de acesso pela pagina publica.</span>
              </div>
            </label>

            <div className="field-grid">
              <label className="field">
                <span>Unidade</span>
                <select
                  value={draft.settings.isLifetime ? "lifetime" : draft.settings.durationUnit}
                  onChange={(event) => {
                    const value = event.target.value;
                    updateSettings({
                      isLifetime: value === "lifetime",
                      durationUnit: value === "lifetime" ? draft.settings.durationUnit || "days" : value
                    });
                  }}
                >
                  <option value="days">Dias</option>
                  <option value="weeks">Semanas</option>
                  <option value="months">Meses</option>
                  <option value="years">Anos</option>
                  <option value="lifetime">Vitalicio</option>
                </select>
              </label>

              {!draft.settings.isLifetime && (
                <label className="field">
                  <span>Validade</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={draft.settings.durationAmount ?? ""}
                    onChange={(event) => updateSettings({ durationAmount: event.target.value })}
                  />
                </label>
              )}
            </div>

            <div className="notice-card">
              <strong>Previa</strong>
              <p>{preview}</p>
            </div>

            <div className="settings-divider" />

            <div className="section-heading section-heading--compact">
              <div>
                <p className="eyebrow">Cobranca</p>
                <h2>Planos Stripe</h2>
              </div>
            </div>

            <label className="toggle-field">
              <input
                type="checkbox"
                checked={Boolean(billing.billingEnabled)}
                onChange={(event) => updateBilling({ billingEnabled: event.target.checked })}
              />
              <div>
                <strong>Exigir pagamento no cadastro publico</strong>
                <span>Quando ativado, o usuario devera escolher um plano e pagar pela Stripe antes de receber acesso.</span>
              </div>
            </label>

            <div className="billing-plan-grid">
              <div className="billing-plan-box">
                <label className="toggle-field">
                  <input
                    type="checkbox"
                    checked={Boolean(billing.monthlyEnabled)}
                    onChange={(event) => updateBilling({ monthlyEnabled: event.target.checked })}
                  />
                  <div>
                    <strong>Mensal</strong>
                    <span>Price recorrente mensal na Stripe.</span>
                  </div>
                </label>
                <label className="field">
                  <span>Stripe Price ID</span>
                  <input
                    value={billing.monthlyPriceId || ""}
                    placeholder="price_..."
                    spellCheck="false"
                    onChange={(event) => updateBilling({ monthlyPriceId: event.target.value })}
                  />
                </label>
                <PriceSummary label="Preco real" price={billing.prices?.monthly} />
              </div>

              <div className="billing-plan-box">
                <label className="toggle-field">
                  <input
                    type="checkbox"
                    checked={Boolean(billing.lifetimeEnabled)}
                    onChange={(event) => updateBilling({ lifetimeEnabled: event.target.checked })}
                  />
                  <div>
                    <strong>Vitalicio</strong>
                    <span>Price de pagamento unico na Stripe.</span>
                  </div>
                </label>
                <label className="field">
                  <span>Stripe Price ID</span>
                  <input
                    value={billing.lifetimePriceId || ""}
                    placeholder="price_..."
                    spellCheck="false"
                    onChange={(event) => updateBilling({ lifetimePriceId: event.target.value })}
                  />
                </label>
                <PriceSummary label="Preco real" price={billing.prices?.lifetime} />
              </div>
            </div>

            <div className="notice-card">
              <strong>Fonte do preco</strong>
              <p>O valor exibido vem da Stripe pelo Price ID. O snapshot e renovado depois de 12 horas; ao salvar, a API valida a Stripe imediatamente.</p>
            </div>

            <div className="form-actions">
              <button className="button button--primary" type="submit" disabled={saving}>
                {saving ? "Salvando..." : "Salvar configuracoes"}
              </button>
            </div>
          </form>
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Metricas</p>
              <h2>Chaves criadas pelo site</h2>
            </div>
          </div>

          <div className="stats-grid">
            <article className="stat-card">
              <span>Total</span>
              <strong>{metrics.total || 0}</strong>
            </article>
            <article className="stat-card">
              <span>Ativas</span>
              <strong>{metrics.active || 0}</strong>
            </article>
            <article className="stat-card">
              <span>Expiradas</span>
              <strong>{metrics.expired || 0}</strong>
            </article>
            <article className="stat-card">
              <span>Ultima chave</span>
              <strong>{metrics.latestCreatedAt ? formatDateTime(metrics.latestCreatedAt) : "--"}</strong>
            </article>
          </div>
        </section>
      </div>
    </section>
  );
}
