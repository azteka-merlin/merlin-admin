import { formatBrazilPhone } from "./admin-ui.js";

export function createEmptyPremiumDraft() {
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
    comingSoon: false,
    wasComingSoon: false,
  };
}

export function createPremiumDraft(entry) {
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
    comingSoon: Boolean(entry.comingSoon),
    wasComingSoon: Boolean(entry.comingSoon),
  };
}

export function normalizePremiumPayload(draft) {
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
    comingSoon: Boolean(draft.comingSoon),
  };

  const name = String(draft.name || "").trim();
  const coverUrl = String(draft.coverUrl || "").trim();
  const archiveKey = String(draft.archiveKey || "").trim();
  const installSubpath = String(draft.installSubpath || "").trim();
  const activationType = draft.activationType === "third_party" ? "third_party" : "steam_ticket";
  const launchExecutablePath = String(draft.launchExecutablePath || "").trim();

  if (!draft.comingSoon && activationType === "third_party" && !launchExecutablePath) {
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


export function retryDisplay(activation, now = Date.now()) {
  const retry = activation.retry;
  if (retry?.status === "review") return { label: "Verificar tentativa", tone: "warning", canGrant: true, review: true };
  if (retry?.status === "processing") return { label: "Tentativa em andamento", tone: "warning", canGrant: false };
  const expiresAt = retry?.expiresAt ? new Date(retry.expiresAt).getTime() : NaN;
  if (retry?.status === "available" && Number.isFinite(expiresAt) && expiresAt > now) {
    return { label: "Nova tentativa liberada", tone: "info", canGrant: false, expiresAt: retry.expiresAt };
  }
  return { label: retry?.status === "available" || retry?.status === "expired" ? "Prazo da nova tentativa encerrado" : "", tone: "muted", canGrant: activation.status === "active" };
}

export function contactPhone(wish) {
  if (!wish.phone || !wish.phoneConsentAt) return "";
  const raw = String(wish.phone).trim();
  const digits = raw.replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    return `+55 ${formatBrazilPhone(digits.slice(2))}`;
  }
  if (!raw.startsWith("+") && (digits.length === 10 || digits.length === 11)) {
    return formatBrazilPhone(digits);
  }
  return raw;
}
