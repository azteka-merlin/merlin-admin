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
    activationCooldownDays: "",
    accessBronzeEnabled: false,
    accessPrataEnabled: false,
    accessOuroEnabled: true,
    featured: false,
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
    activationCooldownDays: entry.activationCooldownHours ? String(entry.activationCooldownHours / 24) : "",
    accessBronzeEnabled: Boolean(entry.accessBronzeEnabled),
    accessPrataEnabled: Boolean(entry.accessPrataEnabled),
    accessOuroEnabled: entry.accessOuroEnabled !== false,
    featured: Boolean(entry.featured),
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

  const activationCooldownDaysRaw = String(draft.activationCooldownDays || "").trim();
  const activationCooldownDays = activationCooldownDaysRaw ? Number(activationCooldownDaysRaw) : null;
  if (activationCooldownDays !== null && (!Number.isInteger(activationCooldownDays) || activationCooldownDays < 1)) {
    throw new Error("Informe um cooldown de pelo menos 1 dia.");
  }

  const payload = {
    appId,
    activationLimit,
    activationCooldownHours: activationCooldownDays === null ? null : activationCooldownDays * 24,
    accessBronzeEnabled: Boolean(draft.accessBronzeEnabled),
    accessPrataEnabled: Boolean(draft.accessPrataEnabled),
    accessOuroEnabled: draft.accessOuroEnabled !== false,
    featured: Boolean(draft.featured),
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
  licenses,
  loadPremiumEarlyAccess,
  grantPremiumEarlyAccess,
  revokePremiumEarlyAccess,
  busyAction,
  notify,
}) {
  const [activeModal, setActiveModal] = useState(null);
  const [draft, setDraft] = useState(createEmptyPremiumDraft());
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [earlyAccessTarget, setEarlyAccessTarget] = useState(null);
  const [earlyAccessEntries, setEarlyAccessEntries] = useState([]);
  const [earlyAccessSearch, setEarlyAccessSearch] = useState("");
  const [loadingEarlyAccess, setLoadingEarlyAccess] = useState(false);
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
  const earlyAccessBusy = busyAction === "grant-premium-early-access" || busyAction === "revoke-premium-early-access";
  const selectedLicenseIds = useMemo(
    () => new Set(earlyAccessEntries.map((entry) => entry.licenseId)),
    [earlyAccessEntries],
  );
  const earlyAccessCandidates = useMemo(() => {
    const search = earlyAccessSearch.trim().toLowerCase();
    return licenses.filter((license) => {
      if (selectedLicenseIds.has(license.id) || license.status !== "active") return false;
      if (!search) return true;
      return [license.id, license.name, license.contact, license.licenseKey]
        .some((value) => String(value || "").toLowerCase().includes(search));
    }).slice(0, 12);
  }, [earlyAccessSearch, licenses, selectedLicenseIds]);

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

  async function openEarlyAccessModal(entry) {
    setEarlyAccessTarget(entry);
    setEarlyAccessEntries([]);
    setEarlyAccessSearch("");
    setActiveModal("early-access");
    setLoadingEarlyAccess(true);
    try {
      setEarlyAccessEntries(await loadPremiumEarlyAccess(entry.appId));
    } catch (error) {
      notify(error.message || "Nao foi possivel carregar os acessos antecipados.");
      setActiveModal(null);
    } finally {
      setLoadingEarlyAccess(false);
    }
  }

  async function handleGrantEarlyAccess(licenseId) {
    if (!earlyAccessTarget) return;
    try {
      const entry = await grantPremiumEarlyAccess(earlyAccessTarget.appId, licenseId);
      if (entry) setEarlyAccessEntries((current) => [entry, ...current.filter((item) => item.licenseId !== licenseId)]);
      setEarlyAccessSearch("");
      notify("Acesso antecipado liberado.");
    } catch (error) {
      notify(error.message || "Nao foi possivel liberar o acesso antecipado.");
    }
  }

  async function handleRevokeEarlyAccess(licenseId) {
    if (!earlyAccessTarget) return;
    try {
      await revokePremiumEarlyAccess(earlyAccessTarget.appId, licenseId);
      setEarlyAccessEntries((current) => current.filter((entry) => entry.licenseId !== licenseId));
      notify("Acesso antecipado removido.");
    } catch (error) {
      notify(error.message || "Nao foi possivel remover o acesso antecipado.");
    }
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
                    <button className="button button--ghost button--sm" onClick={() => openEarlyAccessModal(entry)}>
                      Antecipado{entry.earlyAccessCount ? ` (${entry.earlyAccessCount})` : ""}
                    </button>
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
                        {entry.featured && <span className="badge badge--info">Destaque</span>}
                      </dd>
                    </div>
                    <div>
                      <dt>Tipo</dt>
                      <dd>{entry.activationType === "third_party" ? "Third-party" : "Ativação Premium"}</dd>
                    </div>
                    <div>
                      <dt>Tiers</dt>
                      <dd>
                        {[
                          entry.accessBronzeEnabled ? "Bronze" : "",
                          entry.accessPrataEnabled ? "Prata" : "",
                          entry.accessOuroEnabled !== false ? "Ouro" : ""
                        ].filter(Boolean).join(", ") || "--"}
                      </dd>
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
          subtitle="Informe o appId, envie o ZIP e ajuste o limite e cooldown das ativações. Nome e capa tentam ser preenchidos automaticamente."
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

            <label className="field field--toggle">
              <span>Destacar no topo da aba Premium</span>
              <input
                type="checkbox"
                checked={draft.featured}
                onChange={(event) => setDraft((current) => ({ ...current, featured: event.target.checked }))}
              />
              <small>Os destaques aparecem primeiro; o último marcado fica acima dos demais.</small>
            </label>

            <label className="field field--toggle">
              <span>Liberar imediatamente no Bronze</span>
              <input
                type="checkbox"
                checked={draft.accessBronzeEnabled}
                onChange={(event) => setDraft((current) => ({ ...current, accessBronzeEnabled: event.target.checked }))}
              />
            </label>

            <label className="field">
              <span>Cooldown da ativação (dias)</span>
              <input
                value={draft.activationCooldownDays}
                onChange={(event) => setDraft((current) => ({ ...current, activationCooldownDays: event.target.value }))}
                inputMode="numeric"
                placeholder="Padrão: 1"
              />
              <small>Vazio usa 24 horas. Mínimo: 1 dia.</small>
            </label>

            <label className="field field--toggle">
              <span>Liberar imediatamente no Prata</span>
              <input
                type="checkbox"
                checked={draft.accessPrataEnabled}
                onChange={(event) => setDraft((current) => ({ ...current, accessPrataEnabled: event.target.checked }))}
              />
            </label>

            <label className="field field--toggle">
              <span>Liberar imediatamente no Ouro</span>
              <input
                type="checkbox"
                checked={draft.accessOuroEnabled}
                onChange={(event) => setDraft((current) => ({ ...current, accessOuroEnabled: event.target.checked }))}
              />
            </label>

            <p className="field-grid__note field--wide">
              Quando um tier não recebe liberação imediata, o jogo continua visível no Launcher e é liberado conforme a janela de lançamentos do plano.
            </p>

            <label className="field">
              <span>Tipo de ativacao</span>
              <select
                value={draft.activationType}
                onChange={(event) => setDraft((current) => ({ ...current, activationType: event.target.value }))}
              >
                <option value="steam_ticket">Ativação Premium</option>
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

      {activeModal === "early-access" && earlyAccessTarget && (
        <Modal
          title="Acesso antecipado"
          subtitle={`${earlyAccessTarget.name || earlyAccessTarget.appId}. Essas licencas podem ativar antes da liberacao normal do plano.`}
          onClose={() => !earlyAccessBusy && setActiveModal(null)}
          closeDisabled={earlyAccessBusy}
          actions={
            <button className="button button--primary" onClick={() => setActiveModal(null)} disabled={earlyAccessBusy}>
              Concluir
            </button>
          }
        >
          <label className="field field--wide">
            <span>Adicionar licenca</span>
            <input
              value={earlyAccessSearch}
              onChange={(event) => setEarlyAccessSearch(event.target.value)}
              placeholder="Busque por nome, contato, chave ou ID"
              autoFocus
            />
          </label>

          {earlyAccessSearch.trim() && (
            <div className="premium-early-access__candidates">
              {earlyAccessCandidates.length ? earlyAccessCandidates.map((license) => (
                <button
                  className="premium-early-access__candidate"
                  key={license.id}
                  type="button"
                  disabled={earlyAccessBusy}
                  onClick={() => handleGrantEarlyAccess(license.id)}
                >
                  <strong>{license.name}</strong>
                  <span>{license.contact || license.licenseKey} · {license.planTier || "teste"}</span>
                </button>
              )) : <p className="plain-copy">Nenhuma licenca ativa encontrada.</p>}
            </div>
          )}

          <div className="premium-early-access__selected">
            <p className="field-grid__note">Pessoas com acesso antecipado</p>
            {loadingEarlyAccess ? <p className="plain-copy">Carregando...</p> : earlyAccessEntries.length ? earlyAccessEntries.map((entry) => (
              <div className="premium-early-access__entry" key={entry.licenseId}>
                <div>
                  <strong>{entry.name}</strong>
                  <span>{entry.contact || entry.licenseKey} · {entry.planTier || "teste"}</span>
                </div>
                <button
                  className="button button--danger button--soft button--sm"
                  type="button"
                  disabled={earlyAccessBusy}
                  onClick={() => handleRevokeEarlyAccess(entry.licenseId)}
                >
                  Remover
                </button>
              </div>
            )) : <p className="plain-copy">Nenhuma licenca com acesso antecipado.</p>}
          </div>
        </Modal>
      )}
    </section>
  );
}
