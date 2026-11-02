const KNOWN = Object.freeze(['draft','in_progress','submitted','changes_requested','approved']);
export const STATUS_LABELS = Object.freeze({
  draft: 'Draft', in_progress: 'Dikerjakan', submitted: 'Menunggu review',
  changes_requested: 'Perlu perbaikan', approved: 'Disetujui',
});

export function validAssessments(items) {
  return Array.isArray(items) ? items.filter((value) =>
    value && typeof value === 'object' && typeof value.id === 'string'
    && typeof value.title === 'string' && typeof value.status === 'string') : [];
}

export function yearsForAssessments(items) {
  const years = new Set();
  for (const row of validAssessments(items)) {
    const start = row.period_start?.slice(0,4);
    const end = row.period_end?.slice(0,4);
    if (/^\d{4}$/.test(start) && /^\d{4}$/.test(end)) {
      for (let y = Number(start); y <= Math.min(Number(end), Number(start) + 30); y++) years.add(y);
    }
  }
  return [...years].sort((a,b)=>b-a).map(String);
}

export function withinYear(row, year) {
  if (year === 'all') return true;
  if (!/^\d{4}$/.test(year)) return false;
  const from = row.period_start?.slice(0,4);
  const to = row.period_end?.slice(0,4);
  return /^\d{4}$/.test(from) && /^\d{4}$/.test(to) && from <= year && to >= year;
}

export function summarizeAssessments(items, year = 'all') {
  const rows = validAssessments(items).filter((x) => withinYear(x, year));
  const counts = Object.fromEntries(KNOWN.map((status)=>[status,0]));
  for (const row of rows) if (Object.hasOwn(counts,row.status)) counts[row.status]++;
  return { total: rows.length, counts };
}

export function filterAssessments(items, {year='all',status='all',search='',sort='newest'}={}) {
  const needle = String(search).trim().toLocaleLowerCase('id-ID');
  const filtered = validAssessments(items).filter((row)=>
    withinYear(row,year) && (status==='all' || row.status===status) &&
    (!needle || row.title.toLocaleLowerCase('id-ID').includes(needle))
  );
  return filtered.sort((a,b)=>{
    if (sort === 'title') return a.title.localeCompare(b.title,'id');
    const ascending = sort === 'oldest';
    const left = Date.parse(a.created_at)||0, right = Date.parse(b.created_at)||0;
    const diff = ascending ? left-right : right-left;
    return diff || a.id.localeCompare(b.id);
  });
}

export function attentionAssessments(items, year='all') {
  const order={changes_requested:0,submitted:1,in_progress:2};
  return filterAssessments(items,{year})
    .filter((a)=>Object.hasOwn(order,a.status))
    .sort((a,b)=>order[a.status]-order[b.status]).slice(0,5);
}

export function ownWork(items,userId,year='all') {
  if(typeof userId !== 'string')return [];
  const statuses=new Set(['draft','in_progress','changes_requested']);
  return filterAssessments(items,{year})
    .filter((a)=>a.owner_user_id===userId && statuses.has(a.status)).slice(0,5);
}
