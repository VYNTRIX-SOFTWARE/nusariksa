import {
  createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID,
} from 'node:crypto';
import { userHasPermission } from './authorization.js';

export const EVIDENCE_MAX_BYTES = 1024 * 1024;
export const EVIDENCE_MAX_FILES_PER_CONTROL = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCEPTED = Object.freeze({
  'application/pdf': '.pdf', 'image/png': '.png', 'image/jpeg': '.jpg',
});
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
const UNSAFE_NAME = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069\\/<>"|?*:]/;

export class EvidenceError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'EvidenceError';
    this.status = status;
  }
}

export function parseEvidenceKey(key) {
  if (typeof key !== 'string' || !/^[0-9a-f]{64}$/i.test(key)) return null;
  return Buffer.from(key, 'hex');
}

export function validateEvidence({ fileName, mediaType, contentBase64 } = {}) {
  if (typeof fileName !== 'string' || !fileName || fileName.length > 160
    || fileName !== fileName.trim() || UNSAFE_NAME.test(fileName)
    || fileName.includes('..')
    || !Object.hasOwn(ACCEPTED, mediaType)
    || !fileName.toLowerCase().endsWith(ACCEPTED[mediaType])
      && !(mediaType === 'image/jpeg' && fileName.toLowerCase().endsWith('.jpeg'))
    || typeof contentBase64 !== 'string'
    || contentBase64.length > Math.ceil(EVIDENCE_MAX_BYTES / 3) * 4
    || contentBase64.length % 4 !== 0 || !B64.test(contentBase64)) {
    throw new EvidenceError(400, 'Invalid evidence');
  }
  const bytes = Buffer.from(contentBase64, 'base64');
  if (!bytes.length || bytes.length > EVIDENCE_MAX_BYTES
    || bytes.toString('base64') !== contentBase64) {
    throw new EvidenceError(400, 'Invalid evidence');
  }
  // Magic bytes only. This is not an anti-malware scanner or full document parser.
  const validMagic = mediaType === 'application/pdf'
    ? bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))
    : mediaType === 'image/png'
      ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!validMagic) throw new EvidenceError(400, 'File signature does not match media type');
  return { fileName, mediaType, bytes };
}

function aad(row) {
  return Buffer.from([
    row.id, row.assessment_id, row.control_id, row.file_name,
    row.media_type, String(row.size_bytes),
  ].join('\u0000'), 'utf8');
}

export function encryptEvidence(args, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new EvidenceError(503, 'Evidence encryption is not configured');
  }
  const { fileName, mediaType, bytes, assessmentId, controlId } = args;
  const row = {
    id: randomUUID(), assessment_id: assessmentId, control_id: controlId,
    file_name: fileName, media_type: mediaType, size_bytes: bytes.length,
  };
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(aad(row));
  return {
    ...row, nonce,
    auth_tag: null,
    ciphertext: null,
    sha256: createHash('sha256').update(bytes).digest(),
    ...(() => {
      const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
      return { ciphertext, auth_tag: cipher.getAuthTag() };
    })(),
  };
}

export function decryptEvidence(row, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new EvidenceError(503, 'Evidence encryption is not configured');
  }
  try {
    const decoder = createDecipheriv('aes-256-gcm', key, row.nonce);
    decoder.setAAD(aad(row));
    decoder.setAuthTag(row.auth_tag);
    const bytes = Buffer.concat([decoder.update(row.ciphertext), decoder.final()]);
    if (bytes.length !== row.size_bytes ||
      !createHash('sha256').update(bytes).digest().equals(row.sha256)) {
      throw new Error('Evidence checksum mismatch');
    }
    return bytes;
  } catch {
    throw new EvidenceError(503, 'Evidence could not be decrypted');
  }
}

async function permitted(db, actorId, permission) {
  if (!UUID.test(actorId) || !await userHasPermission(db, actorId, permission)) {
    throw new EvidenceError(403, 'Forbidden');
  }
}

async function findTarget(db, actorId, assessmentId, controlId, lock = false) {
  if (!UUID.test(assessmentId) || !UUID.test(controlId)) {
    throw new EvidenceError(400, 'Invalid evidence target');
  }
  const assessment = await db.query(
    'SELECT a.id, a.status, a.owner_user_id, aa.catalog_version_id ' +
    'FROM assessments a ' +
    'JOIN users u ON u.id = $1 AND u.institution_id = a.institution_id ' +
    'LEFT JOIN assessment_catalog_assignments aa ON aa.assessment_id = a.id ' +
    'WHERE a.id = $2 ' + (lock ? 'FOR UPDATE OF a' : ''),
    [actorId, assessmentId],
  );
  if (assessment.rowCount !== 1) throw new EvidenceError(404, 'Assessment not found');
  const a = assessment.rows[0];
  if (!a.catalog_version_id) throw new EvidenceError(404, 'Control not in assessment');
  const control = await db.query(
    'SELECT 1 FROM control_definitions WHERE id = $1 AND version_id = $2',
    [controlId, a.catalog_version_id],
  );
  if (control.rowCount !== 1) throw new EvidenceError(404, 'Control not in assessment');
  return a;
}

const metadata = (row) => ({
  id: row.id,
  assessmentId: row.assessment_id,
  controlId: row.control_id,
  fileName: row.file_name,
  mediaType: row.media_type,
  sizeBytes: row.size_bytes,
  sha256: row.sha256.toString('hex'),
  uploadedBy: row.uploaded_by,
  uploadedAt: row.uploaded_at,
});

export async function listEvidence(db, { actorId, assessmentId, controlId }) {
  await permitted(db, actorId, 'evidence:read');
  await findTarget(db, actorId, assessmentId, controlId);
  const results = await db.query(
    'SELECT id, assessment_id, control_id, file_name, media_type, size_bytes, ' +
    'sha256, uploaded_by, uploaded_at FROM assessment_evidence ' +
    'WHERE assessment_id = $1 AND control_id = $2 ' +
    'ORDER BY uploaded_at DESC, id DESC LIMIT 50',
    [assessmentId, controlId],
  );
  return { assessmentId, controlId, evidence: results.rows.map(metadata) };
}

export async function uploadEvidenceInTransaction(db, {
  actorId, assessmentId, controlId, fileName, mediaType, contentBase64, key,
}) {
  const input = validateEvidence({ fileName, mediaType, contentBase64 });
  await permitted(db, actorId, 'evidence:write');
  const target = await findTarget(db, actorId, assessmentId, controlId, true);
  if (target.owner_user_id !== actorId) {
    throw new EvidenceError(403, 'Only the assessment owner can upload evidence');
  }
  if (!['in_progress', 'changes_requested'].includes(target.status)) {
    throw new EvidenceError(409, 'Evidence can only be added to an open assessment');
  }
  const existing = await db.query(
    'SELECT count(*)::int AS total FROM assessment_evidence ' +
    'WHERE assessment_id = $1 AND control_id = $2',
    [assessmentId, controlId],
  );
  if (existing.rows[0].total >= EVIDENCE_MAX_FILES_PER_CONTROL) {
    throw new EvidenceError(409, 'Maximum evidence files per control reached');
  }
  const encrypted = encryptEvidence({ ...input, assessmentId, controlId }, key);
  const inserted = await db.query(
    'INSERT INTO assessment_evidence (id, assessment_id, catalog_version_id, control_id, ' +
    'file_name, media_type, size_bytes, sha256, nonce, auth_tag, ciphertext, uploaded_by) ' +
    'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING ' +
    'id, assessment_id, control_id, file_name, media_type, size_bytes, sha256, ' +
    'uploaded_by, uploaded_at',
    [encrypted.id, assessmentId, target.catalog_version_id, controlId,
      encrypted.file_name, encrypted.media_type, encrypted.size_bytes,
      encrypted.sha256, encrypted.nonce, encrypted.auth_tag,
      encrypted.ciphertext, actorId],
  );
  return metadata(inserted.rows[0]);
}

export async function uploadEvidence(pool, args) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const record = await uploadEvidenceInTransaction(db, args);
    await db.query('COMMIT');
    return record;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

export async function getEvidence(db, { actorId, assessmentId, evidenceId, key }) {
  if (!UUID.test(assessmentId) || !UUID.test(evidenceId)) {
    throw new EvidenceError(400, 'Invalid evidence ID');
  }
  await permitted(db, actorId, 'evidence:read');
  const found = await db.query(
    'SELECT e.id, e.assessment_id, e.control_id, e.file_name, e.media_type, ' +
    'e.size_bytes, e.sha256, e.nonce, e.auth_tag, e.ciphertext ' +
    'FROM assessment_evidence e ' +
    'JOIN assessments a ON a.id = e.assessment_id ' +
    'JOIN users u ON u.id = $1 AND u.institution_id = a.institution_id ' +
    'WHERE e.id = $2 AND e.assessment_id = $3',
    [actorId, evidenceId, assessmentId],
  );
  if (found.rowCount !== 1) throw new EvidenceError(404, 'Evidence not found');
  const row = found.rows[0];
  return { data: decryptEvidence(row, key), fileName: row.file_name, mediaType: row.media_type };
}
