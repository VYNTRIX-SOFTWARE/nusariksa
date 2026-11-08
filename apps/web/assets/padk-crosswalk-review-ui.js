const $=id=>document.getElementById(id);
const PATH='/regulatory/padk43/cyber/crosswalk';
const SHA='63868e2fe99a48485b17646618934c1fffb27b125811929e12bd70d170081e1b';
const OPTIONS=['ACCEPT_CANDIDATE','REMAP_PROPOSAL','ESCALATE'];
const make=(tag,value)=>{
  const el=document.createElement(tag);el.textContent=String(value??'');return el;
};
export function validateCrosswalkReviewResponse(data){
  if(!data||data.status!=='DRAFT_UNVERIFIED'||data.sourcePdfSha256!==SHA
    ||data.sourceAuthenticityVerified!==false||data.fullCriteriaVerified!==false
    ||data.productionScoringAvailable!==false||!Array.isArray(data.items)
    ||data.items.length!==60)throw new TypeError('Kandidat regulasi tidak bisa dibuka.');
  for(let i=0;i<60;i++){
    const x=data.items[i];
    if(x.category2Number!==i+1||!Number.isSafeInteger(x.table3CandidateNumber)
      ||x.table3CandidateNumber<1||x.table3CandidateNumber>80
      ||!Number.isSafeInteger(x.category2PdfPage)||x.category2PdfPage<147
      ||x.category2PdfPage>156||!Number.isSafeInteger(x.table3PdfPage)
      ||x.table3PdfPage<157||x.table3PdfPage>198
      ||!['SOURCE_REVIEW_REQUIRED','CANDIDATE_NOT_APPROVED'].includes(x.risk)
      ||typeof x.workingSummaryDraft!=='string'
      ||x.fullCriteriaVerified!==false||x.productionScoringAvailable!==false
      ||!['PENDING','TWO_REVIEWERS_AGREE_CANDIDATE'].includes(x.mappingReviewStatus)
      ||typeof x.reviews!=='object'||x.reviews===null)throw new TypeError('Mapping tidak valid.');
  }
  return data.items;
}
export function createCrosswalkReviewUI({api,getPermissions,getUserId,onAuthFailure}){
  const state={items:[],current:null,loading:false,nonce:0,dirty:false};
  const permitted=()=>getPermissions().includes('assessments:approve');
  const ownReviewOtherTrack=track=>{
    const opposite=track==='SUBSTANCE'?'TECHNICAL':'SUBSTANCE';
    return state.current?.reviews?.[opposite]?.reviewerId===getUserId();
  };
  function message(value){
    $('padk-crosswalk-message').textContent=value??'';
    $('padk-crosswalk-message').hidden=!value;
  }
  function failed(error){
    if(onAuthFailure(error))return;
    message(error?.status===409?'Catatan review berubah atau reviewer yang sama tidak boleh mengisi kedua jalur. Muat ulang.':
      'Permintaan gagal. Cek koneksi dan status data.');
  }
  function clear(){
    state.nonce++;state.items=[];state.current=null;state.loading=false;state.dirty=false;
    $('padk-crosswalk-list').replaceChildren();
    $('padk-crosswalk-form').reset();$('padk-crosswalk-history').replaceChildren();
    $('padk-crosswalk-detail').hidden=true;message('');
  }
  function sync(){
    $('padk-crosswalk-submit').disabled=state.loading||!permitted()
      ||!state.current||ownReviewOtherTrack($('padk-crosswalk-track').value);
    $('padk-crosswalk-detail').hidden=!state.current;
    const decision=$('padk-crosswalk-decision').value;
    const targetNeeded=decision==='REMAP_PROPOSAL';
    $('padk-crosswalk-target').disabled=!targetNeeded;
    $('padk-crosswalk-target-page').disabled=!targetNeeded;
    if(state.current){
      $('padk-crosswalk-target').placeholder=String(state.current.table3CandidateNumber);
      $('padk-crosswalk-target-page').placeholder=String(state.current.table3PdfPage);
    }
    $('padk-crosswalk-reviewer-warning').textContent=ownReviewOtherTrack($('padk-crosswalk-track').value)
      ?'Reviewer yang sama tidak boleh mengisi kedua jalur pemeriksaan.':'';
  }
  function populate(item){
    state.current=item;state.dirty=false;
    $('padk-crosswalk-form').reset();
    $('padk-crosswalk-detail-title').textContent='Kategori 2 #'+item.category2Number+
      ' → kandidat Tabel 3 #'+item.table3CandidateNumber;
    $('padk-crosswalk-description').textContent='Ringkasan kerja belum diverifikasi: '+item.workingSummaryDraft;
    $('padk-crosswalk-pages').textContent='Bandingkan PDF halaman '+item.category2PdfPage+
      ' (Tabel 2) dengan halaman '+item.table3PdfPage+' (Tabel 3).';
    $('padk-crosswalk-risk').textContent=item.risk==='SOURCE_REVIEW_REQUIRED'
      ?'Perbedaan redaksi: pemeriksaan sumber diprioritaskan.'
      :'Kemiripan teks tidak membuktikan kriteria cocok.';
    $('padk-crosswalk-status').textContent=item.mappingReviewStatus==='TWO_REVIEWERS_AGREE_CANDIDATE'
      ?'Dua reviewer sependapat tentang kandidat; teks kriteria BELUM verified.'
      :'Belum ada kesepakatan dua reviewer atas kandidat.';
    const list=$('padk-crosswalk-list');
    list.value=String(item.category2Number);
    sync();void history();
  }
  async function load(){
    if(!permitted())return;
    const id=++state.nonce;state.loading=true;sync();message('Memuat kandidat…');
    try{
      const data=await api(PATH);
      if(id!==state.nonce)return;
      state.items=validateCrosswalkReviewResponse(data);
      const last=state.current?.category2Number??3;
      const list=$('padk-crosswalk-list');
      list.replaceChildren();
      for(const entry of state.items){
        list.add(new Option(
          (entry.risk==='SOURCE_REVIEW_REQUIRED'?'[PERIKSA] ':'')+
          'Kategori 2 #'+entry.category2Number+' → Tabel 3 #'+entry.table3CandidateNumber,
          String(entry.category2Number),
        ));
      }
      populate(state.items[last-1]);
      message('');
    }catch(error){if(id===state.nonce)failed(error);}
    finally{if(id===state.nonce){state.loading=false;sync();}}
  }
  async function history(){
    if(!state.current)return;
    const id=state.current.category2Number,nonce=state.nonce;
    const box=$('padk-crosswalk-history');
    box.replaceChildren(make('p','Memuat jejak review…'));
    try{
      const res=await api(PATH+'/'+id+'/history');
      if(nonce!==state.nonce||state.current?.category2Number!==id)return;
      if(res.regulatoryPackVerified!==false||!Array.isArray(res.events))
        throw new TypeError('Jejak review tidak valid.');
      box.replaceChildren();
      for(const event of res.events){
        const line=make('p','');
        line.append(make('strong',event.reviewTrack+' · '+event.decision),
          make('span',' · '+event.recordedAt+' · Reviewer '+event.reviewerId));
        box.append(line);
      }
      if(!res.events.length)box.append(make('p','Belum ada catatan review.'));
    }catch(error){if(nonce===state.nonce)failed(error);}
  }
  $('padk-crosswalk-reload').addEventListener('click',()=>void load());
  $('padk-crosswalk-list').addEventListener('change',event=>{
    if(state.dirty&&!window.confirm('Catatan belum dikirim. Abaikan perubahan?')){
      event.target.value=String(state.current?.category2Number??'');return;
    }
    populate(state.items[Number(event.target.value)-1]);
  });
  for(const id of ['padk-crosswalk-track','padk-crosswalk-decision',
    'padk-crosswalk-target','padk-crosswalk-target-page','padk-crosswalk-basis']){
    $(id).addEventListener('change',()=>{state.dirty=true;sync();});
  }
  $('padk-crosswalk-basis').addEventListener('input',()=>{state.dirty=true;});
  $('padk-crosswalk-form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(state.loading||!permitted()||!state.current)return;
    const item=state.current,track=$('padk-crosswalk-track').value;
    if(ownReviewOtherTrack(track)){
      message('Reviewer berbeda diperlukan untuk jalur review lainnya.');return;
    }
    const decision=$('padk-crosswalk-decision').value;
    if(!OPTIONS.includes(decision))return;
    const target=decision==='ESCALATE'?null:decision==='ACCEPT_CANDIDATE'
      ?item.table3CandidateNumber:Number($('padk-crosswalk-target').value);
    const page=decision==='ESCALATE'?null:decision==='ACCEPT_CANDIDATE'
      ?item.table3PdfPage:Number($('padk-crosswalk-target-page').value);
    const basis=$('padk-crosswalk-basis').value.trim();
    if(basis.length<20||basis.length>2000){
      message('Alasan pemeriksaan harus 20–2000 karakter.');return;
    }
    const body={reviewTrack:track,decision,proposedTable3Number:target,
      proposedPdfPage:page,basis,sourcePdfSha256:SHA,
      expectedLatestEventId:item.reviews[track]?.eventId??0};
    state.loading=true;sync();
    try{
      const result=await api(PATH+'/'+item.category2Number,{method:'POST',body});
      if(result.regulatoryPackVerified!==false)
        throw new TypeError('Respons status review tidak valid');
      state.dirty=false;
      await load();
      message('Catatan review tersimpan. Regulatory pack masih belum verified.');
    }catch(error){failed(error);}
    finally{state.loading=false;sync();}
  });
  return {load,clear,sync,confirmLeave:()=>!state.dirty||
    window.confirm('Catatan review belum disimpan. Abaikan perubahan?')};
}
