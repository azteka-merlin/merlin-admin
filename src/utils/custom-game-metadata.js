function optionalHttpsUrl(value, label) {
  const text = String(value || "").trim();
  if (!text) return "";
  let url;
  try { url = new URL(text); } catch { throw new Error(`Informe um link HTTPS válido para ${label}.`); }
  if (url.protocol !== "https:" || url.username || url.password) throw new Error(`Informe um link HTTPS válido para ${label}.`);
  return url;
}

export function customGameMetadata(draft) {
  const origin = draft.origin === "port" ? "port" : "native";
  const port = origin === "port";
  const repository = port ? optionalHttpsUrl(draft.repositoryUrl, "o repositório") : "";
  if (repository && (repository.hostname !== "github.com" || repository.port ||
    !/^\/[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}\/?$/.test(repository.pathname) || repository.search || repository.hash)) {
    throw new Error("Informe o repositório no formato https://github.com/autor/projeto.");
  }
  const discord = port ? optionalHttpsUrl(draft.discordUrl, "o Discord") : "";
  if (discord && (discord.port || discord.search || discord.hash ||
    !((discord.hostname === "discord.gg" && /^\/[A-Za-z0-9_-]+\/?$/.test(discord.pathname)) ||
      (["discord.com", "www.discord.com"].includes(discord.hostname) && /^\/invite\/[A-Za-z0-9_-]+\/?$/.test(discord.pathname))))) {
    throw new Error("Use um convite HTTPS do Discord, como https://discord.gg/convite.");
  }
  const protectedPaths = [];
  const paths = Array.isArray(draft.protectedPaths) ? draft.protectedPaths : String(draft.protectedPaths || "").split(/\r?\n/);
  for (const raw of paths) {
    const path = String(raw || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    if (!path) continue;
    // For ports, the presence of game/ in the new package controls replacement.
    if (port && path.toLocaleLowerCase("en-US") === "game") continue;
    const segments = path.split("/");
    if (path.length > 500 || path.startsWith("/") || segments.length > 32 || /[\x00-\x1f:*?"<>|]/.test(path) ||
      segments.some(part => !part || part === "." || part === ".." || /[. ]$/.test(part) ||
        /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part) || part.toLowerCase() === ".merlin-install.json")) {
      throw new Error("Os caminhos preservados devem ser relativos à instalação, como game ou user/saves, sem .. ou curingas.");
    }
    if (!protectedPaths.some(existing => existing.toLocaleLowerCase("en-US") === path.toLocaleLowerCase("en-US"))) protectedPaths.push(path);
  }
  if (protectedPaths.length > 64) throw new Error("Informe até 64 caminhos preservados.");
  return {
    origin,
    repositoryUrl: repository ? repository.href.replace(/\/$/, "").replace(/\.git$/, "") : "",
    discordUrl: discord ? discord.href : "",
    protectedPaths,
    versionLabel: String(draft.versionLabel || "").trim(),
    trackedReleaseTag: port ? String(draft.trackedReleaseTag || "").trim() : "",
  };
}

export function appendCustomGameMetadata(body, metadata) {
  for (const [name, value] of Object.entries(metadata)) body.set(name, Array.isArray(value) ? JSON.stringify(value) : value);
}
