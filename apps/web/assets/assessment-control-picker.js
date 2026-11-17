// UUID v1-v8, case-insensitive; keep selection identifiers opaque.
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateControlLibrary(result){
  if(!result||result.catalogStatus!=='PUBLISHED_INTERNAL_REFERENCE'
    ||result.officialInstrument!==false||result.maxPerAssessment!==200
    ||!Array.isArray(result.controls)||result.controls.length<1
    ||result.controls.length>200)
    throw new TypeError('Pustaka kontrol belum tersedia dengan aman.');
  const seen=new Set();
  for(const item of result.controls){
    if(!item||!ID.test(item.id)||seen.has(item.id)
      ||typeof item.title!=='string'||!item.title.trim()
      ||typeof item.controlCode!=='string'||!item.controlCode.trim()
      ||typeof item.description!=='string'
      ||typeof item.sourceDocument!=='string'
      ||typeof item.sourceSection!=='string'
      ||!Number.isInteger(item.position)||item.position<1||item.position>200)
      throw new TypeError('Pustaka kontrol memuat data tidak konsisten.');
    seen.add(item.id);
  }
  return result.controls;
}
export function validateSelection(available,selectedIds){
  if(!Array.isArray(available)||!Array.isArray(selectedIds)
    ||selectedIds.length<1||selectedIds.length>200
    ||new Set(selectedIds).size!==selectedIds.length
    ||selectedIds.some(id=>!available.some(item=>item.id===id)))
    throw new TypeError('Centang minimal satu kontrol yang tersedia.');
  return selectedIds;
}
function node(tag,cls='',value=''){
  const e=document.createElement(tag);
  if(cls)e.className=cls;
  if(value)e.textContent=value;
  return e;
}
/**
 * Render all available controls with independent selection state. Filtering is
 * only a view; it never removes hidden selections.
 */
export function createControlPicker({root,count,search,selectAll,clearAll}){
  let available=[],initialized=false;
  function selectedIds(){
    return Array.from(root.querySelectorAll('input[type=checkbox]:checked'),
      item=>item.value);
  }
  function sync(){
    count.textContent=available.length
      ?selectedIds().length+' dari '+available.length+' kontrol dipilih'
      :'Belum ada pustaka kontrol yang dimuat.';
  }
  function filter(){
    const query=search.value.trim().toLocaleLowerCase('id-ID');
    for(const row of root.querySelectorAll('[data-control-picker-item]')){
      const match=!query||row.dataset.searchText.includes(query);
      row.hidden=!match;
    }
  }
  function load(items){
    if(!Array.isArray(items)||items.length<1||items.length>200)
      throw new TypeError('Katalog belum tersedia.');
    const ids=new Set();
    for(const item of items){
      if(!ID.test(item.id)||ids.has(item.id)||typeof item.title!=='string')
        throw new TypeError('Data pilihan kontrol tidak valid.');
      ids.add(item.id);
    }
    available=items;root.replaceChildren();
    for(const item of items){
      const row=node('label','assessment-control-choice');
      row.dataset.controlPickerItem='';
      row.dataset.searchText=(item.controlCode+' '+item.title+' '+(item.description||'')+
        ' '+(item.sourceSection||'')).toLocaleLowerCase('id-ID');
      const cb=node('input');cb.type='checkbox';cb.value=item.id;cb.checked=true;
      const wrap=node('span');
      const heading=node('strong','',item.controlCode+' · '+item.title);
      const source=node('small','',item.sourceDocument&&item.sourceSection
        ?item.sourceDocument+' · '+item.sourceSection
        :'Kontrol internal; periksa sumber referensi');
      wrap.append(heading,source);row.append(cb,wrap);
      root.append(row);
    }
    initialized=true;sync();filter();
  }
  root.addEventListener('change',sync);
  search.addEventListener('input',filter);
  selectAll.addEventListener('click',()=>{
    for(const row of root.querySelectorAll('[data-control-picker-item]')){
      if(!row.hidden)row.querySelector('input').checked=true;
    }
    sync();
  });
  clearAll.addEventListener('click',()=>{
    for(const row of root.querySelectorAll('[data-control-picker-item]')){
      if(!row.hidden)row.querySelector('input').checked=false;
    }
    sync();
  });
  function reset(){available=[];initialized=false;root.replaceChildren();search.value='';sync();}
  reset();
  return {load,reset,ready:()=>initialized,selectedIds:()=>validateSelection(available,selectedIds()),
    count:()=>selectedIds().length};
}
