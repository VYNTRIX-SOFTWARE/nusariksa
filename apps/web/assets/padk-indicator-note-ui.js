import {createPadkEvidenceUI} from './padk-evidence-ui.js';
import {createPadkCriteriaPanel} from './padk-criteria-panel.js';

const $=id=>document.getElementById(id);
const ENDPOINT='/regulatory/padk43/cyber/preparations';
const CONTROL=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const element=(tag,content)=>{
  const n=document.createElement(tag);n.textContent=String(content??'');return n;
};
export function validateDraftIndicatorList(data,category){
  const expected=category===1?80:category===2?60:0;
  if(!expected||!data||data.category!==category
    ||data.catalogStatus!=='DRAFT_UNVERIFIED'||data.sourcePdfVerified!==false
    ||data.scoringAvailable!==false||data.approvalAvailable!==false
    ||!Array.isArray(data.indicators)||data.indicators.length!==expected)
    throw new TypeError('Data indikator masih belum tersedia secara aman.');
  for(let index=0;index<data.indicators.length;index++){
    const item=data.indicators[index];
    if(item.number!==index+1||typeof item.workingSummary!=='string'
      ||item.workingSummary.length<8
      ||!Number.isSafeInteger(item.printedPage)||item.printedPage<16
      ||item.printedPage>37
      ||!Number.isSafeInteger(item.revision)||item.revision<0
      ||typeof item.preparationNotes!=='string'
      ||typeof item.evidencePlan!=='string'
      ||typeof item.justification!=='string'
      ||!(item.provisionalRank===null||(Number.isInteger(item.provisionalRank)
        &&item.provisionalRank>=1&&item.provisionalRank<=5))
      ||(item.provisionalRank!==null&&item.justification.trim().length<20)
      ||item.rankIsOfficial!==false||item.criteriaVerified!==false
      ||item.status!=='WORKING_NOTES_UNVERIFIED'
      ||item.scoringAvailable!==false
      ||Object.hasOwn(item,'rank')||Object.hasOwn(item,'rating')
      ||Object.hasOwn(item,'rankCriteria'))
      throw new TypeError('Format indikator draft tidak valid.');
  }
  return data.indicators;
}
// Progress follows the actual server submission requirement: rank + >=20-character justification.
// Notes, evidence plans, and file uploads do not substitute for a provisional rank.
export function isDraftIndicatorComplete(item){
  return Number.isInteger(item?.provisionalRank)
    &&item.provisionalRank>=1&&item.provisionalRank<=5
    &&typeof item.justification==='string'&&item.justification.trim().length>=20;
}
export function summarizeDraftIndicatorProgress(items){
  if(!Array.isArray(items))throw new TypeError('Invalid indicator progress data');
  const complete=items.filter(isDraftIndicatorComplete).length;
  const noted=items.filter(x=>x.revision>0).length;
  return {total:items.length,complete,pending:items.length-complete,noted};
}
export function nextPendingDraftIndicator(items,currentNumber=0){
  if(!Array.isArray(items))throw new TypeError('Invalid indicator progress data');
  const pending=items.filter(x=>!isDraftIndicatorComplete(x));
  return pending.find(x=>x.number>currentNumber)?.number??pending[0]?.number??null;
}
// Filtering changes navigation only; all indicators remain in the assessment.
export function filterDraftIndicators(items,{query='',status='all'}={}){
  if(!Array.isArray(items)||typeof query!=='string'
    ||!['all','pending','complete'].includes(status))
    throw new TypeError('Filter indikator tidak valid.');
  const term=query.trim().toLocaleLowerCase('id-ID');
  return items.filter(item=>{
    if(status==='pending'&&isDraftIndicatorComplete(item))return false;
    if(status==='complete'&&!isDraftIndicatorComplete(item))return false;
    if(!term)return true;
    if(/^[0-9]+$/.test(term))return String(item.number)===String(Number(term));
    return String(item.workingSummary??'').toLocaleLowerCase('id-ID').includes(term);
  });
}
export function createPadkIndicatorNoteUI({api,onAuthFailure,getUserId,getPermissions,canEditDraft=()=>true,onDraftSaved=()=>{}}){
  const state={preparation:null,items:[],active:null,dirty:false,busy:false,request:0,
    search:'',filter:'all'};
  const evidenceUI=createPadkEvidenceUI({api,onAuthFailure,getUserId,getPermissions,canEditDraft});
  const owner=()=>Boolean(state.preparation
    &&state.preparation.ownerUserId===getUserId()
    &&getPermissions().includes('assessments:write')&&canEditDraft());
  const criteriaUI=createPadkCriteriaPanel({api,onAuthFailure,
    canSelect:()=>owner()&&!state.busy});
  const message=(value,kind)=>{
    $('pdk-indicator-message').textContent=value??'';
    $('pdk-indicator-message').hidden=!value;
    $('pdk-indicator-message').dataset.kind=kind??'info';
  };
  const fail=(error,fallback)=>{
    if(onAuthFailure(error))return;
    message(error instanceof TypeError?error.message:fallback,'error');
  };
  function render(){
    evidenceUI.sync();criteriaUI.sync();
    $('pdk-indicator-section').hidden=!state.preparation;
    $('pdk-indicator-form').hidden=!state.active;
    $('pdk-indicator-save').hidden=!owner();
    $('pdk-indicator-save-next').hidden=!owner();
    $('pdk-indicator-save').disabled=state.busy||!state.dirty;
    $('pdk-indicator-save-next').disabled=state.busy||!state.dirty;
    $('pdk-indicator-list').disabled=state.busy||!state.items.length;
    $('pdk-indicator-search').disabled=state.busy||!state.items.length;
    $('pdk-indicator-status-filter').disabled=state.busy||!state.items.length;
    $('pdk-indicator-filter-reset').disabled=state.busy
      ||(!state.search&&state.filter==='all');
    $('pdk-indicator-rank').disabled=!owner()||state.busy;
    for(const id of ['pdk-indicator-notes','pdk-indicator-evidence','pdk-indicator-justification']){
      $(id).readOnly=!owner()||state.busy;
    }
    const progress=summarizeDraftIndicatorProgress(state.items),active=state.active;
    $('pdk-indicator-position').textContent=active
      ?'INDIKATOR '+String(active.number).padStart(2,'0')+' / '+progress.total
      :'PILIH INDIKATOR';
    $('pdk-indicator-title').textContent=active?.workingSummary??'Indikator belum dipilih';
    const status=state.dirty?'Perubahan belum disimpan'
      :!active?'Belum dipilih'
      :isDraftIndicatorComplete(active)?'Lengkap untuk draft internal'
      :active.revision>0?'Catatan tersimpan · belum lengkap':'Belum diisi';
    $('pdk-indicator-state').textContent=status;
    $('pdk-indicator-state').dataset.kind=state.dirty?'dirty'
      :active&&isDraftIndicatorComplete(active)?'complete':'pending';
    $('pdk-indicator-save-state').textContent=state.dirty
      ?'Perubahan di formulir belum tersimpan. Simpan sebelum berpindah indikator.'
      :active?.revision>0
        ?'Perubahan sudah tersimpan di server sebagai draft internal.'
        :'Simpan isian untuk mencatat progres di server.';
    $('pdk-indicator-ready-hint').textContent=progress.total
      ?progress.pending===0
        ?'Seluruh indikator lengkap untuk pengajuan draft internal. Buka bagian pemeriksaan draft.'
        :'Masih '+progress.pending+' indikator membutuhkan peringkat sementara dan justifikasi minimal 20 karakter.'
      :'';
    $('pdk-indicator-progress').max=progress.total||1;
    $('pdk-indicator-progress').value=progress.complete;
    $('pdk-indicator-count').textContent=progress.total
      ?progress.complete+' dari '+progress.total+
        ' indikator lengkap untuk pengajuan draft (peringkat + justifikasi); '+
        progress.pending+' belum lengkap. '+progress.noted+
        ' memiliki catatan. Ini bukan hasil penilaian resmi PADK.'
      :'Memuat daftar indikator…';
    $('pdk-indicator-prev').disabled=state.busy||!state.active||state.active.number<=1;
    $('pdk-indicator-next').disabled=state.busy||!state.active
      ||state.active.number>=progress.total;
    $('pdk-indicator-next-pending').disabled=state.busy||!state.active||!progress.pending;
  }
  function clear(){
    state.request++;state.preparation=null;state.items=[];state.active=null;
    state.dirty=false;state.busy=false;state.search='';state.filter='all';
    $('pdk-indicator-search').value='';
    $('pdk-indicator-status-filter').value='all';
    $('pdk-indicator-match-count').textContent='';
    evidenceUI.clear();criteriaUI.clear();
    $('pdk-indicator-list').replaceChildren();
    $('pdk-indicator-form').reset();
    $('pdk-indicator-history').replaceChildren();
    $('pdk-indicator-description').textContent='';
    message('');render();
  }
  function choices(){
    const list=$('pdk-indicator-list'),selected=state.active?.number??'';
    const matches=filterDraftIndicators(state.items,{query:state.search,status:state.filter});
    list.replaceChildren(new Option('Pilih indikator…',''));
    // Keep the opened indicator selectable even when it does not match a filter.
    const current=state.active;
    if(current&&!matches.some(x=>x.number===current.number)){
      list.add(new Option('No. '+current.number+' · Sedang dibuka (di luar filter)',
        String(current.number)));
    }
    for(const item of matches){
      const label='No. '+item.number+' · '+item.workingSummary.slice(0,100)
        +(isDraftIndicatorComplete(item)?' · Lengkap (draft)'
          :item.revision>0?' · Belum lengkap':' · Belum diisi');
      list.add(new Option(label,String(item.number)));
    }
    list.value=selected?String(selected):'';
    $('pdk-indicator-match-count').textContent=state.items.length===0
      ?'Belum ada indikator yang dimuat.'
      :matches.length===0?'Tidak ada indikator yang cocok. Ubah pencarian atau filter.'
      :'Menampilkan '+matches.length+' dari '+state.items.length+
        ' indikator. Pilih hasil pencarian untuk membukanya.';
  }
  function selectIndicator(number){
    const item=state.items.find(x=>x.number===Number(number));
    state.active=item??null;state.dirty=false;
    $('pdk-indicator-form').reset();message('');
    if(!item){
      evidenceUI.clear();criteriaUI.clear();
      $('pdk-indicator-description').textContent='';
      $('pdk-indicator-history').replaceChildren();render();return;
    }
    $('pdk-indicator-description').textContent=
      'Ringkasan kerja DRAFT, bukan kutipan final OJK: '+item.workingSummary+
      ' (halaman cetak Lampiran IV '+item.printedPage+').';
    $('pdk-indicator-notes').value=item.preparationNotes;
    $('pdk-indicator-evidence').value=item.evidencePlan;
    $('pdk-indicator-optional').open=Boolean(item.preparationNotes||item.evidencePlan);
    $('pdk-indicator-rank').value=item.provisionalRank===null?'':String(item.provisionalRank);
    $('pdk-indicator-justification').value=item.justification;
    choices();evidenceUI.open(state.preparation,item);render();
    void criteriaUI.load(state.preparation,item.number);
    void history();
  }
  async function history(){
    if(!state.preparation||!state.active)return;
    const request=state.request,id=state.preparation.id,n=state.active.number;
    $('pdk-indicator-history').replaceChildren(element('p','Memuat histori…'));
    try{
      const result=await api(ENDPOINT+'/'+encodeURIComponent(id)+
        '/indicators/'+n+'/history');
      if(request!==state.request||state.active?.number!==n)return;
      if(result.status!=='WORKING_NOTES_UNVERIFIED'||!Array.isArray(result.events))
        throw new TypeError('Histori indikator tidak valid.');
      const root=$('pdk-indicator-history');root.replaceChildren();
      for(const entry of result.events){
        const row=element('div','');row.className='workspace-history-item';
        row.append(element('strong','Revisi '+entry.revision+
          (entry.provisional_rank==null?'':' · Peringkat draft '+entry.provisional_rank)),
          element('p',new Date(entry.occurred_at).toLocaleString('id-ID')+
            ' · Pengguna '+entry.actor_user_id));
        root.append(row);
      }
      if(!result.events.length)root.append(element('p','Belum ada perubahan.'));
    }catch(error){
      if(request!==state.request)return;
      $('pdk-indicator-history').replaceChildren(element('p','Riwayat belum bisa dimuat.'));
      fail(error,'Gagal memuat riwayat indikator.');
    }
  }
  async function load(preparation){
    clear();
    if(!preparation)return;
    const request=state.request;
    state.preparation=preparation;state.busy=true;render();
    try{
      const data=await api(ENDPOINT+'/'+encodeURIComponent(preparation.id)+'/indicators');
      if(request!==state.request)return;
      if(data.preparationId!==preparation.id)
        throw new TypeError('Kategori atau persiapan tidak sesuai.');
      state.items=validateDraftIndicatorList(data,preparation.category);
      state.busy=false;
      choices();
      // Resume the first unfinished indicator instead of resetting to number 1.
      selectIndicator(nextPendingDraftIndicator(state.items)??1);
    }catch(error){
      if(request===state.request)fail(error,'Gagal memuat ringkasan indikator draft.');
    }finally{
      if(request===state.request){state.busy=false;render();}
    }
  }
  function navigate(number){
    if(state.busy||!state.active||!Number.isInteger(number)||number<1
      ||number>state.items.length)return;
    if(state.dirty&&!window.confirm('Catatan indikator belum disimpan. Abaikan perubahan?'))
      return;
    selectIndicator(number);
  }
  $('pdk-indicator-search').addEventListener('input',event=>{
    state.search=event.target.value;
    choices();render();
  });
  $('pdk-indicator-status-filter').addEventListener('change',event=>{
    state.filter=event.target.value;
    choices();render();
  });
  $('pdk-indicator-filter-reset').addEventListener('click',()=>{
    state.search='';state.filter='all';
    $('pdk-indicator-search').value='';
    $('pdk-indicator-status-filter').value='all';
    choices();render();$('pdk-indicator-search').focus();
  });
  $('pdk-indicator-list').addEventListener('change',event=>{
    if(state.dirty&&!window.confirm('Catatan indikator belum disimpan. Abaikan perubahan?')){
      event.target.value=state.active?.number??'';return;
    }
    selectIndicator(event.target.value);
  });
  $('pdk-indicator-prev').addEventListener('click',()=>{
    navigate((state.active?.number??0)-1);
  });
  $('pdk-indicator-next').addEventListener('click',()=>{
    navigate((state.active?.number??0)+1);
  });
  $('pdk-indicator-next-pending').addEventListener('click',()=>{
    navigate(nextPendingDraftIndicator(state.items,state.active?.number??0));
  });
  const onInput=()=>{
    if(!owner()||!state.active)return;
    const rank=$('pdk-indicator-rank').value;
    state.dirty=$('pdk-indicator-notes').value!==state.active.preparationNotes
      ||$('pdk-indicator-evidence').value!==state.active.evidencePlan
      ||(rank===''?null:Number(rank))!==state.active.provisionalRank
      ||$('pdk-indicator-justification').value!==state.active.justification;
    render();
  };
  for(const id of ['pdk-indicator-notes','pdk-indicator-evidence',
    'pdk-indicator-justification']){
    $(id).addEventListener('input',onInput);
  }
  $('pdk-indicator-rank').addEventListener('change',onInput);
  $('pdk-indicator-form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(!state.active||!owner()||state.busy||!state.dirty)return;
    const active=state.active,id=state.preparation.id,request=state.request;
    const saveAndNext=event.submitter?.id==='pdk-indicator-save-next';
    const rawRank=$('pdk-indicator-rank').value;
    const rank=rawRank===''?null:Number(rawRank);
    const body={preparationNotes:$('pdk-indicator-notes').value,
      evidencePlan:$('pdk-indicator-evidence').value,
      provisionalRank:rank,justification:$('pdk-indicator-justification').value,
      expectedRevision:active.revision};
    if(body.preparationNotes.length>4000||body.evidencePlan.length>4000
      ||body.justification.length>4000
      ||CONTROL.test(body.preparationNotes)||CONTROL.test(body.evidencePlan)
      ||CONTROL.test(body.justification)
      ||!(rank===null||(Number.isInteger(rank)&&rank>=1&&rank<=5))
      ||(rank===null&&body.justification!=='')
      ||(rank!==null&&(body.justification.trim().length<20
        ||body.justification!==body.justification.trim()))){
      message('Isian tidak valid. Peringkat sementara wajib memiliki justifikasi minimal 20 karakter.','error');
      return;
    }
    state.busy=true;render();
    try{
      const saved=await api(ENDPOINT+'/'+encodeURIComponent(id)+'/indicators/'+active.number,
        {method:'PUT',body});
      if(request!==state.request||state.active?.number!==active.number)return;
      if(saved.status!=='WORKING_NOTES_UNVERIFIED'||saved.scoringAvailable!==false
        ||saved.rankIsOfficial!==false||saved.criteriaVerified!==false
        ||saved.number!==active.number||saved.revision<=active.revision)
        throw new TypeError('Respons penyimpanan indikator tidak valid.');
      Object.assign(active,saved);state.dirty=false;
      evidenceUI.open(state.preparation,active);
      choices();render();
      if(saveAndNext&&isDraftIndicatorComplete(active)){
        const next=nextPendingDraftIndicator(state.items,active.number);
        if(next!==null&&next!==active.number){
          selectIndicator(next);
          message('Indikator '+active.number+' tersimpan. Lanjut ke indikator '+next+
            '. Bukti dapat dilampirkan dengan memilih indikator sebelumnya.','success');
          $('pdk-indicator-section').scrollIntoView({block:'start',behavior:'smooth'});
        }else message('Semua indikator lengkap untuk pengajuan draft internal. Periksa bukti dan buka bagian pemeriksaan.','success');
      }else if(saveAndNext){
        message('Catatan tersimpan, tetapi indikator belum lengkap. Pilih peringkat dan isi justifikasi minimal 20 karakter untuk melanjutkan.','warning');
      }else{
        message('Draft indikator tersimpan. Belum menjadi nilai PADK final.','success');
      }
      void history();
      onDraftSaved();
    }catch(error){if(request===state.request)fail(error,'Catatan gagal disimpan. Coba muat ulang.');}
    finally{if(request===state.request){state.busy=false;render();}}
  });
  $('pdk-indicator-history-refresh').addEventListener('click',()=>void history());
  clear();
  return {load,clear,sync:render,isDirty:()=>state.dirty};
}
