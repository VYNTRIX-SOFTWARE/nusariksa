const $=id=>document.getElementById(id);
const PLAN_FIELDS=[["plan-code","planCode"],["service","serviceName"],["scenario","scenario"],["impact","businessImpact"],["activation","activationCriteria"],["owner","ownerPic"],["alternate","alternatePic"],["rto","rtoMinutes"],["rpo","rpoMinutes"],["steps","recoverySteps"],["communication","communicationSteps"],["dependencies","dependencies"],["backup","backupReference"],["evidence","evidenceLocation"],["status","status"]];
const EXERCISE_FIELDS=[["date","exerciseDate"],["type","exerciseType"],["rto","observedRtoMinutes"],["rpo","observedRpoMinutes"],["outcome","outcome"],["summary","summary"],["followup","followUp"],["evidence","evidenceReference"]];
const NAMES={"plan-code":"Kode rencana","service":"Layanan kritikal","scenario":"Skenario gangguan","impact":"Dampak terhadap bisnis","activation":"Kriteria aktivasi","owner":"PIC utama","alternate":"PIC pengganti","rto":"RTO target (menit)","rpo":"RPO target (menit)","steps":"Langkah pemulihan","communication":"Komunikasi dan eskalasi","dependencies":"Ketergantungan layanan","backup":"Referensi backup","evidence":"Lokasi penyimpanan bukti","status":"Status pencatatan"};
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
function node(tag,text='',className=''){const e=document.createElement(tag);e.textContent=String(text??'');if(className)e.className=className;return e;}
export function createRecoveryUI({api,getPermissions,onAuthFailure}){
 const state={plans:[],selected:null,exercises:[],events:[],offset:0,hasMore:false,busy:false,request:0};
 const canRead=()=>getPermissions().includes('recovery:read');
 const canWrite=()=>getPermissions().includes('recovery:write');
 function message(text='',error=false){
  const e=$('ti-recovery-message');e.textContent=text;e.hidden=!text;e.dataset.kind=error?'error':'success';
 }
 function sync(){
  $('ti-recovery-create').hidden=!canWrite();
  $('ti-recovery-edit').hidden=!canWrite()||!state.selected||!!state.selected.archived_at;
  $('ti-recovery-archive').hidden=!canWrite()||!state.selected||!!state.selected.archived_at;
  $('ti-recovery-add-exercise').hidden=!canWrite()||!state.selected||!!state.selected.archived_at;
  $('ti-recovery-prev').disabled=state.busy||state.offset===0;
  $('ti-recovery-next').disabled=state.busy||!state.hasMore;
 }
 function clear(){
  ++state.request;state.plans=[];state.selected=null;state.exercises=[];state.events=[];
  state.offset=0;state.hasMore=false;state.busy=false;
  $('ti-recovery-list').replaceChildren();$('ti-recovery-detail').hidden=true;
  $('ti-recovery-dialog').close?.();$('ti-recovery-exercise-dialog').close?.();
  message();sync();
 }
 function row(root,title,description,click){
  const div=node('div','','ti-vendor-row'),button=node('button',title,'ti-vendor-open');
  button.type='button';button.addEventListener('click',click);
  div.append(button,node('p',description,'workspace-help'));root.append(div);
 }
 function renderList(){
  const root=$('ti-recovery-list');root.replaceChildren();
  if(!state.plans.length)root.append(node('p','Belum ada rencana pemulihan pada filter ini.','workspace-help'));
  for(const p of state.plans)row(root,p.plan_code+' · '+p.service_name,
    'PIC '+p.owner_pic+' · RTO '+(p.rto_minutes??'belum ditetapkan')+
    ' menit · RPO '+(p.rpo_minutes??'belum ditetapkan')+
    ' menit · Uji '+p.exercise_count+(p.archived_at?' · Diarsipkan':''),
    ()=>void detail(p.id));
  $('ti-recovery-position').textContent=state.plans.length?
    (state.offset+1)+'–'+(state.offset+state.plans.length):'Tidak ada hasil';
  sync();
 }
 async function load(reset=true){
  if(!canRead())return;
  if(reset)state.offset=0;
  const token=++state.request;state.busy=true;sync();
  try{
   const q=new URLSearchParams({q:$('ti-recovery-search').value.trim(),
    view:$('ti-recovery-view').value,offset:String(state.offset)});
   const result=await api('/recovery-plans?'+q);
   if(token!==state.request)return;
   if(!Array.isArray(result.plans))throw new Error('Respons tidak valid');
   state.plans=result.plans;state.hasMore=result.hasMore;
   renderList();
  }catch(e){if(token===state.request&&!onAuthFailure(e))message('Daftar rencana gagal dimuat.',true);}
  finally{if(token===state.request){state.busy=false;sync();}}
 }
 async function detail(id){
  if(!UUID.test(id))return;
  const token=++state.request;
  try{
   const [p,x,h]=await Promise.all([api('/recovery-plans/'+id),
    api('/recovery-plans/'+id+'/exercises'),api('/recovery-plans/'+id+'/history')]);
   if(token!==state.request)return;
   state.selected=p;state.exercises=x.exercises;state.events=h.events;
   const root=$('ti-recovery-values');root.replaceChildren();
   for(const [name,key] of PLAN_FIELDS){
    const label=node('dt',NAMES[name]),value=node('dd',
     p[({planCode:'plan_code',serviceName:'service_name',businessImpact:'business_impact',
     activationCriteria:'activation_criteria',ownerPic:'owner_pic',alternatePic:'alternate_pic',
     rtoMinutes:'rto_minutes',rpoMinutes:'rpo_minutes',recoverySteps:'recovery_steps',
     communicationSteps:'communication_steps',backupReference:'backup_reference',
     evidenceLocation:'evidence_location'}[key]??key)]??'Belum dicatat');
    const div=node('div','','ti-asset-detail-item');div.append(label,value);root.append(div);
   }
   const exerciseRoot=$('ti-recovery-exercises');exerciseRoot.replaceChildren();
   for(const e of state.exercises){
    const div=node('div','','ti-vendor-row');
    div.append(node('strong',e.exercise_date+' · '+e.exercise_type+' · '+e.outcome),
     node('p','Revisi rencana '+e.plan_revision+' · RTO aktual '+
     (e.observed_rto_minutes??'tidak diukur')+' menit · RPO aktual '+
     (e.observed_rpo_minutes??'tidak diukur')+' menit · '+e.summary,'workspace-help'),
     node('p','Bukti: '+(e.evidence_reference||'belum dilampirkan')+
     ' · Tindak lanjut: '+(e.follow_up||'belum dicatat'),'workspace-help'));
    exerciseRoot.append(div);
   }
   if(!state.exercises.length)exerciseRoot.append(node('p','Belum ada pengujian tercatat.','workspace-help'));
   $('ti-recovery-exercise-note').textContent=x.truncated?'Hanya 100 pengujian terbaru ditampilkan.':'';
   const historyRoot=$('ti-recovery-history');historyRoot.replaceChildren();
   for(const e of state.events)historyRoot.append(node('p',
    e.action+' · Revisi '+e.revision+' · '+new Date(e.occurred_at).toLocaleString('id-ID'),'workspace-help'));
   $('ti-recovery-detail').hidden=false;sync();
  }catch(e){if(!onAuthFailure(e))message('Detail rencana tidak dapat dimuat.',true);}
 }
 const column={planCode:'plan_code',serviceName:'service_name',businessImpact:'business_impact',
  activationCriteria:'activation_criteria',ownerPic:'owner_pic',alternatePic:'alternate_pic',
  rtoMinutes:'rto_minutes',rpoMinutes:'rpo_minutes',recoverySteps:'recovery_steps',
  communicationSteps:'communication_steps',backupReference:'backup_reference',evidenceLocation:'evidence_location'};
 function openPlan(p=null){
  const form=$('ti-recovery-form');form.reset();form.dataset.id=p?.id??'';
  form.dataset.revision=String(p?.revision??0);
  for(const [name,key] of PLAN_FIELDS){
   const input=$('ti-recovery-field-'+name);
   input.value=p?.[column[key]??key]??(name==='status'?'draft':'');
  }
  $('ti-recovery-field-plan-code').readOnly=!!p;
  $('ti-recovery-form-error').hidden=true;$('ti-recovery-dialog-title').textContent=p?'Perbarui rencana':'Tambah rencana';
  $('ti-recovery-dialog').showModal();
 }
 function payload(mapping,prefix){
  return Object.fromEntries(mapping.map(([name,key])=>{
   const input=$(prefix+name);let value=input.value;
   if(['rtoMinutes','rpoMinutes','observedRtoMinutes','observedRpoMinutes'].includes(key))
    value=value===''?null:Number(value);
   return [key,value];
  }));
 }
 function formError(id,msg){const e=$(id);e.textContent=msg;e.hidden=false;e.dataset.kind='error';}
 $('ti-recovery-filter-form').addEventListener('submit',e=>{e.preventDefault();void load();});
 $('ti-recovery-prev').addEventListener('click',()=>{state.offset=Math.max(0,state.offset-50);void load(false);});
 $('ti-recovery-next').addEventListener('click',()=>{state.offset+=50;void load(false);});
 $('ti-recovery-create').addEventListener('click',()=>openPlan());
 $('ti-recovery-edit').addEventListener('click',()=>{if(state.selected)openPlan(state.selected);});
 $('ti-recovery-cancel').addEventListener('click',()=>$('ti-recovery-dialog').close());
 $('ti-recovery-exercise-cancel').addEventListener('click',()=>$('ti-recovery-exercise-dialog').close());
 $('ti-recovery-form').addEventListener('submit',async e=>{
  e.preventDefault();if(state.busy||!canWrite())return;
  state.busy=true;$('ti-recovery-save').disabled=true;
  const form=e.currentTarget,oldId=form.dataset.id;
  try{
   const body=payload(PLAN_FIELDS,'ti-recovery-field-');
   if(oldId)body.expectedRevision=Number(form.dataset.revision);
   const p=await api(oldId?'/recovery-plans/'+oldId:'/recovery-plans',
    {method:oldId?'PATCH':'POST',body});
   $('ti-recovery-dialog').close();await load();await detail(p.id);
   message('Rencana tersimpan. Periksa kembali terhadap dokumen bank.');
  }catch(err){if(!onAuthFailure(err))formError('ti-recovery-form-error','Gagal menyimpan. Periksa kelengkapan, revisi, dan format data.');}
  finally{state.busy=false;$('ti-recovery-save').disabled=false;sync();}
 });
 $('ti-recovery-archive').addEventListener('click',async()=>{
  const p=state.selected;if(!p||!canWrite()||!window.confirm('Arsipkan rencana ini? Riwayat tetap disimpan.'))return;
  try{await api('/recovery-plans/'+p.id+'/archive',{method:'POST',body:{expectedRevision:p.revision}});
   await load();await detail(p.id);message('Rencana diarsipkan.');
  }catch(err){if(!onAuthFailure(err))message('Pengarsipan gagal. Muat ulang data.',true);}
 });
 $('ti-recovery-add-exercise').addEventListener('click',()=>{
  $('ti-recovery-exercise-form').reset();
  $('ti-recovery-test-date').value=new Date().toISOString().slice(0,10);
  $('ti-recovery-exercise-error').hidden=true;$('ti-recovery-exercise-dialog').showModal();
 });
 $('ti-recovery-exercise-form').addEventListener('submit',async e=>{
  e.preventDefault();if(state.busy||!canWrite()||!state.selected)return;
  state.busy=true;$('ti-recovery-exercise-save').disabled=true;
  const id=state.selected.id;
  try{
   await api('/recovery-plans/'+id+'/exercises',{method:'POST',body:payload(EXERCISE_FIELDS,'ti-recovery-test-')});
   $('ti-recovery-exercise-dialog').close();await detail(id);message('Catatan pengujian tersimpan.');
  }catch(err){if(!onAuthFailure(err))formError('ti-recovery-exercise-error','Gagal menyimpan. Hasil berhasil memerlukan bukti dan RTO aktual yang memenuhi target.');}
  finally{state.busy=false;$('ti-recovery-exercise-save').disabled=false;sync();}
 });
 sync();return {load,clear,sync};
}
