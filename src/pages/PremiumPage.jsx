import React, { useMemo, useRef, useState } from "react";
import Modal from "../components/Modal";

function createEmptyPremiumDraft() {
  return {
    mode: "create",
    appId: "",
    name: "",
    coverUrl: "",
    archiveKey: "",
    installSubpath: "",
    activationType: "steam_ticket",
    launchExecutablePath: "",
    activationLimit: "5",
    enabled: false,
  };
}

function createPremiumDraft(entry) {
  if (!entry) {
    return createEmptyPremiumDraft();
  }

  return {
    mode: "edit",
    appId: entry.appId,
    name: entry.name || "",
    coverUrl: entry.coverUrl || "",
    archiveKey: entry.archiveKey || "",
    installSubpath: entry.installSubpath || "",
    activationType: entry.activationType || "steam_ticket",
    launchExecutablePath: entry.launchExecutablePath || "",
    activationLimit: String(entry.activationLimit || 5),
    enabled: Boolean(entry.enabled),
  };
}

function normalizePremiumPayload(draft) {
  const appId = String(draft.appId || "").trim();
  if (!/^\d+$/.test(appId)) {
    throw new Error("Informe um appId numerico valido.");
  }

  const activationLimit = Number(draft.activationLimit || 5);
  if (!Number.isInteger(activationLimit) || activationLimit <= 0) {
    throw new Error("Informe um limite de ativacoes valido.");
  }

  const payload = {
    appId,
    activationLimit,
    enabled: Boolean(draft.enabled),
  };

  const name = String(draft.name || "").trim();
  const coverUrl = String(draft.coverUrl || "").trim();
  const archiveKey = String(draft.archiveKey || "").trim();
  const installSubpath = String(draft.installSubpath || "").trim();
  const activationType = draft.activationType === "third_party" ? "third_party" : "steam_ticket";
  const launchExecutablePath = String(draft.launchExecutablePath || "").trim();

  if (activationType === "third_party" && !launchExecutablePath) {
    throw new Error("Informe o executavel para ativacoes third-party.");
  }

  if (name) payload.name = name;
  if (coverUrl) payload.coverUrl = coverUrl;
  if (archiveKey) payload.archiveKey = archiveKey;
  payload.activationType = activationType;
  payload.launchExecutablePath = activationType === "third_party" ? launchExecutablePath : null;
  if (draft.mode === "edit") {
    payload.installSubpath = installSubpath || null;
  } else if (installSubpath) {
    payload.installSubpath = installSubpath;
  }

  return payload;
}

export default function PremiumPage({
  premiumGames,
  loadingPremiumGames,
  premiumSearch,
  setPremiumSearch,
  loadPremiumGames,
  savePremiumGame,
  deletePremiumGame,
  uploadPremiumArchive,
  busyAction,
  notify,
}) {
  const [activeModal, setActiveModal] = useState(null);
  const [draft, setDraft] = useState(createEmptyPremiumDraft());
  const [deleteTarget, setDeleteTarget] = useState(null);
  const fileInputRef = useRef(null);

  const query = premiumSearch.trim().toLowerCase();
  const filteredGames = useMemo(
    () => premiumGames.filter((entry) => {
      if (!query) return true;
      return [
        entry.appId,
        entry.name || "",
        entry.archiveKey || "",
        entry.coverUrl || "",
        entry.installSubpath || "",
        entry.activationType || "",
        entry.launchExecutablePath || "",
      ].some((value) => String(value).toLowerCase().includes(query));
    }),
    [premiumGames, query],
  );

  const createBusy = busyAction === "save-premium-game";
  const deleteBusy = busyAction === "delete-premium-game";
  const uploadBusy = busyAction === "upload-premium-game-archive";

  function openCreateModal() {
    setDraft(createEmptyPremiumDraft());
    setDeleteTarget(null);
    setActiveModal("upsert");
  }

  function openEditModal(entry) {
    setDraft(createPremiumDraft(entry));
    setDeleteTarget(null);
    setActiveModal("upsert");
  }

  function openDeleteModal(entry) {
    setDeleteTarget(entry);
    setActiveModal("delete");
  }

  async function handleSave() {
    try {
      const payload = normalizePremiumPayload(draft);
      await savePremiumGame(draft.mode, payload);
      setActiveModal(null);
      setDraft(createEmptyPremiumDraft());
      notify(draft.mode === "edit" ? "Premium atualizado com sucesso." : "Jogo premium criado com sucesso.");
    } catch (error) {
      notify(error.message || "Nao foi possivel salvar o jogo premium.");
    }
  }

  async function handleDelete() {
    if (!deleteTarget?.appId) return;

    try {
      await deletePremiumGame(deleteTarget.appId);
      setActiveModal(null);
      setDeleteTarget(null);
      notify("Jogo premium removido com sucesso.");
    } catch (error) {
      notify(error.message || "Nao foi possivel remover o jogo premium.");
    }
  }

  async function handleArchiveSelected(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const appId = String(draft.appId || "").trim();
    if (!/^\d+$/.test(appId)) {
      notify("Informe um appId numerico valido antes de enviar o ZIP.");
      return;
    }

    try {
      const uploaded = await uploadPremiumArchive(appId, file);
      setDraft((current) => ({
        ...current,
        archiveKey: uploaded.objectKey || current.archiveKey,
      }));
      notify("ZIP premium enviado com sucesso.");
    } catch (error) {
      notify(error.message || "Nao foi possivel enviar o ZIP premium.");
    }
  }

  return (
    <section className="page page--premium">
      <div className="page__header page__header--split">
        <div>
          <p className="eyebrow">Premium</p>
          <h1>Cadastre os jogos premium, envie os ZIPs e controle o que aparece na nova aba do launcher.</h1>
        </div>
        <div className="page__actions">
          <button className="button button--ghost" onClick={loadPremiumGames} disabled={loadingPremiumGames}>
            {loadingPremiumGames ? "Atualizando..." : "Atualizar lista"}
          </button>
          <button className="button button--primary" onClick={openCreateModal}>
            + Novo premium
          </button>
        </div>
      </div>

      <section className="panel panel--audit">
        <div className="filters">
          <label className="field-shell field-shell--search">
            <span>Buscar</span>
            <input
              value={premiumSearch}
              onChange={(event) => setPremiumSearch(event.target.value)}
              placeholder="Buscar por appId, nome ou archive key..."
            />
          </label>
        </div>

        {loadingPremiumGames ? (
          <div className="empty-state">
            <h3>Carregando jogos premium</h3>
            <p>Buscando a configuracao atual do catalogo premium.</p>
          </div>
        ) : !filteredGames.length ? (
          <div className="empty-state">
            <h3>Nenhum jogo premium encontrado</h3>
            <p>Crie o primeiro item ou ajuste a busca.</p>
          </div>
        ) : (
          <div className="premium-grid">
            {filteredGames.map((entry) => (
              <article className="audit-card premium-card" key={entry.appId}>
                <div className="audit-card__head premium-card__head">
                  <div className="premium-card__summary">
                    <p className="eyebrow">App ID</p>
                    <h2>{entry.appId}</h2>
                    <p className="premium-card__title" title={entry.name || "--"}>{entry.name || "--"}</p>
                  </div>

                  <div className="override-actions premium-card__actions">
                    <button className="button button--ghost button--sm" onClick={() => openEditModal(entry)}>
                      Editar
                    </button>
                    <button className="button button--danger button--soft button--sm" onClick={() => openDeleteModal(entry)}>
                      Excluir
                    </button>
                  </div>
                </div>

                <div className="audit-card__body">
                  <dl className="audit-card__meta premium-card__meta premium-card__meta--single">
                    <div>
                      <dt>Status</dt>
                      <dd>
                        <span className={`badge ${entry.enabled ? "badge--emerald" : "badge--muted"}`}>
                          {entry.enabled ? "Ativo" : "Oculto"}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt>Tipo</dt>
                      <dd>{entry.activationType === "third_party" ? "Third-party" : "Steam"}</dd>
                    </div>
                  </dl>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {activeModal === "upsert" && (
        <Modal
          title={draft.mode === "edit" ? "Editar premium" : "Novo premium"}
          subtitle="Informe o appId, envie o ZIP e ajuste o limite de ativacoes. Nome e capa tentam ser preenchidos automaticamente."
          onClose={() => !createBusy && !uploadBusy && setActiveModal(null)}
          closeDisabled={createBusy || uploadBusy}
          actions={
            <>
              <button className="button button--ghost" onClick={() => setActiveModal(null)} disabled={createBusy || uploadBusy}>
                Cancelar
              </button>
              <button className="button button--primary" onClick={handleSave} disabled={createBusy || uploadBusy}>
                {createBusy ? "Salvando..." : draft.mode === "edit" ? "Salvar premium" : "Criar premium"}
              </button>
            </>
          }
        >
          <div className="field-grid">
            <label className="field">
              <span>App ID</span>
              <input
                value={draft.appId}
                onChange={(event) => setDraft((current) => ({ ...current, appId: event.target.value }))}
                placeholder="990080"
                readOnly={draft.mode === "edit"}
                autoFocus
              />
            </label>

            <label className="field">
              <span>Limite de ativacoes</span>
              <input
                value={draft.activationLimit}
                onChange={(event) => setDraft((current) => ({ ...current, activationLimit: event.target.value }))}
                inputMode="numeric"
                placeholder="5"
              />
            </label>

            <label className="field field--toggle">
              <span>Exibir na aba Premium</span>
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))}
              />
            </label>

            <label className="field">
              <span>Tipo de ativacao</span>
              <select
                value={draft.activationType}
                onChange={(event) => setDraft((current) => ({ ...current, activationType: event.target.value }))}
              >
                <option value="steam_ticket">Steam</option>
                <option value="third_party">Third-party</option>
              </select>
            </label>

            <label className="field">
              <span>Nome do jogo</span>
              <input
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="Deixe em branco para preencher automaticamente"
              />
            </label>

            <label className="field">
              <span>Cover URL</span>
              <input
                value={draft.coverUrl}
                onChange={(event) => setDraft((current) => ({ ...current, coverUrl: event.target.value }))}
                placeholder="Deixe em branco para preencher automaticamente"
              />
            </label>

            <label className="field">
              <span>Archive key</span>
              <input
                value={draft.archiveKey}
                onChange={(event) => setDraft((current) => ({ ...current, archiveKey: event.target.value }))}
                placeholder="Sera gerada como appId/appId.zip"
              />
            </label>

            <label className="field">
              <span>Subpasta de instalacao</span>
              <input
                value={draft.installSubpath}
                onChange={(event) => setDraft((current) => ({ ...current, installSubpath: event.target.value }))}
                placeholder="Opcional. Ex.: bin64 ou bin64/teste/app"
              />
            </label>

            {draft.activationType === "third_party" && (
              <label className="field">
                <span>Executavel de ativacao</span>
                <input
                  value={draft.launchExecutablePath}
                  onChange={(event) => setDraft((current) => ({ ...current, launchExecutablePath: event.target.value }))}
                  placeholder="Ex.: EAC.exe ou bin/EAC.exe"
                />
              </label>
            )}
          </div>

          <div className="premium-upload-box">
            <div>
              <strong>ZIP da ativacao</strong>
              <p>
                O arquivo vai para <code>{draft.archiveKey || (draft.appId ? `${draft.appId}/${draft.appId}.zip` : "appId/appId.zip")}</code>.
              </p>
              <p>
                Se informar uma subpasta, os arquivos serao aplicados em <code>{`{pasta-do-jogo}${draft.installSubpath ? `/${draft.installSubpath.replace(/\\/g, "/")}` : ""}`}</code>.
              </p>
            </div>
            <div className="premium-upload-box__actions">
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,application/zip"
                hidden
                onChange={handleArchiveSelected}
              />
              <button
                className="button button--ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadBusy}
                type="button"
              >
                {uploadBusy ? "Enviando ZIP..." : "Enviar ZIP"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {activeModal === "delete" && deleteTarget && (
        <Modal
          title="Excluir premium"
          subtitle={`O jogo premium ${deleteTarget.name || deleteTarget.appId} sera removido da configuracao.`}
          onClose={() => !deleteBusy && setActiveModal(null)}
          closeDisabled={deleteBusy}
          actions={
            <>
              <button className="button button--ghost" onClick={() => setActiveModal(null)} disabled={deleteBusy}>
                Cancelar
              </button>
              <button className="button button--danger" onClick={handleDelete} disabled={deleteBusy}>
                {deleteBusy ? "Excluindo..." : "Excluir premium"}
              </button>
            </>
          }
        >
          <p className="plain-copy">
            O cadastro sera removido do painel. Se quiser, o ZIP no bucket pode ser reaproveitado depois criando o mesmo appId novamente.
          </p>
        </Modal>
      )}
    </section>
  );
}
