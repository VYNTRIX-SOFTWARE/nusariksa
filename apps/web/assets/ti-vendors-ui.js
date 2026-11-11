const $=id=>document.getElementById(id);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATEGORY={core_banking:'Core banking',infrastructure:'Infrastruktur & jaringan',
  cybersecurity:'Keamanan siber',cloud:'Cloud & hosting',software:'Aplikasi',other:'Lainnya'};
const CRITICALITY={low:'Rendah',medium:'Sedang',high:'Tinggi'};
const TERM={ended:'Diakhiri',expired:'Melewati masa berlaku',
  expiring:'Berakhir dalam 30 hari',current:'Masih berlaku'};
const RESULT={not_assessed:'Belum dapat dinilai',meets_targets:'Memenuhi target numerik',
  below_targets:'Di bawah target numerik'};
const ACTION={VENDOR_CREATED:'Penyedia ditambahkan',VENDOR_UPDATED:'Data penyedia diperbarui',
  VENDOR_ARCHIVED:'Penyedia diarsipkan',CONTRACT_CREATED:'Kontrak ditambahkan',
  CONTRACT_UPDATED:'Kontrak diperbarui',CONTRACT_ARCHIVED:'Kontrak diarsipkan'};
const el=(tag,value,cls)=>{
  const n=document.createElement(tag);n.textContent=String(value??'');
  if(cls)n.className=cls;return n;
};
const num=x=>x===null||x===undefined?'—':Number(x).toLocaleString('id-ID',{maximumFractionDigits:2});
function dateToday(){
  const d=new Date(),p=n=>String(n).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
}
export function validVendor(x){
  if(!x||!UUID.test(x.id)||typeof x.vendor_code!=='string'
    ||typeof x.name!=='string'||!Object.hasOwn(CATEGORY,x.service_category)
    ||!Number.isSafeInteger(x.revision)||x.revision<1)
    throw new TypeError('Invalid vendor');
  return x;
}
export function validContract(x){
  if(!x||!UUID.test(x.id)||!UUID.test(x.vendor_id)
    ||typeof x.contract_code!=='string'||typeof x.service_name!=='string'
    ||!Object.hasOwn(TERM,x.term_state)
    ||!Number.isSafeInteger(x.revision)||x.revision<1)
    throw new TypeError('Invalid contract');
  return x;
}
export function createVendorManagementUI({api,getPermissions,onAuthFailure}){
  const state={vendors:[],selected:null,contracts:[],contract:null,reviews:[],history:[],
    loaded:false,more:false,offset:0,busy:false,request:0,detailRequest:0,contractRequest:0};
  const canRead=()=>getPermissions().includes('vendors:read');
  const canWrite=()=>getPermissions().includes('vendors:write');
  function message(value,kind='info'){
    const x=$('ti-vendors-message');x.textContent=value??'';x.hidden=!value;x.dataset.kind=kind;
  }
  function sync(){
    const v=state.selected,c=state.contract;
    $('ti-vendors-create').hidden=!canWrite();
    $('ti-vendors-save').disabled=state.busy||!canWrite();
    $('ti-vendors-edit').hidden=!canWrite()||!v||!!v.archived_at;
    $('ti-vendors-archive').hidden=!canWrite()||!v||!!v.archived_at;
    $('ti-vendors-archive').disabled=state.busy;
    $('ti-vendors-add-contract').hidden=!canWrite()||!v||!!v.archived_at||v.status!=='active';
    $('ti-vendors-contract-save').disabled=state.busy;
    $('ti-vendors-edit-contract').hidden=!canWrite()||!c||!!c.archived_at||!!v?.archived_at;
    $('ti-vendors-archive-contract').hidden=!canWrite()||!c||!!c.archived_at||c.status!=='ended';
    $('ti-vendors-archive-contract').disabled=state.busy;
    $('ti-vendors-add-review').hidden=!canWrite()||!c||!!c.archived_at||!!v?.archived_at;
    $('ti-vendors-review-save').disabled=state.busy||!canWrite();
  }
  function clear(){
    ++state.request;++state.detailRequest;++state.contractRequest;
    state.vendors=[];state.selected=null;state.contracts=[];state.contract=null;
    state.reviews=[];state.history=[];state.loaded=false;state.more=false;
    state.offset=0;state.busy=false;
    for(const id of ['ti-vendors-dialog','ti-vendors-contract-dialog','ti-vendors-review-dialog'])
      $(id).close?.();
    $('ti-vendors-filter-form').reset();
    $('ti-vendors-list').replaceChildren();$('ti-vendors-contracts').replaceChildren();
    $('ti-vendors-reviews').replaceChildren();$('ti-vendors-history').replaceChildren();
    $('ti-vendors-detail').hidden=true;$('ti-vendors-contract-detail').hidden=true;
    message('');sync();
  }
  function renderList(){
    const root=$('ti-vendors-list');root.replaceChildren();
    if(!state.loaded){root.append(el('p','Memuat daftar penyedia…','workspace-help'));return;}
    if(!state.vendors.length)root.append(el('p',
      'Belum ada penyedia pada filter ini. Tambahkan penyedia untuk mencatat layanan TI.','workspace-help'));
    for(const v of state.vendors){
      const item=el('div','','ti-vendor-row');
      const button=el('button',v.vendor_code+' · '+v.name,'ti-vendor-open');
      button.type='button';button.addEventListener('click',()=>void detail(v.id));
      item.append(button,el('p',
        CATEGORY[v.service_category]+' · '+CRITICALITY[v.criticality]+
        ' · PIC '+v.owner_pic+' · Kontrak aktif '+v.active_contracts+
        (v.expiring_contracts?' · Segera berakhir '+v.expiring_contracts:'')+
        (v.overdue_contracts?' · Lewat masa berlaku '+v.overdue_contracts:'')+
        (v.archived_at?' · Diarsipkan':''),
        'workspace-help'));
      root.append(item);
    }
    $('ti-vendors-position').textContent=state.vendors.length
      ?'Menampilkan '+(state.offset+1)+'–'+(state.offset+state.vendors.length):'Tidak ada hasil';
    $('ti-vendors-prev').disabled=state.busy||state.offset===0;
    $('ti-vendors-next').disabled=state.busy||!state.more;
  }
  async function load({resetOffset=true}={}){
    if(!canRead())return;
    if(resetOffset)state.offset=0;
    const token=++state.request;
    state.loaded=false;renderList();
    const params=new URLSearchParams({
      q:$('ti-vendors-search').value.trim(),view:$('ti-vendors-view').value,
      category:$('ti-vendors-category-filter').value,
      status:$('ti-vendors-status-filter').value,offset:String(state.offset),
    });
    try{
      const data=await api('/vendors?'+params);
      if(token!==state.request)return;
      if(!data||!Array.isArray(data.vendors)||data.vendors.length>50
        ||typeof data.hasMore!=='boolean')throw new TypeError('Invalid list');
      state.vendors=data.vendors.map(validVendor);state.more=data.hasMore;
    }catch(error){
      if(token!==state.request)return;
      state.vendors=[];state.more=false;
      if(!onAuthFailure(error))message('Daftar penyedia tidak dapat dimuat.','error');
    }finally{if(token===state.request){state.loaded=true;renderList();}}
  }
  function fields(){
    return {
      vendorCode:$('ti-vendor-code').value.trim().toUpperCase(),
      name:$('ti-vendor-name').value.trim(),
      serviceCategory:$('ti-vendor-category').value,
      contactName:$('ti-vendor-contact').value.trim(),
      contactEmail:$('ti-vendor-email').value.trim(),
      contactPhone:$('ti-vendor-phone').value.trim(),
      ownerPic:$('ti-vendor-pic').value.trim(),
      criticality:$('ti-vendor-criticality').value,
      note:$('ti-vendor-note').value,status:$('ti-vendor-status').value,
    };
  }
  function setVendorForm(v){
    $('ti-vendors-form').reset();
    for(const [key,value] of [
      ['code',v?.vendor_code??''],['name',v?.name??''],
      ['category',v?.service_category??'other'],
      ['contact',v?.contact_name??''],['email',v?.contact_email??''],
      ['phone',v?.contact_phone??''],['pic',v?.owner_pic??''],
      ['criticality',v?.criticality??'medium'],['note',v?.note??''],
      ['status',v?.status??'active']])
      $('ti-vendor-'+key).value=value;
    $('ti-vendor-code').readOnly=!!v;
    $('ti-vendors-form').dataset.id=v?.id??'';
    $('ti-vendors-form').dataset.revision=String(v?.revision??0);
    $('ti-vendors-form-error').hidden=true;
    $('ti-vendors-dialog-title').textContent=v?'Perbarui penyedia':'Tambah penyedia TI';
    $('ti-vendors-dialog').showModal();
  }
  function showVendor(v){
    state.selected=v;
    const root=$('ti-vendors-detail-values');root.replaceChildren();
    for(const [key,value] of [
      ['Kode',v.vendor_code],['Penyedia',v.name],['Kategori layanan',CATEGORY[v.service_category]],
      ['Kontak',v.contact_name||'Belum dicatat'],['Email',v.contact_email||'—'],
      ['Telepon',v.contact_phone||'—'],['PIC internal',v.owner_pic],
      ['Kritikalitas',CRITICALITY[v.criticality]],
      ['Status',v.status==='active'?'Aktif':'Tidak aktif'],
      ['Kontrak aktif',v.active_contracts],['Berakhir dalam 30 hari',v.expiring_contracts],
      ['Melewati masa berlaku',v.overdue_contracts],['Catatan',v.note||'—'],
      ['Revisi',v.revision],['Arsip',v.archived_at?'Diarsipkan':'Belum diarsipkan'],
    ]){
      const item=el('div','','ti-asset-detail-item');
      item.append(el('dt',key),el('dd',value));root.append(item);
    }
    $('ti-vendors-detail').hidden=false;sync();
  }
  async function detail(id){
    if(!UUID.test(id))return;
    const token=++state.detailRequest;++state.contractRequest;
    try{
      const v=validVendor(await api('/vendors/'+id));
      if(token!==state.detailRequest)return;
      showVendor(v);
      state.contract=null;state.reviews=[];
      $('ti-vendors-contract-detail').hidden=true;
      const [contracts,history]=await Promise.all([
        api('/vendors/'+id+'/contracts'),api('/vendors/'+id+'/history'),
      ]);
      if(token!==state.detailRequest)return;
      if(!Array.isArray(contracts.contracts)||!Array.isArray(history.events))
        throw new TypeError('Invalid detail');
      state.contracts=contracts.contracts.map(validContract);
      state.history=history.events;
      renderContracts();renderHistory();
      $('ti-vendors-contracts-note').textContent=contracts.truncated
        ?'Daftar kontrak dibatasi pada 100 entri. Hubungi pengelola untuk pencarian riwayat yang lebih luas.'
        :'Masa berlaku ditentukan dari tanggal akhir kontrak yang tercatat.';
    }catch(error){
      if(!onAuthFailure(error))message('Detail penyedia tidak dapat dimuat.','error');
    }
  }
  function renderContracts(){
    const root=$('ti-vendors-contracts');root.replaceChildren();
    if(!state.contracts.length)root.append(el('p',
      'Belum ada kontrak layanan. Pilih Tambah kontrak jika penyedia sudah memiliki perjanjian.','workspace-help'));
    for(const c of state.contracts){
      const item=el('div','','ti-vendor-row');
      const btn=el('button',c.contract_code+' · '+c.service_name,'ti-vendor-contract-open');
      btn.type='button';btn.addEventListener('click',()=>void contractDetail(c.id));
      item.append(btn,el('p',c.contract_reference+' · '+c.start_date+' s.d. '+c.end_date+
        ' · '+TERM[c.term_state]+' · Evaluasi '+c.review_count+
        (c.archived_at?' · Diarsipkan':''),'workspace-help'));
      root.append(item);
    }
  }
  function renderHistory(){
    const root=$('ti-vendors-history');root.replaceChildren();
    for(const x of state.history){
      const li=el('li','','ti-vendor-history-item');
      li.append(el('strong',(ACTION[x.action]??'Perubahan')+' · Revisi '+x.revision));
      li.append(el('span',new Date(x.occurred_at).toLocaleString('id-ID')+
        ' · Pengguna '+String(x.actor_user_id).slice(0,8)));
      root.append(li);
    }
  }
  function setContractForm(c){
    const form=$('ti-vendors-contract-form');form.reset();
    const today=dateToday();
    const yearEnd=today.slice(0,4)+'-12-31';
    for(const [key,value] of [
      ['code',c?.contract_code??''],['service',c?.service_name??''],
      ['reference',c?.contract_reference??''],['description',c?.service_description??''],
      ['start',c?.start_date??today],['end',c?.end_date??yearEnd],
      ['pic',c?.owner_pic??state.selected.owner_pic],
      ['uptime',c?.sla_uptime_target??''],['response',c?.sla_response_target_hours??''],
      ['status',c?.status??'active'],['note',c?.note??''],
    ])$('ti-vendor-contract-'+key).value=String(value);
    $('ti-vendor-contract-code').readOnly=!!c;
    const stat=$('ti-vendor-contract-status');
    stat.replaceChildren();
    stat.add(new Option('Aktif','active'));
    if(c)stat.add(new Option('Diakhiri','ended'));
    stat.value=c?.status??'active';
    form.dataset.id=c?.id??'';
    form.dataset.revision=String(c?.revision??0);
    $('ti-vendors-contract-form-error').hidden=true;
    $('ti-vendors-contract-dialog-title').textContent=c?'Perbarui kontrak':'Tambah kontrak layanan';
    $('ti-vendors-contract-dialog').showModal();
  }
  function contractFields(){
    const optionalNumber=id=>{
      const x=$(id).value;
      return x===''?null:Number(x);
    };
    return {
      contractCode:$('ti-vendor-contract-code').value.trim().toUpperCase(),
      serviceName:$('ti-vendor-contract-service').value.trim(),
      contractReference:$('ti-vendor-contract-reference').value.trim(),
      serviceDescription:$('ti-vendor-contract-description').value,
      startDate:$('ti-vendor-contract-start').value,
      endDate:$('ti-vendor-contract-end').value,
      ownerPic:$('ti-vendor-contract-pic').value.trim(),
      slaUptimeTarget:optionalNumber('ti-vendor-contract-uptime'),
      slaResponseTargetHours:optionalNumber('ti-vendor-contract-response'),
      status:$('ti-vendor-contract-status').value,
      note:$('ti-vendor-contract-note').value,
    };
  }
  function renderContract(c){
    state.contract=c;
    const root=$('ti-vendors-contract-values');root.replaceChildren();
    for(const [key,value] of [
      ['Kode',c.contract_code],['Layanan',c.service_name],
      ['Referensi perjanjian',c.contract_reference],
      ['Deskripsi',c.service_description||'—'],
      ['Tanggal mulai',c.start_date],['Tanggal berakhir',c.end_date],
      ['Masa berlaku',TERM[c.term_state]],['PIC internal',c.owner_pic],
      ['Target ketersediaan',c.sla_uptime_target===null?'Belum ditentukan':num(c.sla_uptime_target)+'%'],
      ['Target waktu respons',c.sla_response_target_hours===null?'Belum ditentukan':num(c.sla_response_target_hours)+' jam'],
      ['Catatan',c.note||'—'],['Jumlah evaluasi',c.review_count],
      ['Revisi',c.revision],['Arsip',c.archived_at?'Diarsipkan':'Belum diarsipkan'],
    ]){
      const item=el('div','','ti-asset-detail-item');
      item.append(el('dt',key),el('dd',value));root.append(item);
    }
    $('ti-vendors-contract-detail').hidden=false;sync();
  }
  async function contractDetail(id){
    if(!state.selected||!UUID.test(id))return;
    const vendorId=state.selected.id,token=++state.contractRequest;
    try{
      const [contract,reviews]=await Promise.all([
        api('/vendors/'+vendorId+'/contracts/'+id),
        api('/vendors/'+vendorId+'/contracts/'+id+'/reviews'),
      ]);
      if(token!==state.contractRequest||state.selected?.id!==vendorId)return;
      if(!Array.isArray(reviews.reviews))throw new TypeError('Invalid reviews');
      renderContract(validContract(contract));state.reviews=reviews.reviews;
      renderReviews();
      $('ti-vendors-reviews-note').textContent=reviews.truncated
        ?'Hanya 100 evaluasi terbaru ditampilkan; dokumen asli tetap perlu diperiksa.'
        :'Hasil evaluasi adalah perbandingan target numerik dalam kontrak dengan realisasi yang dicatat.';
    }catch(error){if(!onAuthFailure(error))message('Kontrak atau evaluasi tidak dapat dibuka.','error');}
  }
  function renderReviews(){
    const root=$('ti-vendors-reviews');root.replaceChildren();
    if(!state.reviews.length)root.append(el('p','Belum ada evaluasi layanan.','workspace-help'));
    for(const review of state.reviews){
      const row=el('div','','ti-vendor-review');
      row.append(el('strong',review.period_start+' s.d. '+review.period_end+
        ' · '+(RESULT[review.sla_result]??'Belum dinilai')));
      row.append(el('p','Ketersediaan: '+(review.measured_uptime===null?'Belum diukur':
        num(review.measured_uptime)+'%')+' · Respons: '+
        (review.measured_response_hours===null?'Belum diukur':
          num(review.measured_response_hours)+' jam')));
      row.append(el('p',review.summary));
      row.append(el('small','Dicatat '+new Date(review.recorded_at).toLocaleString('id-ID')+
        ' · Pengguna '+String(review.reviewed_by).slice(0,8)));
      root.append(row);
    }
  }
  $('ti-vendors-create').addEventListener('click',()=>setVendorForm(null));
  $('ti-vendors-edit').addEventListener('click',()=>{if(state.selected&&!state.selected.archived_at)setVendorForm(state.selected);});
  $('ti-vendors-refresh').addEventListener('click',()=>void load({resetOffset:false}));
  $('ti-vendors-filter-form').addEventListener('submit',e=>{e.preventDefault();void load();});
  for(const id of ['ti-vendors-view','ti-vendors-category-filter','ti-vendors-status-filter'])
    $(id).addEventListener('change',()=>void load());
  $('ti-vendors-prev').addEventListener('click',()=>{
    state.offset=Math.max(0,state.offset-50);void load({resetOffset:false});
  });
  $('ti-vendors-next').addEventListener('click',()=>{state.offset+=50;void load({resetOffset:false});});
  $('ti-vendors-cancel').addEventListener('click',()=>$('ti-vendors-dialog').close());
  $('ti-vendors-form').addEventListener('submit',async e=>{
    e.preventDefault();if(state.busy||!canWrite())return;
    const id=$('ti-vendors-form').dataset.id,body=fields();
    state.busy=true;sync();$('ti-vendors-form-error').hidden=true;
    try{
      const vendor=validVendor(await api(id?'/vendors/'+id:'/vendors',{
        method:id?'PATCH':'POST',body:id
          ?{...body,expectedRevision:Number($('ti-vendors-form').dataset.revision)}:body,
      }));
      $('ti-vendors-dialog').close();
      message(id?'Data penyedia diperbarui.':'Penyedia berhasil ditambahkan.','success');
      await load();await detail(vendor.id);
    }catch(error){
      if(!onAuthFailure(error)){
        $('ti-vendors-form-error').hidden=false;
        $('ti-vendors-form-error').textContent=error?.status===409
          ?'Kode sudah digunakan, revisi berubah, atau masih ada kontrak aktif.'
          :'Gagal menyimpan penyedia. Periksa semua isian.';
      }
    }finally{state.busy=false;sync();}
  });
  $('ti-vendors-add-contract').addEventListener('click',()=>{if(state.selected)setContractForm(null);});
  $('ti-vendors-edit-contract').addEventListener('click',()=>{if(state.contract&&!state.contract.archived_at)setContractForm(state.contract);});
  $('ti-vendors-contract-cancel').addEventListener('click',()=>$('ti-vendors-contract-dialog').close());
  $('ti-vendors-contract-form').addEventListener('submit',async e=>{
    e.preventDefault();if(state.busy||!canWrite()||!state.selected)return;
    const vendorId=state.selected.id,id=$('ti-vendors-contract-form').dataset.id;
    const body=contractFields();
    state.busy=true;sync();$('ti-vendors-contract-form-error').hidden=true;
    try{
      const contract=validContract(await api('/vendors/'+vendorId+'/contracts'+(id?'/'+id:''),{
        method:id?'PATCH':'POST',body:id
          ?{...body,expectedRevision:Number($('ti-vendors-contract-form').dataset.revision)}:body,
      }));
      $('ti-vendors-contract-dialog').close();message('Kontrak berhasil disimpan.','success');
      await load();await detail(vendorId);await contractDetail(contract.id);
    }catch(error){
      if(!onAuthFailure(error)){
        $('ti-vendors-contract-form-error').hidden=false;
        $('ti-vendors-contract-form-error').textContent=error?.status===409
          ?'Kontrak tidak dapat diperbarui. Periksa status, revisi, dan hasil evaluasi yang sudah tercatat.'
          :'Gagal menyimpan kontrak. Periksa tanggal, target SLA, dan nomor perjanjian.';
      }
    }finally{state.busy=false;sync();}
  });
  $('ti-vendors-add-review').addEventListener('click',()=>{
    if(!state.contract||state.contract.archived_at)return;
    $('ti-vendors-review-form').reset();
    $('ti-vendor-review-start').value=state.contract.start_date;
    $('ti-vendor-review-end').value=
      state.contract.end_date<dateToday()?state.contract.end_date:dateToday();
    $('ti-vendors-review-error').hidden=true;
    $('ti-vendors-review-dialog').showModal();
  });
  $('ti-vendors-review-cancel').addEventListener('click',()=>$('ti-vendors-review-dialog').close());
  $('ti-vendors-review-form').addEventListener('submit',async e=>{
    e.preventDefault();if(state.busy||!canWrite()||!state.contract||!state.selected)return;
    const c=state.contract,v=state.selected;
    const measurement=id=>$(id).value===''?null:Number($(id).value);
    const body={
      periodStart:$('ti-vendor-review-start').value,periodEnd:$('ti-vendor-review-end').value,
      measuredUptime:measurement('ti-vendor-review-uptime'),
      measuredResponseHours:measurement('ti-vendor-review-response'),
      summary:$('ti-vendor-review-summary').value.trim(),
    };
    state.busy=true;sync();$('ti-vendors-review-error').hidden=true;
    try{
      await api('/vendors/'+v.id+'/contracts/'+c.id+'/reviews',{method:'POST',body});
      $('ti-vendors-review-dialog').close();
      message('Evaluasi layanan disimpan sebagai catatan tetap dan tidak dapat diubah.','success');
      await detail(v.id);await contractDetail(c.id);
    }catch(error){
      if(!onAuthFailure(error)){
        $('ti-vendors-review-error').hidden=false;
        $('ti-vendors-review-error').textContent=error?.status===409
          ?'Periksa periode evaluasi; tanggal harus dalam masa kontrak dan tidak di masa depan.'
          :'Evaluasi tidak dapat disimpan. Periksa target SLA, realisasi, dan catatan.';
      }
    }finally{state.busy=false;sync();}
  });
  $('ti-vendors-archive-contract').addEventListener('click',async()=>{
    const c=state.contract,v=state.selected;
    if(!c||!v||c.status!=='ended'||state.busy||!canWrite())return;
    if(!window.confirm('Arsipkan kontrak '+c.contract_code+'? Seluruh evaluasi tetap tersimpan.'))return;
    state.busy=true;sync();
    try{
      await api('/vendors/'+v.id+'/contracts/'+c.id+'/archive',{
        method:'POST',body:{expectedRevision:c.revision},
      });
      message('Kontrak diarsipkan bersama seluruh riwayatnya.','success');
      await load();await detail(v.id);await contractDetail(c.id);
    }catch(error){if(!onAuthFailure(error))message('Kontrak belum dapat diarsipkan.','error');}
    finally{state.busy=false;sync();}
  });
  $('ti-vendors-archive').addEventListener('click',async()=>{
    const v=state.selected;
    if(!v||v.archived_at||state.busy||!canWrite())return;
    if(!window.confirm('Arsipkan penyedia '+v.name+'? Kontrak aktif harus diakhiri terlebih dahulu.'))return;
    state.busy=true;sync();
    try{
      const updated=validVendor(await api('/vendors/'+v.id+'/archive',{
        method:'POST',body:{expectedRevision:v.revision},
      }));
      message('Penyedia diarsipkan tanpa menghapus kontrak dan evaluasi.','success');
      await load();await detail(updated.id);
    }catch(error){if(!onAuthFailure(error))message('Akhiri kontrak aktif atau muat ulang penyedia.','error');}
    finally{state.busy=false;sync();}
  });
  sync();return {load,clear,sync};
}
