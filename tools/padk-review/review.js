(function (root) {
  'use strict';

  const HEAD = ['schemaVersion', 'category', 'status', 'baseSha256', 'entries'];
  const ROW = ['number', 'rank', 'workingSummary', 'criteriaPage'];
  const SHA = /^[0-9a-f]{64}$/;
  const CONTROL = /[\u0000-\u001f\u007f]/;
  const PLACEHOLDER = /\b(?:TODO|TBD|DUMMY|SYNTHETIC|SINTETIS|PLACEHOLDER|CONTOH SAJA)\b/i;

  function exact(value, keys) {
    return value !== null && typeof value === 'object' && !Array.isArray(value) &&
      Object.keys(value).length === keys.length &&
      keys.every(function (key) { return Object.hasOwn(value, key); });
  }
  function fail(message) {
    throw new TypeError('Batch tidak valid: ' + message);
  }
  function allowedNumber(category, number) {
    return Number.isSafeInteger(number) && number >= 1 &&
      number <= (category === 1 ? 80 : 60);
  }
  function validSummary(value) {
    return typeof value === 'string' && value.length >= 15 &&
      value.length <= 3000 && value.trim() === value &&
      !CONTROL.test(value) && !PLACEHOLDER.test(value);
  }
  function validPage(page) {
    return Number.isSafeInteger(page) && page >= 38 && page <= 80;
  }
  function checkTemplate(input) {
    if (!exact(input, HEAD) || input.schemaVersion !== 1 ||
      (input.category !== 1 && input.category !== 2) ||
      input.status !== 'SOURCE_REVIEW_PENDING' ||
      typeof input.baseSha256 !== 'string' || !SHA.test(input.baseSha256) ||
      !Array.isArray(input.entries) || input.entries.length < 1 ||
      input.entries.length > 400) {
      fail('header atau jumlah kriteria tidak sesuai template CLI.');
    }
    const found = new Set();
    for (const entry of input.entries) {
      if (!exact(entry, ROW) ||
        !allowedNumber(input.category, entry.number) ||
        !Number.isSafeInteger(entry.rank) || entry.rank < 1 || entry.rank > 5 ||
        typeof entry.workingSummary !== 'string' ||
        entry.workingSummary.length > 3000 ||
        (entry.criteriaPage !== null && !validPage(entry.criteriaPage))) {
        fail('format nomor, peringkat, isi, atau halaman salah.');
      }
      const key = entry.number + ':' + entry.rank;
      if (found.has(key)) fail('kriteria duplikat: ' + key);
      found.add(key);
    }
    return structuredClone(input);
  }
  function progress(input) {
    const complete = input.entries.filter(function (entry) {
      return validSummary(entry.workingSummary) && validPage(entry.criteriaPage);
    }).length;
    return { complete: complete, total: input.entries.length };
  }
  function exportBatch(input) {
    const clean = checkTemplate(input);
    const byIndicator = new Map();
    for (const entry of clean.entries) {
      if (!validSummary(entry.workingSummary) || !validPage(entry.criteriaPage)) {
        fail('lengkapi teks (15–3000 karakter) dan halaman tercetak (38–80) seluruh slot.');
      }
      const summaries = byIndicator.get(entry.number) || new Set();
      const normalized = entry.workingSummary.toLocaleLowerCase('id-ID');
      if (summaries.has(normalized)) fail('teks peringkat duplikat pada indikator ' + entry.number);
      summaries.add(normalized);
      byIndicator.set(entry.number, summaries);
    }
    return clean;
  }
  root.NusaRiksaPadkReview = Object.freeze({
    checkTemplate: checkTemplate, exportBatch: exportBatch,
    progress: progress, validSummary: validSummary, validPage: validPage,
  });
})(typeof window === 'undefined' ? globalThis : window);
