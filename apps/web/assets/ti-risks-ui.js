const $=id=>document.getElementById(id);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEVEL={low:'Rendah',medium:'Sedang',high:'Tinggi',critical:'Kritis'};
const STATUS={open:'Teridentifikasi',mitigating:'Dalam mitigasi',
  monitoring:'Pemantauan',closed:'Ditutup'};
export const RISK_EXAMPLES=Object.freeze([
  {id:'CBS_GANGGUAN',group:'Layanan core banking',title:'Gangguan layanan core banking',
    scenario:'Gangguan aplikasi atau infrastruktur core banking berpotensi menghentikan transaksi dan layanan nasabah.'},
  {id:'CBS_DATA',group:'Layanan core banking',title:'Kerusakan atau inkonsistensi database CBS',
    scenario:'Kerusakan data atau kegagalan sinkronisasi database CBS berpotensi mengganggu integritas transaksi dan laporan bank.'},
  {id:'CBS_INTEGRASI',group:'Layanan core banking',title:'Kegagalan integrasi sistem transaksi',
    scenario:'Gangguan pertukaran data antara CBS dan aplikasi pendukung berpotensi menyebabkan transaksi tertunda atau data tidak konsisten.'},
  {id:'BACKUP_GAGAL',group:'Backup dan pemulihan',title:'Kegagalan proses backup',
    scenario:'Backup tidak berhasil atau media salinan tidak tersedia saat diperlukan sehingga pemulihan layanan dan data terhambat.'},
  {id:'RESTORE_UJI',group:'Backup dan pemulihan',title:'Pemulihan data belum teruji',
    scenario:'Prosedur restore belum diuji secara memadai sehingga durasi dan keberhasilan pemulihan layanan kritis tidak diketahui.'},
  {id:'RANSOMWARE',group:'Keamanan siber',title:'Serangan ransomware pada perangkat TI',
    scenario:'Malware dapat mengenkripsi atau menghambat akses data serta layanan TI penting dan memengaruhi kelangsungan operasional.'},
  {id:'AKSES_TIDAK_SAH',group:'Keamanan siber',title:'Akses tidak sah ke sistem bank',
    scenario:'Akun atau hak akses yang tidak sesuai dapat disalahgunakan untuk melihat, mengubah, atau mengambil data sensitif.'},
  {id:'PHISHING',group:'Keamanan siber',title:'Pengambilalihan akun akibat phishing',
    scenario:'Pengguna dapat menyerahkan kredensial melalui pesan palsu sehingga akun dan layanan internal berisiko disalahgunakan.'},
  {id:'KEBOCORAN_DATA',group:'Data dan privasi',title:'Kebocoran data nasabah atau operasional',
    scenario:'Kesalahan konfigurasi, pengiriman, atau pengendalian akses berpotensi membuat data rahasia terekspos tanpa izin.'},
  {id:'PERANGKAT_HILANG',group:'Data dan privasi',title:'Kehilangan perangkat kerja berisi data bank',
    scenario:'Perangkat yang hilang atau dicuri dapat mengakibatkan akses tidak sah apabila penyimpanan dan akses tidak dilindungi.'},
  {id:'JARINGAN_PUTUS',group:'Infrastruktur',title:'Gangguan koneksi jaringan atau internet',
    scenario:'Terputusnya jalur jaringan atau koneksi antar-kantor berpotensi menghambat penggunaan sistem dan layanan transaksi.'},
  {id:'LISTRIK',group:'Infrastruktur',title:'Gangguan listrik pada layanan kritis',
    scenario:'Pemadaman atau kegagalan UPS dapat menyebabkan perangkat penting berhenti dan memicu kerusakan atau kehilangan data.'},
  {id:'PATCH_TERTUNDA',group:'Infrastruktur',title:'Pembaruan keamanan sistem tertunda',
    scenario:'Kerentanan yang tidak ditangani pada server atau endpoint dapat dimanfaatkan untuk mengganggu layanan atau mengambil data.'},
  {id:'VENDOR_LAYANAN',group:'Penyedia jasa TI',title:'Gangguan layanan penyedia TI',
    scenario:'Kegagalan layanan atau dukungan vendor dapat menghambat operasional dan memperpanjang pemulihan layanan yang bergantung padanya.'},
  {id:'VENDOR_AKSES',group:'Penyedia jasa TI',title:'Akses vendor tidak terkendali',
    scenario:'Akses jarak jauh penyedia jasa yang tidak dibatasi atau diawasi dapat meningkatkan risiko perubahan sistem dan kebocoran data.'},
  {id:'KOLEKSI_SYNC',group:'Aplikasi lapangan',title:'Kegagalan sinkronisasi transaksi lapangan',
    scenario:'Gangguan komunikasi aplikasi petugas lapangan dengan sistem pusat berpotensi menimbulkan keterlambatan atau selisih data transaksi.'},
]);
export const riskExampleById=id=>RISK_EXAMPLES.find(x=>x.id===id)??null;
export function suggestRiskCode(title){
  if(typeof title!=='string')return '';
  const slug=title.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase()
    .replace(/[^A-Z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  return slug?'RSK-'+slug.slice(0,28).replace(/-+$/g,''):'';
}
const text=(tag,value,cls)=>{
  const node=document.createElement(tag);
  node.textContent=String(value??'');
  if(cls)node.className=cls;
  return node;
};
export function localRiskLevel(likelihood,impact){
  const score=likelihood*impact;
  if(!Number.isInteger(score)||score<1||score>25)return null;
  return {score,level:score<=4?'low':score<=9?'medium':score<=16?'high':'critical'};
}
export function validateRiskResponse(x){
  if(!x||!UUID.test(x.id)||typeof x.risk_code!=='string'
    ||typeof x.title!=='string'||!Object.hasOwn(STATUS,x.status)
    ||!Number.isInteger(x.inherent_score)||!Object.hasOwn(LEVEL,x.inherent_level)
    ||!Number.isInteger(x.revision)||x.revision<1)throw new TypeError('Invalid risk response');
  return x;
}
export function createRiskRegisterUI({api,getPermissions,onAuthFailure}){
  const state={risks:[],assets:[],selected:null,loaded:false,busy:false,
    offset:0,more:false,request:0,detailRequest:0};
  const canRead=()=>getPermissions().includes('risks:read');
  const canWrite=()=>getPermissions().includes('risks:write');
  function message(value,kind='info'){
    const n=$('ti-risks-message');n.textContent=value??'';n.hidden=!value;n.dataset.kind=kind;
  }
  const examples=$('ti-risk-example');
  const groupLookup=new Map();
  for(const example of RISK_EXAMPLES){
    if(!groupLookup.has(example.group)){
      const optgroup=document.createElement('optgroup');optgroup.label=example.group;
      groupLookup.set(example.group,optgroup);examples.append(optgroup);
    }
    groupLookup.get(example.group).append(new Option(example.title,example.id));
  }
  function sync(){
    $('ti-risks-create').hidden=!canWrite();
    $('ti-risks-save').disabled=state.busy||!canWrite();
    $('ti-risks-edit').hidden=!state.selected||!!state.selected.archived_at||!canWrite();
    $('ti-risks-archive').hidden=!state.selected||!!state.selected.archived_at||!canWrite();
    $('ti-risks-archive').disabled=state.busy;
  }
  function clear(){
    ++state.request;++state.detailRequest;
    state.risks=[];state.assets=[];state.selected=null;state.loaded=false;
    state.busy=false;state.offset=0;state.more=false;
    $('ti-risks-dialog').close?.();
    $('ti-risks-form').reset();
    $('ti-risks-detail').hidden=true;
    $('ti-risks-list').replaceChildren();$('ti-risks-history').replaceChildren();
    $('ti-risks-search').value='';
    $('ti-risks-view').value='active';
    $('ti-risks-status-filter').value='all';
    $('ti-risks-level-filter').value='all';
    $('ti-risks-asset-filter').replaceChildren(new Option('Semua aset','all'),new Option('Tanpa aset','none'));
    message('');sync();
  }
  function assetOptions(){
    const form=$('ti-risk-asset-id'),filter=$('ti-risks-asset-filter');
    const formValue=form.value,filterValue=filter.value;
    form.replaceChildren(new Option('Tidak terkait aset tertentu',''));
    filter.replaceChildren(new Option('Semua aset','all'),new Option('Tanpa aset','none'));
    for(const a of state.assets){
      const label=a.asset_code+' · '+a.title;
      form.add(new Option(label,a.id));filter.add(new Option(label,a.id));
    }
    if([...form.options].some(o=>o.value===formValue))form.value=formValue;
    if([...filter.options].some(o=>o.value===filterValue))filter.value=filterValue;
  }
  async function loadAssetOptions(){
    if(!canRead())return;
    const d=await api('/risks/asset-options');
    if(!d||!Array.isArray(d.assets))throw new TypeError('Invalid asset list');
    state.assets=d.assets.filter(a=>UUID.test(a.id)&&typeof a.asset_code==='string');
    assetOptions();
    $('ti-risk-assets-limit').textContent=d.truncated
      ?'Inventaris lebih dari 1.000 aset. Hubungi administrator untuk penyesuaian.'
      :'Aset yang sudah diarsipkan tidak dapat ditautkan ke risiko baru.';
  }
  function hasRiskFilters(){
    return Boolean($('ti-risks-search').value.trim())||
      $('ti-risks-view').value!=='active'||$('ti-risks-status-filter').value!=='all'||
      $('ti-risks-level-filter').value!=='all'||$('ti-risks-asset-filter').value!=='all';
  }
  function render(){
    const root=$('ti-risks-list');root.replaceChildren();
    const summary=$('ti-risks-list-summary');
    if(!state.loaded){summary.textContent='Memuat register risiko…';return;}
    summary.textContent=state.risks.length
      ?'Menampilkan '+state.risks.length+' risiko pada halaman ini. Pilih satu untuk melihat kondisi dan tindak lanjutnya.'
      :hasRiskFilters()?'Tidak ada risiko yang cocok dengan filter. Coba reset filter.':
        'Belum ada risiko yang dicatat. Pustaka contoh tersedia saat menambah risiko.';
    if(!state.risks.length){
      const empty=text('div','','risk-empty-state');
      empty.append(text('strong',hasRiskFilters()?'Tidak ada hasil pencarian':'Belum ada risiko tercatat'),
        text('p',hasRiskFilters()?'Sesuaikan pencarian atau gunakan Reset filter.':
          'Klik Tambah risiko untuk mencatat hasil identifikasi; contoh skenario tidak menjadi risiko faktual sebelum disimpan.'));
      root.append(empty);
    }
    for(const risk of state.risks){
      const row=text('article','','ti-risk-list-item risk-record');
      const head=text('div','','risk-record-head');
      const title=text('div','','risk-record-title');
      title.append(text('span',risk.risk_code,'risk-record-code'),text('strong',risk.title));
      head.append(title,text('span',risk.inherent_score+'/25 · '+LEVEL[risk.inherent_level],
        'risk-level-pill risk-level-'+risk.inherent_level));
      const meta=text('div','','risk-record-meta');
      meta.append(text('span',STATUS[risk.status]+(risk.archived_at?' · Diarsipkan':'')),
        text('span','PIC: '+risk.pic),
        text('span',risk.asset_code?'Aset: '+risk.asset_code:'Tanpa aset khusus'));
      const open=text('button','Lihat penilaian dan tindak lanjut','button button-outline risk-record-action');
      open.type='button';open.addEventListener('click',()=>void detail(risk.id));
      row.append(head,meta,open);root.append(row);
    }
    $('ti-risks-position').textContent=state.risks.length
      ?'Menampilkan '+(state.offset+1)+'–'+(state.offset+state.risks.length):'Tidak ada hasil';
    $('ti-risks-prev').disabled=state.busy||state.offset===0;
    $('ti-risks-next').disabled=state.busy||!state.more;
  }
  async function load({resetOffset=true}={}){
    if(!canRead())return;
    if(resetOffset)state.offset=0;
    const token=++state.request;
    state.loaded=false;render();
    const params=new URLSearchParams({
      q:$('ti-risks-search').value.trim(),view:$('ti-risks-view').value,
      status:$('ti-risks-status-filter').value,level:$('ti-risks-level-filter').value,
      assetId:$('ti-risks-asset-filter').value,offset:String(state.offset),
    });
    try{
      const [data]=await Promise.all([api('/risks?'+params),state.assets.length
        ?Promise.resolve():loadAssetOptions()]);
      if(token!==state.request)return;
      if(!data||!Array.isArray(data.risks)||data.risks.length>50
        ||typeof data.hasMore!=='boolean')throw new TypeError('Invalid list');
      state.risks=data.risks.map(validateRiskResponse);state.more=data.hasMore;
    }catch(e){
      if(token!==state.request)return;
      state.risks=[];state.more=false;
      if(!onAuthFailure(e))message('Gagal mengambil register risiko.','error');
    }finally{if(token===state.request){state.loaded=true;render();}}
  }
  function preview(){
    const inherent=localRiskLevel(Number($('ti-risk-likelihood').value),
      Number($('ti-risk-impact').value));
    $('ti-risk-inherent-preview').textContent=inherent
      ?inherent.score+'/25 · '+LEVEL[inherent.level]:'Belum dihitung: pilih kemungkinan dan dampak';
    const rl=$('ti-risk-residual-likelihood').value,ri=$('ti-risk-residual-impact').value;
    const residual=rl&&ri?localRiskLevel(Number(rl),Number(ri)):null;
    $('ti-risk-residual-preview').textContent=residual
      ?residual.score+'/25 · '+LEVEL[residual.level]:'Belum dinilai';
  }
  function setForm(risk){
    const form=$('ti-risks-form');form.reset();
    $('ti-risk-code').value=risk?.risk_code??'';
    $('ti-risk-code').readOnly=Boolean(risk);
    $('ti-risk-title').value=risk?.title??'';
    $('ti-risk-scenario').value=risk?.scenario??'';
    const select=$('ti-risk-asset-id');
    if(risk?.asset_id&&![...select.options].some(o=>o.value===risk.asset_id))
      select.add(new Option((risk.asset_code??'Aset arsip')+' (tertaut sebelumnya)',risk.asset_id));
    select.value=risk?.asset_id??'';
    $('ti-risk-likelihood').value=String(risk?.likelihood??'');
    $('ti-risk-impact').value=String(risk?.impact??'');
    $('ti-risk-residual-likelihood').value=String(risk?.residual_likelihood??'');
    $('ti-risk-residual-impact').value=String(risk?.residual_impact??'');
    $('ti-risk-mitigation').value=risk?.mitigation??'';
    $('ti-risk-pic').value=risk?.pic??'';
    $('ti-risk-due-date').value=risk?.due_date??'';
    $('ti-risk-example').value='';
    $('ti-risk-suggest-code').hidden=Boolean(risk);
    $('ti-risk-use-example').hidden=Boolean(risk);
    $('ti-risk-example').disabled=Boolean(risk);
    $('ti-risk-residual-details').open=Boolean(risk?.residual_likelihood||risk?.residual_impact);
    $('ti-risk-status').value=risk?.status??'open';
    $('ti-risk-note').value=risk?.note??'';
    form.dataset.editId=risk?.id??'';
    form.dataset.revision=String(risk?.revision??0);
    $('ti-risks-form-error').hidden=true;
    $('ti-risks-dialog-title').textContent=risk?'Ubah risiko TI':'Tambah risiko TI';
    preview();$('ti-risks-dialog').showModal();
  }
  function fields(){
    const rl=$('ti-risk-residual-likelihood').value,ri=$('ti-risk-residual-impact').value;
    if(Boolean(rl)!==Boolean(ri))throw new TypeError('Nilai residual harus sepasang');
    return {
      riskCode:$('ti-risk-code').value.trim().toUpperCase(),
      title:$('ti-risk-title').value.trim(),scenario:$('ti-risk-scenario').value.trim(),
      assetId:$('ti-risk-asset-id').value||null,
      likelihood:Number($('ti-risk-likelihood').value),
      impact:Number($('ti-risk-impact').value),
      residualLikelihood:rl?Number(rl):null,residualImpact:ri?Number(ri):null,
      mitigation:$('ti-risk-mitigation').value,
      pic:$('ti-risk-pic').value.trim(),dueDate:$('ti-risk-due-date').value,
      status:$('ti-risk-status').value,note:$('ti-risk-note').value,
    };
  }
  function renderDetail(r){
    state.selected=r;
    const head=$('ti-risks-detail-summary');head.replaceChildren();
    const heading=text('div','','risk-detail-heading');
    heading.append(text('span',r.risk_code,'risk-record-code'),
      text('h3',r.title),text('p',STATUS[r.status]+(r.archived_at?' · Diarsipkan':'')));
    head.append(heading,text('span',r.inherent_score+'/25 · '+LEVEL[r.inherent_level],
      'risk-level-pill risk-level-'+r.inherent_level));
    const root=$('ti-risks-detail-values');root.replaceChildren();
    const groups=[
      ['Identifikasi risiko',[
        ['Skenario dan dampak',r.scenario],
        ['Aset terkait',r.asset_code?r.asset_code+' · '+r.asset_title:'Tidak terkait aset tertentu'],
        ['Nilai inheren',r.inherent_score+'/25 · '+LEVEL[r.inherent_level]],
        ['Nilai residual',r.residual_score===null?'Belum dinilai':
          r.residual_score+'/25 · '+LEVEL[r.residual_level]],
      ]],
      ['Penanganan dan PIC',[
        ['Rencana mitigasi',r.mitigation||'Belum dicatat'],
        ['PIC',r.pic],['Target',r.due_date],
        ['Status',STATUS[r.status]],['Catatan',r.note||'—'],
      ]],
      ['Informasi pencatatan',[
        ['Kode',r.risk_code],['Revisi',r.revision],
        ['Arsip',r.archived_at?'Diarsipkan':'Aktif'],
      ]],
    ];
    for(const [title,fields] of groups){
      const group=text('section','','risk-detail-section');
      const dl=text('dl','','ti-assets-detail-values');
      for(const [name,value] of fields){
        const item=text('div','','ti-asset-detail-item');
        item.append(text('dt',name),text('dd',value));dl.append(item);
      }
      group.append(text('h3',title),dl);root.append(group);
    }
    $('ti-risks-detail').hidden=false;sync();
  }
  async function detail(id){
    if(!UUID.test(id))return;
    const req=++state.detailRequest;
    try{
      const record=validateRiskResponse(await api('/risks/'+id));
      if(req!==state.detailRequest)return;
      renderDetail(record);
      $('ti-risks-detail').scrollIntoView?.({block:'nearest'});
      const history=await api('/risks/'+id+'/history');
      if(req!==state.detailRequest)return;
      if(!Array.isArray(history.events))throw new TypeError('History invalid');
      const root=$('ti-risks-history');root.replaceChildren();
      for(const row of history.events){
        const label={CREATED:'Ditambahkan',UPDATED:'Diubah',ARCHIVED:'Diarsipkan'}[row.action];
        const li=text('li',(label??'Perubahan')+' · revisi '+row.revision+
          ' · '+new Date(row.occurred_at).toLocaleString('id-ID')+
          ' · pengguna '+String(row.actor_user_id).slice(0,8),'ti-asset-history-item');
        root.append(li);
      }
    }catch(e){if(!onAuthFailure(e))message('Gagal membuka risiko atau riwayat.','error');}
  }
  $('ti-risk-example').addEventListener('change',()=>{
    const example=riskExampleById($('ti-risk-example').value);
    $('ti-risk-example-hint').textContent=example?
      'Contoh: '+example.scenario+' Pilih Gunakan contoh jika sesuai.':
      'Pilih contoh bila relevan, lalu gunakan dan sesuaikan berdasarkan kondisi lembaga.';
  });
  $('ti-risk-use-example').addEventListener('click',()=>{
    const chosen=riskExampleById($('ti-risk-example').value);
    if(!chosen){$('ti-risk-example').focus();return;}
    if(($('ti-risk-title').value.trim()||$('ti-risk-scenario').value.trim())&&
      !window.confirm('Ganti judul dan skenario saat ini dengan contoh? Nilai risiko dan aset terkait tidak berubah.'))return;
    $('ti-risk-title').value=chosen.title;
    $('ti-risk-scenario').value=chosen.scenario;
    $('ti-risk-example-hint').textContent='Contoh diterapkan. Sesuaikan dengan kondisi aktual, lalu nilai kemungkinan dan dampaknya sendiri.';
  });
  $('ti-risk-suggest-code').addEventListener('click',()=>{
    const title=$('ti-risk-title');
    if(!title.value.trim()){title.focus();$('ti-risk-code-hint').textContent='Isi nama risiko terlebih dahulu.';return;}
    const code=suggestRiskCode(title.value);
    if(code){
      $('ti-risk-code').value=code;
      $('ti-risk-code-hint').textContent='Kode usulan: '+code+'. Periksa keunikan sebelum menyimpan.';
    }
  });
  $('ti-risks-clear-filters').addEventListener('click',()=>{
    $('ti-risks-search').value='';$('ti-risks-view').value='active';
    $('ti-risks-status-filter').value='all';$('ti-risks-level-filter').value='all';
    $('ti-risks-asset-filter').value='all';void load();
  });
  $('ti-risks-create').addEventListener('click',()=>setForm(null));
  $('ti-risks-edit').addEventListener('click',()=>{if(state.selected&&!state.selected.archived_at)setForm(state.selected);});
  $('ti-risks-refresh').addEventListener('click',()=>void load({resetOffset:false}));
  $('ti-risks-prev').addEventListener('click',()=>{state.offset=Math.max(0,state.offset-50);void load({resetOffset:false});});
  $('ti-risks-next').addEventListener('click',()=>{state.offset+=50;void load({resetOffset:false});});
  $('ti-risks-filter-form').addEventListener('submit',e=>{e.preventDefault();void load();});
  for(const id of ['ti-risks-view','ti-risks-status-filter','ti-risks-level-filter','ti-risks-asset-filter'])
    $(id).addEventListener('change',()=>void load());
  for(const id of ['ti-risk-likelihood','ti-risk-impact','ti-risk-residual-likelihood','ti-risk-residual-impact'])
    $(id).addEventListener('change',preview);
  $('ti-risks-cancel').addEventListener('click',()=>$('ti-risks-dialog').close());
  $('ti-risks-form').addEventListener('submit',async e=>{
    e.preventDefault();
    if(state.busy||!canWrite())return;
    const id=$('ti-risks-form').dataset.editId;
    let data;
    if(!$('ti-risk-likelihood').value||!$('ti-risk-impact').value){
      $('ti-risks-form-error').hidden=false;
      $('ti-risks-form-error').textContent='Nilai kemungkinan dan dampak harus dipilih berdasarkan kondisi lembaga.';
      (!$('ti-risk-likelihood').value?$('ti-risk-likelihood'):$('ti-risk-impact')).focus();
      return;
    }
    try{data=fields();}
    catch{
      $('ti-risks-form-error').hidden=false;
      $('ti-risks-form-error').textContent='Nilai residual harus diisi pada kedua kolom atau kosongkan keduanya.';
      return;
    }
    state.busy=true;sync();$('ti-risks-form-error').hidden=true;
    try{
      const record=validateRiskResponse(await api(id?'/risks/'+id:'/risks',{
        method:id?'PATCH':'POST',body:id
          ?{...data,expectedRevision:Number($('ti-risks-form').dataset.revision)}:data,
      }));
      $('ti-risks-dialog').close();
      message(id?'Risiko berhasil diperbarui.':'Risiko berhasil dicatat.','success');
      await load();await detail(record.id);
    }catch(error){
      if(!onAuthFailure(error)){
        $('ti-risks-form-error').textContent=error?.status===409
          ?'Ada konflik revisi atau syarat penutupan belum terpenuhi. Periksa dan muat ulang sebelum mengulangi.'
          :'Gagal menyimpan risiko. Periksa isian, aset terkait, PIC, target dan nilai risiko.';
        $('ti-risks-form-error').hidden=false;
      }
    }finally{state.busy=false;sync();}
  });
  $('ti-risks-archive').addEventListener('click',async()=>{
    const record=state.selected;
    if(!record||record.archived_at||state.busy||!canWrite())return;
    if(!window.confirm('Arsipkan '+record.risk_code+'? Risiko tetap tercatat untuk audit dan tidak dapat diubah lagi.'))return;
    state.busy=true;sync();
    try{
      const updated=validateRiskResponse(await api('/risks/'+record.id+'/archive',{
        method:'POST',body:{expectedRevision:record.revision},
      }));
      message('Risiko diarsipkan tanpa menghapus historinya.','success');
      await load();await detail(updated.id);
    }catch(e){if(!onAuthFailure(e))message('Pengarsipan gagal. Muat ulang risiko.','error');}
    finally{state.busy=false;sync();}
  });
  sync();return {load,clear,sync};
}
