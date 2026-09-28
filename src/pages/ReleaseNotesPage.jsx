import React, { useEffect, useMemo, useState } from "react";
import Modal from "../components/Modal";

const LOCALES = [
  ["ptbr", "Português"],
  ["en", "English"],
  ["es", "Español"],
  ["fr", "Français"],
  ["de", "Deutsch"],
];

const ICON_OPTIONS = ["home", "steam", "library", "settings", "sparkles", "wrench", "gift", "megaphone"];
const ICON_LABELS = {
  home: "Início",
  steam: "Steam",
  library: "Biblioteca",
  settings: "Configurações",
  sparkles: "Brilho",
  wrench: "Ferramenta",
  gift: "Presente",
  megaphone: "Comunicado",
};

function emptyLocalization(locale) {
  return {
    locale,
    title: "",
    subtitle: "",
    summary: "",
    highlights: [{ icon: "sparkles", title: "", description: "" }],
    fullContent: [],
  };
}

function emptyDraft() {
  return {
    mode: "create",
    id: null,
    version: "",
    type: "standard",
    published: false,
    publishedAt: "",
    heroAssetUrl: "",
    heroAssetFilename: "",
    file: null,
    removeHeroAsset: false,
    localizations: LOCALES.map(([locale]) => emptyLocalization(locale)),
  };
}

function toLocalDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function editDraft(release) {
  const existing = new Map((release.localizations || []).map((item) => [item.locale, item]));
  return {
    mode: "edit",
    id: release.id,
    version: release.version,
    type: release.type,
    published: release.published,
    publishedAt: toLocalDateTime(release.publishedAt),
    heroAssetUrl: release.heroAssetUrl || "",
    heroAssetFilename: release.heroAssetFilename || "",
    file: null,
    removeHeroAsset: false,
    localizations: LOCALES.map(([locale]) => ({ ...emptyLocalization(locale), ...(existing.get(locale) || {}) })),
  };
}

function fillMissingTranslations(draft) {
  const primary = draft.localizations.find((item) => item.locale === "ptbr") || draft.localizations[0];
  return draft.localizations.map((item) => ({
    ...item,
    title: item.title.trim() || primary.title.trim(),
    subtitle: item.subtitle.trim() || primary.subtitle.trim(),
    summary: item.summary.trim() || primary.summary.trim(),
    highlights: item.highlights.some((entry) => entry.title.trim() || entry.description.trim())
      ? item.highlights
      : primary.highlights.map((entry) => ({ ...entry })),
    fullContent: item.fullContent.some((entry) => String(entry).trim()) ? item.fullContent : [...primary.fullContent],
  }));
}

function validate(draft) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(draft.version.trim())) throw new Error("Informe uma versão como 2.1.0.");
  const localizations = fillMissingTranslations(draft);
  const primary = localizations.find((item) => item.locale === "ptbr");
  if (!primary.title || !primary.subtitle || !primary.summary) throw new Error("Preencha título, subtítulo e resumo em Português.");
  if (!primary.highlights.some((item) => item.title.trim() && item.description.trim())) throw new Error("Adicione ao menos um destaque.");
  if (!primary.fullContent.some((item) => String(item).trim())) throw new Error("Adicione ao menos um item no changelog completo.");
  return localizations.map((item) => ({
    ...item,
    highlights: item.highlights.filter((entry) => entry.title.trim() && entry.description.trim()),
    fullContent: item.fullContent.map((entry) => String(entry).trim()).filter(Boolean),
  }));
}

function ReleasePreview({ draft, locale = "ptbr" }) {
  const content = draft.localizations.find((item) => item.locale === locale) || draft.localizations[0];
  const assetUrl = useMemo(() => draft.file ? URL.createObjectURL(draft.file) : draft.removeHeroAsset ? "" : draft.heroAssetUrl, [draft.file, draft.heroAssetUrl, draft.removeHeroAsset]);
  useEffect(() => () => { if (draft.file && assetUrl) URL.revokeObjectURL(assetUrl); }, [draft.file, assetUrl]);
  const highlights = content.highlights.filter((item) => item.title || item.description);

  if (draft.type === "standard") {
    return (
      <div className="release-admin-preview release-admin-preview--standard">
        <div className="release-admin-preview__brand"><span>✦</span><strong>MERLIN</strong></div>
        <small>VERSÃO {draft.version || "2.1.0"}</small>
        <h2>{content.title || "Título da atualização"}</h2>
        <p>{content.summary || "Um resumo breve das novidades desta versão."}</p>
        <ul>{content.fullContent.filter(Boolean).slice(0, 4).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
        <div className="release-admin-preview__actions"><i>Ver todas as mudanças</i><b>Entendi</b></div>
      </div>
    );
  }

  return (
    <div className="release-admin-preview release-admin-preview--major">
      <div className="release-admin-preview__major-copy">
        <div className="release-admin-preview__brand"><span>✦</span><strong>MERLIN</strong></div>
        <small>VERSÃO {draft.version || "2.0.0"}</small>
        <h2>{content.title || "O MERLIN 2.0 CHEGOU"}</h2>
        <p>{content.subtitle || "Uma nova experiência, por dentro e por fora."}</p>
        <div className="release-admin-preview__highlights">
          {highlights.slice(0, 5).map((item, index) => <div key={`${item.title}-${index}`}><span>✦</span><section><strong>{item.title}</strong><p>{item.description}</p></section></div>)}
        </div>
        <div className="release-admin-preview__actions"><b>✦ Explorar o Merlin {draft.version || "2.0.0"}</b><i>Ver todas as mudanças</i></div>
      </div>
      <div className="release-admin-preview__art">{assetUrl ? <img src={assetUrl} alt="Preview da arte" /> : <span>Envie a arte da release</span>}</div>
    </div>
  );
}

export default function ReleaseNotesPage({ apiRequest, notify }) {
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(null);
  const [locale, setLocale] = useState("ptbr");
  const [busy, setBusy] = useState("");

  async function load() {
    setLoading(true);
    try {
      const payload = await apiRequest("/panel-api/release-notes");
      setReleases(payload.releases || []);
    } catch (error) {
      notify(error.message || "Não foi possível carregar as novidades.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function setLocalization(patch) {
    setDraft((current) => ({
      ...current,
      localizations: current.localizations.map((item) => item.locale === locale ? { ...item, ...patch } : item),
    }));
  }

  function setHighlight(index, patch) {
    const content = draft.localizations.find((item) => item.locale === locale);
    const highlights = content.highlights.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item);
    setLocalization({ highlights });
  }

  function moveHighlight(index, direction) {
    const content = draft.localizations.find((item) => item.locale === locale);
    const target = index + direction;
    if (target < 0 || target >= content.highlights.length) return;
    const highlights = [...content.highlights];
    [highlights[index], highlights[target]] = [highlights[target], highlights[index]];
    setLocalization({ highlights });
  }

  async function save() {
    let localizations;
    try { localizations = validate(draft); } catch (error) { notify(error.message); return; }
    setBusy("save");
    try {
      const formData = new FormData();
      formData.append("version", draft.version.trim());
      formData.append("type", draft.type);
      formData.append("published", String(draft.published));
      formData.append("publishedAt", draft.publishedAt || "");
      formData.append("removeHeroAsset", String(draft.removeHeroAsset));
      formData.append("localizations", JSON.stringify(localizations));
      if (draft.file) formData.append("file", draft.file);
      await apiRequest(draft.mode === "edit" ? `/panel-api/release-notes/${draft.id}` : "/panel-api/release-notes", {
        method: draft.mode === "edit" ? "PUT" : "POST",
        body: formData,
        mutate: true,
      });
      setDraft(null);
      await load();
      notify("Novidade salva.");
    } catch (error) {
      notify(error.message || "Não foi possível salvar a novidade.");
    } finally {
      setBusy("");
    }
  }

  async function remove(release) {
    if (!window.confirm(`Excluir a novidade da versão ${release.version}?`)) return;
    setBusy(`delete-${release.id}`);
    try {
      await apiRequest(`/panel-api/release-notes/${release.id}`, { method: "DELETE", mutate: true });
      await load();
      notify("Novidade excluída.");
    } catch (error) {
      notify(error.message || "Não foi possível excluir.");
    } finally {
      setBusy("");
    }
  }

  const content = draft?.localizations.find((item) => item.locale === locale);
  return (
    <section className="page page--release-notes">
      <div className="page__header page__header--split">
        <div><p className="eyebrow">Launcher</p><h1>Novidades / Changelog</h1><p>Gerencie releases Major e Standard exibidas no Merlin.</p></div>
        <div className="page__actions"><button className="button button--ghost" onClick={load} disabled={loading}>{loading ? "Atualizando..." : "Atualizar"}</button><button className="button button--primary" onClick={() => { setLocale("ptbr"); setDraft(emptyDraft()); }}>+ Nova release</button></div>
      </div>
      <section className="panel panel--release-notes">
        {loading ? <div className="empty-state"><h3>Carregando novidades</h3></div> : !releases.length ? <div className="empty-state"><h3>Nenhuma release cadastrada</h3><p>Crie a primeira novidade do Merlin.</p></div> : (
          <div className="release-admin-list">
            {releases.map((release) => {
              const pt = release.localizations?.find((item) => item.locale === "ptbr") || release.localizations?.[0];
              return <article className="release-admin-card" key={release.id}>
                <div className={`release-admin-card__kind is-${release.type}`}>{release.type === "major" ? "MAJOR" : "STANDARD"}</div>
                <div><p className="eyebrow">Versão {release.version}</p><h2>{pt?.title || "Sem título"}</h2><p>{pt?.summary || pt?.subtitle}</p></div>
                <span className={`badge ${release.published ? "badge--emerald" : "badge--muted"}`}>{release.published ? "Publicada" : "Rascunho"}</span>
                <div className="release-admin-card__actions"><button className="button button--ghost button--sm" onClick={() => { setLocale("ptbr"); setDraft(editDraft(release)); }}>Editar</button><button className="button button--danger button--soft button--sm" disabled={busy === `delete-${release.id}`} onClick={() => remove(release)}>Excluir</button></div>
              </article>;
            })}
          </div>
        )}
      </section>

      {draft && <Modal
        className="modal--release-editor"
        title={draft.mode === "edit" ? `Editar Merlin ${draft.version}` : "Nova novidade do Merlin"}
        subtitle="Conteúdo, arte e preview da experiência exibida no Launcher."
        onClose={() => !busy && setDraft(null)}
        closeDisabled={Boolean(busy)}
        actions={<><button className="button button--ghost" onClick={() => setDraft(null)} disabled={Boolean(busy)}>Cancelar</button><button className="button button--primary" onClick={save} disabled={busy === "save"}>{busy === "save" ? "Salvando..." : "Salvar"}</button></>}
      >
        <div className="release-admin-editor">
          <div className="release-admin-editor__form">
            <div className="field-grid">
              <label className="field"><span>Versão</span><input value={draft.version} placeholder="2.1.0" onChange={(event) => setDraft((current) => ({ ...current, version: event.target.value }))} /></label>
              <label className="field"><span>Tipo</span><select value={draft.type} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value }))}><option value="major">Major</option><option value="standard">Standard</option></select></label>
              <label className="field field--wide"><span>Publicar em</span><input type="datetime-local" value={draft.publishedAt} onChange={(event) => setDraft((current) => ({ ...current, publishedAt: event.target.value }))} /></label>
            </div>
            <label className="checkbox-row"><input type="checkbox" checked={draft.published} onChange={(event) => setDraft((current) => ({ ...current, published: event.target.checked }))} /><span>Publicada</span></label>
            <div className="release-admin-locales" role="tablist" aria-label="Idiomas">
              {LOCALES.map(([key, label]) => <button type="button" key={key} className={locale === key ? "is-active" : ""} onClick={() => setLocale(key)}>{label}</button>)}
            </div>
            <div className="field-grid">
              <label className="field field--wide"><span>Título</span><input value={content.title} onChange={(event) => setLocalization({ title: event.target.value })} /></label>
              <label className="field field--wide"><span>Subtítulo</span><input value={content.subtitle} onChange={(event) => setLocalization({ subtitle: event.target.value })} /></label>
              <label className="field field--wide"><span>Resumo</span><textarea rows="3" value={content.summary} onChange={(event) => setLocalization({ summary: event.target.value })} /></label>
            </div>
            <section className="release-admin-highlights-editor">
              <header><div><strong>Destaques</strong><small>Ordem exibida na modal.</small></div><button className="button button--ghost button--sm" type="button" onClick={() => setLocalization({ highlights: [...content.highlights, { icon: "sparkles", title: "", description: "" }] })}>+ Destaque</button></header>
              {content.highlights.map((item, index) => <div className="release-admin-highlight-row" key={index}>
                <select aria-label="Ícone" value={item.icon} onChange={(event) => setHighlight(index, { icon: event.target.value })}>{ICON_OPTIONS.map((icon) => <option key={icon} value={icon}>{ICON_LABELS[icon]}</option>)}</select>
                <input aria-label="Título" placeholder="Título" value={item.title} onChange={(event) => setHighlight(index, { title: event.target.value })} />
                <textarea aria-label="Descrição" rows="2" placeholder="Descrição" value={item.description} onChange={(event) => setHighlight(index, { description: event.target.value })} />
                <div><button type="button" title="Mover destaque para cima" aria-label="Mover destaque para cima" onClick={() => moveHighlight(index, -1)} disabled={index === 0}>↑</button><button type="button" title="Mover destaque para baixo" aria-label="Mover destaque para baixo" onClick={() => moveHighlight(index, 1)} disabled={index === content.highlights.length - 1}>↓</button><button type="button" title="Remover destaque" aria-label="Remover destaque" onClick={() => setLocalization({ highlights: content.highlights.filter((_, itemIndex) => itemIndex !== index) })}>×</button></div>
              </div>)}
            </section>
            <label className="field"><span>Changelog completo · um item por linha</span><textarea rows="8" value={content.fullContent.join("\n")} onChange={(event) => setLocalization({ fullContent: event.target.value.split("\n") })} /></label>
            <label className={`override-upload-card release-admin-upload ${draft.file || (draft.heroAssetUrl && !draft.removeHeroAsset) ? "is-ready" : ""}`}>
              <input type="file" accept="image/png,image/webp,image/jpeg" onChange={(event) => setDraft((current) => ({ ...current, file: event.target.files?.[0] || null, removeHeroAsset: false }))} />
              <div><span className="override-upload-card__label">Arte da release</span><strong>{draft.file?.name || draft.heroAssetFilename || "Nenhuma arte selecionada"}</strong><p>PNG transparente recomendado. Sem crop; exibida proporcionalmente.</p></div>
            </label>
            {draft.heroAssetUrl && !draft.file && <label className="checkbox-row"><input type="checkbox" checked={draft.removeHeroAsset} onChange={(event) => setDraft((current) => ({ ...current, removeHeroAsset: event.target.checked }))} /><span>Remover arte atual</span></label>}
          </div>
          <div className="release-admin-editor__preview"><p className="eyebrow">Preview {draft.type === "major" ? "Major" : "Standard"}</p><ReleasePreview draft={draft} locale={locale} /></div>
        </div>
      </Modal>}
    </section>
  );
}
