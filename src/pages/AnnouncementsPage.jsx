import React, { useMemo, useState } from "react";
import Modal from "../components/Modal";
import { formatDateTime } from "../lib/admin-ui";

const FREQUENCIES = [
  { value: "always", label: "Sempre" },
  { value: "once_per_day", label: "Uma vez por dia" },
  { value: "once", label: "Uma unica vez" },
];

function createEmptyDraft() {
  return {
    mode: "create",
    id: null,
    internalName: "",
    title: "",
    bodyText: "",
    active: false,
    startsAt: "",
    endsAt: "",
    frequency: "always",
    allowDismissForever: false,
    file: null,
    imageUrl: "",
    imageFilename: "",
    removeImage: false,
  };
}

function toDatetimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function createDraft(entry) {
  if (!entry) return createEmptyDraft();
  return {
    mode: "edit",
    id: entry.id,
    internalName: entry.internalName || "",
    title: entry.title || "",
    bodyText: entry.bodyText || "",
    active: entry.active === true,
    startsAt: toDatetimeLocal(entry.startsAt),
    endsAt: toDatetimeLocal(entry.endsAt),
    frequency: entry.frequency || "always",
    allowDismissForever: entry.allowDismissForever === true,
    file: null,
    imageUrl: entry.imageUrl || "",
    imageFilename: entry.imageFilename || "",
    removeImage: false,
  };
}

function statusLabel(status) {
  if (status === "active") return "Ativo";
  if (status === "scheduled") return "Agendado";
  if (status === "ended") return "Encerrado";
  return "Inativo";
}

function statusTone(status) {
  if (status === "active") return "badge--emerald";
  if (status === "scheduled") return "badge--warning";
  if (status === "ended") return "badge--muted";
  return "badge--muted";
}

function frequencyLabel(value) {
  return FREQUENCIES.find((item) => item.value === value)?.label || "Sempre";
}

function imagePreviewUrl(draft) {
  if (draft.file) return URL.createObjectURL(draft.file);
  if (draft.removeImage) return "";
  return draft.imageUrl || "";
}

function buildPayload(draft) {
  const internalName = String(draft.internalName || "").trim();
  const title = String(draft.title || "").trim();
  const bodyText = String(draft.bodyText || "").trim();
  if (!internalName) throw new Error("Informe o nome interno.");
  if (!title) throw new Error("Informe o titulo.");
  if (!bodyText) throw new Error("Informe o texto.");

  return {
    internalName,
    title,
    bodyText,
    active: draft.active === true,
    startsAt: toIso(draft.startsAt),
    endsAt: toIso(draft.endsAt),
    frequency: draft.frequency || "always",
    allowDismissForever: draft.allowDismissForever === true,
    removeImage: draft.removeImage === true,
    file: draft.file,
  };
}

function AnnouncementPreview({ draft }) {
  const previewImage = React.useMemo(() => imagePreviewUrl(draft), [draft.file, draft.imageUrl, draft.removeImage]);
  React.useEffect(() => {
    if (!draft.file) return undefined;
    return () => URL.revokeObjectURL(previewImage);
  }, [draft.file, previewImage]);

  return (
    <div className="announcement-preview-shell">
      <div className="announcement-preview-modal">
        <button className="announcement-preview-close" type="button" aria-label="Fechar preview">x</button>
        {previewImage && (
          <div className="announcement-preview-image">
            <img src={previewImage} alt="" />
          </div>
        )}
        <div className="announcement-preview-copy">
          <p className="eyebrow">Comunicado Merlin</p>
          <h2>{draft.title || "Titulo do comunicado"}</h2>
          <p>{draft.bodyText || "O texto escrito aqui aparece na modal do Launcher."}</p>
        </div>
        {draft.allowDismissForever && (
          <label className="announcement-preview-check">
            <input type="checkbox" readOnly />
            <span>Nao mostrar novamente</span>
          </label>
        )}
      </div>
    </div>
  );
}

export default function AnnouncementsPage({
  announcements,
  loading,
  loadAnnouncements,
  saveAnnouncement,
  deleteAnnouncement,
  busyAction,
  notify,
}) {
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState(createEmptyDraft());
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...(announcements || [])]
      .filter((entry) => {
        if (!query) return true;
        return [entry.internalName, entry.title, entry.bodyText, entry.status, entry.frequency]
          .some((value) => String(value || "").toLowerCase().includes(query));
      })
      .sort((left, right) => {
        if (left.active !== right.active) return left.active ? -1 : 1;
        return String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""));
      });
  }, [announcements, search]);

  const saving = busyAction === "save-announcement";
  const deleting = busyAction === "delete-announcement";

  function openCreate() {
    setDraft(createEmptyDraft());
    setModalOpen(true);
  }

  function openEdit(entry) {
    setDraft(createDraft(entry));
    setModalOpen(true);
  }

  async function handleSave() {
    try {
      const saved = await saveAnnouncement(draft.mode, draft.id, buildPayload(draft));
      setDraft(createDraft(saved));
      setModalOpen(false);
      notify(draft.mode === "edit" ? "Comunicado atualizado." : "Comunicado criado.");
    } catch (error) {
      notify(error.message || "Nao foi possivel salvar o comunicado.");
    }
  }

  async function handleDelete() {
    if (!deleteTarget?.id) return;
    try {
      await deleteAnnouncement(deleteTarget.id);
      setDeleteTarget(null);
      notify("Comunicado excluido.");
    } catch (error) {
      notify(error.message || "Nao foi possivel excluir o comunicado.");
    }
  }

  return (
    <section className="page page--announcements">
      <div className="page__header page__header--split">
        <div>
          <p className="eyebrow">Launcher</p>
          <h1>Comunicados exibidos dentro do Merlin.</h1>
        </div>
        <div className="page__actions">
          <button className="button button--ghost" onClick={loadAnnouncements} disabled={loading}>
            {loading ? "Atualizando..." : "Atualizar lista"}
          </button>
          <button className="button button--primary" onClick={openCreate}>
            + Novo comunicado
          </button>
        </div>
      </div>

      <section className="panel panel--audit">
        <div className="filters">
          <label className="field-shell field-shell--search">
            <span>Buscar</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome, titulo ou texto..."
            />
          </label>
        </div>

        {loading ? (
          <div className="empty-state">
            <h3>Carregando comunicados</h3>
            <p>Buscando a configuracao atual do Launcher.</p>
          </div>
        ) : !filtered.length ? (
          <div className="empty-state">
            <h3>Nenhum comunicado criado ainda.</h3>
            <p>Crie o primeiro comunicado para exibir no Launcher.</p>
            <button className="button button--primary" onClick={openCreate}>
              + Novo comunicado
            </button>
          </div>
        ) : (
          <div className="announcement-list">
            {filtered.map((entry) => (
              <article className="audit-card announcement-card" key={entry.id}>
                <div className="announcement-card__media">
                  {entry.imageUrl ? <img src={entry.imageUrl} alt="" loading="lazy" /> : <span>Sem imagem</span>}
                </div>
                <div className="announcement-card__main">
                  <p className="eyebrow">{entry.internalName}</p>
                  <h2>{entry.title}</h2>
                  <p>{entry.bodyText}</p>
                  <div className="poll-list-card__meta">
                    <span className={`badge ${statusTone(entry.status)}`}>{statusLabel(entry.status)}</span>
                    <span>{frequencyLabel(entry.frequency)}</span>
                    <span>{entry.metrics?.totalViews || 0} views</span>
                    <span>{entry.metrics?.dismissedForever || 0} opt-outs</span>
                  </div>
                  <small>
                    {entry.startsAt ? `Inicio ${formatDateTime(entry.startsAt)}` : "Sem inicio"} - {entry.endsAt ? `fim ${formatDateTime(entry.endsAt)}` : "sem fim"}
                  </small>
                </div>
                <div className="override-actions announcement-card__actions">
                  <button className="button button--ghost button--sm" onClick={() => openEdit(entry)}>
                    Editar
                  </button>
                  <button className="button button--danger button--soft button--sm" onClick={() => setDeleteTarget(entry)}>
                    Excluir
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {modalOpen && (
        <Modal
          className="modal--announcement-editor"
          title={draft.mode === "edit" ? "Editar comunicado" : "Novo comunicado"}
          subtitle="Configure somente a modal informativa da V1."
          onClose={() => !saving && setModalOpen(false)}
          closeDisabled={saving}
          actions={
            <>
              <button className="button button--ghost" onClick={() => setModalOpen(false)} disabled={saving}>
                Cancelar
              </button>
              <button className="button button--primary" onClick={handleSave} disabled={saving}>
                {saving ? "Salvando..." : "Salvar comunicado"}
              </button>
            </>
          }
        >
          <div className="announcement-editor">
            <div className="announcement-editor__form">
              <div className="field-grid">
                <label className="field">
                  <span>Nome interno</span>
                  <input value={draft.internalName} onChange={(event) => setDraft((current) => ({ ...current, internalName: event.target.value }))} placeholder="Aviso manutencao agosto" autoFocus />
                </label>
                <label className="field">
                  <span>Frequencia</span>
                  <select value={draft.frequency} onChange={(event) => setDraft((current) => ({ ...current, frequency: event.target.value }))}>
                    {FREQUENCIES.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <label className="field field--wide">
                  <span>Titulo</span>
                  <input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Novidade importante no Merlin" />
                </label>
                <label className="field field--wide">
                  <span>Texto</span>
                  <textarea rows="7" value={draft.bodyText} onChange={(event) => setDraft((current) => ({ ...current, bodyText: event.target.value }))} placeholder="Escreva o comunicado que o Launcher vai exibir." />
                </label>
                <label className="field">
                  <span>Inicio opcional</span>
                  <input type="datetime-local" value={draft.startsAt} onChange={(event) => setDraft((current) => ({ ...current, startsAt: event.target.value }))} />
                </label>
                <label className="field">
                  <span>Termino opcional</span>
                  <input type="datetime-local" value={draft.endsAt} onChange={(event) => setDraft((current) => ({ ...current, endsAt: event.target.value }))} />
                </label>
              </div>

              <label className="override-upload-card announcement-upload-card">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    file: event.target.files?.[0] || null,
                    removeImage: false,
                  }))}
                />
                <div>
                  <span className="override-upload-card__label">Imagem opcional</span>
                  <strong>{draft.file?.name || draft.imageFilename || "Nenhuma imagem selecionada."}</strong>
                  <p>JPG, PNG ou WebP ate 6 MB.</p>
                </div>
                <span className={`override-upload-card__status ${draft.file || draft.imageUrl ? "is-ready" : "is-empty"}`}>
                  {draft.file || draft.imageUrl ? "Configurada" : "Opcional"}
                </span>
              </label>

              {draft.imageUrl && !draft.file && (
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={draft.removeImage}
                    onChange={(event) => setDraft((current) => ({ ...current, removeImage: event.target.checked }))}
                  />
                  <span>Remover imagem atual ao salvar</span>
                </label>
              )}

              <div className="announcement-toggles">
                <label className="checkbox-row">
                  <input type="checkbox" checked={draft.active} onChange={(event) => setDraft((current) => ({ ...current, active: event.target.checked }))} />
                  <span>Ativo</span>
                </label>
                <label className="checkbox-row">
                  <input type="checkbox" checked={draft.allowDismissForever} onChange={(event) => setDraft((current) => ({ ...current, allowDismissForever: event.target.checked }))} />
                  <span>Permitir nao mostrar novamente</span>
                </label>
              </div>
            </div>
            <AnnouncementPreview draft={draft} />
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <Modal
          title="Excluir comunicado"
          subtitle="Esta acao remove o comunicado e o estado de visualizacao vinculado."
          onClose={() => !deleting && setDeleteTarget(null)}
          closeDisabled={deleting}
          actions={
            <>
              <button className="button button--ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                Cancelar
              </button>
              <button className="button button--danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Excluindo..." : "Excluir comunicado"}
              </button>
            </>
          }
        >
          <p className="plain-copy">{deleteTarget.title}</p>
        </Modal>
      )}
    </section>
  );
}
