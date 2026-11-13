import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  linesOfInternalAssessmentReport,makeInternalAssessmentPdf,makeInternalAssessmentCsv,
} from '../src/assessment-report-exports.js';

const makeReport=()=>({
  reportType:'internal_assessment',
  final:false,
  generatedAt:'2026-11-13T00:00:00.000Z',
  institution:{name:'BPR Simulasi',kind:'BPR'},
  assessment:{id:'00000000-0000-4000-8000-000000000001',
    title:'Asesmen Internal 2026',periodStart:'2026-01-01',
    periodEnd:'2026-12-31',status:'in_progress',submissionCycle:0},
  catalog:{title:'Katalog internal',version:1},
  summary:{total:2,assessed:1,notAssessed:1,completionPercent:50,
    ratings:{compliant:0,partially_compliant:0,non_compliant:1,not_applicable:0}},
  latestReviewDecision:null,
  controls:[
    {control_code:'GOV_01',title:'Pembagian tugas TI',
      source_document:'POJK Nomor 34 Tahun 2025',source_section:'Pasal 3',
      rating:'non_compliant',note:'=HYPERLINK("bad";"open")',revision:1},
    {control_code:'GOV_02',title:'Kebijakan TI',rating:'not_assessed',note:'',revision:0},
  ],
});

test('PDF asesmen menandai status pratinjau atau final internal tanpa mengklaim hasil OJK',()=>{
  const draft=makeReport();
  const lines=linesOfInternalAssessmentReport(draft);
  assert.ok(lines.includes('PRATINJAU INTERNAL - BELUM DISETUJUI'));
  assert.ok(lines.includes('BUKAN BUKTI KEPATUHAN ATAU LAPORAN RESMI OJK'));
  assert.match(lines.join('\n'),/GOV_01/);
  const pdf=makeInternalAssessmentPdf(draft);
  assert.ok(Buffer.isBuffer(pdf));
  const body=pdf.toString('latin1');
  assert.ok(body.startsWith('%PDF-1.4'));
  assert.match(body,/ASESMEN TI INTERNAL - BUKAN PENGESAHAN OJK/);
  assert.match(body,/\/BaseFont \/Helvetica >>/);
  assert.match(body,/\/BaseFont \/Helvetica-Bold >>/);
  assert.doesNotMatch(body,/\/BaseFont \/Courier/);
  for(const section of ['Ringkasan eksekutif','Rincian penilaian per kontrol',
    'Daftar perhatian dan tindak lanjut','Pemeriksaan internal']){
    assert.ok(body.toLowerCase().includes(section.toLowerCase()),
      section+' missing from vector PDF');
  }
  assert.match(body,/Hasil: Belum memenuhi/);
  assert.match(body,/LAPORAN ASESMEN TI INTERNAL/);
  assert.doesNotMatch(body,/DRAFT - BUKAN HASIL PENILAIAN PADK/);
  const approved=makeReport();
  approved.final=true;approved.assessment.status='approved';
  approved.latestReviewDecision={action:'APPROVED',submission_cycle:1,
    note:'Catatan pemeriksa internal disetujui.'};
  assert.match(linesOfInternalAssessmentReport(approved).join('\n'),/FINAL INTERNAL/);
  assert.match(linesOfInternalAssessmentReport(approved).join('\n'),/Catatan pemeriksa/);
  assert.throws(()=>makeInternalAssessmentPdf({}),TypeError);
});

test('CSV cocok untuk Excel, berisi jawaban tersimpan dan mencegah formula injection',()=>{
  const csv=makeInternalAssessmentCsv(makeReport());
  assert.ok(csv.subarray(0,3).equals(Buffer.from([0xef,0xbb,0xbf])));
  const body=csv.toString('utf8');
  assert.match(body,/PRATINJAU INTERNAL/);
  assert.match(body,/GOV_01/);
  assert.match(body,/GOV_02/);
  assert.match(body,/BUKAN LAPORAN RESMI OJK/);
  assert.ok(body.includes('"'+"'"+'=HYPERLINK(""bad"";""open"")"'));
  const approved=makeReport();approved.final=true;
  assert.match(makeInternalAssessmentCsv(approved).toString('utf8'),/FINAL INTERNAL/);
  assert.throws(()=>makeInternalAssessmentCsv(null),TypeError);
});

test('Report Engine V2 membuat pagination dan footer aktual untuk daftar kontrol panjang',()=>{
  const report=makeReport();
  report.controls=Array.from({length:80},(_,index)=>({
    control_code:'SEC_'+String(index+1).padStart(3,'0'),
    title:'Pengendalian TI simulasi nomor '+String(index+1),
    source_document:'POJK 34 Tahun 2025',
    source_section:'Pasal simulasi '+String(index+1),
    rating:index%3===0?'non_compliant':'partially_compliant',
    note:'Tindak lanjut perlu mempertimbangkan bukti aktual, dampak, serta '+
      'risiko terkait pengendalian TI. '.repeat(9),
    revision:1,
  }));
  report.summary={total:80,assessed:80,notAssessed:0,completionPercent:100,
    ratings:{compliant:0,partially_compliant:53,non_compliant:27,not_applicable:0}};
  const pdf=makeInternalAssessmentPdf(report);
  const source=pdf.toString('latin1');
  const pages=[...source.matchAll(/\/Type \/Page \/Parent /g)].length;
  assert.ok(pages>=8,'PDF should paginate dense reports without truncation');
  assert.match(source,/SEC_001/);
  assert.match(source,/SEC_080/);
  assert.match(source,/Halaman 1 \/ /);
  assert.match(source,new RegExp('Halaman '+pages+' \\/ '+pages));
  const match=/startxref\n(\d+)\n%%EOF/.exec(source);
  assert.ok(match,'xref section must be present');
  assert.equal(source.slice(Number(match[1]),Number(match[1])+4),'xref');
  assert.ok(pdf.byteLength<3*1024*1024);
  assert.doesNotMatch(source,/Skor maturitas resmi/);
});
