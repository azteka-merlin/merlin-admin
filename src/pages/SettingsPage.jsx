import React from "react";
import { formatDateTime } from "../lib/admin-ui";

function formatProgressBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / (1024 ** index);
  return `${amount >= 100 || index === 0 ? Math.round(amount) : amount.toFixed(1)} ${units[index]}`;
}

export default function SettingsPage({
  loadingBlockedIps,
  blockedIps,
  loadBlockedIps,
  handleUnblockBlockedIp,
  busyAction,
  merlinUpdate,
  merlinUpdateDraft,
  setMerlinUpdateDraft,
  loadingMerlinUpdate,
  loadMerlinUpdate,
  handlePublishMerlinUpdate,
  merlinUpdateUploadProgress,
  handleCancelMerlinUpdateUpload
}) {
  const publishingUpdate = busyAction === "publish-merlin-update";

  return (
    <section className="page">
      <div className="page__header">
        <div>
          <p className="eyebrow">Configurações</p>
          <h1>Gerencie segurança básica, IPs bloqueados e o update do Merlin.</h1>
        </div>
      </div>

      <section className="panel panel--audit">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Atualização</p>
            <h2>Auto update do Merlin</h2>
          </div>
          <button className="button button--ghost" onClick={loadMerlinUpdate} disabled={loadingMerlinUpdate || publishingUpdate}>
            {loadingMerlinUpdate ? "Atualizando..." : "Atualizar dados"}
          </button>
        </div>

        <div className="field-grid">
          <label className="field">
            <span>Versão</span>
            <input
              value={merlinUpdateDraft.version}
              onChange={(event) => setMerlinUpdateDraft((current) => ({ ...current, version: event.target.value }))}
              placeholder="1.6.0"
              disabled={publishingUpdate}
            />
          </label>
        </div>

        <div className={`override-upload-card ${merlinUpdate ? "is-ready" : "is-empty"}`}>
          <div className="override-upload-card__top">
            <div className="override-upload-card__copy">
              <span className="override-upload-card__label">Instalador do Merlin (.exe)</span>
              <strong>{merlinUpdateDraft.file?.name || merlinUpdate?.filename || "Nenhum instalador selecionado."}</strong>
              <small>
                {merlinUpdateUploadProgress?.statusText
                  || (merlinUpdate ? `Versão atual publicada: ${merlinUpdate.version}` : "Envie um novo instalador para atualizar o latest.json e o download do Merlin.")}
              </small>
            </div>
            <span className={`override-upload-card__status ${merlinUpdate ? "is-ready" : "is-empty"}`}>
              {publishingUpdate ? "Enviando" : merlinUpdate ? "Publicado" : "Pendente"}
            </span>
          </div>

          {merlinUpdateUploadProgress && (
            <div className="override-upload-progress" aria-live="polite">
              <div className="override-upload-progress__meta">
                <span>{merlinUpdateUploadProgress.percent || 0}% concluido</span>
                <span>{formatProgressBytes(merlinUpdateUploadProgress.loadedBytes)} / {formatProgressBytes(merlinUpdateUploadProgress.totalBytes)}</span>
              </div>
              {merlinUpdateUploadProgress.statusText && (
                <div className="override-upload-progress__status">{merlinUpdateUploadProgress.statusText}</div>
              )}
              <div className="override-upload-progress__bar">
                <span style={{ width: `${Math.max(0, Math.min(100, merlinUpdateUploadProgress.percent || 0))}%` }} />
              </div>
            </div>
          )}

          <div className="override-upload-card__actions">
            <label className="button button--ghost button--sm override-upload-card__picker" aria-disabled={publishingUpdate}>
              {merlinUpdateDraft.file ? "Trocar instalador" : "Escolher instalador"}
              <input
                type="file"
                accept=".exe"
                disabled={publishingUpdate}
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  setMerlinUpdateDraft((current) => ({ ...current, file }));
                  event.target.value = "";
                }}
              />
            </label>

            {publishingUpdate ? (
              <button className="button button--danger button--sm" onClick={handleCancelMerlinUpdateUpload}>
                Cancelar upload
              </button>
            ) : (
              <button className="button button--primary button--sm" onClick={handlePublishMerlinUpdate} disabled={!merlinUpdateDraft.file || !merlinUpdateDraft.version}>
                Publicar update
              </button>
            )}
          </div>
        </div>

        {merlinUpdate ? (
          <div className="update-meta-grid">
            <div className="detail-card">
              <span>Versão atual</span>
              <strong>{merlinUpdate.version}</strong>
            </div>
            <div className="detail-card">
              <span>Tamanho</span>
              <strong>{merlinUpdate.sizeLabel || "--"}</strong>
            </div>
            <div className="detail-card">
              <span>Publicado em</span>
              <strong>{merlinUpdate.publishedAt ? formatDateTime(merlinUpdate.publishedAt) : "--"}</strong>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <h3>Nenhum update publicado</h3>
            <p>O Merlin ainda não possui um latest.json salvo no bucket _updates.</p>
          </div>
        )}
      </section>

      <section className="panel panel--audit">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Segurança</p>
            <h2>IPs bloqueados</h2>
          </div>
          <button className="button button--ghost" onClick={loadBlockedIps} disabled={loadingBlockedIps}>
            {loadingBlockedIps ? "Atualizando..." : "Atualizar lista"}
          </button>
        </div>

        {loadingBlockedIps ? (
          <div className="empty-state">
            <h3>Carregando bloqueios</h3>
            <p>Buscando os IPs que atingiram o limite de falhas.</p>
          </div>
        ) : !blockedIps.length ? (
          <div className="empty-state">
            <h3>Nenhum IP bloqueado</h3>
            <p>No momento não existem bloqueios ativos por IP.</p>
          </div>
        ) : (
          <div className="audit-list">
            {blockedIps.map((blockedIp) => (
              <article className="audit-card" key={blockedIp.id}>
                <div className="audit-card__head">
                  <div className="user-cell user-cell--audit">
                    <span className="avatar avatar--tone-danger">IP</span>
                    <div>
                      <strong className="truncate-text" title={blockedIp.ipHash}>{blockedIp.ipHash}</strong>
                      <p>{blockedIp.reason}</p>
                    </div>
                  </div>
                  <button
                    className="button button--ghost"
                    onClick={() => handleUnblockBlockedIp(blockedIp.id)}
                    disabled={busyAction === `unblock-blocked-ip:${blockedIp.id}`}
                  >
                    {busyAction === `unblock-blocked-ip:${blockedIp.id}` ? "Desbloqueando..." : "Desbloquear"}
                  </button>
                </div>

                <div className="audit-card__body">
                  <dl className="audit-card__meta">
                    <div>
                      <dt>Falhas</dt>
                      <dd>{blockedIp.failedCount}</dd>
                    </div>
                    <div>
                      <dt>Bloqueado em</dt>
                      <dd>{formatDateTime(blockedIp.blockedAt)}</dd>
                    </div>
                    <div>
                      <dt>Expira em</dt>
                      <dd>{blockedIp.blockedUntil ? formatDateTime(blockedIp.blockedUntil) : "--"}</dd>
                    </div>
                  </dl>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
