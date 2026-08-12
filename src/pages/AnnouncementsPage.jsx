import React, { useMemo, useState } from "react";
import Cropper from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import Modal from "../components/Modal";
import { formatDateTime } from "../lib/admin-ui";

const FREQUENCIES = [
  { value: "always", label: "Sempre" },
  { value: "once_per_day", label: "Uma vez por dia" },
  { value: "once", label: "Uma unica vez" },
];
const ANNOUNCEMENT_IMAGE_ASPECT = 16 / 9;

function normalizeCropPercent(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return null;
  return Math.min(100, Math.max(0, Number(numberValue.toFixed(4))));
}

function readCropArea(source) {
  const x = normalizeCropPercent(source?.imageCropX);
  const y = normalizeCropPercent(source?.imageCropY);
  const width = normalizeCropPercent(source?.imageCropWidth);
  const height = normalizeCropPercent(source?.imageCropHeight);
  if (x === null || y === null || !width || !height) return null;
  if (x + width > 100.0001 || y + height > 100.0001) return null;
  return { x, y, width, height };
}

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
    imageCropArea: null,
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
    imageCropArea: readCropArea(entry),
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
    imageCropX: draft.imageCropArea?.x ?? null,
    imageCropY: draft.imageCropArea?.y ?? null,
    imageCropWidth: draft.imageCropArea?.width ?? null,
    imageCropHeight: draft.imageCropArea?.height ?? null,
    file: draft.file,
  };
}

function CroppedAnnouncementImage({ src, cropArea, loading }) {
  const frameRef = React.useRef(null);
  const imageRef = React.useRef(null);
  const [layout, setLayout] = React.useState(null);

  const updateLayout = React.useCallback(() => {
    const frame = frameRef.current;
    const image = imageRef.current;
    if (!frame || !image || !cropArea || !image.naturalWidth || !image.naturalHeight) return;

    const cropWidth = image.naturalWidth * (cropArea.width / 100);
    const cropHeight = image.naturalHeight * (cropArea.height / 100);
    if (!cropWidth || !cropHeight) return;

    const scale = Math.max(frame.clientWidth / cropWidth, frame.clientHeight / cropHeight);
    setLayout({
      width: image.naturalWidth * scale,
      height: image.naturalHeight * scale,
      left: -image.naturalWidth * (cropArea.x / 100) * scale,
      top: -image.naturalHeight * (cropArea.y / 100) * scale,
    });
  }, [cropArea]);

  React.useEffect(() => {
    if (!cropArea) return undefined;
    updateLayout();
    window.addEventListener("resize", updateLayout);
    return () => window.removeEventListener("resize", updateLayout);
  }, [cropArea, updateLayout, src]);

  if (!cropArea) {
    return <img src={src} alt="" loading={loading} className="announcement-cropped-image announcement-cropped-image--cover" />;
  }

  return (
    <div className="announcement-cropped-frame" ref={frameRef}>
      <img
        src={src}
        alt=""
        loading={loading}
        ref={imageRef}
        onLoad={updateLayout}
        style={layout ? {
          width: `${layout.width}px`,
          height: `${layout.height}px`,
          left: `${layout.left}px`,
          top: `${layout.top}px`,
        } : { opacity: 0 }}
      />
    </div>
  );
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
            <CroppedAnnouncementImage src={previewImage} cropArea={draft.imageCropArea} />
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

function ImageCropEditor({ imageUrl, cropArea, onApply, onClose }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [nextCropArea, setNextCropArea] = useState(cropArea);
  const [resetKey, setResetKey] = useState(0);

  function handleReset() {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setNextCropArea(null);
    setResetKey((current) => current + 1);
  }

  return (
    <Modal
      className="modal--announcement-cropper"
      title="Enquadrar imagem"
      subtitle="A moldura usa a mesma proporcao da imagem exibida no Launcher."
      onClose={onClose}
      actions={
        <>
          <button className="button button--ghost" type="button" onClick={handleReset}>
            Redefinir
          </button>
          <button className="button button--primary" type="button" onClick={() => onApply(nextCropArea)}>
            Aplicar
          </button>
        </>
      }
    >
      <div className="announcement-cropper">
        <div className="announcement-cropper__stage">
          <Cropper
            key={`${resetKey}-${imageUrl}`}
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={ANNOUNCEMENT_IMAGE_ASPECT}
            minZoom={1}
            maxZoom={4}
            objectFit="cover"
            showGrid={false}
            initialCroppedAreaPercentages={cropArea || undefined}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(area) => setNextCropArea(readCropArea({
              imageCropX: area.x,
              imageCropY: area.y,
              imageCropWidth: area.width,
              imageCropHeight: area.height,
            }))}
          />
        </div>
        <label className="announcement-cropper__zoom">
          <span>Zoom</span>
          <input
            type="range"
            min="1"
            max="4"
            step="0.01"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
        </label>
      </div>
    </Modal>
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
  const [cropEditorOpen, setCropEditorOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const cropEditorImage = React.useMemo(() => imagePreviewUrl(draft), [draft.file, draft.imageUrl, draft.removeImage]);
  React.useEffect(() => {
    if (!draft.file || !cropEditorImage) return undefined;
    return () => URL.revokeObjectURL(cropEditorImage);
  }, [draft.file, cropEditorImage]);

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
    setCropEditorOpen(false);
    setModalOpen(true);
  }

  function openEdit(entry) {
    setDraft(createDraft(entry));
    setCropEditorOpen(false);
    setModalOpen(true);
  }

  async function handleSave() {
    try {
      const saved = await saveAnnouncement(draft.mode, draft.id, buildPayload(draft));
      setDraft(createDraft(saved));
      setCropEditorOpen(false);
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
                  {entry.imageUrl ? (
                    <CroppedAnnouncementImage src={entry.imageUrl} cropArea={readCropArea(entry)} loading="lazy" />
                  ) : <span>Sem imagem</span>}
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
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    setDraft((current) => ({
                      ...current,
                      file,
                      imageCropArea: null,
                      removeImage: false,
                    }));
                    setCropEditorOpen(Boolean(file));
                  }}
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

              {(draft.file || draft.imageUrl) && !draft.removeImage && (
                <div className="announcement-crop-action">
                  <div>
                    <span className="override-upload-card__label">Enquadramento</span>
                    <strong>{draft.imageCropArea ? "Imagem enquadrada" : "Padrao da modal"}</strong>
                  </div>
                  <button className="button button--ghost" type="button" onClick={() => setCropEditorOpen(true)}>
                    Enquadrar imagem
                  </button>
                </div>
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

      {modalOpen && cropEditorOpen && cropEditorImage && (
        <ImageCropEditor
          imageUrl={cropEditorImage}
          cropArea={draft.imageCropArea}
          onClose={() => setCropEditorOpen(false)}
          onApply={(area) => {
            setDraft((current) => ({ ...current, imageCropArea: area }));
            setCropEditorOpen(false);
          }}
        />
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
