// Timings come from workers, rather than inferring file preparation from bytes
// already sent. Separate small-file samples avoid predicting thousands of opens
// using the time it took to prepare a single large entry.
export function createFolderUploadProgress(units, now = () => performance.now()) {
  const startedAt = now();
  const total = units.reduce((sum, unit) => sum + unit.bytes, 0);
  const count = units.reduce((sum, unit) => sum + unit.entries.length, 0);
  const sent = new Map();
  const prepared = new Map();
  const unitStats = new Map(units.filter(unit => unit.kind === "bundle").map(unit => {
    let smallFiles = 0; let smallBytes = 0; let largeFiles = 0; let largeBytes = 0;
    for (const entry of unit.entries) {
      if (entry.file.size < 1024 ** 2) { smallFiles++; smallBytes += entry.file.size; }
      else { largeFiles++; largeBytes += entry.file.size; }
    }
    return [unit.id, { smallFiles, smallBytes, largeFiles, largeBytes }];
  }));
  const completed = new Set();
  const preparationSamples = [];
  const networkSamples = [];
  let sentBytes = 0;
  let previousBytes = 0;
  let preparedFilesTotal = 0;
  let doneFiles = 0;
  let actualBytes = 0;
  let initialBytes = 0;
  let transport = "proxy";
  return {
    setTransport(value) { transport = value; },
    baseline(unit, bytes) {
      const value = Math.max(0, Math.min(unit.bytes, bytes));
      const difference = value - (sent.get(unit.id) || 0);
      sent.set(unit.id, value); initialBytes += difference; sentBytes += difference;
    },
    restore(unit) { sent.set(unit.id, unit.bytes); prepared.set(unit.id, { bytes: unit.bytes, files: unit.entries.length }); completed.add(unit.id); doneFiles += unit.entries.length; preparedFilesTotal += unit.entries.length; initialBytes += unit.bytes; sentBytes += unit.bytes; },
    sent(unit, bytes) {
      const value = Math.max(0, Math.min(unit.bytes, bytes));
      sentBytes += value - (sent.get(unit.id) || 0);
      sent.set(unit.id, value);
    },
    prepared(unit, bytes, files) {
      const previous = prepared.get(unit.id);
      preparedFilesTotal += files - (previous?.files || 0);
      prepared.set(unit.id, { bytes, files });
    },
    timing(unit, timing) {
      if (Number.isFinite(timing?.durationMs) && timing.durationMs > 0) preparationSamples.push({ unit, timing });
    },
    complete(unit) {
      if (!completed.has(unit.id)) doneFiles += unit.entries.length;
      completed.add(unit.id);
      this.sent(unit, unit.bytes);
      this.prepared(unit, unit.bytes, unit.entries.length);
    },
    snapshot(extra = {}) {
      const time = now();
      const bytes = sentBytes;
      actualBytes += Math.max(0, bytes - previousBytes);
      previousBytes = bytes;
      networkSamples.push({ time, bytes: actualBytes });
      while (networkSamples.length > 2 && networkSamples[1].time < time - 30000) networkSamples.shift();
      const elapsed = (time - startedAt) / 1000;
      const recent = networkSamples[0];
      const windowSeconds = (time - recent.time) / 1000;
      const speed = windowSeconds >= 2 ? Math.max(0, actualBytes - recent.bytes) / windowSeconds : 0;
      const preparedFiles = preparedFilesTotal;
      const done = doneFiles;
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
      const remaining = [{ files: 0, bytes: 0 }, { files: 0, bytes: 0 }];
      for (const unit of units) {
        const stats = unitStats.get(unit.id);
        if (!stats || completed.has(unit.id)) continue;
        const preparedCount = prepared.get(unit.id)?.files || 0;
        const largeRemaining = Math.max(0, stats.largeFiles - preparedCount);
        const smallRemaining = Math.max(0, stats.smallFiles - Math.max(0, preparedCount - stats.largeFiles));
        remaining[1].files += largeRemaining;
        remaining[1].bytes += stats.largeFiles ? stats.largeBytes * largeRemaining / stats.largeFiles : 0;
        remaining[0].files += smallRemaining;
        remaining[0].bytes += stats.smallFiles ? stats.smallBytes * smallRemaining / stats.smallFiles : 0;
      }
      for (const [index, category] of categories.entries()) {
        const pending = remaining[index];
        if (!pending.files) continue;
        if (!category.files || !category.duration) { calibrated = false; continue; }
        const fileEstimate = pending.files * category.duration / category.files;
        const byteEstimate = category.bytes ? pending.bytes * category.duration / category.bytes : 0;
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
