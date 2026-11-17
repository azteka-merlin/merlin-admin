// Limits include JSON framing and nested bundle members; each request stays below
// the API's 256 KiB / 500-entry ceilings, including multibyte filenames.
const MAX_BATCH_BYTES = 240 * 1024;
const MAX_BATCH_ENTRIES = 400;
const encoder = new TextEncoder();
const bytes = value => encoder.encode(JSON.stringify(value)).byteLength;

function* fragments(entry) {
  if (entry.kind !== "bundle") { yield entry; return; }
  const { files, ...base } = entry;
  if (!Array.isArray(files) || !files.length) throw new Error("Pacote sem arquivos para finalizar.");
  const groups = [];
  let group = [];
  let count = 0;
  // Conservative framing covers fragment indexes and the request envelope.
  const overhead = bytes({ ...base, files: [], fragmentIndex: 999999, fragmentCount: 999999 }) + 256;
  let size = overhead;
  for (const member of files) {
    const memberBytes = bytes(member) + 1;
    if (memberBytes + overhead > MAX_BATCH_BYTES) throw new Error("Metadados de arquivo acima do limite permitido.");
    if (group.length && (count >= MAX_BATCH_ENTRIES - 1 || size + memberBytes > MAX_BATCH_BYTES)) {
      groups.push(group); group = []; count = 0; size = overhead;
    }
    group.push(member); count++; size += memberBytes;
  }
  if (group.length) groups.push(group);
  for (let index = 0; index < groups.length; index++) {
    yield { ...base, files: groups[index], fragmentIndex: index, fragmentCount: groups.length };
  }
}

export function* folderMetadataBatches(units, checkpoints, manifestId) {
  let entries = [];
  let entryCount = 0;
  let size = bytes({ manifestId, entries: [] }) + 16;
  for (const unit of units) {
    const saved = checkpoints[unit.id];
    if (!saved?.result || !saved.metadata) throw new Error("Ainda existem arquivos sem confirmação de envio.");
    const entry = { ...saved.metadata, key: saved.result.key, clientId: unit.id };
    for (const part of fragments(entry)) {
      const partCount = 1 + (part.files?.length || 0);
      const partBytes = bytes(part) + 1;
      if (partCount > MAX_BATCH_ENTRIES || size + partBytes > MAX_BATCH_BYTES && !entries.length) {
        throw new Error("Metadados do pacote acima do limite permitido.");
      }
      if (entries.length && (entryCount + partCount > MAX_BATCH_ENTRIES || size + partBytes > MAX_BATCH_BYTES)) {
        yield entries;
        entries = []; entryCount = 0; size = bytes({ manifestId, entries: [] }) + 16;
      }
      entries.push(part); entryCount += partCount; size += partBytes;
    }
  }
  if (entries.length) yield entries;
}
