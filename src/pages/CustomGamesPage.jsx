import React, { useEffect, useMemo, useRef, useState } from "react";
import Modal from "../components/Modal";
import { runCustomGameFolderUpload, discardFolderUpload } from "../utils/custom-game-folder-upload";
import { loadUploadCheckpoint, deleteUploadCheckpoint, listUploadCheckpoints } from "../utils/custom-game-upload-store";

const EMPTY = {
  id: null, name: "", adminNote: "", adminNotes: { en: "", es: "", fr: "", de: "" }, executablePath: "",
  archiveKey: "", archiveSize: 0, packageType: "zip", originalPackageType: null,
  imagePositionX: 50, imagePositionY: 50, imageZoom: 1, published: false, image: null, zip: null, folderFiles: [],
};


function prettySize(bytes) {
  const value = Number(bytes) || 0;
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.round(value / 1024)} KB`;
}

function prettyRate(bytesPerSecond) {
  const value = Number(bytesPerSecond) || 0;
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB/s`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB/s`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB/s`;
  return `${Math.round(value)} B/s`;
}

function prettyPercent(done, total) {
  if (!total) return "0,0%";
  return `${(Math.floor(1000 * Math.min(done, total) / total) / 10).toFixed(1).replace(".", ",")}%`;
}

function prettyDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "calculando…";
  const value = Math.ceil(seconds);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const remaining = value % 60;
  return hours ? `${hours}h ${String(minutes).padStart(2, "0")}min` : `${minutes}min ${String(remaining).padStart(2, "0")}s`;
}

function uploadStats(label, bytes, total, done, count, startedAt) {
  const elapsed = Math.max(.5, (Date.now() - startedAt) / 1000);
  const speed = bytes / elapsed;
  const warmingUp = elapsed < 12 || bytes < Math.min(total * .005, 128 * 1024 ** 2);
  return { label, bytes, total, done, count, speed, etaSeconds: !warmingUp && speed > 0 ? (total - bytes) / speed : null };
}


function makeDraft(game) {
  return game ? { ...EMPTY, ...game, gameId: game.id, originalPackageType: game.packageType || "zip" }
    : { ...EMPTY, gameId: crypto.randomUUID() };
}

export default function CustomGamesPage({ apiRequest, apiUpload, notify }) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const uploadController = useRef(null);
  const saveInProgress = useRef(false);
  const [pendingUploads, setPendingUploads] = useState([]);
  const stagedPackages = useRef(new Map());
  const [search, setSearch] = useState("");
  const imageUrl = useMemo(() => {
    if (!draft) return "";
    if (draft.image) return URL.createObjectURL(draft.image);
    return draft.id && draft.imageVersion ? `/panel-api/custom-games/${draft.id}/image?v=${encodeURIComponent(draft.imageVersion)}` : "";
  }, [draft?.image, draft?.id, draft?.imageVersion]);
  useEffect(() => () => { if (draft?.image && imageUrl) URL.revokeObjectURL(imageUrl); }, [draft?.image, imageUrl]);
  async function refreshPendingUploads() { setPendingUploads(await listUploadCheckpoints()); }
  useEffect(() => { void refreshPendingUploads(); }, []);
  useEffect(() => {
    if (!busy) return;
    const beforeUnload = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [busy]);

  async function load() {
    setLoading(true);
    try {
      const result = await apiRequest("/panel-api/custom-games");
      setGames(result.games || []);
    } catch (error) { notify(error.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function uploadZip(file, gameId, signal) {
    const started = await apiRequest("/panel-api/custom-games/upload/initiate", {
      method: "POST", mutate: true, body: { gameId, filename: file.name, sizeBytes: file.size },
    });
    const total = Math.ceil(file.size / started.partSize);
    const parts = new Array(total);
    const loaded = new Array(total).fill(0);
    const startedAt = Date.now();
    let next = 0;
    let failed = false;
    const report = () => setUploadProgress(uploadStats("Enviando ZIP", loaded.reduce((sum, count) => sum + count, 0),
      file.size, parts.filter(Boolean).length, total, startedAt));
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
              signal,
              onProgress: ({ loaded: sent }) => { loaded[index] = Math.min(blob.size, sent); report(); },
            });
            parts[index] = { partNumber: index + 1, etag: result.etag };
            loaded[index] = blob.size;
            report();
            lastError = null;
            break;
          } catch (error) {
            if (signal?.aborted) throw error;
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
      if (signal?.aborted) {
        await apiRequest("/panel-api/custom-games/upload/discard", {
          method: "POST", mutate: true, body: { key: started.key },
        }).catch(() => {});
        throw new Error("Upload canceled");
      }
      return started.key;
    } catch (error) {
      await apiRequest("/panel-api/custom-games/upload/abort", {
        method: "POST", mutate: true, body: { key: started.key, uploadId: started.uploadId },
      }).catch(() => {});
      throw error;
    } finally { setUploadProgress(null); }
  }

  async function uploadFolder(files, gameId, signal) {
    return runCustomGameFolderUpload({ files, gameId, signal, apiRequest, apiUpload,
      onProgress: setUploadProgress,
      onSession: () => { void refreshPendingUploads(); },
    });
  }

  async function save() {
    if (saveInProgress.current) return;
    saveInProgress.current = true;
    try { await saveDraft(); }
    finally { saveInProgress.current = false; }
  }

  async function saveDraft() {
    if (uploadController.current) return;
    setUploadError("");
    const gameName = String(draft.name ?? "").trim();
    const executablePath = String(draft.executablePath ?? "").trim();
    if (draft.published && !gameName) return notify("Informe o nome do jogo antes de publicar.");
    if (draft.published && !draft.image && !draft.imageVersion) return notify("Escolha uma imagem para o card antes de publicar.");
    const pending = draft.packageType === "folder" ? await loadUploadCheckpoint(draft.gameId) : null;
    const usingExistingPackage = (draft.originalPackageType === draft.packageType && Boolean(draft.archiveKey)) || Boolean(pending?.manifestKey);
    if (draft.published && draft.packageType === "zip" && !draft.zip && !usingExistingPackage) return notify("Escolha o ZIP do jogo antes de publicar.");
    if (draft.published && draft.packageType === "folder" && !draft.folderFiles.length && !usingExistingPackage) return notify("Escolha uma pasta do jogo antes de publicar.");
    if (executablePath && !/\.exe$/i.test(executablePath)) return notify("O caminho para Jogar deve terminar em .exe.");
    setBusy(true);
    let uploadedPackage = null;
    let saved = false;
    let savedGameId = draft.id;
    const controller = new AbortController();
    uploadController.current = controller;
    try {
      // Persist the draft before transferring bytes so its gameId survives a
      // reload and the upload can be found under Edit again.
      if (!draft.id && draft.packageType === "folder" && draft.folderFiles.length) {
        const initial = new FormData();
        initial.set("gameId", draft.gameId);
        initial.set("name", gameName);
        initial.set("adminNote", String(draft.adminNote ?? "").trim());
        initial.set("adminNotes", JSON.stringify(draft.adminNotes || {}));
        initial.set("executablePath", executablePath);
        initial.set("imagePositionX", String(draft.imagePositionX));
        initial.set("imagePositionY", String(draft.imagePositionY));
        initial.set("imageZoom", String(draft.imageZoom));
        if (draft.image) initial.set("image", draft.image);
        initial.set("packageType", "folder");
        initial.set("published", "false");
        try { await apiRequest("/panel-api/custom-games", { method: "POST", mutate: true, body: initial }); }
        catch (error) {
          const current = await apiRequest("/panel-api/custom-games");
          if (!current.games?.some(game => game.id === draft.gameId)) throw error;
        }
        savedGameId = draft.gameId;
        setDraft(current => current ? { ...current, id: draft.gameId } : current);
      }
      if (draft.packageType === "zip" && draft.zip) uploadedPackage = { key: await uploadZip(draft.zip, draft.gameId, controller.signal), sizeBytes: draft.zip.size };
      if (draft.packageType === "folder" && draft.folderFiles.length) uploadedPackage = await uploadFolder(draft.folderFiles, draft.gameId, controller.signal);
      if (draft.packageType === "folder" && !draft.folderFiles.length) {
        const stored = await loadUploadCheckpoint(draft.gameId);
        if (stored?.manifestKey) uploadedPackage = { key: stored.manifestKey, sizeBytes: stored.totalSizeBytes };
      }
      if (controller.signal.aborted) throw new Error("Upload canceled");
      const key = uploadedPackage?.key || (usingExistingPackage ? draft.archiveKey : "");
      const body = new FormData();
      body.set("gameId", draft.gameId);
      body.set("name", gameName);
      body.set("adminNote", String(draft.adminNote ?? "").trim());
      body.set("adminNotes", JSON.stringify(draft.adminNotes || {}));
      body.set("executablePath", executablePath);
      body.set("packageType", draft.packageType);
      body.set("archiveKey", key);
      body.set("imagePositionX", String(draft.imagePositionX));
      body.set("imagePositionY", String(draft.imagePositionY));
      body.set("imageZoom", String(draft.imageZoom));
      body.set("published", String(draft.published));
      if (draft.image) body.set("image", draft.image);
      await apiRequest(savedGameId ? `/panel-api/custom-games/${savedGameId}` : "/panel-api/custom-games", {
        method: savedGameId ? "PUT" : "POST", mutate: true, body,
      });
      saved = true;
      if (draft.packageType === "folder" && uploadedPackage?.key) await deleteUploadCheckpoint(draft.gameId);
      stagedPackages.current.delete(draft.gameId);
      setDraft(null);
      notify(draft.published ? "Jogo publicado no Launcher." : "Rascunho salvo.");
      await load();
    } catch (error) {
      if (uploadedPackage?.key && !saved) {
        stagedPackages.current.set(draft.gameId, uploadedPackage.key);
        setDraft(current => current?.gameId === draft.gameId ? {
          ...current, archiveKey: uploadedPackage.key, archiveSize: uploadedPackage.sizeBytes || current.archiveSize,
          originalPackageType: current.packageType, zip: null, folderFiles: [],
        } : current);
      }
      const message = controller.signal.aborted ? "Upload cancelado. Os arquivos temporários foram descartados."
        : `${error.message || "Não foi possível salvar o jogo."} ${draft.packageType === "folder" || stagedPackages.current.has(draft.gameId) ? "O progresso foi preservado. Selecione a mesma pasta e salve para continuar." : ""}`.trim();
      setUploadError(message);
      notify(message);
    }
    finally { uploadController.current = null; setUploadProgress(null); setBusy(false); void refreshPendingUploads(); }
  }

  function cancelUpload() {
    if (!uploadController.current || !uploadProgress) return;
    uploadController.current.abort();
    setUploadProgress(current => current ? { ...current, canceling: true } : current);
  }

  async function closeDraft() {
    if (!draft || busy) return;
    if (draft.packageType === "zip" && stagedPackages.current.has(draft.gameId)) {
      try {
        await apiRequest("/panel-api/custom-games/upload/discard", {
          method: "POST", mutate: true, body: { key: stagedPackages.current.get(draft.gameId) },
        });
        stagedPackages.current.delete(draft.gameId);
      } catch (error) { notify(error.message); return; }
    }
    setUploadError("");
    setDraft(null);
    await refreshPendingUploads();
  }

  async function discardPendingUpload(gameId) {
    setBusy(true);
    try {
      const stored = await loadUploadCheckpoint(gameId);
      if (stored?.manifestKey) {
        await apiRequest("/panel-api/custom-games/upload/discard", {
          method: "POST", mutate: true, body: { key: stored.manifestKey },
        });
        await deleteUploadCheckpoint(gameId);
      } else await discardFolderUpload(gameId, apiRequest);
      stagedPackages.current.delete(gameId);
      await refreshPendingUploads();
      notify("Envio pendente descartado.");
    } catch (error) { notify(error.message); }
    finally { setBusy(false); }
  }

  async function remove(game) {
    if (!window.confirm(`Excluir “${game.name || "Rascunho sem nome"}” e seu pacote do bucket?`)) return;
    try {
      if (pendingUploads.some(upload => upload.gameId === game.id && !upload.manifestKey)) await discardFolderUpload(game.id, apiRequest);
      await apiRequest(`/panel-api/custom-games/${game.id}`, { method: "DELETE", mutate: true });
      await deleteUploadCheckpoint(game.id);
      await refreshPendingUploads();
      notify("Jogo removido do catálogo.");
      await load();
    } catch (error) { notify(error.message); }
  }

  const shown = games.filter(game => game.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const imageStyle = draft && imageUrl ? {
    backgroundImage: `url("${imageUrl}")`, backgroundPosition: `${draft.imagePositionX}% ${draft.imagePositionY}%`,
    transform: `scale(${draft.imageZoom})`, transformOrigin: `${draft.imagePositionX}% ${draft.imagePositionY}%`,
  } : {};
  const pendingUpload = draft && pendingUploads.find(upload => upload.gameId === draft.gameId);

  return <section className="page page--custom-games">
    <div className="page__header page__header--split">
      <div><p className="eyebrow">Launcher</p><h1>Baixe e Jogue</h1><p>Catálogo de jogos em ZIP ou pasta, instalados pelo Merlin em uma unidade escolhida pelo cliente.</p></div>
      <div className="page__actions"><button className="button button--ghost" onClick={load} disabled={loading}>Atualizar</button><button className="button button--primary" onClick={() => { setUploadError(""); setDraft(makeDraft(null)); }}>+ Novo jogo</button></div>
    </div>
    <section className="panel">
      <label className="field"><span>Buscar jogo</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome do jogo" /></label>
      {loading ? <div className="empty-state"><h3>Carregando jogos…</h3></div> : shown.length ? <div className="custom-games-admin-grid">{shown.map(game =>
        <article className="custom-games-admin-card" key={game.id}>
          <div className="custom-games-admin-image">{game.imageVersion ? <img src={`/panel-api/custom-games/${game.id}/image?v=${encodeURIComponent(game.imageVersion)}`} alt="" style={{ objectPosition: `${game.imagePositionX}% ${game.imagePositionY}%`, transform: `scale(${game.imageZoom || 1})`, transformOrigin: `${game.imagePositionX}% ${game.imagePositionY}%` }} /> : <span>Sem imagem</span>}</div>
          <div><h2>{game.name || "Rascunho sem nome"}</h2><p>{game.archiveKey ? `${prettySize(game.archiveSize)} · ${game.packageType === "folder" ? "Pasta" : "ZIP"}` : "Pacote pendente"} · {game.executablePath ? "Botão Jogar ativo" : "Sem botão Jogar"}</p><span className={`badge ${game.published ? "badge--emerald" : "badge--muted"}`}>{game.published ? "Publicado" : "Rascunho"}</span></div>
          <div className="custom-games-admin-actions"><button className="button button--ghost button--sm" onClick={() => { setUploadError(""); setDraft(makeDraft(game)); }}>Editar</button><button className="button button--danger button--soft button--sm" onClick={() => remove(game)}>Excluir</button></div>
        </article>)}</div> : <div className="empty-state"><h3>Nenhum jogo cadastrado</h3><p>Crie um jogo para começar.</p></div>}
    </section>
    {draft && <Modal title={draft.id ? "Editar jogo" : "Novo jogo"} subtitle="Salve como rascunho e complete os dados antes de publicar no Launcher." dismissOnBackdrop={false} onClose={closeDraft} closeDisabled={busy} closeConfirmMessage="Fechar a edição? O progresso do envio será preservado para continuar depois." actions={<><button className="button button--ghost" disabled={busy} onClick={() => { void closeDraft(); }}>Fechar</button><button className="button button--primary" disabled={busy} onClick={save}>{busy ? "Salvando…" : draft.published ? "Publicar jogo" : "Salvar rascunho"}</button></>}>
      <div className="custom-games-admin-form">
        {uploadError && <p className="custom-games-admin-error" role="alert">{uploadError}</p>}
        {pendingUpload && !busy && <div className="empty-state"><p>{pendingUpload.manifestKey ? "O envio está concluído. Salve o jogo para vincular os arquivos." : "Há um envio preservado. Selecione a mesma pasta e salve para continuar de onde parou."}</p><button type="button" className="button button--ghost button--sm" onClick={() => discardPendingUpload(draft.gameId)}>Descartar envio pendente</button></div>}
        <label className="field"><span>Nome</span><input maxLength="120" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
        <label className="field"><span>Anotação / tutorial (opcional)</span><textarea rows="4" maxLength="5000" value={draft.adminNote} onChange={e => setDraft({ ...draft, adminNote: e.target.value })} /><small>Se houver anotação, traduza-a abaixo antes de publicar.</small></label>
        {Object.entries({ en: "Inglês", es: "Espanhol", fr: "Francês", de: "Alemão" }).map(([language, label]) =>
          <label className="field" key={language}><span>Anotação em {label} (opcional)</span><textarea rows="2" maxLength="5000" value={draft.adminNotes?.[language] || ""} onChange={e => setDraft(current => ({ ...current, adminNotes: { ...current.adminNotes, [language]: e.target.value } }))} /></label>)}
        <label className="field"><span>Executável relativo à pasta do jogo (opcional)</span><input placeholder="Game/Game.exe" value={draft.executablePath} onChange={e => setDraft({ ...draft, executablePath: e.target.value })} /><small>Sem esse caminho, o Launcher não exibirá Jogar.</small></label>
        <fieldset className="custom-games-package-options"><legend>Formato do pacote</legend><label className={`custom-games-package-option${draft.packageType === "zip" ? " is-selected" : ""}`}><input type="radio" name="customGamePackageType" checked={draft.packageType === "zip"} onChange={() => setDraft(current => ({ ...current, packageType: "zip" }))} /><span><strong>Arquivo ZIP</strong><small>Até 30 GiB · o Launcher descompacta após baixar</small></span></label><label className={`custom-games-package-option${draft.packageType === "folder" ? " is-selected" : ""}`}><input type="radio" name="customGamePackageType" checked={draft.packageType === "folder"} onChange={() => setDraft(current => ({ ...current, packageType: "folder" }))} /><span><strong>Pasta do jogo</strong><small>Até 200 GiB · arquivos agrupados em pacotes de até 200 MiB</small></span></label></fieldset>
        {draft.packageType === "zip" ? <label className="field"><span>ZIP do jogo</span><input type="file" accept=".zip,application/zip" onChange={e => setDraft(current => ({ ...current, zip: e.target.files?.[0] || null }))} />{(draft.zip || (draft.originalPackageType === "zip" && draft.archiveKey)) && <small>{draft.zip ? `${draft.zip.name} · ${prettySize(draft.zip.size)}` : `ZIP atual · ${prettySize(draft.archiveSize)}`}</small>}</label> : <label className="field"><span>Pasta do jogo</span><input type="file" webkitdirectory="" directory="" multiple onChange={e => setDraft(current => ({ ...current, folderFiles: Array.from(e.target.files || []) }))} /><small>{draft.folderFiles.length ? `${draft.folderFiles.length} arquivos · ${prettySize(draft.folderFiles.reduce((sum, file) => sum + file.size, 0))}` : draft.originalPackageType === "folder" && draft.archiveKey ? `Pasta atual · ${prettySize(draft.archiveSize)}` : "Selecione a pasta que contém os arquivos do jogo. O diretório escolhido vira a raiz da instalação."}</small></label>}
        {uploadProgress && <div className="custom-games-admin-progress" role="status">
          <div className="custom-games-admin-progress__heading">
            <strong>{uploadProgress.canceling ? "Cancelando upload…" : uploadProgress.label}</strong>
            <button type="button" className="button button--danger button--soft button--sm" onClick={cancelUpload} disabled={uploadProgress.canceling || uploadProgress.finalizing}>Cancelar upload</button>
          </div>
          <div className="custom-games-admin-progress__meter">
            <span>Dados enviados: {prettySize(uploadProgress.bytes)} de {prettySize(uploadProgress.total)} · {prettyPercent(uploadProgress.bytes, uploadProgress.total)}</span>
            <progress max={uploadProgress.total} value={uploadProgress.bytes} />
          </div>
          {uploadProgress.folder && <>
            <div className="custom-games-admin-progress__meter">
              <span>Arquivos preparados: {uploadProgress.preparedFiles || 0} de {uploadProgress.count}</span>
              <progress max={uploadProgress.count} value={uploadProgress.preparedFiles || 0} />
            </div>
            <small>Arquivos confirmados: {uploadProgress.done} de {uploadProgress.count} · Pacotes e arquivos enviados: {uploadProgress.confirmedObjects || 0}/{uploadProgress.totalObjects || 0}</small>
          </>}
          <div className="custom-games-admin-progress__details">
            <span>Velocidade atual: {prettyRate(uploadProgress.speed)}</span>
            <span>{uploadProgress.finalizing ? "Conferindo arquivos…" : uploadProgress.etaHint || `Restante estimado: ≈ ${prettyDuration(uploadProgress.etaSeconds)}`}</span>
          </div>
          {uploadProgress.elapsedSeconds != null && <small>Tempo decorrido: {prettyDuration(uploadProgress.elapsedSeconds)} · Média total: {prettyRate(uploadProgress.averageSpeed)}</small>}
          {uploadProgress.resumePersistent === false && <small>O navegador não permitiu salvar a retomada. Mantenha esta aba aberta até concluir.</small>}
        </div>}
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
