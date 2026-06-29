function pad(value) {
  return String(value).padStart(2, "0");
}

export function formatDate(dateString) {
  if (!dateString) return "--";
  const date = new Date(`${dateString.slice(0, 10)}T00:00:00`);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function formatDateTime(dateString) {
  if (!dateString) return "--";
  const date = new Date(dateString);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function normalizeBrazilPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    return digits.slice(2);
  }
  return digits.slice(0, 11);
}

export function formatBrazilPhone(value) {
  const digits = normalizeBrazilPhone(value);
  if (!digits) return "--";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

export function formatBrazilPhoneInput(value) {
  const digits = normalizeBrazilPhone(value);
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

export function initials(name) {
  return (name || "Sistema")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function daysUntil(dateString) {
  const today = new Date();
  const date = new Date(`${dateString.slice(0, 10)}T00:00:00`);
  const diff = date.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function getStatus(license) {
  if (license.status === "revoked") {
    return { key: "revoked", label: "Revogada", shortLabel: "Revogada", tone: "danger" };
  }

  const diff = daysUntil(license.expiresAt);
  if (diff < 0) {
    return { key: "expired", label: "Expirada", shortLabel: "Expirada", tone: "expired" };
  }

  if (diff <= 7) {
    return { key: "soon", label: "Expira em breve", shortLabel: "Em breve", tone: "warning" };
  }

  return { key: "active", label: "Ativa", shortLabel: "Ativa", tone: "success" };
}

export function maskKey(key) {
  const parts = (key || "").split("-");
  if (parts.length !== 4) return key;
  return `${parts[0]}-${parts[1]}-....-${parts[3]}`;
}

export function maskTechnicalValue(value, start = 10, end = 4) {
  const text = String(value || "");
  if (!text) return text;
  if (text.length <= start + end + 3) return text;
  return `${text.slice(0, start)}...${text.slice(-end)}`;
}

export function actionLabel(action) {
  const labels = {
    admin_login_success: "Login realizado",
    admin_login_denied: "Login negado",
    admin_logout: "Logout",
    admin_session_expired: "Sessão expirada",
    admin_session_revoked: "Sessão revogada",
    admin_ip_blocked: "IP bloqueado",
    admin_user_locked: "Usuário bloqueado",
    license_created: "Licença criada",
    license_updated: "Licença atualizada",
    license_renewed: "Licença renovada",
    license_reactivated: "Licença reativada",
    license_revoked: "Licença revogada",
    license_hwid_reset: "HWID redefinido"
  };

  return labels[action] || action.replaceAll("_", " ");
}

export function actionTone(action) {
  if (action.includes("denied") || action.includes("revoked") || action.includes("blocked") || action.includes("locked")) {
    return "danger";
  }

  if (action.includes("expired")) {
    return "warning";
  }

  if (action.includes("created") || action.includes("updated") || action.includes("renewed") || action.includes("reset")) {
    return "info";
  }

  return "success";
}

export function describeAuditLog(log) {
  const metadata = log.metadata || {};

  if (log.action === "license_created") return `Criou a licença #${log.entityId || "--"}`;
  if (log.action === "license_updated") return `Atualizou a licença #${log.entityId || "--"}`;
  if (log.action === "license_renewed") return `Renovou a licença #${log.entityId || "--"}`;
  if (log.action === "license_reactivated") return `Reativou a licença #${log.entityId || "--"}`;
  if (log.action === "license_hwid_reset") return `Redefiniu o HWID da licença #${log.entityId || "--"}`;
  if (log.action === "license_revoked") {
    return `Revogou a licença #${log.entityId || "--"}${metadata.reason ? ` · ${metadata.reason}` : ""}`;
  }
  if (log.action === "admin_login_denied") {
    return metadata.username ? `Tentativa para ${metadata.username}` : "Tentativa de autenticação negada";
  }
  if (log.action === "admin_login_success") return "Autenticação concluída";
  if (log.action === "admin_logout") return "Encerramento manual da sessão";
  if (log.action === "admin_session_expired") return "Sessão expirada por tempo";
  if (log.action === "admin_session_revoked") return "Sessão revogada pelo sistema";
  if (log.action === "admin_ip_blocked") return metadata.username ? `Falhas associadas a ${metadata.username}` : "Bloqueio por repetição de falhas";
  if (log.action === "admin_user_locked") return metadata.username ? `Usuário ${metadata.username} bloqueado` : "Conta bloqueada temporariamente";

  return metadata.reason || "Evento administrativo registrado";
}

export function userActivityLabel(action) {
  const labels = {
    user_login_success: "Login do usuário",
    game_activation_success: "Ativação liberada",
    game_activation_denied: "Ativação negada"
  };

  return labels[action] || action.replaceAll("_", " ");
}

export function listAuditActions(logs) {
  return Array.from(new Set(logs.map((log) => log.action))).sort();
}

export function appStats(licenses) {
  return [
    {
      label: "Licenças ativas",
      value: licenses.filter((item) => getStatus(item).key === "active").length,
      note: "Disponíveis para uso",
      tone: "success"
    },
    {
      label: "Expiram em breve",
      value: licenses.filter((item) => getStatus(item).key === "soon").length,
      note: "Atenção recomendada",
      tone: "warning"
    },
    {
      label: "Dispositivos vinculados",
      value: licenses.filter((item) => item.hwid).length,
      note: "HWIDs ativos",
      tone: "info"
    },
    {
      label: "Licenças revogadas",
      value: licenses.filter((item) => getStatus(item).key === "revoked").length,
      note: "Bloqueadas manualmente",
      tone: "danger"
    }
  ];
}
