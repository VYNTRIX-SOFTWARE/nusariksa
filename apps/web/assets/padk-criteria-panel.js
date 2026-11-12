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
    ||!Object.hasOwn(data,'sourceConflict')
    ||!Array.isArray(data.criteria)||data.criteria.length!==5)
    throw new TypeError('Kriteria hasil ekstraksi tidak dapat dipercaya.');
  const comparison=data.referenceComparison;
  const extras=data.supplementaryCriteria;
  if(!comparison||comparison.status!=='DRAFT_UNVERIFIED'
    ||comparison.masterParameterCount!==80||comparison.category2MarkerCount!==60
    ||comparison.officialMappingAvailable!==false
    ||comparison.referenceStatus!=='INTERNAL_DRAFT_UNVERIFIED'
    ||!Array.isArray(comparison.candidateTable3Numbers)
    ||comparison.candidateTable3Numbers[0]!==data.table3CandidateNumber
    ||(category===1&&comparison.comparisonTable3Number!==null)
    ||(category===2&&(!Number.isInteger(comparison.comparisonTable3Number)
      ||comparison.comparisonTable3Number<1||comparison.comparisonTable3Number>80))
    ||comparison.candidateDisagreement!==
      (comparison.comparisonTable3Number!==null
        &&comparison.comparisonTable3Number!==data.table3CandidateNumber)
    ||comparison.candidateTable3Numbers.length!==(comparison.candidateDisagreement?2:1)
    ||(comparison.candidateDisagreement
      &&comparison.candidateTable3Numbers[1]!==comparison.comparisonTable3Number)
    ||!Array.isArray(extras)||extras.length!==(comparison.candidateDisagreement?1:0))
    throw new TypeError('Referensi master 80/60 tidak valid.');
  for(const extra of extras){
    if(!extra||extra.table3Number!==comparison.candidateTable3Numbers[1]
      ||extra.category2ComparisonMarker!==true
      ||!Array.isArray(extra.pdfPages)||extra.pdfPages.length<1
      ||extra.pdfPages.some(p=>!Number.isInteger(p)||p<157||p>198)
      ||!Array.isArray(extra.criteria)||extra.criteria.length!==5
      ||!(extra.sourceConflict===null||(extra.sourceConflict?.code===
        'PARAMETER_KRITERIA_TIDAK_SELARAS'&&typeof extra.sourceConflict.message==='string')))
      throw new TypeError('Kriteria pembanding tidak valid.');
    for(let i=0;i<5;i++){
      const rank=extra.criteria[i];
      if(rank?.rank!==i+1||rank.label!==NAMES[i]
        ||typeof rank.textDraft!=='string'||rank.textDraft.length<10
        ||!Array.isArray(rank.pdfPages)||rank.pdfPages.join(',')!==extra.pdfPages.join(','))
        throw new TypeError('Kriteria pembanding tidak lengkap.');
    }
  }
  const hasConflict=[2,20,21,22,27,28,29].includes(data.table3CandidateNumber);
  if(hasConflict){
    if(!data.sourceConflict||data.sourceConflict.code!=='PARAMETER_KRITERIA_TIDAK_SELARAS'
      ||typeof data.sourceConflict.message!=='string'
      ||data.sourceConflict.message.length<40)
      throw new TypeError('Status konflik redaksi sumber tidak valid.');
  }else if(data.sourceConflict!==null)
    throw new TypeError('Status konflik redaksi sumber tidak valid.');
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
  let active=null,request=0,rows=[],sourceConflict=false;
  function sync(){
    const writable=Boolean(active&&canSelect()&&!sourceConflict);
    for(const button of rows)button.disabled=!writable;
  }
  function clear(){
    request++;active=null;rows=[];sourceConflict=false;
    $('pdk-criteria-panel').hidden=true;
    $('pdk-criteria-status').textContent='';
    $('pdk-criteria-source').textContent='';
    $('pdk-criteria-list').replaceChildren();
  }
  function show(data){
    sourceConflict=Boolean(data.sourceConflict)||data.referenceComparison.candidateDisagreement;
    $('pdk-criteria-status').textContent=data.referenceComparison.candidateDisagreement
      ?'PERLU REVIEW MAPPING: NusaRiksa memakai kandidat Tabel 3 #'+
        data.table3CandidateNumber+', sedangkan kandidat pembanding internal menunjuk #'+
        data.referenceComparison.comparisonTable3Number+
        '. Keduanya ditampilkan untuk dibandingkan. Pemilihan peringkat otomatis dinonaktifkan.'
      :data.sourceConflict
      ?'PERHATIAN: '+data.sourceConflict.message+
        ' Kriteria tetap ditampilkan untuk pemeriksaan sumber, tetapi pemilihan peringkat langsung dinonaktifkan.'
      :data.category===2
      ?'Kandidat pemetaan Kategori 2 #'+data.indicatorNumber+
        ' → Tabel 3 #'+data.table3CandidateNumber+
        (data.category2MappingRisk==='SOURCE_REVIEW_REQUIRED'
          ?' — PERBEDAAN REDAKSI, PERLU PERIKSA KHUSUS.'
          :' — pasangan belum disahkan.')
      :'Nomor parameter Tabel 3 #'+data.table3CandidateNumber+
        ' — teks belum diperiksa secara independen.';
    $('pdk-criteria-source').textContent=
      'Master Tabel 3: 80 parameter, 5 peringkat. Referensi kerja internal menandai 60 parameter Kategori 2. '+
      'PDF sumber halaman '+data.table3PdfPages.join(', ')+
      '. Ini HASIL EKSTRAKSI dan mapping DRAFT, bukan instrumen final terverifikasi.';
    const list=$('pdk-criteria-list');list.replaceChildren();rows=[];
    for(const criterion of data.criteria){
      const entry=make('div','');entry.className='workspace-history-item';
      const heading=make('strong','Peringkat '+criterion.rank+' — '+criterion.label);
      const body=make('p',criterion.textDraft);
      body.style.whiteSpace='pre-wrap';
      const button=make('button','Pilih peringkat '+criterion.rank+' (draft)');
      button.type='button';button.className='button button-outline';
      button.addEventListener('click',()=>{
        if(sourceConflict||!canSelect())return;
        const select=$('pdk-indicator-rank');
        select.value=String(criterion.rank);
        select.dispatchEvent(new Event('change',{bubbles:true}));
      });
      rows.push(button);entry.append(heading,body,button);list.append(entry);
    }
    for(const additional of data.supplementaryCriteria){
      const heading=make('strong','Kandidat pembanding Tabel 3 #'+additional.table3Number+
        ' · halaman PDF '+additional.pdfPages.join(', ')+
        ' (pembanding Kategori 2; belum diverifikasi)');
      list.append(heading);
      for(const item of additional.criteria){
        const entry=make('div','');entry.className='workspace-history-item';
        entry.append(make('strong','Peringkat '+item.rank+' — '+item.label),
          make('p',item.textDraft));
        list.append(entry);
      }
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
