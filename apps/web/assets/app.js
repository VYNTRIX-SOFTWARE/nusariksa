import {
  ApiError, requestJson, getSession, getPermissions, signIn, signOut,
} from './session.js';

const $ = (id) => document.getElementById(id);
const screens = {
  loading: $('loading-screen'), login: $('login-screen'), app: $('app-screen'),
};
const state = {
  userId: null, permissions: [], assessments: [], page: 'overview',
};
const names = {
  overview: 'Ikhtisar', assessments: 'Asesmen TI',
  catalogs: 'Katalog Kontrol', reports: 'Laporan',
};
const statuses = {
  draft: 'Draft', in_progress: 'Dikerjakan', submitted: 'Menunggu review',
  changes_requested: 'Perlu perbaikan', approved: 'Disetujui',
};

function show(screen) {
  for (const [name, element] of Object.entries(screens)) element.hidden = name !== screen;
}

function notice(message) {
  const box = $('app-notice');
  box.textContent = message || '';
  box.hidden = !message;
}

function showLoginError(message) {
  const box = $('login-error');
  box.textContent = message || '';
  box.hidden = !message;
}

function cleanSession() {
  state.userId = null;
  state.permissions = [];
  state.assessments = [];
  $('login-password').value = '';
  notice('');
}

function authFailure(error) {
  if (error instanceof ApiError && error.status === 401) {
    cleanSession();
    show('login');
    showLoginError('Sesi telah berakhir. Silakan masuk kembali.');
    return true;
  }
  return false;
}

function formatDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '—';
  const [year, month, day] = value.split('-');
  return [day, month, year].join('/');
}

function makeText(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function statusChip(status) {
  const chip = makeText('span', 'status-chip', statuses[status] ?? 'Tidak diketahui');
  chip.dataset.status = status;
  return chip;
}

function renderPermissions() {
  const root = $('permission-list');
  root.replaceChildren();
  if (state.permissions.length === 0) {
    root.append(makeText('span', 'muted', 'Belum ada izin yang diberikan.'));
    return;
  }
  for (const permission of state.permissions) {
    root.append(makeText('span', 'permission-tag', permission.replace(':', ' · ')));
  }
}

function renderAssessments() {
  const list = state.assessments;
  $('metric-total').textContent = String(list.length);
  $('metric-review').textContent = String(list.filter((a) => a.status === 'submitted').length);
  $('metric-approved').textContent = String(list.filter((a) => a.status === 'approved').length);

  const recent = $('recent-assessments');
  recent.replaceChildren();
  if (list.length === 0) {
    recent.append(makeText('p', 'empty-note', 'Belum ada asesmen yang dapat ditampilkan.'));
  }
  for (const assessment of list.slice(0, 5)) {
    const row = makeText('div', 'assessment-row', '');
    const details = document.createElement('div');
    details.append(
      makeText('strong', '', assessment.title ?? 'Tanpa judul'),
      makeText('small', '', [formatDate(assessment.period_start),
        formatDate(assessment.period_end)].join(' – ')),
    );
    row.append(details, statusChip(assessment.status));
    recent.append(row);
  }

  const table = $('assessments-table');
  table.replaceChildren();
  if (list.length === 0) {
    const row = document.createElement('tr');
    const cell = makeText('td', 'table-empty', 'Belum ada asesmen untuk ditampilkan.');
    cell.colSpan = 3;
    row.append(cell);
    table.append(row);
  }
  for (const assessment of list) {
    const row = document.createElement('tr');
    row.append(
      makeText('td', '', assessment.title ?? 'Tanpa judul'),
      makeText('td', '', [formatDate(assessment.period_start),
        formatDate(assessment.period_end)].join(' – ')),
    );
    const cell = document.createElement('td');
    cell.append(statusChip(assessment.status));
    row.append(cell);
    table.append(row);
  }
}

function navigate(page) {
  if (!(page in names)) return;
  state.page = page;
  for (const element of document.querySelectorAll('.page')) {
    element.hidden = element.id !== 'page-' + page;
  }
  for (const button of document.querySelectorAll('[data-page]')) {
    const active = button.dataset.page === page;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  $('topbar-page').textContent = names[page];
  notice('');
}

async function loadWorkspace() {
  try {
    const permissions = await getPermissions();
    state.permissions = Array.isArray(permissions.permissions) ? permissions.permissions : [];
    renderPermissions();

    if (state.permissions.includes('assessments:read')) {
      const result = await requestJson('/assessments');
      state.assessments = Array.isArray(result.assessments) ? result.assessments : [];
      renderAssessments();
    } else {
      state.assessments = [];
      renderAssessments();
      notice('Akun Anda belum memiliki izin membaca asesmen. Hubungi administrator lembaga.');
    }
  } catch (error) {
    if (!authFailure(error)) {
      state.assessments = [];
      renderAssessments();
      notice('Data ruang kerja belum dapat dimuat. Periksa koneksi atau coba masuk kembali.');
    }
  }
}

async function enterApp(userId) {
  state.userId = userId;
  $('user-label').textContent = 'Pengguna ' + userId.slice(0, 8);
  showLoginError('');
  show('app');
  navigate('overview');
  await loadWorkspace();
}

async function restoreSession() {
  try {
    const session = await getSession();
    if (!session?.authenticated || typeof session.userId !== 'string') {
      show('login');
      return;
    }
    await enterApp(session.userId);
  } catch (error) {
    show('login');
    if (!(error instanceof ApiError && error.status === 401)) {
      showLoginError('Tidak dapat memeriksa sesi. Periksa koneksi server.');
    }
  }
}

$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  showLoginError('');
  const submit = $('login-submit');
  const email = $('login-email').value.trim();
  const password = $('login-password').value;
  if (!email || !password) return;
  submit.disabled = true;
  submit.firstChild.textContent = 'Memeriksa akun ';
  try {
    const session = await signIn(email, password);
    $('login-password').value = '';
    await enterApp(session.userId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      showLoginError('Email atau kata sandi tidak sesuai.');
    } else if (error instanceof ApiError && error.status === 429) {
      showLoginError('Terlalu banyak percobaan. Coba lagi beberapa saat.');
    } else {
      showLoginError('Masuk gagal. Pastikan server dan koneksi tersedia.');
    }
  } finally {
    submit.disabled = false;
    submit.firstChild.textContent = 'Masuk ';
  }
});

$('logout-button').addEventListener('click', async () => {
  const button = $('logout-button');
  button.disabled = true;
  try {
    await signOut();
    cleanSession();
    show('login');
    $('login-email').focus();
  } catch (error) {
    if (!authFailure(error)) notice('Gagal mengakhiri sesi. Coba lagi.');
  } finally {
    button.disabled = false;
  }
});

for (const button of document.querySelectorAll('[data-page]')) {
  button.addEventListener('click', () => navigate(button.dataset.page));
}
for (const button of document.querySelectorAll('[data-open-page]')) {
  button.addEventListener('click', () => navigate(button.dataset.openPage));
}

void restoreSession();
