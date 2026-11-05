/**
 * Workbench for incomplete Lampiran IV transcription.
 * Never load these draft files as regulatory packs or a scoring source.
 */
const CATEGORY_SIZES = Object.freeze({ 1: 80, 2: 60 });
const DOMAIN_CODES = new Set(['TK', 'ID', 'PL', 'DT', 'PP']);
const UUID_TAG = /^[A-Z0-9._-]{2,64}$/;
const BAD_TEXT = /[\u0000-\u001f\u007f]/;
const allowedRoot = ['schemaVersion', 'reference', 'category', 'status', 'source', 'items'];
const allowedItem = [
  'number', 'domain', 'subdomain', 'workingSummary', 'tablePage',
  'rankCriteria', 'reviewStatus',
];
const allowedCriterion = ['rank', 'workingSummary', 'criteriaPage'];

function exact(obj, keys) {
  return obj && typeof obj === 'object' && !Array.isArray(obj)
    && Object.keys(obj).length === keys.length
    && keys.every(key => Object.hasOwn(obj,key));
}
function text(value,limit) {
  return typeof value === 'string' && value.length > 0
    && value.length <= limit && value.trim() === value && !BAD_TEXT.test(value);
}
function reject(message) {
  throw new TypeError('Draft PADK tidak valid: ' + message);
}
function countFor(category) {
  return Object.hasOwn(CATEGORY_SIZES,category) ? CATEGORY_SIZES[category] : null;
}

export function inspectPadkTranscriptionDraft(draft) {
  if (!exact(draft,allowedRoot) || draft.schemaVersion !== 1
    || draft.reference !== '43/PADK.03/2025:LAMPIRAN_IV'
    || draft.status !== 'DRAFT_UNVERIFIED'
    || !countFor(draft.category)
    || !exact(draft.source,['authorityUrl','workingCopyUrl','pdfSha256','verifiedAgainstOfficialPdf'])
    || draft.source.authorityUrl !==
      'https://ojk.go.id/id/regulasi/Pages/PADK-43-PADK03-2025-Penyelenggaraan-Teknologi-Informasi-oleh-BPR-BPRS.aspx'
    || !text(draft.source.workingCopyUrl,600)
    || draft.source.pdfSha256 !== null
    || draft.source.verifiedAgainstOfficialPdf !== false
    || !Array.isArray(draft.items)) {
    reject('header, sumber, atau status harus tetap DRAFT_UNVERIFIED');
  }
  const expected = countFor(draft.category);
  if (draft.items.length > expected) reject('jumlah nomor melebihi kategori');
  const seen = new Set();
  const byDomain = new Map([...DOMAIN_CODES].map(code => [code,0]));
  let presentCriteria = 0;
  const items = draft.items.map(item => {
    if (!exact(item,allowedItem)
      || !Number.isInteger(item.number) || item.number < 1
      || item.number > expected || seen.has(item.number)
      || !DOMAIN_CODES.has(item.domain)
      || !UUID_TAG.test(item.subdomain)
      || !text(item.workingSummary,500)
      || !Number.isInteger(item.tablePage) || item.tablePage < 16
      || item.tablePage > 37
      || !Array.isArray(item.rankCriteria) || item.rankCriteria.length > 5
      || item.reviewStatus !== 'NEEDS_SOURCE_REVIEW') {
      reject('indikator, halaman, atau status review tidak valid');
    }
    seen.add(item.number);
    byDomain.set(item.domain,byDomain.get(item.domain)+1);
    const rankSet = new Set();
    for (const criterion of item.rankCriteria) {
      if (!exact(criterion,allowedCriterion)
        || !Number.isInteger(criterion.rank) || criterion.rank < 1
        || criterion.rank > 5 || rankSet.has(criterion.rank)
        || !text(criterion.workingSummary,3000)
        || !Number.isInteger(criterion.criteriaPage)
        || criterion.criteriaPage < 38 || criterion.criteriaPage > 80) {
        reject('kriteria parsial tidak valid');
      }
      rankSet.add(criterion.rank);
      presentCriteria++;
    }
    return {
      ...item,
      rankCriteria:[...item.rankCriteria].sort((a,b) => a.rank-b.rank),
    };
  }).sort((a,b) => a.number-b.number);

  const missingNumbers=Array.from({length:expected},(_,index)=>index+1)
    .filter(number=>!seen.has(number));
  const rankCriteriaMissing=expected*5-presentCriteria;
  return {
    category:draft.category,
    expectedIndicators:expected,
    draftedIndicators:items.length,
    missingNumbers,
    expectedRankCriteria:expected*5,
    draftedRankCriteria:presentCriteria,
    missingRankCriteria:rankCriteriaMissing,
    byDomain:Object.fromEntries(byDomain),
    sourcePdfVerified:false,
    independentReviewCompleted:false,
    productionEligible:false,
    status:'DRAFT_UNVERIFIED',
    items,
  };
}

export function summarizePadkDrafts(drafts) {
  if (!Array.isArray(drafts) || drafts.length !== 2) reject('harus ada dua kategori');
  const byCategory = new Map();
  for (const draft of drafts) {
    const inspected=inspectPadkTranscriptionDraft(draft);
    if (byCategory.has(inspected.category))reject('kategori ganda');
    byCategory.set(inspected.category,inspected);
  }
  if (!byCategory.has(1) || !byCategory.has(2)) reject('kategori 1/2 wajib ada');
  return {
    categories:[byCategory.get(1),byCategory.get(2)],
    totalExpectedIndicators:140,
    totalDraftedIndicators:byCategory.get(1).draftedIndicators+
      byCategory.get(2).draftedIndicators,
    totalExpectedRankCriteria:700,
    totalDraftedRankCriteria:byCategory.get(1).draftedRankCriteria+
      byCategory.get(2).draftedRankCriteria,
    productionEligible:false,
    status:'TRANSCRIPTION_IN_PROGRESS',
    note:'Ringkasan ini hanya daftar kerja; transkripsi dan kriteria belum diperiksa dari PDF asli OJK.',
  };
}
