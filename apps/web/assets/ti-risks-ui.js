const $=id=>document.getElementById(id);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEVEL={low:'Rendah',medium:'Sedang',high:'Tinggi',critical:'Kritis'};
const STATUS={open:'Teridentifikasi',mitigating:'Dalam mitigasi',
  monitoring:'Pemantauan',closed:'Ditutup'};
export function validateRiskReference(row){
  if(!row||typeof row.id!=='string'||!/^[A-Z][A-Z0-9_]{2,63}$/.test(row.id)
    ||typeof row.group!=='string'||!row.group.trim()
    ||typeof row.title!=='string'||!row.title.trim()
    ||typeof row.scenario!=='string'||!row.scenario.trim()
    ||typeof row.review!=='string'||typeof row.controls!=='string'
    ||typeof row.version!=='string'
    ||!['pending','not_applicable','adopted'].includes(row.state))
    throw new TypeError('Referensi risiko dari database tidak valid');
  return row;
}
export const riskExampleById=(id,entries=[])=>entries.find(x=>x.id===id)??null;
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
  const state={risks:[],assets:[],references:[],selected:null,loaded:false,busy:false,
    offset:0,more:false,request:0,detailRequest:0};
  const canRead=()=>getPermissions().includes('risks:read');
  const canWrite=()=>getPermissions().includes('risks:write');
  function message(value,kind='info'){
    const n=$('ti-risks-message');n.textContent=value??'';n.hidden=!value;n.dataset.kind=kind;
  }
  function populateReferenceInputs(){
    const examples=$('ti-risk-example');
    const previous=examples.value;
    examples.replaceChildren(new Option('Tulis sendiri tanpa contoh',''));
    const groupLookup=new Map();
    for(const ref of state.references.filter(x=>x.state==='pending')){
      if(!groupLookup.has(ref.group)){
        const group=document.createElement('optgroup');
        group.label=ref.group;groupLookup.set(ref.group,group);
        examples.append(group);
      }
      groupLookup.get(ref.group).append(new Option(ref.title,ref.id));
    }
    examples.value=[...examples.options].some(o=>o.value===previous)?previous:'';
    const groupFilter=$('ti-risk-reference-group'),oldGroup=groupFilter.value;
    groupFilter.replaceChildren(new Option('Semua kelompok','all'));
    for(const group of [...new Set(state.references.map(x=>x.group))].sort())
      groupFilter.add(new Option(group,group));
    groupFilter.value=[...groupFilter.options].some(o=>o.value===oldGroup)?oldGroup:'all';
  }
  function showRiskPane(pane){
    const references=pane==='references';
    $('ti-risk-reference-panel').hidden=!references;
    $('ti-risks-register-panel').hidden=references;
    $('ti-risks-show-references').setAttribute('aria-pressed',String(references));
    $('ti-risks-show-register').setAttribute('aria-pressed',String(!references));
  }
  function fillReferenceDraft(reference){
    if(!reference||!canWrite())return;
    setForm(null);
    $('ti-risk-example').value=reference.id;
    $('ti-risk-title').value=reference.title;
    $('ti-risk-scenario').value=reference.scenario;
    $('ti-risk-code').value='RSK-'+reference.id;
    $('ti-risk-code-hint').textContent='Kode disarankan dari referensi. Sesuaikan jika sudah dipakai di lembaga.';
    $('ti-risks-form').dataset.referenceCode=reference.id;
    $('ti-risk-example-hint').textContent='Draft dari database disiapkan. Tentukan kemungkinan, dampak, PIC, target dan mitigasi berdasarkan kondisi lembaga.';
  }
  function renderReferenceCatalog(){
    const term=$('ti-risk-reference-search').value.trim().toLocaleLowerCase('id-ID');
    const group=$('ti-risk-reference-group').value;
    const filtered=state.references.filter(r=>
      (group==='all'||r.group===group)&&
      (!term||[r.title,r.scenario,r.group,r.review,r.controls,r.id].some(v=>
        v.toLocaleLowerCase('id-ID').includes(term))));
    $('ti-risk-reference-count').textContent=filtered.length+' dari '+state.references.length+' referensi';
    const root=$('ti-risk-reference-list');root.replaceChildren();
    if(!filtered.length)root.append(text('p','Tidak ada referensi yang sesuai. Coba kata kunci atau kelompok lain.','risk-reference-empty'));
    for(const ref of filtered){
      const card=text('article','','risk-reference-item');
      card.append(text('span',ref.group+' · '+ref.id+' · v'+ref.version,'risk-reference-meta'),
        text('h3',ref.title),text('p',ref.scenario));
      const dl=text('dl','');
      for(const [label,description] of [
        ['Hal yang perlu diperiksa',ref.review],
        ['Contoh opsi pengendalian',ref.controls],
      ]){
        const row=text('div','');
        row.append(text('dt',label),text('dd',description));dl.append(row);
      }
      card.append(dl,text('span',
        ref.state==='pending'?'Belum dinilai oleh lembaga':
          ref.state==='adopted'?'Sudah dicatat sebagai risiko lembaga':'Ditandai tidak relevan',
        'risk-reference-status'));
      if(canWrite()){
        if(ref.state==='pending'){
          const button=text('button','Nilai dan catat','button button-outline');
          button.type='button';button.addEventListener('click',()=>fillReferenceDraft(ref));
          card.append(button);
        }else if(ref.state==='not_applicable'){
          const back=text('button','Kembalikan ke daftar awal','button button-outline');
          back.type='button';
          back.addEventListener('click',()=>void changeStarterState(ref.id,'pending'));
          card.append(back);
        }
      }
      root.append(card);
    }
  }
  function renderStarterRegister(){
    const root=$('ti-risk-starting-list');root.replaceChildren();
    const pending=state.references.filter(r=>r.state==='pending');
    $('ti-risk-starting-count').textContent=pending.length+' belum dinilai · '+
      state.references.filter(r=>r.state==='adopted').length+' telah dicatat · '+
      state.references.filter(r=>r.state==='not_applicable').length+' tidak relevan';
    if(!state.loaded){
      root.append(text('p','Memuat daftar awal dari database…','risk-field-help'));return;
    }
    if(!pending.length){
      root.append(text('p','Semua referensi awal sudah ditinjau. Gunakan Referensi Risiko TI untuk mengaktifkan kembali yang tidak relevan bila kondisi berubah.','risk-field-help'));
    }
    for(const ref of pending){
      const row=text('article','','risk-starting-item');
      const title=text('div','','risk-starting-content');
      title.append(text('span',ref.group+' · '+ref.id,'risk-record-code'),
        text('strong',ref.title),text('p',ref.scenario));
      row.append(title);
      if(canWrite()){
        const actions=text('div','','risk-starting-actions');
        const assess=text('button','Nilai dan catat','button button-outline');
        assess.type='button';assess.addEventListener('click',()=>fillReferenceDraft(ref));
        const dismiss=text('button','Tidak relevan','button button-ghost');
        dismiss.type='button';
        dismiss.addEventListener('click',()=>void changeStarterState(ref.id,'not_applicable'));
        actions.append(assess,dismiss);row.append(actions);
      }
      root.append(row);
    }
  }
  async function changeStarterState(code,next){
    if(state.busy||!canWrite())return;
    if(next==='not_applicable'&&!window.confirm(
      'Tandai referensi sebagai tidak relevan untuk lembaga ini? Referensi tidak dihapus dan bisa dikembalikan.'))return;
    state.busy=true;sync();
    try{
      await api('/risks/starter/'+encodeURIComponent(code)+'/state',{
        method:'POST',body:{state:next},
      });
      await load({resetOffset:false});
      message(next==='pending'?'Referensi dikembalikan ke daftar awal.':
        'Referensi ditandai tidak relevan.','success');
    }catch(error){if(!onAuthFailure(error))message('Gagal mengubah status referensi. Muat ulang.','error');}
    finally{state.busy=false;sync();}
  }
  function sync(){
    renderReferenceCatalog();
    renderStarterRegister();
    $('ti-risks-create').hidden=!canWrite();
    $('ti-risks-save').disabled=state.busy||!canWrite();
    $('ti-risks-edit').hidden=!state.selected||!!state.selected.archived_at||!canWrite();
    $('ti-risks-archive').hidden=!state.selected||!!state.selected.archived_at||!canWrite();
    $('ti-risks-archive').disabled=state.busy;
  }
  function clear(){
    ++state.request;++state.detailRequest;
    state.risks=[];state.assets=[];state.references=[];state.selected=null;state.loaded=false;
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
    $('ti-risk-reference-search').value='';
    $('ti-risk-reference-group').value='all';
    showRiskPane('register');
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
        'Belum ada risiko yang dinilai dan disimpan. Daftar awal dari database tersedia di atas.';
    if(!state.risks.length){
      const empty=text('div','','risk-empty-state');
      empty.append(text('strong',hasRiskFilters()?'Tidak ada hasil pencarian':'Belum ada risiko tercatat'),
        text('p',hasRiskFilters()?'Sesuaikan pencarian atau gunakan Reset filter.':
          'Gunakan daftar awal di atas untuk mengisi risiko tanpa mengetik ulang seluruh skenario.'));
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
      const [data,referenceData]=await Promise.all([
        api('/risks?'+params),api('/risks/starter'),
        state.assets.length?Promise.resolve():loadAssetOptions(),
      ]);
      if(token!==state.request)return;
      if(!data||!Array.isArray(data.risks)||data.risks.length>50
        ||typeof data.hasMore!=='boolean'
        ||!referenceData||!Array.isArray(referenceData.references)
        ||referenceData.references.length>200)throw new TypeError('Invalid list');
      state.risks=data.risks.map(validateRiskResponse);state.more=data.hasMore;
      state.references=referenceData.references.map(validateRiskReference);
      populateReferenceInputs();
    }catch(e){
      if(token!==state.request)return;
      state.risks=[];state.more=false;
      if(!onAuthFailure(e))message('Gagal mengambil register risiko.','error');
    }finally{if(token===state.request){state.loaded=true;render();sync();}}
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
    form.dataset.referenceCode='';
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
    $('ti-risks-detail').hidden=false;showRiskPane('register');sync();
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
  $('ti-risks-show-references').addEventListener('click',()=>showRiskPane('references'));
  $('ti-risks-show-register').addEventListener('click',()=>showRiskPane('register'));
  $('ti-risk-reference-search').addEventListener('input',renderReferenceCatalog);
  $('ti-risk-reference-group').addEventListener('change',renderReferenceCatalog);
  $('ti-risk-example').addEventListener('change',()=>{
    const example=riskExampleById($('ti-risk-example').value,state.references);
    $('ti-risk-example-hint').textContent=example?
      'Contoh: '+example.scenario+' Pilih Gunakan contoh jika sesuai.':
      'Pilih contoh bila relevan, lalu gunakan dan sesuaikan berdasarkan kondisi lembaga.';
  });
  $('ti-risk-use-example').addEventListener('click',()=>{
    const chosen=riskExampleById($('ti-risk-example').value,state.references);
    if(!chosen){$('ti-risk-example').focus();return;}
    if(($('ti-risk-title').value.trim()||$('ti-risk-scenario').value.trim())&&
      !window.confirm('Ganti judul dan skenario saat ini dengan contoh? Nilai risiko dan aset terkait tidak berubah.'))return;
    $('ti-risk-title').value=chosen.title;
    $('ti-risk-scenario').value=chosen.scenario;
    $('ti-risk-code').value='RSK-'+chosen.id;
    $('ti-risks-form').dataset.referenceCode=chosen.id;
    $('ti-risk-example-hint').textContent='Contoh dari database diterapkan. Sesuaikan, lalu isi seluruh nilai faktual lembaga.';
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
      const source=$('ti-risks-form').dataset.referenceCode;
      const record=validateRiskResponse(await api(id?'/risks/'+id:'/risks',{
        method:id?'PATCH':'POST',body:id
          ?{...data,expectedRevision:Number($('ti-risks-form').dataset.revision)}
          :source?{...data,referenceCode:source}:data,
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
  showRiskPane('register');sync();return {load,clear,sync};
}
