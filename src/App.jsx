import React, { useEffect, useMemo, useState } from "react";
import AppShell from "./components/AppShell";
import LicenseModals from "./components/LicenseModals";
import LoadingScreen from "./components/LoadingScreen";
import LoginScreen from "./components/LoginScreen";
import ActivityPage from "./pages/ActivityPage";
import AuditPage from "./pages/AuditPage";
import LicensesPage from "./pages/LicensesPage";
import OverviewPage from "./pages/OverviewPage";
import OverridesPage from "./pages/OverridesPage";
import SettingsPage from "./pages/SettingsPage";
import { PAGE_SIZE, VIEW_PATHS, getViewFromPath } from "./lib/navigation";
import { formatBrazilPhone, formatBrazilPhoneInput, getStatus, normalizeBrazilPhone } from "./lib/admin-ui";

function createEmptyOverrideForm() {
  return {
    overrideMode: "create",
    overrideAppId: "",
    overrideName: "",
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
    overrideManifestEnabled: Boolean(entry.manifestOverride),
    overrideManifestFile: entry.manifestOverride?.file || "",
    overrideFixEnabled: Boolean(entry.fixOverride),
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
    ...(formState.overrideAdminNote.trim() ? { adminNote: formState.overrideAdminNote.trim() } : {})
  };

  if (formState.overrideManifestEnabled) {
    const file = formState.overrideManifestFile.trim();
    if (!file) throw new Error("Informe o caminho do manifest override.");
    payload.manifestOverride = { enabled: true, file };
  }

  if (formState.overrideFixEnabled) {
    const file = formState.overrideFixFile.trim();
    if (!file) throw new Error("Informe o caminho do fix override.");

    payload.fixOverride = {
      enabled: true,
      file,
      ...(formState.overrideFilename.trim() ? { filename: formState.overrideFilename.trim() } : {}),
      ...(formState.overrideSize.trim() ? { size: formState.overrideSize.trim() } : {})
    };
  }

  if (!payload.manifestOverride && !payload.fixOverride && !payload.adminNote) {
    throw new Error("Adicione ao menos uma nota ou ative um override antes de salvar.");
  }

  return payload;
}

function App() {
  const OVERRIDE_UPLOAD_TIMEOUT_MS = 45000;
  const OVERRIDE_UPLOAD_MAX_RETRIES = 2;
  const MERLIN_UPDATE_UPLOAD_TIMEOUT_MS = 60000;
  const MERLIN_UPDATE_UPLOAD_MAX_RETRIES = 2;
  const [booting, setBooting] = useState(true);
  const [auth, setAuth] = useState(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [view, setView] = useState(getViewFromPath(window.location.pathname));
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [licenses, setLicenses] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [userActivityLogs, setUserActivityLogs] = useState([]);
  const [blockedIps, setBlockedIps] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [merlinUpdate, setMerlinUpdate] = useState(null);
  const [loadingLicenses, setLoadingLicenses] = useState(false);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);
  const [loadingUserActivityLogs, setLoadingUserActivityLogs] = useState(false);
  const [loadingBlockedIps, setLoadingBlockedIps] = useState(false);
  const [loadingOverrides, setLoadingOverrides] = useState(false);
  const [loadingMerlinUpdate, setLoadingMerlinUpdate] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deviceFilter, setDeviceFilter] = useState("all");
  const [auditSearch, setAuditSearch] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState("all");
  const [auditAdminFilter, setAuditAdminFilter] = useState("all");
  const [activitySearch, setActivitySearch] = useState("");
  const [activityActionFilter, setActivityActionFilter] = useState("all");
  const [activityStatusFilter, setActivityStatusFilter] = useState("all");
  const [overrideSearch, setOverrideSearch] = useState("");
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState("");
  const [overrideUploadProgress, setOverrideUploadProgress] = useState(null);
  const [merlinUpdateUploadProgress, setMerlinUpdateUploadProgress] = useState(null);
  const [activeModal, setActiveModal] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [overrideDeleteTarget, setOverrideDeleteTarget] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [loginState, setLoginState] = useState({ username: "", password: "", rememberMe: false, error: "", submitting: false });
  const [formState, setFormState] = useState({
    createName: "",
    createPhone: "",
    createExpiry: "",
    editName: "",
    editPhone: "",
    editExpiry: "",
    editHwid: "",
    renewExpiry: "",
    revokeReason: "",
    ...createEmptyOverrideForm()
  });
  const [merlinUpdateDraft, setMerlinUpdateDraft] = useState({
    version: "",
    file: null
  });

  const selectedLicense = useMemo(() => licenses.find((item) => item.id === selectedId) ?? null, [licenses, selectedId]);

  const filteredLicenses = useMemo(() => {
    const query = search.trim().toLowerCase();
    const phoneQuery = normalizeBrazilPhone(search);
    return licenses.filter((license) => {
      const status = getStatus(license);
      const normalizedPhone = normalizeBrazilPhone(license.phone);
      const matchesSearch =
        !query ||
        license.name.toLowerCase().includes(query) ||
        (phoneQuery && normalizedPhone.includes(phoneQuery)) ||
        formatBrazilPhone(license.phone).toLowerCase().includes(query) ||
        license.licenseKey.toLowerCase().includes(query) ||
        String(license.id).includes(query) ||
        (license.hwid || "").toLowerCase().includes(query);

      const matchesStatus = statusFilter === "all" || status.key === statusFilter;
      const hasDevice = Boolean(license.hwid);
      const matchesDevice =
        deviceFilter === "all" ||
        (deviceFilter === "with" && hasDevice) ||
        (deviceFilter === "without" && !hasDevice);

      return matchesSearch && matchesStatus && matchesDevice;
    });
  }, [deviceFilter, licenses, search, statusFilter]);

  const auditAdminOptions = useMemo(
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

  const filteredAuditLogs = useMemo(() => {
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

  const filteredUserActivityLogs = useMemo(() => {
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

  const totalPages = Math.max(1, Math.ceil(filteredLicenses.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedLicenses = filteredLicenses.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
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

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!menuOpen && !detailOpen && !activeModal) {
      document.body.classList.remove("is-locked");
      return;
    }

    document.body.classList.add("is-locked");
    return () => document.body.classList.remove("is-locked");
  }, [menuOpen, detailOpen, activeModal]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, deviceFilter]);

  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
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
          : "Nao foi possivel enviar o arquivo agora."
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
          throw lastError || new Error("Nao foi possivel enviar o arquivo.");
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
          throw lastError || new Error("Nao foi possivel enviar a atualizacao do Merlin.");
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

  async function runBusyAction(actionKey, callback) {
    if (busyAction) return undefined;
    setBusyAction(actionKey);
    try {
      return await callback();
    } finally {
      setBusyAction("");
    }
  }

  useEffect(() => {
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

  useEffect(() => {
    if (auth && view === "settings") {
      loadBlockedIps();
      loadMerlinUpdate();
    }
    if (auth && view === "overrides") {
      loadOverrides();
    }
  }, [auth, view]);

  useEffect(() => {
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

  useEffect(() => {
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
        editPhone: formatBrazilPhoneInput(selectedLicense.phone),
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
    setToast("Upload da atualizacao cancelado.");
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
    const { createName, createPhone, createExpiry } = formState;
    const normalizedPhone = normalizeBrazilPhone(createPhone);

    if (normalizedPhone.length !== 11) {
      setToast("Informe um celular brasileiro valido com DDD.");
      return;
    }

    await runBusyAction("create-license", async () => {
      try {
        const created = await apiRequest("/panel-api/licenses", {
          method: "POST",
          mutate: true,
          body: { name: createName, phone: normalizedPhone, expiresAt: createExpiry }
        });

        setFormState((current) => ({ ...current, createName: "", createPhone: "", createExpiry: "" }));
        setActiveModal(null);
        setSelectedId(created.id);
        await Promise.all([loadLicenses(), loadAuditLogs()]);
        navigate("licenses");
        setToast("Licença criada com sucesso.");
      } catch (error) {
        setToast(error.message);
      }
    });
  }

  async function handleUpdateLicense() {
    if (!selectedLicense) return;

    const normalizedPhone = normalizeBrazilPhone(formState.editPhone);
    if (normalizedPhone.length !== 11) {
      setToast("Informe um celular brasileiro valido com DDD.");
      return;
    }

    await runBusyAction("update-license", async () => {
      try {
        const updated = await apiRequest(`/panel-api/licenses/${selectedLicense.id}`, {
          method: "PUT",
          mutate: true,
          body: {
            name: formState.editName,
            phone: normalizedPhone,
            expiresAt: formState.editExpiry,
            hwid: formState.editHwid || null
          }
        });

        setActiveModal(null);
        setSelectedId(updated.id);
        await Promise.all([loadLicenses(), loadAuditLogs()]);
        setToast("Licença atualizada com sucesso.");
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
