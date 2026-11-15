(function(root){
  'use strict';
  const VALUES=new Set(['PENDING','MATCH','MISMATCH','UNREADABLE']);
  const FOCUS=new Set(['NORMAL','REVIEW_PEMETAAN','PERIKSA_ANOMALI_REDAKSI','PERIKSA_TABEL_TERPECAH']);
  const SHA=/^[a-f0-9]{64}$/;
  const REFERENCE_SHA256='63868e2fe99a48485b17646618934c1fffb27b125811929e12bd70d170081e1b';
  function matchesReferenceCopy(sha){return typeof sha==='string'&&sha.toLowerCase()===REFERENCE_SHA256;}
  const DATE=/^\d{4}-\d{2}-\d{2}$/;
  const ID=/^(K[12]-I\d{3}|T3-I\d{3}-R[1-5])$/;
  const INVALID=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
  const PAGE=/^\d{1,4}$/;
  function fail(reason){throw new TypeError('Kertas kerja verifikasi tidak valid: '+reason);}
  function cleanText(v,max){return typeof v==='string'&&v.length<=max&&!INVALID.test(v);}
  function validDate(date){
    if(!DATE.test(date))return false;
    const d=new Date(date+'T00:00:00.000Z');
    return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===date;
  }
  function assertRow(r){
    if(!r||typeof r!=='object'||Array.isArray(r)||!ID.test(r.id)||
      !['INDIKATOR','KRITERIA_TABEL_3'].includes(r.jenis)||
      !FOCUS.has(r.prioritas)||!VALUES.has(r.verdict)||!cleanText(r.teks_draft,5000)||
      !cleanText(r.teks_sumber_diperiksa,10000)||!cleanText(r.catatan_review,4000)||
      !cleanText(r.reviewer,160)||!cleanText(r.catatan_sumber,3000)||
      !cleanText(r.halaman_fisik_pdf,4)||!cleanText(r.sha256_pdf_resmi,64)||
      !cleanText(r.url_sumber,2048)||!cleanText(r.tanggal_review,10))
      fail('struktur atau isi baris tidak sah');
    if(r.jenis==='INDIKATOR'&&(!/^K[12]-I\d{3}$/.test(r.id)||
      ![1,2].includes(r.kategori)||r.peringkat!==''))fail('identitas indikator tidak sah');
    if(r.jenis==='KRITERIA_TABEL_3'&&(!/^T3-I\d{3}-R[1-5]$/.test(r.id)||
      r.kategori!==''||r.peringkat<1||r.peringkat>5))fail('identitas kriteria tidak sah');
    const indicator=Number(r.id.match(/I(\d{3})/)[1]);
    if(r.indikator!==indicator||
      (r.jenis==='INDIKATOR'&&r.kategori===1&&indicator>80)||
      (r.jenis==='INDIKATOR'&&r.kategori===2&&indicator>60)||
      (r.jenis==='KRITERIA_TABEL_3'&&indicator>80))fail('nomor indikator tidak sah');
    if(r.jenis==='KRITERIA_TABEL_3'&&Number(r.id.slice(-1))!==r.peringkat)
      fail('nomor peringkat tidak cocok');
    if(r.verdict==='PENDING')return;
    if(!PAGE.test(r.halaman_fisik_pdf)||Number(r.halaman_fisik_pdf)<1||
      !r.teks_sumber_diperiksa.trim()||r.teks_sumber_diperiksa.trim().length<10||
      !r.reviewer.trim()||!validDate(r.tanggal_review)||
      !SHA.test(r.sha256_pdf_resmi)||
      !/^https:\/\/(?:www\.)?ojk\.go\.id\//i.test(r.url_sumber))
      fail('putusan review memerlukan halaman, teks sumber, reviewer, tanggal, hash PDF, dan tautan penerbit resmi');
    if(r.verdict==='MISMATCH'&&!r.catatan_review.trim())
      fail('perbedaan harus disertai catatan pemeriksaan');
  }
  function validateWorkpaper(input){
    if(!input||typeof input!=='object'||Array.isArray(input)||
      input.schemaVersion!==1||input.status!=='DRAFT_SOURCE_REVIEW_PENDING'||
      input.sourceAuthenticityVerified!==false||
      input.independentReviewCompleted!==false||input.productionEligible!==false||
      !Array.isArray(input.records)||input.records.length!==540||
      input.counts?.total!==540||
      input.counts?.kategori1!==80||input.counts?.kategori2!==60||
      input.counts?.kriteriaUnik!==400||input.counts?.verified!==0)
      fail('dokumen harus workpaper 540 baris yang belum dilepas untuk produksi');
    const seen=new Set();
    for(const r of input.records){
      assertRow(r);
      if(seen.has(r.id))fail('ID pemeriksaan ganda');
      seen.add(r.id);
    }
    for(const [k,size] of [[1,80],[2,60]]){
      for(let n=1;n<=size;n++)
        if(!seen.has('K'+k+'-I'+String(n).padStart(3,'0')))
          fail('indikator hilang');
    }
    for(let n=1;n<=80;n++)for(let rank=1;rank<=5;rank++)
      if(!seen.has('T3-I'+String(n).padStart(3,'0')+'-R'+rank))
        fail('kriteria hilang');
    return structuredClone(input);
  }
  function progress(input){
    const workpaper=validateWorkpaper(input);
    const counts={total:540,pending:0,match:0,mismatch:0,unreadable:0,priorityPending:0};
    for(const row of workpaper.records){
      counts[row.verdict.toLowerCase()]++;
      if(row.prioritas!=='NORMAL'&&row.verdict==='PENDING')counts.priorityPending++;
    }
    return counts;
  }
  function applyReview(input,id,fields){
    const copy=validateWorkpaper(input);
    const row=copy.records.find(item=>item.id===id);
    if(!row)fail('baris tidak ditemukan');
    const allowed=['verdict','halaman_fisik_pdf','teks_sumber_diperiksa','catatan_review',
      'reviewer','tanggal_review','sha256_pdf_resmi','url_sumber'];
    if(!fields||typeof fields!=='object'||Array.isArray(fields)||
      Object.keys(fields).some(key=>!allowed.includes(key)))fail('atribut isian tidak sah');
    for(const key of allowed)if(Object.hasOwn(fields,key))row[key]=fields[key];
    assertRow(row);
    // Putusan tetap merupakan review pribadi; tidak mengubah status regulatori.
    copy.sourceAuthenticityVerified=false;
    copy.independentReviewCompleted=false;
    copy.productionEligible=false;
    copy.counts.verified=0;
    return copy;
  }
  function orderedRows(input,focus='priority',state='all'){
    const source=validateWorkpaper(input);
    if(!['priority','all'].includes(focus)||!['all','PENDING','MATCH','MISMATCH','UNREADABLE'].includes(state))
      fail('filter tidak dikenal');
    const filtered=source.records.filter(row=>(focus==='all'||row.prioritas!=='NORMAL')
      &&(state==='all'||row.verdict===state));
    return filtered.sort((a,b)=>{
      const key=r=>r.prioritas==='PERIKSA_ANOMALI_REDAKSI'?0:
        r.prioritas==='REVIEW_PEMETAAN'?1:r.prioritas==='PERIKSA_TABEL_TERPECAH'?2:3;
      return key(a)-key(b)||a.id.localeCompare(b.id);
    }).map(row=>({id:row.id,kind:row.jenis,priority:row.prioritas,verdict:row.verdict}));
  }
  root.NusaRiksaSourceReview=Object.freeze({
    validateWorkpaper,progress,applyReview,orderedRows,matchesReferenceCopy,
  });
})(typeof window==='undefined'?globalThis:window);
