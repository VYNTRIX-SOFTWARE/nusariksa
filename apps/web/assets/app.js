import {
  ApiError, requestJson, getSession, getPermissions, signIn, signOut, changePassword,
  getMfaStatus,setupMfa,confirmMfa,verifyMfaLogin,
} from './session.js';
import {
  STATUS_LABELS, validAssessments, yearsForAssessments,
  summarizeAssessments, filterAssessments, attentionAssessments, ownWork,
} from './assessment-model.js';
import { createWorkspace } from './assessment-workspace.js';
import { pendingReviewQueue } from './assessment-review-model.js';
import { createReporting } from './assessment-report.js';
import { createControlCatalogManagement } from './control-catalog.js';
import { createMaturityManagement } from './maturity-ui.js';
import { createMaturityAssessmentUI } from './maturity-assessment-ui.js';
import {createPadkPreparationUI} from './padk-preparation-ui.js';
import {createAdminOnboardingUI} from './admin-onboarding-ui.js';
import {createAssetRegisterUI} from './ti-assets-ui.js';
import {createRiskRegisterUI} from './ti-risks-ui.js';
import {createIncidentManagementUI} from './ti-incidents-ui.js';
import {createFindingManagementUI} from './ti-findings-ui.js';
import {createVendorManagementUI} from './ti-vendors-ui.js';
import {createCrosswalkReviewUI} from './padk-crosswalk-review-ui.js';

const $ = (id) => document.getElementById(id);
const screens = {
  loading: $('loading-screen'), login: $('login-screen'), app: $('app-screen'),
};
const state = {
  userId: null, permissions: [], assessments: [], load: 'loading', page: 'overview',
  year: 'all', status: 'all', search: '', sort: 'newest', workspaceOrigin:'assessments',
};
const pages = {overview: 'Dashboard', assessments: 'Daftar Asesmen', reviews: 'Review & Persetujuan', reports: 'Laporan Asesmen', catalogs: 'Katalog Kontrol', maturity: 'Metodologi Maturitas', 'maturity-assessments': 'Penilaian Maturitas', 'padk-preparations':'Persiapan PADK', 'padk-crosswalk':'QA Pemetaan PADK', 'admin-onboarding':'Akses Pengguna', 'ti-assets':'Inventaris Aset TI', 'ti-risks':'Register Risiko TI', 'ti-incidents':'Insiden TI/Siber', 'ti-findings':'Tindak Lanjut Temuan', 'ti-vendors':'Vendor TI', workspace: 'Assessment Workspace'};

function show(screen) {
  for (const [name, element] of Object.entries(screens)) element.hidden = name !== screen;
}
function notice(message) {
  const element = $('app-notice');
  element.textContent = message ?? '';
  element.hidden = !message;
}
function loginError(message) {
  $('login-error').textContent = message ?? '';
  $('login-error').hidden = !message;
}
let pendingMfaChallenge=null;
function resetMfaLogin(){
  resetActivation();
  pendingMfaChallenge=null;
  $('mfa-login-form').hidden=true;
  $('login-form').hidden=false;
  $('mfa-login-form').reset();
  $('mfa-login-error').hidden=true;
  $('mfa-login-error').textContent='';
}
function cleanSession() {
  resetMfaLogin();
  $('mfa-dialog').close?.();
  state.userId = null;
  state.permissions = [];
  state.assessments = [];
  state.load = 'loading';
  state.year = 'all';
  state.status = 'all';
  state.search = '';
  state.sort = 'newest';
  $('login-password').value = '';
  $('change-password-form').reset();
  $('change-password-dialog').close?.();
  $('detail-dialog').close?.();
  $('assessment-create-dialog').close?.();
  state.page='overview';
  workspace.close();
  reporting.clear();
  catalogs.clear();
  maturity.clear();
  maturityAssessments.clear();
  padkPreparations.clear();
  padkCrosswalk.clear();
  adminOnboarding.clear();
  assetRegister.clear();
  riskRegister.clear();
  incidentManagement.clear();
  findingManagement.clear();
  vendorManagement.clear();
  notice('');
}
function authFailure(error) {
  if (error instanceof ApiError && error.status === 401) {
    cleanSession();
    show('login');
    loginError('Sesi berakhir. Silakan masuk kembali.');
    return true;
  }
  return false;
}
function formatDate(value) {
  if(typeof value !== 'string')return '—';
  if(/^\d{4}-\d\d-\d\d$/.test(value))return value.slice(8,10)+'/'+value.slice(5,7)+'/'+value.slice(0,4);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('id-ID', {day:'2-digit',month:'short',year:'numeric'});
}
function textElement(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = value == null ? '' : String(value);
  return element;
}
function statusChip(status) {
  const el = textElement('span','status-chip',STATUS_LABELS[status] ?? 'Status tidak dikenal');
  el.dataset.status = status;
  return el;
}
function renderMessage(root,message,className='empty-note') {
  root.replaceChildren(textElement('p',className,message));
}
function detailButton(a, className='row-title') {
  const btn=textElement('button',className,a.title);
  btn.type='button';
  btn.dataset.detailId=a.id;
  btn.setAttribute('aria-label','Lihat detail '+a.title);
  return btn;
}
function assessmentRow(a) {
  const row=textElement('div','assessment-row','');
  const details=document.createElement('div');
  details.append(detailButton(a),textElement('small','',formatDate(a.period_start)+' – '+formatDate(a.period_end)));
  row.append(details,statusChip(a.status));
  return row;
}
function renderPermissions() {
  workspace.syncPermissions();
  reporting.sync();
  catalogs.sync();
  maturity.sync();
  maturityAssessments.sync();
  padkPreparations.sync();
  padkCrosswalk.sync();
  $('padk-crosswalk-menu').hidden=!state.permissions.includes('assessments:approve');
  $('padk-preparations-menu').hidden=!state.permissions.includes('assessments:read');
  $('admin-setup-menu').hidden=!state.permissions.includes('users:manage');
  $('admin-menu-group').hidden=!state.permissions.includes('users:manage');
  $('asset-menu').hidden=!state.permissions.includes('assets:read');
  $('risk-menu').hidden=!state.permissions.includes('risks:read');
  $('incident-menu').hidden=!state.permissions.includes('incidents:read');
  $('finding-menu').hidden=!state.permissions.includes('findings:read');
  $('vendor-menu').hidden=!state.permissions.includes('vendors:read');
  assetRegister.sync();riskRegister.sync();incidentManagement.sync();
  findingManagement.sync();vendorManagement.sync();
  renderGettingStarted();
  const hasRead=state.permissions.includes('assessments:read');
  $('assessment-menu').hidden=!hasRead;
  $('assessment-menu-group').hidden=!hasRead;
  const canReview=hasRead && state.permissions.includes('assessments:approve');
  $('review-menu').hidden=!canReview;
  $('review-menu-group').hidden=!canReview;
  $('dashboard-access').hidden=state.load!=='forbidden';
  $('dashboard-content').hidden=state.load==='forbidden';
  if (!hasRead && ['assessments','workspace','catalogs','maturity','maturity-assessments','padk-preparations'].includes(state.page)) navigate('overview');
  if (!canReview && ['reviews','padk-crosswalk'].includes(state.page)) navigate('overview');
  if (!state.permissions.includes('reports:read') && state.page==='reports') navigate('overview');
}
function renderGettingStarted(){
  const canAdmin=state.permissions.includes('users:manage');
  const canWrite=state.permissions.includes('assessments:write');
  const canReview=state.permissions.includes('assessments:approve');
  const panel=$('first-run-card');
  panel.hidden=!(canAdmin||canWrite||canReview);
  const headline=$('first-run-title'),desc=$('first-run-desc'),action=$('first-run-action');
  if(canAdmin){
    headline.textContent='Siapkan akses petugas pertama';
    desc.textContent='Akun administrator perlu mengundang petugas, petugas mengaktifkan akun, lalu administrator memberikan peran pengisi atau pemeriksa.';
    action.textContent='Kelola akses pengguna';
    action.dataset.destination='admin-onboarding';
  }else if(canWrite){
    headline.textContent='Buat penilaian PADK pertama';
    desc.textContent='Mulai dengan kategori dan periode, lalu isi peringkat sementara, justifikasi, serta bukti tiap indikator. Hasilnya masih draft internal.';
    action.textContent='Mulai penilaian';
    action.dataset.destination='padk-preparations';
  }else if(canReview){
    headline.textContent='Periksa draft yang masuk';
    desc.textContent='Buka antrean draft PADK dari maker lain dan periksa kelengkapannya sebelum mengembalikan atau menerima draft internal.';
    action.textContent='Buka antrean pemeriksaan';
    action.dataset.destination='padk-preparations';
  }
}
function renderMetrics() {
  const loading = state.load!=='ready';
  const {total,counts}=summarizeAssessments(state.assessments,state.year);
  const metrics = {
    'metric-total':total,'metric-review':counts.submitted,
    'metric-changes':counts.changes_requested,'metric-approved':counts.approved,
  };
  for (const [id,count] of Object.entries(metrics)) {
    const item=$(id);
    item.textContent=loading?'—':String(count);
    item.classList.toggle('skeleton-text',state.load==='loading');
  }
  for (const button of document.querySelectorAll('[data-metric]')) button.disabled=loading;
}
function renderAttention() {
  const root=$('attention-list'), mine=$('my-work-list');
  if(state.load==='loading') {
    renderMessage(root,'Memuat asesmen…');renderMessage(mine,'Memuat pekerjaan…');
    return;
  }
  if(state.load==='error') {
    renderMessage(root,'Data gagal dimuat. Gunakan tombol Muat ulang.');renderMessage(mine,'Data belum tersedia.');
    return;
  }
  if(state.load!=='ready') {
    renderMessage(root,'Anda belum memiliki akses membaca asesmen.');
    renderMessage(mine,'Tidak dapat menampilkan pekerjaan pribadi.');
    return;
  }
  const attention=attentionAssessments(state.assessments,state.year);
  root.replaceChildren();
  if(attention.length===0)renderMessage(root,'Tidak ada asesmen berstatus dikerjakan, menunggu review, atau perlu perbaikan pada filter tahun ini.');
  for(const item of attention)root.append(assessmentRow(item));
  const items=ownWork(state.assessments,state.userId,state.year);
  mine.replaceChildren();
  if(items.length===0)renderMessage(mine,'Tidak ada asesmen milik Anda yang memerlukan pengerjaan pada data yang dimuat.');
  for(const item of items)mine.append(assessmentRow(item));
}
function renderTable() {
  const root=$('assessments-table');
  root.replaceChildren();
  if(state.load!=='ready') {
    const message=state.load==='loading'?'Memuat data asesmen…'
      :state.load==='forbidden'?'Anda tidak memiliki izin melihat asesmen.':'Gagal memuat data. Muat ulang melalui Dashboard.';
    const tr=document.createElement('tr');
    const td=textElement('td','table-empty',message);td.colSpan=5;tr.append(td);root.append(tr);
    $('filtered-count').textContent='—';return;
  }
  const filtered=filterAssessments(state.assessments,{
    year:state.year,status:state.status,search:state.search,sort:state.sort,
  });
  $('filtered-count').textContent=filtered.length+' dari '+state.assessments.length+' data dimuat';
  if(filtered.length===0) {
    const tr=document.createElement('tr');
    const td=textElement('td','table-empty',
      state.assessments.length===0?'Belum ada asesmen yang tercatat di daftar ini.':'Tidak ditemukan asesmen sesuai filter. Ubah pencarian atau pilih Reset.');
    td.colSpan=5;tr.append(td);root.append(tr);return;
  }
  for(const a of filtered) {
    const tr=document.createElement('tr');
    const tdTitle=document.createElement('td');tdTitle.append(detailButton(a,'table-title'));
    const tdStatus=document.createElement('td');tdStatus.append(statusChip(a.status));
    const tdAction=document.createElement('td');
    const btn=textElement('button','detail-link','Buka workspace');btn.type='button';btn.dataset.workspaceId=a.id;
    btn.setAttribute('aria-label','Buka workspace '+a.title);tdAction.append(btn);
    tr.append(tdTitle,textElement('td','table-date',formatDate(a.period_start)+' – '+formatDate(a.period_end)),
      tdStatus,textElement('td','table-date',formatDate(a.created_at)),tdAction);
    root.append(tr);
  }
}

function renderReviewQueue(){
  const root=$('review-queue-table');
  root.replaceChildren();
  if(state.load!=='ready'){
    const message=state.load==='loading'?'Memuat antrean…'
      :state.load==='forbidden'?'Anda tidak memiliki izin membaca asesmen.':'Antrean belum dapat dimuat. Gunakan Muat ulang.';
    const tr=document.createElement('tr'),td=textElement('td','table-empty',message);
    td.colSpan=4;tr.append(td);root.append(tr);
    $('review-queue-count').textContent='—';
    return;
  }
  const queue=pendingReviewQueue(state.assessments,state.userId,state.permissions);
  $('review-queue-count').textContent=queue.length+' dalam 50 terbaru (maks.)';
  if(queue.length===0){
    const tr=document.createElement('tr');
    const td=textElement('td','table-empty',
      'Tidak ada asesmen yang menunggu review oleh akun Anda pada data yang dimuat.');
    td.colSpan=4;tr.append(td);root.append(tr);
  }
  for(const a of queue){
    const tr=document.createElement('tr');
    const title=textElement('td','',a.title);
    const period=textElement('td','table-date',
      formatDate(a.period_start)+' – '+formatDate(a.period_end));
    const status=document.createElement('td');status.append(statusChip(a.status));
    const action=document.createElement('td');
    const button=textElement('button','detail-link','Buka pemeriksaan');
    button.type='button';button.dataset.reviewId=a.id;
    button.setAttribute('aria-label','Periksa asesmen '+a.title);
    action.append(button);
    tr.append(title,period,status,action);
    root.append(tr);
  }
}

function render() {
  renderPermissions();renderMetrics();renderAttention();renderTable();renderReviewQueue();
}
function populateYears() {
  const picker=$('period-select');
  const keep=state.year;
  picker.replaceChildren();
  const all=document.createElement('option');all.value='all';all.textContent='Semua';picker.append(all);
  for(const y of yearsForAssessments(state.assessments)) {
    const option=document.createElement('option');option.value=y;option.textContent=y;picker.append(option);
  }
  state.year=[...picker.options].some(o=>o.value===keep)?keep:'all';
  picker.value=state.year;
}
function closeMobile() {
  $('app-screen').querySelector('.app-content').inert=false;
  $('sidebar').classList.remove('is-mobile-open');
  $('sidebar-backdrop').hidden=true;
  $('mobile-nav-toggle').setAttribute('aria-expanded','false');
}
function navigate(page) {
  if (!(page in pages)) return false;
  if(['assessments','workspace','reviews','catalogs','maturity','maturity-assessments','padk-preparations'].includes(page)&&!state.permissions.includes('assessments:read'))return false;
  if(page==='reports'&&!state.permissions.includes('reports:read'))return false;
  if(page==='admin-onboarding'&&!state.permissions.includes('users:manage'))return false;
  if(page==='ti-assets'&&!state.permissions.includes('assets:read'))return false;
  if(page==='ti-risks'&&!state.permissions.includes('risks:read'))return false;
  if(page==='ti-incidents'&&!state.permissions.includes('incidents:read'))return false;
  if(page==='ti-findings'&&!state.permissions.includes('findings:read'))return false;
  if(page==='ti-vendors'&&!state.permissions.includes('vendors:read'))return false;
  if(['reviews','padk-crosswalk'].includes(page)&&!state.permissions.includes('assessments:approve'))return false;
  if(state.page==='workspace' && page!=='workspace' && !workspace.confirmLeave())return false;
  if(state.page==='maturity' && page!=='maturity' && !maturity.confirmLeave())return false;
  if(state.page==='maturity-assessments' && page!=='maturity-assessments' && !maturityAssessments.confirmLeave())return false;
  if(state.page==='padk-preparations' && page!=='padk-preparations' && !padkPreparations.confirmLeave())return false;
  if(state.page==='padk-crosswalk' && page!=='padk-crosswalk' && !padkCrosswalk.confirmLeave())return false;
  if(state.page==='workspace' && page!=='workspace')workspace.close();
  if(state.page==='admin-onboarding'&&page!=='admin-onboarding')adminOnboarding.conceal();
  state.page=page;
  for(const section of document.querySelectorAll('.page'))section.hidden=section.id!=='page-'+page;
  for(const btn of document.querySelectorAll('[data-page]')) {
    const isActive=btn.dataset.page===page || (page==='workspace' && btn.dataset.page===state.workspaceOrigin);
    btn.classList.toggle('is-active',isActive);
    if(isActive)btn.setAttribute('aria-current','page');
    else btn.removeAttribute('aria-current');
  }
  $('topbar-page').textContent=pages[page];
  notice('');closeMobile();
  if(page==='ti-assets')void assetRegister.load();
  if(page==='ti-risks')void riskRegister.load();
  if(page==='ti-incidents')void incidentManagement.load();
  if(page==='ti-findings')void findingManagement.load();
  if(page==='ti-vendors')void vendorManagement.load();
  if(page==='catalogs') void catalogs.load();
  if(page==='maturity') void maturity.load();
  if(page==='maturity-assessments') void maturityAssessments.load();
  if(page==='padk-preparations') void padkPreparations.load();
  if(page==='admin-onboarding')void adminOnboarding.load();
  if(page==='padk-crosswalk') void padkCrosswalk.load();
  return true;
}
async function loadWorkspace() {
  state.load='loading';state.assessments=[];render();
  try {
    const result=await getPermissions();
    state.permissions=Array.isArray(result.permissions)?result.permissions:[];
    if (!state.permissions.includes('assessments:read')) {
      state.load='forbidden';populateYears();render();return;
    }
    const data=await requestJson('/assessments');
    state.assessments=validAssessments(data.assessments);
    state.load='ready';
    populateYears();render();
  }catch(error) {
    if(authFailure(error))return;
    if(error instanceof ApiError && error.status===403) {
      state.load='forbidden';state.assessments=[];state.permissions=state.permissions.filter(p=>p!=='assessments:read');
    } else {
      state.load='error';state.assessments=[];
      notice('Data asesmen tidak dapat dimuat. Periksa koneksi dan pilih Muat ulang.');
    }
    populateYears();render();
  }
}
async function enterApp(userId) {
  state.userId=userId;
  $('user-label').textContent='Akun aktif';
  loginError('');
  show('app');
  navigate('overview');
  await loadWorkspace();
  void getMfaStatus().then(status=>{
    $('mfa-open').disabled=status.enabled;
    $('mfa-open').textContent=status.enabled?'MFA aktif':'Aktifkan MFA';
  }).catch(()=>{
    $('mfa-open').disabled=true;
    $('mfa-open').textContent='Status MFA tidak tersedia';
  });
}
async function restoreSession() {
  resetMfaLogin();
  try {
    const session=await getSession();
    if(!session?.authenticated || typeof session.userId!=='string') {
      show('login');return;
    }
    await enterApp(session.userId);
  } catch(error) {
    show('login');
    if(!(error instanceof ApiError && error.status===401))
      loginError('Pemeriksaan sesi gagal. Periksa koneksi server.');
  }
}

function detailPair(label,value) {
  const dt=textElement('dt','',label),dd=textElement('dd','',value);
  const wrapper=textElement('div','detail-pair','');wrapper.append(dt,dd);return wrapper;
}
async function openDetail(id) {
  if(state.load!=='ready'||!state.permissions.includes('assessments:read'))return;
  const a=state.assessments.find(x=>x.id===id);
  if(!a)return;
  const dlg=$('detail-dialog');const root=$('detail-body');
  $('detail-title').textContent=a.title;
  renderMessage(root,'Memuat detail dari server…');
  dlg.showModal();
  try {
    const [detail,checklist]=await Promise.all([
      requestJson('/assessments/'+encodeURIComponent(id)),
      requestJson('/assessments/'+encodeURIComponent(id)+'/checklist'),
    ]);
    if(!dlg.open)return;
    root.replaceChildren();
    const dl=document.createElement('dl');
    dl.append(detailPair('Judul',detail.title),detailPair('Status',STATUS_LABELS[detail.status]??detail.status),
      detailPair('Periode',formatDate(detail.period_start)+' – '+formatDate(detail.period_end)),
      detailPair('Dibuat',formatDate(detail.created_at)),
      detailPair('Mulai pengerjaan',formatDate(detail.started_at)));
    const v=checklist.catalogVersion;
    if(v) {
      dl.append(detailPair('Katalog',v.catalog_code??'Katalog terpasang'),
        detailPair('Versi katalog',String(v.version)),
        detailPair('Kontrol katalog',String(Array.isArray(checklist.controls)?checklist.controls.length:0)));
    }else dl.append(detailPair('Katalog','Belum terpasang'));
    const openBtn=textElement('button','button button-outline','Buka workspace');
    openBtn.type='button';
    openBtn.addEventListener('click',()=>{
      dlg.close();
      void openWorkspace(detail.id);
    });
    root.append(dl,openBtn,textElement('p','detail-helper',
      'Penilaian bisa dilakukan di workspace sesuai izin dan status asesmen. Bukti dan laporan visual belum tersedia.'));
  }catch(error) {
    if(authFailure(error))return;
    renderMessage(root,error instanceof ApiError&&error.status===403
      ?'Anda tidak memiliki izin membuka detail ini.':'Detail tidak dapat dimuat. Tutup lalu coba lagi.');
  }
}

$('login-form').addEventListener('submit',async(event)=>{
  event.preventDefault();loginError('');
  const submit=$('login-submit'),email=$('login-email').value.trim(),password=$('login-password').value;
  if(!email||!password)return;
  submit.disabled=true;submit.firstChild.textContent='Memeriksa akun ';
  try {
    const result=await signIn(email,password);$('login-password').value='';
    if(result.mfaRequired){
      pendingMfaChallenge=result.challengeToken;
      $('login-form').hidden=true;
      $('mfa-login-form').hidden=false;
      $('mfa-login-code').focus();
      return;
    }
    await enterApp(result.userId);
  }catch(error) {
    if(error instanceof ApiError&&error.status===401)loginError('Email atau kata sandi tidak sesuai.');
    else if(error instanceof ApiError&&error.status===429)loginError('Terlalu banyak percobaan. Coba lagi beberapa saat.');
    else loginError('Masuk gagal. Periksa koneksi dan konfigurasi server.');
  }finally{submit.disabled=false;submit.firstChild.textContent='Masuk ';}
});
$('mfa-login-cancel').addEventListener('click',()=>{
  resetMfaLogin();loginError('');$('login-email').focus();
});
$('mfa-login-form').addEventListener('submit',async event=>{
  event.preventDefault();
  if(!pendingMfaChallenge)return;
  const code=$('mfa-login-code').value.trim();
  const submit=$('mfa-login-submit'),error=$('mfa-login-error');
  submit.disabled=true;error.hidden=true;error.textContent='';
  try{
    const result=await verifyMfaLogin(pendingMfaChallenge,code);
    resetMfaLogin();
    await enterApp(result.userId);
    if(result.recoveryUsed)notice('Recovery code digunakan. Simpan sisa recovery code Anda.');
  }catch(err){
    error.textContent=err instanceof ApiError && err.status===401
      ?'Kode salah, sudah dipakai, atau tantangan login berakhir. Ulangi login bila perlu.'
      :'Verifikasi MFA gagal. Periksa koneksi dan coba lagi.';
    error.hidden=false;
  }finally{submit.disabled=false;}
});
const mfaDialog=$('mfa-dialog');
const mfaError=message=>{
  $('mfa-error').textContent=message??'';
  $('mfa-error').hidden=!message;
};
const clearMfaDialog=()=>{
  $('mfa-setup-form').reset();$('mfa-confirm-form').reset();
  $('mfa-enroll-step').hidden=true;
  $('mfa-recovery-step').hidden=true;
  $('mfa-setup-form').hidden=false;
  $('mfa-setup-secret').textContent='';
  $('mfa-setup-uri').value='';
  $('mfa-recovery-codes').textContent='';
  mfaError('');
};
$('mfa-open').addEventListener('click',()=>{
  clearMfaDialog();mfaDialog.showModal();$('mfa-current-password').focus();
});
$('mfa-close').addEventListener('click',()=>mfaDialog.close());
$('mfa-finish').addEventListener('click',()=>mfaDialog.close());
mfaDialog.addEventListener('close',clearMfaDialog);
$('mfa-setup-form').addEventListener('submit',async event=>{
  event.preventDefault();mfaError('');
  const button=$('mfa-setup-submit');button.disabled=true;
  try{
    const result=await setupMfa($('mfa-current-password').value);
    $('mfa-setup-form').reset();
    $('mfa-setup-form').hidden=true;
    $('mfa-enroll-step').hidden=false;
    $('mfa-setup-secret').textContent=result.secret;
    $('mfa-setup-uri').value=result.otpauthUrl;
    $('mfa-confirm-code').focus();
  }catch(err){
    mfaError(err instanceof ApiError&&err.status===401
      ?'Password lama tidak sesuai.'
      :err instanceof ApiError&&err.status===503
        ?'Kunci MFA server belum dikonfigurasi.'
        :'Tidak dapat memulai pengaturan MFA.');
  }finally{button.disabled=false;}
});
$('mfa-confirm-form').addEventListener('submit',async event=>{
  event.preventDefault();mfaError('');
  const button=$('mfa-confirm-submit');button.disabled=true;
  try{
    const result=await confirmMfa($('mfa-confirm-code').value);
    $('mfa-enroll-step').hidden=true;
    $('mfa-setup-secret').textContent='';
    $('mfa-setup-uri').value='';
    $('mfa-confirm-form').reset();
    $('mfa-recovery-step').hidden=false;
    $('mfa-recovery-codes').textContent=result.recoveryCodes.join('\n');
    $('mfa-open').disabled=true;
    $('mfa-open').textContent='MFA aktif';
  }catch(err){
    mfaError(err instanceof ApiError&&err.status===401
      ?'Kode tidak cocok. Periksa waktu dan kode authenticator.'
      :err instanceof ApiError&&err.status===409
        ?'Pengaturan MFA berakhir. Tutup dialog dan mulai ulang.'
        :'Tidak dapat mengaktifkan MFA.');
  }finally{button.disabled=false;}
});
const passwordDialog=$('change-password-dialog');
const closePasswordDialog=()=>{
  $('change-password-form').reset();
  $('change-password-error').hidden=true;
  $('change-password-error').textContent='';
  passwordDialog.close();
};
$('change-password-open').addEventListener('click',()=>{
  $('change-password-form').reset();
  $('change-password-error').hidden=true;
  passwordDialog.showModal();
  $('current-password').focus();
});
$('change-password-close').addEventListener('click',closePasswordDialog);
$('change-password-cancel').addEventListener('click',closePasswordDialog);
passwordDialog.addEventListener('close',()=>{
  $('change-password-form').reset();
  $('change-password-error').textContent='';
  $('change-password-error').hidden=true;
});
$('change-password-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const current=$('current-password').value,newPassword=$('new-password').value;
  const error=$('change-password-error'),submit=$('change-password-submit');
  error.hidden=true;error.textContent='';
  if(newPassword!==$('confirm-password').value){
    error.textContent='Konfirmasi password baru tidak sama.';error.hidden=false;return;
  }
  if(current===newPassword){
    error.textContent='Password baru harus berbeda dari password lama.';error.hidden=false;return;
  }
  submit.disabled=true;
  try{
    await changePassword(current,newPassword);
    closePasswordDialog();
    notice('Password berhasil diganti. Semua sesi lama telah dicabut.');
  }catch(err){
    if(authFailure(err))return;
    error.textContent=err instanceof ApiError&&err.status===401
      ?'Password lama tidak sesuai, atau sesi sudah berakhir.'
      :err instanceof ApiError&&err.status===400
        ?'Password baru tidak valid. Gunakan minimal 12 karakter yang berbeda dari sebelumnya.'
        :'Tidak dapat mengganti password. Coba kembali.';
    error.hidden=false;
  }finally{submit.disabled=false;}
});
$('logout-button').addEventListener('click',async()=>{
  const btn=$('logout-button');btn.disabled=true;
  try{
    await signOut();cleanSession();show('login');$('login-email').focus();
  }catch(error){if(!authFailure(error))notice('Gagal mengakhiri sesi. Coba lagi.');}
  finally{btn.disabled=false;}
});
$('sidebar-toggle').addEventListener('click',()=>{
  const collapsed=$('app-screen').classList.toggle('is-collapsed');
  $('sidebar-toggle').setAttribute('aria-expanded',String(!collapsed));
  $('sidebar-toggle').setAttribute('aria-label',collapsed?'Buka sidebar':'Lipat sidebar');
  $('sidebar-toggle').title=collapsed?'Buka sidebar':'Lipat sidebar';
});
$('mobile-nav-toggle').addEventListener('click',()=>{
  $('app-screen').querySelector('.app-content').inert=true;
  $('sidebar').classList.add('is-mobile-open');
  $('sidebar-backdrop').hidden=false;
  $('mobile-nav-toggle').setAttribute('aria-expanded','true');
  $('sidebar-mobile-close').focus();
});
$('sidebar-mobile-close').addEventListener('click',()=>{
  closeMobile();$('mobile-nav-toggle').focus();
});
$('sidebar-backdrop').addEventListener('click',()=>closeMobile());
document.addEventListener('keydown',(event)=>{
  if(event.key==='Escape'&&$('sidebar').classList.contains('is-mobile-open')) {
    closeMobile();$('mobile-nav-toggle').focus();
  }
});
for(const btn of document.querySelectorAll('[data-page]'))btn.addEventListener('click',()=>{
  navigate(btn.dataset.page);$('main-content').focus({preventScroll:true});
});
$('view-all-button').addEventListener('click',()=>navigate('assessments'));
$('refresh-button').addEventListener('click',()=>void loadWorkspace());
$('period-select').addEventListener('change',(event)=>{
  state.year=event.target.value;render();
});
for(const btn of document.querySelectorAll('[data-metric]'))btn.addEventListener('click',()=>{
  state.status=btn.dataset.metric;state.search='';$('status-filter').value=state.status;
  $('assessment-search').value='';navigate('assessments');renderTable();
});
$('assessment-search').addEventListener('input',(event)=>{state.search=event.target.value;renderTable();});
$('status-filter').addEventListener('change',(event)=>{state.status=event.target.value;renderTable();});
$('sort-filter').addEventListener('change',(event)=>{state.sort=event.target.value;renderTable();});
$('reset-filters').addEventListener('click',()=>{
  state.status='all';state.search='';state.sort='newest';state.year='all';
  $('status-filter').value='all';$('assessment-search').value='';$('sort-filter').value='newest';
  $('period-select').value='all';render();
});
for(const id of ['attention-list','my-work-list','assessments-table']) {
  $(id).addEventListener('click',(event)=>{
    const target=event.target.closest?.('[data-workspace-id],[data-detail-id]');
    if(!target||!$(id).contains(target))return;
    if(target.dataset.workspaceId)void openWorkspace(target.dataset.workspaceId);
    else void openDetail(target.dataset.detailId);
  });
}
$('close-detail').addEventListener('click',()=>$('detail-dialog').close());
$('detail-dialog').addEventListener('click',(event)=>{
  if(event.target===$('detail-dialog'))$('detail-dialog').close();
});

const padkCrosswalk=createCrosswalkReviewUI({
  api:requestJson,getPermissions:()=>state.permissions,
  getUserId:()=>state.userId,onAuthFailure:authFailure,
});
const vendorManagement=createVendorManagementUI({
  api:requestJson,getPermissions:()=>state.permissions,onAuthFailure:authFailure,
});
const findingManagement=createFindingManagementUI({
  api:requestJson,getPermissions:()=>state.permissions,getUserId:()=>state.userId,
  onAuthFailure:authFailure,
});
const incidentManagement=createIncidentManagementUI({
  api:requestJson,getPermissions:()=>state.permissions,onAuthFailure:authFailure,
});
const riskRegister=createRiskRegisterUI({
  api:requestJson,getPermissions:()=>state.permissions,onAuthFailure:authFailure,
});
const assetRegister=createAssetRegisterUI({
  api:requestJson,getPermissions:()=>state.permissions,onAuthFailure:authFailure,
});
const adminOnboarding=createAdminOnboardingUI({
  api:requestJson,
  getPermissions:()=>state.permissions,
  onAuthFailure:authFailure,
});
const padkPreparations=createPadkPreparationUI({
  api:requestJson,
  getPermissions:()=>state.permissions,
  getUserId:()=>state.userId,
  onAuthFailure:authFailure,
});

const maturityAssessments=createMaturityAssessmentUI({
  api:requestJson,
  getPermissions:()=>state.permissions,
  getUserId:()=>state.userId,
  onAuthFailure:authFailure,
});

const maturity=createMaturityManagement({
  api:requestJson,
  getPermissions:()=>state.permissions,
  onAuthFailure:authFailure,
});

const catalogs=createControlCatalogManagement({
  api:requestJson,
  getPermissions:()=>state.permissions,
  onAuthFailure:authFailure,
});

const reporting=createReporting({
  api:requestJson,
  getPermissions:()=>state.permissions,
  getAssessments:()=>state.assessments,
  onAuthFailure:authFailure,
});

const workspace=createWorkspace({
  api:requestJson,
  getUserId:()=>state.userId,
  getPermissions:()=>state.permissions,
  onAuthFailure:authFailure,
  onBack:()=>navigate(state.workspaceOrigin),
  onChanged:loadWorkspace,
  onCreated:async(id)=>{
    await loadWorkspace();
    if(state.userId && navigate('workspace'))await workspace.open(id);
  },
});
async function openWorkspace(id,origin='assessments'){
  if(!state.permissions.includes('assessments:read'))return;
  if(state.page==='workspace' && !workspace.confirmLeave())return;
  if(origin==='reviews' && !state.permissions.includes('assessments:approve'))return;
  if(navigate('workspace')){
    state.workspaceOrigin=origin;
    for(const button of document.querySelectorAll('[data-page]')){
      const active=button.dataset.page===origin;
      button.classList.toggle('is-active',active);
      if(active)button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    }
    await workspace.open(id);
  }
}
$('review-queue-table').addEventListener('click',(event)=>{
  const button=event.target.closest?.('[data-review-id]');
  if(button&&$('review-queue-table').contains(button))
    void openWorkspace(button.dataset.reviewId,'reviews');
});
$('review-queue-reload').addEventListener('click',()=>void loadWorkspace());

function resetActivation(){
  $('activation-form').hidden=true;
  $('activation-success').hidden=true;
  $('login-form').hidden=false;
  $('activation-form').reset();
  $('activation-message').hidden=true;
  $('activation-message').textContent='';
}
$('activation-open').addEventListener('click',()=>{
  resetMfaLogin();
  $('login-form').hidden=true;
  $('activation-form').hidden=false;
  $('activation-token').focus();
});
$('activation-cancel').addEventListener('click',resetActivation);
$('activation-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const token=$('activation-token').value.trim();
  const password=$('activation-password').value;
  const confirm=$('activation-confirm').value;
  const message=$('activation-message');
  if(!/^[A-Za-z0-9_-]{43}$/.test(token)||password.length<12||password!==confirm){
    message.hidden=false;message.dataset.kind='error';
    message.textContent='Periksa kode undangan dan password (minimal 12 karakter, harus sama).';
    return;
  }
  $('activation-submit').disabled=true;
  try{
    const result=await requestJson('/auth/activate',{method:'POST',body:{token,password}});
    if(result.activated!==true)throw new TypeError('Aktivasi tidak valid');
    resetActivation();
    loginError('');
    $('activation-success').hidden=false;
  }catch{
    message.hidden=false;message.dataset.kind='error';
    message.textContent='Aktivasi gagal. Pastikan kode belum dipakai dan belum kedaluwarsa.';
  }finally{$('activation-submit').disabled=false;}
});
$('activation-open').addEventListener('click',()=>$('activation-success').hidden=true);
$('first-run-action').addEventListener('click',()=>{
  const destination=$('first-run-action').dataset.destination;
  if(destination)navigate(destination);
});
void restoreSession();
