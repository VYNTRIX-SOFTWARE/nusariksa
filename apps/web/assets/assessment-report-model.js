export const REPORT_RATINGS = Object.freeze([
  { value: 'compliant', label: 'Memenuhi' },
  { value: 'partially_compliant', label: 'Memenuhi sebagian' },
  { value: 'non_compliant', label: 'Belum memenuhi' },
  { value: 'not_applicable', label: 'Tidak relevan' },
  { value: 'not_assessed', label: 'Belum dinilai' },
]);

export const REPORT_STATUS_LABELS = Object.freeze({
  draft: 'Draft',
  in_progress: 'Dikerjakan',
  submitted: 'Menunggu review',
  changes_requested: 'Perlu perbaikan',
  approved: 'Disetujui',
});

export function canReadReport(permissions) {
  return Array.isArray(permissions) && permissions.includes('reports:read');
}

export function canListReportAssessments(permissions) {
  return canReadReport(permissions) && permissions.includes('assessments:read');
}

export function reportAssessmentOptions(assessments, permissions) {
  if (!canListReportAssessments(permissions) || !Array.isArray(assessments)) return [];
  return assessments.filter(item => item && typeof item.id === 'string'
    && typeof item.title === 'string');
}

function nonnegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function validateAssessmentReport(data, selectedId) {
  if (!data || typeof data !== 'object' || data.reportType !== 'internal_assessment'
    || typeof data.final !== 'boolean'
    || !data.assessment || typeof data.assessment !== 'object'
    || typeof data.assessment.id !== 'string' || data.assessment.id !== selectedId
    || typeof data.assessment.title !== 'string'
    || !(data.assessment.status in REPORT_STATUS_LABELS)
    || !data.institution || typeof data.institution.name !== 'string'
    || !data.summary || !Array.isArray(data.controls)) {
    throw new TypeError('Respons laporan tidak valid.');
  }

  const { total, assessed, notAssessed, completionPercent, ratings } = data.summary;
  if (![total, assessed, notAssessed].every(nonnegativeInteger)
    || !nonnegativeInteger(completionPercent) || completionPercent > 100
    || !ratings || typeof ratings !== 'object'
    || total !== assessed + notAssessed || total !== data.controls.length
    || (data.final && data.assessment.status !== 'approved')
    || (!data.final && data.assessment.status === 'approved')) {
    throw new TypeError('Ringkasan laporan tidak konsisten.');
  }
  const assessedSum = REPORT_RATINGS.slice(0, 4).reduce((sum, { value }) => {
    if (!nonnegativeInteger(ratings[value])) return NaN;
    return sum + ratings[value];
  }, 0);
  if (assessedSum !== assessed
    || completionPercent !== (total === 0 ? 0 : Math.round(100 * assessed / total))) {
    throw new TypeError('Distribusi hasil tidak konsisten.');
  }
  if (data.controls.some(control => !control || typeof control !== 'object'
      || typeof control.control_code !== 'string'
      || typeof control.title !== 'string'
      || !REPORT_RATINGS.some(({ value }) => value === control.rating))) {
    throw new TypeError('Rincian kontrol tidak valid.');
  }
  return data;
}

export function reportRatingCounts(report) {
  return REPORT_RATINGS.map(({ value, label }) => ({
    value, label, count: value === 'not_assessed'
      ? report.summary.notAssessed : report.summary.ratings[value],
  }));
}

export function filteredReportControls(report, filter) {
  if (!report) return [];
  return filter === 'all' ? [...report.controls]
    : report.controls.filter(control => control.rating === filter);
}
