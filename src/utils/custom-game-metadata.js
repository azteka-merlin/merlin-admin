export function customGameMetadata(draft) {
  const origin = draft.origin === "port" ? "port" : "native";
  const protectedPaths = [];
  const paths = Array.isArray(draft.protectedPaths) ? draft.protectedPaths : String(draft.protectedPaths || "").split(/\r?\n/);
  for (const raw of paths) {
    const path = String(raw || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    if (!path) continue;
    // For ports, the presence of game/ in the new package controls replacement.
    if (origin === "port" && path.toLocaleLowerCase("en-US") === "game") continue;
    const segments = path.split("/");
    if (path.length > 500 || path.startsWith("/") || segments.length > 32 || /[\x00-\x1f:*?"<>|]/.test(path) ||
      segments.some(part => !part || part === "." || part === ".." || /[. ]$/.test(part) ||
        /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part) || part.toLowerCase() === ".merlin-install.json")) {
      throw new Error("Os caminhos preservados devem ser relativos à instalação, como game ou user/saves, sem .. ou curingas.");
    }
    if (!protectedPaths.some(existing => existing.toLocaleLowerCase("en-US") === path.toLocaleLowerCase("en-US"))) protectedPaths.push(path);
  }
  if (protectedPaths.length > 64) throw new Error("Informe até 64 caminhos preservados.");
  return { origin, protectedPaths };
}

export function appendCustomGameMetadata(body, metadata) {
  for (const [name, value] of Object.entries(metadata)) body.set(name, Array.isArray(value) ? JSON.stringify(value) : value);
}
