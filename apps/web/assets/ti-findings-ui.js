const $=id=>document.getElementById(id);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRIORITY={low:'Rendah',medium:'Sedang',high:'Tinggi',critical:'Kritis'};
const STATUS={open:'Terbuka',in_progress:'Dalam perbaikan',
  pending_verification:'Menunggu pemeriksaan',changes_requested:'Perlu perbaikan',closed:'Selesai'};
const SOURCES={manual:'Pemeriksaan langsung',assessment:'Hasil asesmen kontrol',
  risk:'Register risiko',incident:'Catatan insiden'};
const ACTIONS={CREATED:'Temuan dicatat',UPDATED:'Perbaikan diperbarui',
  SUBMITTED:'Diajukan untuk pemeriksaan',RETURNED:'Dikembalikan untuk perbaikan',
  VERIFIED:'Perbaikan diverifikasi',ARCHIVED:'Temuan diarsipkan'};
const PRIORITY_GUIDANCE={
  low:'Rendah: gangguan terbatas; penanganan dapat dijadwalkan secara wajar.',
  medium:'Sedang: memengaruhi pekerjaan atau kontrol, tetapi dampaknya masih terkendali.',
  high:'Tinggi: berdampak besar pada layanan, keamanan data, atau pengendalian penting.',
  critical:'Kritis: berpotensi mengganggu layanan utama atau menimbulkan dampak material yang membutuhkan penanganan segera.',
};
export const findingPriorityGuidance=value=>PRIORITY_GUIDANCE[value]??
  'Pilih berdasarkan urgensi dan dampak aktual. Tidak ada prioritas otomatis.';
export function suggestFindingCode(title){
  if(typeof title!=='string')return '';
  const code=title.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase()
    .replace(/[^A-Z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  return code?'TEM-'+code.slice(0,28).replace(/-+$/g,''):'';
}
export function findingSubmissionChecklist(record){
  return [
    {key:'plan',label:'Rencana perbaikan',complete:typeof record?.action_plan==='string'&&record.action_plan.trim().length>=10},
    {key:'result',label:'Hasil tindakan',complete:typeof record?.progress_note==='string'&&record.progress_note.trim().length>=10},
    {key:'evidence',label:'Referensi bukti yang dapat diperiksa',complete:typeof record?.evidence_reference==='string'&&record.evidence_reference.trim().length>=10},
  ];
}
export function findingNextStep(record){
  if(record?.archived_at)return 'Temuan telah diarsipkan; catatan dan riwayat tetap tersedia.';
  if(!record)return 'Pilih temuan untuk melihat langkah berikutnya.';
  if(record.status==='closed')return 'Perbaikan telah diverifikasi oleh pemeriksa yang berwenang.';
  if(record.status==='pending_verification')return 'Menunggu pemeriksaan oleh petugas lain yang berwenang, bukan pembuat atau pengaju temuan.';
  if(record.status==='changes_requested')return 'Pemeriksa meminta perbaikan. Periksa catatan pada riwayat, perbarui tindakan dan bukti, lalu ajukan kembali.';
  return findingSubmissionChecklist(record).every(x=>x.complete)
    ?'Semua persyaratan administrasi pengajuan telah terisi. Pembuat temuan dapat mengajukan hasil perbaikan untuk diperiksa.'
    :'Lengkapi rencana, hasil tindakan, dan referensi bukti sebelum mengajukan pemeriksaan. Simpan perkembangan secara bertahap.';
}
const el=(tag,value,cls)=>{
  const n=document.createElement(tag);n.textContent=String(value??'');
  if(cls)n.className=cls;return n;
};
export function validFinding(x){
  if(!x||!UUID.test(x.id)||typeof x.finding_code!=='string'
    ||typeof x.title!=='string'||!Object.hasOwn(STATUS,x.status)
    ||!Object.hasOwn(PRIORITY,x.priority)||!Object.hasOwn(SOURCES,x.source_type)
    ||!Number.isSafeInteger(x.revision)||x.revision<1)throw new TypeError('Invalid finding');
  return x;
}
function formSourceValue(record){
  if(!record||record.source_type==='manual')return '';
  if(record.source_type==='assessment')return record.assessment_id+':'+record.control_id;
  if(record.source_type==='risk')return record.risk_id;
  return record.incident_id;
}
export function createFindingManagementUI({api,getPermissions,getUserId,onAuthFailure}){
  const state={items:[],options:null,selected:null,loaded:false,busy:false,
    offset:0,more:false,request:0,detailRequest:0};
  const read=()=>getPermissions().includes('findings:read');
  const write=()=>getPermissions().includes('findings:write');
  const verify=()=>getPermissions().includes('findings:verify');
  const owner=x=>x&&x.created_by===getUserId();
  function message(value,kind='info'){
    const n=$('ti-findings-message');n.textContent=value??'';n.hidden=!value;n.dataset.kind=kind;
  }
  function sync(){
    const f=state.selected,editable=write()&&owner(f)&&!f.archived_at
      &&['open','in_progress','changes_requested'].includes(f.status);
    $('ti-findings-create').hidden=!write();
    $('ti-findings-save').disabled=state.busy||!write();
    $('ti-findings-edit').hidden=!editable;
    $('ti-findings-submit').hidden=!editable;
    $('ti-findings-submit').disabled=state.busy||
      !findingSubmissionChecklist(f).every(x=>x.complete);
    $('ti-findings-archive').hidden=!write()||!owner(f)||!f||!!f.archived_at||f.status!=='closed';
    $('ti-findings-archive').disabled=state.busy;
    $('ti-findings-review-form').hidden=!verify()||!f||!!f.archived_at
      ||f.status!=='pending_verification'||owner(f)||f.submitted_by===getUserId();
    $('ti-findings-review-save').disabled=state.busy;
  }
  function clear(){
    ++state.request;++state.detailRequest;
    state.items=[];state.options=null;state.selected=null;state.loaded=false;
    state.busy=false;state.offset=0;state.more=false;
    $('ti-findings-dialog').close?.();$('ti-findings-form').reset();
    $('ti-findings-review-form').reset();$('ti-findings-history').replaceChildren();
    $('ti-findings-list').replaceChildren();$('ti-findings-detail').hidden=true;
    $('ti-findings-search').value='';$('ti-findings-view').value='active';
    $('ti-findings-status-filter').value='all';$('ti-findings-priority-filter').value='all';
    $('ti-findings-source-filter').value='all';
    $('ti-findings-list-summary').textContent='Daftar temuan belum dimuat.';
    $('ti-findings-detail-summary').replaceChildren();
    $('ti-findings-next-step').replaceChildren();
    $('ti-findings-ready-checklist').replaceChildren();
    message('');sync();
  }
  function hasFilters(){
    return Boolean($('ti-findings-search').value.trim())||
      $('ti-findings-view').value!=='active'||
      $('ti-findings-status-filter').value!=='all'||
      $('ti-findings-priority-filter').value!=='all'||
      $('ti-findings-source-filter').value!=='all';
  }
  function renderList(){
    const root=$('ti-findings-list');root.replaceChildren();
    const summary=$('ti-findings-list-summary');
    if(!state.loaded){
      summary.textContent='Memuat daftar temuan…';
      root.append(el('p','Memuat temuan dari lembaga…','workspace-help'));return;
    }
    summary.textContent=state.items.length
      ?'Menampilkan '+state.items.length+' temuan pada halaman ini. Buka rincian untuk melihat langkah berikutnya, perbaikan, dan riwayat.'
      :hasFilters()?'Tidak ada temuan yang cocok. Ubah pencarian atau reset filter.':
        'Belum ada temuan tercatat. Mulailah dari hasil pemeriksaan, asesmen, risiko, atau insiden nyata.';
    if(!state.items.length){
      const empty=el('div','','finding-empty-state');
      empty.append(el('strong',hasFilters()?'Tidak ada hasil pencarian':'Belum ada temuan'),
        el('p',hasFilters()?'Gunakan Reset filter untuk kembali ke daftar awal.':
          'Klik Tambah temuan untuk mencatat kondisi yang sudah ditemukan. Contoh bukan bukti pemeriksaan.'));
      root.append(empty);
    }
    for(const item of state.items){
      const row=el('article','','ti-finding-row finding-record');
      const head=el('div','','finding-record-head');
      const title=el('div','','finding-record-title');
      title.append(el('span',item.finding_code,'finding-record-code'));
      const open=el('button',item.title,'ti-finding-open');
      open.type='button';open.addEventListener('click',()=>void detail(item.id));
      title.append(open);
      head.append(title,el('span',STATUS[item.status]??'Status belum dikenal',
        'finding-status-pill finding-status-'+item.status));
      const badges=el('div','','finding-record-meta');
      badges.append(el('span','Prioritas: '+PRIORITY[item.priority]),
        el('span','PIC: '+item.pic),el('span','Target: '+item.due_date),
        el('span','Sumber: '+SOURCES[item.source_type]),
        el('span',item.archived_at?'Diarsipkan':'Aktif'));
      const act=el('button','Lihat tindak lanjut dan riwayat','button button-outline finding-record-action');
      act.type='button';act.addEventListener('click',()=>void detail(item.id));
      row.append(head,badges,act);root.append(row);
    }
    $('ti-findings-position').textContent=state.items.length
      ?'Menampilkan '+(state.offset+1)+'–'+(state.offset+state.items.length):'Tidak ada hasil';
    $('ti-findings-prev').disabled=state.busy||state.offset===0;
    $('ti-findings-next').disabled=state.busy||!state.more;
  }
  async function load({resetOffset=true}={}){
    if(!read())return;
    if(resetOffset)state.offset=0;
    const request=++state.request;state.loaded=false;renderList();
    const params=new URLSearchParams({
      q:$('ti-findings-search').value.trim(),view:$('ti-findings-view').value,
      status:$('ti-findings-status-filter').value,
      priority:$('ti-findings-priority-filter').value,
      source:$('ti-findings-source-filter').value,offset:String(state.offset),
    });
    try{
      const [data]=await Promise.all([api('/findings?'+params),
        state.options?Promise.resolve():loadSources()]);
      if(request!==state.request)return;
      if(!data||!Array.isArray(data.findings)||data.findings.length>50
        ||typeof data.hasMore!=='boolean')throw new TypeError('Invalid list');
      state.items=data.findings.map(validFinding);state.more=data.hasMore;
    }catch(error){
      if(request!==state.request)return;
      state.items=[];state.more=false;
      if(!onAuthFailure(error))message('Tidak dapat memuat daftar temuan.','error');
    }finally{if(request===state.request){state.loaded=true;renderList();}}
  }
  async function loadSources(){
    const data=await api('/findings/sources');
    if(!data||!Array.isArray(data.controls)||!Array.isArray(data.risks)
      ||!Array.isArray(data.incidents))throw new TypeError('Invalid finding sources');
    state.options=data;
    $('ti-findings-source-hint').textContent=data.truncated
      ?'Daftar sumber cukup panjang; hanya sebagian terbaru ditampilkan. Gunakan temuan manual untuk sumber yang tidak tercantum.'
      :'Sumber pemeriksaan dan catatan operasional diambil dari data lembaga yang sudah tersimpan.';
    sourceOptions();
  }
  function sourceOptions(selectedValue=''){
    const type=$('ti-finding-source-type').value,select=$('ti-finding-source');
    const label=$('ti-finding-source-label');
    select.replaceChildren();
    if(!type||type==='manual'){
      select.add(new Option(type==='manual'?'Pemeriksaan tanpa tautan langsung':'Pilih sumber temuan terlebih dahulu',''));
      select.disabled=true;label.hidden=true;return;
    }
    select.disabled=false;label.hidden=false;
    select.add(new Option('Pilih sumber temuan',''));
    const data=state.options??{controls:[],risks:[],incidents:[]};
    if(type==='assessment')for(const x of data.controls){
      if(UUID.test(x.assessment_id)&&UUID.test(x.control_id))
        select.add(new Option(x.assessment_title+' · '+x.control_code+' · '+x.control_title,
          x.assessment_id+':'+x.control_id));
    }
    if(type==='risk')for(const x of data.risks){
      if(UUID.test(x.id))select.add(new Option(x.risk_code+' · '+x.title,x.id));
    }
    if(type==='incident')for(const x of data.incidents){
      if(UUID.test(x.id))select.add(new Option(x.incident_code+' · '+x.title,x.id));
    }
    if(selectedValue&&![...select.options].some(x=>x.value===selectedValue))
      select.add(new Option('Sumber terdahulu (tercatat)',selectedValue));
    select.value=selectedValue;
  }
  function fillForm(record){
    const form=$('ti-findings-form');form.reset();
    $('ti-finding-code').value=record?.finding_code??'';
    $('ti-finding-code').readOnly=!!record;
    $('ti-finding-title').value=record?.title??'';
    $('ti-finding-description').value=record?.description??'';
    $('ti-finding-priority').value=record?.priority??'';
    $('ti-finding-source-type').value=record?.source_type??'';
    $('ti-finding-suggest-code').hidden=Boolean(record);
    $('ti-finding-code-hint').textContent=record
      ?'Kode temuan permanen untuk menjaga riwayat pencatatan.'
      :'Saran kode dapat diubah. Pastikan unik sebelum disimpan.';
    $('ti-finding-priority-hint').textContent=findingPriorityGuidance($('ti-finding-priority').value);
    $('ti-finding-source-type').disabled=!!record;
    sourceOptions(formSourceValue(record));
    if(record)$('ti-finding-source').disabled=true;
    $('ti-finding-pic').value=record?.pic??'';
    $('ti-finding-due-date').value=record?.due_date??'';
    $('ti-finding-action-plan').value=record?.action_plan??'';
    $('ti-finding-progress-note').value=record?.progress_note??'';
    $('ti-finding-evidence-reference').value=record?.evidence_reference??'';
    form.dataset.editId=record?.id??'';
    form.dataset.revision=String(record?.revision??0);
    $('ti-findings-form-error').hidden=true;
    $('ti-findings-dialog-title').textContent=record?'Perbarui tindak lanjut':'Tambah temuan';
    $('ti-findings-dialog').showModal();
  }
  function fields(){
    const type=$('ti-finding-source-type').value,value=$('ti-finding-source').value;
    const result={
      findingCode:$('ti-finding-code').value.trim().toUpperCase(),
      title:$('ti-finding-title').value.trim(),
      description:$('ti-finding-description').value.trim(),
      priority:$('ti-finding-priority').value,sourceType:type,
      assessmentId:null,controlId:null,riskId:null,incidentId:null,
      pic:$('ti-finding-pic').value.trim(),dueDate:$('ti-finding-due-date').value,
      actionPlan:$('ti-finding-action-plan').value,
      progressNote:$('ti-finding-progress-note').value,
      evidenceReference:$('ti-finding-evidence-reference').value,
    };
    if(type==='assessment'){
      const [a,c]=value.split(':');
      if(!UUID.test(a??'')||!UUID.test(c??''))throw new TypeError('Pilih sumber asesmen');
      result.assessmentId=a;result.controlId=c;
    }else if(type==='risk'||type==='incident'){
      if(!UUID.test(value))throw new TypeError('Pilih sumber');
      if(type==='risk')result.riskId=value;
      else result.incidentId=value;
    }
    return result;
  }
  function sourceName(record){
    if(record.source_type==='assessment')return record.assessment_title+
      ' · '+record.control_code+' · '+record.control_title;
    if(record.source_type==='risk')return record.risk_code+' · '+record.risk_title;
    if(record.source_type==='incident')return record.incident_code+' · '+record.incident_title;
    return 'Pemeriksaan langsung';
  }
  function renderSubmissionGuide(record){
    const list=$('ti-findings-ready-checklist');list.replaceChildren();
    const checks=findingSubmissionChecklist(record);
    for(const check of checks){
      const li=el('li',(check.complete?'Sudah diisi: ':'Perlu dilengkapi: ')+check.label,
        check.complete?'finding-check-ready':'finding-check-missing');
      list.append(li);
    }
    const editable=write()&&owner(record)&&!record.archived_at&&
      ['open','in_progress','changes_requested'].includes(record.status);
    $('ti-findings-submission-guide').hidden=!editable;
    $('ti-findings-submit-hint').textContent=checks.every(x=>x.complete)
      ?'Isian minimum untuk pengajuan lengkap; pemeriksa tetap wajib menilai bukti dan hasilnya.'
      :'Simpan temuan lebih dulu bila pekerjaan belum selesai. Pengajuan baru aktif setelah ketiga bagian lengkap.';
  }
  function renderDetail(record){
    state.selected=record;
    const summary=$('ti-findings-detail-summary');summary.replaceChildren();
    const head=el('div','','finding-detail-head');
    head.append(el('span',record.finding_code,'finding-record-code'),
      el('h3',record.title),el('p',SOURCES[record.source_type]+' · PIC: '+record.pic));
    summary.append(head,el('span',STATUS[record.status],
      'finding-status-pill finding-status-'+record.status));
    $('ti-findings-next-step').textContent=findingNextStep(record);
    renderSubmissionGuide(record);
    const root=$('ti-findings-detail-values');root.replaceChildren();
    for(const [name,fields] of [
      ['Identitas dan dasar temuan',[
        ['Kode',record.finding_code],['Kondisi yang ditemukan',record.description],
        ['Prioritas',PRIORITY[record.priority]],['Sumber',sourceName(record)],
        ['Penanggung jawab',record.pic],['Target perbaikan',record.due_date],
      ]],
      ['Pekerjaan dan bukti tindak lanjut',[
        ['Rencana tindakan',record.action_plan||'Belum diisi'],
        ['Hasil tindakan',record.progress_note||'Belum dicatat'],
        ['Referensi bukti',record.evidence_reference||'Belum dicatat'],
      ]],
      ['Pemeriksaan dan administrasi',[
        ['Status',STATUS[record.status]],['Siklus pengajuan',record.submission_cycle],
        ['Hasil pemeriksaan',record.verified_by?'Sudah diverifikasi':'Belum diverifikasi'],
        ['Revisi',record.revision],['Arsip',record.archived_at?'Diarsipkan':'Aktif'],
      ]],
    ]){
      const section=el('section','','finding-detail-section');
      const dl=el('dl','','ti-assets-detail-values');
      for(const [label,value] of fields){
        const row=el('div','','ti-asset-detail-item');
        row.append(el('dt',label),el('dd',value));dl.append(row);
      }
      section.append(el('h3',name),dl);root.append(section);
    }
    $('ti-findings-detail').hidden=false;sync();
  }
  async function detail(id){
    if(!UUID.test(id))return;
    const request=++state.detailRequest;
    try{
      const item=validFinding(await api('/findings/'+id));
      if(request!==state.detailRequest)return;
      renderDetail(item);
      $('ti-findings-detail').scrollIntoView?.({block:'nearest'});
      const events=await api('/findings/'+id+'/history');
      if(request!==state.detailRequest)return;
      if(!Array.isArray(events.events))throw new TypeError('Invalid history');
      const root=$('ti-findings-history');root.replaceChildren();
      for(const event of events.events){
        const row=el('li','','ti-finding-history-item');
        row.append(el('strong',(ACTIONS[event.action]??'Perubahan')+' · Revisi '+event.revision),
          el('span','Dicatat '+new Date(event.recorded_at).toLocaleString('id-ID')+
            ' · Pengguna '+String(event.actor_user_id).slice(0,8)),
          el('p',event.note||'—'));
        root.append(row);
      }
    }catch(error){
      if(!onAuthFailure(error))message('Detail atau riwayat temuan tidak dapat dibuka.','error');
    }
  }
  $('ti-finding-priority').addEventListener('change',()=>{
    $('ti-finding-priority-hint').textContent=findingPriorityGuidance($('ti-finding-priority').value);
  });
  $('ti-finding-suggest-code').addEventListener('click',()=>{
    const title=$('ti-finding-title');
    if(!title.value.trim()){
      title.focus();$('ti-finding-code-hint').textContent='Isi judul temuan terlebih dahulu.';return;
    }
    const code=suggestFindingCode(title.value);
    if(code){
      $('ti-finding-code').value=code;
      $('ti-finding-code-hint').textContent='Kode usulan: '+code+'. Periksa keunikan sebelum menyimpan.';
    }
  });
  $('ti-findings-reset-filters').addEventListener('click',()=>{
    $('ti-findings-search').value='';$('ti-findings-view').value='active';
    $('ti-findings-status-filter').value='all';$('ti-findings-priority-filter').value='all';
    $('ti-findings-source-filter').value='all';void load();
  });
  $('ti-findings-create').addEventListener('click',()=>fillForm(null));
  $('ti-finding-source-type').addEventListener('change',()=>sourceOptions());
  $('ti-findings-edit').addEventListener('click',()=>{
    if(owner(state.selected)&&!state.selected.archived_at
      &&['open','in_progress','changes_requested'].includes(state.selected.status))
      fillForm(state.selected);
  });
  $('ti-findings-refresh').addEventListener('click',()=>void load({resetOffset:false}));
  $('ti-findings-prev').addEventListener('click',()=>{
    state.offset=Math.max(0,state.offset-50);void load({resetOffset:false});
  });
  $('ti-findings-next').addEventListener('click',()=>{state.offset+=50;void load({resetOffset:false});});
  $('ti-findings-filter-form').addEventListener('submit',event=>{event.preventDefault();void load();});
  for(const id of ['ti-findings-view','ti-findings-status-filter',
    'ti-findings-priority-filter','ti-findings-source-filter'])
    $(id).addEventListener('change',()=>void load());
  $('ti-findings-cancel').addEventListener('click',()=>$('ti-findings-dialog').close());
  $('ti-findings-form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(state.busy||!write())return;
    const id=$('ti-findings-form').dataset.editId;
    let d;
    try{d=fields();}
    catch(error){
      $('ti-findings-form-error').hidden=false;
      $('ti-findings-form-error').textContent=error.message;return;
    }
    state.busy=true;sync();$('ti-findings-form-error').hidden=true;
    try{
      const result=validFinding(await api(id?'/findings/'+id:'/findings',{
        method:id?'PATCH':'POST',body:id
          ?{...d,expectedRevision:Number($('ti-findings-form').dataset.revision)}:d,
      }));
      $('ti-findings-dialog').close();message('Temuan berhasil disimpan.','success');
      await load();await detail(result.id);
    }catch(error){
      if(!onAuthFailure(error)){
        $('ti-findings-form-error').hidden=false;
        $('ti-findings-form-error').textContent=error?.status===409
          ?'Data sudah berubah atau sumber tidak tersedia. Muat ulang sebelum mencoba lagi.'
          :'Gagal menyimpan temuan. Periksa isian wajib dan sumber yang dipilih.';
      }
    }finally{state.busy=false;sync();}
  });
  $('ti-findings-submit').addEventListener('click',async()=>{
    const f=state.selected;
    if(!owner(f)||state.busy||f.archived_at)return;
    if(!window.confirm('Ajukan tindak lanjut '+f.finding_code+' kepada pemeriksa?'))return;
    state.busy=true;sync();
    try{
      const result=validFinding(await api('/findings/'+f.id+'/submit',{
        method:'POST',body:{expectedRevision:f.revision},
      }));
      message('Tindak lanjut diajukan untuk pemeriksaan.','success');
      await load();await detail(result.id);
    }catch(error){
      if(!onAuthFailure(error))message('Lengkapi rencana, hasil perbaikan dan referensi bukti sebelum mengajukan.','error');
    }finally{state.busy=false;sync();}
  });
  $('ti-findings-review-form').addEventListener('submit',async event=>{
    event.preventDefault();const f=state.selected;
    if(!f||state.busy||!verify()||owner(f)||f.submitted_by===getUserId())return;
    const note=$('ti-findings-review-note').value.trim();
    const decision=$('ti-findings-review-decision').value;
    state.busy=true;sync();
    try{
      const result=validFinding(await api('/findings/'+f.id+'/review',{
        method:'POST',body:{expectedRevision:f.revision,decision,note},
      }));
      $('ti-findings-review-form').reset();
      message(decision==='verify'?'Hasil perbaikan telah diverifikasi.':'Temuan dikembalikan untuk diperbaiki.','success');
      await load();await detail(result.id);
    }catch(error){
      if(!onAuthFailure(error))message('Keputusan gagal disimpan. Periksa hak akses, catatan atau revisi.','error');
    }finally{state.busy=false;sync();}
  });
  $('ti-findings-archive').addEventListener('click',async()=>{
    const f=state.selected;
    if(!f||!owner(f)||f.status!=='closed'||state.busy)return;
    if(!window.confirm('Arsipkan temuan '+f.finding_code+'? Riwayat tetap tersedia.'))return;
    state.busy=true;sync();
    try{
      const result=validFinding(await api('/findings/'+f.id+'/archive',{
        method:'POST',body:{expectedRevision:f.revision},
      }));
      message('Temuan diarsipkan.','success');
      await load();await detail(result.id);
    }catch(error){if(!onAuthFailure(error))message('Arsip gagal. Muat ulang temuan.','error');}
    finally{state.busy=false;sync();}
  });
  sync();return {load,clear,sync};
}
