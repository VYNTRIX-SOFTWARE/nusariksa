import {createPadkIndicatorNoteUI} from './padk-indicator-note-ui.js';
import {createPadkScorePreviewUI} from './padk-score-preview-ui.js';

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
export function createPadkPreparationUI({api,getPermissions,getUserId,onAuthFailure}){
  const state={items:[],detail:null,workflow:null,dirty:false,busy:false,loaded:false,request:0,
    queue:[],queueMore:false,queueBusy:false,queueRequest:0};
  const canEditDraft=()=>Boolean(state.workflow&&
    ['in_progress','changes_requested'].includes(state.workflow.status));
  const previewUI=createPadkScorePreviewUI({api,onAuthFailure});
  const indicatorUI=createPadkIndicatorNoteUI({
    api,onAuthFailure,getUserId,getPermissions,canEditDraft,
    onDraftSaved:()=>{if(state.detail)void previewUI.load(state.detail);},
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
    indicatorUI.clear();previewUI.clear();
    $('pdk-draft-review-panel').hidden=true;
    $('pdk-review-form').reset();
    $('pdk-review-events').replaceChildren();
    $('pdk-create-form').hidden=true;$('pdk-create-form').reset();
    $('pdk-detail').hidden=true;$('pdk-note-form').reset();
    $('pdk-list').replaceChildren();
    $('pdk-history').replaceChildren(text('p','Belum ada riwayat.'));
    message('');
    render();
  }
  function render(){
    indicatorUI.sync();
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
    const allowedSubmit=owner()&&!state.dirty&&!indicatorUI.isDirty()&&!state.busy;
    $('pdk-review-submit').hidden=!allowedSubmit;
    $('pdk-review-submit').disabled=!allowedSubmit;
    const allowedReview=Boolean(state.detail&&workflow&&phase==='submitted'
      &&getPermissions().includes('assessments:approve')
      &&state.detail.ownerUserId!==getUserId());
    $('pdk-review-form').hidden=!allowedReview;
    $('pdk-review-decision-submit').disabled=!allowedReview||state.busy;
    $('pdk-review-queue').hidden=!getPermissions().includes('assessments:approve');
    $('pdk-review-queue-refresh').disabled=state.queueBusy;
    const report=$('pdk-workpaper-download');
    report.hidden=!state.detail;
    report.href=state.detail
      ?ENDPOINT+'/'+encodeURIComponent(state.detail.id)+'/workpaper.pdf':'#';
    $('pdk-first-run').hidden=!(state.loaded&&state.items.length===0&&writable());
    $('pdk-empty-start').disabled=state.busy;
    $('pdk-create-toggle').hidden=!writable();
    $('pdk-create-toggle').disabled=state.busy;
    $('pdk-detail').hidden=!state.detail;
    $('pdk-note-form').hidden=!state.detail;
    $('pdk-save').hidden=!owner();
    $('pdk-save').disabled=state.busy||!state.dirty;
    for(const id of ['pdk-notes','pdk-evidence-plan'])$(id).readOnly=!owner()||state.busy;
    const sel=$('pdk-list');
    const current=state.detail?.id??'';
    sel.replaceChildren(new Option('Pilih persiapan…',''));
    for(const item of state.items)sel.add(new Option(
      item.title+' — Kategori '+item.category+' · '+item.periodStart,item.id));
    // An older pending draft can lie outside the latest 50 preparations.
    if(state.detail&&!state.items.some(i=>i.id===current))
      sel.add(new Option(state.detail.title+' — Dibuka dari antrean review',current));
    sel.value=current;
    if(state.detail){
      $('pdk-summary').textContent=
        state.detail.title+' · Kategori '+state.detail.category+
        ' · '+state.detail.periodStart+' sampai '+state.detail.periodEnd+
        ' · Revisi '+state.detail.revision;
    }else $('pdk-summary').textContent='Pilih catatan persiapan untuk melanjutkan.';
    $('pdk-count').textContent=state.items.length+' persiapan terbaru ditampilkan (maks. 50).';
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
      state.items=data.preparations.map(validatePreparationResponse);
      state.loaded=true;
      state.detail=null;state.workflow=null;state.dirty=false;
      indicatorUI.clear();previewUI.clear();$('pdk-note-form').reset();
      render();
      message('');
      if(request!==state.request)return;
      void refreshReviewQueue();
      if(preferredId)await open(preferredId);
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
  async function open(id){
    if(!UUID.test(id))return;
    const request=++state.request;state.busy=true;state.detail=null;state.workflow=null;state.dirty=false;
    indicatorUI.clear();previewUI.clear();
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
      void indicatorUI.load(data);
      void previewUI.load(data);
      void history();
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
  $('pdk-review-submit').addEventListener('click',async()=>{
    if(!owner()||state.busy||state.dirty||indicatorUI.isDirty())return;
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
    if(!panel.hidden)panel.scrollIntoView({block:'start',behavior:'smooth'});
  });
  $('pdk-review-queue-refresh').addEventListener('click',()=>void refreshReviewQueue());
  $('pdk-refresh').addEventListener('click',()=>{if(confirmLeave())void list();});
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
    if(!writable()||state.busy)return;
    $('pdk-create-form').hidden=false;
    const suggested=suggestPadkAnnualPreparation();
    if(!$('pdk-period-start').value)$('pdk-period-start').value=suggested.periodStart;
    if(!$('pdk-period-end').value)$('pdk-period-end').value=suggested.periodEnd;
    updateSuggestedTitle();updateCategoryDescription();updatePeriodDescription();
    $('pdk-category').focus();
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
  $('pdk-empty-start').addEventListener('click',openFirstPreparation);
  $('pdk-create-toggle').addEventListener('click',()=>{
    if(!writable())return;
    if($('pdk-create-form').hidden)openFirstPreparation();
    else $('pdk-create-form').hidden=true;
  });
  $('pdk-create-form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(!writable()||state.busy)return;
    let data;
    try{
      data=validatePreparationInput({
        title:$('pdk-title').value.trim(),category:Number($('pdk-category').value),
        periodStart:$('pdk-period-start').value,periodEnd:$('pdk-period-end').value,
      });
    }catch(error){message(error.message,'error');return;}
    state.busy=true;render();
    try{
      const created=validatePreparationResponse(await api(ENDPOINT,{method:'POST',body:data}));
      $('pdk-create-form').reset();$('pdk-create-form').hidden=true;
      suggestedTitle='';updateCategoryDescription();updatePeriodDescription();
      await list(created.id);
      message('Persiapan berhasil dibuat. Isi rencana kerja dan bukti yang perlu disiapkan.','success');
    }catch(error){fail(error,'Gagal membuat persiapan PADK.');}
    finally{state.busy=false;render();}
  });
  $('pdk-list').addEventListener('change',event=>{
    if(!confirmLeave()){event.target.value=state.detail?.id??'';return;}
    if(event.target.value)void open(event.target.value);
    else{state.detail=null;state.workflow=null;state.dirty=false;indicatorUI.clear();previewUI.clear();render();}
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
