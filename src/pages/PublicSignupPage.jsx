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
  pixEnabled: false,
  pixMonthlyEnabled: true,
  pixLifetimeEnabled: true,
  monthlyCardTrialEnabled: false,
  monthlyCardTrialDays: 30,
  monthlyPriceId: "",
  lifetimePriceId: "",
  prices: { monthly: null, lifetime: null }
};

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

function formatStripePrice(price) {
  if (!price) {
    return "Preço não sincronizado";
  }

  const value = formatMoney(price.amountCents, price.currency);
  return price.recurringInterval === "month" ? `${value} / mês` : value;
}

function normalizeBilling(billing = {}) {
  return {
    billingEnabled: Boolean(billing.billingEnabled),
    monthlyEnabled: Boolean(billing.monthlyEnabled),
    lifetimeEnabled: Boolean(billing.lifetimeEnabled),
    pixEnabled: Boolean(billing.pixEnabled),
    pixMonthlyEnabled: Boolean(billing.pixMonthlyEnabled),
    pixLifetimeEnabled: Boolean(billing.pixLifetimeEnabled),
    monthlyCardTrialEnabled: Boolean(billing.monthlyCardTrialEnabled),
    monthlyCardTrialDays: Math.min(730, Math.max(1, Number(billing.monthlyCardTrialDays) || 30)),
    monthlyPriceId: billing.monthlyPriceId || "",
    lifetimePriceId: billing.lifetimePriceId || ""
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
  return {
    ...normalizeSettings(draft.settings),
    billing: normalizeBilling(draft.billing)
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

  return (
    <article className={`access-plan-card ${!enabled ? "is-disabled" : ""}`}>
      <header className="access-plan-card__header">
        <div>
          <p className="eyebrow">{isMonthly ? "Assinatura" : "Acesso permanente"}</p>
          <div className="access-plan-card__title-row">
            <h3>{title}</h3>
            {badge && <span>{badge}</span>}
          </div>
        </div>
        <SwitchField checked={enabled} onChange={onEnabledChange} title={enabled ? "Ativo" : "Inativo"} />
      </header>

      <div className="access-plan-card__price">
        <strong>{formatStripePrice(price)}</strong>
        <span>{isMonthly ? "Stripe • cobrança recorrente mensal no cartão" : "Stripe • pagamento único"}</span>
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

export default function PublicSignupPage({ publicSignup, onSave, saving, onRefresh }) {
  const [draft, setDraft] = useState({
    settings: { ...defaultSettings, ...(publicSignup.settings || {}) },
    billing: { ...defaultBilling, ...(publicSignup.billing || {}) }
  });
  const [advancedOpen, setAdvancedOpen] = useState({ monthly: false, lifetime: false, pix: false });

  useEffect(() => {
    setDraft({
      settings: { ...defaultSettings, ...(publicSignup.settings || {}) },
      billing: { ...defaultBilling, ...(publicSignup.billing || {}) }
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
  const lifetimePrice = billing.prices?.lifetime;
  const stripeConfigured = (!billing.monthlyEnabled || priceIsConfigured(monthlyPrice)) && (!billing.lifetimeEnabled || priceIsConfigured(lifetimePrice));
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
        <button className="button button--ghost" onClick={onRefresh} type="button">
          Atualizar
        </button>
      </div>

      <div className="access-status-row" aria-label="Resumo de status">
        <StatusPill tone={draft.settings.enabled ? "success" : "muted"} label={draft.settings.enabled ? "Página ativa" : "Página inativa"} />
        <StatusPill tone={billing.billingEnabled ? "success" : "muted"} label={billing.billingEnabled ? "Cobrança ativa" : "Cobrança inativa"} />
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
        </section>

        <section className="access-section">
          <div className="access-section__head">
            <div>
              <p className="eyebrow">Planos</p>
              <h2>Planos disponíveis</h2>
              <p>Defina quais formas de acesso podem ser adquiridas pela página pública.</p>
            </div>
            <SwitchField
              checked={billing.billingEnabled}
              onChange={(checked) => updateBilling({ billingEnabled: checked })}
              title="Exigir pagamento"
              description="Exige pagamento antes da criação da chave."
            />
          </div>

          {!billing.billingEnabled && (
            <p className="access-muted-note access-muted-note--wide">
              Cobrança pública desativada. Os planos continuam configuráveis, mas novos acessos seguem a regra sem cobrança.
            </p>
          )}

          <div className="access-plan-grid">
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
          </div>
        </section>

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
              description="Renovação automática disponível no acesso mensal."
            />

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
                  checked={billing.pixLifetimeEnabled}
                  disabled={!billing.pixEnabled}
                  onChange={(checked) => updateBilling({ pixLifetimeEnabled: checked })}
                  title="Pix vitalício"
                  description="Pagamento único via Pix, sem recorrência."
                />
              </div>

              <AdvancedDisclosure
                id="advanced-pix"
                open={advancedOpen.pix}
                onToggle={() => setAdvancedOpen((current) => ({ ...current, pix: !current.pix }))}
                title="Ver detalhes técnicos"
              >
                <p className="access-technical-note">
                  Pix disponível somente quando a integração com Mercado Pago estiver configurada no ambiente do Worker. Credenciais e tokens continuam apenas nos secrets da Cloudflare.
                </p>
              </AdvancedDisclosure>
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
