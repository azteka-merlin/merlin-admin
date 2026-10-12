import React, { useEffect, useMemo, useState } from "react";
import Modal from "../components/Modal";

const EMPTY = {
  id: null, name: "", adminNote: "", adminNotes: { en: "", es: "", fr: "", de: "" }, executablePath: "", archiveKey: "", archiveSize: 0,
  imagePositionX: 50, imagePositionY: 50, imageZoom: 1, published: false, image: null, zip: null,
};

function prettySize(bytes) {
  const value = Number(bytes) || 0;
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.round(value / 1024)} KB`;
}

function makeDraft(game) {
  return game ? { ...EMPTY, ...game } : { ...EMPTY };
}

export default function CustomGamesPage({ apiRequest, apiUpload, notify }) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [search, setSearch] = useState("");
  const imageUrl = useMemo(() => {
    if (!draft) return "";
    if (draft.image) return URL.createObjectURL(draft.image);
    return draft.id ? `/panel-api/custom-games/${draft.id}/image?v=${encodeURIComponent(draft.imageVersion || "")}` : "";
  }, [draft?.image, draft?.id, draft?.imageVersion]);
  useEffect(() => () => { if (draft?.image && imageUrl) URL.revokeObjectURL(imageUrl); }, [draft?.image, imageUrl]);

  async function load() {
    setLoading(true);
    try {
      const result = await apiRequest("/panel-api/custom-games");
      setGames(result.games || []);
    } catch (error) { notify(error.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function uploadZip(file) {
    const started = await apiRequest("/panel-api/custom-games/upload/initiate", {
      method: "POST", mutate: true, body: { filename: file.name, sizeBytes: file.size },
    });
    const total = Math.ceil(file.size / started.partSize);
    const parts = new Array(total);
    const loaded = new Array(total).fill(0);
    let next = 0;
    let failed = false;
    const report = () => setUploadProgress({
      bytes: loaded.reduce((sum, count) => sum + count, 0), total: file.size,
      done: parts.filter(Boolean).length, count: total,
    });
    report();
    const worker = async () => {
      while (!failed && next < total) {
        const index = next++;
        const start = index * started.partSize;
        const blob = file.slice(start, Math.min(file.size, start + started.partSize));
        const query = new URLSearchParams({ key: started.key, uploadId: started.uploadId, partNumber: String(index + 1) });
        let lastError;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const result = await apiUpload(`/panel-api/custom-games/upload/part?${query}`, blob, {
              mutate: true, headers: { "Content-Type": "application/octet-stream" }, timeoutMs: 900000,
              onProgress: ({ loaded: sent }) => { loaded[index] = Math.min(blob.size, sent); report(); },
            });
            parts[index] = { partNumber: index + 1, etag: result.etag };
            loaded[index] = blob.size;
            report();
            lastError = null;
            break;
          } catch (error) {
            lastError = error;
            loaded[index] = 0;
            report();
            await new Promise(resolve => setTimeout(resolve, 700 * (attempt + 1)));
          }
        }
        if (lastError) { failed = true; throw lastError; }
      }
    };
    try {
      const results = await Promise.allSettled(Array.from({ length: Math.min(4, total) }, worker));
      const error = results.find(result => result.status === "rejected");
      if (error) throw error.reason;
      await apiRequest("/panel-api/custom-games/upload/complete", {
        method: "POST", mutate: true,
        body: { key: started.key, uploadId: started.uploadId, parts, sizeBytes: file.size },
      });
      return started.key;
    } catch (error) {
      await apiRequest("/panel-api/custom-games/upload/abort", {
        method: "POST", mutate: true, body: { key: started.key, uploadId: started.uploadId },
      }).catch(() => {});
      throw error;
    } finally { setUploadProgress(null); }
  }

  async function save() {
    if (!draft.name.trim()) return notify("Informe o nome do jogo.");
    if (!draft.image && !draft.id) return notify("Escolha uma imagem para o card.");
    if (!draft.zip && !draft.archiveKey) return notify("Escolha o ZIP do jogo.");
    if (draft.executablePath.trim() && !/\.exe$/i.test(draft.executablePath.trim())) return notify("O caminho para Jogar deve terminar em .exe.");
    setBusy(true);
    let uploadedKey = null;
    let saved = false;
    try {
      uploadedKey = draft.zip ? await uploadZip(draft.zip) : null;
      const key = uploadedKey || draft.archiveKey;
      const body = new FormData();
      body.set("name", draft.name.trim());
      body.set("adminNote", draft.adminNote.trim());
      body.set("adminNotes", JSON.stringify(draft.adminNotes));
      body.set("executablePath", draft.executablePath.trim());
      body.set("archiveKey", key);
      body.set("imagePositionX", String(draft.imagePositionX));
      body.set("imagePositionY", String(draft.imagePositionY));
      body.set("imageZoom", String(draft.imageZoom));
      body.set("published", String(draft.published));
      if (draft.image) body.set("image", draft.image);
      await apiRequest(draft.id ? `/panel-api/custom-games/${draft.id}` : "/panel-api/custom-games", {
        method: draft.id ? "PUT" : "POST", mutate: true, body,
      });
      saved = true;
      setDraft(null);
      notify("Jogo salvo no catálogo.");
      await load();
    } catch (error) {
      if (uploadedKey && !saved) {
        await apiRequest("/panel-api/custom-games/upload/discard", {
          method: "POST", mutate: true, body: { key: uploadedKey },
        }).catch(() => {});
      }
      notify(error.message || "Não foi possível salvar o jogo.");
    }
    finally { setBusy(false); }
  }

  async function remove(game) {
    if (!window.confirm(`Excluir “${game.name}” e seu ZIP do bucket?`)) return;
    try {
      await apiRequest(`/panel-api/custom-games/${game.id}`, { method: "DELETE", mutate: true });
      notify("Jogo removido do catálogo.");
      await load();
    } catch (error) { notify(error.message); }
  }

  const shown = games.filter(game => game.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const imageStyle = draft && imageUrl ? {
    backgroundImage: `url("${imageUrl}")`, backgroundPosition: `${draft.imagePositionX}% ${draft.imagePositionY}%`,
    transform: `scale(${draft.imageZoom})`, transformOrigin: `${draft.imagePositionX}% ${draft.imagePositionY}%`,
  } : {};

  return <section className="page page--custom-games">
    <div className="page__header page__header--split">
      <div><p className="eyebrow">Launcher</p><h1>Baixe e Jogue</h1><p>Catálogo de jogos ZIP instalados pelo Merlin em uma unidade escolhida pelo cliente.</p></div>
      <div className="page__actions"><button className="button button--ghost" onClick={load} disabled={loading}>Atualizar</button><button className="button button--primary" onClick={() => setDraft(makeDraft(null))}>+ Novo jogo</button></div>
    </div>
    <section className="panel">
      <label className="field"><span>Buscar jogo</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome do jogo" /></label>
      {loading ? <div className="empty-state"><h3>Carregando jogos…</h3></div> : shown.length ? <div className="custom-games-admin-grid">{shown.map(game =>
        <article className="custom-games-admin-card" key={game.id}>
          <div className="custom-games-admin-image"><img src={`/panel-api/custom-games/${game.id}/image?v=${encodeURIComponent(game.imageVersion || "")}`} alt="" style={{ objectPosition: `${game.imagePositionX}% ${game.imagePositionY}%`, transform: `scale(${game.imageZoom || 1})`, transformOrigin: `${game.imagePositionX}% ${game.imagePositionY}%` }} /></div>
          <div><h2>{game.name}</h2><p>{prettySize(game.archiveSize)} · {game.executablePath ? "Botão Jogar ativo" : "Sem botão Jogar"}</p><span className={`badge ${game.published ? "badge--emerald" : "badge--muted"}`}>{game.published ? "Publicado" : "Rascunho"}</span></div>
          <div className="custom-games-admin-actions"><button className="button button--ghost button--sm" onClick={() => setDraft(makeDraft(game))}>Editar</button><button className="button button--danger button--soft button--sm" onClick={() => remove(game)}>Excluir</button></div>
        </article>)}</div> : <div className="empty-state"><h3>Nenhum jogo cadastrado</h3><p>Crie um jogo para começar.</p></div>}
    </section>
    {draft && <Modal title={draft.id ? "Editar jogo" : "Novo jogo"} subtitle="Imagem, ZIP e instruções que aparecerão no Launcher." onClose={() => !busy && setDraft(null)} closeDisabled={busy} actions={<><button className="button button--ghost" disabled={busy} onClick={() => setDraft(null)}>Cancelar</button><button className="button button--primary" disabled={busy} onClick={save}>{busy ? "Salvando…" : "Salvar jogo"}</button></>}>
      <div className="custom-games-admin-form">
        <label className="field"><span>Nome</span><input maxLength="120" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
        <label className="field"><span>Anotação / tutorial (opcional)</span><textarea rows="4" maxLength="5000" value={draft.adminNote} onChange={e => setDraft({ ...draft, adminNote: e.target.value })} /><small>Se houver anotação, traduza-a abaixo antes de publicar.</small></label>
        {Object.entries({ en: "Inglês", es: "Espanhol", fr: "Francês", de: "Alemão" }).map(([language, label]) =>
          <label className="field" key={language}><span>Anotação em {label} (opcional)</span><textarea rows="2" maxLength="5000" value={draft.adminNotes?.[language] || ""} onChange={e => setDraft(current => ({ ...current, adminNotes: { ...current.adminNotes, [language]: e.target.value } }))} /></label>)}
        <label className="field"><span>Executável relativo à pasta do jogo (opcional)</span><input placeholder="Game/Game.exe" value={draft.executablePath} onChange={e => setDraft({ ...draft, executablePath: e.target.value })} /><small>Sem esse caminho, o Launcher não exibirá Jogar.</small></label>
        <label className="field"><span>ZIP do jogo · até 30 GB</span><input type="file" accept=".zip,application/zip" onChange={e => setDraft({ ...draft, zip: e.target.files?.[0] || null })} />{(draft.zip || draft.archiveKey) && <small>{draft.zip ? `${draft.zip.name} · ${prettySize(draft.zip.size)}` : `Arquivo atual · ${prettySize(draft.archiveSize)}`}</small>}</label>
        {uploadProgress && <div className="custom-games-admin-progress" role="status"><strong>Enviando ZIP · {Math.round(100 * uploadProgress.bytes / uploadProgress.total)}%</strong><progress max={uploadProgress.total} value={uploadProgress.bytes} /><span>{uploadProgress.done}/{uploadProgress.count} partes concluídas</span></div>}
        <label className="field"><span>Imagem · JPG, PNG ou WebP até 8 MB</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setDraft({ ...draft, image: e.target.files?.[0] || null })} /></label>
        {imageUrl && <><div className="custom-games-admin-preview"><div style={imageStyle} /></div><button className="button button--ghost button--sm" type="button" onClick={() => setCropOpen(true)}>Ajustar enquadramento</button></>}
        <label className="checkbox-row"><input type="checkbox" checked={draft.published} onChange={e => setDraft({ ...draft, published: e.target.checked })} /><span>Publicado no Launcher</span></label>
      </div>
    </Modal>}
    {draft && cropOpen && imageUrl && <Modal title="Ajustar imagem" subtitle="Prévia do card Baixe e Jogue." onClose={() => setCropOpen(false)} actions={<button className="button button--primary" onClick={() => setCropOpen(false)}>Aplicar</button>}>
      <div className="custom-games-admin-preview"><div style={imageStyle} /></div>
      <div className="home-admin-position-controls">
        {[ ["Horizontal", "imagePositionX", 0, 100, 1], ["Vertical", "imagePositionY", 0, 100, 1], ["Zoom", "imageZoom", 1, 4, 0.01] ].map(([label, key, min, max, step]) =>
          <label key={key}><span>{label} <strong>{key === "imageZoom" ? `${Number(draft[key]).toFixed(2)}×` : `${draft[key]}%`}</strong></span><input type="range" min={min} max={max} step={step} value={draft[key]} onChange={e => setDraft(current => ({ ...current, [key]: Number(e.target.value) }))} /></label>)}
      </div>
    </Modal>}
  </section>;
}
