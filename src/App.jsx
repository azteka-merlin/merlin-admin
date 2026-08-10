import React from "react";
import AppShell from "./components/AppShell";
import LicenseModals from "./components/LicenseModals";
import LoadingScreen from "./components/LoadingScreen";
import LoginScreen from "./components/LoginScreen";
import ActivityPage from "./pages/ActivityPage";
import AuditPage from "./pages/AuditPage";
import LicensesPage from "./pages/LicensesPage";
import OverviewPage from "./pages/OverviewPage";
import OverridesPage from "./pages/OverridesPage";
import PaymentsPage from "./pages/PaymentsPage";
import PollsPage from "./pages/PollsPage";
import PremiumPage from "./pages/PremiumPage";
import PublicSignupPage from "./pages/PublicSignupPage";
import SettingsPage from "./pages/SettingsPage";
import { PAGE_SIZE, VIEW_PATHS, getViewFromPath } from "./lib/navigation";
import { formatContact, getBillingStatus, getLicenseContact, getLicenseContactType, getStatus, normalizeContactInput } from "./lib/admin-ui";

function isValidRecoverySecret(value) {
  const secret = String(value || "").trim();
  return /^\S{4,8}$/.test(secret);
}

const RECOVERY_SECRET_MESSAGE = "Use 4 a 8 caracteres, sem espacos.";
function createEmptyOverrideForm() {
  return {
    overrideMode: "create",
    overrideAppId: "",
    overrideName: "",
    overrideHidden: false,
    overrideManifestEnabled: false,
    overrideManifestFile: "",
    overrideFixEnabled: false,
    overrideFixFile: "",
    overrideFilename: "",
    overrideSize: "",
    overrideAdminNote: ""
  };
}

function mapOverridesDocument(overridesMap) {
  return Object.entries(overridesMap || {})
    .map(([appId, entry]) => ({
      appId,
      name: entry.name || entry.fixOverride?.gameName || "",
      adminNote: entry.adminNote || "",
      hidden: Boolean(entry.hidden),
      manifestOverride: entry.manifestOverride || null,
      fixOverride: entry.fixOverride || null
    }))
    .sort((left, right) => Number(left.appId) - Number(right.appId));
}

function createOverrideForm(entry) {
  if (!entry) {
    return createEmptyOverrideForm();
  }

  return {
    overrideMode: "edit",
    overrideAppId: entry.appId,
    overrideName: entry.name || entry.fixOverride?.gameName || "",
    overrideHidden: Boolean(entry.hidden),
    overrideManifestEnabled: Boolean(entry.manifestOverride?.enabled),
    overrideManifestFile: entry.manifestOverride?.file || "",
    overrideFixEnabled: Boolean(entry.fixOverride?.enabled),
    overrideFixFile: entry.fixOverride?.file || "",
    overrideFilename: entry.fixOverride?.filename || "",
    overrideSize: entry.fixOverride?.size || "",
    overrideAdminNote: entry.adminNote || ""
  };
}

function buildOverridePayload(formState) {
  const appId = String(formState.overrideAppId || "").trim();
  if (!/^\d+$/.test(appId)) {
    throw new Error("Informe um appId numérico válido.");
  }

  const name = String(formState.overrideName || "").trim();
  if (!name) {
    throw new Error("Informe o nome do jogo para este override.");
  }

  const payload = {
    appId,
    name,
    hidden: Boolean(formState.overrideHidden),
    ...(formState.overrideAdminNote.trim() ? { adminNote: formState.overrideAdminNote.trim() } : {})
  };

  if (formState.overrideManifestEnabled || formState.overrideManifestFile.trim()) {
    const file = formState.overrideManifestFile.trim();
    if (!file) throw new Error("Informe o caminho do manifest override.");
    payload.manifestOverride = { enabled: !formState.overrideHidden && Boolean(formState.overrideManifestEnabled), file };
  }

  if (formState.overrideFixEnabled || formState.overrideFixFile.trim()) {
    const file = formState.overrideFixFile.trim();
    if (!file) throw new Error("Informe o caminho do fix override.");

    payload.fixOverride = {
      enabled: !formState.overrideHidden && Boolean(formState.overrideFixEnabled),
      file,
      ...(formState.overrideFilename.trim() ? { filename: formState.overrideFilename.trim() } : {}),
      ...(formState.overrideSize.trim() ? { size: formState.overrideSize.trim() } : {})
    };
  }

  if (!payload.manifestOverride && !payload.fixOverride && !payload.adminNote && !payload.hidden) {
    throw new Error("Adicione uma nota, arquivo ou desmarque a exibicao antes de salvar.");
  }

  return payload;
}

function isValidContact(contact, contactType) {
  if (contactType === "phone") return /^\d{11}$/.test(contact);
  if (contactType === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
  return contact.length >= 2;
}

function contactValidationMessage(contactType) {
  if (contactType === "phone") return "Informe um celular brasileiro válido com DDD.";
  if (contactType === "email") return "Informe um e-mail válido.";
  return "Informe um contato do Discord válido.";
}

function App() {
  const OVERRIDE_UPLOAD_TIMEOUT_MS = 45000;
  const OVERRIDE_UPLOAD_MAX_RETRIES = 2;
  const MERLIN_UPDATE_UPLOAD_TIMEOUT_MS = 60000;
  const MERLIN_UPDATE_UPLOAD_MAX_RETRIES = 2;
  const [booting, setBooting] = React.useState(true);
  const [auth, setAuth] = React.useState(null);
  const [csrfToken, setCsrfToken] = React.useState("");
  const [view, setView] = React.useState(getViewFromPath(window.location.pathname));
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [licenses, setLicenses] = React.useState([]);
  const [auditLogs, setAuditLogs] = React.useState([]);
  const [userActivityLogs, setUserActivityLogs] = React.useState([]);
  const [blockedIps, setBlockedIps] = React.useState([]);
  const [overrides, setOverrides] = React.useState([]);
  const [premiumGames, setPremiumGames] = React.useState([]);
  const [polls, setPolls] = React.useState([]);
  const [paymentLogs, setPaymentLogs] = React.useState([]);
  const [paymentEvents, setPaymentEvents] = React.useState([]);
  const [merlinUpdate, setMerlinUpdate] = React.useState(null);
  const [publicSignup, setPublicSignup] = React.useState({
    settings: { enabled: false, durationAmount: 30, durationUnit: "days", isLifetime: false, description: "" },
    billing: {
      billingEnabled: false,
      monthlyEnabled: true,
      lifetimeEnabled: true,
      pixEnabled: false,
      pixMonthlyEnabled: true,
      pixLifetimeEnabled: true,
      monthlyCardTrialEnabled: false,
      monthlyCardTrialDays: 30,
      monthlyPriceId: "",
      lifetimePriceId: "",
      prices: { monthly: null, lifetime: null }
    },
    metrics: { total: 0, active: 0, expired: 0, latestCreatedAt: null }
  });
  const [loadingLicenses, setLoadingLicenses] = React.useState(false);
  const [loadingAuditLogs, setLoadingAuditLogs] = React.useState(false);
  const [loadingUserActivityLogs, setLoadingUserActivityLogs] = React.useState(false);
  const [loadingBlockedIps, setLoadingBlockedIps] = React.useState(false);
  const [loadingOverrides, setLoadingOverrides] = React.useState(false);
  const [loadingPremiumGames, setLoadingPremiumGames] = React.useState(false);
  const [loadingPolls, setLoadingPolls] = React.useState(false);
  const [loadingPaymentLogs, setLoadingPaymentLogs] = React.useState(false);
  const [loadingMerlinUpdate, setLoadingMerlinUpdate] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState(null);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [deviceFilter, setDeviceFilter] = React.useState("all");
  const [sourceFilter, setSourceFilter] = React.useState("all");
  const [billingFilter, setBillingFilter] = React.useState("all");
  const [auditSearch, setAuditSearch] = React.useState("");
  const [auditActionFilter, setAuditActionFilter] = React.useState("all");
  const [auditAdminFilter, setAuditAdminFilter] = React.useState("all");
  const [activitySearch, setActivitySearch] = React.useState("");
  const [activityActionFilter, setActivityActionFilter] = React.useState("all");
  const [activityStatusFilter, setActivityStatusFilter] = React.useState("all");
  const [overrideSearch, setOverrideSearch] = React.useState("");
  const [premiumSearch, setPremiumSearch] = React.useState("");
  const [pollSearch, setPollSearch] = React.useState("");
  const [paymentSearch, setPaymentSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [toast, setToast] = React.useState("");
  const [overrideUploadProgress, setOverrideUploadProgress] = React.useState(null);
  const [merlinUpdateUploadProgress, setMerlinUpdateUploadProgress] = React.useState(null);
  const [activeModal, setActiveModal] = React.useState(null);
  const [showPassword, setShowPassword] = React.useState(false);
  const [overrideDeleteTarget, setOverrideDeleteTarget] = React.useState("");
  const [busyAction, setBusyAction] = React.useState("");
  const [loginState, setLoginState] = React.useState({ username: "", password: "", rememberMe: false, error: "", submitting: false });
  const [formState, setFormState] = React.useState({
    createName: "",
    createContact: "",
    createContactType: "phone",
    createRecoveryPin: "",
    createExpiry: "",
    editName: "",
    editContact: "",
    editContactType: "phone",
    editRecoveryPin: "",
    editExpiry: "",
    editHwid: "",
    renewExpiry: "",
    revokeReason: "",
    ...createEmptyOverrideForm()
  });
  const [merlinUpdateDraft, setMerlinUpdateDraft] = React.useState({
    version: "",
    file: null
  });

  const selectedLicense = React.useMemo(() => licenses.find((item) => item.id === selectedId) ?? null, [licenses, selectedId]);

  const filteredLicenses = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return licenses.filter((license) => {
      const status = getStatus(license);
      const contact = getLicenseContact(license);
      const contactType = getLicenseContactType(license);
      const normalizedContact = normalizeContactInput(search, contactType);
      const matchesSearch =
        !query ||
        license.name.toLowerCase().includes(query) ||
        (normalizedContact && contact.includes(normalizedContact)) ||
        formatContact(contact, contactType).toLowerCase().includes(query) ||
        license.licenseKey.toLowerCase().includes(query) ||
        String(license.id).includes(query) ||
        (license.hwid || "").toLowerCase().includes(query);

      const matchesStatus = statusFilter === "all" || status.key === statusFilter;
      const source = license.source || "admin";
      const matchesSource = sourceFilter === "all" || source === sourceFilter;
      const billingStatus = getBillingStatus(license);
      const matchesBilling = billingFilter === "all" || billingStatus.key === billingFilter;
      const hasDevice = Boolean(license.hwid);
      const matchesDevice =
        deviceFilter === "all" ||
        (deviceFilter === "with" && hasDevice) ||
        (deviceFilter === "without" && !hasDevice);

      return matchesSearch && matchesStatus && matchesSource && matchesBilling && matchesDevice;
    });
  }, [billingFilter, deviceFilter, licenses, search, sourceFilter, statusFilter]);

  const auditAdminOptions = React.useMemo(
    () =>
      Array.from(
        new Map(
          auditLogs
            .filter((log) => log.adminUserId || log.adminUsername)
            .map((log) => [String(log.adminUserId || log.adminUsername), { id: log.adminUserId, name: log.actorName }])
        ).values()
      ),
    [auditLogs]
  );

  const filteredAuditLogs = React.useMemo(() => {
    const query = auditSearch.trim().toLowerCase();

    return auditLogs.filter((log) => {
      const matchesAction = auditActionFilter === "all" || log.action === auditActionFilter;
      const matchesAdmin = auditAdminFilter === "all" || String(log.adminUserId || log.adminUsername || "") === auditAdminFilter;
      const matchesSearch =
        !query ||
        log.actorName.toLowerCase().includes(query) ||
        String(log.entityId || "").toLowerCase().includes(query) ||
        JSON.stringify(log.metadata || {}).toLowerCase().includes(query);

      return matchesAction && matchesAdmin && matchesSearch;
    });
  }, [auditActionFilter, auditAdminFilter, auditLogs, auditSearch]);

  const filteredUserActivityLogs = React.useMemo(() => {
    const query = activitySearch.trim().toLowerCase();

    return userActivityLogs.filter((log) => {
      const matchesAction = activityActionFilter === "all" || log.action === activityActionFilter;
      const matchesStatus = activityStatusFilter === "all" || log.status === activityStatusFilter;
      const matchesSearch =
        !query ||
        log.userName.toLowerCase().includes(query) ||
        log.licenseKey.toLowerCase().includes(query) ||
        String(log.appId || "").toLowerCase().includes(query) ||
        String(log.gameName || "").toLowerCase().includes(query) ||
        String(log.ipAddress || "").toLowerCase().includes(query) ||
        String(log.reason || "").toLowerCase().includes(query);

      return matchesAction && matchesStatus && matchesSearch;
    });
  }, [activityActionFilter, activitySearch, activityStatusFilter, userActivityLogs]);

  const filteredPaymentLogs = React.useMemo(() => {
    const query = paymentSearch.trim().toLowerCase();
    if (!query) return paymentLogs;

    return paymentLogs.filter((payment) => {
      const haystack = [
        payment.email,
        payment.provider,
        payment.providerSessionId,
        payment.providerPaymentId,
        payment.providerSubscriptionId,
        payment.providerExternalReference,
        payment.providerRawStatus,
        payment.providerStatusDetail,
        payment.providerPriceId,
        payment.licenseKey,
        payment.licenseName,
        payment.checkoutIp,
        payment.checkoutCountry,
        payment.checkoutStatus,
        payment.paymentStatus,
        payment.paymentRecordStatus,
        payment.billingStatus,
        payment.accessType,
        payment.licenseId ? String(payment.licenseId) : ""
      ].filter(Boolean).join(" ").toLowerCase();

      return haystack.includes(query);
    });
  }, [paymentLogs, paymentSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredLicenses.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedLicenses = filteredLicenses.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  React.useEffect(() => {
    const onPopState = () => {
      if (window.location.pathname === "/login") {
        if (auth) navigate("overview", true);
        return;
      }

      setView(getViewFromPath(window.location.pathname));
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [auth]);

  React.useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  React.useEffect(() => {
    if (!menuOpen && !detailOpen && !activeModal) {
      document.body.classList.remove("is-locked");
      return;
    }

    document.body.classList.add("is-locked");
    return () => document.body.classList.remove("is-locked");
  }, [menuOpen, detailOpen, activeModal]);

  React.useEffect(() => {
    setPage(1);
  }, [search, statusFilter, sourceFilter, billingFilter, deviceFilter]);

  React.useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [page, safePage]);

  React.useEffect(() => {
    if (!selectedLicense && licenses.length) {
      setSelectedId(licenses[0].id);
    }
  }, [licenses, selectedLicense]);

  async function apiRequest(path, options = {}) {
    const { method = "GET", body, mutate = false, ignoreUnauthorized = false } = options;
    const headers = { Accept: "application/json" };

    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (mutate && csrfToken) headers["X-CSRF-Token"] = csrfToken;

    const response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });

    const isJson = response.headers.get("content-type")?.includes("application/json");
    const payload = isJson ? await response.json() : null;

    if (response.status === 401 && !ignoreUnauthorized) {
      setAuth(null);
      setCsrfToken("");
      setLicenses([]);
      setAuditLogs([]);
      setUserActivityLogs([]);
      setBlockedIps([]);
      setOverrides([]);
      setPremiumGames([]);
      setPolls([]);
      setPaymentLogs([]);
      setPaymentEvents([]);
      setMerlinUpdate(null);
      setPublicSignup({
        settings: { enabled: false, durationAmount: 30, durationUnit: "days", isLifetime: false, description: "" },
        billing: {
          billingEnabled: false,
          monthlyEnabled: true,
          lifetimeEnabled: true,
          pixEnabled: false,
          pixMonthlyEnabled: true,
          pixLifetimeEnabled: true,
          monthlyCardTrialEnabled: false,
          monthlyCardTrialDays: 30,
          monthlyPriceId: "",
          lifetimePriceId: "",
          prices: { monthly: null, lifetime: null }
        },
        metrics: { total: 0, active: 0, expired: 0, latestCreatedAt: null }
      });
      setSelectedId(null);
      setDetailOpen(false);
      setActiveModal(null);
      navigateToLogin({ replace: true, reload: true });
      throw new Error(payload?.error || "Sessão expirada. Faça login novamente.");
    }

    if (!response.ok) {
      throw new Error(payload?.error || "Não foi possível concluir a solicitação.");
    }

    return payload;
  }

  async function apiUpload(path, body, options = {}) {
    const {
      method = "POST",
      mutate = false,
      ignoreUnauthorized = false,
      headers: extraHeaders = {},
      onProgress,
      timeoutMs = 0
    } = options;
    const headers = { Accept: "application/json", ...extraHeaders };

    if (mutate && csrfToken) headers["X-CSRF-Token"] = csrfToken;

    let response;
    try {
      response = await new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open(method, path, true);
        request.withCredentials = true;
        if (timeoutMs > 0) request.timeout = timeoutMs;

        Object.entries(headers).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            request.setRequestHeader(key, value);
          }
        });

        if (typeof onProgress === "function") {
          request.upload.onprogress = (event) => {
            onProgress({
              loaded: event.loaded,
              total: event.lengthComputable ? event.total : 0
            });
          };
        }

        request.onerror = () => reject(new Error("Failed to fetch"));
        request.ontimeout = () => reject(new Error("Upload timed out"));
        request.onabort = () => reject(new Error("Upload aborted"));
        request.onload = () => {
          const responseHeaders = new Headers();
          const rawHeaders = request.getAllResponseHeaders().trim().split(/[\r\n]+/);

          rawHeaders.forEach((line) => {
            const separator = line.indexOf(":");
            if (separator > 0) {
              const key = line.slice(0, separator).trim();
              const value = line.slice(separator + 1).trim();
              responseHeaders.append(key, value);
            }
          });

          resolve(
            new Response(request.responseText, {
              status: request.status,
              statusText: request.statusText,
              headers: responseHeaders
            })
          );
        };

        request.send(body);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      throw new Error(
        message === "Failed to fetch"
          ? "Falha no envio do arquivo. Se ele for muito grande, o limite da borda pode ter interrompido o upload."
          : "Não foi possível enviar o arquivo agora."
      );
    }

    const isJson = response.headers.get("content-type")?.includes("application/json");
    const payload = isJson ? await response.json() : null;

    if (response.status === 401 && !ignoreUnauthorized) {
      setAuth(null);
      setCsrfToken("");
      setLicenses([]);
      setAuditLogs([]);
      setUserActivityLogs([]);
      setBlockedIps([]);
      setOverrides([]);
      setPremiumGames([]);
      setPolls([]);
      setPaymentLogs([]);
      setPaymentEvents([]);
      setMerlinUpdate(null);
      setSelectedId(null);
      setDetailOpen(false);
      setActiveModal(null);
      navigateToLogin({ replace: true, reload: true });
      throw new Error(payload?.error || "Sessão expirada. Faça login novamente.");
    }

    if (!response.ok) {
      throw new Error(payload?.error || "Não foi possível concluir a solicitação.");
    }

    return payload;
  }

  async function abortOverrideUploadSession(session, useKeepalive = false) {
    if (!session?.uploadId || !session?.objectKey || !session?.appId || !session?.kind) return;

    const payload = JSON.stringify({
      appId: session.appId,
      kind: session.kind,
      uploadId: session.uploadId,
      objectKey: session.objectKey
    });

    try {
      if (useKeepalive) {
        await fetch("/panel-api/overrides/upload/abort", {
          method: "POST",
          credentials: "same-origin",
          keepalive: true,
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {})
          },
          body: payload
        });
        return;
      }

      await apiRequest("/panel-api/overrides/upload/abort", {
        method: "POST",
        mutate: true,
        body: JSON.parse(payload)
      });
    } catch {
      // best effort cleanup
    }
  }

  async function abortMerlinUpdateUploadSession(session, useKeepalive = false) {
    if (!session?.uploadId || !session?.objectKey) return;

    const payload = JSON.stringify({
      uploadId: session.uploadId,
      objectKey: session.objectKey
    });

    try {
      if (useKeepalive) {
        await fetch("/panel-api/updates/upload/abort", {
          method: "POST",
          credentials: "same-origin",
          keepalive: true,
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {})
          },
          body: payload
        });
        return;
      }

      await apiRequest("/panel-api/updates/upload/abort", {
        method: "POST",
        mutate: true,
        body: JSON.parse(payload)
      });
    } catch {
      // best effort cleanup
    }
  }

  async function uploadOverrideFileInChunks(appId, kind, file) {
    const started = await apiRequest("/panel-api/overrides/upload/initiate", {
      method: "POST",
      mutate: true,
      body: {
        appId,
        kind,
        filename: file.name || "arquivo",
        sizeBytes: file.size || 0
      }
    });

    const partSize = Number(started.partSize) || (8 * 1024 * 1024);
    const totalParts = Math.max(1, Math.ceil(file.size / partSize));
    const uploadedParts = [];
    const totalBytes = Math.max(Number(file.size) || 0, 1);

    setOverrideUploadProgress({
      kind,
      appId,
      uploadId: started.uploadId,
      objectKey: started.path,
      fileName: file.name || "arquivo",
      currentPart: 0,
      totalParts,
      loadedBytes: 0,
      totalBytes,
      percent: 0
    });

    try {
      for (let index = 0; index < totalParts; index += 1) {
        const partNumber = index + 1;
        const chunkStart = index * partSize;
        const chunkEnd = Math.min(file.size, (index + 1) * partSize);
        const chunk = file.slice(chunkStart, chunkEnd);
        const query = new URLSearchParams({
          appId,
          kind,
          uploadId: started.uploadId,
          objectKey: started.path,
          partNumber: String(partNumber)
        });

        let uploadedPart = null;
        let lastError = null;

        for (let attempt = 0; attempt <= OVERRIDE_UPLOAD_MAX_RETRIES; attempt += 1) {
          try {
            setOverrideUploadProgress((current) =>
              current?.kind === kind
                ? {
                    ...current,
                    currentPart: partNumber,
                    totalParts,
                    retryCount: attempt,
                    statusText:
                      attempt > 0
                        ? `Tentando novamente a parte ${partNumber}/${totalParts}...`
                        : `Enviando parte ${partNumber}/${totalParts}...`
                  }
                : current
            );

            uploadedPart = await apiUpload(`/panel-api/overrides/upload/part?${query.toString()}`, chunk, {
              method: "POST",
              mutate: true,
              headers: {
                "Content-Type": "application/octet-stream"
              },
              timeoutMs: OVERRIDE_UPLOAD_TIMEOUT_MS,
              onProgress: ({ loaded, total }) => {
                const chunkLoaded = Math.min(total || chunk.size || loaded, loaded);
                const loadedBytes = Math.min(totalBytes, chunkStart + chunkLoaded);
                const percent = Math.min(100, Math.round((loadedBytes / totalBytes) * 100));

                setOverrideUploadProgress((current) =>
                  current?.kind === kind
                    ? {
                        ...current,
                        currentPart: partNumber,
                        totalParts,
                        loadedBytes,
                        totalBytes,
                        percent
                      }
                    : current
                );
              }
            });
            break;
          } catch (error) {
            lastError = error;
            const isLastAttempt = attempt >= OVERRIDE_UPLOAD_MAX_RETRIES;
            if (isLastAttempt) {
              throw error;
            }
          }
        }

        if (!uploadedPart) {
          throw lastError || new Error("Não foi possível enviar o arquivo.");
        }

        uploadedParts.push(uploadedPart);
        setOverrideUploadProgress((current) =>
          current?.kind === kind
            ? {
                ...current,
                currentPart: partNumber,
                totalParts,
                retryCount: 0,
                statusText: `Enviando parte ${Math.min(partNumber + 1, totalParts)}/${totalParts}...`,
                loadedBytes: Math.min(totalBytes, chunkEnd),
                totalBytes,
                percent: Math.min(100, Math.round((Math.min(totalBytes, chunkEnd) / totalBytes) * 100))
              }
            : current
        );
      }

      return await apiRequest("/panel-api/overrides/upload/complete", {
        method: "POST",
        mutate: true,
        body: {
          appId,
          kind,
          uploadId: started.uploadId,
          objectKey: started.path,
          filename: started.filename || file.name || "arquivo",
          sizeBytes: file.size || 0,
          uploadedParts
        }
      });
    } catch (error) {
      await abortOverrideUploadSession({
        appId,
        kind,
        uploadId: started.uploadId,
        objectKey: started.path
      });

      throw error;
    } finally {
      setOverrideUploadProgress(null);
    }
  }

  async function uploadMerlinUpdateInChunks(version, file) {
    const started = await apiRequest("/panel-api/updates/upload/initiate", {
      method: "POST",
      mutate: true,
      body: {
        version,
        filename: file.name || "Merlin-Setup-latest.exe",
        sizeBytes: file.size || 0
      }
    });

    const partSize = Number(started.partSize) || (16 * 1024 * 1024);
    const totalParts = Math.max(1, Math.ceil(file.size / partSize));
    const uploadedParts = [];
    const totalBytes = Math.max(Number(file.size) || 0, 1);

    setMerlinUpdateUploadProgress({
      version,
      uploadId: started.uploadId,
      objectKey: started.objectKey,
      fileName: file.name || "Merlin-Setup-latest.exe",
      currentPart: 0,
      totalParts,
      loadedBytes: 0,
      totalBytes,
      percent: 0,
      statusText: "Preparando upload do Merlin..."
    });

    try {
      for (let index = 0; index < totalParts; index += 1) {
        const partNumber = index + 1;
        const chunkStart = index * partSize;
        const chunkEnd = Math.min(file.size, (index + 1) * partSize);
        const chunk = file.slice(chunkStart, chunkEnd);
        const query = new URLSearchParams({
          uploadId: started.uploadId,
          objectKey: started.objectKey,
          partNumber: String(partNumber)
        });

        let uploadedPart = null;
        let lastError = null;

        for (let attempt = 0; attempt <= MERLIN_UPDATE_UPLOAD_MAX_RETRIES; attempt += 1) {
          try {
            setMerlinUpdateUploadProgress((current) =>
              current?.uploadId === started.uploadId
                ? {
                    ...current,
                    currentPart: partNumber,
                    retryCount: attempt,
                    statusText:
                      attempt > 0
                        ? `Tentando novamente a parte ${partNumber}/${totalParts} do Merlin...`
                        : `Enviando parte ${partNumber}/${totalParts} do Merlin...`
                  }
                : current
            );

            uploadedPart = await apiUpload(`/panel-api/updates/upload/part?${query.toString()}`, chunk, {
              method: "POST",
              mutate: true,
              headers: {
                "Content-Type": "application/octet-stream"
              },
              timeoutMs: MERLIN_UPDATE_UPLOAD_TIMEOUT_MS,
              onProgress: ({ loaded, total }) => {
                const chunkLoaded = Math.min(total || chunk.size || loaded, loaded);
                const loadedBytes = Math.min(totalBytes, chunkStart + chunkLoaded);
                const percent = Math.min(100, Math.round((loadedBytes / totalBytes) * 100));

                setMerlinUpdateUploadProgress((current) =>
                  current?.uploadId === started.uploadId
                    ? {
                        ...current,
                        currentPart: partNumber,
                        loadedBytes,
                        totalBytes,
                        percent
                      }
                    : current
                );
              }
            });
            break;
          } catch (error) {
            lastError = error;
            if (attempt >= MERLIN_UPDATE_UPLOAD_MAX_RETRIES) {
              throw error;
            }
          }
        }

        if (!uploadedPart) {
          throw lastError || new Error("Não foi possível enviar a atualização do Merlin.");
        }

        uploadedParts.push(uploadedPart);
        setMerlinUpdateUploadProgress((current) =>
          current?.uploadId === started.uploadId
            ? {
                ...current,
                currentPart: partNumber,
                retryCount: 0,
                statusText: `Enviando parte ${Math.min(partNumber + 1, totalParts)}/${totalParts} do Merlin...`,
                loadedBytes: Math.min(totalBytes, chunkEnd),
                totalBytes,
                percent: Math.min(100, Math.round((Math.min(totalBytes, chunkEnd) / totalBytes) * 100))
              }
            : current
        );
      }

      return await apiRequest("/panel-api/updates/upload/complete", {
        method: "POST",
        mutate: true,
        body: {
          version,
          uploadId: started.uploadId,
          objectKey: started.objectKey,
          filename: started.filename || file.name || "Merlin-Setup-latest.exe",
          sizeBytes: file.size || 0,
          uploadedParts
        }
      });
    } catch (error) {
      await abortMerlinUpdateUploadSession({
        uploadId: started.uploadId,
        objectKey: started.objectKey
      });
      throw error;
    } finally {
      setMerlinUpdateUploadProgress(null);
    }
  }

  function navigate(nextView, replace = false) {
    const nextPath = VIEW_PATHS[nextView] || "/";
    setView(nextView);
    if (window.location.pathname !== nextPath) {
      const method = replace ? "replaceState" : "pushState";
      window.history[method]({}, "", nextPath);
    }
  }

  function navigateToLogin(options = {}) {
    const { replace = false, reload = false } = options;

    if (reload) {
      window.location.replace("/login");
      return;
    }

    if (window.location.pathname !== "/login") {
      const method = replace ? "replaceState" : "pushState";
      window.history[method]({}, "", "/login");
    }
  }

  async function bootSession() {
    try {
      const payload = await apiRequest("/panel-api/auth/session", { ignoreUnauthorized: true });
      if (payload?.authenticated) {
        setAuth(payload.admin);
        setCsrfToken(payload.csrfToken);
        navigate(window.location.pathname === "/login" ? "overview" : getViewFromPath(window.location.pathname), true);
        return true;
      }
    } catch {
      // ignore boot failure
    }

    setAuth(null);
    setCsrfToken("");
    navigateToLogin({ replace: true });
    return false;
  }

  async function loadLicenses() {
    setLoadingLicenses(true);
    try {
      const payload = await apiRequest("/panel-api/licenses");
      setLicenses(payload.licenses || []);
      if (!selectedId && payload.licenses?.length) {
        setSelectedId(payload.licenses[0].id);
      }
    } catch (error) {
      setToast(error.message);
    } finally {
      setLoadingLicenses(false);
    }
  }

  async function loadAuditLogs() {
    setLoadingAuditLogs(true);
    try {
      const payload = await apiRequest("/panel-api/audit-logs?limit=120");
      setAuditLogs(payload.logs || []);
    } catch (error) {
      setToast(error.message);
    } finally {
      setLoadingAuditLogs(false);
    }
  }

  async function loadUserActivityLogs() {
    setLoadingUserActivityLogs(true);
    try {
      const payload = await apiRequest("/panel-api/user-activity?limit=120");
      setUserActivityLogs(payload.logs || []);
    } catch (error) {
      setToast(error.message);
    } finally {
      setLoadingUserActivityLogs(false);
    }
  }

  async function loadBlockedIps() {
    setLoadingBlockedIps(true);
    try {
      const payload = await apiRequest("/panel-api/security/blocked-ips");
      setBlockedIps(payload.blockedIps || []);
    } catch (error) {
      setToast(error.message);
    } finally {
      setLoadingBlockedIps(false);
    }
  }

  async function loadOverrides() {
    setLoadingOverrides(true);
    try {
      const payload = await apiRequest("/panel-api/overrides");
      setOverrides(mapOverridesDocument(payload.overrides));
    } catch (error) {
      setToast(error.message);
    } finally {
      setLoadingOverrides(false);
    }
  }

  async function loadPremiumGames() {
    setLoadingPremiumGames(true);
    try {
      const payload = await apiRequest("/panel-api/premium/games");
      setPremiumGames(payload.games || []);
    } catch (error) {
      setToast(error.message);
    } finally {
      setLoadingPremiumGames(false);
    }
  }

  async function loadPolls() {
    setLoadingPolls(true);
    try {
      const payload = await apiRequest("/panel-api/polls");
      setPolls(payload.polls || []);
    } catch (error) {
      setToast(error.message);
    } finally {
      setLoadingPolls(false);
    }
  }

  async function loadPollResults(pollId) {
    return apiRequest(`/panel-api/polls/${encodeURIComponent(pollId)}/results`);
  }

  async function loadPaymentLogs() {
    setLoadingPaymentLogs(true);
    try {
      const payload = await apiRequest("/panel-api/payments?limit=140");
      setPaymentLogs(payload.payments || []);
      setPaymentEvents(payload.events || []);
    } catch (error) {
      setToast(error.message);
    } finally {
      setLoadingPaymentLogs(false);
    }
  }

  async function loadMerlinUpdate() {
    setLoadingMerlinUpdate(true);
    try {
      const payload = await apiRequest("/panel-api/updates");
      setMerlinUpdate(payload.update || null);
    } catch (error) {
      setToast(error.message);
    } finally {
      setLoadingMerlinUpdate(false);
    }
  }

  async function loadPublicSignup() {
    const payload = await apiRequest("/panel-api/public-signup");
    setPublicSignup({
      settings: payload.settings || { enabled: false, durationAmount: 30, durationUnit: "days", isLifetime: false, description: "" },
      billing: payload.billing || {
        billingEnabled: false,
        monthlyEnabled: true,
        lifetimeEnabled: true,
        pixEnabled: false,
        pixMonthlyEnabled: true,
        pixLifetimeEnabled: true,
        monthlyCardTrialEnabled: false,
        monthlyCardTrialDays: 30,
        monthlyPriceId: "",
        lifetimePriceId: "",
        prices: { monthly: null, lifetime: null }
      },
      metrics: payload.metrics || { total: 0, active: 0, expired: 0, latestCreatedAt: null }
    });
  }

  async function handleSavePublicSignupSettings(settings) {
    setBusyAction("save-public-signup");
    try {
      const payload = await apiRequest("/panel-api/public-signup", {
        method: "PUT",
        mutate: true,
        body: settings
      });
      setPublicSignup({
        settings: payload.settings || settings,
        billing: payload.billing || settings.billing || publicSignup.billing,
        metrics: payload.metrics || publicSignup.metrics
      });
      setToast("Configurações do acesso público salvas.");
    } catch (error) {
      setToast(error.message);
    } finally {
      setBusyAction("");
    }
  }

  async function runBusyAction(actionKey, callback) {
    if (busyAction) return undefined;
    setBusyAction(actionKey);
    try {
      return await callback();
    } finally {
      setBusyAction("");
    }
  }

  async function handleSyncPaymentCheckout(sessionId) {
    if (!sessionId) return;
    await runBusyAction(`sync-checkout-${sessionId}`, async () => {
      await apiRequest(`/panel-api/payments/checkouts/${encodeURIComponent(sessionId)}/sync-stripe`, {
        method: "POST",
        mutate: true
      });
      await Promise.all([loadPaymentLogs(), loadLicenses(), loadAuditLogs()]);
      setToast("Checkout sincronizado com a Stripe.");
    });
  }

  async function handleSyncPaymentLicense(licenseId) {
    if (!licenseId) return;
    await runBusyAction(`sync-license-${licenseId}`, async () => {
      await apiRequest(`/panel-api/licenses/${licenseId}/sync-stripe`, {
        method: "POST",
        mutate: true
      });
      await Promise.all([loadPaymentLogs(), loadLicenses(), loadAuditLogs()]);
      setToast("Licenca sincronizada com a Stripe.");
    });
  }

  React.useEffect(() => {
    let mounted = true;

    (async () => {
      const valid = await bootSession();
      if (mounted) setBooting(false);
      if (valid && mounted) {
        await Promise.all([loadLicenses(), loadAuditLogs(), loadUserActivityLogs()]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    if (auth && view === "settings") {
      loadBlockedIps();
      loadMerlinUpdate();
    }
    if (auth && view === "overrides") {
      loadOverrides();
    }
    if (auth && view === "premium") {
      loadPremiumGames();
    }
    if (auth && view === "polls") {
      loadPolls();
    }
    if (auth && view === "payments") {
      loadPaymentLogs();
    }
    if (auth && view === "public-signup") {
      loadPublicSignup();
    }
  }, [auth, view]);

  React.useEffect(() => {
    if (!overrideUploadProgress?.uploadId) return undefined;

    const handleBeforeUnload = () => {
      abortOverrideUploadSession(overrideUploadProgress, true);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handleBeforeUnload);
    };
  }, [overrideUploadProgress, csrfToken]);

  React.useEffect(() => {
    if (!merlinUpdateUploadProgress?.uploadId) return undefined;

    const handleBeforeUnload = () => {
      abortMerlinUpdateUploadSession(merlinUpdateUploadProgress, true);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handleBeforeUnload);
    };
  }, [merlinUpdateUploadProgress, csrfToken]);

  function closePanels() {
    setMenuOpen(false);
    setDetailOpen(false);
  }

  function openLicense(licenseId) {
    setSelectedId(licenseId);
    if (window.innerWidth <= 1100) setDetailOpen(true);
  }

  function openModal(type) {
    setMenuOpen(false);
    if (type === "create") setDetailOpen(false);

    if (selectedLicense) {
      setFormState((current) => ({
        ...current,
        editName: selectedLicense.name,
        editContact: getLicenseContact(selectedLicense),
        editContactType: getLicenseContactType(selectedLicense),
        editRecoveryPin: "",
        editExpiry: selectedLicense.expiresAt,
        editHwid: selectedLicense.hwid || "",
        renewExpiry: selectedLicense.expiresAt,
        revokeReason: type === "revoke" ? "" : current.revokeReason
      }));
    }

    setActiveModal(type);
  }

  function openOverrideCreateModal() {
    setMenuOpen(false);
    setFormState((current) => ({ ...current, ...createEmptyOverrideForm() }));
    setOverrideDeleteTarget("");
    setActiveModal("override-upsert");
  }

  function openOverrideEditModal(entry) {
    setMenuOpen(false);
    setFormState((current) => ({ ...current, ...createOverrideForm(entry) }));
    setOverrideDeleteTarget("");
    setActiveModal("override-upsert");
  }

  function openOverrideDeleteModal(appId) {
    setMenuOpen(false);
    setOverrideDeleteTarget(appId);
    setActiveModal("override-delete");
  }

  async function handleCancelOverrideUpload() {
    if (!overrideUploadProgress?.uploadId) return;
    await abortOverrideUploadSession(overrideUploadProgress);
    setOverrideUploadProgress(null);
    setBusyAction("");
    setToast("Upload cancelado.");
  }

  async function handleCancelMerlinUpdateUpload() {
    if (!merlinUpdateUploadProgress?.uploadId) return;
    await abortMerlinUpdateUploadSession(merlinUpdateUploadProgress);
    setMerlinUpdateUploadProgress(null);
    setBusyAction("");
    setToast("Upload da atualização cancelado.");
  }

  async function handleLogin(event) {
    event.preventDefault();
    setLoginState((current) => ({ ...current, error: "", submitting: true }));

    try {
      const payload = await apiRequest("/panel-api/auth/login", {
        method: "POST",
        body: { username: loginState.username, password: loginState.password, rememberMe: loginState.rememberMe },
        ignoreUnauthorized: true
      });

      setAuth(payload.admin);
      setCsrfToken(payload.csrfToken);
      setLoginState({ username: "", password: "", rememberMe: false, error: "", submitting: false });
      navigate("overview", true);
      await Promise.all([loadLicenses(), loadAuditLogs(), loadUserActivityLogs()]);
    } catch (error) {
      setLoginState((current) => ({
        ...current,
        submitting: false,
        error: error.message || "Usuário ou senha inválidos."
      }));
    }
  }

  async function handleLogout() {
    await runBusyAction("logout", async () => {
      try {
        await apiRequest("/panel-api/auth/logout", { method: "POST", mutate: true });
      } catch {
        // ignore logout failure
      }

      setAuth(null);
      setCsrfToken("");
      setLicenses([]);
      setAuditLogs([]);
      setUserActivityLogs([]);
      setBlockedIps([]);
      setOverrides([]);
      setMerlinUpdate(null);
      setSelectedId(null);
      setActiveModal(null);
      setDetailOpen(false);
      setMenuOpen(false);
      navigateToLogin({ replace: true, reload: true });
    });
  }

  async function handleCreateLicense(event) {
    event?.preventDefault();
    const { createName, createContact, createContactType, createRecoveryPin, createExpiry } = formState;
    const normalizedContact = normalizeContactInput(createContact, createContactType);
    const normalizedRecoveryPin = String(createRecoveryPin || "").trim();

    if (!isValidContact(normalizedContact, createContactType)) {
      setToast(contactValidationMessage(createContactType));
      return;
    }
    if (normalizedRecoveryPin && !isValidRecoverySecret(normalizedRecoveryPin)) {
      setToast(RECOVERY_SECRET_MESSAGE);
      return;
    }

    await runBusyAction("create-license", async () => {
      try {
        const created = await apiRequest("/panel-api/licenses", {
          method: "POST",
          mutate: true,
          body: {
            name: createName,
            contact: normalizedContact,
            contactType: createContactType,
            ...(normalizedRecoveryPin ? { recoveryPin: normalizedRecoveryPin } : {}),
            expiresAt: createExpiry
          }
        });

        setFormState((current) => ({ ...current, createName: "", createContact: "", createContactType: "phone", createRecoveryPin: "", createExpiry: "" }));
        setActiveModal(null);
        setSelectedId(created.id);
        await Promise.all([loadLicenses(), loadAuditLogs()]);
        navigate("licenses");
        setToast(createContactType === "email" ? "Licenca criada. E-mail de boas-vindas enviado em segundo plano." : "Licenca criada com sucesso.");
      } catch (error) {
        setToast(error.message);
      }
    });
  }

  async function handleUpdateLicense() {
    if (!selectedLicense) return;

    const normalizedContact = normalizeContactInput(formState.editContact, formState.editContactType);
    const normalizedRecoveryPin = String(formState.editRecoveryPin || "").trim();
    if (!isValidContact(normalizedContact, formState.editContactType)) {
      setToast(contactValidationMessage(formState.editContactType));
      return;
    }
    if (normalizedRecoveryPin && !isValidRecoverySecret(normalizedRecoveryPin)) {
      setToast(RECOVERY_SECRET_MESSAGE);
      return;
    }

    await runBusyAction("update-license", async () => {
      try {
        const updated = await apiRequest(`/panel-api/licenses/${selectedLicense.id}`, {
          method: "PUT",
          mutate: true,
          body: {
            name: formState.editName,
            contact: normalizedContact,
            contactType: formState.editContactType,
            ...(normalizedRecoveryPin ? { recoveryPin: normalizedRecoveryPin } : {}),
            expiresAt: formState.editExpiry,
            hwid: formState.editHwid || null
          }
        });

        setActiveModal(null);
        setFormState((current) => ({ ...current, editRecoveryPin: "" }));
        setSelectedId(updated.id);
        await Promise.all([loadLicenses(), loadAuditLogs()]);
        setToast("Licença atualizada com sucesso.");
      } catch (error) {
        setToast(error.message);
      }
    });
  }

  async function handleSendWelcomeEmail() {
    if (!selectedLicense) return;

    await runBusyAction("send-welcome-email", async () => {
      try {
        await apiRequest(`/panel-api/licenses/${selectedLicense.id}/send-welcome-email`, {
          method: "POST",
          mutate: true
        });
        await loadAuditLogs();
        setToast("E-mail de boas-vindas reenviado.");
      } catch (error) {
        setToast(error.message);
      }
    });
  }

  async function handleRenewLicense() {
    if (!selectedLicense) return;

    await runBusyAction("renew-license", async () => {
      try {
        const updated = await apiRequest(`/panel-api/licenses/${selectedLicense.id}/renew`, {
          method: "POST",
          mutate: true,
          body: { expiresAt: formState.renewExpiry }
        });

        setActiveModal(null);
        setSelectedId(updated.id);
        await Promise.all([loadLicenses(), loadAuditLogs()]);
        setToast("Licença renovada com sucesso.");
      } catch (error) {
        setToast(error.message);
      }
    });
  }

  async function handleResetHwid() {
    if (!selectedLicense) return;

    await runBusyAction("reset-hwid", async () => {
      try {
        const updated = await apiRequest(`/panel-api/licenses/${selectedLicense.id}/reset-hwid`, {
          method: "POST",
          mutate: true
        });

        setActiveModal(null);
        setSelectedId(updated.id);
        await Promise.all([loadLicenses(), loadAuditLogs()]);
        setToast("Dispositivo redefinido com sucesso.");
      } catch (error) {
        setToast(error.message);
      }
    });
  }

  async function handleRevokeLicense() {
    if (!selectedLicense) return;

    await runBusyAction("revoke-license", async () => {
      try {
        const updated = await apiRequest(`/panel-api/licenses/${selectedLicense.id}/revoke`, {
          method: "POST",
          mutate: true,
          body: { reason: formState.revokeReason }
        });

        setActiveModal(null);
        setSelectedId(updated.id);
        await Promise.all([loadLicenses(), loadAuditLogs()]);
        setToast("Licença revogada com sucesso.");
      } catch (error) {
        setToast(error.message);
      }
    });
  }

  async function handleReactivateLicense() {
    if (!selectedLicense) return;

    await runBusyAction("reactivate-license", async () => {
      try {
        const updated = await apiRequest(`/panel-api/licenses/${selectedLicense.id}/reactivate`, {
          method: "POST",
          mutate: true
        });

        setActiveModal(null);
        setSelectedId(updated.id);
        await Promise.all([loadLicenses(), loadAuditLogs()]);
        setToast("Licença reativada com sucesso.");
      } catch (error) {
        setToast(error.message);
      }
    });
  }

  async function handleSaveOverride() {
    await runBusyAction("save-override", async () => {
      try {
        const payload = buildOverridePayload(formState);
        await apiRequest("/panel-api/overrides", {
          method: "POST",
          mutate: true,
          body: payload
        });

        setActiveModal(null);
        setFormState((current) => ({ ...current, ...createEmptyOverrideForm() }));
        await loadOverrides();
        setToast("Override salvo com sucesso.");
      } catch (error) {
        setToast(error.message);
      }
    });
  }

  async function handleOverrideFileUpload(kind, file) {
    if (!file) return;

    const appId = String(formState.overrideAppId || "").trim();
    if (!/^\d+$/.test(appId)) {
      setToast("Informe um appId numérico válido antes de enviar o arquivo.");
      return;
    }

    const action = kind === "manifest" ? "upload-override-manifest" : "upload-override-fix";

    await runBusyAction(action, async () => {
      try {
        const uploaded = await uploadOverrideFileInChunks(appId, kind, file);

        setFormState((current) => {
          if (kind === "manifest") {
            return {
              ...current,
              overrideManifestEnabled: true,
              overrideManifestFile: uploaded.path || current.overrideManifestFile
            };
          }

          return {
            ...current,
            overrideFixEnabled: true,
            overrideFixFile: uploaded.path || current.overrideFixFile,
            overrideFilename: uploaded.filename || current.overrideFilename,
            overrideSize: uploaded.sizeLabel || current.overrideSize
          };
        });

        setToast(kind === "manifest" ? "Manifest enviado com sucesso." : "Fix enviado com sucesso.");
      } catch (error) {
        setToast(error.message);
      }
    });
  }

  function handleOverrideFileDownload(kind) {
    const appId = String(formState.overrideAppId || "").trim();
    if (!/^\d+$/.test(appId)) {
      setToast("Informe um appId numerico valido antes de baixar o arquivo.");
      return;
    }

    const hasFile = kind === "manifest"
      ? Boolean(String(formState.overrideManifestFile || "").trim())
      : Boolean(String(formState.overrideFixFile || "").trim());

    if (!hasFile) {
      setToast("Nenhum arquivo atual para baixar.");
      return;
    }

    const url = `/panel-api/overrides/download?appId=${encodeURIComponent(appId)}&kind=${encodeURIComponent(kind)}`;
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function handleDeleteOverride() {

    if (!overrideDeleteTarget) return;

    await runBusyAction("delete-override", async () => {
      try {
        await apiRequest(`/panel-api/overrides/${overrideDeleteTarget}`, {
          method: "DELETE",
          mutate: true
        });

        setActiveModal(null);
        setOverrideDeleteTarget("");
        await loadOverrides();
        setToast("Override removido com sucesso.");
      } catch (error) {
        setToast(error.message);
      }
    });
  }

  async function handleSavePremiumGame(mode, payload) {
    return runBusyAction("save-premium-game", async () => {
      const response = mode === "edit"
        ? await apiRequest(`/panel-api/premium/games/${payload.appId}`, {
            method: "PUT",
            mutate: true,
            body: {
              ...(payload.name !== undefined ? { name: payload.name } : {}),
              ...(payload.coverUrl !== undefined ? { coverUrl: payload.coverUrl } : {}),
              ...(payload.archiveKey !== undefined ? { archiveKey: payload.archiveKey } : {}),
              ...(payload.installSubpath !== undefined ? { installSubpath: payload.installSubpath } : {}),
              ...(payload.activationType !== undefined ? { activationType: payload.activationType } : {}),
              ...(payload.launchExecutablePath !== undefined ? { launchExecutablePath: payload.launchExecutablePath } : {}),
              activationLimit: payload.activationLimit,
              enabled: payload.enabled,
            }
          })
        : await apiRequest("/panel-api/premium/games", {
            method: "POST",
            mutate: true,
            body: payload
          });

      await loadPremiumGames();
      return response?.game || null;
    });
  }

  async function handleDeletePremiumGame(appId) {
    return runBusyAction("delete-premium-game", async () => {
      await apiRequest(`/panel-api/premium/games/${appId}`, {
        method: "DELETE",
        mutate: true
      });

      await loadPremiumGames();
    });
  }

  async function handlePremiumArchiveUpload(appId, file) {
    return runBusyAction("upload-premium-game-archive", async () => {
      const formData = new FormData();
      formData.append("appId", appId);
      formData.append("file", file);

      return apiUpload("/panel-api/premium/games/upload", formData, {
        method: "POST",
        mutate: true
      });
    });
  }

  async function handleSavePoll(mode, pollId, payload) {
    return runBusyAction("save-poll", async () => {
      const response = mode === "edit"
        ? await apiRequest(`/panel-api/polls/${pollId}`, {
            method: "PUT",
            mutate: true,
            body: payload
          })
        : await apiRequest("/panel-api/polls", {
            method: "POST",
            mutate: true,
            body: payload
          });

      await loadPolls();
      return response?.poll || null;
    });
  }

  async function handleSetPollStatus(pollId, status) {
    return runBusyAction("poll-status", async () => {
      const action = status === "open" ? "open" : "close";
      const response = await apiRequest(`/panel-api/polls/${pollId}/${action}`, {
        method: "POST",
        mutate: true
      });

      await loadPolls();
      return response?.poll || null;
    });
  }

  async function handleDeletePoll(pollId) {
    return runBusyAction("delete-poll", async () => {
      await apiRequest(`/panel-api/polls/${pollId}`, {
        method: "DELETE",
        mutate: true
      });

      await loadPolls();
    });
  }

  async function handlePublishMerlinUpdate() {
    const version = String(merlinUpdateDraft.version || "").trim();
    const file = merlinUpdateDraft.file;

    if (!/^\d+\.\d+\.\d+$/.test(version)) {
      setToast("Informe uma versao valida no formato x.y.z.");
      return;
    }

    if (!(file instanceof File)) {
      setToast("Selecione o instalador .exe do Merlin.");
      return;
    }

    await runBusyAction("publish-merlin-update", async () => {
      try {
        const payload = await uploadMerlinUpdateInChunks(version, file);
        setMerlinUpdate(payload.update || null);
        setMerlinUpdateDraft({ version: "", file: null });
        setToast("Atualizacao do Merlin publicada com sucesso.");
      } catch (error) {
        setToast(error.message);
      }
    });
  }

  async function copyLicenseKey() {
    if (!selectedLicense) return;
    try {
      await navigator.clipboard.writeText(selectedLicense.licenseKey);
      setToast("Chave copiada.");
    } catch {
      setToast("Não foi possível copiar a chave.");
    }
  }

  async function handleUnblockBlockedIp(blockedIpId) {
    await runBusyAction(`unblock-blocked-ip:${blockedIpId}`, async () => {
      try {
        await apiRequest(`/panel-api/security/blocked-ips/${blockedIpId}/unblock`, {
          method: "POST",
          mutate: true
        });
        await Promise.all([loadBlockedIps(), loadAuditLogs()]);
        setToast("IP desbloqueado com sucesso.");
      } catch (error) {
        setToast(error.message);
      }
    });
  }

  if (booting) {
    return <LoadingScreen />;
  }

  if (!auth) {
    return (
      <LoginScreen
        loginState={loginState}
        showPassword={showPassword}
        setShowPassword={setShowPassword}
        setLoginState={setLoginState}
        handleLogin={handleLogin}
      />
    );
  }

  return (
    <>
      <AppShell
        auth={auth}
        view={view}
        navigate={navigate}
        menuOpen={menuOpen}
        detailOpen={detailOpen}
        setMenuOpen={setMenuOpen}
        closePanels={closePanels}
        selectedLicense={selectedLicense}
        copyLicenseKey={copyLicenseKey}
        openModal={openModal}
        onSendWelcomeEmail={handleSendWelcomeEmail}
        setDetailOpen={setDetailOpen}
        handleLogout={handleLogout}
        loggingOut={busyAction === "logout"}
      >
        {view === "overview" && (
          <OverviewPage
            licenses={licenses}
            auditLogs={auditLogs}
            navigate={navigate}
            openModal={openModal}
            loadLicenses={loadLicenses}
            loadAuditLogs={loadAuditLogs}
            refreshingOverview={loadingLicenses || loadingAuditLogs}
          />
        )}
        {view === "licenses" && (
          <LicensesPage
            search={search}
            setSearch={setSearch}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            sourceFilter={sourceFilter}
            setSourceFilter={setSourceFilter}
            billingFilter={billingFilter}
            setBillingFilter={setBillingFilter}
            deviceFilter={deviceFilter}
            setDeviceFilter={setDeviceFilter}
            loadingLicenses={loadingLicenses}
            filteredLicenses={filteredLicenses}
            pagedLicenses={pagedLicenses}
            selectedId={selectedId}
            openLicense={openLicense}
            safePage={safePage}
            totalPages={totalPages}
            page={page}
            setPage={setPage}
            selectedLicense={selectedLicense}
            copyLicenseKey={copyLicenseKey}
            openModal={openModal}
            onSendWelcomeEmail={handleSendWelcomeEmail}
          />
        )}
        {view === "overrides" && (
          <OverridesPage
            overrides={overrides}
            loadingOverrides={loadingOverrides}
            overrideSearch={overrideSearch}
            setOverrideSearch={setOverrideSearch}
            loadOverrides={loadOverrides}
            openOverrideCreateModal={openOverrideCreateModal}
            openOverrideEditModal={openOverrideEditModal}
            openOverrideDeleteModal={openOverrideDeleteModal}
          />
        )}
        {view === "premium" && (
          <PremiumPage
            premiumGames={premiumGames}
            loadingPremiumGames={loadingPremiumGames}
            premiumSearch={premiumSearch}
            setPremiumSearch={setPremiumSearch}
            loadPremiumGames={loadPremiumGames}
            savePremiumGame={handleSavePremiumGame}
            deletePremiumGame={handleDeletePremiumGame}
            uploadPremiumArchive={handlePremiumArchiveUpload}
            busyAction={busyAction}
            notify={setToast}
          />
        )}
        {view === "polls" && (
          <PollsPage
            polls={polls}
            loadingPolls={loadingPolls}
            pollSearch={pollSearch}
            setPollSearch={setPollSearch}
            loadPolls={loadPolls}
            loadPollResults={loadPollResults}
            savePoll={handleSavePoll}
            setPollStatus={handleSetPollStatus}
            deletePoll={handleDeletePoll}
            busyAction={busyAction}
            notify={setToast}
          />
        )}
        {view === "payments" && (
          <PaymentsPage
            paymentSearch={paymentSearch}
            setPaymentSearch={setPaymentSearch}
            paymentLogs={paymentLogs}
            paymentEvents={paymentEvents}
            filteredPaymentLogs={filteredPaymentLogs}
            loadingPaymentLogs={loadingPaymentLogs}
            loadPaymentLogs={loadPaymentLogs}
            onSyncCheckout={handleSyncPaymentCheckout}
            onSyncLicense={handleSyncPaymentLicense}
            busyAction={busyAction}
          />
        )}
        {view === "activity" && (
          <ActivityPage
            activitySearch={activitySearch}
            setActivitySearch={setActivitySearch}
            activityActionFilter={activityActionFilter}
            setActivityActionFilter={setActivityActionFilter}
            activityStatusFilter={activityStatusFilter}
            setActivityStatusFilter={setActivityStatusFilter}
            loadingUserActivityLogs={loadingUserActivityLogs}
            filteredUserActivityLogs={filteredUserActivityLogs}
            loadUserActivityLogs={loadUserActivityLogs}
          />
        )}
        {view === "audit" && (
          <AuditPage
            auditSearch={auditSearch}
            setAuditSearch={setAuditSearch}
            auditActionFilter={auditActionFilter}
            setAuditActionFilter={setAuditActionFilter}
            auditAdminFilter={auditAdminFilter}
            setAuditAdminFilter={setAuditAdminFilter}
            auditAdminOptions={auditAdminOptions}
            auditLogs={auditLogs}
            loadingAuditLogs={loadingAuditLogs}
            filteredAuditLogs={filteredAuditLogs}
            loadAuditLogs={loadAuditLogs}
          />
        )}
        {view === "settings" && (
          <SettingsPage
            loadingBlockedIps={loadingBlockedIps}
            blockedIps={blockedIps}
            loadBlockedIps={loadBlockedIps}
            handleUnblockBlockedIp={handleUnblockBlockedIp}
            busyAction={busyAction}
            merlinUpdate={merlinUpdate}
            merlinUpdateDraft={merlinUpdateDraft}
            setMerlinUpdateDraft={setMerlinUpdateDraft}
            loadingMerlinUpdate={loadingMerlinUpdate}
            loadMerlinUpdate={loadMerlinUpdate}
            handlePublishMerlinUpdate={handlePublishMerlinUpdate}
            merlinUpdateUploadProgress={merlinUpdateUploadProgress}
            handleCancelMerlinUpdateUpload={handleCancelMerlinUpdateUpload}
          />
        )}
        {view === "public-signup" && (
          <PublicSignupPage
            publicSignup={publicSignup}
            onSave={handleSavePublicSignupSettings}
            saving={busyAction === "save-public-signup"}
            onRefresh={loadPublicSignup}
          />
        )}
      </AppShell>

      <LicenseModals
        activeModal={activeModal}
        setActiveModal={setActiveModal}
        formState={formState}
        setFormState={setFormState}
        selectedLicense={selectedLicense}
        handleCreateLicense={handleCreateLicense}
        handleUpdateLicense={handleUpdateLicense}
        handleRenewLicense={handleRenewLicense}
        handleReactivateLicense={handleReactivateLicense}
        handleResetHwid={handleResetHwid}
        handleRevokeLicense={handleRevokeLicense}
        handleSaveOverride={handleSaveOverride}
        handleOverrideFileUpload={handleOverrideFileUpload}
        handleOverrideFileDownload={handleOverrideFileDownload}
        handleDeleteOverride={handleDeleteOverride}
        handleCancelOverrideUpload={handleCancelOverrideUpload}
        overrideDeleteTarget={overrideDeleteTarget}
        busyAction={busyAction}
        overrideUploadProgress={overrideUploadProgress}
      />

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

export default App;
