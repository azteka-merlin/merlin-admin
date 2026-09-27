import React, { useEffect, useMemo, useState } from "react";
import Cropper from "react-easy-crop";
import Modal from "../components/Modal";
import merlinWatermark from "../../../Merlin-luncher/assets/merlin-wizard-logo.png";

const SLOT_META = {
  hero: { label: "Carrossel", aspect: 1008.48 / 367.2, limit: 30 },
  side: { label: "Cards laterais", aspect: 366.72 / 189, limit: 2 },
  showcase: { label: "Campanhas em vitrine", aspect: 16 / 9, limit: 4 },
};

function emptyDraft(slotType, position) {
  return {
    mode: "create", id: null, slotType, position, appId: "", title: "", description: "",
    secondaryText: "", displayLabel: "", imageMode: "steam", imageUrl: "", imageFilename: "",
    imagePositionX: 50, imagePositionY: 50, primaryAction: "premium", secondaryAction: "add_game",
    enabled: true, file: null, removeImage: false,
  };
}

function editDraft(item) {
  return {
    mode: "edit", ...item, appId: item.appId || "", description: item.description || "",
    secondaryText: item.secondaryText || "", displayLabel: item.displayLabel || "",
    imageFilename: item.imageFilename || "", file: null, removeImage: false,
  };
}

function previewUrl(draft) {
  return draft.file ? URL.createObjectURL(draft.file) : draft.imageUrl || "";
}

function appendForm(formData, draft) {
  ["slotType", "position", "appId", "title", "description", "secondaryText", "displayLabel", "imageMode", "imagePositionX", "imagePositionY", "primaryAction", "secondaryAction"]
    .forEach((key) => formData.append(key, String(draft[key] ?? "")));
  formData.append("enabled", draft.enabled ? "true" : "false");
  formData.append("removeImage", draft.removeImage ? "true" : "false");
  if (draft.file) formData.append("file", draft.file);
}

function validateDraft(draft) {
  if (!/^\d+$/.test(String(draft.appId || "").trim())) throw new Error("Informe um App ID válido.");
  if (!String(draft.title || "").trim()) throw new Error("Informe o título.");
  if (draft.imageMode === "custom" && !draft.file && !draft.imageUrl) throw new Error("Envie uma imagem personalizada.");
}

function HomeSlotPreview({ draft, compact = false }) {
  const imageUrl = useMemo(() => previewUrl(draft), [draft.file, draft.imageUrl]);
  useEffect(() => () => { if (draft.file && imageUrl) URL.revokeObjectURL(imageUrl); }, [draft.file, imageUrl]);
  const style = imageUrl ? {
    backgroundImage: `url("${imageUrl}")`,
    backgroundPosition: `${draft.imagePositionX}% ${draft.imagePositionY}%`,
  } : undefined;
  const className = `home-admin-preview home-admin-preview--${draft.slotType}${compact ? " is-compact" : ""}`;
  const actionLabels = { premium: "Ver catálogo Premium", add_game: "Adicionar por link" };
  const actions = [draft.primaryAction, draft.secondaryAction].filter((action) => actionLabels[action]);
  return (
    <div className={className} style={style}>
      <div className="home-admin-preview__shade" />
      {draft.slotType === "hero" && <img className="home-admin-preview__watermark" src={merlinWatermark} alt="" aria-hidden="true" />}
      <div className="home-admin-preview__copy">
        {draft.slotType === "hero" && draft.displayLabel && <span>{draft.displayLabel}</span>}
        <strong>{draft.title || "Título do jogo"}</strong>
        {draft.slotType === "hero" && draft.description && <p>{draft.description}</p>}
        {draft.slotType !== "hero" && draft.secondaryText && <small>{draft.secondaryText}</small>}
        {draft.slotType === "hero" && !compact && actions.length > 0 && (
          <div className="home-admin-preview__actions">{actions.map((action, index) => <i key={`${action}-${index}`}>{actionLabels[action]}</i>)}</div>
        )}
      </div>
    </div>
  );
}

function FocalPointEditor({ draft, imageUrl, onApply, onClose }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [point, setPoint] = useState({ x: draft.imagePositionX, y: draft.imagePositionY });
  return (
    <Modal
      className="modal--home-cropper"
      title="Ajustar enquadramento"
      subtitle={`O frame usa a proporção de ${SLOT_META[draft.slotType].label.toLowerCase()} do Launcher.`}
      onClose={onClose}
      actions={<><button className="button button--ghost" onClick={onClose}>Cancelar</button><button className="button button--primary" onClick={() => onApply(point)}>Aplicar</button></>}
    >
      <div className={`home-admin-cropper home-admin-cropper--${draft.slotType}`}>
        <Cropper
          image={imageUrl}
          crop={crop}
          zoom={zoom}
          aspect={SLOT_META[draft.slotType].aspect}
          minZoom={1}
          maxZoom={4}
          objectFit="cover"
          showGrid={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(area) => setPoint({ x: Math.max(0, Math.min(100, area.x + area.width / 2)), y: Math.max(0, Math.min(100, area.y + area.height / 2)) })}
        />
      </div>
      <label className="home-admin-zoom"><span>Zoom</span><input type="range" min="1" max="4" step="0.01" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
    </Modal>
  );
}

export default function HomePage({ apiRequest, notify }) {
  const [home, setHome] = useState({ hero: [], side: [], showcase: [] });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("hero");
  const [draft, setDraft] = useState(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [busy, setBusy] = useState("");

  async function load() {
    setLoading(true);
    try {
      const payload = await apiRequest("/panel-api/home");
      setHome(payload.home || { hero: [], side: [], showcase: [] });
    } catch (error) {
      notify(error.message || "Não foi possível carregar a Home.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);
  const items = home[tab] || [];
  const cropImageUrl = useMemo(() => draft ? previewUrl(draft) : "", [draft?.file, draft?.imageUrl]);
  useEffect(() => () => { if (draft?.file && cropImageUrl) URL.revokeObjectURL(cropImageUrl); }, [draft?.file, cropImageUrl]);

  async function resolveSteam() {
    const appId = String(draft.appId || "").trim();
    if (!/^\d+$/.test(appId)) return notify("Informe um App ID válido.");
    setBusy("resolve");
    try {
      const payload = await apiRequest(`/panel-api/home/steam/${encodeURIComponent(appId)}`);
      setDraft((current) => ({ ...current, title: current.title || payload.game.name, imageUrl: payload.game.coverUrl || current.imageUrl, imageMode: "steam", removeImage: false }));
    } catch (error) { notify(error.message); } finally { setBusy(""); }
  }

  async function save() {
    try { validateDraft(draft); } catch (error) { notify(error.message); return; }
    setBusy("save");
    try {
      const formData = new FormData();
      appendForm(formData, draft);
      await apiRequest(draft.mode === "edit" ? `/panel-api/home/${draft.id}` : "/panel-api/home", {
        method: draft.mode === "edit" ? "PUT" : "POST", body: formData, mutate: true,
      });
      setDraft(null);
      await load();
      notify("Conteúdo da Home salvo.");
    } catch (error) { notify(error.message); } finally { setBusy(""); }
  }

  async function remove(item) {
    if (!window.confirm(`Excluir o slide “${item.title}”?`)) return;
    setBusy(`delete-${item.id}`);
    try {
      await apiRequest(`/panel-api/home/${item.id}`, { method: "DELETE", mutate: true });
      await load();
      notify("Slide excluído.");
    } catch (error) { notify(error.message); } finally { setBusy(""); }
  }

  async function move(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const ordered = [...items];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    setBusy("order");
    try {
      const payload = await apiRequest(`/panel-api/home-order/${tab}`, { method: "PUT", body: { itemIds: ordered.map((item) => item.id) }, mutate: true });
      setHome(payload.home);
    } catch (error) { notify(error.message); } finally { setBusy(""); }
  }

  function openCreate() {
    setDraft(emptyDraft("hero", Math.min(30, (home.hero.at(-1)?.position || 0) + 1)));
  }

  return (
    <section className="page page--home-admin">
      <div className="page__header page__header--split">
        <div><p className="eyebrow">Launcher</p><h1>Conteúdo da Home</h1><p>Edite os slots atuais sem alterar a composição visual do Merlin.</p></div>
        <div className="page__actions"><button className="button button--ghost" onClick={load} disabled={loading}>{loading ? "Atualizando..." : "Atualizar"}</button><button className="button button--primary" onClick={openCreate}>+ Novo slide</button></div>
      </div>
      <div className="home-admin-tabs">
        {Object.entries(SLOT_META).map(([key, meta]) => <button key={key} className={tab === key ? "is-active" : ""} onClick={() => setTab(key)}>{meta.label} <span>{home[key]?.length || 0}/{key === "hero" ? "—" : meta.limit}</span></button>)}
      </div>
      <section className="panel panel--home-admin">
        {loading ? <div className="empty-state"><h3>Carregando conteúdo</h3><p>Buscando a configuração persistida da Home.</p></div> : (
          <div className="home-admin-list">
            {items.map((item, index) => (
              <article className="home-admin-card" key={item.id}>
                <HomeSlotPreview draft={editDraft(item)} compact />
                <div className="home-admin-card__copy"><p className="eyebrow">Posição {index + 1} · App {item.appId || "—"}</p><h2>{item.title}</h2><p>{item.slotType === "hero" ? item.displayLabel : item.secondaryText || "Sem texto secundário"}</p><span className={`badge ${item.enabled ? "badge--emerald" : "badge--muted"}`}>{item.enabled ? "Ativo" : "Inativo"}</span></div>
                <div className="home-admin-card__actions"><button className="button button--ghost button--sm" onClick={() => move(index, -1)} disabled={index === 0 || busy === "order"}>↑</button><button className="button button--ghost button--sm" onClick={() => move(index, 1)} disabled={index === items.length - 1 || busy === "order"}>↓</button><button className="button button--ghost button--sm" onClick={() => setDraft(editDraft(item))}>Editar</button>{tab === "hero" && <button className="button button--danger button--soft button--sm" onClick={() => remove(item)} disabled={busy === `delete-${item.id}`}>Excluir</button>}</div>
              </article>
            ))}
          </div>
        )}
      </section>

      {draft && (
        <Modal className="modal--home-editor" title={draft.mode === "edit" ? "Editar conteúdo da Home" : "Novo slide do carrossel"} subtitle={`Preview: ${SLOT_META[draft.slotType].label}`} onClose={() => !busy && setDraft(null)} closeDisabled={Boolean(busy)} actions={<><button className="button button--ghost" onClick={() => setDraft(null)} disabled={Boolean(busy)}>Cancelar</button><button className="button button--primary" onClick={save} disabled={busy === "save"}>{busy === "save" ? "Salvando..." : "Salvar"}</button></>}>
          <div className="home-admin-editor">
            <div className="home-admin-editor__form">
              <div className="field-grid">
                <label className="field"><span>App ID</span><div className="home-admin-app-id"><input value={draft.appId} onChange={(event) => setDraft((current) => ({ ...current, appId: event.target.value }))} /><button className="button button--ghost button--sm" type="button" onClick={resolveSteam} disabled={busy === "resolve"}>{busy === "resolve" ? "Buscando..." : "Buscar jogo"}</button></div></label>
                <label className="field"><span>Posição</span><input type="number" min="1" max={SLOT_META[draft.slotType].limit} value={draft.position} readOnly={draft.mode === "edit"} onChange={(event) => setDraft((current) => ({ ...current, position: event.target.value }))} /></label>
                <label className="field field--wide"><span>Título</span><input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></label>
                {draft.slotType === "hero" ? <><label className="field field--wide"><span>Label / estado</span><input value={draft.displayLabel} onChange={(event) => setDraft((current) => ({ ...current, displayLabel: event.target.value }))} placeholder="LANÇAMENTO • 24 SET 2026" /></label><label className="field field--wide"><span>Descrição</span><textarea rows="4" value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label></> : <label className="field field--wide"><span>Gênero / texto secundário</span><input value={draft.secondaryText} onChange={(event) => setDraft((current) => ({ ...current, secondaryText: event.target.value }))} placeholder="Preenchimento manual; o catálogo atual não fornece gênero" /></label>}
                <label className="field"><span>Imagem</span><select value={draft.imageMode} onChange={(event) => setDraft((current) => ({ ...current, imageMode: event.target.value, file: null }))}><option value="steam">Steam / automática</option><option value="custom">Personalizada</option></select></label>
                {draft.slotType === "hero" && <><label className="field"><span>Ação principal</span><select value={draft.primaryAction} onChange={(event) => setDraft((current) => ({ ...current, primaryAction: event.target.value }))}><option value="premium">Catálogo Premium</option><option value="add_game">Adicionar por link</option><option value="none">Nenhuma</option></select></label><label className="field"><span>Ação secundária</span><select value={draft.secondaryAction} onChange={(event) => setDraft((current) => ({ ...current, secondaryAction: event.target.value }))}><option value="add_game">Adicionar por link</option><option value="premium">Catálogo Premium</option><option value="none">Nenhuma</option></select></label></>}
              </div>
              {draft.imageMode === "custom" && (
                <div className={`override-upload-card home-admin-upload ${draft.file || draft.imageUrl ? "is-ready" : ""}`}>
                  <div className="override-upload-card__top">
                    <div className="override-upload-card__copy">
                      <span className="override-upload-card__label">Imagem personalizada</span>
                      <strong>{draft.file?.name || draft.imageFilename || (draft.imageUrl ? "Imagem atual reutilizada" : "Nenhuma imagem selecionada")}</strong>
                      <small>JPG, PNG ou WebP até 8 MB.</small>
                    </div>
                    <span className={`override-upload-card__status ${draft.file || draft.imageUrl ? "is-ready" : "is-empty"}`}>{draft.file || draft.imageUrl ? "Configurada" : "Pendente"}</span>
                  </div>
                  <div className="override-upload-card__actions">
                    <label className="button button--ghost button--sm override-upload-card__picker">
                      {draft.file || draft.imageUrl ? "Trocar imagem" : "Escolher imagem"}
                      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setDraft((current) => ({ ...current, file: event.target.files?.[0] || null, removeImage: false }))} />
                    </label>
                  </div>
                </div>
              )}
              {(draft.file || draft.imageUrl) && <div className="announcement-crop-action"><div><span className="override-upload-card__label">Enquadramento</span><strong>X {Math.round(draft.imagePositionX)}% · Y {Math.round(draft.imagePositionY)}%</strong></div><button className="button button--ghost" type="button" onClick={() => setCropOpen(true)}>Ajustar imagem</button></div>}
              <label className="checkbox-row"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))} /><span>Ativo</span></label>
            </div>
            <HomeSlotPreview draft={draft} />
          </div>
        </Modal>
      )}
      {draft && cropOpen && cropImageUrl && <FocalPointEditor draft={draft} imageUrl={cropImageUrl} onClose={() => setCropOpen(false)} onApply={(point) => { setDraft((current) => ({ ...current, imagePositionX: point.x, imagePositionY: point.y })); setCropOpen(false); }} />}
    </section>
  );
}
