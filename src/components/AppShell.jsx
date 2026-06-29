import React from "react";
import BrandMark from "./BrandMark";
import LicenseDetail from "./LicenseDetail";
import { initials } from "../lib/admin-ui";

export default function AppShell({
  auth,
  view,
  navigate,
  menuOpen,
  detailOpen,
  setMenuOpen,
  closePanels,
  selectedLicense,
  copyLicenseKey,
  openModal,
  setDetailOpen,
  handleLogout,
  loggingOut,
  children
}) {
  return (
    <div className="app">
      <div className="shell">
        <aside className={`sidebar ${menuOpen ? "is-open" : ""}`}>
          <div className="sidebar__brand">
            <BrandMark small />
            <div>
              <strong>Merlin Admin</strong>
              <span>{auth.username}</span>
            </div>
            <button className="icon-button sidebar__close" onClick={closePanels} aria-label="Fechar menu">
              x
            </button>
          </div>

          <div className="sidebar__group">
            <p className="sidebar__label">Gerenciamento</p>
            <button className={`nav-button ${view === "overview" ? "is-active" : ""}`} onClick={() => navigate("overview")}>
              Visão geral
            </button>
            <button className={`nav-button ${view === "licenses" ? "is-active" : ""}`} onClick={() => navigate("licenses")}>
              Licenças
            </button>
            <button className={`nav-button ${view === "overrides" ? "is-active" : ""}`} onClick={() => navigate("overrides")}>
              Overrides
            </button>
            <button className={`nav-button ${view === "activity" ? "is-active" : ""}`} onClick={() => navigate("activity")}>
              Atividade
            </button>
            <button className={`nav-button ${view === "audit" ? "is-active" : ""}`} onClick={() => navigate("audit")}>
              Auditoria
            </button>
            <button className={`nav-button ${view === "settings" ? "is-active" : ""}`} onClick={() => navigate("settings")}>
              Configurações
            </button>
          </div>

          <div className="sidebar__footer">
            <button className="nav-button nav-button--logout" onClick={handleLogout} disabled={loggingOut}>
              <span>{loggingOut ? "Saindo..." : "Sair do painel"}</span>
              <strong>{"->"}</strong>
            </button>
          </div>
        </aside>

        {(menuOpen || detailOpen) && <div className="backdrop" onClick={closePanels}></div>}

        <div className="content">
          <header className="topbar">
            <div className="topbar__left">
              <button className="icon-button topbar__menu" onClick={() => setMenuOpen(true)} aria-label="Abrir menu">
                =
              </button>
              <div className="topbar__brand">
                <BrandMark small />
                <div>
                  <strong>Merlin Admin</strong>
                  <span>{auth.username}</span>
                </div>
              </div>
            </div>

            <div className="topbar__actions">
              <span className="avatar avatar--tiny">{initials(auth.username)}</span>
            </div>
          </header>

          {children}
        </div>

        <div className={`mobile-sheet ${detailOpen ? "is-open" : ""}`}>
          <LicenseDetail
            license={selectedLicense}
            onCopy={copyLicenseKey}
            onEdit={() => openModal("edit")}
            onRenew={() => openModal("renew")}
            onReset={() => openModal("reset")}
            onRevoke={() => openModal("revoke")}
            onReactivate={() => openModal("reactivate")}
            onClose={() => setDetailOpen(false)}
            mobile
          />
        </div>
      </div>
    </div>
  );
}
