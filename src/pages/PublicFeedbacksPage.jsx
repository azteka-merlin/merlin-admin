import React, { useMemo, useState } from "react";
import Modal from "../components/Modal";
import { formatDateTime } from "../lib/admin-ui";

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes <= 0) return "arquivo estatico";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function createEditDraft(entry) {
  return {
    id: entry?.id || null,
    title: entry?.title || "",
    sortOrder: entry?.sortOrder ?? 0,
    enabled: entry?.enabled !== false,
  };
}

export default function PublicFeedbacksPage({
  feedbacks,
  loading,
  loadFeedbacks,
  createFeedback,
  updateFeedback,
  deleteFeedback,
  busyAction,
  notify,
}) {
  const [uploadDraft, setUploadDraft] = useState({ title: "", sortOrder: "", enabled: true, file: null });
  const [editDraft, setEditDraft] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const sortedFeedbacks = useMemo(() => {
    return [...(feedbacks || [])].sort((left, right) => (left.sortOrder || 0) - (right.sortOrder || 0) || left.id - right.id);
  }, [feedbacks]);

  const uploading = busyAction === "create-public-feedback";
  const editing = busyAction === "update-public-feedback";
  const deleting = busyAction === "delete-public-feedback";

  async function handleCreate() {
    if (!uploadDraft.file) {
      notify("Selecione uma imagem de feedback.");
      return;
    }

    try {
      await createFeedback(uploadDraft);
      setUploadDraft({ title: "", sortOrder: "", enabled: true, file: null });
      notify("Feedback cadastrado.");
    } catch (error) {
      notify(error.message || "Nao foi possivel cadastrar o feedback.");
    }
  }

  async function handleUpdate() {
    if (!editDraft?.id) return;
    try {
      await updateFeedback(editDraft.id, editDraft);
      setEditDraft(null);
      notify("Feedback atualizado.");
    } catch (error) {
      notify(error.message || "Nao foi possivel atualizar o feedback.");
    }
  }

  async function handleDelete() {
    if (!deleteTarget?.id) return;
    try {
      await deleteFeedback(deleteTarget.id);
      setDeleteTarget(null);
      notify("Feedback removido.");
    } catch (error) {
      notify(error.message || "Nao foi possivel remover o feedback.");
    }
  }

  return (
    <section className="page page--public-feedbacks">
      <div className="page__header page__header--split">
        <div>
          <p className="eyebrow">Public Merlin</p>
          <h1>Gerencie as fotos de feedback exibidas na pagina publica.</h1>
        </div>
        <div className="page__actions">
          <button className="button button--ghost" onClick={loadFeedbacks} disabled={loading}>
            {loading ? "Atualizando..." : "Atualizar lista"}
          </button>
        </div>
      </div>

      <section className="panel panel--audit public-feedback-upload">
        <div className="premium-upload-box">
          <div>
            <strong>Nova foto</strong>
            <p>Novos uploads entram na mesma lista configurada que alimenta os feedbacks da pagina publica.</p>
          </div>
        </div>
        <div className="field-grid">
          <label className="field">
            <span>Titulo interno</span>
            <input
              value={uploadDraft.title}
              onChange={(event) => setUploadDraft((current) => ({ ...current, title: event.target.value }))}
              placeholder="Feedback Discord"
            />
          </label>
          <label className="field">
            <span>Ordem</span>
            <input
              type="number"
              min="0"
              value={uploadDraft.sortOrder}
              onChange={(event) => setUploadDraft((current) => ({ ...current, sortOrder: event.target.value }))}
              placeholder="0"
            />
          </label>
        </div>
        <label className="override-upload-card public-feedback-file">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => setUploadDraft((current) => ({ ...current, file: event.target.files?.[0] || null }))}
          />
          <div>
            <span className="override-upload-card__label">Imagem JPG, PNG ou WebP</span>
            <strong>{uploadDraft.file?.name || "Nenhuma imagem selecionada."}</strong>
            <p>{uploadDraft.file ? formatBytes(uploadDraft.file.size) : "Envie prints de feedback sem alterar o layout publico."}</p>
          </div>
          <span className={`override-upload-card__status ${uploadDraft.file ? "is-ready" : "is-empty"}`}>
            {uploadDraft.file ? "Pronta" : "Pendente"}
          </span>
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={uploadDraft.enabled}
            onChange={(event) => setUploadDraft((current) => ({ ...current, enabled: event.target.checked }))}
          />
          <span>Publicar imediatamente</span>
        </label>
        <div className="form-actions">
          <button className="button button--primary" onClick={handleCreate} disabled={uploading || !uploadDraft.file}>
            {uploading ? "Enviando..." : "Cadastrar feedback"}
          </button>
        </div>
      </section>

      <section className="panel panel--audit">
        {loading ? (
          <div className="empty-state">
            <h3>Carregando feedbacks</h3>
            <p>Buscando as fotos cadastradas no painel.</p>
          </div>
        ) : !sortedFeedbacks.length ? (
          <div className="empty-state">
            <h3>Nenhum feedback configurado.</h3>
            <p>Cadastre uma foto para exibir na pagina publica.</p>
          </div>
        ) : (
          <div className="public-feedback-grid">
            {sortedFeedbacks.map((entry) => (
              <article className={`public-feedback-card ${entry.enabled ? "" : "is-disabled"}`} key={entry.id}>
                <div className="public-feedback-card__image">
                  <img src={entry.imageUrl} alt={entry.title || "Feedback Merlin"} loading="lazy" />
                </div>
                <div className="public-feedback-card__body">
                  <div>
                    <p className="eyebrow">{entry.source === "static" ? "Estatico" : "Upload"} · {entry.enabled ? "Publicado" : "Oculto"}</p>
                    <h2>{entry.title || "Feedback Merlin"}</h2>
                    <p>{entry.filename} · {formatBytes(entry.sizeBytes)}</p>
                    <small>Ordem {entry.sortOrder || 0} · Atualizado em {formatDateTime(entry.updatedAt)}</small>
                  </div>
                  <div className="override-actions">
                    <button className="button button--ghost button--sm" onClick={() => setEditDraft(createEditDraft(entry))}>
                      Editar
                    </button>
                    <button className="button button--danger button--soft button--sm" onClick={() => setDeleteTarget(entry)}>
                      Excluir
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {editDraft && (
        <Modal
          title="Editar feedback"
          subtitle="Altere somente os metadados. A imagem permanece a mesma."
          onClose={() => !editing && setEditDraft(null)}
          closeDisabled={editing}
          actions={
            <>
              <button className="button button--ghost" onClick={() => setEditDraft(null)} disabled={editing}>
                Cancelar
              </button>
              <button className="button button--primary" onClick={handleUpdate} disabled={editing}>
                {editing ? "Salvando..." : "Salvar feedback"}
              </button>
            </>
          }
        >
          <div className="field-grid">
            <label className="field">
              <span>Titulo interno</span>
              <input value={editDraft.title} onChange={(event) => setEditDraft((current) => ({ ...current, title: event.target.value }))} />
            </label>
            <label className="field">
              <span>Ordem</span>
              <input type="number" min="0" value={editDraft.sortOrder} onChange={(event) => setEditDraft((current) => ({ ...current, sortOrder: event.target.value }))} />
            </label>
            <label className="checkbox-row field--wide">
              <input type="checkbox" checked={editDraft.enabled} onChange={(event) => setEditDraft((current) => ({ ...current, enabled: event.target.checked }))} />
              <span>Exibir no site publico</span>
            </label>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <Modal
          title="Excluir feedback"
          subtitle="Esta acao remove a foto do painel e do site publico."
          onClose={() => !deleting && setDeleteTarget(null)}
          closeDisabled={deleting}
          actions={
            <>
              <button className="button button--ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                Cancelar
              </button>
              <button className="button button--danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Excluindo..." : "Excluir feedback"}
              </button>
            </>
          }
        >
          <p className="plain-copy">{deleteTarget.title || deleteTarget.filename}</p>
        </Modal>
      )}
    </section>
  );
}
