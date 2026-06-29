import React from "react";
import CopyIcon from "./CopyIcon";
import DetailField from "./DetailField";
import { formatBrazilPhone, formatDate, formatDateTime, getStatus, initials, maskTechnicalValue } from "../lib/admin-ui";

export default function LicenseDetail({ license, onCopy, onEdit, onRenew, onReset, onRevoke, onReactivate, onClose, mobile }) {
  if (!license) {
    return (
      <div className="detail-empty">
        <h3>Nenhuma licença selecionada</h3>
        <p>Escolha uma licença na lista para ver os detalhes.</p>
      </div>
    );
  }

  const status = getStatus(license);

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
          <span className={`badge badge--${status.tone}`}>{status.label}</span>
        </div>
      </div>

      <div className="detail__grid">
        <DetailField label="Licença" value={`#${license.id}`} />
        <DetailField label="Status" value={status.label} />
        <DetailField label="Vencimento" value={formatDate(license.expiresAt)} />
        <DetailField label="Telefone" value={formatBrazilPhone(license.phone)} />
        <DetailField label="Criada em" value={formatDateTime(license.createdAt)} />
        <DetailField label="Atualizada em" value={formatDateTime(license.updatedAt)} />
        <DetailField
          label="Dispositivo / HWID"
          value={license.hwid ? maskTechnicalValue(license.hwid, 12, 4) : "Sem dispositivo vinculado"}
          wide
          valueClassName="truncate-text"
          title={license.hwid || "Sem dispositivo vinculado"}
        />

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

        {license.revokedReason && <DetailField label="Motivo da revogação" value={license.revokedReason} wide />}
      </div>

      <div className="detail__actions">
        <button className="button button--primary" onClick={onEdit}>
          Atualizar licença
        </button>
        {license.status === "revoked" ? (
          <button className="button button--ghost" onClick={onReactivate}>
            Reativar licença
          </button>
        ) : (
          <button className="button button--ghost" onClick={onRenew}>
            Renovar licença
          </button>
        )}
        <button className="button button--ghost" onClick={onReset} disabled={!license.hwid}>
          Redefinir dispositivo
        </button>
        <button className="button button--danger button--soft" onClick={onRevoke}>
          Revogar licença
        </button>
      </div>
    </div>
  );
}
