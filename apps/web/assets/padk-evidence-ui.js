import {fileToBase64} from './assessment-evidence.js';
import {ApiError} from './session.js';

const $=id=>document.getElementById(id);
const BASE='/regulatory/padk43/cyber/preparations';
const element=(tag,text)=>{const e=document.createElement(tag);e.textContent=String(text??'');return e;};
export function validatePadkEvidenceListing(payload,id,number){
  if(!payload||payload.preparationId!==id||payload.indicatorNumber!==number
    ||payload.status!=='DRAFT_EVIDENCE'||payload.regulatoryPackVerified!==false
    ||!Array.isArray(payload.evidence)||payload.evidence.length>10
    ||payload.evidence.some(e=>!e||typeof e.id!=='string'
      ||!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(e.id)
      ||typeof e.fileName!=='string'||!Number.isSafeInteger(e.sizeBytes)
      ||e.sizeBytes<1||e.sizeBytes>1048576))
    throw new TypeError('Daftar bukti PADK tidak valid.');
  return payload.evidence;
}
export function createPadkEvidenceUI({api,onAuthFailure,getUserId,getPermissions}){
  let context=null,nonce=0,busy=false;
  const canRead=()=>Boolean(context&&getPermissions().includes('evidence:read'));
  const canWrite=()=>Boolean(canRead()&&context.noteRevision>0
    &&context.ownerUserId===getUserId()
    &&getPermissions().includes('evidence:write'));
  const path=()=>BASE+'/'+encodeURIComponent(context.id)+
    '/indicators/'+context.number+'/evidence';
  function inform(value,kind='info'){
    const label=$('pdk-evidence-message');
    label.hidden=!value;label.textContent=value??'';label.dataset.kind=kind;
  }
  function sync(){
    $('pdk-evidence-panel').hidden=!canRead();
    $('pdk-evidence-upload').hidden=!canWrite();
    $('pdk-evidence-file').disabled=busy||!canWrite();
    $('pdk-evidence-upload-button').disabled=busy||!canWrite();
    $('pdk-evidence-reload').disabled=busy||!canRead();
    $('pdk-evidence-save-first').hidden=!canRead()||context.noteRevision>0;
  }
  function clear(){
    nonce++;context=null;busy=false;
    $('pdk-evidence-list').replaceChildren();
    $('pdk-evidence-upload').reset();inform('');sync();
  }
  function render(files){
    const root=$('pdk-evidence-list');root.replaceChildren();
    if(!files.length){
      root.append(element('p','Belum ada dokumen bukti aktual untuk indikator ini.'));
      return;
    }
    for(const file of files){
      const row=element('div','');row.className='workspace-evidence-item';
      const caption=element('span',file.fileName+' · '+
        Math.ceil(file.sizeBytes/1024)+' KiB');
      const link=element('a','Unduh bukti');
      link.className='detail-link';
      link.href=BASE+'/'+encodeURIComponent(context.id)+'/evidence/'+
        encodeURIComponent(file.id)+'/download';
      link.setAttribute('aria-label','Unduh bukti '+file.fileName);
      row.append(caption,link);root.append(row);
    }
  }
  async function reload(){
    if(!canRead()||busy)return;
    const request=++nonce,id=context.id,num=context.number;
    $('pdk-evidence-list').replaceChildren(element('p','Memuat bukti…'));
    try{
      const result=await api(path());
      if(request!==nonce||context?.id!==id||context.number!==num)return;
      render(validatePadkEvidenceListing(result,id,num));
    }catch(error){
      if(request!==nonce)return;
      if(onAuthFailure(error))return;
      $('pdk-evidence-list').replaceChildren();
      inform('Bukti gagal dimuat. Periksa akses atau koneksi.','error');
    }
  }
  function open(preparation,indicator){
    clear();
    if(!preparation||!indicator)return;
    context={id:preparation.id,number:indicator.number,
      ownerUserId:preparation.ownerUserId,noteRevision:indicator.revision};
    sync();
    if(canRead())void reload();
  }
  $('pdk-evidence-reload').addEventListener('click',()=>void reload());
  $('pdk-evidence-upload').addEventListener('submit',async event=>{
    event.preventDefault();
    if(!canWrite()||busy)return;
    const file=$('pdk-evidence-file').files?.[0];
    if(!file){inform('Pilih dokumen bukti terlebih dahulu.','error');return;}
    const generation=nonce,id=context.id,num=context.number;
    busy=true;sync();inform('');
    try{
      const contentBase64=await fileToBase64(file);
      if(generation!==nonce||context?.id!==id||context.number!==num)return;
      await api(path(),{method:'POST',body:{
        fileName:file.name,mediaType:file.type,contentBase64,
      }});
      if(generation!==nonce)return;
      $('pdk-evidence-upload').reset();
      busy=false;sync();
      await reload();
      if(generation+1===nonce)
        inform('Bukti berhasil disimpan terenkripsi dan tidak dapat diubah.','success');
    }catch(error){
      if(generation!==nonce)return;
      if(onAuthFailure(error))return;
      inform(error instanceof TypeError?error.message
        :error instanceof ApiError&&error.status===503
          ?'Kunci penyimpanan bukti belum dikonfigurasi.'
          :error instanceof ApiError&&error.status===409
            ?'Simpan indikator dahulu atau batas 10 bukti sudah tercapai.'
            :'Gagal mengunggah bukti. Periksa file dan izin akses.','error');
    }finally{if(generation===nonce){busy=false;sync();}}
  });
  clear();
  return {open,clear,sync};
}
