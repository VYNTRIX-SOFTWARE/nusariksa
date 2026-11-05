import {
  mayReadMaturity,mayWriteMaturity,modelDraft,domainDraft,criterionDraft,
  parseMaturityModels,parseMaturityVersions,parseMaturityRubric,rubricComplete,
  isMaturityId,
} from './maturity-model.js';

const $=id=>document.getElementById(id);
function create(tag,css,text){
  const x=document.createElement(tag);
  if(css)x.className=css;
  if(text!=null)x.textContent=String(text);
  return x;
}
function opt(text,value){
  const item=document.createElement('option');
  item.textContent=text;item.value=value;return item;
}

export function createMaturityManagement({api,getPermissions,onAuthFailure}){
  const state={
    models:null,modelId:null,versions:null,versionId:null,rubric:null,
    domainId:null,generation:0,busy:false,createOpen:false,
  };
  const readable=()=>mayReadMaturity(getPermissions());
  const writable=()=>mayWriteMaturity(getPermissions());
  const selectedDomain=()=>state.rubric?.domains.find(d=>d.id===state.domainId)??null;
  const draft=()=>state.rubric?.version.status==='draft';

  function notice(value,kind='info'){
    const box=$('maturity-message');box.hidden=!value;
    box.textContent=value??'';box.dataset.kind=kind;
  }
  function confirmLeave(){
    const dirty=[...document.querySelectorAll('#maturity-criteria-list textarea[data-level]')]
      .some(x=>x.value!==x.dataset.saved);
    return !dirty || window.confirm('Perubahan kriteria belum disimpan. Buang perubahan?');
  }
  function renderSelectors(){
    const models=$('maturity-model-select');
    models.replaceChildren(opt(state.models?'Pilih model':'Memuat model…',''));
    for(const m of state.models??[])models.add(opt(m.code+' · '+m.title,m.id));
    models.value=state.modelId??'';
    models.disabled=state.busy || !state.models?.length;
    const versions=$('maturity-version-select');
    versions.replaceChildren(opt(state.versions?'Pilih versi':'Memuat versi…',''));
    for(const v of state.versions??[])
      versions.add(opt('Versi '+v.version+' — '+(v.status==='published'?'Terbit':'Draft'),v.id));
    versions.value=state.versionId??'';
    versions.disabled=state.busy || !state.versions?.length;
  }
  function renderActions(){
    const allowWrite=writable();
    $('maturity-create-toggle').hidden=!allowWrite;
    $('maturity-create-form').hidden=!allowWrite||!state.createOpen;
    $('maturity-next-version').hidden=!allowWrite
      ||!state.versions?.length||state.versions[0].status!=='published';
    $('maturity-next-version').disabled=state.busy;
    $('maturity-publish').hidden=!allowWrite||!draft();
    $('maturity-publish').disabled=state.busy||!rubricComplete(state.rubric?.domains);
    $('maturity-refresh').disabled=state.busy;
    $('maturity-domain-form').hidden=!allowWrite||!draft()
      ||!state.rubric||state.rubric.domains.length>=30;
  }
  function renderRubric(){
    const root=$('maturity-rubric-content');
    root.hidden=!state.rubric;
    if(!state.rubric){
      $('maturity-domain-list').replaceChildren();
      $('maturity-criteria-list').replaceChildren();
      renderActions();return;
    }
    const {version,domains}=state.rubric;
    $('maturity-rubric-title').textContent=version.model_code+' · '+version.model_title+
      ' / v'+version.version;
    $('maturity-rubric-reference').textContent='Referensi metodologi: '+version.methodology_reference;
    $('maturity-version-state').textContent=version.status==='published'?'Terbit':'Draft';
    $('maturity-version-state').dataset.status=version.status;
    const complete=domains.filter(d=>d.levels.length===6
      &&new Set(d.levels.map(x=>x.level)).size===6).length;
    $('maturity-completeness').textContent=complete+' dari '+domains.length+
      ' domain memiliki enam kriteria level. '+
      (rubricComplete(domains)?'Rubrik lengkap dan dapat diterbitkan.':
        'Lengkapi semua domain sebelum publikasi.');
    $('maturity-domain-count').textContent=domains.length+' domain';
    const list=$('maturity-domain-list');
    list.replaceChildren();
    if(!domains.length)list.append(create('p','empty-note','Belum ada domain pada versi ini.'));
    for(const domain of domains){
      const button=create('button','maturity-domain-item');
      button.type='button';button.dataset.domainId=domain.id;
      button.classList.toggle('is-selected',domain.id===state.domainId);
      button.setAttribute('aria-pressed',String(domain.id===state.domainId));
      button.disabled=state.busy;
      button.append(create('strong','',domain.code),
        create('span','',domain.title),
        create('small','',domain.levels.length+'/6 kriteria'));
      list.append(button);
    }
    renderCriteria();
    renderActions();
  }
  function renderCriteria(){
    const domain=selectedDomain();
    const root=$('maturity-criteria-list');root.replaceChildren();
    $('maturity-domain-summary').textContent=domain
      ?domain.code+' · '+domain.title+(domain.description?' — '+domain.description:'')
      :'Pilih domain untuk menyusun kriteria.';
    if(!domain)return;
    for(let level=0;level<=5;level++){
      const present=domain.levels.find(x=>x.level===level);
      const form=create('form','maturity-criterion-form');
      form.dataset.level=String(level);
      const label=create('label','', 'Level '+level);
      label.htmlFor='maturity-level-'+level;
      const textarea=create('textarea');
      textarea.id='maturity-level-'+level;
      textarea.dataset.level=String(level);
      textarea.dataset.saved=present?.criterion??'';
      textarea.value=present?.criterion??'';
      textarea.rows=3;
      textarea.maxLength=2000;
      textarea.placeholder='Kriteria terukur untuk mencapai level '+level;
      textarea.readOnly=!writable()||!draft();
      form.append(label,textarea);
      if(writable()&&draft()){
        const save=create('button','button button-outline','Simpan Level '+level);
        save.type='submit';save.disabled=state.busy;
        form.append(save);
      }
      root.append(form);
    }
  }
  function render(){
    renderSelectors();renderRubric();renderActions();
  }
  function clear(){
    state.generation++;
    state.models=null;state.modelId=null;state.versions=null;
    state.versionId=null;state.rubric=null;state.domainId=null;
    state.busy=false;state.createOpen=false;
    $('maturity-create-form').reset();
    $('maturity-domain-form').reset();
    notice('');render();
  }
  function fail(error,fallback){
    if(onAuthFailure(error))return;
    const status=error?.status;
    notice(status===403?'Akses ke model maturitas ditolak.'
      :status===404?'Data tidak ditemukan. Muat ulang.'
      :status===409?'Versi/kriteria sudah berubah atau belum lengkap. Muat ulang sebelum mengulang.'
      :error instanceof TypeError?error.message
      :fallback,'error');
  }
  async function loadModels(preferredModel=state.modelId,preferredVersion=state.versionId,
    preferredDomain=state.domainId){
    if(!readable()||state.busy)return;
    const gen=++state.generation;
    state.models=null;state.versions=null;state.rubric=null;
    notice('');render();
    try{
      const result=parseMaturityModels(await api('/maturity-models'));
      if(gen!==state.generation||!readable())return;
      state.models=result;
      const chosen=result.find(x=>x.id===preferredModel)?.id??result[0]?.id??null;
      state.modelId=chosen;
      if(chosen)await selectModel(chosen,preferredVersion,preferredDomain);
      else{
        state.versions=[];state.versionId=null;state.rubric=null;
        render();
      }
    }catch(error){
      if(gen!==state.generation)return;
      state.models=null;state.modelId=null;state.versions=null;state.rubric=null;
      render();fail(error,'Gagal memuat daftar model maturitas.');
    }
  }
  async function selectModel(id,preferredVersion=null,preferredDomain=null){
    if(!readable()||state.busy||!isMaturityId(id)||
      !state.models?.some(x=>x.id===id))return;
    const gen=++state.generation;
    state.modelId=id;state.versions=null;state.versionId=null;state.rubric=null;
    state.domainId=null;notice('');render();
    try{
      const data=parseMaturityVersions(await api('/maturity-models/'+encodeURIComponent(id)+'/versions'));
      if(gen!==state.generation||!readable())return;
      state.versions=data;
      render();
      const chosen=data.find(v=>v.id===preferredVersion)?.id??data[0]?.id;
      if(chosen)await selectVersion(chosen,preferredDomain);
    }catch(error){
      if(gen!==state.generation)return;
      state.versions=null;state.versionId=null;state.rubric=null;
      render();fail(error,'Gagal memuat versi metodologi.');
    }
  }
  async function selectVersion(id,preferredDomain=null){
    if(!readable()||state.busy||!isMaturityId(id)
      ||!state.versions?.some(v=>v.id===id))return;
    const gen=++state.generation;
    state.versionId=id;state.rubric=null;state.domainId=null;
    notice('');render();
    try{
      const result=parseMaturityRubric(
        await api('/maturity-versions/'+encodeURIComponent(id)+'/domains'),id);
      if(gen!==state.generation||!readable())return;
      state.rubric=result;
      state.domainId=result.domains.find(x=>x.id===preferredDomain)?.id??
        result.domains[0]?.id??null;
      render();
    }catch(error){
      if(gen!==state.generation)return;
      state.rubric=null;render();fail(error,'Gagal memuat rubrik maturitas.');
    }
  }
  async function perform(action,after,success){
    if(!writable()||state.busy)return;
    const gen=state.generation;
    state.busy=true;renderActions();
    try{
      const data=await action();
      if(gen!==state.generation||!readable())return;
      state.busy=false;
      await after(data);
      if(readable())notice(success,'success');
    }catch(error){
      if(gen===state.generation)fail(error,'Gagal menyimpan perubahan metodologi.');
    }finally{
      state.busy=false;renderActions();
    }
  }
  $('maturity-refresh').addEventListener('click',()=>{
    if(confirmLeave())void loadModels();
  });
  $('maturity-model-select').addEventListener('change',event=>{
    if(!confirmLeave()){event.target.value=state.modelId??'';return;}
    void selectModel(event.target.value);
  });
  $('maturity-version-select').addEventListener('change',event=>{
    if(!confirmLeave()){event.target.value=state.versionId??'';return;}
    void selectVersion(event.target.value);
  });
  $('maturity-domain-list').addEventListener('click',event=>{
    const selected=event.target.closest?.('[data-domain-id]');
    if(!selected||!$('maturity-domain-list').contains(selected)||state.busy
      ||!confirmLeave())return;
    state.domainId=selected.dataset.domainId;
    renderRubric();
  });
  $('maturity-create-toggle').addEventListener('click',()=>{
    if(!writable())return;
    state.createOpen=!state.createOpen;
    renderActions();
    if(state.createOpen)$('maturity-model-code').focus();
  });
  $('maturity-create-form').addEventListener('submit',event=>{
    event.preventDefault();
    if(!writable())return;
    let data;
    try{data=modelDraft({
      code:$('maturity-model-code').value,title:$('maturity-model-title').value,
      methodologyReference:$('maturity-model-reference').value,
    });}catch(error){notice(error.message,'error');return;}
    void perform(()=>api('/maturity-models',{method:'POST',body:data}),
      async value=>{
        state.createOpen=false;$('maturity-create-form').reset();
        await loadModels(value.id,value.currentVersion.id);
      },'Model maturitas dibuat dengan versi Draft.');
  });
  $('maturity-domain-form').addEventListener('submit',event=>{
    event.preventDefault();
    if(!writable()||!draft())return;
    let data;
    try{data=domainDraft({
      code:$('maturity-domain-code').value,title:$('maturity-domain-title').value,
      description:$('maturity-domain-description').value,
    });}catch(error){notice(error.message,'error');return;}
    const id=state.versionId;
    void perform(()=>api('/maturity-versions/'+encodeURIComponent(id)+'/domains',
      {method:'POST',body:data}),async value=>{
        $('maturity-domain-form').reset();
        await selectVersion(id,value.id);
      },'Domain ditambahkan ke Draft.');
  });
  $('maturity-criteria-list').addEventListener('submit',event=>{
    const form=event.target.closest?.('form[data-level]');
    if(!form||!$('maturity-criteria-list').contains(form))return;
    event.preventDefault();
    if(!draft()||!writable())return;
    const level=Number(form.dataset.level),input=form.querySelector('textarea[data-level]');
    let criterion;
    try{criterion=criterionDraft(input.value);}catch(error){notice(error.message,'error');return;}
    const domainId=state.domainId,versionId=state.versionId;
    void perform(()=>api('/maturity-domains/'+encodeURIComponent(domainId)+'/levels/'+level,{
      method:'PUT',body:{criterion},
    }),async()=>selectVersion(versionId,domainId),'Kriteria Level '+level+' tersimpan.');
  });
  $('maturity-publish').addEventListener('click',()=>{
    if(!writable()||!draft()||!rubricComplete(state.rubric?.domains))return;
    if(!confirmLeave()||!window.confirm('Terbitkan metodologi? Seluruh domain dan kriterianya akan terkunci permanen.'))return;
    const modelId=state.modelId,versionId=state.versionId;
    void perform(()=>api('/maturity-versions/'+encodeURIComponent(versionId)+'/publish',{
      method:'POST',
    }),async()=>selectModel(modelId,versionId),'Versi metodologi telah diterbitkan.');
  });
  $('maturity-next-version').addEventListener('click',()=>{
    if(!writable()||state.versions?.[0]?.status!=='published')return;
    if(!confirmLeave()||!window.confirm('Buat Draft berikutnya dari metodologi terbit?'))return;
    const modelId=state.modelId;
    void perform(()=>api('/maturity-models/'+encodeURIComponent(modelId)+'/versions',{
      method:'POST',
    }),async value=>selectModel(modelId,value.id),'Draft versi berikutnya dibuat.');
  });
  return {
    load:loadModels,clear,confirmLeave,
    sync(){
      const allowed=readable();
      $('maturity-menu').hidden=!allowed;
      if(!allowed){clear();return;}
      renderActions();
    },
  };
}
