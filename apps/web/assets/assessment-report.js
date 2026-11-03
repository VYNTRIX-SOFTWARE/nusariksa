import {
  canReadReport, canListReportAssessments, reportAssessmentOptions,
  reportRatingCounts, filteredReportControls, validateAssessmentReport,
  REPORT_RATINGS, REPORT_STATUS_LABELS,
} from './assessment-report-model.js';

const $ = id => document.getElementById(id);
const el = (tag, className, value) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value != null) node.textContent = String(value);
  return node;
};
const safe = value => value == null || value === '' ? '—' : String(value);
const displayDate = value => {
  if (!value || typeof value !== 'string') return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' :
    date.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
};
const status = code => REPORT_STATUS_LABELS[code] ?? 'Status tidak dikenal';
const rating = code => REPORT_RATINGS.find(item => item.value === code)?.label ?? 'Tidak diketahui';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function pair(label, value) {
  const div = el('div', 'report-meta-item');
  div.append(el('dt', '', label), el('dd', '', safe(value)));
  return div;
}

function renderControls(report, filter) {
  const root = $('report-controls-body');
  root.replaceChildren();
  const controls = filteredReportControls(report, filter);
  $('report-control-count').textContent = controls.length + ' dari ' + report.controls.length + ' kontrol';
  if (!controls.length) {
    const tr = el('tr'), td = el('td', 'table-empty', 'Tidak ada kontrol pada filter ini.');
    td.colSpan = 4;
    tr.append(td); root.append(tr);
    return;
  }
  for (const control of controls) {
    const tr = el('tr');
    const name = el('td');
    name.append(el('strong', 'report-control-code', control.control_code),
      el('div', 'report-control-name', control.title));
    if (control.description) name.append(el('p', 'report-control-extra', control.description));
    const source = [control.source_document, control.source_section].filter(Boolean).join(' · ');
    if (source) name.append(el('p', 'report-control-extra', 'Referensi katalog: ' + source));
    const result = el('td');
    const chip = el('span', 'status-chip', rating(control.rating));
    chip.dataset.rating = control.rating;
    result.append(chip);
    const note = el('td', 'report-note', safe(control.note));
    const rev = el('td', 'table-date', Number.isSafeInteger(control.revision)
      ? String(control.revision) : '—');
    tr.append(name, result, note, rev); root.append(tr);
  }
}

function renderReport(report) {
  $('report-title').textContent = report.assessment.title;
  $('report-state').textContent = report.final ? 'Final Internal' : 'Pratinjau Internal';
  $('report-state').dataset.final = String(report.final);
  $('report-disclaimer').textContent = safe(report.note);
  const meta = $('report-metadata');
  meta.replaceChildren(pair('Institusi', report.institution.name),
    pair('Jenis lembaga', report.institution.kind),
    pair('Periode', safe(report.assessment.periodStart) + ' – ' + safe(report.assessment.periodEnd)),
    pair('Status asesmen', status(report.assessment.status)),
    pair('Dibuat pada', displayDate(report.generatedAt)),
    pair('Katalog', report.catalog ? safe(report.catalog.title) : 'Belum terpasang'),
    pair('Versi katalog', report.catalog ? String(report.catalog.version) : '—'),
    pair('Siklus pengajuan', report.assessment.submissionCycle));
  const summary = report.summary;
  $('report-total').textContent = String(summary.total);
  $('report-assessed').textContent = String(summary.assessed);
  $('report-unassessed').textContent = String(summary.notAssessed);
  $('report-progress').textContent = summary.completionPercent + '%';
  $('report-progress-bar').value = summary.completionPercent;
  $('report-progress-bar').setAttribute('aria-valuetext', summary.completionPercent + '% kontrol telah dinilai');

  const bars = $('report-distribution');
  bars.replaceChildren();
  for (const item of reportRatingCounts(report)) {
    const group = el('div', 'report-bar-row');
    const head = el('div', 'report-bar-head');
    head.append(el('span', '', item.label), el('strong', '', String(item.count)));
    const track = el('div', 'report-bar-track');
    const bar = el('div', 'report-bar');
    bar.dataset.rating = item.value;
    bar.style.width = (summary.total ? item.count / summary.total * 100 : 0) + '%';
    track.append(bar);
    group.append(head, track); bars.append(group);
  }

  const decision = $('report-decision');
  decision.replaceChildren();
  const last = report.latestReviewDecision;
  if (!last) {
    decision.append(el('p', 'empty-note', 'Belum ada keputusan pemeriksa yang tercatat.'));
  } else {
    const action = { APPROVED: 'Disetujui', CHANGES_REQUESTED: 'Dikembalikan untuk perbaikan' };
    const dl = el('dl', 'report-meta-grid');
    dl.append(pair('Keputusan terakhir', action[last.action] ?? 'Tidak dikenal'),
      pair('Siklus', last.submission_cycle),
      pair('Waktu', displayDate(last.occurred_at)),
      pair('ID aktor (teknis)', last.actor_user_id),
      pair('Catatan pemeriksa', last.note));
    decision.append(dl);
  }
  $('report-filter').value = 'all';
  renderControls(report, 'all');
}

export function createReporting({ api, getPermissions, getAssessments, onAuthFailure }) {
  let generation = 0;
  let currentReport = null;
  const message = (text, kind = 'info') => {
    $('report-message').hidden = false;
    $('report-message').textContent = text;
    $('report-message').dataset.kind = kind;
  };
  const showState = (which) => {
    $('report-empty').hidden = which !== 'empty';
    $('report-loading').hidden = which !== 'loading';
    $('report-content').hidden = which !== 'ready';
  };
  const options = () => {
    const permissions = getPermissions();
    const available = reportAssessmentOptions(getAssessments(), permissions);
    const select = $('report-select');
    const selected = select.value;
    select.replaceChildren();
    const placeholder = el('option', '', 'Pilih asesmen'); placeholder.value = '';
    select.append(placeholder);
    for (const item of available) {
      const opt = el('option', '', item.title); opt.value = item.id;
      select.append(opt);
    }
    select.value = available.some(item => item.id === selected) ? selected : '';
    $('report-select-area').hidden = !canListReportAssessments(permissions);
    $('report-manual-area').hidden = canListReportAssessments(permissions);
    $('report-scope').textContent = canListReportAssessments(permissions)
      ? 'Pilihan berasal dari maksimal 50 asesmen terbaru yang dikembalikan API; bukan seluruh database.'
      : 'Akun memiliki reports:read tetapi tidak assessments:read. Masukkan ID asesmen yang sah untuk membuka laporan.';
  };
  const clear = () => {
    generation += 1;
    currentReport = null;
    showState('empty');
    $('report-message').hidden = true;
  };
  const open = async id => {
    if (!canReadReport(getPermissions())) return;
    if (typeof id !== 'string' || !uuid.test(id)) {
      message('Masukkan ID asesmen yang valid.', 'error'); return;
    }
    const requestId = ++generation;
    currentReport = null;
    $('report-message').hidden = true;
    showState('loading');
    try {
      const result = await api('/assessments/' + encodeURIComponent(id) + '/report');
      if (requestId !== generation || !canReadReport(getPermissions())) return;
      currentReport = validateAssessmentReport(result, id);
      renderReport(currentReport);
      showState('ready');
    } catch (error) {
      if (requestId !== generation) return;
      if (onAuthFailure(error)) { clear(); return; }
      showState('empty');
      const status = error?.status;
      if (status === 403) message('Tidak memiliki izin membaca laporan ini.', 'error');
      else if (status === 404) message('Laporan asesmen tidak ditemukan.', 'error');
      else if (error instanceof TypeError) message('Respons laporan tidak valid. Periksa data server.', 'error');
      else message('Laporan gagal dimuat. Periksa koneksi dan coba kembali.', 'error');
    }
  };
  $('report-open').addEventListener('click', () => void open($('report-select').value));
  $('report-manual-form').addEventListener('submit', event => {
    event.preventDefault();
    void open($('report-manual-id').value.trim());
  });
  $('report-filter').addEventListener('change', () => {
    if (currentReport) renderControls(currentReport, $('report-filter').value);
  });
  return { sync() {
    const canRead = canReadReport(getPermissions());
    $('report-menu').hidden = !canRead;
    $('report-menu-group').hidden = !canRead;
    if (!canRead) { clear(); return; }
    options();
  }, clear, open };
}
