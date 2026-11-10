import { STATUS_LABELS } from './assessment-model.js';
import { createEvidenceUI } from './assessment-evidence.js';
import {
  RATING_LABELS, canWriteAssessment, canAttachCatalog, canStartAssessment,
  canEditResult, combineControls, validateAssessmentDraft, validateRatingDraft,
  nextUnassessedControl, neighborControl,
} from './assessment-workspace-model.js';
import { ApiError } from './session.js';
import {
  REVIEW_ACTION_LABELS, canDecideReview, canSubmitReview,
  maySubmitReview, validateReviewDecision,
} from './assessment-review-model.js';

const $ = (id) => document.getElementById(id);
const message = (id,value) => {$(id).textContent=value;};
const make = (tag,cls,value) => {
  const el=document.createElement(tag);
  if(cls)el.className=cls;
  el.textContent=value??'';
  return el;
};
function showMessage(text,kind='info'){
  const box=$('workspace-message');
  box.textContent=text??'';
  box.hidden=!text;
  box.dataset.kind=kind;
}
function responseMessage(error){
  if(error instanceof ApiError){
    if(error.status===403)return 'Anda tidak memiliki izin untuk tindakan ini.';
    if(error.status===404)return 'Data tidak ditemukan. Muat ulang dan periksa kembali.';
    if(error.status===409)return 'Data berubah atau status tidak mengizinkan tindakan ini. Muat ulang.';
    if(error.status===400)return 'Data tidak valid. Periksa isian dan coba lagi.';
    if(error.status===413)return 'Isian terlalu panjang untuk diterima server.';
  }
  return 'Layanan tidak tersedia. Periksa koneksi dan coba lagi.';
}
function fmtDate(value){
  if(typeof value!=='string')return '—';
  if(/^\d{4}-\d{2}-\d{2}/.test(value))return value.slice(8,10)+'/'+value.slice(5,7)+'/'+value.slice(0,4);
  return '—';
}

export function createWorkspace({
  api, getUserId, getPermissions, onCreated, onBack, onAuthFailure,
  onChanged = async () => {},
}) {
  const state={
    id:null, assessment:null, catalog:null, controls:[], selectedId:null,
    dirty:false, conflict:false, pending:false, generation:0,
  };
  const evidence=createEvidenceUI({api,getPermissions,onAuthFailure});
  const allowed=()=>canWriteAssessment(state.assessment,getUserId(),getPermissions());
  const editable=()=>canEditResult(state.assessment,getUserId(),getPermissions(),state.catalog);
  const selected=()=>state.controls.find(x=>x.id===state.selectedId)??null;
  const base=(suffix='')=>'/assessments/'+encodeURIComponent(state.id)+suffix;

  function confirmLeave(){
    return !state.dirty || window.confirm('Penilaian belum disimpan. Buang perubahan dan lanjutkan?');
  }
  function close(){
    state.generation++;
    state.id=null;state.dirty=false;state.conflict=false;state.selectedId=null;
    evidence.clear();
  }
  function renderBusy(isBusy){
    state.pending=isBusy;
    $('workspace-attach').disabled=isBusy || $('workspace-catalog').disabled
      || !canAttachCatalog(state.assessment,getUserId(),getPermissions(),state.catalog);
    $('workspace-start').disabled=isBusy
      || !canStartAssessment(state.assessment,getUserId(),getPermissions(),state.catalog);
    $('workspace-save').disabled=isBusy || state.conflict || !state.dirty || !editable();
    $('workspace-save-next').disabled=isBusy || state.conflict || !state.dirty || !editable();
    $('assessment-create-submit').disabled=isBusy;
    $('workspace-submit-review').disabled=isBusy || state.dirty || state.conflict || !canSubmitReview(state.assessment,getUserId(),getPermissions(),state.catalog,state.controls);
    $('workspace-review-save').disabled=isBusy || !canDecideReview(state.assessment,getUserId(),getPermissions());
    renderNavigation();
  }
  function renderProgress(){
    const total=state.controls.length;
    const assessed=state.controls.filter(x=>Number(x.revision)>0).length;
    message('workspace-progress-label',assessed+' dari '+total+' kontrol');
    $('workspace-progress').max=total || 1;
    $('workspace-progress').value=assessed;
    message('workspace-progress-percent',total?Math.round(assessed/total*100)+'%':'0%');
    message('workspace-catalog-tag',state.catalog
      ?'Katalog '+(state.catalog.catalog_code??'')+' · v'+state.catalog.version
      :'Katalog belum terpasang');
    message('workspace-control-count',total+' kontrol');
    message('workspace-remaining-hint',!total
      ?'Pasang katalog, lalu mulai asesmen untuk mengisi kontrol.'
      :assessed===total
        ?'Semua kontrol sudah dinilai. Periksa bukti dan lanjut ke pemeriksaan internal.'
        :'Masih '+(total-assessed)+' kontrol belum dinilai. Simpan dan lanjut untuk mengisi satu per satu.');
  }

  function renderReview(){
    const a=state.assessment;
    if(!a)return;
    const maySubmit=maySubmitReview(a,getUserId(),getPermissions(),state.catalog);
    const ready=canSubmitReview(a,getUserId(),getPermissions(),state.catalog,state.controls);
    const reviewer=canDecideReview(a,getUserId(),getPermissions());
    const remaining=state.controls.filter(c=>!Number.isSafeInteger(c.revision)||c.revision<1).length;
    $('workspace-submit-area').hidden=!maySubmit;
    $('workspace-submit-review').disabled=state.pending||state.dirty||state.conflict||!ready;
    $('workspace-review-form').hidden=!reviewer;
    $('workspace-review-save').disabled=state.pending||!reviewer;
    $('workspace-review-cycle').textContent='Memuat siklus…';
    if(maySubmit){
      message('workspace-review-description','Ajukan asesmen setelah seluruh kontrol dinilai. Hasil akan dikunci sampai pemeriksa mengembalikannya untuk perbaikan.');
      message('workspace-submit-hint',ready
        ?'Semua kontrol telah dinilai. Periksa kembali hasil dan catatan sebelum mengajukan.'
        :remaining+' kontrol belum dinilai. Lengkapi semuanya sebelum mengajukan.');
    }else if(reviewer){
      message('workspace-review-description','Periksa hasil seluruh kontrol. Anda bukan pemilik asesmen dan memiliki izin memutuskan review.');
    }else if(a.status==='submitted'){
      message('workspace-review-description','Asesmen menunggu keputusan pemeriksa. Hasil penilaian saat ini terkunci.');
    }else if(a.status==='approved'){
      message('workspace-review-description','Asesmen telah disetujui dan terkunci. Riwayat keputusan tetap tersedia untuk ditinjau.');
    }else if(a.status==='changes_requested'){
      message('workspace-review-description','Asesmen dikembalikan untuk perbaikan. Pemilik berizin dapat merevisi penilaian lalu mengajukan ulang.');
    }else{
      message('workspace-review-description','Review baru tersedia setelah asesmen dimulai dan semua kontrol dinilai.');
    }
  }
  async function loadReviewHistory(gen=state.generation){
    const el=$('workspace-review-history');
    el.replaceChildren(make('p','empty-note','Memuat riwayat pemeriksaan…'));
    try {
      const data=await api(base('/reviews'));
      if(gen!==state.generation)return;
      const events=Array.isArray(data.events)?data.events:[];
      $('workspace-review-cycle').textContent='Siklus '+(data.submissionCycle??'—');
      el.replaceChildren();
      if(events.length===0){
        el.append(make('p','empty-note','Belum ada pengajuan atau keputusan pemeriksaan.'));
        return;
      }
      for(const event of events){
        const row=make('div','review-history-item','');
        row.append(make('strong','',(REVIEW_ACTION_LABELS[event.action]??'Peristiwa review')
          +' · Siklus '+event.submission_cycle));
        const actor=typeof event.actor_user_id==='string'
          ?'ID pengguna '+event.actor_user_id.slice(0,8)+'…':'Pengguna tidak diketahui';
        const time=event.occurred_at?new Date(event.occurred_at).toLocaleString('id-ID'):'—';
        row.append(make('small','',time+' · '+actor));
        if(event.note)row.append(make('p','',event.note));
        el.append(row);
      }
    } catch(error) {
      if(gen!==state.generation)return;
      if(onAuthFailure(error))return;
      el.replaceChildren(make('p','empty-note','Riwayat belum dapat dimuat. Coba lagi.'));
    }
  }

  function renderControls(){
    const el=$('workspace-controls');
    el.replaceChildren();
    const filter=$('workspace-filter').value;
    const rows=state.controls.filter(x=>filter==='all'
      || (filter==='not_assessed'?x.revision===0:x.revision>0));
    if(!rows.length){
      el.append(make('p','empty-note',state.controls.length
        ?'Tidak ada kontrol untuk filter ini.':'Belum ada kontrol. Pasang katalog terlebih dahulu.'));
    }
    for(const control of rows){
      const button=make('button','workspace-item','');
      button.type='button';button.dataset.controlId=control.id;
      button.classList.toggle('is-selected',state.selectedId===control.id);
      button.setAttribute('aria-pressed',String(state.selectedId===control.id));
      const left=make('span','', '');
      left.append(make('span','workspace-item-code',control.control_code),
        make('span','workspace-item-title',control.title));
      button.append(left,make('span','workspace-item-state',RATING_LABELS[control.rating]??'Belum dinilai'));
      el.append(button);
    }
  }
  function renderNavigation(){
    const control=selected(),active=Boolean(control)&&!state.pending;
    $('workspace-prev').disabled=!active||!neighborControl(state.controls,state.selectedId,-1);
    $('workspace-next').disabled=!active||!neighborControl(state.controls,state.selectedId,1);
    const pending=control&&nextUnassessedControl(state.controls,state.selectedId);
    $('workspace-next-pending').hidden=!pending;
    $('workspace-next-pending').disabled=!active;
    $('workspace-save-next').disabled=state.pending||state.conflict||!state.dirty||!editable();
  }
  function selectControl(id){
    if(state.pending||!state.controls.some(c=>c.id===id)||!confirmLeave())return;
    state.selectedId=id;
    $('workspace-filter').value='all';
    renderControls();renderEditor();showMessage('');
    document.querySelector('.workspace-editor')?.scrollIntoView({block:'start',behavior:'smooth'});
  }
  function draftState(){
    const control=selected();
    if(!control)return;
    const rating=$('workspace-rating').value, note=$('workspace-note').value;
    state.dirty=rating!==(control.rating==='not_assessed'?'':control.rating)
      || note!==control.note;
    message('workspace-dirty-label',state.conflict
      ?'Konflik revisi: muat ulang sebelum menyimpan kembali.'
      :state.dirty?'Perubahan belum disimpan.':'Tidak ada perubahan.');
    $('workspace-save').disabled=state.pending||state.conflict||!state.dirty;
    $('workspace-save-next').disabled=state.pending||state.conflict||!state.dirty;
    $('workspace-save-indicator').textContent=state.conflict
      ?'Ada konflik perubahan. Salin catatan dan muat ulang sebelum menyimpan.'
      :state.dirty?'Perubahan pada kontrol ini BELUM tersimpan di server.'
        :control.revision>0?'Penilaian kontrol ini tersimpan di server.':'Kontrol ini belum dinilai.';
    $('workspace-save-indicator').dataset.state=state.dirty?'dirty':control.revision>0?'saved':'pending';
    renderNavigation();
    $('workspace-submit-review').disabled=state.pending||state.conflict||state.dirty
      || !canSubmitReview(state.assessment,getUserId(),getPermissions(),state.catalog,state.controls);
  }
  function renderEditor(){
    const control=selected();
    $('workspace-editor-empty').hidden=!!control;
    $('workspace-editor-content').hidden=!control;
    if(!control){evidence.clear();return;}
    const index=state.controls.findIndex(c=>c.id===control.id);
    message('workspace-control-position','KONTROL '+String(index+1).padStart(2,'0')+
      ' / '+state.controls.length);
    message('workspace-control-code',control.control_code);
    message('workspace-control-title',control.title);
    message('workspace-control-description',control.description || 'Tidak ada deskripsi kontrol.');
    const source=control.source_document && control.source_section
      ?'Referensi yang dicatat: '+control.source_document+' / '+control.source_section:'';
    $('workspace-control-source').hidden=!source;
    message('workspace-control-source',source);
    message('workspace-control-revision',control.revision>0?'Revisi '+control.revision:'Belum dinilai');
    $('workspace-rating').value=control.rating==='not_assessed'?'':control.rating;
    $('workspace-note').value=control.note||'';
    $('workspace-rating').disabled=!editable();
    $('workspace-note').disabled=!editable();
    $('workspace-save').hidden=!editable();
    $('workspace-save-next').hidden=!editable();
    $('workspace-history-refresh').hidden=control.revision===0;
    message('workspace-history',control.revision
      ?'Klik Lihat riwayat untuk memuat perubahan dari server.':'Belum ada riwayat penilaian.');
    state.dirty=false;state.conflict=false;
    message('workspace-dirty-label',editable()?'Tidak ada perubahan.':'Baca-saja sesuai status dan hak akses.');
    $('workspace-save').disabled=true;
    $('workspace-save-next').disabled=true;
    $('workspace-save-indicator').textContent=editable()
      ?(control.revision>0
        ?'Penilaian tersimpan di server (revisi '+control.revision+').'
        :'Belum ada penilaian tersimpan untuk kontrol ini.')
      :'Baca-saja. Hasil dan riwayat dapat diperiksa tanpa mengubah data.';
    $('workspace-save-indicator').dataset.state=control.revision>0?'saved':'pending';
    renderNavigation();
    evidence.open({
      assessmentId:state.id, controlId:control.id,
      status:state.assessment?.status, ownerId:state.assessment?.owner_user_id,
      userId:getUserId(),
    });
  }
  async function catalogChoices(gen){
    const select=$('workspace-catalog');
    select.replaceChildren();
    const placeholder=new Option('Memuat katalog…','');
    select.add(placeholder);select.disabled=true;
    try{
      const listing=await api('/catalogs');
      const catalogs=Array.isArray(listing.catalogs)?listing.catalogs:[];
      const versions=await Promise.all(catalogs.map(async catalog=>{
        const response=await api('/catalogs/'+encodeURIComponent(catalog.id)+'/versions');
        return (Array.isArray(response.versions)?response.versions:[])
          .filter(v=>v.status==='published').map(v=>({
            id:v.id,builtin:catalog.origin==='builtin',
            name:(catalog.origin==='builtin'?'KATALOG BAWAAN · ':'')+
              catalog.title+' / v'+v.version,
          }));
      }));
      if(gen!==state.generation)return;
      const candidates=versions.flat();
      select.replaceChildren(new Option('Pilih katalog penilaian',''));
      for(const version of candidates)select.add(new Option(version.name,version.id));
      select.disabled=candidates.length===0;
      // Suggest but never attach silently: attachment is immutable.
      const recommended=candidates.find(x=>x.builtin);
      if(recommended)select.value=recommended.id;
      $('workspace-attach').disabled=select.disabled;
      $('workspace-default-catalog-hint').textContent=recommended
        ?'Katalog internal bawaan sudah dipilih. Periksa lalu klik Pasang katalog; pemasangan tidak dapat dibatalkan.'
        :'Pilih katalog terbit atau buat katalog baru melalui menu Katalog Kontrol.';
      if(select.disabled)showMessage('Belum ada katalog terbit. Buat dan terbitkan katalog dari menu Katalog Kontrol.','warning');
    }catch(error){
      if(gen!==state.generation)return;
      if(onAuthFailure(error))return;
      select.replaceChildren(new Option('Katalog tidak dapat dimuat',''));
      $('workspace-attach').disabled=true;
      showMessage(responseMessage(error),'error');
    }
  }
  function renderSetup(gen){
    const a=state.assessment;
    const attach=canAttachCatalog(a,getUserId(),getPermissions(),state.catalog);
    const start=canStartAssessment(a,getUserId(),getPermissions(),state.catalog);
    $('workspace-setup').hidden=a.status!=='draft';
    $('workspace-catalog-controls').hidden=!attach;
    $('workspace-start').hidden=!start;
    if(a.status==='draft'){
      message('workspace-setup-note',!allowed()
        ?'Hanya pemilik asesmen yang memiliki izin tulis yang dapat menyiapkan asesmen.'
        :state.catalog?'Katalog terpasang dan terkunci. Anda dapat memulai asesmen.':
        'Katalog bawaan tersedia tanpa input kontrol manual. Pasang versi yang dipilih sebelum memulai; pilihan akan terkunci.');
      if(attach)void catalogChoices(gen);
    }
  }
  async function load(){
    if(!state.id)return;
    const gen=++state.generation;
    state.dirty=false;state.conflict=false;
    $('workspace-loading').hidden=false;
    $('workspace-content').hidden=true;
    showMessage('');
    try{
      const [assessment,checklist,results]=await Promise.all([
        api(base()),api(base('/checklist')),api(base('/results')),
      ]);
      if(gen!==state.generation)return;
      if((checklist.catalogVersion?.id??null)!==(results.catalogVersionId??null))
        throw new Error('Catalog snapshot mismatch');
      const oldSelected=state.selectedId;
      state.assessment=assessment;
      state.catalog=checklist.catalogVersion??null;
      state.controls=combineControls(checklist,results);
      state.selectedId=state.controls.some(x=>x.id===oldSelected)
        ?oldSelected:state.controls[0]?.id??null;
      message('workspace-title',assessment.title);
      message('workspace-subtitle','Periode '+fmtDate(assessment.period_start)+' – '+
        fmtDate(assessment.period_end)+' · '+(allowed()?'Pemilik asesmen':'Akses baca-saja'));
      const chip=$('workspace-status');
      chip.textContent=STATUS_LABELS[assessment.status]??assessment.status;
      chip.dataset.status=assessment.status;
      renderProgress();renderSetup(gen);renderControls();renderEditor();renderReview();
      void loadReviewHistory(gen);
      $('workspace-loading').hidden=true;$('workspace-content').hidden=false;
    }catch(error){
      if(gen!==state.generation)return;
      if(onAuthFailure(error))return;
      showMessage(responseMessage(error),'error');
      $('workspace-loading').textContent='Data asesmen tidak dapat dimuat. Gunakan Muat ulang.';
    }
  }
  async function open(id){
    state.id=id;state.assessment=null;state.catalog=null;state.controls=[];
    state.selectedId=null;state.dirty=false;state.conflict=false;
    evidence.clear();
    $('workspace-loading').textContent='Memuat asesmen dan checklist dari server…';
    await load();
  }
  function onError(error,gen){
    if(gen!==state.generation)return;
    if(onAuthFailure(error))return;
    showMessage(responseMessage(error),error instanceof ApiError&&error.status===409?'warning':'error');
  }
  async function runAction(path,body,method='POST'){
    if(!state.id||state.pending)return;
    const gen=state.generation;renderBusy(true);
    try{
      await api(base(path),{method,...(body!==undefined?{body}:{})});
      if(gen!==state.generation)return;
      await load();
      if(state.id)await onChanged();
    }catch(error){onError(error,gen);}
    finally{renderBusy(false);}
  }
  async function save(event){
    event.preventDefault();
    const control=selected();
    if(!control||!editable()||!state.dirty||state.pending||state.conflict)return;
    const rating=$('workspace-rating').value,note=$('workspace-note').value;
    const messageText=validateRatingDraft({rating,note});
    if(messageText){showMessage(messageText,'error');return;}
    const gen=state.generation;
    const saveAndNext=event.submitter?.id==='workspace-save-next';
    renderBusy(true);
    try {
      await api(base('/results/'+encodeURIComponent(control.id)),{
        method:'PUT',body:{rating,note,expectedRevision:control.revision},
      });
      if(gen!==state.generation)return;
      await load();
      if($('workspace-content').hidden)return;
      if(saveAndNext){
        const next=nextUnassessedControl(state.controls,control.id);
        if(next){
          state.selectedId=next;
          $('workspace-filter').value='all';
          renderControls();renderEditor();
          showMessage('Kontrol '+control.control_code+' tersimpan. Lanjut ke kontrol yang belum dinilai.','success');
          document.querySelector('.workspace-editor')?.scrollIntoView({block:'start',behavior:'smooth'});
        }else{
          showMessage('Penilaian tersimpan. Seluruh kontrol telah dinilai; periksa lampiran bukti dan ajukan review internal.','success');
        }
      }else showMessage('Penilaian kontrol tersimpan di server.','success');
    } catch(error){
      if(gen!==state.generation)return;
      if(onAuthFailure(error))return;
      if(error instanceof ApiError&&error.status===409){
        state.conflict=true;draftState();
        showMessage('Konflik: hasil berubah atau asesmen sudah berganti status. Isian lokal tetap ada. Salin catatan jika diperlukan, lalu pilih Muat ulang untuk membandingkan versi server.','warning');
      }else showMessage(responseMessage(error),'error');
    }finally{renderBusy(false);}
  }
  async function history(){
    const control=selected();if(!control||control.revision===0)return;
    message('workspace-history','Memuat riwayat…');
    const gen=state.generation,controlId=control.id;
    try{
      const payload=await api(base('/results/'+encodeURIComponent(controlId)+'/history'));
      if(gen!==state.generation||state.selectedId!==controlId)return;
      const el=$('workspace-history');el.replaceChildren();
      const rows=Array.isArray(payload.history)?payload.history:[];
      if(rows.length===0)el.append(make('p','', 'Belum ada riwayat.'));
      for(const item of rows){
        const line=make('div','workspace-history-item','');
        line.append(make('strong','', 'Revisi '+item.revision+' · '+(RATING_LABELS[item.rating]??item.rating)),
          make('p','',item.note||'Tanpa catatan.'));
        el.append(line);
      }
    }catch(error){
      if(onAuthFailure(error))return;
      message('workspace-history','Riwayat tidak dapat dimuat. Coba lagi.');
    }
  }
  async function create(event){
    event.preventDefault();
    if(!getPermissions().includes('assessments:write')||state.pending)return;
    const input={
      title:$('assessment-create-name').value,
      periodStart:$('assessment-create-start').value,
      periodEnd:$('assessment-create-end').value,
    };
    const validation=validateAssessmentDraft(input);
    const err=$('assessment-create-error');
    err.hidden=!validation;err.textContent=validation??'';
    if(validation)return;
    renderBusy(true);
    try{
      const created=await api('/assessments',{method:'POST',body:input});
      $('assessment-create-dialog').close();
      $('assessment-create-form').reset();
      await onCreated(created.id);
    }catch(error){
      if(onAuthFailure(error))return;
      err.hidden=false;err.textContent=responseMessage(error);
    }finally{renderBusy(false);}
  }
  $('assessment-create').addEventListener('click',()=>{
    if(!getPermissions().includes('assessments:write'))return;
    $('assessment-create-error').hidden=true;
    $('assessment-create-dialog').showModal();
    $('assessment-create-name').focus();
  });
  $('assessment-create-close').addEventListener('click',()=>$('assessment-create-dialog').close());
  $('assessment-create-cancel').addEventListener('click',()=>$('assessment-create-dialog').close());
  $('assessment-create-form').addEventListener('submit',event=>void create(event));
  $('workspace-back').addEventListener('click',()=>onBack());
  $('workspace-reload').addEventListener('click',()=>{
    if(confirmLeave())void load();
  });
  $('workspace-controls').addEventListener('click',(event)=>{
    const target=event.target.closest?.('[data-control-id]');
    if(!target||!confirmLeave())return;
    selectControl(target.dataset.controlId);
  });
  $('workspace-filter').addEventListener('change',renderControls);
  $('workspace-prev').addEventListener('click',()=>{
    const id=neighborControl(state.controls,state.selectedId,-1);
    if(id)selectControl(id);
  });
  $('workspace-next').addEventListener('click',()=>{
    const id=neighborControl(state.controls,state.selectedId,1);
    if(id)selectControl(id);
  });
  $('workspace-next-pending').addEventListener('click',()=>{
    const id=nextUnassessedControl(state.controls,state.selectedId);
    if(id)selectControl(id);
  });
  $('workspace-rating').addEventListener('change',draftState);
  $('workspace-note').addEventListener('input',draftState);
  $('workspace-result-form').addEventListener('submit',event=>void save(event));
  $('workspace-history-refresh').addEventListener('click',()=>void history());
  $('workspace-attach').addEventListener('click',()=>{
    if(!canAttachCatalog(state.assessment,getUserId(),getPermissions(),state.catalog))return;
    const id=$('workspace-catalog').value;
    if(!id){showMessage('Pilih katalog versi terpublikasi.','error');return;}
    if(!window.confirm('Pasang versi katalog ini? Pilihan tidak dapat diganti setelah disimpan.'))return;
    void runAction('/catalog',{versionId:id});
  });
  $('workspace-start').addEventListener('click',()=>{
    if(!canStartAssessment(state.assessment,getUserId(),getPermissions(),state.catalog))return;
    if(!window.confirm('Mulai asesmen ini? Status berubah menjadi Dikerjakan.'))return;
    void runAction('/start');
  });

  $('workspace-submit-review').addEventListener('click',()=>{
    if(state.pending || !canSubmitReview(state.assessment,getUserId(),getPermissions(),state.catalog,state.controls))return;
    if(state.dirty){showMessage('Simpan atau batalkan perubahan penilaian sebelum mengajukan review.','warning');return;}
    if(!window.confirm('Ajukan asesmen ini untuk pemeriksaan? Seluruh penilaian akan terkunci sampai review selesai.'))return;
    void runAction('/submit');
  });
  $('workspace-review-decision').addEventListener('change',(event)=>{
    const required=event.target.value==='request_changes';
    $('workspace-review-note').minLength=required?10:0;
    $('workspace-review-note').required=required;
  });
  $('workspace-review-form').addEventListener('submit',async(event)=>{
    event.preventDefault();
    if(state.pending||!canDecideReview(state.assessment,getUserId(),getPermissions()))return;
    const decision=$('workspace-review-decision').value;
    const note=$('workspace-review-note').value;
    const reason=validateReviewDecision({decision,note});
    if(reason){showMessage(reason,'error');return;}
    const label=decision==='approve'?'menyetujui':'mengembalikan untuk perbaikan';
    if(!window.confirm('Anda akan '+label+' asesmen ini. Keputusan akan tercatat dalam audit log. Lanjutkan?'))return;
    const gen=state.generation;
    renderBusy(true);
    try{
      await api(base('/review'),{method:'POST',body:{decision,note}});
      if(gen!==state.generation)return;
      $('workspace-review-form').reset();
      await load();
      showMessage(decision==='approve'?'Asesmen berhasil disetujui.':'Asesmen dikembalikan untuk perbaikan.','info');
      if(state.id)await onChanged();
    }catch(error){onError(error,gen);}
    finally{renderBusy(false);}
  });
  $('workspace-review-history-reload').addEventListener('click',()=>void loadReviewHistory());

  window.addEventListener('beforeunload',(event)=>{
    if(!state.dirty)return;
    event.preventDefault();
    event.returnValue='';
  });
  return {
    open,close,confirmLeave,
    syncPermissions(){
      $('assessment-create').hidden=!getPermissions().includes('assessments:write');
    },
  };
}
