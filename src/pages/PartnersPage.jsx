import React, { useMemo, useState } from "react";
import Cropper from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import Modal from "../components/Modal";
import { formatDateTime } from "../lib/admin-ui";

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
  if (x === null || y === null || !width || !height || x + width > 100.0001 || y + height > 100.0001) return null;
  return { x, y, width, height };
}

function createDraft(entry) {
  return {
    mode: entry ? "edit" : "create", id: entry?.id || null, name: entry?.name || "", sortOrder: entry?.sortOrder ?? 0,
    youtubeUrl: entry?.youtubeUrl || "", tiktokUrl: entry?.tiktokUrl || "", twitchUrl: entry?.twitchUrl || "", active: entry?.active !== false,
    file: null, imageUrl: entry?.imageUrl || "", imageFilename: entry?.imageFilename || "", imageCropArea: readCropArea(entry), removeImage: false,
  };
}

function buildPayload(draft) {
  const name = String(draft.name || "").trim();
  if (!name) throw new Error("Informe o nome do parceiro.");
  if (!draft.file && (!draft.imageUrl || draft.removeImage)) throw new Error("Selecione uma foto do parceiro.");
  return {
    name, sortOrder: Number(draft.sortOrder || 0), youtubeUrl: String(draft.youtubeUrl || "").trim() || null,
    tiktokUrl: String(draft.tiktokUrl || "").trim() || null, twitchUrl: String(draft.twitchUrl || "").trim() || null,
    active: draft.active === true, removeImage: draft.removeImage === true, imageCropX: draft.imageCropArea?.x ?? null,
    imageCropY: draft.imageCropArea?.y ?? null, imageCropWidth: draft.imageCropArea?.width ?? null, imageCropHeight: draft.imageCropArea?.height ?? null, file: draft.file,
  };
}

function previewUrl(draft) {
  return draft.file ? URL.createObjectURL(draft.file) : (draft.removeImage ? "" : draft.imageUrl);
}

function CroppedPartnerImage({ src, cropArea, alt = "", loading }) {
  const frameRef = React.useRef(null);
  const imageRef = React.useRef(null);
  const [layout, setLayout] = React.useState(null);
  const updateLayout = React.useCallback(() => {
    const frame = frameRef.current;
    const image = imageRef.current;
    if (!frame || !image || !cropArea || !image.naturalWidth || !image.naturalHeight) return;
    const cropWidth = image.naturalWidth * (cropArea.width / 100);
    const cropHeight = image.naturalHeight * (cropArea.height / 100);
    const scale = Math.max(frame.clientWidth / cropWidth, frame.clientHeight / cropHeight);
    setLayout({ width: image.naturalWidth * scale, height: image.naturalHeight * scale, left: -image.naturalWidth * (cropArea.x / 100) * scale, top: -image.naturalHeight * (cropArea.y / 100) * scale });
  }, [cropArea]);
  React.useEffect(() => {
    if (!cropArea) return undefined;
    updateLayout();
    window.addEventListener("resize", updateLayout);
    return () => window.removeEventListener("resize", updateLayout);
  }, [cropArea, updateLayout, src]);
  if (!cropArea) return <img src={src} alt={alt} loading={loading} className="partner-cropped-image" />;
  return <div className="partner-cropped-frame" ref={frameRef}><img src={src} alt={alt} loading={loading} ref={imageRef} onLoad={updateLayout} style={layout ? { width: `${layout.width}px`, height: `${layout.height}px`, left: `${layout.left}px`, top: `${layout.top}px` } : { opacity: 0 }} /></div>;
}

function PartnerCropEditor({ imageUrl, cropArea, onApply, onClose }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [nextCropArea, setNextCropArea] = useState(cropArea);
  return <Modal className="modal--partner-cropper" title="Enquadrar foto" subtitle="A foto aparece em formato circular na pagina publica." onClose={onClose} actions={<><button className="button button--ghost" type="button" onClick={() => onApply(null)}>Redefinir</button><button className="button button--primary" type="button" onClick={() => onApply(nextCropArea)}>Aplicar</button></>}>
    <div className="partner-cropper"><div className="partner-cropper__stage"><Cropper image={imageUrl} crop={crop} zoom={zoom} aspect={1} cropShape="round" minZoom={1} maxZoom={4} objectFit="cover" showGrid={false} initialCroppedAreaPercentages={cropArea || undefined} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(area) => setNextCropArea(readCropArea({ imageCropX: area.x, imageCropY: area.y, imageCropWidth: area.width, imageCropHeight: area.height }))} /></div><label className="partner-cropper__zoom"><span>Zoom</span><input type="range" min="1" max="4" step="0.01" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label></div>
  </Modal>;
}

export default function PartnersPage({ partners, loading, loadPartners, savePartner, deletePartner, busyAction, notify }) {
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState(createDraft());
  const [modalOpen, setModalOpen] = useState(false);
  const [cropEditorOpen, setCropEditorOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const cropEditorImage = React.useMemo(() => previewUrl(draft), [draft.file, draft.imageUrl, draft.removeImage]);
  React.useEffect(() => {
    if (!draft.file || !cropEditorImage) return undefined;
    return () => URL.revokeObjectURL(cropEditorImage);
  }, [draft.file, cropEditorImage]);
  const filtered = useMemo(() => [...(partners || [])].filter((partner) => String(partner.name || "").toLowerCase().includes(search.trim().toLowerCase())).sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id), [partners, search]);
  const saving = busyAction === "save-partner";
  const deleting = busyAction === "delete-partner";
  const openCreate = () => { setDraft(createDraft()); setCropEditorOpen(false); setModalOpen(true); };
  const openEdit = (partner) => { setDraft(createDraft(partner)); setCropEditorOpen(false); setModalOpen(true); };
  async function handleSave() { try { await savePartner(draft.mode, draft.id, buildPayload(draft)); setModalOpen(false); notify(draft.mode === "edit" ? "Parceiro atualizado." : "Parceiro criado."); } catch (error) { notify(error.message || "Nao foi possivel salvar o parceiro."); } }
  async function handleDelete() { try { await deletePartner(deleteTarget.id); setDeleteTarget(null); notify("Parceiro excluido."); } catch (error) { notify(error.message || "Nao foi possivel excluir o parceiro."); } }

  return <section className="page page--partners">
    <div className="page__header page__header--split"><div><p className="eyebrow">Public Merlin</p><h1>Parceiros exibidos na pagina publica.</h1></div><div className="page__actions"><button className="button button--ghost" onClick={loadPartners} disabled={loading}>{loading ? "Atualizando..." : "Atualizar lista"}</button><button className="button button--primary" onClick={openCreate}>+ Novo parceiro</button></div></div>
    <section className="panel panel--audit">
      <div className="filters"><label className="field-shell field-shell--search"><span>Buscar</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome..." /></label></div>
      {loading ? <div className="empty-state"><h3>Carregando parceiros</h3><p>Buscando os parceiros cadastrados no painel.</p></div> : !filtered.length ? <div className="empty-state"><h3>Nenhum parceiro cadastrado.</h3><p>Crie o primeiro parceiro para exibi-lo na pagina publica.</p><button className="button button--primary" onClick={openCreate}>+ Novo parceiro</button></div> : <div className="partner-list">{filtered.map((partner) => <article className="audit-card partner-card" key={partner.id}><div className="partner-card__media"><CroppedPartnerImage src={partner.imageUrl} cropArea={readCropArea(partner)} alt={partner.name} loading="lazy" /></div><div className="partner-card__main"><p className="eyebrow">Ordem {partner.sortOrder}</p><h2>{partner.name}</h2><div className="poll-list-card__meta"><span className={`badge ${partner.active ? "badge--emerald" : "badge--muted"}`}>{partner.active ? "Publicado" : "Oculto"}</span>{partner.youtubeUrl && <span>YouTube</span>}{partner.tiktokUrl && <span>TikTok</span>}{partner.twitchUrl && <span>Twitch</span>}</div><small>Atualizado em {formatDateTime(partner.updatedAt)}</small></div><div className="override-actions partner-card__actions"><button className="button button--ghost button--sm" onClick={() => openEdit(partner)}>Editar</button><button className="button button--danger button--soft button--sm" onClick={() => setDeleteTarget(partner)}>Excluir</button></div></article>)}</div>}
    </section>
    {modalOpen && <Modal title={draft.mode === "edit" ? "Editar parceiro" : "Novo parceiro"} subtitle="Configure a foto, ordem e links exibidos na secao Parceiros do Merlin." onClose={() => !saving && setModalOpen(false)} closeDisabled={saving} actions={<><button className="button button--ghost" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</button><button className="button button--primary" onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar parceiro"}</button></>}><div className="field-grid"><label className="field"><span>Nome</span><input value={draft.name} maxLength="80" onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} autoFocus /></label><label className="field"><span>Ordem</span><input type="number" min="0" max="10000" value={draft.sortOrder} onChange={(event) => setDraft((current) => ({ ...current, sortOrder: event.target.value }))} /></label><label className="field field--wide"><span>Link do YouTube</span><input type="url" placeholder="https://youtube.com/..." value={draft.youtubeUrl} onChange={(event) => setDraft((current) => ({ ...current, youtubeUrl: event.target.value }))} /></label><label className="field field--wide"><span>Link do TikTok</span><input type="url" placeholder="https://tiktok.com/@..." value={draft.tiktokUrl} onChange={(event) => setDraft((current) => ({ ...current, tiktokUrl: event.target.value }))} /></label><label className="field field--wide"><span>Link da Twitch</span><input type="url" placeholder="https://twitch.tv/..." value={draft.twitchUrl} onChange={(event) => setDraft((current) => ({ ...current, twitchUrl: event.target.value }))} /></label><label className="override-upload-card announcement-upload-card field--wide"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0] || null; setDraft((current) => ({ ...current, file, imageCropArea: null, removeImage: false })); setCropEditorOpen(Boolean(file)); }} /><div><span className="override-upload-card__label">Foto</span><strong>{draft.file?.name || draft.imageFilename || "Nenhuma foto selecionada."}</strong><p>JPG, PNG ou WebP ate 6 MB.</p></div><span className={`override-upload-card__status ${draft.file || draft.imageUrl ? "is-ready" : "is-empty"}`}>{draft.file || draft.imageUrl ? "Pronta" : "Obrigatoria"}</span></label>{draft.imageUrl && !draft.file && <label className="checkbox-row field--wide"><input type="checkbox" checked={draft.removeImage} onChange={(event) => setDraft((current) => ({ ...current, removeImage: event.target.checked }))} /><span>Remover foto atual ao salvar</span></label>}{(draft.file || draft.imageUrl) && !draft.removeImage && <div className="announcement-crop-action field--wide"><div><span className="override-upload-card__label">Enquadramento</span><strong>{draft.imageCropArea ? "Foto enquadrada" : "Padrao circular"}</strong></div><button className="button button--ghost" type="button" onClick={() => setCropEditorOpen(true)}>Enquadrar foto</button></div>}<label className="checkbox-row field--wide"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft((current) => ({ ...current, active: event.target.checked }))} /><span>Exibir no site publico</span></label></div></Modal>}
    {modalOpen && cropEditorOpen && cropEditorImage && <PartnerCropEditor imageUrl={cropEditorImage} cropArea={draft.imageCropArea} onClose={() => setCropEditorOpen(false)} onApply={(area) => { setDraft((current) => ({ ...current, imageCropArea: area })); setCropEditorOpen(false); }} />}
    {deleteTarget && <Modal title="Excluir parceiro" subtitle="A foto e os links deixarao de aparecer na pagina publica." onClose={() => !deleting && setDeleteTarget(null)} closeDisabled={deleting} actions={<><button className="button button--ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancelar</button><button className="button button--danger" onClick={handleDelete} disabled={deleting}>{deleting ? "Excluindo..." : "Excluir parceiro"}</button></>}><p className="plain-copy">{deleteTarget.name}</p></Modal>}
  </section>;
}
