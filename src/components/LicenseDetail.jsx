import React from "react";
import CopyIcon from "./CopyIcon";
import DetailField from "./DetailField";
import { formatActivationUsage, formatContact, formatDate, formatDateTime, getAccessType, getBillingStatus, getLicenseContact, getLicenseContactType, getLicenseType, getRevokedOriginLabel, getSourceLabel, getStatus, initials, maskTechnicalValue } from "../lib/admin-ui";

export default function LicenseDetail({ license, premiumCycleSummary, expirationReminderEligibility, onCopy, onEdit, onEditTest, onResetTestUsage, onManagePremiumCycle, onRenew, onReset, onClearHwidResetLimit, onRevoke, onReactivate, onSendWelcomeEmail, onSendExpirationReminder, onClose, mobile }) {
  if (!license) {
    return (
      <div className="detail-empty">
        <h3>Nenhuma licença selecionada</h3>
        <p>Escolha uma licença na lista para ver os detalhes.</p>
      </div>
    );
  }

  const status = getStatus(license);
  const billingStatus = getBillingStatus(license);
  const contact = getLicenseContact(license);
  const contactType = getLicenseContactType(license);
  const licenseType = getLicenseType(license);
  const sourceLabel = getSourceLabel(license.source);
  const hasBilling = billingStatus.key !== "none" || license.stripeCustomerId || license.stripeSubscriptionId || license.stripeCheckoutSessionId;
  const isStripeSubscription = Boolean(license.stripeCustomerId || license.stripeSubscriptionId);
  const renewalLabel = isStripeSubscription
    ? (license.billingCancelAtPeriodEnd ? "Cancelada ao fim do período" : "Automática")
    : (hasBilling ? "Manual via Pix" : "--");
  const tierLabel = ({ bronze: "Bronze", prata: "Prata", ouro: "Ouro" })[license.planTier] || "Ouro";

  return (
    <div className={`detail ${mobile ? "detail--mobile" : ""}`}>
      {mobile && (
        <div className="detail__mobile-header">
          <button className="icon-button" onClick={onClose} aria-label="Voltar">
            {"<"}
          </button>
          <div className="detail__grabber"></div>
        </div>
      )}

      <div className="section-heading section-heading--detail">
        <div>
          <p className="eyebrow">Detalhes da licença</p>
          <h2>{license.name}</h2>
        </div>
      </div>

      <div className="detail__profile">
        <span className="avatar avatar--large">{initials(license.name)}</span>
        <div>
          <strong>{license.name}</strong>
          <div className="status-stack status-stack--inline">
            <span className={`badge badge--${status.tone}`}>{status.label}</span>
            {billingStatus.key !== "none" && (
              <span className={`badge badge--${billingStatus.tone}`}>{billingStatus.label}</span>
            )}
          </div>
        </div>
      </div>

      <div className="detail__grid">
        <DetailField label="Licença" value={`#${license.id}`} />
        <DetailField label="Status" value={status.label} />
        {licenseType === "test" ? (
          <>
            <DetailField label="Tipo" value="Teste" />
            <DetailField label="Ativações normais" value={formatActivationUsage(license.normalActivationUsed, license.normalActivationLimit)} />
            <DetailField label="Ativações premium" value={formatActivationUsage(license.premiumActivationUsed, license.premiumActivationLimit)} />
          </>
        ) : (
          <>
            <DetailField label="Vencimento" value={formatDate(license.expiresAt)} />
            <DetailField label="Contato" value={formatContact(contact, contactType)} />
            <DetailField label="Recuperacao" value={license.hasRecoveryPin ? "Senha configurada" : "Sem senha"} />
          </>
        )}
        <DetailField label="Origem" value={sourceLabel} />
        {licenseType !== "test" && <DetailField label="Tier" value={tierLabel} />}
        <DetailField label="Plano" value={getAccessType(license)} />
        {licenseType !== "test" && <DetailField label="Cobrança" value={billingStatus.label} />}
        {hasBilling && <DetailField label="Fim do período" value={license.billingCurrentPeriodEnd ? formatDate(license.billingCurrentPeriodEnd) : "--"} />}
        {hasBilling && <DetailField label="Renovação" value={renewalLabel} />}
        <DetailField label="Criada em" value={formatDateTime(license.createdAt)} />
        <DetailField label="Atualizada em" value={formatDateTime(license.updatedAt)} />
        {licenseType !== "test" && (
          <DetailField
            label="Dispositivo / HWID"
            value={license.hwid ? maskTechnicalValue(license.hwid, 12, 4) : "Sem dispositivo vinculado"}
            wide
            valueClassName="truncate-text"
            title={license.hwid || "Sem dispositivo vinculado"}
          />
        )}
        {licenseType !== "test" && license.planTier === "bronze" && premiumCycleSummary && (
          <DetailField
            label="Ativações premium neste ciclo"
            value={`${premiumCycleSummary.used} usadas de ${premiumCycleSummary.totalLimit} · ${premiumCycleSummary.available} disponíveis`}
            wide
          />
        )}
        {licenseType !== "test" && (
          <DetailField
            label="Reset mensal de dispositivo"
            value={license.hwidResetAt ? `Usado em ${formatDateTime(license.hwidResetAt)}` : "Disponível"}
            wide
          />
        )}

        <div className="detail-field detail-field--wide">
          <span>Chave da licença</span>
          <div className="detail-copy">
            <strong className="truncate-text" title={license.licenseKey}>
              {license.licenseKey}
            </strong>
            <button className="icon-button" onClick={onCopy} aria-label="Copiar chave">
              <CopyIcon />
            </button>
          </div>
        </div>

        {license.status === "revoked" && <DetailField label="Origem da revogação" value={getRevokedOriginLabel(license.revokedOrigin)} />}
        {license.revokedEventId && <DetailField label="Evento da revogação" value={maskTechnicalValue(license.revokedEventId, 10, 4)} title={license.revokedEventId} />}
        {license.revokedReason && <DetailField label="Motivo da revogação" value={license.revokedReason} wide />}
        {hasBilling && (
          <>
            <DetailField
              label="Stripe customer"
              value={license.stripeCustomerId ? maskTechnicalValue(license.stripeCustomerId, 10, 4) : "--"}
              title={license.stripeCustomerId || "--"}
            />
            <DetailField
              label="Stripe assinatura"
              value={license.stripeSubscriptionId ? maskTechnicalValue(license.stripeSubscriptionId, 10, 4) : "--"}
              title={license.stripeSubscriptionId || "--"}
            />
          </>
        )}
      </div>

      <div className="detail__actions">
        {licenseType === "test" ? (
          <>
            <button className="button button--primary" onClick={onEditTest}>
              Editar limites
            </button>
            <button className="button button--ghost" onClick={onResetTestUsage}>
              Resetar uso
            </button>
          </>
        ) : (
          <button className="button button--primary" onClick={onEdit}>
            Atualizar licença
          </button>
        )}
        {license.status === "revoked" ? (
          <button className="button button--ghost" onClick={onReactivate}>
            Reativar licença
          </button>
        ) : licenseType !== "test" ? (
          <button className="button button--ghost" onClick={onRenew}>
            Renovar licença
          </button>
        ) : null}
        {licenseType !== "test" && (
          <button className="button button--ghost" onClick={onReset} disabled={!license.hwid}>
            Redefinir dispositivo
          </button>
        )}
        {licenseType !== "test" && license.planTier === "bronze" && (
          <button className="button button--ghost" onClick={onManagePremiumCycle}>
            Gerenciar ativações premium
          </button>
        )}
        {licenseType !== "test" && license.hwidResetAt && (
          <button className="button button--ghost" onClick={onClearHwidResetLimit}>
            Liberar reset mensal
          </button>
        )}
        {licenseType !== "test" && contactType === "email" && (
          <button className="button button--ghost" onClick={onSendWelcomeEmail}>
            Reenviar boas-vindas
          </button>
        )}
        {expirationReminderEligibility?.eligible && (
          <button className="button button--ghost" onClick={onSendExpirationReminder}>
            Enviar aviso de vencimento
          </button>
        )}
        <button className="button button--danger button--soft" onClick={onRevoke}>
          Revogar licença
        </button>
      </div>
    </div>
  );
}
