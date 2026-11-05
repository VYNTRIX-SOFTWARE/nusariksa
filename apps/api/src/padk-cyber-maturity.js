import { createHash } from 'node:crypto';

// Regulatory *preview* only. Parameter wording and category-to-domain mapping
// must be reviewed against the complete official Lampiran IV before release.
// Unlike the configurable internal maturity engine, rank 1 is the BEST result.
const REFERENCE = '43/PADK.03/2025:LAMPIRAN_IV';
const REGULATION_URL = 'https://ojk.go.id/id/regulasi/Pages/PADK-43-PADK03-2025-Penyelenggaraan-Teknologi-Informasi-oleh-BPR-BPRS.aspx';

export const PADK_CYBER_DOMAINS = Object.freeze([
  Object.freeze({ code: 'TK', name: 'Tata Kelola', weightPercent: 25 }),
  Object.freeze({ code: 'ID', name: 'Identifikasi', weightPercent: 15 }),
  Object.freeze({ code: 'PL', name: 'Pelindungan', weightPercent: 25 }),
  Object.freeze({ code: 'DT', name: 'Deteksi', weightPercent: 15 }),
  Object.freeze({ code: 'PP', name: 'Penanggulangan dan Pemulihan', weightPercent: 20 }),
]);

const CATEGORY_SIZES = Object.freeze({ 1: 80, 2: 60 });
const DOMAIN_BY_CODE = new Map(PADK_CYBER_DOMAINS.map(domain => [domain.code, domain]));
const CODE = /^[A-Z][A-Z0-9._-]{1,31}$/;
const BAD_TEXT = /[\u0000-\u001f\u007f]/;

export const PADK_COMPOSITE_BANDS = Object.freeze([
  Object.freeze({ rank: 1, maxHundredths: 180, label: 'Sangat Memadai' }),
  Object.freeze({ rank: 2, maxHundredths: 260, label: 'Memadai' }),
  Object.freeze({ rank: 3, maxHundredths: 340, label: 'Cukup Memadai' }),
  Object.freeze({ rank: 4, maxHundredths: 420, label: 'Kurang Memadai' }),
  Object.freeze({ rank: 5, maxHundredths: 500, label: 'Tidak Memadai' }),
]);

export class PadkCyberError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PadkCyberError';
    this.status = 400;
  }
}

const invalid = message => { throw new PadkCyberError(message); };
const plain = value =>
  !!value && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype
    || Object.getPrototypeOf(value) === null);
const keysAre = (obj, allowed, required = allowed) =>
  plain(obj) && Object.keys(obj).every(key => allowed.includes(key))
  && required.every(key => Object.hasOwn(obj, key));

export function padkCyberFramework() {
  return {
    regulation: '43/PADK.03/2025',
    annex: 'IV',
    sourceUrl: REGULATION_URL,
    categoryIndicatorCounts: { '1': 80, '2': 60 },
    domains: PADK_CYBER_DOMAINS.map(domain => ({ ...domain })),
    ranks: [
      { rank: 1, label: 'Sangat Memadai' },
      { rank: 2, label: 'Memadai' },
      { rank: 3, label: 'Cukup Memadai' },
      { rank: 4, label: 'Kurang Memadai' },
      { rank: 5, label: 'Tidak Memadai' },
    ],
    compositeBands: PADK_COMPOSITE_BANDS.map(({ rank, maxHundredths, label }) =>
      ({ rank, upperBound: maxHundredths / 100, label })),
    readyForRegulatoryUse: false,
    note: 'Kerangka kalkulasi pratinjau; pemetaan dan kriteria tiap indikator belum diverifikasi atau diterbitkan dalam aplikasi.',
  };
}

export function validatePadkCyberManifest(manifest) {
  if (!keysAre(manifest, ['reference', 'category', 'indicators'])) {
    invalid('Format peta indikator tidak valid');
  }
  const { reference, category, indicators } = manifest;
  if (reference !== REFERENCE || !Number.isInteger(category)
    || !Object.hasOwn(CATEGORY_SIZES, category) || !Array.isArray(indicators)
    || indicators.length !== CATEGORY_SIZES[category]) {
    invalid('Peta indikator harus lengkap untuk kategori yang dipilih');
  }

  const seen = new Set();
  const domains = new Set();
  const normalized = indicators.map(item => {
    if (!keysAre(item, ['number', 'domain', 'subdomain', 'title'])
      || !Number.isInteger(item.number)
      || item.number < 1 || item.number > CATEGORY_SIZES[category]
      || seen.has(item.number) || !DOMAIN_BY_CODE.has(item.domain)
      || typeof item.subdomain !== 'string' || !CODE.test(item.subdomain)
      || typeof item.title !== 'string' || item.title.length < 8
      || item.title.length > 240 || item.title !== item.title.trim()
      || BAD_TEXT.test(item.title)) {
      invalid('Peta indikator memiliki nomor, domain, atau teks yang tidak valid');
    }
    seen.add(item.number);
    domains.add(item.domain);
    return {
      number: item.number,
      domain: item.domain,
      subdomain: item.subdomain,
      title: item.title,
    };
  });
  if (domains.size !== PADK_CYBER_DOMAINS.length) {
    invalid('Kelima domain wajib terwakili pada peta indikator');
  }
  normalized.sort((a, b) => a.number - b.number);
  return { reference, category, indicators: normalized };
}

// Explicit preview rounding policy, not a claim that the PADK prescribes a
// particular tie-breaking algorithm for non-two-decimal composite values.
export function previewPadkCompositeRank(rawComposite) {
  if (typeof rawComposite !== 'number' || !Number.isFinite(rawComposite)
    || rawComposite < 1 || rawComposite > 5) {
    invalid('Nilai komposit di luar rentang 1–5');
  }
  // Raw rank sums are positive. Half-up to two decimals is deterministic.
  const roundedHundredths = Math.floor(rawComposite * 100 + 0.5 + 1e-9);
  const band = PADK_COMPOSITE_BANDS.find(item => roundedHundredths <= item.maxHundredths);
  if (!band) invalid('Peringkat komposit tidak dapat ditentukan');
  return {
    valueTwoDecimals: (roundedHundredths / 100).toFixed(2),
    rank: band.rank,
    label: band.label,
  };
}

export function previewPadkCyberMaturity(input) {
  if (!keysAre(input, ['manifest', 'ratings'])) {
    invalid('Payload kalkulasi tidak valid');
  }
  const manifest = validatePadkCyberManifest(input.manifest);
  if (!Array.isArray(input.ratings)
    || input.ratings.length > manifest.indicators.length) {
    invalid('Jumlah peringkat parameter tidak valid');
  }

  const validNumbers = new Set(manifest.indicators.map(item => item.number));
  const answers = new Map();
  for (const rating of input.ratings) {
    if (!keysAre(rating, ['number', 'rank'])
      || !Number.isInteger(rating.number)
      || !validNumbers.has(rating.number) || answers.has(rating.number)
      || !Number.isInteger(rating.rank) || rating.rank < 1 || rating.rank > 5) {
      invalid('Peringkat indikator harus unik, bernomor valid, dan berada pada rentang 1–5');
    }
    answers.set(rating.number, rating.rank);
  }

  const domains = PADK_CYBER_DOMAINS.map(domain => {
    const members = manifest.indicators.filter(indicator => indicator.domain === domain.code);
    const given = members.filter(indicator => answers.has(indicator.number));
    const complete = given.length === members.length;
    const rankSum = given.reduce((sum, item) => sum + answers.get(item.number), 0);
    return {
      code: domain.code,
      name: domain.name,
      weightPercent: domain.weightPercent,
      requiredIndicators: members.length,
      ratedIndicators: given.length,
      complete,
      averageRank: complete ? rankSum / members.length : null,
      contribution: complete
        ? (rankSum / members.length) * (domain.weightPercent / 100) : null,
    };
  });

  const complete = answers.size === manifest.indicators.length;
  const composite = complete
    ? domains.reduce((sum, domain) => sum + domain.contribution, 0)
    : null;
  const previewRank = complete ? previewPadkCompositeRank(composite) : null;
  const manifestFingerprint = createHash('sha256')
    .update(JSON.stringify(manifest)).digest('hex');

  return {
    category: manifest.category,
    reference: manifest.reference,
    requiredIndicators: manifest.indicators.length,
    ratedIndicators: answers.size,
    missingNumbers: manifest.indicators
      .filter(item => !answers.has(item.number)).map(item => item.number),
    complete,
    domains,
    compositeRaw: composite,
    compositePreview: previewRank,
    manifestSha256: manifestFingerprint,
    mappingVerified: false,
    regulatoryResult: false,
    status: 'PREVIEW_UNVERIFIED',
    notes: [
      'Hasil simulasi internal, bukan nilai maturitas resmi atau hasil yang disahkan OJK.',
      'Peta indikator dikirim pemanggil dan belum diverifikasi terhadap Lampiran IV; seluruh nomor dan domain harus ditelaah sebelum digunakan.',
      'Peringkat komposit pratinjau menggunakan pembulatan half-up dua desimal; kebijakan pembulatan perlu diverifikasi terhadap contoh resmi sebelum rilis.',
      'Tidak ada nilai komposit maupun peringkat ketika satu atau lebih indikator belum dinilai.',
    ],
  };
}
