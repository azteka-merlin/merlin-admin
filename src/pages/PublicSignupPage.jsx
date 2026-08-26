import React, { useEffect, useMemo, useState } from "react";
import { formatDateTime } from "../lib/admin-ui";
import Modal from "../components/Modal";

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
  plansEnabled: false,
  monthlyEnabled: true,
  annualEnabled: false,
  lifetimeEnabled: true,
  pixEnabled: false,
  pixMonthlyEnabled: true,
  pixAnnualEnabled: true,
  pixLifetimeEnabled: true,
  monthlyCardTrialEnabled: false,
  monthlyCardTrialDays: 30,
  stagingEmailDeliveryEnabled: false,
  premiumCatalogCutoffAt: "",
  monthlyPriceId: "",
  annualPriceId: "",
  lifetimePriceId: "",
  pixAnnualPriceId: "",
  pixLifetimePriceId: "",
  prices: { monthly: null, annual: null, lifetime: null, pixAnnual: null, pixLifetime: null }
};

const planTiers = [
  { id: "bronze", label: "Bronze" },
  { id: "prata", label: "Prata" },
  { id: "ouro", label: "Ouro" }
];

const planPeriods = [
  { id: "monthly", label: "Mensal" },
  { id: "annual", label: "Anual" }
];

function buildPreview(settings) {
  if (settings.isLifetime) {
    return "Novas chaves criadas pelo site serão vitalícias.";
  }

  const amount = Number(settings.durationAmount) || 1;
  const unit = unitLabels[settings.durationUnit] || "Dias";
  return `Novas chaves criadas pelo site vencerão em ${amount} ${unit.toLowerCase()}.`;
}

function formatMoney(amountCents, currency) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: String(currency || "brl").toUpperCase()
  }).format((Number(amountCents) || 0) / 100);
}

function amountToInput(amountCents) {
  if (amountCents === null || amountCents === undefined || amountCents === "") return "";
  return (Number(amountCents || 0) / 100).toFixed(2).replace(".", ",");
}

function inputToAmountCents(value) {
  const normalized = String(value || "").trim().replace(/\./g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

function toDateTimeLocalValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value).slice(0, 16);
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function planPriceKey(paymentMethod, planTier, billingPeriod) {
  return `${paymentMethod}:${planTier}:${billingPeriod}`;
}

function normalizePlanPriceDraft(prices = []) {
  const byKey = new Map((prices || []).map((price) => [
    planPriceKey(price.paymentMethod, price.planTier, price.billingPeriod),
    price
  ]));
  const draft = {};
  for (const method of [{ id: "card" }, { id: "pix" }]) {
    for (const tier of planTiers) {
      for (const period of planPeriods) {
        const current = byKey.get(planPriceKey(method.id, tier.id, period.id));
        draft[planPriceKey(method.id, tier.id, period.id)] = {
          paymentMethod: method.id,
          planTier: tier.id,
          billingPeriod: period.id,
          priceId: current?.priceId || "",
          amount: amountToInput(current?.amountCents),
          currency: current?.currency || "brl",
          active: current?.active !== false
        };
      }
    }
  }
  return draft;
}

function buildPlanPricePayload(draft) {
  return Object.values(draft || {}).map((entry) => ({
    paymentMethod: entry.paymentMethod,
    planTier: entry.planTier,
    billingPeriod: entry.billingPeriod,
    priceId: String(entry.priceId || "").trim() || null,
    amountCents: inputToAmountCents(entry.amount),
    currency: String(entry.currency || "brl").trim().toLowerCase(),
    active: Boolean(entry.active)
  }));
}

function formatStripePrice(price) {
  if (!price) {
    return "Preço não sincronizado";
  }

  const value = formatMoney(price.amountCents, price.currency);
  if (price.recurringInterval === "month") return `${value} / mês`;
  if (price.recurringInterval === "year") return `${value} / ano`;
  return value;
}

function normalizeBilling(billing = {}) {
  return {
    billingEnabled: Boolean(billing.billingEnabled),
    plansEnabled: Boolean(billing.plansEnabled),
    monthlyEnabled: Boolean(billing.monthlyEnabled),
    annualEnabled: Boolean(billing.annualEnabled),
    lifetimeEnabled: Boolean(billing.lifetimeEnabled),
    pixEnabled: Boolean(billing.pixEnabled),
    pixMonthlyEnabled: Boolean(billing.pixMonthlyEnabled),
    pixAnnualEnabled: Boolean(billing.pixAnnualEnabled),
    pixLifetimeEnabled: Boolean(billing.pixLifetimeEnabled),
    monthlyCardTrialEnabled: Boolean(billing.monthlyCardTrialEnabled),
    monthlyCardTrialDays: Math.min(730, Math.max(1, Number(billing.monthlyCardTrialDays) || 30)),
    stagingEmailDeliveryEnabled: Boolean(billing.stagingEmailDeliveryEnabled),
    premiumCatalogCutoffAt: toDateTimeLocalValue(billing.premiumCatalogCutoffAt),
    monthlyPriceId: billing.monthlyPriceId || "",
    annualPriceId: billing.annualPriceId || "",
    lifetimePriceId: billing.lifetimePriceId || "",
    pixAnnualPriceId: billing.pixAnnualPriceId || "",
    pixLifetimePriceId: billing.pixLifetimePriceId || ""
  };
}

function normalizeSettings(settings = {}) {
  return {
    enabled: Boolean(settings.enabled),
    durationAmount: Number(settings.durationAmount) || 1,
    durationUnit: settings.durationUnit || "days",
    isLifetime: Boolean(settings.isLifetime)
  };
}

function buildSubmitPayload(draft) {
  const billing = normalizeBilling(draft.billing);
  return {
    ...normalizeSettings(draft.settings),
    billing: {
      ...billing,
      premiumCatalogCutoffAt: billing.premiumCatalogCutoffAt ? new Date(billing.premiumCatalogCutoffAt).toISOString() : null
    }
  };
}

function priceIsConfigured(price) {
  return Boolean(price && price.active && Number(price.amountCents) > 0);
}

function StatusPill({ tone = "muted", label, detail }) {
  return (
    <div className={`access-status-pill access-status-pill--${tone}`}>
      <span aria-hidden="true" />
      <div>
        <strong>{label}</strong>
        {detail && <small>{detail}</small>}
      </div>
    </div>
  );
}

function SwitchField({ checked, onChange, title, description, disabled = false }) {
  return (
    <label className={`access-switch ${disabled ? "is-disabled" : ""}`}>
      <input
        type="checkbox"
        role="switch"
        checked={Boolean(checked)}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="access-switch__control" aria-hidden="true" />
      <span className="access-switch__text">
        <strong>{title}</strong>
        {description && <em>{description}</em>}
      </span>
    </label>
  );
}

function AdvancedDisclosure({ id, title = "Configuração avançada", open, onToggle, children }) {
  return (
    <div className="access-advanced">
      <button
        type="button"
        className="access-advanced__button"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
      >
        <span>{title}</span>
        <strong>{open ? "−" : "+"}</strong>
      </button>
      {open && (
        <div id={id} className="access-advanced__body">
          {children}
        </div>
      )}
    </div>
  );
}

function PriceMeta({ price }) {
  return (
    <div className="access-price-meta">
      <div>
        <span>Preço sincronizado</span>
        <strong>{formatStripePrice(price)}</strong>
      </div>
      <div>
        <span>Produto</span>
        <strong>{price?.productName || "Não informado"}</strong>
      </div>
      <div>
        <span>Última sincronização</span>
        <strong>{price?.syncedAt ? formatDateTime(price.syncedAt) : "Ainda não sincronizado"}</strong>
      </div>
    </div>
  );
}

function PlanCard({ kind, title, badge, enabled, onEnabledChange, price, priceId, onPriceIdChange, disabledNotice, children, advancedOpen, onAdvancedToggle }) {
  const isMonthly = kind === "monthly";
  const isAnnual = kind === "annual";

  return (
    <article className={`access-plan-card ${!enabled ? "is-disabled" : ""}`}>
      <header className="access-plan-card__header">
        <div>
          <p className="eyebrow">{isMonthly || isAnnual ? "Assinatura" : "Acesso permanente"}</p>
          <div className="access-plan-card__title-row">
            <h3>{title}</h3>
            {badge && <span>{badge}</span>}
          </div>
        </div>
        <SwitchField checked={enabled} onChange={onEnabledChange} title={enabled ? "Ativo" : "Inativo"} />
      </header>

      <div className="access-plan-card__price">
        <strong>{formatStripePrice(price)}</strong>
        <span>{isMonthly ? "Stripe • cobrança recorrente mensal no cartão" : isAnnual ? "Stripe • cobrança recorrente anual no cartão" : "Stripe • pagamento único"}</span>
      </div>

      {disabledNotice && <p className="access-muted-note">{disabledNotice}</p>}
      {children}

      <AdvancedDisclosure id={`advanced-${kind}`} open={advancedOpen} onToggle={onAdvancedToggle} title="Detalhes da Stripe">
        <label className="field access-field">
          <span>Stripe Price ID</span>
          <input
            value={priceId || ""}
            placeholder="price_..."
            spellCheck="false"
            onChange={(event) => onPriceIdChange(event.target.value)}
          />
        </label>
        <PriceMeta price={price} />
      </AdvancedDisclosure>
    </article>
  );
}

function PaymentCard({ title, provider, statusTone, statusText, description, children }) {
  return (
    <article className="access-payment-card">
      <header>
        <div>
          <h3>{title}</h3>
          <span>{provider}</span>
        </div>
        <StatusPill tone={statusTone} label={statusText} />
      </header>
      <p>{description}</p>
      {children}
    </article>
  );
}

function configuredPriceLabel(entry, period) {
  if (entry?.active === false) return "Inativo";
  const amountCents = inputToAmountCents(entry?.amount);
  if (!amountCents) return "Configuração incompleta";
  return `${formatMoney(amountCents, entry.currency)}${period === "monthly" ? " / mês" : " / ano"}`;
}

function TierPriceEditorModal({ tier, prices, onClose, onSave, saving }) {
  const [draft, setDraft] = useState(() => normalizePlanPriceDraft(prices));
  const [advancedOpen, setAdvancedOpen] = useState({ monthly: false, annual: false });
  const monthlyCardKey = planPriceKey("card", tier.id, "monthly");
  const monthlyPixKey = planPriceKey("pix", tier.id, "monthly");
  const annualCardKey = planPriceKey("card", tier.id, "annual");
  const annualPixKey = planPriceKey("pix", tier.id, "annual");
  const monthly = draft[monthlyCardKey];
  const annualCard = draft[annualCardKey];
  const annualPix = draft[annualPixKey];

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  function updateEntry(key, next) {
    setDraft((current) => ({ ...current, [key]: { ...current[key], ...next } }));
  }

  const payload = useMemo(() => {
    const monthlyPix = {
      ...draft[monthlyPixKey],
      priceId: "",
      amount: monthly.amount,
      currency: monthly.currency,
      active: monthly.active
    };
    return buildPlanPricePayload({
      [monthlyCardKey]: monthly,
      [monthlyPixKey]: monthlyPix,
      [annualCardKey]: annualCard,
      [annualPixKey]: { ...annualPix, priceId: "" }
    });
  }, [annualCard, annualCardKey, annualPix, annualPixKey, draft, monthly, monthlyCardKey, monthlyPixKey]);

  async function handleSave() {
    if (saving) return;
    const saved = await onSave(payload);
    if (saved !== false) onClose();
  }

  return (
    <Modal
      title={`Editar ${tier.label}`}
      subtitle="Configure a disponibilidade e os valores efetivos deste plano."
      onClose={onClose}
      closeDisabled={saving}
      className="modal--tier-price"
      actions={(
        <>
          <button className="button button--ghost" type="button" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="button button--primary" type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : `Salvar ${tier.label}`}
          </button>
        </>
      )}
    >
      <div className="tier-editor">
        <section className="tier-editor__period">
          <div className="tier-editor__period-head">
            <div>
              <span>Mensal</span>
              <strong>{configuredPriceLabel(monthly, "monthly")}</strong>
            </div>
            <SwitchField
              checked={monthly.active}
              onChange={(checked) => updateEntry(monthlyCardKey, { active: checked })}
              title={monthly.active ? "Ativo" : "Inativo"}
            />
          </div>
          <p>O mesmo valor mensal é utilizado no cartão e no Pix. A disponibilidade do Pix também depende da configuração do meio de pagamento.</p>
          <AdvancedDisclosure
            id={`tier-${tier.id}-monthly-stripe`}
            title="Configuração Stripe"
            open={advancedOpen.monthly}
            onToggle={() => setAdvancedOpen((current) => ({ ...current, monthly: !current.monthly }))}
          >
            <label className="field access-field">
              <span>Stripe Price ID mensal</span>
              <input
                value={monthly.priceId || ""}
                placeholder="price_..."
                spellCheck="false"
                onChange={(event) => updateEntry(monthlyCardKey, { priceId: event.target.value })}
              />
              <small>O valor é lido da Stripe ao salvar ou sincronizar.</small>
            </label>
          </AdvancedDisclosure>
        </section>

        <section className="tier-editor__period">
          <div className="tier-editor__period-title">
            <span>Anual</span>
            <p>Cartão e Pix podem ser disponibilizados separadamente.</p>
          </div>

          <div className="tier-editor__method">
            <div className="tier-editor__period-head">
              <div>
                <span>Cartão</span>
                <strong>{configuredPriceLabel(annualCard, "annual")}</strong>
              </div>
              <SwitchField
                checked={annualCard.active}
                onChange={(checked) => updateEntry(annualCardKey, { active: checked })}
                title={annualCard.active ? "Ativo" : "Inativo"}
              />
            </div>
            <p>O valor anual do cartão é controlado pela Stripe.</p>
            <AdvancedDisclosure
              id={`tier-${tier.id}-annual-stripe`}
              title="Configuração Stripe"
              open={advancedOpen.annual}
              onToggle={() => setAdvancedOpen((current) => ({ ...current, annual: !current.annual }))}
            >
              <label className="field access-field">
                <span>Stripe Price ID anual</span>
                <input
                  value={annualCard.priceId || ""}
                  placeholder="price_..."
                  spellCheck="false"
                  onChange={(event) => updateEntry(annualCardKey, { priceId: event.target.value })}
                />
                <small>Precisa ser um preço recorrente anual em BRL.</small>
              </label>
            </AdvancedDisclosure>
          </div>

          <div className="tier-editor__method">
            <div className="tier-editor__period-head">
              <div>
                <span>Pix</span>
                <strong>{configuredPriceLabel(annualPix, "annual")}</strong>
              </div>
              <SwitchField
                checked={annualPix.active}
                onChange={(checked) => updateEntry(annualPixKey, { active: checked })}
                title={annualPix.active ? "Ativo" : "Inativo"}
              />
            </div>
            <label className="field access-field">
              <span>Valor anual no Pix</span>
              <input
                value={annualPix.amount || ""}
                inputMode="decimal"
                placeholder="119,90"
                onChange={(event) => updateEntry(annualPixKey, { amount: event.target.value })}
              />
              <small>Valor manual do Merlin. Não depende de Price ID e não é sobrescrito pela sincronização.</small>
            </label>
          </div>
        </section>
      </div>
    </Modal>
  );
}

function PlanTierPricesEditor({ prices, onSave, saving }) {
  const [editingTier, setEditingTier] = useState(null);
  const draft = useMemo(() => normalizePlanPriceDraft(prices), [prices]);

  return (
    <section className="access-section">
      <div className="access-section__head">
        <div>
          <p className="eyebrow">Bronze, Prata e Ouro</p>
          <h2>Preços por plano</h2>
          <p>Os valores de cartão vêm da Stripe. O Pix anual é definido manualmente no Merlin.</p>
        </div>
      </div>

      <div className="access-tier-summary">
        <div className="access-tier-summary__head" aria-hidden="true">
          <span>Plano</span>
          <span>Mensal</span>
          <span>Anual cartão</span>
          <span>Anual Pix</span>
          <span>Ações</span>
        </div>
        {planTiers.map((tier) => {
          const monthly = draft[planPriceKey("card", tier.id, "monthly")];
          const annualCard = draft[planPriceKey("card", tier.id, "annual")];
          const annualPix = draft[planPriceKey("pix", tier.id, "annual")];
          return (
            <article className="access-tier-summary__row" key={tier.id}>
              <strong data-label="Plano">{tier.label}</strong>
              <span data-label="Mensal">{configuredPriceLabel(monthly, "monthly")}</span>
              <span data-label="Anual cartão">{configuredPriceLabel(annualCard, "annual")}</span>
              <span data-label="Anual Pix">{configuredPriceLabel(annualPix, "annual")}</span>
              <button className="button button--ghost" type="button" onClick={() => setEditingTier(tier)}>
                Editar {tier.label}
              </button>
            </article>
          );
        })}
      </div>
      <p className="access-muted-note access-tier-summary__note">
        O Pix mensal utiliza o mesmo valor do plano mensal. Apenas o Pix anual possui valor configurado separadamente.
      </p>

      {editingTier && (
        <TierPriceEditorModal
          key={editingTier.id}
          tier={editingTier}
          prices={prices}
          onClose={() => setEditingTier(null)}
          onSave={onSave}
          saving={saving}
        />
      )}
    </section>
  );
}

export default function PublicSignupPage({ publicSignup, planPrices = [], onSave, onSavePlanPrices, saving, savingPlanPrices, onRefresh, onRefreshPrices, refreshingPrices }) {
  const isStaging = typeof window !== "undefined" && window.location.hostname.includes("staging");
  const [draft, setDraft] = useState({
    settings: { ...defaultSettings, ...(publicSignup.settings || {}) },
    billing: { ...defaultBilling, ...(publicSignup.billing || {}), ...normalizeBilling(publicSignup.billing || {}) }
  });
  const [advancedOpen, setAdvancedOpen] = useState({ monthly: false, annual: false, lifetime: false, pix: false });

  useEffect(() => {
    setDraft({
      settings: { ...defaultSettings, ...(publicSignup.settings || {}) },
      billing: { ...defaultBilling, ...(publicSignup.billing || {}), ...normalizeBilling(publicSignup.billing || {}) }
    });
  }, [publicSignup.settings, publicSignup.billing]);

  const preview = useMemo(() => buildPreview(draft.settings), [draft.settings]);
  const billing = draft.billing || defaultBilling;
  const originalPayload = useMemo(() => buildSubmitPayload({
    settings: { ...defaultSettings, ...(publicSignup.settings || {}) },
    billing: { ...defaultBilling, ...(publicSignup.billing || {}) }
  }), [publicSignup.settings, publicSignup.billing]);
  const submitPayload = useMemo(() => buildSubmitPayload(draft), [draft]);
  const hasChanges = JSON.stringify(submitPayload) !== JSON.stringify(originalPayload);

  const monthlyPrice = billing.prices?.monthly;
  const annualPrice = billing.prices?.annual;
  const lifetimePrice = billing.prices?.lifetime;
  const pixAnnualPrice = billing.prices?.pixAnnual;
  const pixLifetimePrice = billing.prices?.pixLifetime;
  const tierPriceDraft = useMemo(() => normalizePlanPriceDraft(planPrices), [planPrices]);
  const activeTierCardPrices = useMemo(() => planTiers.flatMap((tier) => planPeriods
    .filter((period) => period.id === "monthly" ? billing.monthlyEnabled : billing.annualEnabled)
    .map((period) => tierPriceDraft[planPriceKey("card", tier.id, period.id)]))
    .filter((price) => price?.active !== false), [billing.annualEnabled, billing.monthlyEnabled, tierPriceDraft]);
  const legacyStripeConfigured = (!billing.monthlyEnabled || priceIsConfigured(monthlyPrice)) && (!billing.annualEnabled || priceIsConfigured(annualPrice)) && (!billing.lifetimeEnabled || priceIsConfigured(lifetimePrice));
  const tierStripeConfigured = activeTierCardPrices.length > 0 && activeTierCardPrices.every((price) => Boolean(price.priceId) && Number(inputToAmountCents(price.amount)) > 0);
  const stripeConfigured = billing.plansEnabled ? tierStripeConfigured : legacyStripeConfigured;
  const stripeNeedsAttention = Boolean(billing.billingEnabled && !stripeConfigured);
  const pixConfiguredLabel = billing.pixEnabled ? "Habilitado" : "Inativo";

  function updateSettings(next) {
    setDraft((current) => ({ ...current, settings: { ...current.settings, ...next } }));
  }

  function updateBilling(next) {
    setDraft((current) => ({ ...current, billing: { ...current.billing, ...next } }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (!hasChanges || saving) return;
    onSave(submitPayload);
  }

  return (
    <section className={`page page--public-access ${hasChanges ? "has-save-bar" : ""}`}>
      <div className="page__header page__header--split access-page-header">
        <div>
          <p className="eyebrow">Acesso público</p>
          <h1>Acesso público</h1>
          <p>Configure como novos usuários podem adquirir e ativar o acesso ao Merlin.</p>
        </div>
        <div className="access-header-actions">
          <button className="button button--ghost" onClick={onRefreshPrices} type="button" disabled={refreshingPrices || saving}>
            {refreshingPrices ? "Sincronizando..." : "Sincronizar preços"}
          </button>
          <button className="button button--ghost" onClick={onRefresh} type="button" disabled={refreshingPrices}>
            Atualizar
          </button>
        </div>
      </div>

      <div className="access-status-row" aria-label="Resumo de status">
        <StatusPill tone={draft.settings.enabled ? "success" : "muted"} label={draft.settings.enabled ? "Página ativa" : "Página inativa"} />
        <StatusPill tone={billing.billingEnabled ? "success" : "muted"} label={billing.billingEnabled ? "Cobrança ativa" : "Cobrança inativa"} />
        <StatusPill tone={billing.plansEnabled ? "success" : "muted"} label={billing.plansEnabled ? "Tiers ativos" : "Tiers inativos"} />
        <StatusPill tone={billing.pixEnabled ? "success" : "muted"} label={billing.pixEnabled ? "Pix ativo" : "Pix inativo"} />
        {stripeNeedsAttention && <StatusPill tone="warning" label="Stripe incompleto" detail="Revise os Price IDs ativos." />}
      </div>

      <form className="access-settings" onSubmit={handleSubmit}>
        <section className="access-section">
          <div className="access-section__head">
            <div>
              <p className="eyebrow">Acesso público</p>
              <h2>Criação de chave pelo site</h2>
            </div>
          </div>

          <div className="access-card access-card--main">
            <SwitchField
              checked={draft.settings.enabled}
              onChange={(checked) => updateSettings({ enabled: checked })}
              title="Permitir criação de chave pelo site"
              description="Permite que novos usuários criem uma chave pela página pública."
            />

            <div className="access-field-grid">
              <label className="field access-field">
                <span>Tipo de acesso sem cobrança</span>
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
                  <option value="lifetime">Vitalício</option>
                </select>
                <small>Define o acesso recebido quando a cobrança pública estiver desativada.</small>
              </label>

              {!draft.settings.isLifetime && (
                <label className="field access-field">
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

            <div className="access-preview">
              <span>Prévia</span>
              <p>{preview}</p>
            </div>
          </div>

          {isStaging && <div className="access-card access-card--main">
            <SwitchField
              checked={billing.stagingEmailDeliveryEnabled}
              onChange={(checked) => updateBilling({ stagingEmailDeliveryEnabled: checked })}
              title="Enviar códigos reais por e-mail"
              description="Somente staging. Desligado usa o código de teste 12345 e não consome a cota do Resend."
            />
          </div>}
        </section>

        <section className="access-section">
          <div className="access-section__head access-section__head--commercial">
            <div>
              <p className="eyebrow">Configuração comercial</p>
              <h2>Planos e cobrança</h2>
              <p>Defina se a página exige pagamento e qual estrutura comercial será utilizada.</p>
            </div>
          </div>

          <div className="access-commercial-grid">
            <div className="access-card">
              <SwitchField
                checked={billing.billingEnabled}
                onChange={(checked) => updateBilling({ billingEnabled: checked })}
                title="Exigir pagamento"
                description="Quando desligado, novos acessos seguem a configuração sem cobrança."
              />
            </div>
            <div className="access-card">
              <SwitchField
                checked={billing.plansEnabled}
                onChange={(checked) => updateBilling({ plansEnabled: checked, lifetimeEnabled: checked ? false : billing.lifetimeEnabled })}
                title="Ativar Bronze, Prata e Ouro"
                description="Quando desligado, novas vendas utilizam o fluxo legado. Licenças existentes não são alteradas."
              />
            </div>
          </div>

          {billing.plansEnabled && (
            <div className="access-card access-card--main">
              <div className="access-period-controls">
                <SwitchField
                  checked={billing.monthlyEnabled}
                  onChange={(checked) => updateBilling({ monthlyEnabled: checked })}
                  title="Planos mensais"
                  description="Disponibiliza o período mensal nos tiers ativos."
                />
                <SwitchField
                  checked={billing.annualEnabled}
                  onChange={(checked) => updateBilling({ annualEnabled: checked })}
                  title="Planos anuais"
                  description="Disponibiliza o período anual nos tiers ativos."
                />
              </div>
            </div>
          )}

          {billing.plansEnabled && (
            <div className="access-card access-card--main">
              <AdvancedDisclosure
                id="advanced-catalog-policy"
                title="Política do catálogo legado"
                open={advancedOpen.catalog}
                onToggle={() => setAdvancedOpen((current) => ({ ...current, catalog: !current.catalog }))}
              >
                <label className="field access-field">
                  <span>Data global de corte do catálogo gratuito</span>
                  <input
                    type="datetime-local"
                    value={billing.premiumCatalogCutoffAt}
                    onChange={(event) => updateBilling({ premiumCatalogCutoffAt: event.target.value })}
                  />
                  <small>Usada somente pelas licenças gratuitas com catálogo restrito. Não é uma configuração por licença.</small>
                </label>
              </AdvancedDisclosure>
            </div>
          )}

          {billing.plansEnabled && (
            <p className="access-muted-note access-muted-note--wide">
              Os campos legados de mensal, anual e vitalício ficam preservados para compatibilidade, mas não são usados em novas vendas enquanto os tiers estiverem ativos.
            </p>
          )}

          {!billing.billingEnabled && (
            <p className="access-muted-note access-muted-note--wide">
              Cobrança pública desativada. Os planos continuam configuráveis, mas novos acessos seguem a regra sem cobrança.
            </p>
          )}

          {!billing.plansEnabled && <div className="access-plan-grid">
            <PlanCard
              kind="monthly"
              title="Mensal"
              badge={billing.monthlyCardTrialEnabled ? `${Math.min(730, Math.max(1, Number(billing.monthlyCardTrialDays) || 30))} dias grátis` : ""}
              enabled={billing.monthlyEnabled}
              onEnabledChange={(checked) => updateBilling({ monthlyEnabled: checked })}
              price={monthlyPrice}
              priceId={billing.monthlyPriceId}
              onPriceIdChange={(value) => updateBilling({ monthlyPriceId: value })}
              disabledNotice={!billing.monthlyEnabled ? "Configurações preservadas enquanto o plano estiver inativo." : ""}
              advancedOpen={advancedOpen.monthly}
              onAdvancedToggle={() => setAdvancedOpen((current) => ({ ...current, monthly: !current.monthly }))}
            >
              <div className="access-plan-card__nested">
                <SwitchField
                  checked={billing.monthlyCardTrialEnabled}
                  disabled={!billing.monthlyEnabled}
                  onChange={(checked) => updateBilling({ monthlyCardTrialEnabled: checked })}
                  title="Primeiro mês grátis"
                  description="Aplica somente a novos acessos mensais pagos por cartão."
                />
                {billing.monthlyCardTrialEnabled && (
                  <label className="field access-field">
                    <span>Dias de teste</span>
                    <input
                      type="number"
                      min="1"
                      max="730"
                      value={billing.monthlyCardTrialDays || 30}
                      disabled={!billing.monthlyEnabled}
                      onChange={(event) => updateBilling({ monthlyCardTrialDays: event.target.value })}
                    />
                  </label>
                )}
              </div>
            </PlanCard>

            <PlanCard
              kind="annual"
              title="Anual"
              enabled={billing.annualEnabled}
              onEnabledChange={(checked) => updateBilling({ annualEnabled: checked })}
              price={annualPrice}
              priceId={billing.annualPriceId}
              onPriceIdChange={(value) => updateBilling({ annualPriceId: value })}
              disabledNotice={!billing.annualEnabled ? "Configurações preservadas enquanto o plano estiver inativo." : ""}
              advancedOpen={advancedOpen.annual}
              onAdvancedToggle={() => setAdvancedOpen((current) => ({ ...current, annual: !current.annual }))}
            />

            <PlanCard
              kind="lifetime"
              title="Vitalício"
              enabled={billing.lifetimeEnabled}
              onEnabledChange={(checked) => updateBilling({ lifetimeEnabled: checked })}
              price={lifetimePrice}
              priceId={billing.lifetimePriceId}
              onPriceIdChange={(value) => updateBilling({ lifetimePriceId: value })}
              disabledNotice={!billing.lifetimeEnabled ? "Configurações preservadas enquanto o plano estiver inativo." : ""}
              advancedOpen={advancedOpen.lifetime}
              onAdvancedToggle={() => setAdvancedOpen((current) => ({ ...current, lifetime: !current.lifetime }))}
            />
          </div>}
        </section>

        {billing.plansEnabled && <PlanTierPricesEditor
          prices={planPrices}
          onSave={onSavePlanPrices}
          saving={savingPlanPrices}
        />}

        <section className="access-section">
          <div className="access-section__head">
            <div>
              <p className="eyebrow">Formas de pagamento</p>
              <h2>Cartão e Pix</h2>
            </div>
          </div>

          <div className="access-payment-grid">
            <PaymentCard
              title="Cartão"
              provider="Stripe"
              statusTone={stripeConfigured ? "success" : "warning"}
              statusText={stripeConfigured ? "Configurado" : "Configuração incompleta"}
              description="Renovação automática disponível nos acessos mensal e anual."
            >
              {billing.plansEnabled && billing.monthlyEnabled && (
                <div className="access-payment-options">
                  <SwitchField
                    checked={billing.monthlyCardTrialEnabled}
                    onChange={(checked) => updateBilling({ monthlyCardTrialEnabled: checked })}
                    title="Período de teste no cartão"
                    description="Aplica somente a novos acessos mensais pagos por cartão."
                  />
                  {billing.monthlyCardTrialEnabled && (
                    <label className="field access-field">
                      <span>Dias de teste</span>
                      <input
                        type="number"
                        min="1"
                        max="730"
                        value={billing.monthlyCardTrialDays || 30}
                        onChange={(event) => updateBilling({ monthlyCardTrialDays: event.target.value })}
                      />
                    </label>
                  )}
                </div>
              )}
            </PaymentCard>

            <PaymentCard
              title="Pix"
              provider="Mercado Pago"
              statusTone={billing.pixEnabled ? "success" : "muted"}
              statusText={pixConfiguredLabel}
              description="Permite pagamentos via Pix quando a integração estiver disponível."
            >
              <div className="access-payment-options">
                <SwitchField
                  checked={billing.pixEnabled}
                  onChange={(checked) => updateBilling({ pixEnabled: checked })}
                  title="Aceitar Pix no cadastro público"
                  description="Habilita a forma de pagamento Pix na página pública quando o ambiente permitir."
                />
                <SwitchField
                  checked={billing.pixMonthlyEnabled}
                  disabled={!billing.pixEnabled}
                  onChange={(checked) => updateBilling({ pixMonthlyEnabled: checked })}
                  title="Pix mensal"
                  description="Acesso avulso por 30 dias, sem renovação automática."
                />
                <SwitchField
                  checked={billing.pixAnnualEnabled}
                  disabled={!billing.pixEnabled}
                  onChange={(checked) => updateBilling({ pixAnnualEnabled: checked })}
                  title="Pix anual"
                  description="Pagamento único via Pix, com renovação manual após 1 ano."
                />
                {!billing.plansEnabled && <SwitchField
                  checked={billing.pixLifetimeEnabled}
                  disabled={!billing.pixEnabled}
                  onChange={(checked) => updateBilling({ pixLifetimeEnabled: checked })}
                  title="Pix vitalício"
                  description="Pagamento único via Pix, sem recorrência."
                />}
              </div>

              {!billing.plansEnabled && <AdvancedDisclosure
                id="advanced-pix"
                open={advancedOpen.pix}
                onToggle={() => setAdvancedOpen((current) => ({ ...current, pix: !current.pix }))}
                title="Detalhes do Pix"
              >
                <label className="field access-field">
                  <span>Stripe Price ID do Pix anual</span>
                  <input
                    value={billing.pixAnnualPriceId || ""}
                    placeholder="price_... (opcional)"
                    spellCheck="false"
                    onChange={(event) => updateBilling({ pixAnnualPriceId: event.target.value })}
                  />
                  <small>Quando preenchido, o Pix anual usa este valor. Se ficar vazio, usa o preço anual do cartão.</small>
                </label>
                <PriceMeta price={pixAnnualPrice || annualPrice} />
                <label className="field access-field">
                  <span>Stripe Price ID do Pix vitalício</span>
                  <input
                    value={billing.pixLifetimePriceId || ""}
                    placeholder="price_... (opcional)"
                    spellCheck="false"
                    onChange={(event) => updateBilling({ pixLifetimePriceId: event.target.value })}
                  />
                  <small>Quando preenchido, o Pix vitalício usa este valor. Se ficar vazio, usa o preço vitalício do cartão.</small>
                </label>
                <PriceMeta price={pixLifetimePrice || lifetimePrice} />
                <p className="access-technical-note">
                  Pix disponível somente quando a integração com Mercado Pago estiver configurada no ambiente do Worker. Credenciais e tokens continuam apenas nos secrets da Cloudflare.
                </p>
              </AdvancedDisclosure>}
              {billing.plansEnabled && (
                <p className="access-technical-note">
                  Nos tiers, o Pix mensal acompanha o valor mensal do cartão. O valor anual do Pix é configurado dentro de cada plano.
                </p>
              )}
            </PaymentCard>
          </div>
        </section>

        {hasChanges && (
          <div className="access-save-bar" role="status" aria-live="polite">
            <div>
              <strong>Alterações não salvas</strong>
              <span>Revise e salve para aplicar no site público.</span>
            </div>
            <button className="button button--primary" type="submit" disabled={saving}>
              {saving ? "Salvando..." : "Salvar alterações"}
            </button>
          </div>
        )}
      </form>
    </section>
  );
}
