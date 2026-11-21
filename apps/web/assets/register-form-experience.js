import {confirmAssessmentAction} from './action-dialog.js';

/**
 * The snapshot includes only user-editable controls. Generated document codes
 * and disabled reference pickers are not treated as unsaved work.
 */
export function registerFormSnapshot(form){
  return JSON.stringify([...form.querySelectorAll('input,select,textarea')]
    .filter(field=>!field.disabled&&!field.readOnly
      &&!['button','submit','reset','hidden'].includes(field.type))
    .map(field=>[field.id||field.name,
      ['checkbox','radio'].includes(field.type)?Boolean(field.checked):field.value]));
}
export function describeInvalidRegisterField(field,label='Kolom ini'){
  const name=String(label||'Kolom ini').replace(/\s+/g,' ').trim();
  const v=field.validity??{};
  if(v.valueMissing)return name+' wajib diisi.';
  if(v.tooShort)return name+' minimal '+field.minLength+' karakter.';
  if(v.tooLong)return name+' maksimal '+field.maxLength+' karakter.';
  if(v.typeMismatch)return name+' memiliki format yang tidak sesuai.';
  if(v.badInput||v.stepMismatch||v.rangeOverflow||v.rangeUnderflow)
    return name+' di luar batas nilai yang diperbolehkan.';
  if(v.patternMismatch)return name+' tidak sesuai format yang diminta.';
  return name+' belum valid. Periksa kembali isian.';
}

/**
 * Consistent field-level errors and a guard against discarding unsaved work.
 * Does not change HTTP payloads, backend validation, or existing permissions.
 */
export function createRegisterFormExperience({formId,dialogId,errorId,cancelId}){
  const form=document.getElementById(formId),dialog=document.getElementById(dialogId);
  const summary=document.getElementById(errorId),cancel=document.getElementById(cancelId);
  if(!form||!dialog||!summary||!cancel)throw new TypeError('Konfigurasi formulir register tidak lengkap');
  let baseline='',confirming=false,focusQueued=false;
  const marked=new Map();
  function fieldLabel(field){
    const label=field.closest('label')||
      [...form.querySelectorAll('label')].find(l=>l.htmlFor===field.id);
    return label?.firstChild?.textContent?.trim()||'Kolom ini';
  }
  function clearField(field){
    const previous=marked.get(field);
    if(!previous)return;
    field.removeAttribute('aria-invalid');
    const described=(field.getAttribute('aria-describedby')||'').split(/\s+/)
      .filter(id=>id&&id!==previous.id);
    if(described.length)field.setAttribute('aria-describedby',described.join(' '));
    else field.removeAttribute('aria-describedby');
    previous.remove();marked.delete(field);
  }
  function clear(){
    for(const field of [...marked.keys()])clearField(field);
    summary.hidden=true;summary.textContent='';
  }
  function mark(field,message){
    if(!field||!form.contains(field))return;
    clearField(field);
    field.closest('details')?.setAttribute('open','');
    const hint=document.createElement('small');
    hint.className='nr-register-field-error';hint.id=field.id+'-validation';
    hint.setAttribute('role','status');hint.textContent=message;
    field.insertAdjacentElement('afterend',hint);
    const existing=field.getAttribute('aria-describedby')||'';
    field.setAttribute('aria-describedby',[existing,hint.id].filter(Boolean).join(' '));
    field.setAttribute('aria-invalid','true');
    marked.set(field,hint);
  }
  function showError(message,fieldId=null){
    summary.textContent=message;summary.hidden=false;
    const field=fieldId?document.getElementById(fieldId):null;
    if(field&&form.contains(field)){
      mark(field,message);
      field.focus({preventScroll:false});
    }else{
      summary.setAttribute('tabindex','-1');
      summary.focus({preventScroll:false});
    }
  }
  form.addEventListener('invalid',event=>{
    const field=event.target;
    if(!field||!form.contains(field)||!field.id)return;
    event.preventDefault();
    mark(field,describeInvalidRegisterField(field,fieldLabel(field)));
    summary.textContent='Periksa kolom yang ditandai, lalu simpan kembali.';
    summary.hidden=false;
    if(!focusQueued){
      focusQueued=true;
      queueMicrotask(()=>{
        // Focus the first invalid control in document order, not the last event.
        const first=[...form.querySelectorAll('[aria-invalid="true"]')][0];
        first?.focus({preventScroll:false});
        focusQueued=false;
      });
    }
  },true);
  const afterEdit=event=>{
    if(marked.has(event.target)&&event.target.validity?.valid)clearField(event.target);
    if(!marked.size&&summary.textContent==='Periksa kolom yang ditandai, lalu simpan kembali.')
      {summary.hidden=true;summary.textContent='';}
  };
  form.addEventListener('input',afterEdit);
  form.addEventListener('change',afterEdit);
  function open(){
    clear();dialog.showModal();baseline=registerFormSnapshot(form);
  }
  async function requestClose(){
    if(confirming||!dialog.open)return;
    if(registerFormSnapshot(form)===baseline){dialog.close();return;}
    confirming=true;
    try{
      if(await confirmAssessmentAction({
        title:'Buang perubahan yang belum disimpan?',
        description:'Isian pada formulir ini akan hilang jika Anda keluar tanpa menyimpan.',
        confirmLabel:'Buang perubahan',tone:'danger',
      }))dialog.close();
    }finally{confirming=false;}
  }
  cancel.addEventListener('click',()=>void requestClose());
  dialog.addEventListener('cancel',event=>{event.preventDefault();void requestClose();});
  dialog.addEventListener('close',()=>{baseline='';clear();});
  return {open,showError,requestClose,clear,
    hasChanges:()=>dialog.open&&registerFormSnapshot(form)!==baseline};
}
