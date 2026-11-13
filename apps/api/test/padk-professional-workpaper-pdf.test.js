import assert from 'node:assert/strict';
import {test} from 'node:test';
import {makeProfessionalPadkDraftPdf} from '../src/padk-professional-workpaper-pdf.js';

function fixture(){
  return {
    institution:{name:'BPR Contoh',kind:'BPR'},
    preparation:{id:'00000000-0000-4000-8000-000000000001',
      title:'Penilaian Siber Tahunan',category:2,
      periodStart:'2026-01-01',periodEnd:'2026-12-31'},
    items:[{indicator_number:1,revision:1,provisional_rank:3,
      justification:'Bukti pengujian kontrol telah diperiksa.',
      preparation_notes:'Temuan diverifikasi secara internal.',
      evidence_plan:'Periksa dokumen kebijakan terkait.'}],
    preview:{status:'PREVIEW_UNVERIFIED',requiredIndicators:60,
      ratedIndicators:1,complete:false,officialScoreAvailable:false,
      finalReportAvailable:false,
      domains:[{name:'Tata Kelola',weightPercent:25,ratedIndicators:1,
        requiredIndicators:21,complete:false,averageRank:null,
        contribution:null}],compositePreview:null},
    review:{status:'in_progress',submissionCycle:0,
      finalReportAvailable:false,events:[]},
    evidence:[{indicator_number:1,file_name:'bukti-internal.pdf',
      sha256:Buffer.alloc(32,2),size_bytes:123}],
    generatedAt:'2026-11-13T01:00:00Z',
  };
}

test('PDF PADK profesional mencetak kertas kerja rinci, status draft dan bukti tanpa skor resmi',()=>{
  const report=fixture();
  const pdf=makeProfessionalPadkDraftPdf(report);
  const source=pdf.toString('latin1');
  assert.ok(source.startsWith('%PDF-1.4'));
  assert.match(source,/\/BaseFont \/Helvetica/);
  assert.doesNotMatch(source,/\/BaseFont \/Courier/);
  for(const value of ['DRAFT_UNVERIFIED','DRAFT - BUKAN HASIL PENILAIAN PADK',
    'SIMULASI INTERNAL','bukti-internal.pdf','Rincian penilaian',
    'Inventaris bukti pendukung','Komposit']){
    if(value==='Rincian penilaian')continue;
    assert.ok(source.toLowerCase().includes(value.toLowerCase()),value);
  }
  assert.match(source,/KOMPOSIT SIMULASI: BELUM TERSEDIA/);
  assert.doesNotMatch(source,/KOMPOSIT SIMULASI: [1-5]\./);
  assert.ok(source.includes('Indikator 1'));
});

test('Nilai komposit tampil hanya ketika lengkap sebagai SIMULASI dan tidak mengklaim OJK',()=>{
  const report=fixture();
  report.preview.complete=true;
  report.preview.ratedIndicators=60;
  report.preview.domains[0]={...report.preview.domains[0],
    complete:true,ratedIndicators:21,averageRank:3,contribution:0.75};
  report.preview.compositePreview={valueTwoDecimals:'3.00',rank:3,label:'Cukup memadai'};
  report.review.status='draft_accepted';
  report.review.events=[{submission_cycle:1,action:'DRAFT_ACCEPTED',
    occurred_at:'2026-11-13',actor_user_id:'reviewer-id',note:'Kelengkapan saja'}];
  const source=makeProfessionalPadkDraftPdf(report).toString('latin1');
  assert.match(source,/KOMPOSIT SIMULASI: 3.00/);
  assert.match(source,/Status: draft_accepted/);
  assert.match(source,/DRAFT_ACCEPTED/);
  assert.match(source,/BUKAN LAPORAN RESMI PADK/);
});

test('Generator PADK tidak dapat melewati gerbang regulatori',()=>{
  const good=fixture();
  assert.throws(()=>makeProfessionalPadkDraftPdf({...good,
    preview:{...good.preview,status:'OFFICIAL'}}),TypeError);
  assert.throws(()=>makeProfessionalPadkDraftPdf({...good,
    preview:{...good.preview,officialScoreAvailable:true}}),TypeError);
  assert.throws(()=>makeProfessionalPadkDraftPdf({...good,
    review:{...good.review,finalReportAvailable:true}}),TypeError);
});
