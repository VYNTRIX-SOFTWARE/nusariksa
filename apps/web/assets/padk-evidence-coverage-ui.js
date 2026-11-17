const $=id=>document.getElementById(id);
const ENDPOINT='/regulatory/padk43/cyber/preparations';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate coverage independently of indicator ratings. File presence is not
 * a condition of draft submission, and never conveys regulatory approval.
 */
export function validatePadkEvidenceCoverage(data,{id,category}){
  const total=category===1?80:category===2?60:0;
  if(!total||!UUID.test(id)||!data||data.preparationId!==id
    ||data.category!==category||data.totalIndicators!==total
    ||data.status!=='DRAFT_EVIDENCE_COVERAGE'
    ||data.regulatoryPackVerified!==false
    ||data.evidenceRequiredForDraftSubmission!==false
    ||!Array.isArray(data.indicators)||data.indicators.length!==total
    ||!Number.isSafeInteger(data.totalFiles)||data.totalFiles<0
    ||!Number.isSafeInteger(data.coveredIndicators)||data.coveredIndicators<0
    ||!Number.isSafeInteger(data.uncoveredIndicators)||data.uncoveredIndicators<0)
    throw new TypeError('Ringkasan bukti draft tidak valid.');
  let covered=0,files=0;
  for(let i=0;i<total;i++){
    const row=data.indicators[i];
    if(!row||row.number!==i+1||!Number.isSafeInteger(row.fileCount)
      ||row.fileCount<0||row.fileCount>10)
      throw new TypeError('Daftar cakupan bukti tidak valid.');
    if(row.fileCount>0)covered++;
    files+=row.fileCount;
  }
  if(data.coveredIndicators!==covered||data.uncoveredIndicators!==total-covered
    ||data.totalFiles!==files)
    throw new TypeError('Jumlah bukti tidak sesuai rincian indikator.');
  return data;
}

export function createPadkEvidenceCoverageUI({
  api,onAuthFailure,getPermissions,onOpenIndicator,
}){
  let current=null,requestId=0,busy=false;
  const canRead=()=>Boolean(current&&getPermissions().includes('evidence:read'));
  function message(value,kind='info'){
    const node=$('pdk-evidence-coverage-status');
    node.textContent=value??'';node.dataset.kind=kind;
  }
  function sync(){
    $('pdk-evidence-coverage-disclosure').hidden=!canRead();
    $('pdk-evidence-coverage-reload').disabled=!canRead()||busy;
    $('pdk-evidence-coverage-select').disabled=!canRead()||busy;
    $('pdk-evidence-coverage-open').disabled=!canRead()||busy
      ||!$('pdk-evidence-coverage-select').value;
  }
  function clear(){
    requestId++;current=null;busy=false;
    $('pdk-evidence-coverage-count').textContent='';
    $('pdk-evidence-coverage-select').replaceChildren(
      new Option('Pilih indikator untuk diperiksa…',''));
    $('pdk-evidence-coverage-disclosure').open=false;
    message('');sync();
  }
  async function reload(){
    if(!canRead()||busy)return;
    const id=current.id,category=current.category,generation=++requestId;
    busy=true;message('Memuat ringkasan bukti…');sync();
    try{
      const data=validatePadkEvidenceCoverage(
        await api(ENDPOINT+'/'+encodeURIComponent(id)+'/evidence-coverage'),
        {id,category},
      );
      if(generation!==requestId||current?.id!==id)return;
      const options=$('pdk-evidence-coverage-select');
      const previous=options.value;
      options.replaceChildren(new Option('Pilih indikator untuk diperiksa…',''));
      for(const row of data.indicators){
        options.add(new Option('No. '+row.number+' · '+
          (row.fileCount===0?'Belum ada bukti':
            row.fileCount+' dokumen bukti'),String(row.number)));
      }
      options.value=previous&&data.indicators.some(row=>String(row.number)===previous)
        ?previous:'';
      $('pdk-evidence-coverage-count').textContent=data.coveredIndicators+
        ' dari '+data.totalIndicators+' indikator memiliki bukti ('+
        data.totalFiles+' dokumen). '+data.uncoveredIndicators+
        ' indikator belum memiliki lampiran.';
      message('Ketersediaan bukti tidak menentukan boleh tidaknya draft diajukan.');
    }catch(error){
      if(generation!==requestId||current?.id!==id)return;
      if(onAuthFailure(error))return;
      $('pdk-evidence-coverage-count').textContent='';
      $('pdk-evidence-coverage-select').replaceChildren(
        new Option('Ringkasan belum tersedia',''));
      message('Ringkasan bukti gagal dimuat. Coba muat ulang.','error');
    }finally{
      if(generation===requestId){busy=false;sync();}
    }
  }
  function open(preparation){
    clear();
    if(!preparation||!UUID.test(preparation.id)||![1,2].includes(preparation.category))
      return;
    current={id:preparation.id,category:preparation.category};
    sync();
    if(canRead())void reload();
  }
  $('pdk-evidence-coverage-reload').addEventListener('click',()=>void reload());
  $('pdk-evidence-coverage-select').addEventListener('change',sync);
  $('pdk-evidence-coverage-open').addEventListener('click',()=>{
    const num=Number($('pdk-evidence-coverage-select').value);
    if(!canRead()||busy||!Number.isSafeInteger(num)
      ||num<1||num>(current.category===1?80:60))return;
    if(onOpenIndicator(num)!==true)
      message('Simpan perubahan indikator saat ini sebelum berpindah.','warning');
  });
  clear();
  return {open,clear,reload,sync};
}
