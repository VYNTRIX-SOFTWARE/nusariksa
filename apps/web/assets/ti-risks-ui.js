const $=id=>document.getElementById(id);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEVEL={low:'Rendah',medium:'Sedang',high:'Tinggi',critical:'Kritis'};
const STATUS={open:'Teridentifikasi',mitigating:'Dalam mitigasi',
  monitoring:'Pemantauan',closed:'Ditutup'};
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
  function render(){
    const root=$('ti-risks-list');root.replaceChildren();
    if(!state.loaded){root.append(text('p','Memuat register risiko…','workspace-help'));return;}
    if(!state.risks.length)root.append(text('p',
      'Belum ada risiko pada filter ini. Pilih Tambah risiko untuk mencatat skenario yang diperiksa.','workspace-help'));
    for(const risk of state.risks){
      const row=text('div','','ti-risk-list-item');
      const open=text('button',risk.risk_code+' · '+risk.title,'ti-risk-open');
      open.type='button';open.addEventListener('click',()=>void detail(risk.id));
      const meta=text('p',
        'Inheren '+risk.inherent_score+'/25 · '+LEVEL[risk.inherent_level]+
        ' · '+STATUS[risk.status]+' · '+risk.pic+
        (risk.asset_code?' · '+risk.asset_code:' · Tanpa aset')+
        (risk.archived_at?' · Diarsipkan':''),'workspace-help');
      row.append(open,meta);root.append(row);
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
      ?inherent.score+'/25 · '+LEVEL[inherent.level]:'Pilih kemungkinan dan dampak';
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
    $('ti-risk-likelihood').value=String(risk?.likelihood??'3');
    $('ti-risk-impact').value=String(risk?.impact??'3');
    $('ti-risk-residual-likelihood').value=String(risk?.residual_likelihood??'');
    $('ti-risk-residual-impact').value=String(risk?.residual_impact??'');
    $('ti-risk-mitigation').value=risk?.mitigation??'';
    $('ti-risk-pic').value=risk?.pic??'';
    if(!risk){
      const d=new Date();d.setDate(d.getDate()+30);
      const part=n=>String(n).padStart(2,'0');
      $('ti-risk-due-date').value=d.getFullYear()+'-'+part(d.getMonth()+1)+'-'+part(d.getDate());
    }else $('ti-risk-due-date').value=risk.due_date;
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
    state.selected=r;const root=$('ti-risks-detail-values');root.replaceChildren();
    for(const [name,value] of [
      ['Kode',r.risk_code],['Risiko',r.title],['Skenario',r.scenario],
      ['Aset',r.asset_code? r.asset_code+' · '+r.asset_title:'Tidak terkait aset tertentu'],
      ['Risiko inheren',r.inherent_score+'/25 · '+LEVEL[r.inherent_level]],
      ['Risiko residual',r.residual_score===null?'Belum dinilai':
        r.residual_score+'/25 · '+LEVEL[r.residual_level]],
      ['Mitigasi',r.mitigation||'Belum dicatat'],['PIC',r.pic],
      ['Target',r.due_date],['Status',STATUS[r.status]],
      ['Revisi',r.revision],['Arsip',r.archived_at?'Diarsipkan':'Aktif'],
      ['Catatan',r.note||'—'],
    ]){
      const wrap=text('div','','ti-asset-detail-item');
      wrap.append(text('dt',name),text('dd',value));root.append(wrap);
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
