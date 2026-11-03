import {
  canReadCatalogs, canWriteCatalogs, validateCatalogDraft, validateControlDraft,
  parseCatalogs, parseVersions, parseControls, canAddControl, canPublish,
  canCreateNextVersion, CATALOG_STATUSES, isCatalogId,
} from './control-catalog-model.js';

const $ = id => document.getElementById(id);
const node = (tag, className, value) => {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (value != null) item.textContent = String(value);
  return item;
};
const safe = value => value == null || value === '' ? '—' : String(value);

export function createControlCatalogManagement({ api, getPermissions, onAuthFailure }) {
  const state = {
    catalogs: null, catalogId: null, versions: null,
    versionId: null, version: null, controls: null, generation: 0, busy: false,
  };
  const mayRead = () => canReadCatalogs(getPermissions());
  const mayWrite = () => canWriteCatalogs(getPermissions());
  const currentCatalog = () => state.catalogs?.find(c => c.id === state.catalogId);

  function message(value, kind = 'info') {
    const item = $('catalog-message');
    item.hidden = !value;
    item.textContent = value ?? '';
    item.dataset.kind = kind;
  }
  function renderCatalogs() {
    const root = $('catalog-list');
    root.replaceChildren();
    $('catalog-count').textContent = state.catalogs ? state.catalogs.length + ' katalog pada daftar' : '—';
    if (!state.catalogs) {
      root.append(node('p', 'empty-note', 'Memuat katalog…'));
      return;
    }
    if (!state.catalogs.length) {
      root.append(node('p', 'empty-note', 'Belum ada katalog kontrol. Buat katalog baru jika memiliki izin tulis.'));
      return;
    }
    for (const catalog of state.catalogs) {
      const button = node('button', 'catalog-list-item');
      button.type = 'button';
      button.dataset.catalogId = catalog.id;
      button.classList.toggle('is-selected', catalog.id === state.catalogId);
      button.setAttribute('aria-pressed', String(catalog.id === state.catalogId));
      button.disabled = state.busy;
      button.append(node('strong', 'catalog-list-code', catalog.code),
        node('span', 'catalog-list-title', catalog.title));
      root.append(button);
    }
  }
  function renderVersions() {
    const root = $('catalog-versions');
    root.replaceChildren();
    const catalog = currentCatalog();
    $('catalog-active-title').textContent = catalog ? catalog.code + ' · ' + catalog.title : 'Pilih katalog';
    if (!catalog) {
      root.append(node('p', 'empty-note', 'Pilih katalog untuk melihat versi.'));
      return;
    }
    if (!state.versions) {
      root.append(node('p', 'empty-note', 'Memuat versi…'));
      return;
    }
    if (!state.versions.length) {
      root.append(node('p', 'empty-note', 'Belum ada versi. Periksa kembali data katalog.'));
      return;
    }
    for (const version of state.versions) {
      const button = node('button', 'catalog-version-button');
      button.type = 'button';
      button.dataset.versionId = version.id;
      button.disabled = state.busy;
      button.classList.toggle('is-selected', version.id === state.versionId);
      button.setAttribute('aria-pressed', String(version.id === state.versionId));
      button.append(node('span', '', 'Versi ' + version.version),
        node('span', 'catalog-version-state', CATALOG_STATUSES[version.status]));
      root.append(button);
    }
  }
  function renderControls() {
    const body = $('catalog-controls-body');
    body.replaceChildren();
    const ready = Array.isArray(state.controls) && state.version;
    $('catalog-control-count').textContent = ready ? state.controls.length + ' dari maksimal 200 kontrol' : '—';
    if (!ready) {
      const tr = node('tr'), td = node('td', 'table-empty',
        state.versionId ? 'Memuat kontrol…' : 'Pilih versi katalog terlebih dahulu.');
      td.colSpan = 4; tr.append(td); body.append(tr);
      return;
    }
    if (!state.controls.length) {
      const tr = node('tr'), td = node('td', 'table-empty', 'Belum ada kontrol pada versi ini.');
      td.colSpan = 4; tr.append(td); body.append(tr);
      return;
    }
    for (const control of state.controls) {
      const tr = node('tr'), primary = node('td');
      primary.append(node('strong', 'catalog-list-code', control.control_code),
        node('div', 'catalog-control-title', control.title));
      if (control.description) primary.append(node('p', 'catalog-control-detail', control.description));
      const ref = [control.source_document, control.source_section].filter(Boolean).join(' · ');
      if (ref) primary.append(node('p', 'catalog-control-detail',
        'Rujukan yang diinput pengguna (belum diverifikasi): ' + ref));
      tr.append(primary, node('td', 'table-date', control.position),
        node('td', 'catalog-control-detail', safe(ref ? 'Ada' : 'Tanpa referensi')),
        node('td', 'table-date', safe(state.version?.status === 'published' ? 'Terkunci' : 'Draft')));
      body.append(tr);
    }
  }
  function renderActions() {
    const ready = !!state.version && Array.isArray(state.controls);
    const write = mayWrite();
    const canAdd = !state.busy && ready && canAddControl(getPermissions(), state.version, state.controls.length);
    const canPublishNow = !state.busy && ready && canPublish(getPermissions(), state.version, state.controls.length);
    $('catalog-new-toggle').hidden = !write;
    $('catalog-new-panel').hidden = !write || $('catalog-new-panel').dataset.expanded !== 'true';
    $('catalog-create-submit').disabled = state.busy;
    $('catalog-add-form').hidden = !write || !ready || state.version.status !== 'draft';
    $('catalog-add-submit').disabled = !canAdd;
    $('catalog-publish').hidden = !write || !ready || state.version.status !== 'draft';
    $('catalog-publish').disabled = !canPublishNow;
    $('catalog-next-version').hidden = !write || !canCreateNextVersion(getPermissions(), state.versions);
    $('catalog-next-version').disabled = state.busy;
    $('catalog-refresh').disabled = state.busy;
    $('catalog-status-hint').textContent = !ready
      ? 'Pilih katalog dan versi untuk melihat kontrol.'
      : state.version.status === 'published'
        ? 'Versi terbit terkunci. Buat versi Draft berikutnya untuk menambahkan kontrol.'
        : 'Versi Draft: kontrol baru dapat ditambahkan. API belum mendukung mengedit atau menghapus kontrol yang sudah dibuat.';
  }
  function render() {
    renderCatalogs(); renderVersions(); renderControls(); renderActions();
  }

  function clear() {
    state.generation++;
    state.catalogs = null; state.catalogId = null;
    state.versions = null; state.versionId = null;
    state.version = null; state.controls = null;
    state.busy = false;
    $('catalog-new-panel').dataset.expanded = 'false';
    $('catalog-create-form').reset();
    $('catalog-add-form').reset();
    message('');
    render();
  }

  function handleFailure(error, fallback) {
    if (onAuthFailure(error)) return;
    if (error?.status === 403) message('Akun tidak memiliki izin untuk operasi katalog ini.', 'error');
    else if (error?.status === 404) message('Katalog atau versi tidak ditemukan. Muat ulang data.', 'error');
    else if (error?.status === 409) message('Operasi ditolak karena status atau data telah berubah. Muat ulang sebelum mencoba lagi.', 'error');
    else if (error instanceof TypeError) message(error.message, 'error');
    else message(fallback, 'error');
  }

  async function loadCatalogs(preferredId = state.catalogId, preferredVersionId = state.versionId) {
    if (!mayRead() || state.busy) return;
    const gen = ++state.generation;
    state.catalogs = null; state.versions = null;
    state.version = null; state.controls = null;
    message('');
    render();
    try {
      const catalogs = parseCatalogs(await api('/catalogs'));
      if (gen !== state.generation || !mayRead()) return;
      state.catalogs = catalogs;
      const id = catalogs.some(c => c.id === preferredId) ? preferredId : catalogs[0]?.id;
      if (id) await selectCatalog(id, preferredVersionId);
      else {
        state.catalogId = null; state.versionId = null; state.versions = [];
        render();
      }
    } catch (error) {
      if (gen !== state.generation) return;
      state.catalogs = null; state.catalogId = null;
      state.versions = null; state.versionId = null;
      render(); handleFailure(error, 'Katalog gagal dimuat. Periksa koneksi dan muat ulang.');
    }
  }

  async function selectCatalog(id, preferredVersionId = null) {
    if (!mayRead() || state.busy || !isCatalogId(id) || !state.catalogs?.some(c => c.id === id)) return;
    const gen = ++state.generation;
    state.catalogId = id; state.versionId = null;
    state.versions = null; state.version = null; state.controls = null;
    message('');
    render();
    try {
      const versions = parseVersions(await api('/catalogs/' + encodeURIComponent(id) + '/versions'));
      if (gen !== state.generation || !mayRead()) return;
      state.versions = versions;
      render();
      const versionId = versions.some(v => v.id === preferredVersionId) ? preferredVersionId : versions[0]?.id;
      if (versionId) await selectVersion(versionId);
    } catch (error) {
      if (gen !== state.generation) return;
      state.versions = null; state.versionId = null; state.version = null;
      render(); handleFailure(error, 'Daftar versi gagal dimuat.');
    }
  }

  async function selectVersion(id) {
    if (!mayRead() || state.busy || !isCatalogId(id) || !state.versions?.some(v => v.id === id)) return;
    const gen = ++state.generation;
    state.versionId = id; state.version = null; state.controls = null;
    message('');
    render();
    try {
      const response = await api('/catalog-versions/' + encodeURIComponent(id) + '/controls');
      if (gen !== state.generation || !mayRead()) return;
      state.controls = parseControls(response, id);
      state.version = response.version;
      const version = state.versions.find(v => v.id === id);
      if (version) version.status = response.version.status;
      render();
    } catch (error) {
      if (gen !== state.generation) return;
      state.controls = null; state.version = null;
      render(); handleFailure(error, 'Daftar kontrol gagal dimuat.');
    }
  }

  async function performWrite(action, reload, success) {
    if (!mayWrite() || state.busy) return;
    state.busy = true;
    renderActions();
    try {
      const result = await action();
      state.busy = false;
      await reload(result);
      if (mayRead()) message(success, 'success');
    } catch (error) {
      handleFailure(error, 'Permintaan tidak dapat disimpan. Coba muat ulang terlebih dahulu.');
    } finally {
      state.busy = false;
      render();
    }
  }

  $('catalog-list').addEventListener('click', event => {
    const item = event.target.closest?.('[data-catalog-id]');
    if (item && $('catalog-list').contains(item) && !state.busy)
      void selectCatalog(item.dataset.catalogId);
  });
  $('catalog-versions').addEventListener('click', event => {
    const item = event.target.closest?.('[data-version-id]');
    if (item && $('catalog-versions').contains(item) && !state.busy)
      void selectVersion(item.dataset.versionId);
  });
  $('catalog-refresh').addEventListener('click', () => void loadCatalogs());
  $('catalog-new-toggle').addEventListener('click', () => {
    if (!mayWrite()) return;
    const panel = $('catalog-new-panel');
    panel.dataset.expanded = String(panel.dataset.expanded !== 'true');
    renderActions();
    if (!panel.hidden) $('catalog-create-code').focus();
  });
  $('catalog-create-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!mayWrite()) return;
    let data;
    try {
      data = validateCatalogDraft({
        code: $('catalog-create-code').value, title: $('catalog-create-title').value,
      });
    } catch (error) { message(error.message, 'error'); return; }
    void performWrite(() => api('/catalogs', { method:'POST', body:data }),
      async result => {
        $('catalog-create-form').reset();
        $('catalog-new-panel').dataset.expanded = 'false';
        await loadCatalogs(result?.id, result?.currentVersion?.id);
      }, 'Katalog berhasil dibuat.');
  });
  $('catalog-add-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!state.version || !Array.isArray(state.controls)
      || !canAddControl(getPermissions(), state.version, state.controls.length)) return;
    let data;
    try {
      data = validateControlDraft({
        code: $('catalog-control-code').value,
        title: $('catalog-control-title').value,
        description: $('catalog-control-description').value,
        sourceDocument: $('catalog-source-document').value,
        sourceSection: $('catalog-source-section').value,
      });
    } catch (error) { message(error.message, 'error'); return; }
    const id = state.versionId;
    void performWrite(() => api('/catalog-versions/' + encodeURIComponent(id) + '/controls',
      { method:'POST', body:data }), async () => {
        $('catalog-add-form').reset();
        await selectVersion(id);
      }, 'Kontrol ditambahkan ke versi Draft.');
  });
  $('catalog-publish').addEventListener('click', () => {
    if (!state.version || !Array.isArray(state.controls)
      || !canPublish(getPermissions(), state.version, state.controls.length)) return;
    if (!window.confirm('Terbitkan versi ini? Setelah terbit, semua kontrol pada versi ini tidak dapat diubah.')) return;
    const id = state.versionId, catalogId = state.catalogId;
    void performWrite(() => api('/catalog-versions/' + encodeURIComponent(id) + '/publish',
      { method:'POST' }), async () => selectCatalog(catalogId, id), 'Versi katalog berhasil diterbitkan.');
  });
  $('catalog-next-version').addEventListener('click', () => {
    if (!canCreateNextVersion(getPermissions(), state.versions) || !state.catalogId) return;
    if (!window.confirm('Buat versi Draft baru dengan menyalin seluruh kontrol dari versi terbit terbaru?')) return;
    const id = state.catalogId;
    void performWrite(() => api('/catalogs/' + encodeURIComponent(id) + '/versions',
      { method:'POST' }), async result => selectCatalog(id, result?.id),
    'Versi Draft baru dibuat dari versi terbit.');
  });

  return {
    load: loadCatalogs,
    clear,
    sync() {
      const canRead = mayRead();
      $('catalog-menu').hidden = !canRead;
      if (!canRead) { clear(); return; }
      renderActions();
    },
  };
}
