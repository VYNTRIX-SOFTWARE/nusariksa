import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canReadReport, canListReportAssessments, reportAssessmentOptions,
  validateAssessmentReport, reportRatingCounts, filteredReportControls,
} from '../../web/assets/assessment-report-model.js';

const id = '11111111-1111-4111-8111-111111111111';
const report = () => ({
  generatedAt: '2026-11-03T01:00:00.000Z',
  reportType: 'internal_assessment',
  final: false,
  assessment: { id, title: 'Audit TI', status: 'submitted', submissionCycle: 1 },
  institution: { name: 'Lembaga pengujian', kind: 'BPR' },
  catalog: { title: 'Kontrol internal', version: 1 },
  summary: {
    total: 3, assessed: 2, notAssessed: 1, completionPercent: 67,
    ratings: { compliant: 1, partially_compliant: 1, non_compliant: 0, not_applicable: 0 },
  },
  controls: [
    { control_code: 'A', title: 'Kontrol A', rating: 'compliant' },
    { control_code: 'B', title: 'Kontrol B', rating: 'partially_compliant' },
    { control_code: 'C', title: 'Kontrol C', rating: 'not_assessed' },
  ],
  latestReviewDecision: null,
  note: 'Penilaian internal, bukan pengesahan regulator',
});

test('izin laporan tidak disamakan dengan izin daftar asesmen', () => {
  assert.equal(canReadReport(['reports:read']), true);
  assert.equal(canReadReport(['assessments:read']), false);
  assert.equal(canListReportAssessments(['reports:read']), false);
  assert.equal(canListReportAssessments(['reports:read', 'assessments:read']), true);
  assert.deepEqual(reportAssessmentOptions([{id, title:'Audit TI'}], ['reports:read']), []);
  assert.equal(reportAssessmentOptions([{id, title:'Audit TI'}],
    ['reports:read','assessments:read']).length, 1);
});

test('model menampilkan distribusi dan filter tanpa mengubah data asli', () => {
  const r = validateAssessmentReport(report(), id);
  assert.deepEqual(reportRatingCounts(r).map(x => x.count), [1,1,0,0,1]);
  assert.deepEqual(filteredReportControls(r,'not_assessed').map(x => x.control_code),['C']);
  assert.equal(filteredReportControls(r,'all').length,3);
  assert.equal(r.summary.completionPercent,67);
});

test('preview dan final internal mengikuti status backend', () => {
  const draft = report();
  assert.equal(validateAssessmentReport(draft, id).final, false);
  draft.assessment.status = 'approved';
  assert.throws(() => validateAssessmentReport(draft,id), /konsisten/);
  draft.final = true;
  assert.equal(validateAssessmentReport(draft,id).final,true);
});

test('model menolak payload tidak valid tanpa membuat skor palsu', () => {
  const invalid = [
    null, {},
    { ...report(), controls: null },
    { ...report(), summary: { ...report().summary, completionPercent: 100 } },
    { ...report(), summary: { ...report().summary, ratings: {compliant:2,partially_compliant:1,non_compliant:0,not_applicable:0} } },
    { ...report(), assessment: { ...report().assessment, id: 'lain' } },
    { ...report(), controls: [{control_code:'A',title:'A',rating:'unknown'}] },
  ];
  for (const item of invalid) assert.throws(() => validateAssessmentReport(item,id));
  const empty = report();
  empty.summary = {total:0,assessed:0,notAssessed:0,completionPercent:0,
    ratings:{compliant:0,partially_compliant:0,non_compliant:0,not_applicable:0}};
  empty.controls = [];
  assert.equal(validateAssessmentReport(empty,id).summary.total,0);
});
