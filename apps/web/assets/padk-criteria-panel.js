const $=id=>document.getElementById(id);
const PREFIX='/regulatory/padk43/cyber/preparations';
const HASH='63868e2fe99a48485b17646618934c1fffb27b125811929e12bd70d170081e1b';
const NAMES=['Sangat Memadai','Memadai','Cukup Memadai','Kurang Memadai','Tidak Memadai'];
const make=(tag,text)=>{const node=document.createElement(tag);node.textContent=String(text??'');return node;};

export function validateDraftCriteriaResponse(data,{id,category,number}){
  if(!data||data.preparationId!==id||data.category!==category
    ||data.indicatorNumber!==number||data.status!=='EXTRACTED_SOURCE_UNVERIFIED'
    ||data.sourcePdfSha256!==HASH
    ||data.mappingVerified!==false||data.criteriaVerified!==false
    ||data.sourceTextVerified!==false||data.sourceAuthenticityVerified!==false
    ||data.officialScoreAvailable!==false||data.finalReportAvailable!==false
    ||!Number.isInteger(data.table3CandidateNumber)
    ||data.table3CandidateNumber<1||data.table3CandidateNumber>80
    ||!Array.isArray(data.table3PdfPages)||data.table3PdfPages.length<1
    ||data.table3PdfPages.some(p=>!Number.isInteger(p)||p<157||p>198)
    ||(category===2&&!['SOURCE_REVIEW_REQUIRED','CANDIDATE_NOT_APPROVED']
      .includes(data.category2MappingRisk))
    ||(category===1&&data.category2MappingRisk!==null)
    ||!Array.isArray(data.criteria)||data.criteria.length!==5)
    throw new TypeError('Kriteria hasil ekstraksi tidak dapat dipercaya.');
  for(let i=0;i<5;i++){
    const row=data.criteria[i];
    if(!row||row.rank!==i+1||row.label!==NAMES[i]
      ||typeof row.textDraft!=='string'||row.textDraft.length<10
      ||!Array.isArray(row.pdfPages)
      ||row.pdfPages.join(',')!==data.table3PdfPages.join(','))
      throw new TypeError('Kriteria peringkat tidak lengkap.');
  }
  return data;
}
export function createPadkCriteriaPanel({api,onAuthFailure,canSelect}){
  let active=null,request=0,rows=[];
  function sync(){
    const writable=Boolean(active&&canSelect());
    for(const button of rows)button.disabled=!writable;
  }
  function clear(){
    request++;active=null;rows=[];
    $('pdk-criteria-panel').hidden=true;
    $('pdk-criteria-status').textContent='';
    $('pdk-criteria-source').textContent='';
    $('pdk-criteria-list').replaceChildren();
  }
  function show(data){
    $('pdk-criteria-status').textContent=data.category===2
      ?'Kandidat pemetaan Kategori 2 #'+data.indicatorNumber+
        ' → Tabel 3 #'+data.table3CandidateNumber+
        (data.category2MappingRisk==='SOURCE_REVIEW_REQUIRED'
          ?' — PERBEDAAN REDAKSI, PERLU PERIKSA KHUSUS.'
          :' — pasangan belum disahkan.')
      :'Nomor parameter Tabel 3 #'+data.table3CandidateNumber+
        ' — teks belum diperiksa secara independen.';
    $('pdk-criteria-source').textContent=
      'Rujukan PDF unggahan halaman '+data.table3PdfPages.join(', ')+
      '. Kriteria berikut adalah HASIL EKSTRAKSI MESIN, bukan teks final terverifikasi.';
    const list=$('pdk-criteria-list');list.replaceChildren();rows=[];
    for(const criterion of data.criteria){
      const entry=make('div','');entry.className='workspace-history-item';
      const heading=make('strong','Peringkat '+criterion.rank+' — '+criterion.label);
      const body=make('p',criterion.textDraft);
      body.style.whiteSpace='pre-wrap';
      const button=make('button','Pilih peringkat '+criterion.rank+' (draft)');
      button.type='button';button.className='button button-outline';
      button.addEventListener('click',()=>{
        if(!canSelect())return;
        const select=$('pdk-indicator-rank');
        select.value=String(criterion.rank);
        select.dispatchEvent(new Event('change',{bubbles:true}));
      });
      rows.push(button);entry.append(heading,body,button);list.append(entry);
    }
    sync();
  }
  async function load(preparation,number){
    clear();
    if(!preparation||!Number.isInteger(number))return;
    active={id:preparation.id,category:preparation.category,number};
    const mine=++request;
    $('pdk-criteria-panel').hidden=false;
    $('pdk-criteria-status').textContent='Memuat lima kriteria hasil ekstraksi…';
    try{
      const data=await api(PREFIX+'/'+encodeURIComponent(preparation.id)+
        '/indicators/'+number+'/criteria');
      if(mine!==request||active?.number!==number||active?.id!==preparation.id)return;
      show(validateDraftCriteriaResponse(data,active));
    }catch(error){
      if(mine!==request)return;
      if(onAuthFailure(error))return;
      $('pdk-criteria-status').textContent=
        'Kriteria tidak dapat ditampilkan. Periksa kembali dokumen sumber PADK.';
      $('pdk-criteria-list').replaceChildren();rows=[];
    }
  }
  clear();
  return {load,clear,sync};
}
