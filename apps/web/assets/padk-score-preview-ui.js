const $=id=>document.getElementById(id);
const BASE='/regulatory/padk43/cyber/preparations';
const LABELS=['TK','ID','PL','DT','PP'];
const text=(tag,value)=>{const node=document.createElement(tag);
  node.textContent=String(value??'');return node;};
export function validatePadkSavedPreview(data,id,category){
  const total=category===1?80:category===2?60:0;
  if(!data||!total||data.preparationId!==id||data.category!==category
    ||data.status!=='PREVIEW_UNVERIFIED'||data.sourceStatus!=='DRAFT_UNVERIFIED'
    ||data.mappingVerified!==false||data.criteriaVerified!==false
    ||data.roundingPolicyVerified!==false||data.officialScoreAvailable!==false
    ||data.officialApprovalAvailable!==false||data.finalReportAvailable!==false
    ||data.regulatoryResult!==false
    ||data.requiredIndicators!==total||!Number.isInteger(data.ratedIndicators)
    ||data.ratedIndicators<0||data.ratedIndicators>total
    ||!Array.isArray(data.domains)||data.domains.length!==5
    ||data.domains.some((domain,i)=>domain.code!==LABELS[i]
      ||!Number.isInteger(domain.requiredIndicators)
      ||!Number.isInteger(domain.ratedIndicators)
      ||domain.ratedIndicators>domain.requiredIndicators
      ||!Number.isInteger(domain.weightPercent)))
    throw new TypeError('Respons simulasi PADK tidak valid.');
  if(data.complete){
    if(data.ratedIndicators!==total||typeof data.compositeRaw!=='number'
      ||!data.compositePreview
      ||!/^\d\.\d{2}$/.test(data.compositePreview.valueTwoDecimals)
      ||![1,2,3,4,5].includes(data.compositePreview.rank))
      throw new TypeError('Komposit simulasi tidak lengkap.');
  }else if(data.compositeRaw!==null||data.compositePreview!==null)
    throw new TypeError('Komposit parsial tidak boleh ditampilkan.');
  return data;
}
export function createPadkScorePreviewUI({api,onAuthFailure}){
  let active=null,request=0;
  function clear(){
    request++;active=null;
    $('pdk-score-preview').hidden=true;
    $('pdk-score-status').textContent='';
    $('pdk-score-domains').replaceChildren();
    $('pdk-score-composite').textContent='';
  }
  function render(data){
    $('pdk-score-preview').hidden=false;
    $('pdk-score-status').textContent='Terisi '+data.ratedIndicators+' dari '+
      data.requiredIndicators+' indikator · sumber dan kriteria belum diverifikasi.';
    const body=$('pdk-score-domains');body.replaceChildren();
    for(const domain of data.domains){
      const line=text('div','');line.className='workspace-history-item';
      line.append(text('strong',domain.name+' · bobot '+domain.weightPercent+'%'),
        text('p','Terisi '+domain.ratedIndicators+'/'+domain.requiredIndicators+
          (domain.complete&&domain.averageRank!==null
            ?' · Rata-rata '+domain.averageRank.toFixed(3)+
              ' · Kontribusi '+domain.contribution.toFixed(3)
            :' · Belum lengkap')));
      body.append(line);
    }
    $('pdk-score-composite').textContent=data.complete
      ?'SIMULASI SAJA — Komposit '+data.compositePreview.valueTwoDecimals+
        ' · Peringkat '+data.compositePreview.rank+
        ' ('+data.compositePreview.label+'). BELUM SAH UNTUK PELAPORAN.'
      :'Komposit belum dihitung. Lengkapi semua indikator untuk melihat simulasi.';
  }
  async function load(preparation){
    if(!preparation){clear();return;}
    active={id:preparation.id,category:preparation.category};
    const mine=++request;
    $('pdk-score-preview').hidden=false;
    $('pdk-score-status').textContent='Memuat simulasi dari jawaban tersimpan…';
    $('pdk-score-domains').replaceChildren();
    $('pdk-score-composite').textContent='';
    try{
      const data=await api(BASE+'/'+encodeURIComponent(preparation.id)+'/score-preview');
      if(mine!==request||active?.id!==preparation.id)return;
      render(validatePadkSavedPreview(data,preparation.id,preparation.category));
    }catch(error){
      if(mine!==request)return;
      if(onAuthFailure(error))return;
      $('pdk-score-status').textContent='Simulasi belum bisa dimuat. Periksa koneksi atau kelengkapan sumber draft.';
    }
  }
  $('pdk-score-refresh').addEventListener('click',()=>{
    if(active)void load(active);
  });
  clear();
  return {clear,load};
}
