const $=id=>document.getElementById(id);
const MODULES=Object.freeze({
  findings:{title:'Temuan TI',page:'ti-findings',permission:'findings:read'},
  incidents:{title:'Insiden TI',page:'ti-incidents',permission:'incidents:read'},
  risks:{title:'Risiko TI',page:'ti-risks',permission:'risks:read'},
  vendors:{title:'Kontrak vendor',page:'ti-vendors',permission:'vendors:read'},
  recovery:{title:'Pemulihan TI',page:'ti-recovery',permission:'recovery:read'},
});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const node=(tag,value='',className='')=>{
  const element=document.createElement(tag);
  element.textContent=String(value??'');
  if(className)element.className=className;
  return element;
};
export function validateTiWorkOverview(data){
  if(!data||data.kind!=='TI_WORK_OVERVIEW'
    ||typeof data.generatedAt!=='string'||!Number.isFinite(Date.parse(data.generatedAt))
    ||!Array.isArray(data.modules)||data.modules.length>5
    ||!Array.isArray(data.items)||data.items.length>20
    ||typeof data.hasMore!=='boolean')
    throw new TypeError('Ringkasan pekerjaan TI tidak valid');
  const names=new Set();
  for(const group of data.modules){
    if(!group||!Object.hasOwn(MODULES,group.type)||names.has(group.type)
      ||!Number.isSafeInteger(group.count)||group.count<0)
      throw new TypeError('Kelompok pekerjaan tidak valid');
    names.add(group.type);
  }
  for(const item of data.items){
    if(!item||!names.has(item.type)||!UUID.test(item.id)
      ||!(item.relatedId===null||UUID.test(item.relatedId))
      ||typeof item.code!=='string'||item.code.length>40
      ||typeof item.title!=='string'||item.title.length>250
      ||typeof item.reason!=='string'||item.reason.length>180
      ||!Number.isInteger(item.priority)||item.priority<1||item.priority>10
      ||!(item.dueDate===null||typeof item.dueDate==='string'))
      throw new TypeError('Catatan pekerjaan tidak valid');
  }
  return data;
}
export function createTiWorkUI({api,getPermissions,onAuthFailure,onOpenRecord,onOpenModule}){
  const state={snapshot:null,request:0,loading:false,filter:'all'};
  const permitted=()=>Object.values(MODULES).some(x=>
    getPermissions().includes(x.permission));
  function visibleGroups(){
    return state.snapshot?.modules.filter(group=>
      getPermissions().includes(MODULES[group.type].permission))??[];
  }
  function render(){
    const groups=visibleGroups(),root=$('ti-work-groups');
    root.replaceChildren();
    for(const group of groups){
      const label=MODULES[group.type].title;
      const card=node('button','','ti-work-stat');
      card.type='button';card.dataset.type=group.type;
      card.setAttribute('aria-label',label+': '+group.count+' catatan, buka modul');
      card.append(node('strong',String(group.count)),node('span',label),
        node('small','Buka modul'));
      card.addEventListener('click',()=>onOpenModule(MODULES[group.type].page));
      root.append(card);
    }
    const select=$('ti-work-filter');
    const filter=state.filter;
    select.replaceChildren(new Option('Semua modul','all'));
    for(const group of groups)select.add(new Option(MODULES[group.type].title,group.type));
    if(filter!=='all'&&groups.some(g=>g.type===filter))select.value=filter;
    else{state.filter='all';select.value='all';}
    const list=$('ti-work-list');list.replaceChildren();
    const status=$('ti-work-status');
    if(state.loading){status.textContent='Memuat pekerjaan dari register TI…';return;}
    if(!state.snapshot){
      status.textContent='Ringkasan belum tersedia. Pilih Muat ulang untuk mencoba lagi.';return;
    }
    const items=state.snapshot.items.filter(item=>
      getPermissions().includes(MODULES[item.type].permission)
      &&(state.filter==='all'||item.type===state.filter));
    status.textContent=items.length
      ?items.length+' catatan perhatian ditampilkan'+
        (state.snapshot.hasMore?' dari antrean yang lebih besar.':' .')
      :'Belum ada catatan perhatian pada pilihan ini.';
    for(const item of items){
      const article=node('article','','ti-work-row');
      const body=node('div','','ti-work-content');
      body.append(node('span',MODULES[item.type].title+' · '+item.code,'ti-work-code'),
        node('strong',item.title),node('p',item.reason));
      if(item.dueDate&&item.type!=='incidents'&&item.type!=='recovery')
        body.append(node('small','Tanggal tercatat: '+String(item.dueDate).slice(0,10)));
      const action=node('button','Lihat detail','button button-outline');
      action.type='button';
      action.addEventListener('click',()=>onOpenRecord(item));
      article.append(body,action);list.append(article);
    }
    if(state.snapshot.hasMore){
      list.append(node('p',
        'Daftar ini menampilkan sebagian catatan prioritas. Gunakan tombol kelompok di atas untuk membuka seluruh register.',
        'workspace-help'));
    }
    const time=new Date(state.snapshot.generatedAt);
    $('ti-work-updated').textContent='Dihitung '+time.toLocaleString('id-ID',{
      timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'})+' WIB';
  }
  async function load(){
    if(!permitted())return;
    const seq=++state.request;state.loading=true;render();
    try{
      const data=validateTiWorkOverview(await api('/ti-work/overview'));
      if(seq!==state.request)return;
      state.snapshot=data;
    }catch(error){
      if(seq!==state.request)return;
      state.snapshot=null;
      if(onAuthFailure(error))return;
    }finally{
      if(seq===state.request){state.loading=false;render();}
    }
  }
  function clear(){
    ++state.request;state.snapshot=null;state.loading=false;state.filter='all';
    $('ti-work-updated').textContent='';
    render();
  }
  function sync(){
    const can=permitted();
    $('ti-work-refresh').disabled=!can||state.loading;
    $('ti-work-filter').disabled=!can||state.loading;
  }
  $('ti-work-refresh').addEventListener('click',()=>void load());
  $('ti-work-filter').addEventListener('change',()=>{
    state.filter=$('ti-work-filter').value;render();
  });
  sync();
  return {load,clear,sync};
}
