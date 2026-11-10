export const CATALOG_CODE = /^[A-Z][A-Z0-9_-]{1,31}$/;
export const CATALOG_STATUSES = Object.freeze({
  draft: 'Draft',
  published: 'Terbit',
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INVALID_CHAR = /[\u0000-\u001f\u007f]/;

export function isCatalogId(value) {
  return typeof value === 'string' && UUID.test(value);
}

export function canReadCatalogs(permissions) {
  return Array.isArray(permissions) && permissions.includes('assessments:read');
}

export function canWriteCatalogs(permissions) {
  return canReadCatalogs(permissions) && permissions.includes('assessments:write');
}

export function validateCatalogDraft({ code, title } = {}) {
  const normalizedCode = typeof code === 'string' ? code.trim().toUpperCase() : '';
  const normalizedTitle = typeof title === 'string' ? title.trim() : '';
  if (!CATALOG_CODE.test(normalizedCode)
    || normalizedTitle.length < 3 || normalizedTitle.length > 200
    || INVALID_CHAR.test(normalizedTitle)) {
    throw new TypeError('Kode katalog harus 2–32 karakter huruf besar/angka/_/-, diawali huruf; judul 3–200 karakter.');
  }
  return { code: normalizedCode, title: normalizedTitle };
}

export function validateControlDraft({
  code, title, description = '', sourceDocument = '', sourceSection = '',
} = {}) {
  const normalizedCode = typeof code === 'string' ? code.trim().toUpperCase() : '';
  const normalizedTitle = typeof title === 'string' ? title.trim() : '';
  // API tidak menerima control character termasuk line break pada deskripsi.
  const normalizedDescription = typeof description === 'string'
    ? description.trim().replace(/\r?\n/g, ' ') : null;
  const documentText = typeof sourceDocument === 'string' ? sourceDocument.trim() : '';
  const sectionText = typeof sourceSection === 'string' ? sourceSection.trim() : '';
  if (!CATALOG_CODE.test(normalizedCode)
    || normalizedTitle.length < 3 || normalizedTitle.length > 200
    || INVALID_CHAR.test(normalizedTitle)
    || normalizedDescription === null || normalizedDescription.length > 2000
    || INVALID_CHAR.test(normalizedDescription)
    || (!!documentText !== !!sectionText)
    || (documentText && (documentText.length < 3 || documentText.length > 200
      || sectionText.length > 100 || INVALID_CHAR.test(documentText)
      || INVALID_CHAR.test(sectionText)))) {
    throw new TypeError('Data kontrol tidak valid. Referensi dokumen dan bagian wajib diisi bersama atau dikosongkan bersama.');
  }
  return {
    code: normalizedCode,
    title: normalizedTitle,
    description: normalizedDescription,
    sourceDocument: documentText || null,
    sourceSection: sectionText || null,
  };
}

export function parseCatalogs(data) {
  if (!data || !Array.isArray(data.catalogs)
    || data.catalogs.some(c => !c || !isCatalogId(c.id)
      || typeof c.code !== 'string' || typeof c.title !== 'string'
      || (c.origin!==undefined&&!['builtin','custom'].includes(c.origin)))) {
    throw new TypeError('Daftar katalog dari API tidak valid.');
  }
  return data.catalogs;
}

export function parseVersions(data) {
  if (!data || !Array.isArray(data.versions)
    || data.versions.some(v => !v || !isCatalogId(v.id)
      || !Number.isSafeInteger(v.version) || v.version < 1
      || !Object.hasOwn(CATALOG_STATUSES, v.status))) {
    throw new TypeError('Daftar versi katalog dari API tidak valid.');
  }
  return data.versions;
}

export function parseControls(data, expectedVersionId) {
  if (!data || !data.version || data.version.id !== expectedVersionId
    || !Object.hasOwn(CATALOG_STATUSES, data.version.status)
    || !Array.isArray(data.controls)
    || data.controls.some(c => !c || !isCatalogId(c.id)
      || typeof c.control_code !== 'string' || typeof c.title !== 'string')) {
    throw new TypeError('Daftar kontrol dari API tidak valid.');
  }
  return data.controls;
}

export function canAddControl(permissions, version, count) {
  return canWriteCatalogs(permissions) && version?.status === 'draft'
    && Number.isSafeInteger(count) && count < 200;
}

export function canPublish(permissions, version, count) {
  return canWriteCatalogs(permissions) && version?.status === 'draft'
    && Number.isSafeInteger(count) && count > 0;
}

export function canCreateNextVersion(permissions, versions) {
  return canWriteCatalogs(permissions) && Array.isArray(versions)
    && versions.length > 0 && versions[0].status === 'published';
}
