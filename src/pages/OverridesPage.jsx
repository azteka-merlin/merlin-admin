import React from "react";

export default function OverridesPage({
  overrides,
  loadingOverrides,
  overrideSearch,
  setOverrideSearch,
  loadOverrides,
  openOverrideCreateModal,
  openOverrideEditModal,
  openOverrideDeleteModal
}) {
  const query = overrideSearch.trim().toLowerCase();
  const filteredOverrides = overrides.filter((entry) => {
    if (!query) return true;
    return [
      entry.appId,
      entry.name || "",
      entry.adminNote || "",
      entry.manifestOverride?.file || "",
      entry.fixOverride?.file || "",
      entry.fixOverride?.filename || ""
    ].some((value) => String(value).toLowerCase().includes(query));
  });

  return (
    <section className="page page--overrides">
      <div className="page__header page__header--split">
        <div>
          <p className="eyebrow">Overrides</p>
          <h1>Gerencie manifests e fixes customizados por appId.</h1>
        </div>
        <div className="page__actions">
          <button className="button button--ghost" onClick={loadOverrides} disabled={loadingOverrides}>
            {loadingOverrides ? "Atualizando..." : "Atualizar lista"}
          </button>
          <button className="button button--primary" onClick={openOverrideCreateModal}>
            + Novo override
          </button>
        </div>
      </div>

      <section className="panel panel--audit">
        <div className="filters">
          <label className="field-shell field-shell--search">
            <span>Buscar</span>
            <input
              value={overrideSearch}
              onChange={(event) => setOverrideSearch(event.target.value)}
              placeholder="Buscar por appId, arquivo ou nome do jogo..."
            />
          </label>
        </div>

        {loadingOverrides ? (
          <div className="empty-state">
            <h3>Carregando overrides</h3>
            <p>Buscando a configuração atual dos appIds.</p>
          </div>
        ) : !filteredOverrides.length ? (
          <div className="empty-state">
            <h3>Nenhum override encontrado</h3>
            <p>Crie um override novo ou ajuste a busca.</p>
          </div>
        ) : (
          <div className="override-grid">
            {filteredOverrides.map((entry) => (
              <article className="audit-card override-card" key={entry.appId}>
                <div className="audit-card__head override-card__head">
                  <div>
                    <p className="eyebrow">App ID</p>
                    <h2>{entry.appId}</h2>
                    <p className="override-card__value" title={entry.name || "--"}>{entry.name || "--"}</p>
                  </div>
                  <div className="override-actions">
                    <button className="button button--ghost button--sm" onClick={() => openOverrideEditModal(entry)}>
                      Editar
                    </button>
                    <button className="button button--danger button--soft button--sm" onClick={() => openOverrideDeleteModal(entry.appId)}>
                      Excluir
                    </button>
                  </div>
                </div>

                <div className="audit-card__body">
                  <dl className="audit-card__meta">
                    <div>
                      <dt>Manifest</dt>
                      <dd>{entry.manifestOverride ? (entry.manifestOverride.enabled ? "Ativo" : "Desativado") : "Não configurado"}</dd>
                    </div>
                    <div>
                      <dt>Fix</dt>
                      <dd>{entry.fixOverride ? (entry.fixOverride.enabled ? "Ativo" : "Desativado") : "Não configurado"}</dd>
                    </div>
                    <div>
                      <dt>Game name</dt>
                      <dd className="override-card__value override-card__value--wrap" title={entry.name || "--"}>
                        {entry.name || "--"}
                      </dd>
                    </div>
                  </dl>

                  <dl className="audit-card__meta">
                    <div>
                      <dt>Manifest file</dt>
                      <dd className="override-card__value override-card__value--wrap" title={entry.manifestOverride?.file || "--"}>
                        {entry.manifestOverride?.file || "--"}
                      </dd>
                    </div>
                    <div>
                      <dt>Fix file</dt>
                      <dd className="override-card__value override-card__value--wrap" title={entry.fixOverride?.file || "--"}>
                        {entry.fixOverride?.file || "--"}
                      </dd>
                    </div>
                    <div>
                      <dt>Download name</dt>
                      <dd className="override-card__value override-card__value--wrap" title={entry.fixOverride?.filename || "--"}>
                        {entry.fixOverride?.filename || "--"}
                      </dd>
                    </div>
                    <div>
                      <dt>Admin note</dt>
                      <dd className="override-card__value override-card__value--wrap" title={entry.adminNote || "--"}>
                        {entry.adminNote || "--"}
                      </dd>
                    </div>
                  </dl>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
