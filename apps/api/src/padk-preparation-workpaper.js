import {userHasPermission} from './authorization.js';
import {getPadkPreparation,PadkPreparationError} from './padk-preparations.js';


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
export function makeDraftWorkpaperPdf(lines){
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
      '('+pdfEsc('DRAFT - BUKAN HASIL PENILAIAN PADK / BUKAN LAPORAN FINAL'+
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
function linesOfWorkpaper({institution,preparation,items,generatedAt}){
  const count=preparation.category===1?80:60;
  const lines=[
    'NUSARIKSA - KERTAS KERJA PERSIAPAN PADK 43/2025',
    'DRAFT - BUKAN HASIL PENILAIAN REGULASI / BUKAN LAPORAN FINAL',
    '',
    'Lembaga: '+clean(institution.name)+' ('+clean(institution.kind)+')',
    'Judul: '+clean(preparation.title),
    'Kategori: '+preparation.category+'  |  Periode: '+preparation.periodStart+' s.d. '+preparation.periodEnd,
    'ID penilaian: '+preparation.id,
    'Dicetak (UTC): '+generatedAt,
    'Indikator dengan catatan: '+items.length+' dari '+count,
    '',
    'PENTING: Teks indikator, kriteria peringkat, dan metode komposit belum disahkan.',
    'Dokumen ini HANYA memuat catatan kerja dan rencana bukti yang sudah tersimpan.',
    'Tidak ada skor, persetujuan, klaim kesesuaian OJK, atau bukti lampiran di PDF ini.',
    '',
  ];
  for(const item of items){
    lines.push('-'.repeat(90));
    lines.push('INDIKATOR '+String(item.indicator_number).padStart(2,'0')+'  |  Revisi '+item.revision);
    lines.push('Catatan kerja:');
    lines.push(...wrap(item.preparation_notes));
    lines.push('Rencana bukti:');
    lines.push(...wrap(item.evidence_plan));
    lines.push('');
  }
  if(!items.length)lines.push('Belum ada catatan indikator tersimpan.');
  return lines;
}
export async function getPadkPreparationWorkpaper(db,{actorId,id}){
  if(!await userHasPermission(db,actorId,'reports:read'))
    throw new PadkPreparationError(403,'Forbidden');
  const preparation=await getPadkPreparation(db,{actorId,id});
  const institution=await db.query(
    'SELECT i.name,i.kind FROM padk_assessment_preparations p '+
    'JOIN institutions i ON i.id=p.institution_id WHERE p.id=$1',[id],
  );
  if(institution.rowCount!==1)
    throw new PadkPreparationError(404,'Preparation not found');
  const rows=await db.query(
    'SELECT indicator_number,preparation_notes,evidence_plan,revision '+
    'FROM padk_preparation_indicator_notes WHERE preparation_id=$1 ORDER BY indicator_number',[id],
  );
  const pdf=makeDraftWorkpaperPdf(linesOfWorkpaper({
    institution:institution.rows[0],preparation,items:rows.rows,
    generatedAt:new Date().toISOString(),
  }));
  return {pdf,filename:'nusariksa-persiapan-padk-'+id+'.pdf'};
}
