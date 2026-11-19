import {downloadPrivateReport,reportDownloadError} from './private-report-download.js';
const permissions=Object.freeze({
  assets:'assets:read',risks:'risks:read',incidents:'incidents:read',
  findings:'findings:read',vendors:'vendors:read',
  'vendor-contracts':'vendors:read','vendor-sla':'vendors:read',
  recovery:'recovery:read','recovery-tests':'recovery:read',
});
const groups=Object.freeze({
  assets:'ti-assets-message',risks:'ti-risks-message',
  incidents:'ti-incidents-message',findings:'ti-findings-message',
  vendors:'ti-vendors-message','vendor-contracts':'ti-vendors-message',
  'vendor-sla':'ti-vendors-message',recovery:'ti-recovery-message',
  'recovery-tests':'ti-recovery-message',
});
export function createRegisterExportButtons({getPermissions,onAuthFailure}){
  const buttons=[...document.querySelectorAll('[data-register-export],[data-register-pdf]')];
  for(const button of buttons){
    const type=button.dataset.registerExport??button.dataset.registerPdf;
    if(!Object.hasOwn(permissions,type))
      throw new TypeError('Tipe ekspor register tidak dikenal');
    button.addEventListener('click',async()=>{
      const format=button.dataset.registerPdf?'pdf':'csv';
      const available=getPermissions();
      if(!available.includes('reports:read')||!available.includes(permissions[type])
        ||button.disabled)return;
      button.disabled=true;
      const message=document.getElementById(groups[type]);
      try{
        await downloadPrivateReport('/register-exports/'+type+'.'+format,
          'nusariksa-'+type+'-internal.'+format,
          {accept:format==='pdf'?'application/pdf':'text/csv'});
        if(message){message.textContent=(format==='pdf'?'PDF':'CSV')+' register siap diunduh.';message.hidden=false;message.dataset.kind='success';}
      }catch(error){
        if(!onAuthFailure(error)&&message){
          message.textContent=reportDownloadError(error);message.hidden=false;message.dataset.kind='error';
        }
      }finally{button.disabled=false;}
    });
  }
  function sync(){
    const allowed=getPermissions();
    for(const button of buttons){
      const type=button.dataset.registerExport??button.dataset.registerPdf;
      button.hidden=!(allowed.includes('reports:read')&&allowed.includes(permissions[type]));
    }
  }
  sync();
  return {sync};
}
