const $=id=>document.getElementById(id);
const PLAN_FIELDS=[
 ['plan-code','planCode'],['service','serviceName'],['scenario','scenario'],
 ['impact','businessImpact'],['activation','activationCriteria'],['owner','ownerPic'],
 ['alternate','alternatePic'],['rto','rtoMinutes'],['rpo','rpoMinutes'],
 ['steps','recoverySteps'],['communication','communicationSteps'],
 ['dependencies','dependencies'],['backup','backupReference'],
 ['evidence','evidenceLocation'],['status','status'],
];
const EXERCISE_FIELDS=[
 ['date','exerciseDate'],['type','exerciseType'],['rto','observedRtoMinutes'],
 ['rpo','observedRpoMinutes'],['outcome','outcome'],['summary','summary'],
 ['followup','followUp'],['evidence','evidenceReference'],
];
const DB_FIELDS={
 planCode:'plan_code',serviceName:'service_name',businessImpact:'business_impact',
 activationCriteria:'activation_criteria',ownerPic:'owner_pic',alternatePic:'alternate_pic',
 rtoMinutes:'rto_minutes',rpoMinutes:'rpo_minutes',recoverySteps:'recovery_steps',
 communicationSteps:'communication_steps',backupReference:'backup_reference',
 evidenceLocation:'evidence_location',
};
const STATUS={draft:'Draft',maintained:'Dikelola (bukan persetujuan)'};
const EXERCISE_TYPES={tabletop:'Simulasi meja',technical:'Pengujian teknis',restore:'Uji pemulihan data'};
const EXERCISE_RESULTS={not_assessed:'Belum dapat dinilai',passed:'Berhasil tercatat',
 partial:'Sebagian berhasil',failed:'Tidak berhasil'};
const UUID=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const node=(tag,value='',className='')=>{
 const n=document.createElement(tag);n.textContent=String(value??'');
 if(className)n.className=className;return n;
};
export function suggestRecoveryCode(service){
 if(typeof service!=='string')return '';
 const slug=service.normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
   .toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-+|-+$/g,'');
 return slug?'BCP-'+slug.slice(0,28).replace(/-+$/g,''):'';
}
export function recoveryTargetLabel(value){
 if(value===null||value===undefined||value==='')return 'Belum ditetapkan';
 if(!Number.isSafeInteger(Number(value))||Number(value)<0)return 'Belum ditetapkan';
 const minutes=Number(value);
 const hours=minutes/60;
 return String(minutes)+' menit'+(minutes&&Number.isInteger(hours)?' ('+hours+' jam)':'');
}
export const RECOVERY_TEMPLATES=Object.freeze([
 {id:'cbs',label:'Layanan Core Banking System',service:'Layanan Core Banking System',
  scenario:'Contoh gangguan: server atau aplikasi CBS utama tidak dapat diakses ketika layanan bank berlangsung.',
  impact:'Contoh dampak: transaksi dan pencatatan operasional mungkin terhambat selama layanan utama tidak tersedia.',
  activation:'Tetapkan siapa yang mengaktifkan rencana serta ambang gangguan berdasarkan prosedur eskalasi bank.',
  steps:'1. Verifikasi dan dokumentasikan gangguan.\n2. Hubungi PIC serta penyedia terkait.\n3. Periksa opsi pemulihan yang tersedia.\n4. Jalankan prosedur terotorisasi.\n5. Uji layanan dan rekonsiliasi transaksi sebelum dinyatakan pulih.'},
 {id:'network',label:'Putusnya jaringan/internet',service:'Konektivitas jaringan layanan bank',
  scenario:'Contoh gangguan: koneksi utama internet atau antar-kantor terputus sehingga aplikasi tidak dapat digunakan.',
  impact:'Contoh dampak: transaksi dan pertukaran data antar-layanan mungkin tertunda.',
  activation:'Tentukan ambang durasi, jalur eskalasi, dan otorisasi perpindahan ke koneksi alternatif.',
  steps:'1. Pastikan ruang lingkup gangguan.\n2. Hubungi operator jaringan.\n3. Evaluasi jalur alternatif yang disetujui.\n4. Pulihkan koneksi.\n5. Uji aplikasi dan rekonsiliasi transaksi yang tertunda.'},
 {id:'restore',label:'Pemulihan database dari backup',service:'Data dan database aplikasi kritis',
  scenario:'Contoh gangguan: database layanan tidak konsisten atau tidak tersedia dan membutuhkan prosedur pemulihan.',
  impact:'Contoh dampak: sebagian data atau transaksi mungkin tidak tersedia sampai integritasnya dipastikan.',
  activation:'Tetapkan kriteria restore serta persetujuan pemilik sistem sebelum prosedur dijalankan.',
  steps:'1. Amankan keadaan sistem dan bukti gangguan.\n2. Pilih salinan backup terverifikasi.\n3. Lakukan restore sesuai prosedur terotorisasi.\n4. Verifikasi integritas dan rekonsiliasi data.\n5. Dapatkan persetujuan operasional sebelum layanan dibuka.'},
 {id:'cyber',label:'Insiden keamanan atau ransomware',service:'Layanan TI yang terdampak insiden siber',
  scenario:'Contoh gangguan: serangan malware atau akses tidak sah berpotensi menghambat ketersediaan aplikasi.',
  impact:'Contoh dampak: gangguan layanan, integritas data, dan kebutuhan penanganan insiden dapat meningkat.',
  activation:'Rujuk prosedur tanggap insiden dan otorisasi pemulihan setelah ruang lingkup kejadian dinilai.',
  steps:'1. Aktifkan penanganan insiden yang berlaku.\n2. Isolasi aset yang terdampak sesuai prosedur.\n3. Pertahankan bukti investigasi.\n4. Tentukan sumber pemulihan yang dipercaya.\n5. Pulihkan dan verifikasi layanan sebelum kembali beroperasi.'},
 {id:'power',label:'Gangguan listrik dan ruang server',service:'Daya listrik dan perangkat ruang server',
  scenario:'Contoh gangguan: listrik atau fasilitas ruang server tidak tersedia sehingga perangkat kritis berhenti.',
  impact:'Contoh dampak: aplikasi dan layanan transaksi dapat terhenti selama perangkat tidak memiliki sumber daya.',
  activation:'Tentukan kriteria pengalihan daya, penghentian terkontrol, dan eskalasi fasilitas.',
  steps:'1. Pastikan sumber gangguan dan keamanan lokasi.\n2. Jalankan prosedur UPS atau daya cadangan.\n3. Lindungi sistem dan media penyimpanan.\n4. Pulihkan daya sesuai otorisasi.\n5. Periksa integritas layanan sebelum operasi normal.'},
 {id:'vendor',label:'Gangguan layanan penyedia TI',service:'Layanan TI yang dikelola penyedia',
  scenario:'Contoh gangguan: penyedia sistem atau infrastruktur tidak dapat memenuhi layanan yang diperlukan bank.',
  impact:'Contoh dampak: pekerjaan bank tertunda karena ketergantungan pada layanan atau dukungan pihak ketiga.',
  activation:'Tetapkan jalur eskalasi kontrak/SLA serta penanggung jawab internal saat gangguan penyedia.',
  steps:'1. Konfirmasi layanan dan kontrak terkait.\n2. Catat gangguan dan hubungi kanal eskalasi.\n3. Gunakan prosedur alternatif jika tersedia dan disetujui.\n4. Validasi pemulihan bersama pihak terkait.\n5. Catat hasil dan evaluasi SLA.'},
]);
export function recoveryNextStep(plan,count=0){
 if(!plan)return 'Pilih rencana untuk melihat kegiatan berikutnya.';
 if(plan.archived_at)return 'Rencana ini diarsipkan. Riwayat dan pengujian yang sudah dicatat tetap tersedia.';
 if(!count)return 'Langkah berikutnya: periksa isi rencana, tetapkan target pemulihan yang relevan, lalu jadwalkan dan laksanakan pengujian nyata.';
 return 'Sudah ada '+count+' catatan pengujian. Tinjau hasil, tindak lanjut, dan kesesuaian prosedur sebelum pembaruan rencana.';
}
export function recoveryExerciseGuidance(outcome,plan={}){
 if(outcome==='passed'){
  return 'Hasil berhasil membutuhkan RTO aktual dan referensi bukti. '+
   (plan.rpo_minutes!==null&&plan.rpo_minutes!==undefined
     ?'RPO aktual juga wajib diisi karena rencana memiliki target RPO.':'')+
   ' Pengukuran harus memenuhi target yang telah ditetapkan.';
 }
 if(outcome==='partial'||outcome==='failed')
  return 'Catat hasil yang benar-benar ditemukan dan kesenjangan yang memerlukan tindak lanjut.';
 return 'Pilih hasil berdasarkan pengujian. Jika belum ada ukuran atau bukti memadai, pilih Belum dapat dinilai.';
}
export function createRecoveryUI({api,getPermissions,onAuthFailure}){
 const state={plans:[],selected:null,exercises:[],events:[],offset:0,
  hasMore:false,loaded:false,busy:false,request:0};
 const canRead=()=>getPermissions().includes('recovery:read');
 const canWrite=()=>getPermissions().includes('recovery:write');
 function message(value='',error=false){
  const e=$('ti-recovery-message');
  e.textContent=value;e.hidden=!value;e.dataset.kind=error?'error':'success';
 }
 function sync(){
  $('ti-recovery-create').hidden=!canWrite();
  const active=state.selected&&!state.selected.archived_at;
  $('ti-recovery-edit').hidden=!canWrite()||!active;
  $('ti-recovery-archive').hidden=!canWrite()||!active;
  $('ti-recovery-add-exercise').hidden=!canWrite()||!active;
  $('ti-recovery-prev').disabled=state.busy||state.offset===0;
  $('ti-recovery-next').disabled=state.busy||!state.hasMore;
 }
 function clear(){
  ++state.request;
  state.plans=[];state.selected=null;state.exercises=[];state.events=[];
  state.offset=0;state.hasMore=false;state.loaded=false;state.busy=false;
  $('ti-recovery-list').replaceChildren();$('ti-recovery-detail').hidden=true;
  $('ti-recovery-detail-summary').replaceChildren();
  $('ti-recovery-values').replaceChildren();
  $('ti-recovery-search').value='';$('ti-recovery-view').value='active';
  $('ti-recovery-list-summary').textContent='Daftar rencana belum dimuat.';
  $('ti-recovery-dialog').close?.();$('ti-recovery-exercise-dialog').close?.();
  message();sync();
 }
 function hasFilters(){
  return Boolean($('ti-recovery-search').value.trim())||
   $('ti-recovery-view').value!=='active';
 }
 function renderList(){
  const root=$('ti-recovery-list');root.replaceChildren();
  const summary=$('ti-recovery-list-summary');
  if(!state.loaded){
   summary.textContent='Memuat rencana pemulihan…';
   root.append(node('p','Memuat rencana…','workspace-help'));return;
  }
  summary.textContent=state.plans.length
   ?'Menampilkan '+state.plans.length+' rencana pada halaman ini. Pilih rencana untuk melihat prosedur dan riwayat pengujiannya.'
   :hasFilters()?'Belum ada rencana yang cocok dengan filter. Coba Reset filter.':
    'Belum ada rencana pemulihan. Mulai dari layanan yang paling kritis dan benar-benar ada di bank.';
  if(!state.plans.length){
   const empty=node('div','','recovery-empty-state');
   empty.append(node('strong',hasFilters()?'Rencana tidak ditemukan':'Belum ada rencana tercatat'),
    node('p',hasFilters()?'Ubah kata kunci atau reset filter untuk menampilkan daftar.':
      'Gunakan Tambah rencana. Kerangka contoh dapat membantu memulai tanpa mengisi PIC, RTO, atau RPO otomatis.'));
   root.append(empty);
  }
  for(const p of state.plans){
   const card=node('article','','recovery-record');
   const top=node('div','','recovery-record-head');
   const title=node('div','','recovery-record-title');
   title.append(node('span',p.plan_code,'recovery-record-code'),
    node('strong',p.service_name));
   top.append(title,node('span',p.archived_at?'Diarsipkan':STATUS[p.status]??'Tidak diketahui',
     'recovery-status-pill'));
   const meta=node('div','','recovery-record-meta');
   meta.append(node('span','PIC: '+p.owner_pic),
    node('span','RTO: '+recoveryTargetLabel(p.rto_minutes)),
    node('span','RPO: '+recoveryTargetLabel(p.rpo_minutes)),
    node('span','Catatan uji: '+Number(p.exercise_count??0)));
   const button=node('button','Lihat rencana dan pengujian','button button-outline recovery-record-action');
   button.type='button';button.addEventListener('click',()=>void detail(p.id));
   card.append(top,meta,button);root.append(card);
  }
  $('ti-recovery-position').textContent=state.plans.length
   ?'Menampilkan '+(state.offset+1)+'–'+(state.offset+state.plans.length):'Tidak ada hasil';
  sync();
 }
 async function load(reset=true){
  if(!canRead())return;
  if(reset)state.offset=0;
  const token=++state.request;
  state.busy=true;state.loaded=false;renderList();sync();
  try{
   const q=new URLSearchParams({
    q:$('ti-recovery-search').value.trim(),
    view:$('ti-recovery-view').value,offset:String(state.offset),
   });
   const result=await api('/recovery-plans?'+q);
   if(token!==state.request)return;
   if(!result||!Array.isArray(result.plans)||result.plans.length>50||
     typeof result.hasMore!=='boolean')throw new TypeError('Daftar tidak valid');
   state.plans=result.plans;state.hasMore=result.hasMore;
  }catch(e){
   if(token!==state.request)return;
   state.plans=[];state.hasMore=false;
   if(!onAuthFailure(e))message('Daftar rencana gagal dimuat.',true);
  }finally{
   if(token===state.request){state.busy=false;state.loaded=true;renderList();}
  }
 }
 function detailGroup(title,values){
  const section=node('section','','recovery-detail-section');
  section.append(node('h3',title));
  const dl=node('dl','','ti-assets-detail-values');
  for(const [label,value] of values){
   const row=node('div','','ti-asset-detail-item');
   row.append(node('dt',label),node('dd',value));dl.append(row);
  }
  section.append(dl);return section;
 }
 function renderDetail(p,exerciseInfo){
  const summary=$('ti-recovery-detail-summary');summary.replaceChildren();
  const heading=node('div','','recovery-detail-heading');
  heading.append(node('span',p.plan_code,'recovery-record-code'),
    node('h3',p.service_name),node('p','PIC: '+p.owner_pic));
  summary.append(heading,node('span',p.archived_at?'Diarsipkan':STATUS[p.status],
    'recovery-status-pill'));
  $('ti-recovery-next-step').textContent=recoveryNextStep(p,state.exercises.length);
  const root=$('ti-recovery-values');root.replaceChildren();
  root.append(
   detailGroup('Identitas layanan dan aktivasi',[
    ['Kode rencana',p.plan_code],['Layanan penting',p.service_name],
    ['Skenario gangguan',p.scenario],['Dampak terhadap kegiatan',p.business_impact],
    ['Kriteria aktivasi',p.activation_criteria],
   ]),
   detailGroup('Tanggung jawab dan sasaran pemulihan',[
    ['PIC utama',p.owner_pic],['PIC pengganti',p.alternate_pic||'Belum ditentukan'],
    ['RTO target',recoveryTargetLabel(p.rto_minutes)],
    ['RPO target',recoveryTargetLabel(p.rpo_minutes)],
   ]),
   detailGroup('Prosedur dan dokumen pendukung',[
    ['Langkah pemulihan',p.recovery_steps],
    ['Komunikasi dan eskalasi',p.communication_steps||'Belum dicatat'],
    ['Ketergantungan layanan',p.dependencies||'Belum dicatat'],
    ['Referensi backup',p.backup_reference||'Belum dicatat'],
    ['Lokasi bukti',p.evidence_location||'Belum dicatat'],
    ['Status pencatatan',STATUS[p.status]||'Tidak diketahui'],
   ]),
  );
  const eRoot=$('ti-recovery-exercises');eRoot.replaceChildren();
  if(!state.exercises.length)
   eRoot.append(node('p','Belum ada pengujian tercatat. Catat hanya pengujian yang benar-benar dilakukan.','recovery-empty-exercise'));
  for(const e of state.exercises){
   const card=node('article','','recovery-exercise-card');
   card.append(node('strong',e.exercise_date+' · '+(EXERCISE_TYPES[e.exercise_type]||e.exercise_type)),
    node('span',EXERCISE_RESULTS[e.outcome]||'Hasil tidak diketahui','recovery-exercise-result'),
    node('p','RTO aktual: '+recoveryTargetLabel(e.observed_rto_minutes)+
      ' · RPO aktual: '+recoveryTargetLabel(e.observed_rpo_minutes)),
    node('p',e.summary),
    node('p','Bukti: '+(e.evidence_reference||'Belum dicatat')),
    node('p','Tindak lanjut: '+(e.follow_up||'Belum dicatat')),
    node('p','Revisi rencana saat uji: '+e.plan_revision,'workspace-help'));
   eRoot.append(card);
  }
  $('ti-recovery-exercise-note').textContent=exerciseInfo.truncated
   ?'Hanya 100 catatan pengujian terbaru ditampilkan.':'';
  const hRoot=$('ti-recovery-history');hRoot.replaceChildren();
  const labels={CREATED:'Rencana dibuat',UPDATED:'Rencana diperbarui',ARCHIVED:'Rencana diarsipkan'};
  for(const e of state.events){
   hRoot.append(node('p',(labels[e.action]||e.action)+' · Revisi '+e.revision+
    ' · '+new Date(e.occurred_at).toLocaleString('id-ID'),'workspace-help'));
  }
  $('ti-recovery-detail').hidden=false;sync();
 }
 async function detail(id){
  if(!UUID.test(id))return;
  const token=++state.request;
  try{
   const [p,x,h]=await Promise.all([
    api('/recovery-plans/'+id),
    api('/recovery-plans/'+id+'/exercises'),
    api('/recovery-plans/'+id+'/history'),
   ]);
   if(token!==state.request)return;
   if(!p||!Array.isArray(x?.exercises)||!Array.isArray(h?.events))
    throw new TypeError('Rincian rencana tidak valid');
   state.selected=p;state.exercises=x.exercises;state.events=h.events;
   renderDetail(p,x);
   $('ti-recovery-detail').scrollIntoView?.({block:'nearest'});
  }catch(e){if(!onAuthFailure(e))message('Detail rencana tidak dapat dimuat.',true);}
 }
 function openPlan(p=null){
  const form=$('ti-recovery-form');form.reset();
  form.dataset.id=p?.id??'';
  form.dataset.revision=String(p?.revision??0);
  for(const [name,key] of PLAN_FIELDS){
   $('ti-recovery-field-'+name).value=p?.[DB_FIELDS[key]??key]??(name==='status'?'draft':'');
  }
  $('ti-recovery-field-plan-code').readOnly=!!p;
  $('ti-recovery-suggest-code').hidden=Boolean(p);
  $('ti-recovery-template').disabled=Boolean(p);
  $('ti-recovery-use-template').hidden=Boolean(p);
  $('ti-recovery-template').value='';
  $('ti-recovery-code-hint').textContent=p
   ?'Kode permanen tidak dapat diubah setelah disimpan.':
     'Kode usulan dapat disesuaikan. Periksa keunikannya sebelum menyimpan.';
  $('ti-recovery-template-hint').textContent='Gunakan kerangka hanya bila sesuai. Periksa seluruh isinya berdasarkan kebijakan bank.';
  $('ti-recovery-form-error').hidden=true;
  $('ti-recovery-dialog-title').textContent=p?'Perbarui rencana pemulihan':'Tambah rencana pemulihan';
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
 function formError(id,msg){
  const e=$(id);e.textContent=msg;e.hidden=false;e.dataset.kind='error';
 }
 function syncExerciseGuidance(){
  const result=$('ti-recovery-test-outcome').value,plan=state.selected||{};
  const passed=result==='passed';
  $('ti-recovery-test-rto').required=passed;
  $('ti-recovery-test-rpo').required=passed&&plan.rpo_minutes!==null&&
   plan.rpo_minutes!==undefined;
  $('ti-recovery-test-evidence').required=passed;
  $('ti-recovery-exercise-hint').textContent=recoveryExerciseGuidance(result,plan);
 }
 const templateSelect=$('ti-recovery-template');
 for(const t of RECOVERY_TEMPLATES)templateSelect.add(new Option(t.label,t.id));
 templateSelect.addEventListener('change',()=>{
  const selected=RECOVERY_TEMPLATES.find(x=>x.id===templateSelect.value);
  $('ti-recovery-template-hint').textContent=selected
   ?selected.scenario+' Klik Gunakan kerangka untuk menyiapkan teks yang masih dapat diedit.':
    'Pilih kerangka hanya bila sesuai dengan layanan dan kondisi lembaga.';
 });
 $('ti-recovery-use-template').addEventListener('click',()=>{
  const selected=RECOVERY_TEMPLATES.find(x=>x.id===templateSelect.value);
  if(!selected){templateSelect.focus();return;}
  const targetNames=['service','scenario','impact','activation','steps'];
  if(targetNames.some(name=>$('ti-recovery-field-'+name).value.trim())&&
    !window.confirm('Ganti nama layanan dan teks rencana yang sudah ditulis dengan kerangka contoh?'))return;
  for(const [key,value] of [
   ['service',selected.service],['scenario',selected.scenario],
   ['impact',selected.impact],['activation',selected.activation],['steps',selected.steps],
  ])$('ti-recovery-field-'+key).value=value;
  $('ti-recovery-template-hint').textContent=
   'Kerangka terisi. Sesuaikan dengan prosedur bank. PIC, RTO, RPO dan bukti tidak diisi otomatis.';
 });
 $('ti-recovery-suggest-code').addEventListener('click',()=>{
  const service=$('ti-recovery-field-service');
  if(!service.value.trim()){
   service.focus();$('ti-recovery-code-hint').textContent='Isi nama layanan terlebih dahulu.';return;
  }
  const code=suggestRecoveryCode(service.value);
  if(code){
   $('ti-recovery-field-plan-code').value=code;
   $('ti-recovery-code-hint').textContent='Kode usulan: '+code+'. Periksa keunikannya sebelum menyimpan.';
  }
 });
 $('ti-recovery-filter-form').addEventListener('submit',e=>{e.preventDefault();void load();});
 $('ti-recovery-reset-filters').addEventListener('click',()=>{
  $('ti-recovery-search').value='';$('ti-recovery-view').value='active';void load();
 });
 $('ti-recovery-view').addEventListener('change',()=>void load());
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
   const p=await api(oldId?'/recovery-plans/'+oldId:'/recovery-plans',{
    method:oldId?'PATCH':'POST',body,
   });
   $('ti-recovery-dialog').close();await load();await detail(p.id);
   message('Rencana tersimpan. Periksa kembali terhadap dokumen dan kebijakan bank.');
  }catch(err){
   if(!onAuthFailure(err))formError('ti-recovery-form-error',
    err?.status===409?'Data berubah atau kode telah dipakai. Muat ulang sebelum melanjutkan.':
    'Gagal menyimpan. Periksa isian wajib, ukuran teks dan format data.');
  }finally{state.busy=false;$('ti-recovery-save').disabled=false;sync();}
 });
 $('ti-recovery-archive').addEventListener('click',async()=>{
  const p=state.selected;
  if(!p||!canWrite()||state.busy||!window.confirm('Arsipkan rencana ini? Riwayat tetap disimpan.'))return;
  state.busy=true;sync();
  try{
   await api('/recovery-plans/'+p.id+'/archive',{method:'POST',body:{expectedRevision:p.revision}});
   await load();await detail(p.id);message('Rencana diarsipkan.');
  }catch(err){if(!onAuthFailure(err))message('Pengarsipan gagal. Muat ulang data.',true);}
  finally{state.busy=false;sync();}
 });
 $('ti-recovery-add-exercise').addEventListener('click',()=>{
  $('ti-recovery-exercise-form').reset();
  $('ti-recovery-test-date').value='';
  $('ti-recovery-test-type').value='';
  $('ti-recovery-test-outcome').value='';
  $('ti-recovery-exercise-error').hidden=true;
  syncExerciseGuidance();
  $('ti-recovery-exercise-dialog').showModal();
 });
 $('ti-recovery-test-outcome').addEventListener('change',syncExerciseGuidance);
 $('ti-recovery-exercise-form').addEventListener('submit',async e=>{
  e.preventDefault();
  if(state.busy||!canWrite()||!state.selected)return;
  state.busy=true;$('ti-recovery-exercise-save').disabled=true;
  const id=state.selected.id;
  try{
   await api('/recovery-plans/'+id+'/exercises',{
    method:'POST',body:payload(EXERCISE_FIELDS,'ti-recovery-test-'),
   });
   $('ti-recovery-exercise-dialog').close();await detail(id);
   message('Catatan pengujian tersimpan. Hasil tetap perlu diperiksa petugas.');
  }catch(err){
   if(!onAuthFailure(err))formError('ti-recovery-exercise-error',
    'Gagal menyimpan. Hasil berhasil perlu RTO terukur, bukti, dan pemenuhan target yang berlaku.');
  }finally{state.busy=false;$('ti-recovery-exercise-save').disabled=false;sync();}
 });
 sync();return {load,clear,sync};
}
