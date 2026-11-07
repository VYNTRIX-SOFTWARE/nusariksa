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
      ||item.status!=='WORKING_NOTES_UNVERIFIED'
      ||item.scoringAvailable!==false
      ||Object.hasOwn(item,'rank')||Object.hasOwn(item,'rating')
      ||Object.hasOwn(item,'rankCriteria'))
      throw new TypeError('Format indikator draft tidak valid.');
  }
  return data.indicators;
}
export function createPadkIndicatorNoteUI({api,onAuthFailure,getUserId,getPermissions}){
  const state={preparation:null,items:[],active:null,dirty:false,busy:false,request:0};
  const owner=()=>Boolean(state.preparation
    &&state.preparation.ownerUserId===getUserId()
    &&getPermissions().includes('assessments:write'));
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
    $('pdk-indicator-section').hidden=!state.preparation;
    $('pdk-indicator-form').hidden=!state.active;
    $('pdk-indicator-save').hidden=!owner();
    $('pdk-indicator-save').disabled=state.busy||!state.dirty;
    $('pdk-indicator-list').disabled=state.busy||!state.items.length;
    for(const id of ['pdk-indicator-notes','pdk-indicator-evidence']){
      $(id).readOnly=!owner()||state.busy;
    }
    const filled=state.items.filter(x=>x.revision>0).length;
    $('pdk-indicator-count').textContent=state.items.length
      ?filled+' dari '+state.items.length+' indikator punya catatan kerja.'
      :'Memuat daftar indikator…';
  }
  function clear(){
    state.request++;state.preparation=null;state.items=[];state.active=null;
    state.dirty=false;state.busy=false;
    $('pdk-indicator-list').replaceChildren();
    $('pdk-indicator-form').reset();
    $('pdk-indicator-history').replaceChildren();
    $('pdk-indicator-description').textContent='';
    message('');render();
  }
  function choices(){
    const list=$('pdk-indicator-list'),selected=state.active?.number??'';
    list.replaceChildren(new Option('Pilih indikator…',''));
    for(const item of state.items){
      const label='No. '+item.number+' · '+item.workingSummary.slice(0,115)
        +(item.revision>0?' · Catatan tersimpan':'');
      list.add(new Option(label,String(item.number)));
    }
    list.value=selected?String(selected):'';
  }
  function selectIndicator(number){
    const item=state.items.find(x=>x.number===Number(number));
    state.active=item??null;state.dirty=false;
    $('pdk-indicator-form').reset();message('');
    if(!item){
      $('pdk-indicator-description').textContent='';
      $('pdk-indicator-history').replaceChildren();render();return;
    }
    $('pdk-indicator-description').textContent=
      'Ringkasan kerja DRAFT, bukan kutipan final OJK: '+item.workingSummary+
      ' (halaman cetak Lampiran IV '+item.printedPage+').';
    $('pdk-indicator-notes').value=item.preparationNotes;
    $('pdk-indicator-evidence').value=item.evidencePlan;
    choices();render();void history();
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
        row.append(element('strong','Revisi '+entry.revision),
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
      choices();selectIndicator(1);
    }catch(error){
      if(request===state.request)fail(error,'Gagal memuat ringkasan indikator draft.');
    }finally{
      if(request===state.request){state.busy=false;render();}
    }
  }
  $('pdk-indicator-list').addEventListener('change',event=>{
    if(state.dirty&&!window.confirm('Catatan indikator belum disimpan. Abaikan perubahan?')){
      event.target.value=state.active?.number??'';return;
    }
    selectIndicator(event.target.value);
  });
  for(const id of ['pdk-indicator-notes','pdk-indicator-evidence']){
    $(id).addEventListener('input',()=>{
      if(!owner()||!state.active)return;
      state.dirty=$('pdk-indicator-notes').value!==state.active.preparationNotes
        ||$('pdk-indicator-evidence').value!==state.active.evidencePlan;
      render();
    });
  }
  $('pdk-indicator-form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(!state.active||!owner()||state.busy||!state.dirty)return;
    const active=state.active,id=state.preparation.id,request=state.request;
    const body={preparationNotes:$('pdk-indicator-notes').value,
      evidencePlan:$('pdk-indicator-evidence').value,expectedRevision:active.revision};
    if(body.preparationNotes.length>4000||body.evidencePlan.length>4000
      ||CONTROL.test(body.preparationNotes)||CONTROL.test(body.evidencePlan)){
      message('Catatan terlalu panjang atau mengandung karakter tidak valid.','error');return;
    }
    state.busy=true;render();
    try{
      const saved=await api(ENDPOINT+'/'+encodeURIComponent(id)+'/indicators/'+active.number,
        {method:'PUT',body});
      if(request!==state.request||state.active?.number!==active.number)return;
      if(saved.status!=='WORKING_NOTES_UNVERIFIED'||saved.scoringAvailable!==false
        ||saved.number!==active.number||saved.revision<=active.revision)
        throw new TypeError('Respons penyimpanan indikator tidak valid.');
      Object.assign(active,saved);state.dirty=false;
      choices();render();message('Catatan indikator tersimpan. Ini belum skor PADK.','success');
      void history();
    }catch(error){if(request===state.request)fail(error,'Catatan gagal disimpan. Coba muat ulang.');}
    finally{if(request===state.request){state.busy=false;render();}}
  });
  $('pdk-indicator-history-refresh').addEventListener('click',()=>void history());
  clear();
  return {load,clear,sync:render,isDirty:()=>state.dirty};
}
