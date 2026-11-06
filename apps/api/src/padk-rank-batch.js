import { createHash } from 'node:crypto';
import { inspectPadkTranscriptionDraft } from './padk-transcription-workbench.js';

const FIELDS = ['number', 'rank', 'workingSummary', 'criteriaPage'];
const BATCH_FIELDS = ['schemaVersion', 'category', 'status', 'baseSha256', 'entries'];
const DIGEST = /^[0-9a-f]{64}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const PLACEHOLDER = /\b(?:TODO|TBD|DUMMY|SYNTHETIC|SINTETIS|PLACEHOLDER|CONTOH SAJA)\b/i;

function fail(message) {
  throw new TypeError('Batch kriteria PADK tidak valid: ' + message);
}
function exact(value, keys) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key));
}
function validText(value) {
  return typeof value === 'string'
    && value.length >= 15 && value.length <= 3000
    && value === value.trim() && !CONTROL.test(value)
    && !PLACEHOLDER.test(value);
}
export function padkDraftSha256(draft) {
  inspectPadkTranscriptionDraft(draft);
  return createHash('sha256').update(JSON.stringify(draft)).digest('hex');
}

export function preparePadkRankBatch(draft, { from = 1, to = draft.items.length } = {}) {
  const inspected = inspectPadkTranscriptionDraft(draft);
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to)
    || from < 1 || to < from || to > inspected.expectedIndicators) {
    fail('rentang nomor indikator di luar kategori');
  }
  const byNumber = new Map(inspected.items.map(item => [item.number, item]));
  const entries = [];
  for (let number = from; number <= to; number++) {
    const item = byNumber.get(number);
    if (!item) fail('nomor indikator belum tercatat: ' + number);
    const filled = new Set(item.rankCriteria.map(row => row.rank));
    for (let rank = 1; rank <= 5; rank++) {
      if (!filled.has(rank)) {
        entries.push({
          number, rank,
          workingSummary: '',
          criteriaPage: null,
        });
      }
    }
  }
  return {
    schemaVersion: 1,
    category: draft.category,
    status: 'SOURCE_REVIEW_PENDING',
    baseSha256: padkDraftSha256(draft),
    entries,
  };
}

// This function only extends a DRAFT_UNVERIFIED record.
// It never promotes source verification or regulatory eligibility.
export function applyPadkRankBatch(draft, batch) {
  const inspected = inspectPadkTranscriptionDraft(draft);
  if (!exact(batch, BATCH_FIELDS)
    || batch.schemaVersion !== 1 || batch.category !== draft.category
    || batch.status !== 'SOURCE_REVIEW_PENDING'
    || typeof batch.baseSha256 !== 'string'
    || !DIGEST.test(batch.baseSha256)
    || !Array.isArray(batch.entries) || batch.entries.length < 1
    || batch.entries.length > 400) {
    fail('header, kategori, atau ukuran batch tidak sesuai');
  }
  if (batch.baseSha256 !== padkDraftSha256(draft)) {
    fail('hash baseline berubah; buat ulang template sebelum impor');
  }
  const seen = new Set();
  const items = new Map(inspected.items.map(item => [item.number, item]));
  const additions = new Map();
  for (const entry of batch.entries) {
    if (!exact(entry, FIELDS)
      || !Number.isSafeInteger(entry.number)
      || !Number.isSafeInteger(entry.rank)
      || entry.rank < 1 || entry.rank > 5
      || !Number.isSafeInteger(entry.criteriaPage)
      || entry.criteriaPage < 38 || entry.criteriaPage > 80
      || !validText(entry.workingSummary)) {
      fail('nomor, peringkat, teks, atau halaman kriteria tidak sah');
    }
    const key = entry.number + ':' + entry.rank;
    const item = items.get(entry.number);
    if (!item || seen.has(key)
      || item.rankCriteria.some(criterion => criterion.rank === entry.rank)) {
      fail('nomor tidak tercatat, rank duplikat, atau kriteria sudah terisi: ' + key);
    }
    seen.add(key);
    const existing = [...item.rankCriteria, ...(additions.get(entry.number) ?? [])];
    if (existing.some(criterion =>
      criterion.workingSummary.toLocaleLowerCase('id-ID') ===
        entry.workingSummary.toLocaleLowerCase('id-ID'))) {
      fail('kriteria lima peringkat untuk indikator yang sama tidak boleh identik');
    }
    additions.set(entry.number, [
      ...(additions.get(entry.number) ?? []),
      {rank:entry.rank,workingSummary:entry.workingSummary,criteriaPage:entry.criteriaPage},
    ]);
  }
  const updated = {
    ...draft,
    items: draft.items.map(item => ({
      ...item,
      rankCriteria: [
        ...item.rankCriteria,
        ...(additions.get(item.number) ?? []),
      ].sort((a,b) => a.rank - b.rank),
      // Source review is not inferred from filling content.
      reviewStatus: 'NEEDS_SOURCE_REVIEW',
    })),
  };
  const result = inspectPadkTranscriptionDraft(updated);
  if (result.draftedRankCriteria !== inspected.draftedRankCriteria + batch.entries.length
    || result.productionEligible !== false || result.sourcePdfVerified !== false) {
    fail('hasil impor tidak konsisten atau mengubah status');
  }
  return { draft: updated, added: batch.entries.length,
    totalDraftedCriteria: result.draftedRankCriteria,
    remainingCriteria: result.missingRankCriteria,
    productionEligible: false };
}
