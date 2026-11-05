import { createHash } from 'node:crypto';
import { validatePadkCyberManifest, PadkCyberError } from './padk-cyber-maturity.js';

const REFERENCE = '43/PADK.03/2025:LAMPIRAN_IV';
const OFFICIAL_SOURCE = 'https://ojk.go.id/id/regulasi/Pages/PADK-43-PADK03-2025-Penyelenggaraan-Teknologi-Informasi-oleh-BPR-BPRS.aspx';
const SHA256 = /^[a-f0-9]{64}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const REVIEW_ROLES = new Set(['substance', 'technical']);
const INVALID = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const PLACEHOLDER = /\b(?:TODO|TBD|DUMMY|SYNTHETIC|SINTETIS|PLACEHOLDER|CONTOH SAJA)\b/i;

function reject(message) { throw new PadkCyberError(message); }
function exactObject(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key));
}
function content(value, min, max) {
  return typeof value === 'string' && value.length >= min && value.length <= max
    && value === value.trim() && !INVALID.test(value) && !PLACEHOLDER.test(value);
}
function integerInRange(value, min, max) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}
function validDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const time = new Date(value + 'T00:00:00.000Z');
  return !Number.isNaN(time.valueOf()) && time.toISOString().slice(0, 10) === value;
}
function hexDigest(value) {
  return typeof value === 'string' && SHA256.test(value);
}

/**
 * Fail-closed review data contract. Does not certify regulatory compliance.
 *
 * The official PDF has to be inspected by humans; schemas cannot prove the
 * correctness of a transcription merely because the item count is complete.
 */
export function validatePadkRegulatoryPack(raw) {
  if (!exactObject(raw, ['schemaVersion', 'reference', 'category', 'source', 'indicators'])
    || raw.schemaVersion !== 1 || raw.reference !== REFERENCE) {
    reject('Format atau referensi regulatory pack tidak valid');
  }

  if (!Array.isArray(raw.indicators)) reject('Daftar indikator harus berupa array');
  const source = raw.source;
  if (!exactObject(source, ['authority', 'regulation', 'annex', 'table', 'url', 'pdfSha256'])
    || source.authority !== 'OJK'
    || source.regulation !== '43/PADK.03/2025'
    || source.annex !== 'IV'
    || source.table !== (raw.category === 1 ? 'TABEL_1' : 'TABEL_2')
    || source.url !== OFFICIAL_SOURCE
    || !hexDigest(source.pdfSha256)) {
    reject('Identitas dokumen sumber dan hash PDF harus tersedia dan sesuai');
  }

  // Reuse the proven 80/60 indicator ordering, domain and uniqueness checks.
  const normalizedManifest = validatePadkCyberManifest({
    reference: raw.reference,
    category: raw.category,
    indicators: raw.indicators.map(item => ({
      number: item?.number,
      domain: item?.domain,
      subdomain: item?.subdomain,
      title: item?.title,
    })),
  });

  const byNumber = new Map(raw.indicators.map(item => [item.number, item]));
  const indicators = normalizedManifest.indicators.map(basic => {
    const item = byNumber.get(basic.number);
    if (!exactObject(item, [
      'number', 'domain', 'subdomain', 'title', 'tablePage', 'rankCriteria',
    ]) || !integerInRange(item.tablePage, 16, 37)
      || !content(item.title, 12, 2000)
      || !Array.isArray(item.rankCriteria)
      || item.rankCriteria.length !== 5) {
      reject('Referensi halaman atau kriteria peringkat indikator tidak lengkap');
    }

    const sorted = [...item.rankCriteria].sort((a, b) => a.rank - b.rank);
    for (let i = 0; i < 5; i++) {
      const rank = sorted[i];
      if (!exactObject(rank, ['rank', 'criterion', 'criteriaPage'])
        || rank.rank !== i + 1
        || !content(rank.criterion, 12, 3000)
        || !integerInRange(rank.criteriaPage, 38, 80)) {
        reject('Tiap indikator harus memiliki kriteria peringkat 1–5 serta halaman Lampiran IV');
      }
    }
    if (new Set(sorted.map(row => row.criterion.trim().toLowerCase())).size !== 5) {
      reject('Kriteria lima peringkat tidak boleh identik');
    }
    return { ...basic, tablePage: item.tablePage, rankCriteria: sorted };
  });

  return {
    schemaVersion: 1,
    reference: REFERENCE,
    category: raw.category,
    source: { ...source },
    indicators,
  };
}

export function padkRegulatoryPackFingerprint(raw) {
  const normalized = validatePadkRegulatoryPack(raw);
  const sha256 = createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex');
  return { normalized, sha256 };
}

function cleanAttestation(raw, fingerprint, compilerId) {
  if (!exactObject(raw, ['reviewerId', 'role', 'reviewedAt', 'packSha256'])
    || !content(raw.reviewerId, 3, 120)
    || raw.reviewerId === compilerId
    || !REVIEW_ROLES.has(raw.role)
    || !validDate(raw.reviewedAt)
    || raw.packSha256 !== fingerprint) {
    reject('Attestasi reviewer harus independen dan terikat hash paket');
  }
  return { ...raw };
}

export function reviewPadkRegulatoryPack({ pack, compiledBy, attestations }) {
  const { normalized, sha256 } = padkRegulatoryPackFingerprint(pack);
  if (!content(compiledBy, 3, 120) || !Array.isArray(attestations)
    || attestations.length !== 2) {
    reject('Paket membutuhkan penyusun dan dua review terpisah');
  }
  const reviews = attestations.map(raw => cleanAttestation(raw, sha256, compiledBy));
  if (reviews[0].reviewerId === reviews[1].reviewerId
    || reviews[0].role === reviews[1].role) {
    reject('Reviewer substansi dan reviewer teknis harus berbeda');
  }

  // Review statements are plaintext, not cryptographic signatures. An
  // independent, trusted PR review against the PDF is still required.
  return {
    pack: normalized,
    sha256,
    review: {
      compiledBy,
      attestations: reviews.sort((a, b) => a.role.localeCompare(b.role)),
      level: 'DECLARED_DUAL_REVIEW',
      verifiedByIndependentGitHubReview: false,
      approvedForProduction: false,
    },
  };
}

export function padkPackReviewChecklist(raw) {
  const { normalized, sha256 } = padkRegulatoryPackFingerprint(raw);
  const domains = new Map();
  for (const item of normalized.indicators) {
    domains.set(item.domain, (domains.get(item.domain) ?? 0) + 1);
  }
  return {
    category: normalized.category,
    indicatorCount: normalized.indicators.length,
    rankCriterionCount: normalized.indicators.length * 5,
    domains: Object.fromEntries(domains),
    sourceDocumentSha256: normalized.source.pdfSha256,
    packSha256: sha256,
    status: 'REQUIRES_INDEPENDENT_SOURCE_REVIEW',
    productionEligible: false,
    note: 'Validasi struktur dan checksum bukan bukti bahwa transkripsi indikator sesuai sumber OJK.',
  };
}
