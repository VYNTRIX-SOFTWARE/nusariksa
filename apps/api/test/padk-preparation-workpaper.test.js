import assert from 'node:assert/strict';
import {test} from 'node:test';
import {makeDraftWorkpaperPdf,linesOfWorkpaper} from '../src/padk-preparation-workpaper.js';

test('PADK preparation workpaper renders valid PDF with conspicuous draft labeling',()=>{
  const lines=[
    'NUSARIKSA - KERTAS KERJA PERSIAPAN',
    'DRAFT - BUKAN HASIL PENILAIAN REGULASI',
    'Catatan: SOP backup sudah tersedia (belum diverifikasi)',
  ];
  const bytes=makeDraftWorkpaperPdf(lines);
  assert.ok(Buffer.isBuffer(bytes));
  assert.ok(bytes.subarray(0,8).toString('latin1').startsWith('%PDF-1.4'));
  const text=bytes.toString('latin1');
  assert.match(text,/DRAFT - BUKAN HASIL PENILAIAN PADK/);
  assert.match(text,/SOP backup sudah tersedia/);
  assert.match(text,/\/Type \/Catalog/);
  assert.match(text,/xref/);
  assert.match(text,/startxref/);
  assert.match(text,/%%EOF/);
  assert.ok(bytes.length>600);
});
test('PDF generator splits long reports across actual PDF pages',()=>{
  const report=makeDraftWorkpaperPdf(Array.from({length:140},(_,i)=>'Baris '+i));
  const source=report.toString('latin1');
  assert.match(source,/\/Count 3 >>/);
  assert.equal((source.match(/\/Type \/Page \/Parent/g)||[]).length,3);
  assert.equal((source.match(/BUKAN HASIL PENILAIAN PADK/g)||[]).length,3);
});

test('draft report includes domain calculation, evidence hashes and internal review only',()=>{
  const preview={requiredIndicators:60,ratedIndicators:60,complete:true,
    domains:[{name:'Tata Kelola',weightPercent:25,requiredIndicators:10,
      ratedIndicators:10,complete:true,averageRank:2,contribution:0.5}],
    compositePreview:{valueTwoDecimals:'2.00',rank:2,label:'Memadai'}};
  const lines=linesOfWorkpaper({
    institution:{name:'Bank Uji',kind:'BPR'},
    preparation:{title:'Uji lengkap',category:2,id:'id',periodStart:'2026-01-01',
      periodEnd:'2026-12-31'},
    generatedAt:'2026-11-08T00:00:00Z',preview,
    review:{status:'draft_accepted',submissionCycle:1,
      events:[{submission_cycle:1,action:'DRAFT_ACCEPTED',
        occurred_at:'2026-11-08',actor_user_id:'reviewer-id',note:'Hanya draft'}]},
    items:[{indicator_number:1,revision:1,provisional_rank:2,
      justification:'Pemeriksaan menunjukkan kontrol masih parsial.',
      preparation_notes:'Ada dokumen',evidence_plan:'Bukti SOP'}],
    evidence:[{indicator_number:1,file_name:'bukti-sop.pdf',
      sha256:Buffer.alloc(32,1),size_bytes:38}],
  });
  const joined=lines.join('\n');
  assert.match(joined,/Komposit SIMULASI: 2.00/);
  assert.match(joined,/draft_accepted/);
  assert.match(joined,/BUKAN LAPORAN RESMI PADK\/OJK/);
  assert.match(joined,/bukti-sop.pdf/);
  assert.match(joined,/0101010101010101/);
  assert.ok(lines.every(line=>line.length<=89));
});
test('incomplete draft hides composite while still exposing progress',()=>{
  const lines=linesOfWorkpaper({
    institution:{name:'Bank Uji',kind:'BPR'},
    preparation:{title:'Draft',category:1,id:'id',periodStart:'2026-01-01',
      periodEnd:'2026-12-31'},generatedAt:'2026-11-08T00:00:00Z',
    preview:{ratedIndicators:1,requiredIndicators:80,complete:false,
      domains:[{name:'Deteksi',weightPercent:15,requiredIndicators:10,
        ratedIndicators:1,complete:false,averageRank:null,contribution:null}],
      compositePreview:null},
    review:{status:'in_progress',submissionCycle:0,events:[]},
    items:[],evidence:[],
  });
  assert.match(lines.join('\n'),/Komposit SIMULASI: BELUM TERSEDIA/);
  assert.doesNotMatch(lines.join('\n'),/Komposit SIMULASI: [1-5]\\./);
});
