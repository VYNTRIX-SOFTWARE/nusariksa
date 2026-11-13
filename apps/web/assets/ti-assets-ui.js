const $=id=>document.getElementById(id);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TYPES={server:'Server',workstation:'PC/Laptop',network:'Jaringan',software:'Aplikasi',storage:'Storage',other:'Lainnya'};
const PRIORITIES={low:'Rendah',medium:'Sedang',high:'Tinggi'};
const STATES={active:'Aktif',maintenance:'Pemeliharaan',retired:'Tidak digunakan'};
const TYPE_GUIDANCE=Object.freeze({
  server:'Contoh: server core banking, VM aplikasi atau server backup. Catat tiap aset sesuai peran aktualnya.',
  workstation:'Contoh: PC teller, laptop operasional atau workstation admin. Gunakan nama/kode inventaris sendiri.',
  network:'Contoh: router, firewall, switch, access point atau perangkat koneksi antar-kantor.',
  software:'Contoh: aplikasi core banking, aplikasi pelaporan, sistem operasi atau layanan berbasis perangkat lunak.',
  storage:'Contoh: NAS, perangkat penyimpanan backup atau media penyimpanan terkelola.',
  other:'Gunakan untuk aset TI yang tidak masuk jenis lain. Jelaskan kategorinya dalam catatan.',
});
const CRITICALITY_GUIDANCE=Object.freeze({
  low:'Rendah: gangguan tidak menghambat layanan utama dan alternatifnya memadai. Pastikan dampak aktual memang kecil.',
  medium:'Sedang: gangguan mengurangi efektivitas kerja atau layanan, tetapi masih ada cara kerja sementara yang layak.',
  high:'Tinggi: gangguan berpotensi menghentikan transaksi/layanan kritis, menimbulkan dampak material, atau mengancam keamanan data.',
});
export const assetTypeGuidance=kind=>TYPE_GUIDANCE[kind]??
  'Pilih jenis berdasarkan fungsi aset. Contoh tidak berarti aset sudah tercatat.';
export const assetCriticalityGuidance=level=>CRITICALITY_GUIDANCE[level]??
  'Tentukan berdasarkan dampak gangguan pada transaksi, layanan nasabah, data, dan alternatif pemulihan. Tidak ada nilai otomatis.';
const CODE_PREFIX={server:'SRV',workstation:'PC',network:'NET',software:'APP',storage:'STO',other:'AST'};
export function suggestAssetCode(title,kind){
  if(typeof title!=='string'||typeof kind!=='string'||!Object.hasOwn(CODE_PREFIX,kind))return '';
  const slug=title.normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  return slug?(CODE_PREFIX[kind]+'-'+slug.slice(0,32-CODE_PREFIX[kind].length-1).replace(/-+$/g,'')):'';
}
const el=(tag,value,cls)=>{
  const node=document.createElement(tag);
  node.textContent=String(value??'');
  if(cls)node.className=cls;
  return node;
};
export function validateAssetResponse(asset){
  if(!asset||!UUID.test(asset.id)||typeof asset.asset_code!=='string'
    ||typeof asset.title!=='string'||!Object.hasOwn(TYPES,asset.kind)
    ||!Object.hasOwn(PRIORITIES,asset.criticality)
    ||!Object.hasOwn(STATES,asset.operational_status)
    ||!Number.isSafeInteger(asset.revision)||asset.revision<1)
    throw new TypeError('Data aset tidak valid');
  return asset;
}
export function createAssetRegisterUI({api,getPermissions,onAuthFailure}){
  const state={items:[],selected:null,busy:false,loaded:false,offset:0,hasMore:false,request:0};
  const canRead=()=>getPermissions().includes('assets:read');
  const canWrite=()=>getPermissions().includes('assets:write');
  const message=(text,kind='info')=>{
    const n=$('ti-assets-message');n.textContent=text??'';n.hidden=!text;n.dataset.kind=kind;
  };
  function clear(){
    ++state.request;state.items=[];state.selected=null;state.busy=false;state.loaded=false;
    state.offset=0;state.hasMore=false;
    $('ti-assets-form').reset();
    $('ti-assets-dialog').close?.();
    $('ti-assets-search').value='';
    $('ti-assets-status').value='active';
    $('ti-assets-kind-filter').value='all';
    $('ti-assets-priority-filter').value='all';
    $('ti-assets-history').replaceChildren();
    $('ti-assets-list').replaceChildren();
    $('ti-assets-detail').hidden=true;
    message('');
  }
  function sync(){
    $('ti-assets-create').hidden=!canWrite();
    $('ti-assets-save').disabled=state.busy||!canWrite();
    $('ti-assets-archive').hidden=!canWrite()||!state.selected||!!state.selected.archived_at;
    $('ti-assets-archive').disabled=state.busy;
  }
  function fields(){
    return {
      assetCode:$('ti-asset-code').value.trim().toUpperCase(),
      title:$('ti-asset-title').value.trim(),
      kind:$('ti-asset-kind').value,
      ownerName:$('ti-asset-owner').value.trim(),
      location:$('ti-asset-location').value.trim(),
      criticality:$('ti-asset-criticality').value,
      operationalStatus:$('ti-asset-operational-status').value,
      note:$('ti-asset-note').value,
    };
  }
  function hasAssetFilters(){
    return Boolean($('ti-assets-search').value.trim())||
      $('ti-assets-status').value!=='active'||
      $('ti-assets-kind-filter').value!=='all'||
      $('ti-assets-priority-filter').value!=='all';
  }
  function renderList(){
    const root=$('ti-assets-list');root.replaceChildren();
    const summary=$('ti-assets-list-summary');
    if(!state.loaded){
      summary.textContent='Memuat daftar aset…';
      root.append(el('p','Memuat inventaris TI…','workspace-help'));return;
    }
    summary.textContent=state.items.length
      ?'Menampilkan '+state.items.length+' aset pada halaman ini. Pilih satu aset untuk melihat detail dan riwayatnya.'
      :hasAssetFilters()?'Belum ada aset yang cocok dengan filter. Coba reset filter.':
        'Inventaris belum memiliki aset. Mulai dari perangkat atau aplikasi yang benar-benar digunakan lembaga.';
    if(!state.items.length){
      const empty=el('div','','asset-empty-state');
      empty.append(el('strong',hasAssetFilters()?'Tidak ada hasil pencarian':'Belum ada aset tercatat'),
        el('p',hasAssetFilters()?'Ubah pencarian atau gunakan Reset filter untuk kembali ke daftar.':
          'Gunakan Tambah aset untuk mencatat data yang benar-benar ada. Contoh pada formulir hanya panduan.'));
      root.append(empty);
    }
    for(const asset of state.items){
      const row=el('article','','ti-asset-item asset-record');
      const head=el('div','','asset-record-head');
      const title=el('div','','asset-record-title');
      title.append(el('span',asset.asset_code,'asset-record-code'),
        el('strong',asset.title));
      const priority=el('span',PRIORITIES[asset.criticality],
        'asset-status-pill asset-criticality-'+asset.criticality);
      head.append(title,priority);
      const meta=el('div','','asset-record-meta');
      meta.append(el('span',TYPES[asset.kind]),
        el('span','Lokasi: '+asset.location),
        el('span','PIC: '+asset.owner_name),
        el('span',asset.archived_at?'Diarsipkan':STATES[asset.operational_status]));
      const open=el('button','Lihat rincian dan riwayat','button button-outline asset-record-action');
      open.type='button';open.addEventListener('click',()=>void detail(asset.id));
      row.append(head,meta,open);root.append(row);
    }
    $('ti-assets-position').textContent=state.items.length
      ?'Menampilkan '+(state.offset+1)+'–'+(state.offset+state.items.length):'Tidak ada hasil';
    $('ti-assets-prev').disabled=state.busy||state.offset===0;
    $('ti-assets-next').disabled=state.busy||!state.hasMore;
  }
  async function load({resetOffset=true}={}){
    if(!canRead())return;
    if(resetOffset)state.offset=0;
    const request=++state.request;
    state.loaded=false;renderList();
    const q=new URLSearchParams({
      status:$('ti-assets-status').value,
      kind:$('ti-assets-kind-filter').value,
      criticality:$('ti-assets-priority-filter').value,
      q:$('ti-assets-search').value.trim(),
      offset:String(state.offset),
    });
    try{
      const data=await api('/assets?'+q.toString());
      if(request!==state.request)return;
      if(!data||!Array.isArray(data.assets)||data.assets.length>50
        ||typeof data.hasMore!=='boolean')throw new TypeError('Invalid list');
      state.items=data.assets.map(validateAssetResponse);state.hasMore=data.hasMore;
    }catch(error){
      if(request!==state.request)return;
      state.items=[];state.hasMore=false;
      if(!onAuthFailure(error))message('Gagal memuat inventaris TI.','error');
    }finally{if(request===state.request){state.loaded=true;renderList();}}
  }
  function renderGuidance(){
    $('ti-asset-kind-hint').textContent=assetTypeGuidance($('ti-asset-kind').value);
    $('ti-asset-criticality-hint').textContent=assetCriticalityGuidance($('ti-asset-criticality').value);
  }
  function fillForm(asset){
    $('ti-assets-form').reset();
    $('ti-asset-code').value=asset?.asset_code??'';
    $('ti-asset-code').readOnly=Boolean(asset);
    $('ti-asset-title').value=asset?.title??'';
    $('ti-asset-kind').value=asset?.kind??'';
    $('ti-asset-owner').value=asset?.owner_name??'';
    $('ti-asset-location').value=asset?.location??'';
    $('ti-asset-criticality').value=asset?.criticality??'';
    $('ti-asset-operational-status').value=asset?.operational_status??'active';
    $('ti-asset-note').value=asset?.note??'';
    $('ti-assets-form').dataset.editId=asset?.id??'';
    $('ti-assets-form').dataset.revision=String(asset?.revision??0);
    $('ti-assets-dialog-title').textContent=asset?'Ubah aset TI':'Tambah aset TI';
    $('ti-asset-suggest-code').hidden=Boolean(asset);
    $('ti-asset-code-hint').textContent=asset
      ?'Kode permanen untuk menjaga riwayat aset.':'Saran dapat diubah. Periksa keunikannya sebelum disimpan.';
    $('ti-assets-error').hidden=true;$('ti-assets-error').textContent='';
    renderGuidance();
    $('ti-assets-dialog').showModal();
  }
  function renderDetail(asset){
    state.selected=asset;
    const summary=$('ti-assets-detail-summary');
    summary.replaceChildren();
    const heading=el('div','','asset-detail-heading');
    heading.append(el('span',asset.asset_code,'asset-record-code'),
      el('h3',asset.title),
      el('p',TYPES[asset.kind]+' · '+(asset.archived_at?'Diarsipkan':STATES[asset.operational_status])));
    summary.append(heading,el('span','Kritikalitas '+PRIORITIES[asset.criticality],
      'asset-status-pill asset-criticality-'+asset.criticality));
    const root=$('ti-assets-detail-values');root.replaceChildren();
    for(const [label,value] of [
      ['Kode',asset.asset_code],['Nama',asset.title],['Jenis',TYPES[asset.kind]],
      ['Pemilik/PIC',asset.owner_name],['Lokasi',asset.location],
      ['Kritikalitas',PRIORITIES[asset.criticality]],
      ['Status',asset.archived_at?'Diarsipkan':STATES[asset.operational_status]],
      ['Revisi',asset.revision],['Catatan',asset.note||'—']]){
      const wrap=el('div','','ti-asset-detail-item');
      wrap.append(el('dt',label),el('dd',value));root.append(wrap);
    }
    $('ti-assets-detail').hidden=false;
    $('ti-assets-edit').hidden=!canWrite()||!!asset.archived_at;
    sync();
  }
  async function detail(id){
    if(!UUID.test(id))return;
    try{
      const asset=validateAssetResponse(await api('/assets/'+id));
      renderDetail(asset);
      $('ti-assets-detail').scrollIntoView?.({block:'nearest'});
      const history=await api('/assets/'+id+'/history');
      const root=$('ti-assets-history');root.replaceChildren();
      if(!Array.isArray(history.events))throw new TypeError('Invalid history');
      for(const item of history.events){
        const label=({CREATED:'Ditambahkan',UPDATED:'Diperbarui',ARCHIVED:'Diarsipkan'})[item.action];
        root.append(el('li',(label??'Perubahan')+' · revisi '+item.revision+' · '+
          new Date(item.occurred_at).toLocaleString('id-ID')+
          ' · oleh pengguna '+String(item.actor_user_id).slice(0,8),'ti-asset-history-item'));
      }
    }catch(error){
      if(!onAuthFailure(error))message('Gagal membuka aset atau riwayat.','error');
    }
  }
  $('ti-asset-suggest-code').addEventListener('click',()=>{
    const title=$('ti-asset-title'),kind=$('ti-asset-kind');
    if(!title.value.trim()){title.focus();$('ti-asset-code-hint').textContent='Isi nama aset terlebih dahulu.';return;}
    if(!kind.value){kind.focus();$('ti-asset-code-hint').textContent='Pilih jenis aset terlebih dahulu.';return;}
    const code=suggestAssetCode(title.value,kind.value);
    if(code){
      $('ti-asset-code').value=code;
      $('ti-asset-code-hint').textContent='Kode usulan: '+code+'. Periksa keunikan dan sesuaikan bila diperlukan.';
    }
  });
  $('ti-assets-clear-filters').addEventListener('click',()=>{
    $('ti-assets-search').value='';$('ti-assets-status').value='active';
    $('ti-assets-kind-filter').value='all';$('ti-assets-priority-filter').value='all';
    void load();
  });
  $('ti-asset-kind').addEventListener('change',renderGuidance);
  $('ti-asset-criticality').addEventListener('change',renderGuidance);
  $('ti-assets-create').addEventListener('click',()=>fillForm(null));
  $('ti-assets-edit').addEventListener('click',()=>{if(state.selected&&!state.selected.archived_at)fillForm(state.selected);});
  $('ti-assets-refresh').addEventListener('click',()=>void load({resetOffset:false}));
  $('ti-assets-prev').addEventListener('click',()=>{state.offset=Math.max(0,state.offset-50);void load({resetOffset:false});});
  $('ti-assets-next').addEventListener('click',()=>{state.offset+=50;void load({resetOffset:false});});
  $('ti-assets-filter-form').addEventListener('submit',event=>{event.preventDefault();void load();});
  for(const id of ['ti-assets-status','ti-assets-kind-filter','ti-assets-priority-filter'])
    $(id).addEventListener('change',()=>void load());
  $('ti-assets-form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(state.busy||!canWrite())return;
    const id=$('ti-assets-form').dataset.editId;
    const data=fields();
    state.busy=true;sync();$('ti-assets-error').hidden=true;
    try{
      const result=validateAssetResponse(await api(id?'/assets/'+id:'/assets',{
        method:id?'PATCH':'POST',
        body:id?{...data,expectedRevision:Number($('ti-assets-form').dataset.revision)}:data,
      }));
      $('ti-assets-dialog').close();
      message(id?'Aset berhasil diperbarui.':'Aset berhasil ditambahkan.','success');
      await load();await detail(result.id);
    }catch(error){
      if(!onAuthFailure(error)){
        $('ti-assets-error').textContent=error?.status===409
          ?'Data aset telah berubah atau kode sudah dipakai. Muat ulang sebelum mengulangi.'
          :'Gagal menyimpan aset. Periksa kode, isian wajib dan batas panjang.';
        $('ti-assets-error').hidden=false;
      }
    }finally{state.busy=false;sync();}
  });
  $('ti-assets-archive').addEventListener('click',async()=>{
    const asset=state.selected;
    if(!asset||asset.archived_at||state.busy||!canWrite())return;
    if(!window.confirm('Arsipkan '+asset.asset_code+'? Data dan histori tidak dihapus, tetapi aset tidak dapat diubah lagi.'))return;
    state.busy=true;sync();
    try{
      const updated=validateAssetResponse(await api('/assets/'+asset.id+'/archive',{
        method:'POST',body:{expectedRevision:asset.revision},
      }));
      message('Aset diarsipkan. Histori tetap tersedia.','success');
      await load();await detail(updated.id);
    }catch(error){if(!onAuthFailure(error))message('Pengarsipan gagal. Muat ulang aset.','error');}
    finally{state.busy=false;sync();}
  });
  $('ti-assets-cancel').addEventListener('click',()=>{$('ti-assets-dialog').close();});
  sync();
  return {load,clear,sync};
}
