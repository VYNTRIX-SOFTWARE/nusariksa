import {createPadkIndicatorNoteUI} from './padk-indicator-note-ui.js';
import {confirmAssessmentAction} from './action-dialog.js';
import {downloadPrivateReport,reportDownloadError} from './private-report-download.js';
import {createPadkScorePreviewUI} from './padk-score-preview-ui.js';
import {createPadkEvidenceCoverageUI} from './padk-evidence-coverage-ui.js';

const $=id=>document.getElementById(id);
const ENDPOINT='/regulatory/padk43/cyber/preparations';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const control=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const text=(tag,content,className)=>{
  const element=document.createElement(tag);
  element.textContent=String(content??'');
  if(className)element.className=className;
  return element;
};
// A date suggestion is a convenience, not evidence of a regulatory determination.
export function suggestPadkAnnualPreparation(date=new Date()){
  if(!(date instanceof Date)||Number.isNaN(date.getTime()))
    throw new TypeError('Tanggal saran penilaian tidak valid.');
  const year=date.getFullYear();
  return {title:'Penilaian Maturitas Keamanan Siber — '+year,
    periodStart:year+'-01-01',periodEnd:year+'-12-31'};
}
export function suggestPadkTitleFromEnd(periodEnd){
  if(typeof periodEnd!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(periodEnd))
    throw new TypeError('Tanggal akhir penilaian tidak valid.');
  return 'Penilaian Maturitas Keamanan Siber — '+periodEnd.slice(0,4);
}
export function validatePreparationInput({title,category,periodStart,periodEnd}){
  if(typeof title!=='string'||title!==title.trim()||title.length<3||title.length>200
    ||control.test(title)||![1,2].includes(category)
    ||typeof periodStart!=='string'||typeof periodEnd!=='string'
    ||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(periodStart)
    ||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(periodEnd)
    ||periodEnd<periodStart)throw new TypeError('Judul, kategori, atau periode belum valid.');
  return {title,category,periodStart,periodEnd};
}
export function validatePreparationResponse(data){
  if(!data||!UUID.test(data.id)||typeof data.title!=='string'
    ||![1,2].includes(data.category)||!UUID.test(data.ownerUserId)
    ||!Number.isSafeInteger(data.revision)||data.revision<1
    ||data.status!=='PREPARATION_ONLY'||data.scoringAvailable!==false
    ||data.submissionAvailable!==false||data.finalReportAvailable!==false
    ||typeof data.preparationNotes!=='string'||typeof data.evidencePlan!=='string')
    throw new TypeError('Respons persiapan PADK tidak valid.');
  return data;
}
const LIST_STATUS={
  in_progress:'Dalam pengerjaan',
  submitted:'Menunggu pemeriksaan',
  changes_requested:'Perlu perbaikan',
  draft_accepted:'Draft internal diterima',
};
export function validatePreparationListItem(item){
  validatePreparationResponse(item);
  const progress=item.indicatorProgress;
  if(!Object.hasOwn(LIST_STATUS,item.reviewStatus)||!progress
    ||progress.total!==(item.category===1?80:60)
    ||!Number.isSafeInteger(progress.complete)||progress.complete<0
    ||progress.complete>progress.total
    ||!/^\d{4}-\d{2}-\d{2}$/.test(item.periodStart)
    ||!/^\d{4}-\d{2}-\d{2}$/.test(item.periodEnd))
    throw new TypeError('Ringkasan penilaian PADK tidak valid.');
  return item;
}
export function filterPreparations(items,query='',status='all'){
  const term=query.trim().toLocaleLowerCase('id-ID');
  return items.filter(item=>(status==='all'||item.reviewStatus===status)
    &&(!term||[item.title,item.periodStart,item.periodEnd,'Kategori '+item.category]
      .some(value=>value.toLocaleLowerCase('id-ID').includes(term))));
}
const REVIEW_QUEUE=ENDPOINT+'/draft-review/pending';
export function validatePadkReviewQueue(data){
  if(!data||data.draftOnly!==true||data.officialApprovalAvailable!==false
    ||data.regulatoryPackVerified!==false||typeof data.hasMore!=='boolean'
    ||!Array.isArray(data.drafts)||data.drafts.length>50)
    throw new TypeError('Daftar antrean draft PADK tidak valid.');
  for(const item of data.drafts){
    if(!UUID.test(item.preparationId)||!UUID.test(item.ownerUserId)
      ||typeof item.title!=='string'||!item.title.trim()
      ||![1,2].includes(item.category)||item.status!=='submitted'
      ||!Number.isSafeInteger(item.submissionCycle)||item.submissionCycle<1
      ||typeof item.submittedAt!=='string'
      ||!Number.isFinite(Date.parse(item.submittedAt)))
      throw new TypeError('Item antrean draft PADK tidak valid.');
  }
  return data;
}

/**
 * Submission readiness is derived from server-acknowledged indicator data,
 * never from unsaved form values. The server remains the source of truth.
 */
export function getPadkDraftSubmissionReadiness({editable,dirty,busy,progress}){
  if(typeof editable!=='boolean'||typeof dirty!=='boolean'
    ||typeof busy!=='boolean'||!progress
    ||typeof progress.loaded!=='boolean'
    ||!Number.isSafeInteger(progress.total)||progress.total<0
    ||!Number.isSafeInteger(progress.complete)||progress.complete<0
    ||!Number.isSafeInteger(progress.pending)||progress.pending<0
    ||progress.complete+progress.pending!==progress.total
    ||!(progress.nextIncompleteNumber===null
      ||(Number.isInteger(progress.nextIncompleteNumber)
        &&progress.nextIncompleteNumber>0
        &&progress.nextIncompleteNumber<=progress.total)))
    throw new TypeError('Status kelengkapan pengajuan draft tidak valid.');
  if(!editable)return {canSubmit:false,canJump:false,message:''};
  if(!progress.loaded||![60,80].includes(progress.total))
    return {canSubmit:false,canJump:false,message:'Sedang memuat kelengkapan indikator draft…'};
  if(progress.pending>0){
    if(progress.nextIncompleteNumber===null)
      throw new TypeError('Daftar indikator belum lengkap tidak konsisten.');
    return {canSubmit:false,canJump:!busy&&!dirty,
      message:progress.complete+' dari '+progress.total+
        ' indikator lengkap. Masih '+progress.pending+
        ' indikator perlu peringkat sementara dan justifikasi tersimpan.'};
  }
  if(progress.nextIncompleteNumber!==null)
    throw new TypeError('Progres indikator lengkap tidak konsisten.');
  if(dirty)return {canSubmit:false,canJump:false,
    message:'Simpan perubahan yang belum tersimpan sebelum mengajukan draft.'};
  if(busy)return {canSubmit:false,canJump:false,
    message:'Sedang memproses perubahan draft…'};
  return {canSubmit:true,canJump:false,
    message:'Semua '+progress.total+
      ' indikator lengkap berdasarkan data tersimpan. Draft siap diajukan untuk pemeriksaan internal.'};
}

export function createPadkPreparationUI({api,getPermissions,getUserId,onAuthFailure}){
  const state={items:[],detail:null,workflow:null,dirty:false,busy:false,loaded:false,request:0,
    queue:[],queueMore:false,queueBusy:false,queueRequest:0};
  const canEditDraft=()=>Boolean(state.workflow&&
    ['in_progress','changes_requested'].includes(state.workflow.status));
  const previewUI=createPadkScorePreviewUI({api,onAuthFailure});
  const indicatorUI=createPadkIndicatorNoteUI({
    api,onAuthFailure,getUserId,getPermissions,canEditDraft,
    onDraftSaved:()=>{
      if(state.detail)void previewUI.load(state.detail);
      reviewMessage('');render();
    },
    onEvidenceUploaded:()=>{
      if(state.detail)void evidenceCoverageUI.reload();
    },
  });
  const evidenceCoverageUI=createPadkEvidenceCoverageUI({
    api,onAuthFailure,getPermissions,
    onOpenIndicator:number=>{
      if(state.dirty||indicatorUI.isDirty()||!state.detail)return false;
      if(!indicatorUI.openNumber(number))return false;
      $('pdk-review-disclosure').open=false;
      $('pdk-indicator-heading').focus({preventScroll:true});
      $('pdk-indicator-heading').scrollIntoView({block:'start',behavior:'smooth'});
      return true;
    },
  });
  const permitted=()=>getPermissions().includes('assessments:read');
  const writable=()=>getPermissions().includes('assessments:write');
  const owner=()=>state.detail&&writable()&&state.detail.ownerUserId===getUserId()&&canEditDraft();
  const message=(value,kind)=>{
    $('pdk-message').textContent=value??'';
    $('pdk-message').hidden=!value;
    $('pdk-message').dataset.kind=kind??'info';
  };
  const fail=(error,defaultMessage)=>{
    if(onAuthFailure(error))return;
    message(error?.message&&error instanceof TypeError?error.message:defaultMessage,'error');
  };
  const confirmLeave=()=>!state.dirty&&!indicatorUI.isDirty()||window.confirm(
    'Ada catatan yang belum disimpan. Tinggalkan halaman dan abaikan perubahan?');
  function clear(){
    state.request++;state.queueRequest++;
    state.items=[];state.detail=null;state.workflow=null;state.dirty=false;state.busy=false;
    state.loaded=false;
    state.queue=[];state.queueMore=false;state.queueBusy=false;
    $('pdk-review-queue-list').replaceChildren();
    for(const id of ['pdk-review-queue-disclosure','pdk-report-disclosure',
      'pdk-review-disclosure','pdk-preparation-history-disclosure'])$(id).open=false;
    indicatorUI.clear();previewUI.clear();evidenceCoverageUI.clear();
    $('pdk-draft-review-panel').hidden=true;
    $('pdk-review-form').reset();
    $('pdk-review-events').replaceChildren();
    if($('pdk-create-dialog').open)$('pdk-create-dialog').close();
    $('pdk-create-form').reset();createMessage('');suggestedTitle='';
    $('pdk-list-search').value='';$('pdk-list-status').value='all';
    $('pdk-detail').hidden=true;$('pdk-note-form').reset();
    $('pdk-list').replaceChildren();
    $('pdk-history').replaceChildren(text('p','Belum ada riwayat.'));
    message('');
    render();
  }
  function createMessage(value,kind='error'){
    const panel=$('pdk-create-message');
    panel.textContent=value??'';panel.hidden=!value;panel.dataset.kind=kind;
  }
  function renderList(){
    const items=state.loaded?state.items:[];
    const visible=filterPreparations(items,$('pdk-list-search').value,$('pdk-list-status').value);
    const list=$('pdk-list');
    list.replaceChildren();
    for(const item of visible){
      const row=document.createElement('tr');
      row.dataset.preparationId=item.id;
      const name=text('td','');
      name.append(text('strong',item.title),text('small',
        item.ownerUserId===getUserId()?'Penilaian saya':'Penilaian lembaga'));
      const period=text('td',item.periodStart.split('-').reverse().join('/')+' – '+
        item.periodEnd.split('-').reverse().join('/'));
      const progress=text('td','');
      const bar=document.createElement('progress');
      bar.max=item.indicatorProgress.total;bar.value=item.indicatorProgress.complete;
      bar.setAttribute('aria-label','Kelengkapan '+item.title);
      progress.append(text('span',item.indicatorProgress.complete+' / '+item.indicatorProgress.total+
        ' indikator'),bar);
      const status=text('td',''),chip=text('span',LIST_STATUS[item.reviewStatus],'status-chip');
      chip.dataset.status=item.reviewStatus;status.append(chip);
      const action=text('td',''),button=text('button','Buka','button button-outline');
      button.type='button';button.dataset.openPreparation=item.id;
      button.setAttribute('aria-label','Buka '+item.title);
      button.disabled=state.busy;action.append(button);
      row.append(name,text('td','Kategori '+item.category),period,progress,status,action);
      list.append(row);
    }
    $('pdk-stat-total').textContent=state.loaded?String(items.length):'—';
    $('pdk-stat-editing').textContent=state.loaded?String(items.filter(i=>
      ['in_progress','changes_requested'].includes(i.reviewStatus)).length):'—';
    $('pdk-stat-review').textContent=state.loaded?String(items.filter(i=>i.reviewStatus==='submitted').length):'—';
    $('pdk-first-run').hidden=!(state.loaded&&!items.length);
    $('pdk-list-empty-filter').hidden=!(state.loaded&&items.length&&!visible.length);
    $('pdk-count').textContent=state.loaded
      ?visible.length+' dari '+items.length+' catatan terbaru ditampilkan (maks. 50).'
      :state.busy?'Memuat penilaian…':'Daftar belum tersedia. Muat ulang untuk mencoba lagi.';
  }
  function render(){
    indicatorUI.sync();evidenceCoverageUI.sync();
    const review=$('pdk-draft-review-panel'),workflow=state.workflow;
    review.hidden=!state.detail;
    const phase=workflow?.status??'loading';
    const names={in_progress:'Sedang dikerjakan',submitted:'Menunggu pemeriksa',
      changes_requested:'Dikembalikan untuk perbaikan',
      draft_accepted:'Draft internal diterima, bukan approval PADK',
      loading:'Memuat status pemeriksaan…'};
    $('pdk-review-state').textContent=(names[phase]??phase)+
      (workflow?' · Siklus '+workflow.submissionCycle:'')+
      ' · Skor resmi dan laporan final belum tersedia.';
    const readiness=getPadkDraftSubmissionReadiness({
      editable:Boolean(owner()),dirty:state.dirty||indicatorUI.isDirty(),
      busy:state.busy,progress:indicatorUI.getReadiness(),
    });
    $('pdk-review-readiness').textContent=readiness.message;
    const workflowStep=!state.detail?1
      :!indicatorUI.getReadiness().loaded||indicatorUI.getReadiness().pending>0?2
        :phase==='draft_accepted'?5:phase==='submitted'?4:3;
    const guidance=[
      '',
      'Mulai: pilih kategori, periode, dan buat penilaian.',
      'Isi indikator satu per satu, pilih peringkat, ganti placeholder dengan kondisi faktual, lalu simpan.',
      'Jawaban lengkap. Lampirkan bukti yang tersedia, atau lanjutkan ke pemeriksaan draft.',
      'Draft dikirim. Pemeriksa meninjau kelengkapan dan catatan bukti.',
      'Draft internal diterima. Unduh kertas kerja, bukan laporan resmi regulator.',
    ];
    $('pdk-journey-hint').textContent=guidance[workflowStep];
    for(const item of document.querySelectorAll('[data-pdk-flow-step]')){
      const index=Number(item.dataset.pdkFlowStep);
      item.dataset.state=index<workflowStep?'done':index===workflowStep?'current':'pending';
      if(index===workflowStep)item.setAttribute('aria-current','step');
      else item.removeAttribute('aria-current');
    }
    $('pdk-review-submit').hidden=!owner();
    $('pdk-review-submit').disabled=!readiness.canSubmit;
    $('pdk-review-jump-pending').hidden=!owner()||!readiness.canJump;
    const allowedReview=Boolean(state.detail&&workflow&&phase==='submitted'
      &&getPermissions().includes('assessments:approve')
      &&state.detail.ownerUserId!==getUserId());
    $('pdk-review-form').hidden=!allowedReview;
    $('pdk-review-decision-submit').disabled=!allowedReview||state.busy;
    $('pdk-review-queue').hidden=!getPermissions().includes('assessments:approve');
    $('pdk-review-queue-disclosure').hidden=!getPermissions().includes('assessments:approve');
    $('pdk-review-queue-refresh').disabled=state.queueBusy;
    const report=$('pdk-workpaper-download');
    report.hidden=!state.detail;
    $('pdk-export-csv').hidden=!state.detail;
    report.href=state.detail
      ?ENDPOINT+'/'+encodeURIComponent(state.detail.id)+'/workpaper.pdf':'#';
    $('pdk-list-view').hidden=Boolean(state.detail);
    $('pdk-create-toggle').hidden=!writable()||Boolean(state.detail);
    $('pdk-create-toggle').disabled=state.busy||!state.loaded;
    $('pdk-back-list').hidden=!state.detail;
    $('pdk-back-list').disabled=state.busy;
    $('pdk-refresh').disabled=state.busy;
    for(const id of ['pdk-create-submit','pdk-create-cancel','pdk-create-close'])$(id).disabled=state.busy;
    $('pdk-detail').hidden=!state.detail;
    $('pdk-note-form').hidden=!state.detail;
    $('pdk-save').hidden=!owner();
    $('pdk-save').disabled=state.busy||!state.dirty;
    for(const id of ['pdk-notes','pdk-evidence-plan'])$(id).readOnly=!owner()||state.busy;
    const status=$('pdk-detail-status');
    status.textContent=LIST_STATUS[phase]??'Memuat status';
    status.dataset.status=phase;
    if(state.detail){
      $('pdk-detail-heading').textContent=state.detail.title;
      $('pdk-summary').textContent='Kategori '+state.detail.category+
        ' · '+state.detail.periodStart+' sampai '+state.detail.periodEnd+
        ' · Revisi '+state.detail.revision;
    }else{
      $('pdk-detail-heading').textContent='Penilaian keamanan siber';
      $('pdk-summary').textContent='';
      renderList();
    }
  }
  function renderQueue(){
    const list=$('pdk-review-queue-list');
    list.replaceChildren();
    if(state.queueBusy){
      list.append(text('p','Memuat draft yang menunggu pemeriksaan…'));
      return;
    }
    if(!state.queue.length){
      list.append(text('p','Tidak ada draft yang sedang menunggu pemeriksaan.'));
      return;
    }
    for(const item of state.queue){
      const row=text('div','','workspace-history-item');
      const button=text('button',item.title,'button button-outline');
      button.type='button';
      button.addEventListener('click',()=>{
        if(confirmLeave())void open(item.preparationId);
      });
      row.append(button,text('p','Kategori '+item.category+
        ' · Siklus '+item.submissionCycle+
        ' · Diajukan '+new Date(item.submittedAt).toLocaleString('id-ID')+
        ' · Kelengkapan draft internal, bukan approval PADK'));
      list.append(row);
    }
    if(state.queueMore)list.append(text('p',
      'Ditampilkan 50 draft tertua. Selesaikan antrean untuk melihat sisanya.'));
  }
  async function refreshReviewQueue(){
    if(!getPermissions().includes('assessments:approve'))return;
    const request=++state.queueRequest;
    state.queueBusy=true;renderQueue();render();
    try{
      const result=validatePadkReviewQueue(await api(REVIEW_QUEUE));
      if(request!==state.queueRequest)return;
      state.queue=result.drafts;
      state.queueMore=result.hasMore;
    }catch(error){
      if(request!==state.queueRequest)return;
      state.queue=[];state.queueMore=false;
      if(!onAuthFailure(error))message('Antrean pemeriksaan draft gagal dimuat.','error');
    }finally{
      if(request===state.queueRequest){state.queueBusy=false;renderQueue();render();}
    }
  }
  async function list(preferredId){
    if(!permitted())return;
    const request=++state.request;state.busy=true;state.loaded=false;
    message('Memuat daftar persiapan PADK…');render();
    try{
      const data=await api(ENDPOINT);
      if(request!==state.request)return;
      if(!Array.isArray(data.preparations)||data.regulatoryPackReady!==false)
        throw new TypeError('Daftar persiapan PADK tidak valid.');
      if(data.preparations.length>50)throw new TypeError('Daftar penilaian melebihi batas.');
      state.items=data.preparations.map(validatePreparationListItem);
      state.loaded=true;
      state.detail=null;state.workflow=null;state.dirty=false;
      indicatorUI.clear();previewUI.clear();evidenceCoverageUI.clear();$('pdk-note-form').reset();
      render();
      message('');
      if(request!==state.request)return;
      void refreshReviewQueue();
      if(preferredId)await open(preferredId,{focusWorkspace:true});
    }catch(error){if(request===state.request)fail(error,'Gagal memuat persiapan PADK.');}
    finally{if(request===state.request){state.busy=false;render();}}
  }
  async function history(){
    if(!state.detail)return;
    const id=state.detail.id,request=state.request;
    const panel=$('pdk-history');
    panel.replaceChildren(text('p','Memuat riwayat…'));
    try{
      const result=await api(ENDPOINT+'/'+encodeURIComponent(id)+'/history');
      if(request!==state.request||state.detail?.id!==id)return;
      panel.replaceChildren();
      if(!Array.isArray(result.events))throw new TypeError('Riwayat tidak valid.');
      for(const event of result.events){
        const row=text('div','','workspace-history-item');
        row.append(text('strong',event.action+' · Revisi '+event.revision),
          text('p','Oleh '+event.actor_user_id+' · '+new Date(event.occurred_at).toLocaleString('id-ID')));
        panel.append(row);
      }
      if(!result.events.length)panel.append(text('p','Belum ada aktivitas.'));
    }catch(error){
      if(request===state.request){panel.replaceChildren(text('p','Riwayat gagal dimuat.'));fail(error,'Riwayat gagal dimuat.');}
    }
  }
  async function open(id,{focusWorkspace=false}={}){
    if(!UUID.test(id))return;
    const request=++state.request;state.busy=true;state.detail=null;state.workflow=null;state.dirty=false;
    indicatorUI.clear();previewUI.clear();evidenceCoverageUI.clear();
    for(const id of ['pdk-report-disclosure','pdk-review-disclosure',
      'pdk-preparation-history-disclosure'])$(id).open=false;
    $('pdk-note-form').reset();render();message('Memuat catatan…');
    try{
      const data=validatePreparationResponse(await api(ENDPOINT+'/'+encodeURIComponent(id)));
      if(request!==state.request)return;
      state.detail=data;
      $('pdk-notes').value=data.preparationNotes;
      $('pdk-evidence-plan').value=data.evidencePlan;
      state.dirty=false;message('');render();
      await reviewStatus();
      if(request!==state.request)return;
      await indicatorUI.load(data);
      if(request!==state.request)return;
      evidenceCoverageUI.open(data);
      void previewUI.load(data);
      void history();
      if(focusWorkspace&&!$('pdk-indicator-section').hidden){
        $('pdk-indicator-heading').focus({preventScroll:true});
        $('pdk-indicator-heading').scrollIntoView({block:'start',behavior:'auto'});
      }
    }catch(error){if(request===state.request)fail(error,'Catatan gagal dibuka.');}
    finally{if(request===state.request){state.busy=false;render();}}
  }
  const reviewPath=()=>ENDPOINT+'/'+encodeURIComponent(state.detail.id)+'/draft-review';
  function reviewMessage(value,kind='info'){
    const panel=$('pdk-review-message');
    panel.textContent=value??'';panel.hidden=!value;panel.dataset.kind=kind;
  }
  async function reviewStatus(){
    if(!state.detail)return;
    const id=state.detail.id,request=state.request;
    const workflow=await api(reviewPath());
    if(request!==state.request||state.detail?.id!==id)return;
    if(!workflow||workflow.preparationId!==id
      ||!['in_progress','submitted','changes_requested','draft_accepted'].includes(workflow.status)
      ||workflow.officialApprovalAvailable!==false||workflow.regulatoryPackVerified!==false
      ||workflow.finalReportAvailable!==false)
      throw new TypeError('Status review draft tidak valid.');
    state.workflow=workflow;
    render();void reviewHistory();
  }
  async function reviewHistory(){
    if(!state.detail||!state.workflow)return;
    const id=state.detail.id,request=state.request;
    try{
      const res=await api(reviewPath()+'/history');
      if(request!==state.request||state.detail?.id!==id)return;
      if(!Array.isArray(res.events)||res.officialApprovalAvailable!==false)
        throw new TypeError('Histori draft tidak valid.');
      const panel=$('pdk-review-events');panel.replaceChildren();
      for(const row of res.events){
        const item=text('p',row.action+' · Siklus '+row.submission_cycle+
          ' · '+new Date(row.occurred_at).toLocaleString('id-ID')+
          (row.note?' · '+row.note:''),'workspace-help');
        panel.append(item);
      }
      if(!res.events.length)panel.append(text('p','Belum ada review draft.'));
    }catch(error){
      if(request===state.request)reviewMessage('Gagal memuat riwayat pemeriksaan.','error');
    }
  }
  $('pdk-review-refresh').addEventListener('click',()=>{void reviewStatus().catch(
    error=>fail(error,'Gagal memuat status pemeriksaan.'));});
  $('pdk-export-csv').addEventListener('click',async()=>{
    if(!state.detail)return;
    const id=state.detail.id;
    try{
      await downloadPrivateReport('/register-exports/padk/'+encodeURIComponent(id)+'.csv',
        'nusariksa-draft-padk-'+id+'.csv',{accept:'text/csv'});
      reviewMessage('Kertas kerja indikator CSV siap diunduh.','success');
    }catch(error){
      if(!onAuthFailure(error))reviewMessage(reportDownloadError(error),'error');
    }
  });
  $('pdk-workpaper-download').addEventListener('click',async event=>{
    event.preventDefault();
    if(!state.detail)return;
    const id=state.detail.id;
    try{
      await downloadPrivateReport(ENDPOINT+'/'+encodeURIComponent(id)+'/workpaper.pdf',
        'nusariksa-draft-padk-'+id+'.pdf');
      reviewMessage('Kertas kerja draft siap diunduh.','success');
    }catch(error){
      if(!onAuthFailure(error))reviewMessage(reportDownloadError(error),'error');
    }
  });
  $('pdk-review-submit').addEventListener('click',async()=>{
    const readiness=getPadkDraftSubmissionReadiness({
      editable:Boolean(owner()),dirty:state.dirty||indicatorUI.isDirty(),
      busy:state.busy,progress:indicatorUI.getReadiness(),
    });
    if(!readiness.canSubmit){
      if(owner())reviewMessage(readiness.message,'warning');
      return;
    }
    if(!await confirmAssessmentAction({title:'Ajukan kertas kerja PADK?',
      description:'Ini pemeriksaan kelengkapan draft internal, bukan pengesahan nilai resmi OJK. Jawaban akan terkunci selama pemeriksaan.',
      confirmLabel:'Ajukan draft'}))return;
    state.busy=true;render();reviewMessage('');
    try{
      await api(reviewPath()+'/submit',{method:'POST'});
      await reviewStatus();
      reviewMessage('Draft dikirim ke pemeriksa. Jawaban dan bukti dikunci sementara.','success');
    }catch(error){
      if(onAuthFailure(error))return;
      reviewMessage(error?.status===409?
        'Lengkapi seluruh indikator dan justifikasinya sebelum mengajukan draft.':
        'Gagal mengajukan draft. Periksa data dan izin.','error');
    }finally{state.busy=false;render();}
  });
  $('pdk-review-jump-pending').addEventListener('click',()=>{
    if(!owner()||state.busy||state.dirty||indicatorUI.isDirty())return;
    if(!indicatorUI.goToFirstIncomplete())return;
    $('pdk-review-disclosure').open=false;
    $('pdk-indicator-heading').focus({preventScroll:true});
    $('pdk-indicator-heading').scrollIntoView({block:'start',behavior:'smooth'});
  });
  $('pdk-review-form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(!state.detail||state.busy||state.workflow?.status!=='submitted'
      ||!getPermissions().includes('assessments:approve')
      ||state.detail.ownerUserId===getUserId())return;
    const decision=$('pdk-review-decision').value,note=$('pdk-review-note').value;
    if(!['request_changes','accept_draft'].includes(decision)||note.length>2000
      ||control.test(note)||(decision==='request_changes'&&note.trim().length<10)){
      reviewMessage('Alasan pengembalian wajib minimal 10 karakter.','error');return;
    }
    if(!await confirmAssessmentAction({
      title:decision==='accept_draft'?'Terima kelengkapan draft?':'Kembalikan draft untuk perbaikan?',
      description:'Keputusan ini hanya untuk kertas kerja internal. Persetujuan resmi instrumen PADK belum tersedia.',
      confirmLabel:decision==='accept_draft'?'Terima draft':'Kembalikan draft',
      tone:decision==='accept_draft'?'primary':'danger',
    }))return;
    state.busy=true;render();reviewMessage('');
    try{
      await api(reviewPath()+'/decision',{method:'POST',body:{decision,note}});
      $('pdk-review-form').reset();
      await reviewStatus();
      void refreshReviewQueue();
      reviewMessage(decision==='accept_draft'
        ?'Kelengkapan draft internal diterima; ini BUKAN approval resmi PADK.'
        :'Draft dikembalikan. Maker boleh memperbaiki dan mengajukan lagi.','success');
    }catch(error){
      if(onAuthFailure(error))return;
      reviewMessage('Keputusan pemeriksa gagal disimpan. Muat ulang status.','error');
    }finally{state.busy=false;render();}
  });
  $('pdk-jump-review').addEventListener('click',()=>{
    if(!state.detail||state.dirty||indicatorUI.isDirty()){
      if(!confirmLeave())return;
    }
    const panel=$('pdk-draft-review-panel');
    $('pdk-review-disclosure').open=true;
    if(!panel.hidden)panel.scrollIntoView({block:'start',behavior:'smooth'});
  });
  $('pdk-review-queue-refresh').addEventListener('click',()=>void refreshReviewQueue());
  $('pdk-refresh').addEventListener('click',()=>{
    if(state.busy||!confirmLeave())return;
    if(state.detail)void open(state.detail.id,{focusWorkspace:true});
    else void list();
  });
  $('pdk-back-list').addEventListener('click',async()=>{
    if(state.busy||!confirmLeave())return;
    await list();
    if(!state.detail)$('pdk-list-heading').focus();
  });
  $('pdk-list').addEventListener('click',event=>{
    const button=event.target.closest('button[data-open-preparation]');
    if(!button||state.busy||!confirmLeave())return;
    void open(button.dataset.openPreparation,{focusWorkspace:true});
  });
  $('pdk-list-search').addEventListener('input',renderList);
  $('pdk-list-status').addEventListener('change',renderList);
  let suggestedTitle='';
  function updateCategoryDescription(){
    const value=$('pdk-category').value;
    $('pdk-category-help').textContent=value==='1'
      ?'Kategori 1 · 80 indikator. Untuk BPR/BPRS dengan layanan digital dan/atau koneksi ke sistem aplikasi/infrastruktur TI mitra kerja.'
      :value==='2'?'Kategori 2 · 60 indikator. Untuk BPR/BPRS yang menyelenggarakan layanan perbankan dasar.'
        :'Pilih kategori sesuai karakteristik layanan BPR/BPRS. Terdapat dua kategori pada instrumen ini.';
  }
  function updatePeriodDescription(){
    const start=$('pdk-period-start').value,end=$('pdk-period-end').value;
    $('pdk-period-help').textContent=
      /^[0-9]{4}-01-01$/.test(start)&&end===start.slice(0,4)+'-12-31'
        ?'Rentang kalender tahunan disarankan otomatis; posisi penilaian tahunan adalah akhir Desember. Periksa kesesuaian tanggal untuk BPR Anda.'
        :'Tanggal diubah. Untuk penilaian tahunan, periksa kembali posisi akhir Desember; penginian dapat dilakukan sewaktu-waktu.';
  }
  function updateSuggestedTitle(force=false){
    const end=$('pdk-period-end').value;
    if(!end)return;
    const next=suggestPadkTitleFromEnd(end);
    const title=$('pdk-title');
    if(force||!title.value.trim()||title.value===suggestedTitle){
      title.value=next;
      suggestedTitle=next;
    }
  }
  function openFirstPreparation(){
    if(!writable()||state.busy||!state.loaded||state.detail)return;
    const dialog=$('pdk-create-dialog');
    if(dialog.open)return;
    $('pdk-create-form').reset();suggestedTitle='';createMessage('');
    const suggested=suggestPadkAnnualPreparation();
    if(!$('pdk-period-start').value)$('pdk-period-start').value=suggested.periodStart;
    if(!$('pdk-period-end').value)$('pdk-period-end').value=suggested.periodEnd;
    updateSuggestedTitle();updateCategoryDescription();updatePeriodDescription();
    dialog.showModal();$('pdk-category').focus();
  }
  $('pdk-category').addEventListener('change',updateCategoryDescription);
  $('pdk-title-suggest').addEventListener('click',()=>{
    updateSuggestedTitle(true);$('pdk-title').focus();
  });
  for(const id of ['pdk-period-start','pdk-period-end']){
    $(id).addEventListener('change',()=>{
      updatePeriodDescription();updateSuggestedTitle();
    });
  }
  function closeCreate(){
    if(state.busy)return;
    $('pdk-create-dialog').close();
    $('pdk-create-form').reset();suggestedTitle='';createMessage('');
    $('pdk-create-toggle').focus();
  }
  $('pdk-create-toggle').addEventListener('click',openFirstPreparation);
  $('pdk-create-cancel').addEventListener('click',closeCreate);
  $('pdk-create-close').addEventListener('click',closeCreate);
  $('pdk-create-dialog').addEventListener('cancel',event=>{
    event.preventDefault();closeCreate();
  });
  $('pdk-create-form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(!writable()||state.busy||!$('pdk-create-dialog').open)return;
    let data;
    try{
      data=validatePreparationInput({
        title:$('pdk-title').value.trim(),category:Number($('pdk-category').value),
        periodStart:$('pdk-period-start').value,periodEnd:$('pdk-period-end').value,
      });
    }catch(error){createMessage(error.message);return;}
    state.busy=true;render();createMessage('');
    const request=state.request;
    try{
      const created=validatePreparationResponse(await api(ENDPOINT,{method:'POST',body:data}));
      if(request!==state.request)return;
      $('pdk-create-dialog').close();$('pdk-create-form').reset();
      suggestedTitle='';updateCategoryDescription();updatePeriodDescription();
      await open(created.id,{focusWorkspace:true});
      if(state.detail?.id===created.id)
        message('Draft dibuat. Kerjakan indikator pertama.','success');
    }catch(error){
      if(request===state.request&&!onAuthFailure(error))
        createMessage(error?.status===400?'Periksa kategori, nama, dan tanggal periode.':
          'Gagal membuat penilaian. Periksa data dan coba kembali.');
    }finally{if(request===state.request){state.busy=false;render();}}
  });
  for(const id of ['pdk-notes','pdk-evidence-plan']){
    $(id).addEventListener('input',()=>{
      if(!owner())return;
      state.dirty=$('pdk-notes').value!==state.detail.preparationNotes
        ||$('pdk-evidence-plan').value!==state.detail.evidencePlan;
      render();
    });
  }
  $('pdk-note-form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(!owner()||!state.dirty||state.busy)return;
    const id=state.detail.id;
    const body={
      preparationNotes:$('pdk-notes').value,
      evidencePlan:$('pdk-evidence-plan').value,
      expectedRevision:state.detail.revision,
    };
    if(body.preparationNotes.length>4000||body.evidencePlan.length>4000
      ||control.test(body.preparationNotes)||control.test(body.evidencePlan)){
      message('Catatan melebihi batas atau berisi karakter yang tidak valid.','error');return;
    }
    state.busy=true;render();
    try{
      state.detail=validatePreparationResponse(await api(
        ENDPOINT+'/'+encodeURIComponent(id),{method:'PUT',body},
      ));
      state.dirty=false;render();
      message('Catatan dan rencana bukti berhasil disimpan.','success');
      void history();
    }catch(error){fail(error,'Gagal menyimpan. Muat ulang jika data sudah berubah.');}
    finally{state.busy=false;render();}
  });
  $('pdk-history-refresh').addEventListener('click',()=>void history());
  // Same unsaved-answer protection when a user reloads or closes the browser tab.
  window.addEventListener('beforeunload',event=>{
    if($('page-padk-preparations').hidden||(!state.dirty&&!indicatorUI.isDirty()))return;
    event.preventDefault();
    event.returnValue='';
  });
  render();
  return {load:()=>list(),clear,sync:render,confirmLeave};
}
