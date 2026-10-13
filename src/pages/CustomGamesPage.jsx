import React, { useEffect, useMemo, useRef, useState } from "react";
import Modal from "../components/Modal";

const HASH_CHUNK_SIZE = 8 * 1024 * 1024;
const MULTIPART_PART_CONCURRENCY = 4;

const EMPTY = {
  id: null, name: "", adminNote: "", adminNotes: { en: "", es: "", fr: "", de: "" }, executablePath: "",
  archiveKey: "", archiveSize: 0, packageType: "zip", originalPackageType: null,
  imagePositionX: 50, imagePositionY: 50, imageZoom: 1, published: false, image: null, zip: null, folderFiles: [],
};

const DIRECT_FILE_LIMIT = 32 * 1024 * 1024;
const MAX_FOLDER_BYTES = 200 * 1024 * 1024 * 1024;
const MAX_FOLDER_FILES = 20000;

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

function hashFile(file, onProgress, signal) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/custom-game-hash.worker.js", import.meta.url), { type: "module" });
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      worker.terminate();
      callback(value);
    };
    const abort = () => finish(reject, new Error("Upload canceled"));
    worker.onmessage = event => {
      if (event.data?.type === "progress") onProgress?.(event.data.bytesRead);
      else if (event.data?.type === "done") finish(resolve, event.data.sha256);
      else if (event.data?.type === "error") finish(reject, new Error(event.data.message || "Falha ao verificar arquivo."));
    };
    worker.onerror = event => finish(reject, new Error(event.message || "Falha ao verificar arquivo."));
    if (signal?.aborted) return abort();
    signal?.addEventListener("abort", abort, { once: true });
    worker.postMessage({ file, chunkSize: HASH_CHUNK_SIZE, reportProgress: Boolean(onProgress) });
  });
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
  const uploadController = useRef(null);
  const [search, setSearch] = useState("");
  const imageUrl = useMemo(() => {
    if (!draft) return "";
    if (draft.image) return URL.createObjectURL(draft.image);
    return draft.id && draft.imageVersion ? `/panel-api/custom-games/${draft.id}/image?v=${encodeURIComponent(draft.imageVersion)}` : "";
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

  function uploadFileMultipart(file, gameId, onBytes, onKey, signal) {
    return (async () => {
      const started = await apiRequest("/panel-api/custom-games/upload/initiate", {
        method: "POST", mutate: true, body: { gameId, filename: file.name, sizeBytes: file.size, packageType: "folder" },
      });
      onKey?.(started.key);
      const total = Math.ceil(file.size / started.partSize);
      const parts = new Array(total);
      const loaded = new Array(total).fill(0);
      let next = 0;
      let failed = false;
      const report = () => onBytes(loaded.reduce((sum, count) => sum + count, 0));
      const worker = async () => {
        while (!failed && next < total) {
          const index = next++;
          const start = index * started.partSize;
          const blob = file.slice(start, Math.min(file.size, start + started.partSize));
          const query = new URLSearchParams({ key: started.key, uploadId: started.uploadId, partNumber: String(index + 1) });
          let lastError;
          for (let attempt = 0; attempt < 3; attempt++) {
            if (signal?.aborted) throw new Error("Upload canceled");
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
        const results = await Promise.allSettled(Array.from({ length: Math.min(MULTIPART_PART_CONCURRENCY, total) }, worker));
        const error = results.find(result => result.status === "rejected");
        if (error) throw error.reason;
        const result = await apiRequest("/panel-api/custom-games/upload/complete", {
          method: "POST", mutate: true, body: { key: started.key, uploadId: started.uploadId, parts, sizeBytes: file.size },
        });
        if (signal?.aborted) {
          await apiRequest("/panel-api/custom-games/upload/discard", {
            method: "POST", mutate: true, body: { key: result.key },
          }).catch(() => {});
          throw new Error("Upload canceled");
        }
        return { key: result.key, sizeBytes: file.size };
      } catch (error) {
        await apiRequest("/panel-api/custom-games/upload/abort", {
          method: "POST", mutate: true, body: { key: started.key, uploadId: started.uploadId },
        }).catch(() => {});
        throw error;
      }
    })();
  }

  async function uploadFolder(files, gameId, signal) {
    if (!files.length || files.length > MAX_FOLDER_FILES) throw new Error("Selecione uma pasta com até 20.000 arquivos.");
    const firstRoot = String(files[0].webkitRelativePath || "").split("/")[0];
    const descriptors = files.map(file => {
      const relative = String(file.webkitRelativePath || file.name).replace(/\\/g, "/");
      const path = relative.startsWith(`${firstRoot}/`) ? relative.slice(firstRoot.length + 1) : relative;
      if (!path || path.length > 500 || path.split("/").length > 32 || path.split("/").some(part =>
        !part || part === "." || part === ".." || /[<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part) ||
        /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part) || part.toLowerCase() === ".merlin-install.json")) {
        throw new Error(`Caminho inválido na pasta: ${relative}`);
      }
      if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > 30 * 1024 ** 3) throw new Error(`Tamanho inválido: ${relative}`);
      return { file, path };
    });
    const total = descriptors.reduce((sum, entry) => sum + entry.file.size, 0);
    if (!total) throw new Error("A pasta precisa conter pelo menos um arquivo com dados.");
    if (total > MAX_FOLDER_BYTES) throw new Error("A pasta ultrapassa o limite de 200 GiB.");
    const seen = new Set();
    for (const entry of descriptors) {
      const normalized = entry.path.toLocaleLowerCase();
      if (seen.has(normalized)) throw new Error(`Caminho duplicado: ${entry.path}`);
      seen.add(normalized);
    }
    for (const entry of descriptors) {
      const parts = entry.path.toLocaleLowerCase().split("/");
      for (let index = 1; index < parts.length; index++) {
        if (seen.has(parts.slice(0, index).join("/"))) throw new Error(`Conflito entre arquivo e pasta: ${entry.path}`);
      }
    }
    // Start with the byte-heavy files so early throughput represents the actual transfer.
    descriptors.sort((left, right) => right.file.size - left.file.size);

    const completed = new Array(descriptors.length).fill(0);
    const uploaded = new Array(descriptors.length);
    const checksums = new Array(descriptors.length);
    const allocatedKeys = new Set();
    const startedAt = Date.now();
    const smallFileCount = descriptors.filter(entry => entry.file.size < 1024 ** 2).length;
    const largeFileCount = descriptors.length - smallFileCount;
    let smallStartedAt = null;
    let smallDone = 0;
    let largeDone = 0;
    let next = 0;
    let phaseEnd = largeFileCount;
    let failed = false;
    const report = () => {
      const stats = uploadStats("Enviando pasta · verificando SHA-256", completed.reduce((sum, value) => sum + value, 0),
        total, uploaded.filter(Boolean).length, descriptors.length, startedAt);
      stats.folder = true;
      stats.smallPhase = largeDone === largeFileCount && smallFileCount > 0;
      if (stats.smallPhase && smallDone >= 20 && smallStartedAt) {
        const smallRate = smallDone / Math.max(1, (Date.now() - smallStartedAt) / 1000);
        stats.smallFilesPerMinute = smallRate * 60;
        stats.etaSeconds = (smallFileCount - smallDone) / smallRate;
      } else if (stats.smallPhase) {
        stats.etaSeconds = null;
      }
      setUploadProgress(stats);
    };
    report();
    const worker = async () => {
      while (!failed && next < phaseEnd) {
        if (signal?.aborted) throw new Error("Upload canceled");
        const index = next++;
        const { file, path } = descriptors[index];
        if (file.size < 1024 ** 2 && !smallStartedAt) smallStartedAt = Date.now();
        const hashController = new AbortController();
        const abortHash = () => hashController.abort();
        signal?.addEventListener("abort", abortHash, { once: true });
        const checksumPromise = hashFile(file, null, hashController.signal);
        try {
          let result;
          if (file.size === 0) {
            result = { key: `${gameId}/files/${crypto.randomUUID()}` };
          } else if (file.size <= DIRECT_FILE_LIMIT) {
            const key = `${gameId}/files/${crypto.randomUUID()}`;
            allocatedKeys.add(key);
            result = await apiUpload(`/panel-api/custom-games/upload/file?key=${encodeURIComponent(key)}`, file, {
              mutate: true, headers: { "Content-Type": "application/octet-stream" }, timeoutMs: 900000,
              signal,
              onProgress: ({ loaded }) => { completed[index] = Math.min(file.size, loaded); report(); },
            });
          } else {
            result = await uploadFileMultipart(file, gameId,
              bytes => { completed[index] = Math.min(file.size, bytes); report(); },
              key => allocatedKeys.add(key), signal);
          }
          checksums[index] = await checksumPromise;
          completed[index] = file.size;
          uploaded[index] = { path, key: result.key, sizeBytes: file.size, sha256: checksums[index] };
          if (file.size < 1024 ** 2) smallDone += 1;
          else largeDone += 1;
          report();
        } catch (error) {
          failed = true;
          hashController.abort();
          await checksumPromise.catch(() => {});
          throw error;
        } finally { signal?.removeEventListener("abort", abortHash); }
      }
    };
    const runPhase = async concurrency => {
      const remaining = phaseEnd - next;
      const results = await Promise.allSettled(Array.from({ length: Math.min(concurrency, remaining) }, worker));
      const error = results.find(result => result.status === "rejected");
      if (error) throw error.reason;
    };

    try {
      await runPhase(2);
      phaseEnd = descriptors.length;
      await runPhase(8);
      if (signal?.aborted) throw new Error("Upload canceled");
      setUploadProgress(current => current ? { ...current, label: "Validando pacote no R2", etaSeconds: null, finalizing: true } : current);
      const manifest = await apiRequest("/panel-api/custom-games/upload/folder/complete", {
        method: "POST", mutate: true,
        body: { gameId, files: uploaded.map(({ path, key, sizeBytes, sha256 }) => ({ path, key, sizeBytes, sha256 })) },
      });
      allocatedKeys.add(manifest.key);
      if (signal?.aborted) throw new Error("Upload canceled");
      return { key: manifest.key, sizeBytes: manifest.sizeBytes };
    } catch (error) {
      const keys = [...allocatedKeys];
      let nextDiscard = 0;
      await Promise.all(Array.from({ length: Math.min(8, keys.length) }, async () => {
        while (nextDiscard < keys.length) {
          const key = keys[nextDiscard++];
          await apiRequest("/panel-api/custom-games/upload/discard", {
            method: "POST", mutate: true, body: { key },
          }).catch(() => {});
        }
      }));
      throw error;
    } finally { setUploadProgress(null); }
  }

  async function save() {
    const gameName = String(draft.name ?? "").trim();
    const executablePath = String(draft.executablePath ?? "").trim();
    if (draft.published && !gameName) return notify("Informe o nome do jogo antes de publicar.");
    if (draft.published && !draft.image && !draft.imageVersion) return notify("Escolha uma imagem para o card antes de publicar.");
    const usingExistingPackage = draft.originalPackageType === draft.packageType && Boolean(draft.archiveKey);
    if (draft.published && draft.packageType === "zip" && !draft.zip && !usingExistingPackage) return notify("Escolha o ZIP do jogo antes de publicar.");
    if (draft.published && draft.packageType === "folder" && !draft.folderFiles.length && !usingExistingPackage) return notify("Escolha uma pasta do jogo antes de publicar.");
    if (executablePath && !/\.exe$/i.test(executablePath)) return notify("O caminho para Jogar deve terminar em .exe.");
    setBusy(true);
    let uploadedPackage = null;
    let saved = false;
    const controller = new AbortController();
    uploadController.current = controller;
    try {
      if (draft.packageType === "zip" && draft.zip) uploadedPackage = { key: await uploadZip(draft.zip, draft.gameId, controller.signal) };
      if (draft.packageType === "folder" && draft.folderFiles.length) uploadedPackage = await uploadFolder(draft.folderFiles, draft.gameId, controller.signal);
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
      await apiRequest(draft.id ? `/panel-api/custom-games/${draft.id}` : "/panel-api/custom-games", {
        method: draft.id ? "PUT" : "POST", mutate: true, body,
      });
      saved = true;
      setDraft(null);
      notify(draft.published ? "Jogo publicado no Launcher." : "Rascunho salvo.");
      await load();
    } catch (error) {
      if (uploadedPackage?.key && !saved) {
        await apiRequest("/panel-api/custom-games/upload/discard", {
          method: "POST", mutate: true, body: { key: uploadedPackage.key },
        }).catch(() => {});
      }
      notify(controller.signal.aborted ? "Upload cancelado. Os arquivos temporários foram descartados." : error.message || "Não foi possível salvar o jogo.");
    }
    finally { uploadController.current = null; setUploadProgress(null); setBusy(false); }
  }

  function cancelUpload() {
    if (!uploadController.current || !uploadProgress) return;
    uploadController.current.abort();
    setUploadProgress(current => current ? { ...current, canceling: true } : current);
  }

  async function remove(game) {
    if (!window.confirm(`Excluir “${game.name || "Rascunho sem nome"}” e seu pacote do bucket?`)) return;
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
      <div><p className="eyebrow">Launcher</p><h1>Baixe e Jogue</h1><p>Catálogo de jogos em ZIP ou pasta, instalados pelo Merlin em uma unidade escolhida pelo cliente.</p></div>
      <div className="page__actions"><button className="button button--ghost" onClick={load} disabled={loading}>Atualizar</button><button className="button button--primary" onClick={() => setDraft(makeDraft(null))}>+ Novo jogo</button></div>
    </div>
    <section className="panel">
      <label className="field"><span>Buscar jogo</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome do jogo" /></label>
      {loading ? <div className="empty-state"><h3>Carregando jogos…</h3></div> : shown.length ? <div className="custom-games-admin-grid">{shown.map(game =>
        <article className="custom-games-admin-card" key={game.id}>
          <div className="custom-games-admin-image">{game.imageVersion ? <img src={`/panel-api/custom-games/${game.id}/image?v=${encodeURIComponent(game.imageVersion)}`} alt="" style={{ objectPosition: `${game.imagePositionX}% ${game.imagePositionY}%`, transform: `scale(${game.imageZoom || 1})`, transformOrigin: `${game.imagePositionX}% ${game.imagePositionY}%` }} /> : <span>Sem imagem</span>}</div>
          <div><h2>{game.name || "Rascunho sem nome"}</h2><p>{game.archiveKey ? `${prettySize(game.archiveSize)} · ${game.packageType === "folder" ? "Pasta" : "ZIP"}` : "Pacote pendente"} · {game.executablePath ? "Botão Jogar ativo" : "Sem botão Jogar"}</p><span className={`badge ${game.published ? "badge--emerald" : "badge--muted"}`}>{game.published ? "Publicado" : "Rascunho"}</span></div>
          <div className="custom-games-admin-actions"><button className="button button--ghost button--sm" onClick={() => setDraft(makeDraft(game))}>Editar</button><button className="button button--danger button--soft button--sm" onClick={() => remove(game)}>Excluir</button></div>
        </article>)}</div> : <div className="empty-state"><h3>Nenhum jogo cadastrado</h3><p>Crie um jogo para começar.</p></div>}
    </section>
    {draft && <Modal title={draft.id ? "Editar jogo" : "Novo jogo"} subtitle="Salve como rascunho e complete os dados antes de publicar no Launcher." dismissOnBackdrop={false} onClose={() => !busy && setDraft(null)} closeDisabled={busy} closeConfirmMessage="Fechar sem salvar este jogo? A seleção de arquivos será perdida." actions={<><button className="button button--ghost" disabled={busy} onClick={() => { if (window.confirm("Descartar as alterações deste jogo?")) setDraft(null); }}>Cancelar</button><button className="button button--primary" disabled={busy} onClick={save}>{busy ? "Salvando…" : draft.published ? "Publicar jogo" : "Salvar rascunho"}</button></>}>
      <div className="custom-games-admin-form">
        <label className="field"><span>Nome</span><input maxLength="120" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
        <label className="field"><span>Anotação / tutorial (opcional)</span><textarea rows="4" maxLength="5000" value={draft.adminNote} onChange={e => setDraft({ ...draft, adminNote: e.target.value })} /><small>Se houver anotação, traduza-a abaixo antes de publicar.</small></label>
        {Object.entries({ en: "Inglês", es: "Espanhol", fr: "Francês", de: "Alemão" }).map(([language, label]) =>
          <label className="field" key={language}><span>Anotação em {label} (opcional)</span><textarea rows="2" maxLength="5000" value={draft.adminNotes?.[language] || ""} onChange={e => setDraft(current => ({ ...current, adminNotes: { ...current.adminNotes, [language]: e.target.value } }))} /></label>)}
        <label className="field"><span>Executável relativo à pasta do jogo (opcional)</span><input placeholder="Game/Game.exe" value={draft.executablePath} onChange={e => setDraft({ ...draft, executablePath: e.target.value })} /><small>Sem esse caminho, o Launcher não exibirá Jogar.</small></label>
        <fieldset className="custom-games-package-options"><legend>Formato do pacote</legend><label className={`custom-games-package-option${draft.packageType === "zip" ? " is-selected" : ""}`}><input type="radio" name="customGamePackageType" checked={draft.packageType === "zip"} onChange={() => setDraft(current => ({ ...current, packageType: "zip" }))} /><span><strong>Arquivo ZIP</strong><small>Até 30 GiB · o Launcher descompacta após baixar</small></span></label><label className={`custom-games-package-option${draft.packageType === "folder" ? " is-selected" : ""}`}><input type="radio" name="customGamePackageType" checked={draft.packageType === "folder"} onChange={() => setDraft(current => ({ ...current, packageType: "folder" }))} /><span><strong>Pasta do jogo</strong><small>Até 200 GiB · arquivos enviados individualmente</small></span></label></fieldset>
        {draft.packageType === "zip" ? <label className="field"><span>ZIP do jogo</span><input type="file" accept=".zip,application/zip" onChange={e => setDraft(current => ({ ...current, zip: e.target.files?.[0] || null }))} />{(draft.zip || (draft.originalPackageType === "zip" && draft.archiveKey)) && <small>{draft.zip ? `${draft.zip.name} · ${prettySize(draft.zip.size)}` : `ZIP atual · ${prettySize(draft.archiveSize)}`}</small>}</label> : <label className="field"><span>Pasta do jogo</span><input type="file" webkitdirectory="" directory="" multiple onChange={e => setDraft(current => ({ ...current, folderFiles: Array.from(e.target.files || []) }))} /><small>{draft.folderFiles.length ? `${draft.folderFiles.length} arquivos · ${prettySize(draft.folderFiles.reduce((sum, file) => sum + file.size, 0))}` : draft.originalPackageType === "folder" && draft.archiveKey ? `Pasta atual · ${prettySize(draft.archiveSize)}` : "Selecione a pasta que contém os arquivos do jogo. O diretório escolhido vira a raiz da instalação."}</small></label>}
        {uploadProgress && <div className="custom-games-admin-progress" role="status"><div className="custom-games-admin-progress__heading"><strong>{uploadProgress.canceling ? "Cancelando upload…" : uploadProgress.folder ? uploadProgress.label : `${uploadProgress.label} · ${prettyPercent(uploadProgress.bytes, uploadProgress.total)}`}</strong><button type="button" className="button button--danger button--soft button--sm" onClick={cancelUpload} disabled={uploadProgress.canceling}>Cancelar upload</button></div>{uploadProgress.folder ? <><div className="custom-games-admin-progress__meter"><span>Dados enviados: {prettySize(uploadProgress.bytes)} de {prettySize(uploadProgress.total)} · {prettyPercent(uploadProgress.bytes, uploadProgress.total)}</span><progress max={uploadProgress.total} value={uploadProgress.bytes} /></div><div className="custom-games-admin-progress__meter"><span>Arquivos concluídos: {uploadProgress.done} de {uploadProgress.count} · {prettyPercent(uploadProgress.done, uploadProgress.count)}</span><progress max={uploadProgress.count} value={uploadProgress.done} /></div></> : <progress max={uploadProgress.total} value={uploadProgress.bytes} />}<div className="custom-games-admin-progress__details"><span>{uploadProgress.folder ? uploadProgress.smallPhase ? uploadProgress.smallFilesPerMinute ? `${Math.round(uploadProgress.smallFilesPerMinute)} arquivos/min` : "Calculando ritmo dos arquivos…" : `Velocidade média: ${prettyRate(uploadProgress.speed)}` : `${prettyRate(uploadProgress.speed)} · ${uploadProgress.done}/${uploadProgress.count} partes`}</span><span>{uploadProgress.finalizing ? "Conferindo arquivos…" : `Restante estimado: ${prettyDuration(uploadProgress.etaSeconds)}`}</span></div></div>}
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
