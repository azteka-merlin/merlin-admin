import React from "react";
import Modal from "./Modal";
import { formatBrazilPhoneInput } from "../lib/admin-ui";

function formatProgressBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / (1024 ** index);
  return `${amount >= 100 || index === 0 ? Math.round(amount) : amount.toFixed(1)} ${units[index]}`;
}

export default function LicenseModals({
  activeModal,
  setActiveModal,
  formState,
  setFormState,
  selectedLicense,
  handleCreateLicense,
  handleUpdateLicense,
  handleRenewLicense,
  handleReactivateLicense,
  handleResetHwid,
  handleRevokeLicense,
  handleSaveOverride,
  handleOverrideFileUpload,
  handleOverrideFileDownload,
  handleDeleteOverride,
  handleCancelOverrideUpload,
  overrideDeleteTarget,
  busyAction,
  overrideUploadProgress
}) {
  const createBusy = busyAction === "create-license";
  const updateBusy = busyAction === "update-license";
  const renewBusy = busyAction === "renew-license";
  const reactivateBusy = busyAction === "reactivate-license";
  const resetBusy = busyAction === "reset-hwid";
  const revokeBusy = busyAction === "revoke-license";
  const saveOverrideBusy = busyAction === "save-override";
  const uploadManifestBusy = busyAction === "upload-override-manifest";
  const uploadFixBusy = busyAction === "upload-override-fix";
  const overrideUploadBusy = uploadManifestBusy || uploadFixBusy;
  const deleteOverrideBusy = busyAction === "delete-override";
  const manifestCurrentFile = String(formState.overrideManifestFile || "").split("/").filter(Boolean).pop() || "";
  const fixCurrentFile = String(formState.overrideFixFile || "").split("/").filter(Boolean).pop() || "";
  const manifestUploadProgress = overrideUploadProgress?.kind === "manifest" ? overrideUploadProgress : null;
  const fixUploadProgress = overrideUploadProgress?.kind === "fix" ? overrideUploadProgress : null;
  const closeOverrideModal = async () => {
    if (overrideUploadBusy) {
      await handleCancelOverrideUpload();
    }
    setActiveModal(null);
  };

  return (
    <>
      {activeModal === "create" && (
        <Modal
          title="Nova licença"
          subtitle="Cadastre o usuário, telefone e validade. A chave será gerada automaticamente."
          onClose={() => setActiveModal(null)}
          closeDisabled={createBusy}
          actions={
            <>
              <button className="button button--ghost" onClick={() => setActiveModal(null)} disabled={createBusy}>
                Cancelar
              </button>
              <button type="submit" form="create-license-form" className="button button--primary" disabled={createBusy}>
                {createBusy ? "Criando..." : "Criar licença"}
              </button>
            </>
          }
        >
          <form id="create-license-form" className="form-panel create-modal-form" onSubmit={handleCreateLicense}>
            <label className="field">
              <span>Nome do usuário</span>
              <input
                value={formState.createName}
                onChange={(event) => setFormState((current) => ({ ...current, createName: event.target.value }))}
                placeholder="Digite o nome do usuário"
                autoFocus
              />
            </label>

            <label className="field">
              <span>Telefone</span>
              <input
                value={formState.createPhone}
                onChange={(event) => setFormState((current) => ({ ...current, createPhone: formatBrazilPhoneInput(event.target.value) }))}
                placeholder="(11) 99999-9999"
                inputMode="numeric"
              />
            </label>

            <label className="field">
              <span>Data de vencimento</span>
              <input
                className="date-input"
                type="date"
                value={formState.createExpiry}
                onChange={(event) => setFormState((current) => ({ ...current, createExpiry: event.target.value }))}
              />
            </label>
          </form>
        </Modal>
      )}

      {activeModal === "edit" && selectedLicense && (
        <Modal
          title="Atualizar licença"
          subtitle="Edite nome, telefone, vencimento e HWID. ID e chave permanecem fixos."
          onClose={() => setActiveModal(null)}
          closeDisabled={updateBusy}
          actions={
            <>
              <button className="button button--ghost" onClick={() => setActiveModal(null)} disabled={updateBusy}>
                Cancelar
              </button>
              <button className="button button--primary" onClick={handleUpdateLicense} disabled={updateBusy}>
                {updateBusy ? "Salvando..." : "Salvar alterações"}
              </button>
            </>
          }
        >
          <div className="field-grid">
            <label className="field">
              <span>Nome</span>
              <input value={formState.editName} onChange={(event) => setFormState((current) => ({ ...current, editName: event.target.value }))} />
            </label>
            <label className="field">
              <span>Telefone</span>
              <input value={formState.editPhone} onChange={(event) => setFormState((current) => ({ ...current, editPhone: formatBrazilPhoneInput(event.target.value) }))} inputMode="numeric" />
            </label>
            <label className="field">
              <span>Data de vencimento</span>
              <input className="date-input" type="date" value={formState.editExpiry} onChange={(event) => setFormState((current) => ({ ...current, editExpiry: event.target.value }))} />
            </label>
            <label className="field">
              <span>HWID</span>
              <input value={formState.editHwid} onChange={(event) => setFormState((current) => ({ ...current, editHwid: event.target.value }))} placeholder="Sem dispositivo vinculado" />
            </label>
            <label className="field">
              <span>Chave da licença</span>
              <input value={selectedLicense.licenseKey} readOnly />
            </label>
            <label className="field">
              <span>ID da licença</span>
              <input value={selectedLicense.id} readOnly />
            </label>
          </div>
        </Modal>
      )}

      {activeModal === "renew" && selectedLicense && (
        <Modal
          title="Renovar licença"
          subtitle={`Defina a nova data de expiração para ${selectedLicense.name}.`}
          onClose={() => setActiveModal(null)}
          closeDisabled={renewBusy}
          actions={
            <>
              <button className="button button--ghost" onClick={() => setActiveModal(null)} disabled={renewBusy}>
                Cancelar
              </button>
              <button className="button button--primary" onClick={handleRenewLicense} disabled={renewBusy}>
                {renewBusy ? "Renovando..." : "Renovar licença"}
              </button>
            </>
          }
        >
          <label className="field">
            <span>Nova data de expiração</span>
            <input className="date-input" type="date" value={formState.renewExpiry} onChange={(event) => setFormState((current) => ({ ...current, renewExpiry: event.target.value }))} />
          </label>
        </Modal>
      )}

      {activeModal === "reactivate" && selectedLicense && (
        <Modal
          title="Reativar licença"
          subtitle={`A licença de ${selectedLicense.name} voltará a ficar ativa imediatamente.`}
          onClose={() => setActiveModal(null)}
          closeDisabled={reactivateBusy}
          actions={
            <>
              <button className="button button--ghost" onClick={() => setActiveModal(null)} disabled={reactivateBusy}>
                Cancelar
              </button>
              <button className="button button--primary" onClick={handleReactivateLicense} disabled={reactivateBusy}>
                {reactivateBusy ? "Reativando..." : "Reativar licença"}
              </button>
            </>
          }
        >
          <p className="plain-copy">O motivo de revogação anterior será limpo e a licença poderá ser usada novamente.</p>
        </Modal>
      )}

      {activeModal === "reset" && selectedLicense && (
        <Modal
          title="Redefinir dispositivo"
          subtitle={`O vínculo de dispositivo de ${selectedLicense.name} será removido.`}
          onClose={() => setActiveModal(null)}
          closeDisabled={resetBusy}
          actions={
            <>
              <button className="button button--ghost" onClick={() => setActiveModal(null)} disabled={resetBusy}>
                Cancelar
              </button>
              <button className="button button--primary" onClick={handleResetHwid} disabled={resetBusy}>
                {resetBusy ? "Redefinindo..." : "Redefinir dispositivo"}
              </button>
            </>
          }
        >
          <p className="plain-copy">Na próxima ativação, um novo dispositivo poderá ser vinculado.</p>
        </Modal>
      )}

      {activeModal === "revoke" && selectedLicense && (
        <Modal
          title="Revogar licença"
          subtitle={`Essa ação bloqueará o uso da licença de ${selectedLicense.name}.`}
          onClose={() => setActiveModal(null)}
          closeDisabled={revokeBusy}
          actions={
            <>
              <button className="button button--ghost" onClick={() => setActiveModal(null)} disabled={revokeBusy}>
                Cancelar
              </button>
              <button className="button button--danger" onClick={handleRevokeLicense} disabled={revokeBusy}>
                {revokeBusy ? "Revogando..." : "Revogar licença"}
              </button>
            </>
          }
        >
          <label className="field">
            <span>Motivo da revogação</span>
            <textarea
              rows="4"
              value={formState.revokeReason}
              onChange={(event) => setFormState((current) => ({ ...current, revokeReason: event.target.value }))}
              placeholder="Ex.: Chargeback"
            />
          </label>
        </Modal>
      )}

      {activeModal === "override-upsert" && (
        <Modal
          title={formState.overrideMode === "edit" ? "Editar override" : "Novo override"}
          subtitle="Configure manifest e fix customizados para um appId específico."
          onClose={closeOverrideModal}
          closeConfirmMessage={overrideUploadBusy ? "O upload ainda esta em andamento. Deseja cancelar o envio e fechar esta janela?" : ""}
          closeDisabled={saveOverrideBusy}
          actions={
            <>
              <button className="button button--ghost" onClick={closeOverrideModal} disabled={saveOverrideBusy}>
                Cancelar
              </button>
              <button className="button button--primary" onClick={handleSaveOverride} disabled={saveOverrideBusy || overrideUploadBusy}>
                {saveOverrideBusy ? "Salvando..." : "Salvar override"}
              </button>
            </>
          }
        >
          <div className="override-form">
            <label className="field">
              <span>App ID</span>
              <input
                value={formState.overrideAppId}
                onChange={(event) => setFormState((current) => ({ ...current, overrideAppId: event.target.value }))}
                placeholder="730"
                readOnly={formState.overrideMode === "edit"}
              />
            </label>

            <label className="field">
              <span>Game name</span>
              <input
                value={formState.overrideName}
                onChange={(event) => setFormState((current) => ({ ...current, overrideName: event.target.value }))}
                placeholder="Counter-Strike 2"
              />
            </label>

            <label className="field">
              <span>Admin note</span>
              <textarea
                value={formState.overrideAdminNote}
                onChange={(event) => setFormState((current) => ({ ...current, overrideAdminNote: event.target.value }))}
                placeholder="Visible note for Merlin users on the corrections card."
                rows={3}
              />
            </label>

            <div className="toggle-grid">
              <label className="toggle-field">
                <input
                  type="checkbox"
                  checked={formState.overrideManifestEnabled}
                  onChange={(event) => setFormState((current) => ({ ...current, overrideManifestEnabled: event.target.checked }))}
                />
                <div>
                  <strong>Manifest override</strong>
                  <span>Usar um pacote de manifests específico.</span>
                </div>
              </label>

              <label className="toggle-field">
                <input
                  type="checkbox"
                  checked={formState.overrideFixEnabled}
                  onChange={(event) => setFormState((current) => ({ ...current, overrideFixEnabled: event.target.checked }))}
                />
                <div>
                  <strong>Fix override</strong>
                  <span>Substituir o download padrão do fix.</span>
                </div>
              </label>
            </div>

            {formState.overrideManifestEnabled && (
              <>
                <label className="field">
                  <span>Manifest file</span>
                  <input
                    value={formState.overrideManifestFile}
                    onChange={(event) => setFormState((current) => ({ ...current, overrideManifestFile: event.target.value }))}
                    placeholder="730/manifests/arquivo.zip"
                  />
                </label>

                <div className={`override-upload-card ${manifestCurrentFile ? "is-ready" : "is-empty"}`}>
                  <div className="override-upload-card__top">
                    <div className="override-upload-card__copy">
                      <span className="override-upload-card__label">Manifest package (.zip)</span>
                      <strong>{manifestCurrentFile || "Nenhum arquivo enviado ainda."}</strong>
                      <small>
                        {uploadManifestBusy
                          ? `Enviando ${manifestUploadProgress?.percent || 0}% - parte ${manifestUploadProgress?.currentPart || 0}/${manifestUploadProgress?.totalParts || 0}`
                          : (formState.overrideManifestFile || "O path sera preenchido automaticamente apos o upload.")}
                      </small>
                    </div>
                    <span className={`override-upload-card__status ${manifestCurrentFile ? "is-ready" : "is-empty"}`}>
                      {uploadManifestBusy ? "Enviando" : manifestCurrentFile ? "Pronto" : "Pendente"}
                    </span>
                  </div>
                  {manifestUploadProgress && (
                    <div className="override-upload-progress" aria-live="polite">
                      <div className="override-upload-progress__meta">
                        <span>{manifestUploadProgress.percent || 0}% concluido</span>
                        <span>
                          {formatProgressBytes(manifestUploadProgress.loadedBytes)} / {formatProgressBytes(manifestUploadProgress.totalBytes)}
                        </span>
                      </div>
                      {manifestUploadProgress.statusText && (
                        <div className="override-upload-progress__status">{manifestUploadProgress.statusText}</div>
                      )}
                      <div className="override-upload-progress__bar">
                        <span style={{ width: `${Math.max(0, Math.min(100, manifestUploadProgress.percent || 0))}%` }} />
                      </div>
                    </div>
                  )}
                  <div className="override-upload-card__actions">
                    <label className="button button--ghost button--sm override-upload-card__picker" aria-disabled={saveOverrideBusy || overrideUploadBusy}>
                      {uploadManifestBusy ? "Enviando..." : manifestCurrentFile ? "Trocar arquivo" : "Escolher arquivo"}
                      <input
                        type="file"
                        disabled={saveOverrideBusy || overrideUploadBusy}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) handleOverrideFileUpload("manifest", file);
                          event.target.value = "";
                        }}
                      />
                    </label>
                    {manifestCurrentFile && (
                      <button
                        className="button button--primary button--sm"
                        onClick={() => handleOverrideFileDownload("manifest")}
                        disabled={saveOverrideBusy || overrideUploadBusy}
                      >
                        Baixar atual
                      </button>
                    )}
                    {uploadManifestBusy && (
                      <button
                        className="button button--danger button--sm"
                        onClick={handleCancelOverrideUpload}
                        disabled={saveOverrideBusy}
                      >
                        Cancelar upload
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}

            {formState.overrideFixEnabled && (
              <>
                <label className="field">
                  <span>Fix file</span>
                  <input
                    value={formState.overrideFixFile}
                    onChange={(event) => setFormState((current) => ({ ...current, overrideFixFile: event.target.value }))}
                    placeholder="730/fixes/arquivo.zip"
                  />
                </label>

                <div className={`override-upload-card ${fixCurrentFile ? "is-ready" : "is-empty"}`}>
                  <div className="override-upload-card__top">
                    <div className="override-upload-card__copy">
                      <span className="override-upload-card__label">Fix package (.zip or .rar)</span>
                      <strong>{fixCurrentFile || "Nenhum arquivo enviado ainda."}</strong>
                      <small>
                        {uploadFixBusy
                          ? `Enviando ${fixUploadProgress?.percent || 0}% - parte ${fixUploadProgress?.currentPart || 0}/${fixUploadProgress?.totalParts || 0}`
                          : (formState.overrideFixFile || "Path, nome e tamanho serao sugeridos automaticamente apos o upload.")}
                      </small>
                    </div>
                    <span className={`override-upload-card__status ${fixCurrentFile ? "is-ready" : "is-empty"}`}>
                      {uploadFixBusy ? "Enviando" : fixCurrentFile ? "Pronto" : "Pendente"}
                    </span>
                  </div>
                  {fixUploadProgress && (
                    <div className="override-upload-progress" aria-live="polite">
                      <div className="override-upload-progress__meta">
                        <span>{fixUploadProgress.percent || 0}% concluido</span>
                        <span>{formatProgressBytes(fixUploadProgress.loadedBytes)} / {formatProgressBytes(fixUploadProgress.totalBytes)}</span>
                      </div>
                      {fixUploadProgress.statusText && (
                        <div className="override-upload-progress__status">{fixUploadProgress.statusText}</div>
                      )}
                      <div className="override-upload-progress__bar">
                        <span style={{ width: `${Math.max(0, Math.min(100, fixUploadProgress.percent || 0))}%` }} />
                      </div>
                    </div>
                  )}
                  <div className="override-upload-card__actions">
                    <label className="button button--ghost button--sm override-upload-card__picker" aria-disabled={saveOverrideBusy || overrideUploadBusy}>
                      {uploadFixBusy ? "Enviando..." : fixCurrentFile ? "Trocar arquivo" : "Escolher arquivo"}
                      <input
                        type="file"
                        disabled={saveOverrideBusy || overrideUploadBusy}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) handleOverrideFileUpload("fix", file);
                          event.target.value = "";
                        }}
                      />
                    </label>
                    {fixCurrentFile && (
                      <button
                        className="button button--primary button--sm"
                        onClick={() => handleOverrideFileDownload("fix")}
                        disabled={saveOverrideBusy || overrideUploadBusy}
                      >
                        Baixar atual
                      </button>
                    )}
                    {uploadFixBusy && (
                      <button
                        className="button button--danger button--sm"
                        onClick={handleCancelOverrideUpload}
                        disabled={saveOverrideBusy}
                      >
                        Cancelar upload
                      </button>
                    )}
                  </div>
                </div>

                <div className="field-grid">
                  <label className="field">
                    <span>Download name</span>
                    <input
                      value={formState.overrideFilename}
                      onChange={(event) => setFormState((current) => ({ ...current, overrideFilename: event.target.value }))}
                      placeholder="cs2-fix.zip"
                    />
                  </label>

                  <label className="field">
                    <span>Size</span>
                    <input
                      value={formState.overrideSize}
                      onChange={(event) => setFormState((current) => ({ ...current, overrideSize: event.target.value }))}
                      placeholder="1.4 GB"
                    />
                  </label>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {activeModal === "override-delete" && (
        <Modal
          title="Excluir override"
          subtitle={`O override do appId ${overrideDeleteTarget} será removido da configuração.`}
          onClose={() => setActiveModal(null)}
          closeDisabled={deleteOverrideBusy}
          actions={
            <>
              <button className="button button--ghost" onClick={() => setActiveModal(null)} disabled={deleteOverrideBusy}>
                Cancelar
              </button>
              <button className="button button--danger" onClick={handleDeleteOverride} disabled={deleteOverrideBusy}>
                {deleteOverrideBusy ? "Excluindo..." : "Excluir override"}
              </button>
            </>
          }
        >
          <p className="plain-copy">Depois disso o appId volta a usar o comportamento padrão da API.</p>
        </Modal>
      )}
    </>
  );
}
