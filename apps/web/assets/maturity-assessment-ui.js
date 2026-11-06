import {
  canReadMaturityAssessments,canCreateMaturityAssessments,
  canRateMaturityAssessment,validMaturityAssessments,validMaturityDetail,
  ratingPayload,isMaturityAssessmentId,
  canSubmitMaturityAssessment,canReviewMaturityAssessment,
  validMaturityReviewQueue,reviewDecisionPayload,validMaturityReviewHistory,
} from './maturity-assessment-model.js';
import {parseMaturityModels,parseMaturityVersions,parseMaturityRubric} from './maturity-model.js';

const $=id=>document.getElementById(id);
const node=(tag,className,text)=>{
  const result=document.createElement(tag);
  if(className)result.className=className;
  if(text!=null)result.textContent=String(text);
  return result;
};
const option=(label,value)=>{
  const o=document.createElement('option');o.textContent=label;o.value=value;return o;
};

export function createMaturityAssessmentUI({
  api,getPermissions,getUserId,onAuthFailure,
}){
  const state={
    assessments:null,activeId:null,detail:null,selectedDomainId:null,
    models:null,versions:null,busy:false,generation:0,createGeneration:0,
    createOpen:false,dirty:false,queue:null,queueGeneration:0,
  };
  const allowed=()=>canReadMaturityAssessments(getPermissions());
  const writable=()=>canCreateMaturityAssessments(getPermissions());
  const owner=()=>state.detail&&canRateMaturityAssessment(
    getPermissions(),getUserId(),state.detail.ownerUserId)
    &&['in_progress','changes_requested'].includes(state.detail.review?.status);
  const queueAllowed=()=>allowed()&&getPermissions().includes('assessments:approve');
  const canSubmit=()=>canSubmitMaturityAssessment(getPermissions(),getUserId(),state.detail);
  const canReview=()=>canReviewMaturityAssessment(getPermissions(),getUserId(),state.detail);
  const selected=()=>state.detail?.domains.find(d=>d.id===state.selectedDomainId)??null;

  function message(value,kind='info'){
    const element=$('ma-message');
    element.textContent=value??'';
    element.hidden=!value;
    element.dataset.kind=kind;
  }
  function confirmLeave(){
    if(!state.dirty)return true;
    return window.confirm('Perubahan penilaian domain belum disimpan. Buang perubahan?');
  }
  function resetDetail(){
    state.generation++;
    state.detail=null;state.selectedDomainId=null;state.dirty=false;
    $('ma-detail').hidden=true;
    $('ma-history').replaceChildren(node('p','empty-note','Belum ada riwayat penilaian.'));
    $('ma-review-history').replaceChildren(node('p','empty-note','Belum ada riwayat pemeriksaan.'));
  }
  function clear(){
    state.generation++;state.createGeneration++;state.queueGeneration++;
    state.assessments=null;state.queue=null;state.activeId=null;state.models=null;
    state.versions=null;state.detail=null;state.selectedDomainId=null;
    state.busy=false;state.createOpen=false;state.dirty=false;
    $('ma-create-form').reset();$('ma-rating-form').reset();$('ma-review-form').reset();
    $('ma-create-model').replaceChildren(option('Pilih model',''));
    $('ma-create-version').replaceChildren(option('Pilih versi terbit',''));
    $('ma-detail').hidden=true;
    message('');
    renderList();renderQueue();renderActions();
  }
  function renderList(){
    const root=$('ma-assessment-select');
    root.replaceChildren(option(state.assessments?'Pilih asesmen':'Memuat asesmen…',''));
    for(const a of state.assessments??[])
      root.add(option(a.title+' · '+a.model_code+' / v'+a.version,a.id));
    root.value=state.activeId??'';
    root.disabled=state.busy||!state.assessments?.length;
    $('ma-open').disabled=state.busy||!state.assessments?.length;
  }
  function renderQueue(){
    const panel=$('ma-review-queue-panel');
    panel.hidden=!queueAllowed();
    if(!queueAllowed())return;
    const root=$('ma-review-queue');root.replaceChildren();
    const rows=state.queue;
    $('ma-review-queue-count').textContent=rows?rows.length+' menunggu pemeriksaan':'Memuat antrean…';
    if(!rows?.length){
      const tr=node('tr'),td=node('td','table-empty',
        rows?'Tidak ada pengajuan maturitas yang menunggu pemeriksaan.':'Memuat antrean…');
      td.colSpan=4;tr.append(td);root.append(tr);return;
    }
    for(const item of rows){
      const tr=node('tr');
      const action=node('td');
      const button=node('button','detail-link','Periksa');
      button.type='button';button.dataset.maReviewId=item.id;
      button.setAttribute('aria-label','Periksa penilaian '+item.title);
      button.disabled=state.busy;
      action.append(button);
      tr.append(node('td','',item.title),
        node('td','table-date',item.periodStart+' – '+item.periodEnd),
        node('td','',String(item.submissionCycle)),action);
      root.append(tr);
    }
  }
  async function loadQueue(){
    if(!queueAllowed())return;
    const gen=++state.queueGeneration;
    state.queue=null;renderQueue();
    try{
      const rows=validMaturityReviewQueue(await api('/maturity-assessments/review-queue'));
      if(gen!==state.queueGeneration||!queueAllowed())return;
      state.queue=rows;renderQueue();
    }catch(error){
      if(gen!==state.queueGeneration)return;
      state.queue=[];renderQueue();
      failure(error,'Antrean pemeriksa gagal dimuat.');
    }
  }
  function renderActions(){
    $('ma-create-toggle').hidden=!writable();
    $('ma-create-form').hidden=!writable()||!state.createOpen;
    $('ma-create-submit').disabled=state.busy;
    $('ma-refresh').disabled=state.busy;
    $('ma-rating-save').disabled=state.busy||!owner()||!state.dirty;
    $('ma-rating-form').hidden=!selected()||!owner();
    $('ma-history-refresh').hidden=!selected()||selected().revision===0;
    $('ma-submit').hidden=!canSubmit();
    $('ma-submit').disabled=state.busy;
    $('ma-review-form').hidden=!canReview();
    $('ma-review-save').disabled=state.busy;
    $('ma-review-queue-refresh').disabled=state.busy;
  }
  function renderCriteria(){
    const domain=selected();
    const list=$('ma-criteria');
    list.replaceChildren();
    $('ma-domain-name').textContent=domain
      ?domain.code+' · '+domain.title+(domain.description?' — '+domain.description:'')
      :'Pilih domain untuk menampilkan kriteria.';
    if(!domain){
      $('ma-rating-form').hidden=true;
      $('ma-history-refresh').hidden=true;
      return;
    }
    for(const c of domain.criteria){
      const row=node('div','ma-criterion');
      row.classList.toggle('is-selected',domain.level===c.level);
      row.append(node('strong','', 'Level '+c.level),node('p','',c.criterion));
      list.append(row);
    }
    $('ma-rating-level').value=domain.level===null?'':String(domain.level);
    $('ma-rating-justification').value=domain.justification??'';
    $('ma-rating-evidence').value=domain.evidenceId??'';
    $('ma-rating-level').disabled=!owner();
    $('ma-rating-justification').readOnly=!owner();
    $('ma-rating-evidence').readOnly=!owner();
    state.dirty=false;
    const link=$('ma-evidence-link');
    link.replaceChildren();
    if(domain.evidenceId&&domain.evidenceAssessmentId){
      const a=node('a','detail-link','Unduh bukti: '+(domain.evidenceFileName??domain.evidenceId));
      a.href='/assessments/'+encodeURIComponent(domain.evidenceAssessmentId)+
        '/evidence/'+encodeURIComponent(domain.evidenceId)+'/download';
      link.append(a);
    }else if(domain.evidenceId){
      link.textContent='Bukti terlampir: '+domain.evidenceId;
    }else{
      link.textContent='Belum ada bukti pendukung yang ditautkan.';
    }
    renderActions();
  }
  function renderDetail(){
    const data=state.detail;
    $('ma-detail').hidden=!data;
    if(!data){renderActions();return;}
    const summary=data.summary;
    $('ma-detail-title').textContent=data.title;
    $('ma-detail-meta').textContent=data.model.code+' · '+data.model.title+
      ' / v'+data.model.version+' · Periode '+data.periodStart+' – '+data.periodEnd+
      ' · Metodologi: '+data.model.methodologyReference;
    $('ma-total').textContent=String(summary.totalDomains);
    $('ma-assessed').textContent=String(summary.assessedDomains);
    $('ma-unassessed').textContent=String(summary.unassessedDomains);
    $('ma-level').textContent=summary.complete?'Level '+summary.overallLevel:'—';
    const status=data.review?.status??'in_progress';
    const labels={in_progress:'Sedang dikerjakan',submitted:'Menunggu review',
      changes_requested:'Perlu perbaikan',approved:'Disetujui internal'};
    $('ma-overall').textContent=summary.complete
      ?'Level internal '+summary.overallLevel+' · '+(labels[status]??status)
      :'Belum lengkap';
    $('ma-overall').dataset.final=String(status==='approved');
    $('ma-review-state').textContent='Status: '+(labels[status]??status)+
      ' · Siklus pengajuan: '+(data.review?.submissionCycle??0);
    $('ma-method').textContent=summary.methodLabel+' · '+
      (summary.complete?'Semua domain telah dinilai.':'Agregat belum tersedia sebelum semua domain dinilai.');
    $('ma-domains-count').textContent=data.domains.length+' domain';
    const list=$('ma-domain-list');list.replaceChildren();
    for(const domain of data.domains){
      const button=node('button','maturity-domain-item');
      button.type='button';button.dataset.domainId=domain.id;
      button.classList.toggle('is-selected',state.selectedDomainId===domain.id);
      button.setAttribute('aria-pressed',String(domain.id===state.selectedDomainId));
      button.append(node('strong','',domain.code),node('span','',domain.title),
        node('small','',domain.level===null?'Belum dinilai':'Level '+domain.level+' · Revisi '+domain.revision));
      button.disabled=state.busy;
      list.append(button);
    }
    renderCriteria();renderActions();
  }
  async function reviewHistory(){
    if(!state.detail||!allowed())return;
    const gen=state.generation,id=state.detail.id;
    const root=$('ma-review-history');
    root.replaceChildren(node('p','empty-note','Memuat riwayat pemeriksaan…'));
    try{
      const data=validMaturityReviewHistory(
        await api('/maturity-assessments/'+encodeURIComponent(id)+'/reviews'),id);
      if(gen!==state.generation||state.detail?.id!==id)return;
      root.replaceChildren();
      if(!data.events.length)root.append(node('p','empty-note','Belum ada pengajuan atau keputusan.'));
      for(const entry of data.events){
        const item=node('div','workspace-history-item');
        const action={SUBMITTED:'Diajukan',APPROVED:'Disetujui internal',
          CHANGES_REQUESTED:'Dikembalikan untuk perbaikan'}[entry.action]??entry.action;
        item.append(node('strong','',action+' · Siklus '+entry.submission_cycle),
          node('p','',entry.note||'Tanpa catatan.'),
          node('small','',(entry.occurred_at?new Date(entry.occurred_at).toLocaleString('id-ID'):'—')+
            ' · Aktor: '+entry.actor_user_id));
        root.append(item);
      }
    }catch(error){
      if(gen!==state.generation)return;
      if(onAuthFailure(error))return;
      root.replaceChildren(node('p','empty-note','Riwayat pemeriksaan gagal dimuat.'));
    }
  }
  function failure(error,defaultText){
    if(onAuthFailure(error))return;
    const status=error?.status;
    message(status===403?'Akses ditolak oleh server.'
      :status===404?'Asesmen, domain, atau bukti tidak ditemukan.'
      :status===409?'Konflik revisi atau status metodologi. Salin justifikasi lokal bila perlu, lalu muat ulang.'
      :error instanceof TypeError?error.message
      :defaultText,'error');
  }
  async function loadList(preferred=state.activeId){
    if(!allowed()||state.busy)return;
    if(queueAllowed())void loadQueue();
    const gen=++state.generation;
    state.assessments=null;state.detail=null;state.activeId=null;
    state.selectedDomainId=null;state.dirty=false;
    $('ma-detail').hidden=true;message('');renderList();
    try{
      const data=validMaturityAssessments(await api('/maturity-assessments'));
      if(gen!==state.generation||!allowed())return;
      state.assessments=data;
      const chosen=data.find(x=>x.id===preferred)?.id??data[0]?.id??null;
      state.activeId=chosen;
      renderList();
      if(chosen)await open(chosen);
    }catch(error){
      if(gen!==state.generation)return;
      state.assessments=null;renderList();
      failure(error,'Daftar asesmen maturitas tidak dapat dimuat.');
    }
  }
  async function open(id,preferredDomain=null){
    if(!allowed()||state.busy||!isMaturityAssessmentId(id)||!confirmLeave())return;
    const gen=++state.generation;
    state.activeId=id;state.detail=null;state.selectedDomainId=null;state.dirty=false;
    $('ma-detail').hidden=true;message('Memuat asesmen maturitas…');renderList();
    try{
      const data=validMaturityDetail(await api('/maturity-assessments/'+encodeURIComponent(id)),id);
      if(gen!==state.generation||!allowed())return;
      state.detail=data;
      state.selectedDomainId=data.domains.find(d=>d.id===preferredDomain)?.id??
        data.domains[0]?.id??null;
      message('');
      renderDetail();
      if(selected()?.revision>0)void history();
      void reviewHistory();
    }catch(error){
      if(gen!==state.generation)return;
      state.detail=null;renderDetail();
      failure(error,'Detail asesmen maturitas gagal dimuat.');
    }
  }
  async function models(){
    if(!writable())return;
    const gen=++state.createGeneration;
    state.models=null;state.versions=null;
    $('ma-create-model').replaceChildren(option('Memuat model…',''));
    $('ma-create-version').replaceChildren(option('Pilih model terlebih dahulu',''));
    try{
      const found=parseMaturityModels(await api('/maturity-models'));
      if(gen!==state.createGeneration||!writable())return;
      state.models=found;
      const root=$('ma-create-model');root.replaceChildren(option('Pilih model',''));
      for(const m of found)root.add(option(m.code+' · '+m.title,m.id));
    }catch(error){
      if(gen!==state.createGeneration)return;
      failure(error,'Model maturitas gagal dimuat.');
    }
  }
  async function versions(id){
    if(!writable()||!state.models?.some(x=>x.id===id))return;
    const gen=++state.createGeneration;
    const root=$('ma-create-version');
    root.replaceChildren(option('Memuat versi terbit…',''));
    state.versions=null;
    try{
      const data=parseMaturityVersions(await api('/maturity-models/'+encodeURIComponent(id)+'/versions'));
      if(gen!==state.createGeneration)return;
      state.versions=data.filter(x=>x.status==='published');
      root.replaceChildren(option('Pilih versi terbit',''));
      for(const version of state.versions)
        root.add(option('Versi '+version.version,version.id));
      if(!state.versions.length)
        message('Model belum memiliki versi terbit. Siapkan metodologi di menu Metodologi Maturitas.','warning');
    }catch(error){
      if(gen!==state.createGeneration)return;
      root.replaceChildren(option('Versi gagal dimuat',''));
      failure(error,'Versi metodologi gagal dimuat.');
    }
  }
  async function perform(action,after,success){
    if(!writable()||state.busy)return;
    const gen=state.generation;
    state.busy=true;renderActions();
    try{
      const result=await action();
      if(gen!==state.generation||!allowed())return;
      state.busy=false;
      await after(result);
      if(allowed())message(success,'success');
    }catch(error){
      if(gen===state.generation)failure(error,'Operasi asesmen maturitas gagal.');
    }finally{state.busy=false;renderActions();}
  }
  async function history(){
    const domain=selected();
    if(!domain||!state.activeId||domain.revision===0)return;
    const gen=state.generation,id=domain.id;
    $('ma-history').replaceChildren(node('p','empty-note','Memuat riwayat revisi…'));
    try{
      const payload=await api('/maturity-assessments/'+encodeURIComponent(state.activeId)+
        '/domains/'+encodeURIComponent(id)+'/history');
      if(gen!==state.generation||selected()?.id!==id)return;
      if(!payload||!Array.isArray(payload.history))throw new TypeError('Riwayat tidak valid');
      const list=$('ma-history');list.replaceChildren();
      if(!payload.history.length)list.append(node('p','empty-note','Belum ada riwayat.'));
      for(const entry of payload.history){
        const item=node('div','workspace-history-item');
        item.append(node('strong','','Revisi '+entry.revision+' · Level '+entry.level),
          node('p','',entry.justification),
          node('small','',entry.occurredAt?new Date(entry.occurredAt).toLocaleString('id-ID'):'—'));
        list.append(item);
      }
    }catch(error){
      if(gen!==state.generation)return;
      if(onAuthFailure(error))return;
      $('ma-history').replaceChildren(node('p','empty-note','Riwayat tidak dapat dimuat.'));
    }
  }

  $('ma-review-queue-refresh').addEventListener('click',()=>void loadQueue());
  $('ma-review-queue').addEventListener('click',event=>{
    const button=event.target.closest?.('[data-ma-review-id]');
    if(button&&$('ma-review-queue').contains(button))
      void open(button.dataset.maReviewId);
  });
  $('ma-submit').addEventListener('click',()=>{
    if(!canSubmit()||state.busy||!confirmLeave())return;
    const id=state.detail.id;
    if(!window.confirm('Ajukan seluruh hasil penilaian untuk diperiksa? Hasil terkunci sampai dikembalikan.'))return;
    void perform(()=>api('/maturity-assessments/'+encodeURIComponent(id)+'/submit',
      {method:'POST'}),async()=>{
      await open(id);
      if(queueAllowed())await loadQueue();
    },'Penilaian berhasil diajukan ke pemeriksa.');
  });
  $('ma-review-form').addEventListener('submit',event=>{
    event.preventDefault();
    if(!canReview()||state.busy)return;
    let body;
    try{
      body=reviewDecisionPayload($('ma-review-decision').value,$('ma-review-note').value);
    }catch(error){message(error.message,'error');return;}
    if(!window.confirm(body.decision==='approve'
      ?'Setujui penilaian maturitas internal ini? Keputusan akan mengunci hasil.'
      :'Kembalikan penilaian kepada pembuat untuk perbaikan?'))return;
    const id=state.detail.id,gen=state.generation;
    state.busy=true;renderActions();
    void (async()=>{
      try{
        await api('/maturity-assessments/'+encodeURIComponent(id)+'/review',{method:'POST',body});
        if(gen!==state.generation)return;
        state.busy=false;$('ma-review-form').reset();
        await open(id);
        if(queueAllowed())await loadQueue();
        message('Keputusan pemeriksaan berhasil dicatat.','success');
      }catch(error){
        if(gen===state.generation)failure(error,'Gagal menyimpan keputusan pemeriksaan.');
      }finally{state.busy=false;renderActions();}
    })();
  });
  $('ma-review-history-refresh').addEventListener('click',()=>void reviewHistory());
  $('ma-refresh').addEventListener('click',()=>{
    if(confirmLeave())void loadList();
  });
  $('ma-assessment-select').addEventListener('change',event=>{
    if(!confirmLeave()){event.target.value=state.activeId??'';return;}
    void open(event.target.value);
  });
  $('ma-open').addEventListener('click',()=>void open($('ma-assessment-select').value));
  $('ma-create-toggle').addEventListener('click',()=>{
    if(!writable())return;
    state.createOpen=!state.createOpen;
    renderActions();
    if(state.createOpen)void models();
  });
  $('ma-create-model').addEventListener('change',event=>void versions(event.target.value));
  $('ma-create-form').addEventListener('submit',event=>{
    event.preventDefault();
    if(!writable())return;
    const versionId=$('ma-create-version').value;
    if(!isMaturityAssessmentId(versionId)){
      message('Pilih versi metodologi terbit.','error');return;
    }
    const input={
      modelVersionId:versionId,
      title:$('ma-create-title').value.trim(),
      periodStart:$('ma-create-start').value,
      periodEnd:$('ma-create-end').value,
    };
    void perform(async()=>{
      const rubric=parseMaturityRubric(
        await api('/maturity-versions/'+encodeURIComponent(versionId)+'/domains'),versionId);
      if(!rubric.aggregationMethod)
        throw new TypeError('Versi terbit ini belum memiliki metode agregasi. Buat versi Draft baru dan pilih metode terlebih dahulu.');
      return api('/maturity-assessments',{method:'POST',body:input});
    },async result=>{
      state.createOpen=false;$('ma-create-form').reset();
      await loadList(result.id);
    },'Asesmen maturitas berhasil dibuat.');
  });
  $('ma-domain-list').addEventListener('click',event=>{
    const target=event.target.closest?.('[data-domain-id]');
    if(!target||!$('ma-domain-list').contains(target)||state.busy||!confirmLeave())return;
    state.selectedDomainId=target.dataset.domainId;
    renderDetail();
    $('ma-history').replaceChildren(node('p','empty-note','Klik Muat riwayat untuk menampilkan perubahan.'));
  });
  for(const id of ['ma-rating-level','ma-rating-justification','ma-rating-evidence']){
    $(id).addEventListener('input',()=>{
      const domain=selected();if(!domain)return;
      state.dirty=$('ma-rating-level').value!==(domain.level===null?'':String(domain.level))
        ||$('ma-rating-justification').value!==(domain.justification??'')
        ||$('ma-rating-evidence').value!==(domain.evidenceId??'');
      renderActions();
    });
  }
  $('ma-rating-form').addEventListener('submit',event=>{
    event.preventDefault();
    const domain=selected();
    if(!domain||!owner()||!state.dirty)return;
    let body;
    try{
      body=ratingPayload({
        level:$('ma-rating-level').value,
        justification:$('ma-rating-justification').value,
        evidenceId:$('ma-rating-evidence').value.trim(),
        expectedRevision:domain.revision,
      });
    }catch(error){message(error.message,'error');return;}
    const a=state.activeId,d=domain.id;
    void perform(()=>api('/maturity-assessments/'+encodeURIComponent(a)+
      '/domains/'+encodeURIComponent(d),{method:'PUT',body}),
    async()=>{
      state.dirty=false;
      await open(a,d);
    },'Penilaian domain dan riwayat revisi berhasil disimpan.');
  });
  $('ma-history-refresh').addEventListener('click',()=>void history());
  return {
    load:loadList,clear,confirmLeave,
    sync(){
      $('maturity-assessments-menu').hidden=!allowed();
      if(!allowed()){clear();return;}
      renderActions();renderQueue();
    },
  };
}
