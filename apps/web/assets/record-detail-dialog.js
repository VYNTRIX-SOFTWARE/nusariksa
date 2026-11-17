/**
 * Presents operational register details in a focused, accessible modal rather
 * than appending a long detail panel below the record list.
 */
export function mountRecordDetailDialog(detailId){
  const panel=document.getElementById(detailId);
  if(!panel)throw new TypeError('Detail register tidak tersedia');
  let titleId=panel.getAttribute('aria-labelledby');
  if(!titleId){
    const heading=panel.querySelector('h2');
    if(!heading)throw new TypeError('Judul detail register tidak tersedia');
    titleId=detailId+'-dialog-heading';
    heading.id=titleId;
    panel.setAttribute('aria-labelledby',titleId);
  }
  const wrapper=document.createElement('dialog');
  wrapper.className='nr-record-detail-dialog';
  wrapper.setAttribute('aria-labelledby',titleId);
  wrapper.dataset.recordDetailId=detailId;
  const close=document.createElement('button');
  close.type='button';close.className='nr-record-detail-close';
  close.setAttribute('aria-label','Tutup detail');
  close.textContent='Tutup';
  close.addEventListener('click',()=>wrapper.close());
  // Reparent only once: the original element, IDs, events and state survive.
  panel.before(wrapper);
  wrapper.append(close,panel);
  function show(){
    if(panel.hidden)return false;
    if(!wrapper.open)wrapper.showModal();
    close.focus({preventScroll:true});
    return true;
  }
  return {show,close:()=>{if(wrapper.open)wrapper.close();},
    isOpen:()=>wrapper.open};
}
