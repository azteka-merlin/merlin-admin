import React, { useEffect, useMemo, useState } from "react";
import { formatDateTime } from "../lib/admin-ui";

const unitLabels = {
  days: "Dias",
  weeks: "Semanas",
  months: "Meses",
  years: "Anos"
};

function buildPreview(settings) {
  if (settings.isLifetime) {
    return "Novas chaves criadas pelo site serão vitalícias.";
  }

  const amount = Number(settings.durationAmount) || 1;
  const unit = unitLabels[settings.durationUnit] || "Dias";
  return `Novas chaves criadas pelo site vencerão em ${amount} ${unit.toLowerCase()}.`;
}

export default function PublicSignupPage({ publicSignup, onSave, saving, onRefresh }) {
  const [draft, setDraft] = useState(publicSignup.settings);

  useEffect(() => {
    setDraft(publicSignup.settings);
  }, [publicSignup.settings]);

  const preview = useMemo(() => buildPreview(draft), [draft]);
  const metrics = publicSignup.metrics || {};

  function handleSubmit(event) {
    event.preventDefault();
    onSave({
      enabled: Boolean(draft.enabled),
      durationAmount: Number(draft.durationAmount) || 1,
      durationUnit: draft.durationUnit || "days",
      isLifetime: Boolean(draft.isLifetime)
    });
  }

  return (
    <section className="page">
      <div className="page__header page__header--split">
        <div>
          <p className="eyebrow">Cadastro público</p>
          <h1>Configure a criação de chaves pela página pública do Merlin.</h1>
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
              <h2>Criação de chave pelo site</h2>
            </div>
          </div>

          <form className="settings-form" onSubmit={handleSubmit}>
            <label className="toggle-field">
              <input
                type="checkbox"
                checked={Boolean(draft.enabled)}
                onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))}
              />
              <div>
                <strong>Permitir criação de chave pelo site</strong>
                <span>Quando ativado, visitantes poderão criar uma chave de acesso pela página pública.</span>
              </div>
            </label>

            <div className="field-grid">
              <label className="field">
                <span>Unidade</span>
                <select
                  value={draft.isLifetime ? "lifetime" : draft.durationUnit}
                  onChange={(event) => {
                    const value = event.target.value;
                    setDraft((current) => ({
                      ...current,
                      isLifetime: value === "lifetime",
                      durationUnit: value === "lifetime" ? current.durationUnit || "days" : value
                    }));
                  }}
                >
                  <option value="days">Dias</option>
                  <option value="weeks">Semanas</option>
                  <option value="months">Meses</option>
                  <option value="years">Anos</option>
                  <option value="lifetime">Vitalício</option>
                </select>
              </label>

              {!draft.isLifetime && (
                <label className="field">
                  <span>Validade</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={draft.durationAmount ?? ""}
                    onChange={(event) => setDraft((current) => ({ ...current, durationAmount: event.target.value }))}
                  />
                </label>
              )}
            </div>

            <div className="notice-card">
              <strong>Prévia</strong>
              <p>{preview}</p>
            </div>

            <div className="form-actions">
              <button className="button button--primary" type="submit" disabled={saving}>
                {saving ? "Salvando..." : "Salvar configurações"}
              </button>
            </div>
          </form>
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Métricas</p>
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
              <span>Última chave</span>
              <strong>{metrics.latestCreatedAt ? formatDateTime(metrics.latestCreatedAt) : "--"}</strong>
            </article>
          </div>
        </section>
      </div>
    </section>
  );
}
