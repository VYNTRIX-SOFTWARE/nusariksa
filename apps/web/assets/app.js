import {
  ApiError, requestJson, getSession, getPermissions, signIn, signOut,
} from './session.js';
import {
  STATUS_LABELS, validAssessments, yearsForAssessments,
  summarizeAssessments, filterAssessments, attentionAssessments, ownWork,
} from './assessment-model.js';

const $ = (id) => document.getElementById(id);
const screens = {
  loading: $('loading-screen'), login: $('login-screen'), app: $('app-screen'),
};
const state = {
  userId: null, permissions: [], assessments: [], load: 'loading', page: 'overview',
  year: 'all', status: 'all', search: '', sort: 'newest',
};
const pages = {overview: 'Dashboard', assessments: 'Daftar Asesmen'};

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
function cleanSession() {
  state.userId = null;
  state.permissions = [];
  state.assessments = [];
  state.load = 'loading';
  state.year = 'all';
  state.status = 'all';
  state.search = '';
  state.sort = 'newest';
  $('login-password').value = '';
  $('detail-dialog').close?.();
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
  const hasRead=state.permissions.includes('assessments:read');
  $('assessment-menu').hidden=!hasRead;
  $('assessment-menu-group').hidden=!hasRead;
  $('dashboard-access').hidden=state.load!=='forbidden';
  $('dashboard-content').hidden=state.load==='forbidden';
  if (!hasRead && state.page==='assessments') navigate('overview');
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
    const btn=textElement('button','detail-link','Lihat');btn.type='button';btn.dataset.detailId=a.id;
    btn.setAttribute('aria-label','Lihat detail '+a.title);tdAction.append(btn);
    tr.append(tdTitle,textElement('td','table-date',formatDate(a.period_start)+' – '+formatDate(a.period_end)),
      tdStatus,textElement('td','table-date',formatDate(a.created_at)),tdAction);
    root.append(tr);
  }
}
function render() {
  renderPermissions();renderMetrics();renderAttention();renderTable();
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
  if (!(page in pages)) return;
  if(page==='assessments'&&!state.permissions.includes('assessments:read'))return;
  state.page=page;
  for(const section of document.querySelectorAll('.page'))section.hidden=section.id!=='page-'+page;
  for(const btn of document.querySelectorAll('[data-page]')) {
    const isActive=btn.dataset.page===page;
    btn.classList.toggle('is-active',isActive);
    if(isActive)btn.setAttribute('aria-current','page');
    else btn.removeAttribute('aria-current');
  }
  $('topbar-page').textContent=pages[page];
  notice('');closeMobile();
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
}
async function restoreSession() {
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
    root.append(dl,textElement('p','detail-helper',
      'Ini adalah detail baca-saja. Hasil asesmen, bukti, dan laporan lengkap akan disediakan pada modul berikutnya.'));
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
    await enterApp(result.userId);
  }catch(error) {
    if(error instanceof ApiError&&error.status===401)loginError('Email atau kata sandi tidak sesuai.');
    else if(error instanceof ApiError&&error.status===429)loginError('Terlalu banyak percobaan. Coba lagi beberapa saat.');
    else loginError('Masuk gagal. Periksa koneksi dan konfigurasi server.');
  }finally{submit.disabled=false;submit.firstChild.textContent='Masuk ';}
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
    const button=event.target.closest?.('[data-detail-id]');
    if(button&&$(id).contains(button))void openDetail(button.dataset.detailId);
  });
}
$('close-detail').addEventListener('click',()=>$('detail-dialog').close());
$('detail-dialog').addEventListener('click',(event)=>{
  if(event.target===$('detail-dialog'))$('detail-dialog').close();
});
void restoreSession();
