/**
 * Accessible same-origin confirmation for consequential assessment actions.
 * Text is assigned with textContent (never HTML) and CSP remains unchanged.
 */
let pending=false;
export function confirmAssessmentAction({
  title,description,confirmLabel='Lanjutkan',tone='primary',
}={}){
  if(typeof title!=='string'||!title.trim()
    ||typeof description!=='string'||!description.trim()
    ||typeof confirmLabel!=='string'||!confirmLabel.trim()
    ||!['primary','danger'].includes(tone))
    return Promise.reject(new TypeError('Dialog konfirmasi tidak valid.'));
  if(pending)return Promise.resolve(false);
  pending=true;
  const dialog=document.createElement('dialog');
  dialog.className='nr-action-dialog';
  dialog.id='nr-action-dialog';
  dialog.setAttribute('aria-labelledby','nr-action-title');
  dialog.setAttribute('aria-describedby','nr-action-description');
  const heading=document.createElement('h2');heading.id='nr-action-title';
  heading.textContent=title;
  const detail=document.createElement('p');detail.id='nr-action-description';
  detail.textContent=description;
  const actions=document.createElement('div');actions.className='nr-action-buttons';
  const cancel=document.createElement('button');cancel.type='button';
  cancel.className='button button-outline';cancel.textContent='Batal';
  const yes=document.createElement('button');yes.type='button';
  yes.className='button button-primary';
  if(tone==='danger')yes.classList.add('nr-action-danger');
  yes.id='nr-action-accept';yes.textContent=confirmLabel;
  actions.append(cancel,yes);dialog.append(heading,detail,actions);
  document.body.append(dialog);
  return new Promise(resolve=>{
    let resolved=false;
    function finish(accepted){
      if(resolved)return;
      resolved=true;pending=false;dialog.remove();resolve(accepted);
    }
    cancel.addEventListener('click',()=>dialog.close('cancel'));
    yes.addEventListener('click',()=>dialog.close('accept'));
    dialog.addEventListener('close',()=>finish(dialog.returnValue==='accept'),{once:true});
    dialog.addEventListener('cancel',()=>finish(false),{once:true});
    try{dialog.showModal();cancel.focus();}
    catch{finish(false);}
  });
}
