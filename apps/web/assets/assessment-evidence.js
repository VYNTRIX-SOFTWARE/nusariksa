import { ApiError } from './session.js';

const $ = id => document.getElementById(id);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BYTES = 1024 * 1024;
const ALLOWED_TYPES = new Set(['application/pdf','image/png','image/jpeg']);

function element(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text != null) item.textContent = String(text);
  return item;
}

export function evidenceCanWrite(permissions, userId, ownerId, status) {
  return Array.isArray(permissions) && permissions.includes('evidence:write')
    && !!userId && userId === ownerId
    && (status === 'in_progress' || status === 'changes_requested');
}

export function validEvidenceListing(payload, assessmentId, controlId) {
  if (!payload || payload.assessmentId !== assessmentId
    || payload.controlId !== controlId || !Array.isArray(payload.evidence)
    || payload.evidence.some(file=>!file || !UUID.test(file.id)
      || typeof file.fileName !== 'string' || !Number.isSafeInteger(file.sizeBytes)
      || file.sizeBytes < 1 || file.sizeBytes > MAX_BYTES)) {
    throw new TypeError('Daftar bukti dari server tidak valid.');
  }
  return payload.evidence;
}

export async function fileToBase64(file) {
  if (!file || !ALLOWED_TYPES.has(file.type) || !Number.isSafeInteger(file.size)
    || file.size < 1 || file.size > MAX_BYTES) {
    throw new TypeError('Pilih PDF, PNG, atau JPEG dengan ukuran maksimal 1 MiB.');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length !== file.size) throw new TypeError('Ukuran file berubah saat dibaca.');
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  }
  return btoa(binary);
}

export function createEvidenceUI({ api, getPermissions, onAuthFailure }) {
  let generation = 0, context = null, busy = false;

  function inform(text, kind='info') {
    const box = $('workspace-evidence-message');
    box.hidden = !text;
    box.textContent = text || '';
    box.dataset.kind = kind;
  }

  function canRead() {
    return context && getPermissions().includes('evidence:read');
  }

  function canWrite() {
    return context && evidenceCanWrite(
      getPermissions(), context.userId, context.ownerId, context.status);
  }

  function renderPermissions() {
    $('workspace-evidence-upload').hidden = !canWrite();
    $('workspace-evidence-upload-button').disabled = busy || !canWrite();
    $('workspace-evidence-reload').disabled = busy || !canRead();
    $('workspace-evidence-file').disabled = busy || !canWrite();
  }

  function clear() {
    generation++;
    context = null;
    busy = false;
    $('workspace-evidence-panel').hidden = true;
    $('workspace-evidence-list').replaceChildren();
    $('workspace-evidence-upload').reset();
    inform('');
    renderPermissions();
  }

  function renderList(items) {
    const root = $('workspace-evidence-list');
    root.replaceChildren();
    if (!items.length) {
      root.append(element('p','empty-note','Belum ada bukti untuk kontrol ini.'));
      return;
    }
    for (const file of items) {
      const row = element('div','workspace-evidence-item');
      const info = element('div','workspace-evidence-meta');
      info.append(element('strong','',file.fileName),
        element('small','',Math.ceil(file.sizeBytes / 1024) + ' KiB · ' +
          (file.uploadedAt ? new Date(file.uploadedAt).toLocaleString('id-ID') : 'Waktu tidak tersedia') +
          ' · ID pengunggah ' + String(file.uploadedBy || '—').slice(0,8)));
      const link = element('a','detail-link','Unduh');
      link.href = '/assessments/' + encodeURIComponent(context.assessmentId) +
        '/evidence/' + encodeURIComponent(file.id) + '/download';
      link.setAttribute('aria-label','Unduh bukti ' + file.fileName);
      row.append(info,link);
      root.append(row);
    }
  }

  async function load() {
    if (!canRead() || busy) return;
    const gen = ++generation;
    const { assessmentId, controlId } = context;
    inform('');
    $('workspace-evidence-list').replaceChildren(element('p','empty-note','Memuat daftar bukti…'));
    try {
      const data = await api('/assessments/' + encodeURIComponent(assessmentId) +
        '/controls/' + encodeURIComponent(controlId) + '/evidence');
      if (gen !== generation || !context || !canRead()) return;
      renderList(validEvidenceListing(data, assessmentId, controlId));
    } catch(error) {
      if (gen !== generation) return;
      if (onAuthFailure(error)) return;
      $('workspace-evidence-list').replaceChildren();
      inform(error instanceof ApiError && error.status === 403
        ? 'Tidak memiliki izin membaca bukti.'
        : 'Gagal memuat bukti. Pilih Muat ulang.', 'error');
    }
  }

  function open(next) {
    generation++;
    context = next && UUID.test(next.assessmentId) && UUID.test(next.controlId)
      ? next : null;
    busy = false;
    $('workspace-evidence-panel').hidden = !canRead();
    $('workspace-evidence-upload').reset();
    $('workspace-evidence-list').replaceChildren();
    inform('');
    renderPermissions();
    if (canRead()) void load();
  }

  $('workspace-evidence-reload').addEventListener('click',()=>void load());
  $('workspace-evidence-upload').addEventListener('submit',async event=>{
    event.preventDefault();
    if (!canWrite() || busy) return;
    const file = $('workspace-evidence-file').files?.[0];
    if (!file) { inform('Pilih file bukti terlebih dahulu.','error'); return; }
    let contentBase64;
    const gen = generation;
    const { assessmentId, controlId } = context;
    busy = true;
    renderPermissions();
    try {
      contentBase64 = await fileToBase64(file);
      if (gen !== generation || !canWrite()) return;
      await api('/assessments/' + encodeURIComponent(assessmentId) +
        '/controls/' + encodeURIComponent(controlId) + '/evidence', {
        method:'POST',
        body: { fileName:file.name, mediaType:file.type, contentBase64 },
      });
      if (gen !== generation || !context) return;
      $('workspace-evidence-upload').reset();
      inform('Bukti tercatat. File tidak dapat diubah atau dihapus.', 'success');
      busy = false;
      renderPermissions();
      await load();
    } catch (error) {
      if (gen !== generation) return;
      if (onAuthFailure(error)) return;
      inform(error instanceof TypeError ? error.message
        : error instanceof ApiError && error.status === 409
          ? 'Status asesmen berubah atau kuota bukti penuh. Muat ulang untuk memeriksa.'
          : error instanceof ApiError && error.status === 503
            ? 'Penyimpanan terenkripsi belum dikonfigurasi atau tidak tersedia.'
            : 'Upload gagal. Periksa file, izin, dan koneksi.', 'error');
    } finally {
      if (gen === generation) {
        busy = false;
        renderPermissions();
      }
    }
  });

  return { open, clear };
}
