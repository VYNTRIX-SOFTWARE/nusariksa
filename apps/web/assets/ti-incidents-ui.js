const $=id=>document.getElementById(id);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATEGORIES={availability:'Gangguan layanan',cybersecurity:'Keamanan siber',
  data:'Data dan privasi',integrity:'Integritas transaksi',other:'Lainnya'};
const SEVERITIES={low:'Rendah',medium:'Sedang',high:'Tinggi',critical:'Kritis'};
const STATUSES={reported:'Dilaporkan',investigating:'Investigasi',contained:'Terkendali',
  resolved:'Dipulihkan',closed:'Ditutup'};
const EVENTS={CREATED:'Laporan awal',UPDATED:'Perubahan data/status',OBSERVATION:'Observasi',
  CONTAINMENT:'Pengendalian',RECOVERY:'Pemulihan',COMMUNICATION:'Komunikasi',ARCHIVED:'Arsip'};
const NEXT={reported:['reported','investigating'],investigating:['investigating','contained','resolved'],
  contained:['contained','investigating','resolved'],resolved:['resolved','investigating','closed'],
  closed:['closed']};
function el(tag,value,cls){
  const x=document.createElement(tag);
  x.textContent=String(value??'');
  if(cls)x.className=cls;
  return x;
}
const toLocal=iso=>{
  const d=new Date(iso);if(!Number.isFinite(d.getTime()))return '';
  const z=n=>String(n).padStart(2,'0');
  return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate())+
    'T'+z(d.getHours())+':'+z(d.getMinutes());
};
export function validateIncidentResponse(i){
  if(!i||!UUID.test(i.id)||typeof i.incident_code!=='string'
    ||typeof i.title!=='string'||!Object.hasOwn(STATUSES,i.status)
    ||!Object.hasOwn(SEVERITIES,i.severity)
    ||!Number.isSafeInteger(i.revision)||i.revision<1)
    throw new TypeError('Invalid incident response');
  return i;
}
export function createIncidentManagementUI({api,getPermissions,onAuthFailure}){
  const state={rows:[],assets:[],risks:[],selected:null,loaded:false,offset:0,
    more:false,busy:false,request:0,detailRequest:0};
  const canRead=()=>getPermissions().includes('incidents:read');
  const canWrite=()=>getPermissions().includes('incidents:write');
  function message(msg,kind='info'){
    const x=$('ti-incidents-message');x.textContent=msg??'';x.hidden=!msg;x.dataset.kind=kind;
  }
  function sync(){
    $('ti-incidents-create').hidden=!canWrite();
    $('ti-incidents-save').disabled=state.busy||!canWrite();
    $('ti-incidents-edit').hidden=!canWrite()||!state.selected
      ||!!state.selected.archived_at||state.selected.status==='closed';
    $('ti-incidents-archive').hidden=!canWrite()||!state.selected
      ||!!state.selected.archived_at||state.selected.status!=='closed';
    $('ti-incidents-archive').disabled=state.busy;
    $('ti-incidents-timeline-form').hidden=!canWrite()||!state.selected
      ||!!state.selected.archived_at;
    $('ti-incidents-timeline-save').disabled=state.busy||!canWrite();
  }
  function clear(){
    ++state.request;++state.detailRequest;
    state.rows=[];state.assets=[];state.risks=[];state.selected=null;
    state.loaded=false;state.offset=0;state.more=false;state.busy=false;
    $('ti-incidents-dialog').close?.();
    $('ti-incidents-form').reset();$('ti-incidents-timeline-form').reset();
    $('ti-incidents-search').value='';
    $('ti-incidents-view').value='active';
    $('ti-incidents-status-filter').value='all';
    $('ti-incidents-severity-filter').value='all';
    $('ti-incidents-category-filter').value='all';
    $('ti-incidents-list').replaceChildren();$('ti-incidents-history').replaceChildren();
    $('ti-incidents-detail').hidden=true;message('');sync();
  }
  function options(){
    const asset=$('ti-incident-asset-id'),risk=$('ti-incident-risk-id');
    const currentAsset=asset.value,currentRisk=risk.value;
    asset.replaceChildren(new Option('Tidak terkait aset tertentu',''));
    risk.replaceChildren(new Option('Tidak terkait risiko tertentu',''));
    for(const a of state.assets)asset.add(new Option(a.asset_code+' · '+a.title,a.id));
    for(const r of state.risks)risk.add(new Option(r.risk_code+' · '+r.title,r.id));
    if([...asset.options].some(x=>x.value===currentAsset))asset.value=currentAsset;
    if([...risk.options].some(x=>x.value===currentRisk))risk.value=currentRisk;
  }
  async function loadOptions(){
    const data=await api('/incidents/options');
    if(!data||!Array.isArray(data.assets)||!Array.isArray(data.risks))
      throw new TypeError('Invalid options');
    state.assets=data.assets.filter(x=>UUID.test(x.id));
    state.risks=data.risks.filter(x=>UUID.test(x.id));
    options();
    $('ti-incidents-options-note').textContent=data.truncated
      ?'Daftar lebih dari 1.000 item. Perlu penyaringan tambahan oleh administrator.'
      :'Pilihan aset/risiko diambil dari inventaris dan register risiko aktif.';
  }
  function renderList(){
    const root=$('ti-incidents-list');root.replaceChildren();
    if(!state.loaded){root.append(el('p','Memuat catatan insiden…','workspace-help'));return;}
    if(!state.rows.length)root.append(el('p','Belum ada insiden sesuai filter. Gunakan Tambah insiden untuk mencatat kejadian.','workspace-help'));
    for(const item of state.rows){
      const wrap=el('div','','ti-incident-row');
      const open=el('button',item.incident_code+' · '+item.title,'ti-incident-open');
      open.type='button';open.addEventListener('click',()=>void detail(item.id));
      const meta=el('p',CATEGORIES[item.category]+' · '+SEVERITIES[item.severity]+
        ' · '+STATUSES[item.status]+' · '+item.pic+
        (item.asset_code?' · '+item.asset_code:'')+
        (item.archived_at?' · Diarsipkan':''),'workspace-help');
      wrap.append(open,meta);root.append(wrap);
    }
    $('ti-incidents-position').textContent=state.rows.length
      ?'Menampilkan '+(state.offset+1)+'–'+(state.offset+state.rows.length):'Tidak ada hasil';
    $('ti-incidents-prev').disabled=state.busy||state.offset===0;
    $('ti-incidents-next').disabled=state.busy||!state.more;
  }
  async function load({resetOffset=true}={}){
    if(!canRead())return;
    if(resetOffset)state.offset=0;
    const req=++state.request;state.loaded=false;renderList();
    const query=new URLSearchParams({
      q:$('ti-incidents-search').value.trim(),view:$('ti-incidents-view').value,
      status:$('ti-incidents-status-filter').value,severity:$('ti-incidents-severity-filter').value,
      category:$('ti-incidents-category-filter').value,offset:String(state.offset),
    });
    try{
      const [data]=await Promise.all([api('/incidents?'+query),
        state.assets.length||state.risks.length?Promise.resolve():loadOptions()]);
      if(req!==state.request)return;
      if(!data||!Array.isArray(data.incidents)||data.incidents.length>50
        ||typeof data.hasMore!=='boolean')throw new TypeError('Invalid incident list');
      state.rows=data.incidents.map(validateIncidentResponse);state.more=data.hasMore;
    }catch(error){
      if(req!==state.request)return;
      state.rows=[];state.more=false;
      if(!onAuthFailure(error))message('Gagal memuat daftar insiden.','error');
    }finally{if(req===state.request){state.loaded=true;renderList();}}
  }
  function setForm(record){
    $('ti-incidents-form').reset();
    $('ti-incident-code').value=record?.incident_code??'';
    $('ti-incident-code').readOnly=!!record;
    $('ti-incident-title').value=record?.title??'';
    $('ti-incident-description').value=record?.description??'';
    $('ti-incident-category').value=record?.category??'availability';
    $('ti-incident-severity').value=record?.severity??'medium';
    $('ti-incident-detected-at').value=toLocal(record?.detected_at??new Date().toISOString());
    const a=$('ti-incident-asset-id'),r=$('ti-incident-risk-id');
    if(record?.asset_id&&![...a.options].some(x=>x.value===record.asset_id))
      a.add(new Option((record.asset_code??'Aset historis')+' (historis)',record.asset_id));
    if(record?.risk_id&&![...r.options].some(x=>x.value===record.risk_id))
      r.add(new Option((record.risk_code??'Risiko historis')+' (historis)',record.risk_id));
    a.value=record?.asset_id??'';r.value=record?.risk_id??'';
    $('ti-incident-pic').value=record?.pic??'';
    $('ti-incident-impact').value=record?.impact_summary??'';
    $('ti-incident-containment').value=record?.containment_action??'';
    $('ti-incident-root-cause').value=record?.root_cause??'';
    $('ti-incident-resolution').value=record?.resolution??'';
    const status=$('ti-incident-status');status.replaceChildren();
    for(const name of (record?NEXT[record.status]:['reported']))
      status.add(new Option(STATUSES[name],name));
    status.value=record?.status??'reported';
    $('ti-incidents-form').dataset.editId=record?.id??'';
    $('ti-incidents-form').dataset.revision=String(record?.revision??0);
    $('ti-incidents-form-error').hidden=true;
    $('ti-incidents-dialog-title').textContent=record?'Perbarui insiden TI':'Laporkan insiden TI';
    $('ti-incidents-dialog').showModal();
  }
  function fields(){
    const date=$('ti-incident-detected-at').value;
    if(!date||!Number.isFinite(new Date(date).getTime()))
      throw new TypeError('Tanggal deteksi diperlukan');
    return {
      incidentCode:$('ti-incident-code').value.trim().toUpperCase(),
      title:$('ti-incident-title').value.trim(),category:$('ti-incident-category').value,
      severity:$('ti-incident-severity').value,
      description:$('ti-incident-description').value.trim(),
      detectedAt:new Date(date).toISOString(),
      assetId:$('ti-incident-asset-id').value||null,
      riskId:$('ti-incident-risk-id').value||null,
      pic:$('ti-incident-pic').value.trim(),
      impactSummary:$('ti-incident-impact').value,
      containmentAction:$('ti-incident-containment').value,
      rootCause:$('ti-incident-root-cause').value,
      resolution:$('ti-incident-resolution').value,
      status:$('ti-incident-status').value,
    };
  }
  function renderDetail(item){
    state.selected=item;
    const root=$('ti-incidents-detail-values');root.replaceChildren();
    for(const [title,value] of [
      ['Kode',item.incident_code],['Judul',item.title],
      ['Kategori',CATEGORIES[item.category]],['Keparahan',SEVERITIES[item.severity]],
      ['Status',STATUSES[item.status]],['Deteksi',new Date(item.detected_at).toLocaleString('id-ID')],
      ['Deskripsi',item.description],['Dampak',item.impact_summary||'Belum dirinci'],
      ['Aset',item.asset_code?item.asset_code+' · '+item.asset_title:'Tidak terkait aset'],
      ['Risiko',item.risk_code?item.risk_code+' · '+item.risk_title:'Tidak terkait risiko'],
      ['PIC',item.pic],['Langkah pengendalian',item.containment_action||'Belum dicatat'],
      ['Akar penyebab',item.root_cause||'Belum dianalisis'],
      ['Hasil pemulihan',item.resolution||'Belum dicatat'],
      ['Revisi',item.revision],['Arsip',item.archived_at?'Diarsipkan':'Aktif'],
    ]){
      const row=el('div','','ti-asset-detail-item');row.append(el('dt',title),el('dd',value));
      root.append(row);
    }
    $('ti-incidents-detail').hidden=false;sync();
  }
  async function detail(id){
    if(!UUID.test(id))return;
    const request=++state.detailRequest;
    try{
      const incident=validateIncidentResponse(await api('/incidents/'+id));
      if(request!==state.detailRequest)return;
      renderDetail(incident);
      const response=await api('/incidents/'+id+'/history');
      if(request!==state.detailRequest)return;
      if(!Array.isArray(response.events))throw new TypeError('Invalid history');
      const root=$('ti-incidents-history');root.replaceChildren();
      for(const row of response.events){
        const li=el('li','','ti-incident-history-item');
        li.append(el('strong',(EVENTS[row.event_type]??'Perubahan')+' · Revisi '+row.revision));
        li.append(el('span','Dicatat '+new Date(row.recorded_at).toLocaleString('id-ID')+
          (row.observed_at?' · Kejadian '+new Date(row.observed_at).toLocaleString('id-ID'):'')+
          ' · Pengguna '+String(row.actor_user_id).slice(0,8)));
        li.append(el('p',row.message));root.append(li);
      }
    }catch(error){if(!onAuthFailure(error))message('Gagal membuka insiden atau kronologi.','error');}
  }
  $('ti-incidents-create').addEventListener('click',()=>setForm(null));
  $('ti-incidents-edit').addEventListener('click',()=>{
    if(state.selected&&!state.selected.archived_at&&state.selected.status!=='closed')
      setForm(state.selected);
  });
  $('ti-incidents-refresh').addEventListener('click',()=>void load({resetOffset:false}));
  $('ti-incidents-prev').addEventListener('click',()=>{
    state.offset=Math.max(0,state.offset-50);void load({resetOffset:false});
  });
  $('ti-incidents-next').addEventListener('click',()=>{state.offset+=50;void load({resetOffset:false});});
  $('ti-incidents-filter-form').addEventListener('submit',e=>{e.preventDefault();void load();});
  for(const id of ['ti-incidents-view','ti-incidents-status-filter',
    'ti-incidents-severity-filter','ti-incidents-category-filter'])
    $(id).addEventListener('change',()=>void load());
  $('ti-incident-risk-id').addEventListener('change',()=>{
    const risk=state.risks.find(x=>x.id===$('ti-incident-risk-id').value);
    if(risk?.asset_id)$('ti-incident-asset-id').value=risk.asset_id;
  });
  $('ti-incidents-cancel').addEventListener('click',()=>$('ti-incidents-dialog').close());
  $('ti-incidents-form').addEventListener('submit',async e=>{
    e.preventDefault();
    if(!canWrite()||state.busy)return;
    const id=$('ti-incidents-form').dataset.editId;
    let data;
    try{data=fields();}
    catch{
      $('ti-incidents-form-error').hidden=false;
      $('ti-incidents-form-error').textContent='Tanggal deteksi tidak valid.';return;
    }
    state.busy=true;sync();$('ti-incidents-form-error').hidden=true;
    try{
      const result=validateIncidentResponse(await api(id?'/incidents/'+id:'/incidents',{
        method:id?'PATCH':'POST',body:id
          ?{...data,expectedRevision:Number($('ti-incidents-form').dataset.revision)}:data,
      }));
      $('ti-incidents-dialog').close();
      message(id?'Insiden diperbarui.':'Insiden dicatat.','success');
      await load();await detail(result.id);
    }catch(error){
      if(!onAuthFailure(error)){
        $('ti-incidents-form-error').hidden=false;
        $('ti-incidents-form-error').textContent=error?.status===409
          ?'Perpindahan status, tautan aset/risiko, atau revisi tidak valid. Periksa syarat penyelesaian.'
          :'Gagal menyimpan insiden. Periksa kode, detail, PIC dan waktu kejadian.';
      }
    }finally{state.busy=false;sync();}
  });
  $('ti-incidents-timeline-form').addEventListener('submit',async e=>{
    e.preventDefault();
    if(!canWrite()||state.busy||!state.selected||state.selected.archived_at)return;
    const id=state.selected.id;
    const observed=$('ti-incidents-note-observed').value;
    const payload={
      eventType:$('ti-incidents-note-type').value,
      message:$('ti-incidents-note').value.trim(),
      observedAt:observed?new Date(observed).toISOString():null,
      expectedRevision:state.selected.revision,
    };
    state.busy=true;sync();
    try{
      const result=validateIncidentResponse(await api('/incidents/'+id+'/timeline',{
        method:'POST',body:payload,
      }));
      $('ti-incidents-timeline-form').reset();
      message('Kronologi disimpan permanen dengan waktu dan petugas pencatat.','success');
      await load();await detail(result.id);
    }catch(error){if(!onAuthFailure(error))message('Catatan gagal disimpan. Periksa isian/revisi dan muat ulang.','error');}
    finally{state.busy=false;sync();}
  });
  $('ti-incidents-archive').addEventListener('click',async()=>{
    const incident=state.selected;
    if(!incident||incident.archived_at||incident.status!=='closed'||state.busy||!canWrite())return;
    if(!window.confirm('Arsipkan '+incident.incident_code+'? Riwayat tetap tersimpan dan tidak dapat dihapus.'))return;
    state.busy=true;sync();
    try{
      const result=validateIncidentResponse(await api('/incidents/'+incident.id+'/archive',{
        method:'POST',body:{expectedRevision:incident.revision},
      }));
      message('Insiden diarsipkan tanpa menghapus kronologinya.','success');
      await load();await detail(result.id);
    }catch(error){if(!onAuthFailure(error))message('Arsip gagal. Periksa revisi terbaru.','error');}
    finally{state.busy=false;sync();}
  });
  sync();return {load,clear,sync};
}
