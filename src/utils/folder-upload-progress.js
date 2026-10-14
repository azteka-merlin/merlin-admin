// Timings come from workers, rather than inferring file preparation from bytes
// already sent. Separate small-file samples avoid predicting thousands of opens
// using the time it took to prepare a single large entry.
export function createFolderUploadProgress(units, now = () => performance.now()) {
  const startedAt = now();
  const total = units.reduce((sum, unit) => sum + unit.bytes, 0);
  const count = units.reduce((sum, unit) => sum + unit.entries.length, 0);
  const sent = new Map();
  const prepared = new Map();
  const completed = new Set();
  const preparationSamples = [];
  const networkSamples = [];
  let lastBytes = 0;
  let actualBytes = 0;
  let initialBytes = 0;
  let transport = "proxy";
  return {
    setTransport(value) { transport = value; },
    baseline(unit, bytes) {
      const value = Math.max(0, Math.min(unit.bytes, bytes));
      const difference = value - (sent.get(unit.id) || 0);
      sent.set(unit.id, value); initialBytes += difference; lastBytes += difference;
    },
    restore(unit) { sent.set(unit.id, unit.bytes); prepared.set(unit.id, { bytes: unit.bytes, files: unit.entries.length }); completed.add(unit.id); initialBytes += unit.bytes; lastBytes += unit.bytes; },
    sent(unit, bytes) { sent.set(unit.id, Math.max(0, Math.min(unit.bytes, bytes))); },
    prepared(unit, bytes, files) { prepared.set(unit.id, { bytes, files }); },
    timing(unit, timing) {
      if (Number.isFinite(timing?.durationMs) && timing.durationMs > 0) preparationSamples.push({ unit, timing });
    },
    complete(unit) { completed.add(unit.id); sent.set(unit.id, unit.bytes); prepared.set(unit.id, { bytes: unit.bytes, files: unit.entries.length }); },
    snapshot(extra = {}) {
      const time = now();
      const bytes = [...sent.values()].reduce((sum, value) => sum + value, 0);
      actualBytes += Math.max(0, bytes - lastBytes);
      lastBytes = bytes;
      networkSamples.push({ time, bytes: actualBytes });
      while (networkSamples.length > 2 && networkSamples[1].time < time - 30000) networkSamples.shift();
      const elapsed = (time - startedAt) / 1000;
      const recent = networkSamples[0];
      const windowSeconds = (time - recent.time) / 1000;
      const speed = windowSeconds >= 2 ? Math.max(0, actualBytes - recent.bytes) / windowSeconds : 0;
      const preparedFiles = [...prepared.values()].reduce((sum, value) => sum + value.files, 0);
      const done = units.filter(unit => completed.has(unit.id)).reduce((sum, unit) => sum + unit.entries.length, 0);
      const pending = units.filter(unit => !completed.has(unit.id));
      const prepPending = pending.filter(unit => (prepared.get(unit.id)?.files || 0) < unit.entries.length && unit.kind === "bundle");
      // Estimate each category from measured per-file timings; fall back to no
      // ETA until this upload has sampled the kind of work that remains.
      const categories = [{ files: 0, bytes: 0, duration: 0 }, { files: 0, bytes: 0, duration: 0 }];
      for (const { timing } of preparationSamples) {
        for (const [index, prefix] of [[0, "small"], [1, "large"]]) {
          categories[index].files += timing[`${prefix}Files`] || 0;
          categories[index].bytes += timing[`${prefix}Bytes`] || 0;
          categories[index].duration += timing[`${prefix}DurationMs`] || 0;
        }
      }
      let prepSeconds = 0;
      let calibrated = true;
      for (const [index, category] of categories.entries()) {
        const entries = prepPending.flatMap(unit => unit.entries.slice(prepared.get(unit.id)?.files || 0)).filter(entry => (entry.file.size < 1024 ** 2 ? 0 : 1) === index);
        if (!entries.length) continue;
        if (!category.files || !category.duration) { calibrated = false; continue; }
        const remainingBytes = entries.reduce((sum, entry) => sum + entry.file.size, 0);
        const fileEstimate = entries.length * category.duration / category.files;
        const byteEstimate = category.bytes ? remainingBytes * category.duration / category.bytes : 0;
        prepSeconds += Math.max(fileEstimate, byteEstimate) / 1000 / 2;
      }
      const etaSeconds = elapsed >= 15 && calibrated && speed > 0 ? Math.max((total - bytes) / speed, prepSeconds) : null;
      return { folder: true, label: "Preparando e enviando arquivos", bytes, total, done, count, preparedFiles,
        speed, averageSpeed: Math.max(0, bytes - initialBytes) / Math.max(1, elapsed), elapsedSeconds: elapsed,
        etaSeconds, etaHint: etaSeconds == null ? "Medindo leitura, preparação e envio…" : null,
        confirmedObjects: completed.size, totalObjects: units.length, transport, ...extra };
    },
  };
}
