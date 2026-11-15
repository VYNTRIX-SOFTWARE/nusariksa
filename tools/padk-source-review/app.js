(function(){
  'use strict';
  const core=window.NusaRiksaSourceReview;
  const $=id=>document.getElementById(id);
  let workpaper=null,selected='',pdfUrl=null,pdfSha='',visible=[];
  const get=id=>$(id).value;
  function notify(value,kind='success'){
    $('message').textContent=value;
    $('message').dataset.kind=kind;
  }
  function drawProgress(){
    if(!workpaper){$('progress').textContent='0 / 540';$('progress-details').textContent='Impor workpaper untuk mulai.';return;}
    const p=core.progress(workpaper);
    $('progress').textContent=(p.total-p.pending)+' / '+p.total;
    $('progress-details').textContent=p.pending+' belum diperiksa; '+p.match+
      ' cocok menurut petugas; '+p.mismatch+' berbeda; '+p.unreadable+
      ' tidak terbaca; '+p.priorityPending+' perhatian khusus belum diperiksa.';
  }
  function current(){
    return workpaper?.records.find(row=>row.id===selected)??null;
  }
  function redrawList(keep=true){
    if(!workpaper){$('row-select').replaceChildren();$('row-select').disabled=true;return;}
    visible=core.orderedRows(workpaper,get('focus-filter'),get('status-filter'));
    const choice=keep&&visible.some(x=>x.id===selected)?selected:(visible[0]?.id??'');
    $('row-select').replaceChildren();
    for(const row of visible){
      const option=document.createElement('option');
      option.value=row.id;
      option.textContent=row.id+' · '+row.priority.replaceAll('_',' ').toLowerCase()+
        ' · '+row.verdict;
      $('row-select').append(option);
    }
    selected=choice;
    $('row-select').disabled=!visible.length;
    if(selected)$('row-select').value=selected;
    drawRow();
    drawProgress();
  }
  function drawRow(){
    const row=current();
    $('review-form').hidden=!row;
    if(!row){$('row-context').textContent='Tidak ada baris pada filter ini.';
      $('row-summary').textContent='Ubah filter untuk melihat baris lain.';
      $('row-status').textContent='—';return;}
    $('row-context').textContent=row.jenis+' · '+(row.kategori?('Kategori '+row.kategori+' · '):'')+
      'Nomor '+row.indikator+(row.peringkat?' · Peringkat '+row.peringkat:'')+
      ' · Prioritas: '+row.prioritas+
      (row.catatan_sumber?' · Catatan sumber yang perlu diperiksa: '+row.catatan_sumber:'');
    $('row-summary').textContent=row.teks_draft;
    $('row-status').textContent=row.verdict;
    $('verdict').value=row.verdict;
    $('physical-page').value=row.halaman_fisik_pdf;
    $('source-text').value=row.teks_sumber_diperiksa;
    $('review-note').value=row.catatan_review;
    $('reviewer').value=row.reviewer;
    $('review-date').value=row.tanggal_review;
    $('source-sha').value=row.sha256_pdf_resmi||pdfSha;
    $('source-url').value=row.url_sumber;
    const physical=Number(row.halaman_fisik_pdf);
    if(Number.isSafeInteger(physical)&&physical>0){
      $('page-input').value=String(physical);
      if(pdfUrl)displayPage();
    }
  }
  function displayPage(){
    if(!pdfUrl)return;
    const number=Number(get('page-input'));
    if(!Number.isSafeInteger(number)||number<1){
      notify('Nomor halaman fisik harus bilangan bulat positif.','error');return;
    }
    $('pdf-frame').src=pdfUrl+'#page='+number;
  }
  function downloadProgress(){
    if(!workpaper)return;
    try{
      const checked=core.validateWorkpaper(workpaper);
      const blob=new Blob([JSON.stringify(checked,null,2)+'\n'],{type:'application/json'});
      const url=URL.createObjectURL(blob);
      const link=document.createElement('a');
      link.href=url;link.download='padk-verifikasi-sumber-progres.json';
      document.body.append(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      notify('Progres diunduh sebagai JSON lokal. Simpan di lokasi privat.');
    }catch(err){notify(err.message,'error');}
  }
  $('workpaper-file').addEventListener('change',async()=>{
    const file=$('workpaper-file').files?.[0];
    if(!file)return;
    try{
      if(file.size>15000000)throw new TypeError('Workpaper melebihi batas 15 MB.');
      const parsed=JSON.parse(await file.text());
      workpaper=core.validateWorkpaper(parsed);
      selected='';$('download-progress').disabled=false;
      redrawList(false);
      notify('Workpaper valid dimuat secara lokal. Belum ada persetujuan regulatori.');
    }catch(error){
      workpaper=null;selected='';visible=[];
      $('download-progress').disabled=true;
      redrawList(false);drawProgress();
      notify('Gagal memuat workpaper: '+error.message,'error');
    }
  });
  $('pdf-file').addEventListener('change',async()=>{
    const file=$('pdf-file').files?.[0];
    if(!file)return;
    try{
      if(file.size>80000000)throw new TypeError('PDF melebihi batas 80 MB.');
      if((await file.slice(0,5).text())!=='%PDF-')
        throw new TypeError('Berkas tidak memiliki header PDF.');
      if(pdfUrl)URL.revokeObjectURL(pdfUrl);
      pdfUrl=URL.createObjectURL(file);
      pdfSha='';
      $('pdf-digest').textContent='Menghitung SHA-256 PDF lokal…';
      $('pdf-frame').hidden=false;
      $('pdf-placeholder').hidden=true;
      $('open-page').disabled=false;
      displayPage();
      if(typeof crypto==='undefined'||!crypto.subtle)throw new TypeError('Browser tidak mendukung penghitungan SHA-256 di halaman ini. Buka melalui localhost atau gunakan sha256sum.');
      const bytes=await file.arrayBuffer();
      const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
      pdfSha=Array.from(hash,b=>b.toString(16).padStart(2,'0')).join('');
      const matches=core.matchesReferenceCopy(pdfSha);
      $('pdf-digest').textContent='SHA-256 file lokal: '+pdfSha+
        ' (bukan verifikasi keaslian OJK)';
      $('reference-match').textContent=matches
        ?'PDF identik secara SHA-256 dengan salinan referensi NusaRiksa. Keaslian penerbit tetap memerlukan pemeriksaan terpisah.'
        :'PDF berbeda dari salinan referensi NusaRiksa. Periksa versi dan asal dokumen sebelum membandingkan atau menggabungkan hasil pemeriksaan.';
      $('reference-match').dataset.kind=matches?'match':'different';
      if(current()&&!current().sha256_pdf_resmi)$('source-sha').value=pdfSha;
      notify('PDF lokal siap. Cocokkan sumber dengan dokumen dari penerbit resmi secara manual.');
    }catch(error){
      $('pdf-digest').textContent='Hash belum tersedia. '+error.message;
      $('reference-match').textContent='Identitas salinan belum dapat diperiksa.';
      $('reference-match').dataset.kind='unknown';
      notify('PDF dipilih, tetapi perlu pemeriksaan: '+error.message,'error');
    }
  });
  $('focus-filter').addEventListener('change',()=>redrawList(false));
  $('status-filter').addEventListener('change',()=>redrawList(false));
  $('row-select').addEventListener('change',()=>{selected=get('row-select');drawRow();});
  $('open-page').addEventListener('click',displayPage);
  $('download-progress').addEventListener('click',downloadProgress);
  $('review-form').addEventListener('submit',event=>{
    event.preventDefault();
    if(!workpaper||!selected)return;
    try{
      workpaper=core.applyReview(workpaper,selected,{
        verdict:get('verdict'),
        halaman_fisik_pdf:get('physical-page'),
        teks_sumber_diperiksa:get('source-text'),
        catatan_review:get('review-note'),
        reviewer:get('reviewer'),
        tanggal_review:get('review-date'),
        sha256_pdf_resmi:get('source-sha').trim().toLowerCase(),
        url_sumber:get('source-url').trim(),
      });
      // Jika filter menyembunyikan status yang baru disimpan, arahkan ke baris relevan lain.
      redrawList(true);
      notify('Catatan tersimpan hanya dalam memori tab. Unduh progres JSON untuk mempertahankannya.');
    }catch(error){notify(error.message,'error');}
  });
  $('next-row').addEventListener('click',()=>{
    if(!visible.length)return;
    const idx=visible.findIndex(row=>row.id===selected);
    const next=visible[(idx+1)%visible.length];
    if(next){selected=next.id;$('row-select').value=next.id;drawRow();}
  });
  window.addEventListener('beforeunload',()=>{if(pdfUrl)URL.revokeObjectURL(pdfUrl);});
  drawProgress();
})();
