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
