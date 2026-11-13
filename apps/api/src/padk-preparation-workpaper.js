import {userHasPermission} from './authorization.js';
import {getPadkPreparation,PadkPreparationError} from './padk-preparations.js';
import {getPadkSavedScorePreview} from './padk-saved-score-preview.js';
import {padkDraftReviewHistory} from './padk-draft-review.js';
import {makeProfessionalPadkDraftPdf} from './padk-professional-workpaper-pdf.js';


function clean(value){
  return String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^\x20-\x7e]/g,' ').replace(/\s+/g,' ').trim();
}
function wrap(value,width=89){
  const text=clean(value);
  if(!text)return ['(tidak diisi)'];
  const words=text.split(' '),lines=[];let line='';
  for(let word of words){
    while(word.length>width){
      if(line){lines.push(line);line='';}
      lines.push(word.slice(0,width));word=word.slice(width);
    }
    if(!word)continue;
    if(line.length+word.length+1>width){lines.push(line);line=word;}
    else line+=(line?' ':'')+word;
  }
  if(line)lines.push(line);
  return lines;
}
function pdfEsc(s){
  return s.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
}
export function makeDraftWorkpaperPdf(lines,footerLabel='DRAFT - BUKAN HASIL PENILAIAN PADK / BUKAN LAPORAN FINAL'){
  if(!Array.isArray(lines)||lines.some(x=>typeof x!=='string'))
    throw new TypeError('Invalid workpaper lines');
  const perPage=53,sections=[];
  for(let i=0;i<lines.length;i+=perPage)sections.push(lines.slice(i,i+perPage));
  if(!sections.length)sections.push([]);
  const objects=[];
  const add=s=>{objects.push(s);return objects.length;};
  const root=add(''),pages=add(''),font=add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
  const ids=[];
  for(let page=0;page<sections.length;page++){
    const stream=[
      'BT /F1 9 Tf 12 TL 38 790 Td',
      ...sections[page].flatMap((text,i)=>[
        '('+pdfEsc(clean(text))+') Tj',
        'T*',
      ]),
      'ET',
      'BT /F1 8 Tf 40 30 Td',
      '('+pdfEsc(clean(footerLabel)+
        ' | Halaman '+(page+1)+' dari '+sections.length)+') Tj',
      'ET',
    ].join('\n');
    const bytes=Buffer.from(stream,'latin1');
    const content=add('<< /Length '+bytes.length+' >>\nstream\n'+stream+'\nendstream');
    const id=add('<< /Type /Page /Parent '+pages+' 0 R /MediaBox [0 0 595 842] '+
      '/Resources << /Font << /F1 '+font+' 0 R >> >> /Contents '+content+' 0 R >>');
    ids.push(id);
  }
  objects[root-1]='<< /Type /Catalog /Pages '+pages+' 0 R >>';
  objects[pages-1]='<< /Type /Pages /Kids ['+ids.map(id=>id+' 0 R').join(' ')+
    '] /Count '+ids.length+' >>';
  const parts=['%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'];
  let offset=Buffer.byteLength(parts[0],'latin1'),locations=[0];
  for(let i=0;i<objects.length;i++){
    locations.push(offset);
    const body=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';
    parts.push(body);offset+=Buffer.byteLength(body,'latin1');
  }
  const xref=offset;
  parts.push('xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n');
  for(let i=1;i<locations.length;i++)
    parts.push(String(locations[i]).padStart(10,'0')+' 00000 n \n');
  parts.push('trailer\n<< /Size '+(objects.length+1)+' /Root '+root+
    ' 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
  return Buffer.from(parts.join(''),'latin1');
}
export function linesOfWorkpaper({institution,preparation,items,generatedAt,preview,review,evidence}){
  const count=preparation.category===1?80:60;
  const lines=[
    'NUSARIKSA - RINGKASAN PENILAIAN DAN KERTAS KERJA (DRAFT)',
    'DRAFT - BUKAN HASIL PENILAIAN REGULASI / BUKAN LAPORAN FINAL',
    '',
    'Lembaga: '+clean(institution.name)+' ('+clean(institution.kind)+')',
    'Judul: '+clean(preparation.title),
    'Kategori: '+preparation.category+'  |  Periode: '+preparation.periodStart+' s.d. '+preparation.periodEnd,
    'ID penilaian: '+preparation.id,
    'Dicetak (UTC): '+generatedAt,
    'Indikator dengan catatan: '+items.length+' dari '+count,
    'Jumlah bukti aktual: '+evidence.length+' file (tidak dilampirkan ke PDF)',
    '',
    'PERINGATAN: HASIL SIMULASI INTERNAL, BUKAN LAPORAN RESMI PADK/OJK.',
    'Teks kriteria, pemetaan dan kebijakan pembulatan belum diverifikasi.',
    'Data ini tidak membuktikan kepatuhan regulasi dan tidak boleh dilaporkan.',
    '',
    'I. PROGRES DAN KOMPOSIT SIMULASI',
    'Progres: '+preview.ratedIndicators+' / '+preview.requiredIndicators+' indikator',
    'Status instrumen: DRAFT_UNVERIFIED; rounding: UNVERIFIED',
  ];
  for(const domain of preview.domains){
    lines.push(...wrap(
      domain.name+' ('+domain.weightPercent+'%): '+domain.ratedIndicators+'/'+
      domain.requiredIndicators+' indikator; '+(domain.complete
        ?'rata-rata '+domain.averageRank.toFixed(3)+
          ', kontribusi '+domain.contribution.toFixed(3)
        :'belum lengkap, belum ada rata-rata domain'),
    ));
  }
  if(preview.complete){
    lines.push('Komposit SIMULASI: '+preview.compositePreview.valueTwoDecimals+
      ' | Peringkat SIMULASI: '+preview.compositePreview.rank+
      ' ('+preview.compositePreview.label+')');
  }else lines.push('Komposit SIMULASI: BELUM TERSEDIA - seluruh indikator belum lengkap.');
  lines.push('Kalkulasi menggunakan peta DRAFT; TIDAK BERLAKU untuk pelaporan resmi.');
  lines.push('');
  lines.push('II. PEMERIKSAAN DRAFT INTERNAL (BUKAN PERSETUJUAN PADK)');
  lines.push('Status: '+review.status+' | Siklus: '+review.submissionCycle);
  lines.push('Status draft_accepted hanya berarti kelengkapan draft telah diperiksa.');
  lines.push('Tidak ada approval regulatory maupun PDF final yang dapat diterbitkan.');
  for(const event of review.events){
    lines.push(...wrap(
      'Siklus '+event.submission_cycle+' | '+event.action+' | '+
      event.occurred_at+' | reviewer/petugas '+event.actor_user_id,
    ));
    if(event.note)lines.push(...wrap('Catatan pemeriksa: '+event.note));
  }
  if(!review.events.length)lines.push('Belum ada riwayat submit atau pemeriksaan.');
  lines.push('');
  lines.push('III. JAWABAN PER INDIKATOR DAN INVENTARIS BUKTI');
  const byNumber=new Map();
  for(const file of evidence){
    const number=Number(file.indicator_number);
    if(!byNumber.has(number))byNumber.set(number,[]);
    byNumber.get(number).push(file);
  }
  for(const item of items){
    lines.push('-'.repeat(90));
    lines.push('INDIKATOR '+String(item.indicator_number).padStart(2,'0')+'  |  Revisi '+item.revision);
    lines.push('Peringkat sementara: '+(item.provisional_rank??'belum dipilih')+
      ' (DRAFT, tidak dihitung sebagai nilai resmi)');
    lines.push('Justifikasi sementara:');
    lines.push(...wrap(item.justification));
    lines.push('Catatan kerja:');
    lines.push(...wrap(item.preparation_notes));
    const files=byNumber.get(Number(item.indicator_number))??[];
    lines.push('Jumlah dokumen bukti aktual: '+files.length+
      ' file (terenkripsi dalam aplikasi; isi tidak disisipkan ke PDF).');
    for(const file of files){
      lines.push(...wrap('Bukti: '+file.file_name+' | SHA-256 '+
        file.sha256.toString('hex')+' | '+file.size_bytes+' bytes'));
    }
    lines.push('Rencana bukti:');
    lines.push(...wrap(item.evidence_plan));
    lines.push('');
  }
  if(!items.length)lines.push('Belum ada catatan indikator tersimpan.');
  // Ensure every visible PDF line fits the page, including long bank titles.
  return lines.flatMap(line=>line?wrap(line):['']);
}
async function collectWorkpaper(db,{actorId,id}){
  if(!await userHasPermission(db,actorId,'reports:read'))
    throw new PadkPreparationError(403,'Forbidden');
  const preparation=await getPadkPreparation(db,{actorId,id});
  const [preview,review]=await Promise.all([
    getPadkSavedScorePreview(db,{actorId,id}),
    padkDraftReviewHistory(db,{actorId,id}),
  ]);
  // Fail closed: never print a regulatory-like score if preview gates change.
  if(preview.status!=='PREVIEW_UNVERIFIED'||preview.mappingVerified!==false
    ||preview.criteriaVerified!==false||preview.roundingPolicyVerified!==false
    ||preview.officialScoreAvailable!==false||preview.finalReportAvailable!==false
    ||review.officialApprovalAvailable!==false||review.finalReportAvailable!==false)
    throw new PadkPreparationError(503,'PADK draft report gates invalid');
  const institution=await db.query(
    'SELECT i.name,i.kind FROM padk_assessment_preparations p '+
    'JOIN institutions i ON i.id=p.institution_id WHERE p.id=$1',[id],
  );
  if(institution.rowCount!==1)
    throw new PadkPreparationError(404,'Preparation not found');
  const rows=await db.query(
    'SELECT n.indicator_number,n.preparation_notes,n.evidence_plan,n.revision,'+
    'n.provisional_rank,n.justification,'+
    '(SELECT count(*)::int FROM padk_indicator_evidence e '+
    'WHERE e.preparation_id=n.preparation_id AND e.indicator_number=n.indicator_number) '+
    'AS evidence_count FROM padk_preparation_indicator_notes n '+
    'WHERE n.preparation_id=$1 ORDER BY n.indicator_number',[id],
  );
  const evidence=await db.query(
    'SELECT indicator_number,file_name,size_bytes,sha256 '+
    'FROM padk_indicator_evidence WHERE preparation_id=$1 '+
    'ORDER BY indicator_number,uploaded_at,id',[id],
  );
  const pdf=makeProfessionalPadkDraftPdf({
    institution:institution.rows[0],preparation,items:rows.rows,
    preview,review,evidence:evidence.rows,
    generatedAt:new Date().toISOString(),
  });
  return {pdf,filename:'nusariksa-draft-hasil-padk-'+id+'.pdf'};
}
export async function getPadkPreparationWorkpaper(db,args){
  // In normal deployments db is a pool: all report reads use one
  // consistent read-only PostgreSQL snapshot. A transaction-owned client
  // (tests) already supplies its own snapshot/transaction boundary.
  if(typeof db.connect!=='function'||typeof db.release==='function')
    return collectWorkpaper(db,args);
  const client=await db.connect();
  try{
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const result=await collectWorkpaper(client,args);
    await client.query('COMMIT');
    return result;
  }catch(error){
    await client.query('ROLLBACK');
    throw error;
  }finally{client.release();}
}
