import React from "react";
import LicenseDetail from "../components/LicenseDetail";
import { formatContact, formatDate, getBillingStatus, getLicenseContact, getLicenseContactType, getStatus, initials, maskKey, maskTechnicalValue } from "../lib/admin-ui";
import { PAGE_SIZE } from "../lib/navigation";

export default function LicensesPage({
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  sourceFilter,
  setSourceFilter,
  billingFilter,
  setBillingFilter,
  deviceFilter,
  setDeviceFilter,
  loadingLicenses,
  filteredLicenses,
  pagedLicenses,
  selectedId,
  openLicense,
  safePage,
  totalPages,
  page,
  setPage,
  selectedLicense,
  copyLicenseKey,
  openModal,
  onSendWelcomeEmail
}) {
  return (
    <section className="page">
      <div className="page__header page__header--split">
        <div>
          <p className="eyebrow">Licenças</p>
          <h1>Consulte, atualize, renove ou revogue licenças cadastradas.</h1>
        </div>
        <button className="button button--primary" onClick={() => openModal("create")}>
          + Criar licença
        </button>
      </div>

      <div className="workspace">
        <section className="panel panel--list">
          <div className="filters">
            <label className="field-shell field-shell--search">
              <span>Buscar</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nome, contato, chave, ID ou HWID..."
              />
            </label>

            <label className="field-shell">
              <span>Status</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">Todos os status</option>
                <option value="active">Ativas</option>
                <option value="soon">Expiram em breve</option>
                <option value="expired">Expiradas</option>
                <option value="revoked">Revogadas</option>
              </select>
            </label>

            <label className="field-shell">
              <span>Origem</span>
              <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                <option value="all">Todas as origens</option>
                <option value="admin">Admin</option>
                <option value="stripe">Stripe</option>
                <option value="public_signup">Cadastro público</option>
              </select>
            </label>

            <label className="field-shell">
              <span>Cobrança</span>
              <select value={billingFilter} onChange={(event) => setBillingFilter(event.target.value)}>
                <option value="all">Todos</option>
                <option value="none">Sem cobrança</option>
                <option value="active">Pagamento ativo</option>
                <option value="dispute_open">Em contestação</option>
                <option value="disputed">Contestada</option>
                <option value="refunded">Reembolsada</option>
                <option value="action_required">Ação necessária</option>
                <option value="past_due">Pagamento pendente</option>
                <option value="canceled">Assinatura cancelada</option>
              </select>
            </label>

            <label className="field-shell">
              <span>Dispositivo</span>
              <select value={deviceFilter} onChange={(event) => setDeviceFilter(event.target.value)}>
                <option value="all">Todos os dispositivos</option>
                <option value="with">Com dispositivo vinculado</option>
                <option value="without">Sem dispositivo vinculado</option>
              </select>
            </label>
          </div>

          {loadingLicenses ? (
            <div className="empty-state">
              <h3>Carregando licenças</h3>
              <p>Aguarde um instante.</p>
            </div>
          ) : !filteredLicenses.length ? (
            <div className="empty-state">
              <h3>Nenhuma licença encontrada</h3>
              <p>Altere os filtros ou tente outro termo.</p>
            </div>
          ) : (
            <>
              <div className="table-shell">
                <table className="license-table">
                  <colgroup>
                    <col className="col-user" />
                    <col className="col-phone" />
                    <col className="col-key" />
                    <col className="col-date" />
                    <col className="col-device" />
                    <col className="col-status" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Usuário</th>
                      <th>Contato</th>
                      <th>Chave</th>
                      <th>Vencimento</th>
                      <th>Dispositivo</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedLicenses.map((license) => {
                      const status = getStatus(license);
                      const billingStatus = getBillingStatus(license);
                      return (
                        <tr key={license.id} className={selectedId === license.id ? "is-active" : ""} onClick={() => openLicense(license.id)}>
                          <td>
                            <div className="user-cell">
                              <span className="avatar">{initials(license.name)}</span>
                              <div>
                                <strong>{license.name}</strong>
                                <p>#{license.id}</p>
                              </div>
                            </div>
                          </td>
                          <td className="cell-phone">{formatContact(getLicenseContact(license), getLicenseContactType(license))}</td>
                          <td className="cell-key" title={license.licenseKey}>{maskKey(license.licenseKey)}</td>
                          <td className="cell-date">{formatDate(license.expiresAt)}</td>
                          <td className="cell-device" title={license.hwid || "Sem dispositivo"}>
                            {license.hwid ? maskTechnicalValue(license.hwid, 10, 4) : "Sem dispositivo"}
                          </td>
                          <td className="cell-status">
                            <div className="status-stack">
                              <span className={`badge badge--${status.tone}`}>{status.shortLabel}</span>
                              {billingStatus.key !== "none" && (
                                <span className={`badge badge--${billingStatus.tone}`}>{billingStatus.shortLabel}</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="license-cards">
                {pagedLicenses.map((license) => {
                  const status = getStatus(license);
                  const billingStatus = getBillingStatus(license);
                  return (
                    <button key={license.id} className={`license-card ${selectedId === license.id ? "is-active" : ""}`} onClick={() => openLicense(license.id)}>
                      <div className="license-card__top">
                        <div className="user-cell">
                          <span className="avatar">{initials(license.name)}</span>
                          <div>
                            <strong>{license.name}</strong>
                            <p>{formatContact(getLicenseContact(license), getLicenseContactType(license))}</p>
                          </div>
                        </div>
                        <div className="status-stack status-stack--card">
                          <span className={`badge badge--${status.tone}`}>{status.shortLabel}</span>
                          {billingStatus.key !== "none" && (
                            <span className={`badge badge--${billingStatus.tone}`}>{billingStatus.shortLabel}</span>
                          )}
                        </div>
                      </div>
                      <dl className="license-card__meta">
                        <div>
                          <dt>Chave</dt>
                          <dd className="truncate-text" title={license.licenseKey}>{maskKey(license.licenseKey)}</dd>
                        </div>
                        <div>
                          <dt>Vencimento</dt>
                          <dd>{formatDate(license.expiresAt)}</dd>
                        </div>
                        <div>
                          <dt>Dispositivo</dt>
                          <dd className="truncate-text" title={license.hwid || "Sem dispositivo vinculado"}>
                            {license.hwid ? maskTechnicalValue(license.hwid, 10, 4) : "Sem dispositivo vinculado"}
                          </dd>
                        </div>
                      </dl>
                    </button>
                  );
                })}
              </div>

              <div className="table-footer">
                <span>
                  Mostrando {(safePage - 1) * PAGE_SIZE + 1} a {Math.min(safePage * PAGE_SIZE, filteredLicenses.length)} de {filteredLicenses.length} licenças
                </span>
                <div className="pager">
                  <button className="icon-button" disabled={safePage === 1} onClick={() => setPage((current) => current - 1)}>
                    {"<"}
                  </button>
                  <span className="pager__current">{safePage}</span>
                  <button className="icon-button" disabled={safePage === totalPages} onClick={() => setPage((current) => current + 1)}>
                    {">"}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        <aside className="panel panel--detail desktop-detail">
          <LicenseDetail
            license={selectedLicense}
            onCopy={copyLicenseKey}
            onEdit={() => openModal("edit")}
            onRenew={() => openModal("renew")}
            onReset={() => openModal("reset")}
            onRevoke={() => openModal("revoke")}
            onReactivate={() => openModal("reactivate")}
            onSendWelcomeEmail={onSendWelcomeEmail}
            mobile={false}
          />
        </aside>
      </div>
    </section>
  );
}
