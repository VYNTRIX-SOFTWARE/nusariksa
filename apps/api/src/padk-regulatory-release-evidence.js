import {padkRegulatoryPackFingerprint} from './padk-regulatory-pack-review.js';

const REFERENCE='43/PADK.03/2025:LAMPIRAN_IV';
const SOURCE_ISSUES=[2,20,21,22,27,28,29];
const MAPPING_ISSUES=[3,18,19,20,24,29,32];
const ROLES=['substance','technical'];
const requireEvidence=(yes,message)=>{if(!yes)throw new TypeError('Rilis regulatori ditolak: '+message);};
const text=(value,min=12)=>typeof value==='string'&&value.trim().length>=min;
const key=n=>String(n).padStart(3,'0');

// This validates completeness and internal consistency, NOT the truth of signed
// review assertions. A separately verified human PR review remains mandatory.
export function validatePadkReleaseEvidence({evidence,source,packs,mapping}){
  requireEvidence(evidence&&evidence.schemaVersion===1&&evidence.reference===REFERENCE,
    'format bukti dan referensi');
  requireEvidence(source&&source.status==='MACHINE_EXTRACTED_REVIEW_PENDING'
    &&Array.isArray(source.records)&&source.records.length===540,
    'transkripsi dasar 540 baris');
  requireEvidence(evidence.sourcePdfSha256===source.sourcePdfSha256,
    'hash sumber PDF');
  const acquisition=evidence.sourceAcquisition;
  requireEvidence(acquisition&&acquisition.origin==='OFFICIAL_OJK_DOWNLOAD'
    &&text(acquisition.documentUrl)&&text(acquisition.downloadedAt)
    &&acquisition.pdfSha256===source.sourcePdfSha256,
    'asal PDF resmi memerlukan bukti unduhan');
  let verifiedUrl;
  try{verifiedUrl=new URL(acquisition.documentUrl);}catch{verifiedUrl=null;}
  requireEvidence(verifiedUrl?.protocol==='https:'
    &&['ojk.go.id','www.ojk.go.id'].includes(verifiedUrl.hostname.toLowerCase()),
    'alamat asal dokumen harus domain HTTPS OJK');

  const review=evidence.review;
  requireEvidence(review&&text(review.compiledBy,3)&&Array.isArray(review.attestations)
    &&review.attestations.length===2,
    'dua reviewer dan penyusun');
  const reviewers=new Map();
  for(const entry of review.attestations){
    requireEvidence(entry&&ROLES.includes(entry.role)&&text(entry.reviewerId,3)
      &&text(entry.reviewedAt,10)&&entry.reviewerId!==review.compiledBy
      &&!reviewers.has(entry.role),'peran reviewer independen');
    reviewers.set(entry.role,entry.reviewerId);
  }
  requireEvidence(reviewers.size===2
    &&reviewers.get('substance')!==reviewers.get('technical'),
    'review substansi dan teknis harus oleh orang berbeda');

  const sourceRows=new Map(source.records.map(row=>[row.id,row]));
  requireEvidence(sourceRows.size===540,'ID sumber berulang');
  const cells=evidence.sourceCells;
  requireEvidence(Array.isArray(cells)&&cells.length===540,'540 keputusan pemeriksaan sel');
  const seen=new Set();
  for(const cell of cells){
    const expected=sourceRows.get(cell?.id);
    requireEvidence(expected&&!seen.has(cell.id)&&cell.outcome==='MATCH'
      &&JSON.stringify(cell.physicalPdfPages)===JSON.stringify(expected.physicalPdfPages)
      &&text(cell.reviewNote),'hasil dan halaman sumber tiap sel');
    seen.add(cell.id);
  }

  requireEvidence(Array.isArray(mapping)&&mapping.length===60,'peta kandidat 60 indikator');
  const decisions=evidence.category2Crosswalk;
  requireEvidence(Array.isArray(decisions)&&decisions.length===60,'60 keputusan pemetaan');
  const crosswalkSeen=new Set();
  for(const decision of decisions){
    const number=decision?.category2Number;
    requireEvidence(Number.isInteger(number)&&number>=1&&number<=60
      &&!crosswalkSeen.has(number)&&decision.outcome==='APPROVED'
      &&Number.isInteger(decision.table3Number)&&decision.table3Number>=1
      &&decision.table3Number<=80&&text(decision.rationale),
    'keputusan dan alasan pemetaan nomor '+number);
    // A changed mapping must be explicitly justified. It may not silently
    // reuse the 700 provisional criteria placements from the candidate pack.
    if(decision.table3Number!==mapping[number-1].table3CandidateNumber){
      requireEvidence(text(decision.overrideReason),'perubahan crosswalk tanpa alasan');
    }
    crosswalkSeen.add(number);
  }
  const special=decisions.find(d=>d.category2Number===29);
  requireEvidence(JSON.stringify(special?.aspects)==='[32,35]'
    &&text(special.combinedRankRule)&&text(special.ruleImplementationReference),
    'indikator 29 harus satu skor dengan aturan dua aspek yang diimplementasikan');

  const exceptions=evidence.exceptionDecisions;
  requireEvidence(Array.isArray(exceptions)&&exceptions.length===14,
    '14 keputusan pengecualian yang dapat ditelusuri');
  const expectedExceptions=new Set([
    ...SOURCE_ISSUES.map(n=>'SOURCE_'+n),
    ...MAPPING_ISSUES.map(n=>'MAPPING_'+n),
  ]);
  const exceptionSeen=new Set();
  for(const entry of exceptions){
    const id=entry?.type+'_'+entry?.number;
    requireEvidence(expectedExceptions.has(id)&&!exceptionSeen.has(id)
      &&entry.outcome==='RESOLVED'&&text(entry.decision)
      &&Array.isArray(entry.physicalPdfPages)&&entry.physicalPdfPages.length>0,
      'pengecualian belum ada keputusan: '+id);
    exceptionSeen.add(id);
  }

  const scoring=evidence.scoring;
  requireEvidence(scoring&&JSON.stringify(scoring.weights)==='[25,15,25,15,20]'
    &&scoring.bestRank===1&&scoring.worstRank===5
    &&text(scoring.roundingDecision)&&text(scoring.roundingEvidence)
    &&scoring.boundaryTestsApproved===true,
    'metode skor, pembulatan, dan pengujian batas');
  requireEvidence(Array.isArray(packs)&&packs.length===2
    &&Array.isArray(evidence.packFingerprints)&&evidence.packFingerprints.length===2,
    'kedua regulatory pack final');
  for(const pack of packs){
    const {sha256,normalized}=padkRegulatoryPackFingerprint(pack);
    requireEvidence(evidence.packFingerprints.find(row=>row.category===normalized.category
      &&row.sha256===sha256),'fingerprint pack final kategori '+normalized.category);
    for(const ind of normalized.indicators){
      const category=normalized.category;
      const sourceId='K'+category+'-I'+key(ind.number);
      const sourceItem=sourceRows.get(sourceId);
      const criteriaNumber=category===1?ind.number:
        decisions.find(d=>d.category2Number===ind.number).table3Number;
      requireEvidence(sourceItem&&ind.title===sourceItem.parameterText
        &&ind.tablePage===sourceItem.physicalPdfPages[0]-119,
        'redaksi parameter pack '+sourceId);
      for(const rank of ind.rankCriteria){
        const ref=sourceRows.get('T3-I'+key(criteriaNumber)+'-R'+rank.rank);
        requireEvidence(ref&&rank.criterion===ref.criterionText
          &&rank.criteriaPage===ref.physicalPdfPages[0]-119,
          'kriteria pack '+sourceId+' R'+rank.rank);
      }
    }
  }
  return {status:'STRUCTURE_AND_DECLARATIONS_VALID',independentGitHubReviewVerified:false,
    sourceCells:540,crosswalkDecisions:60,exceptionDecisions:14,
    note:'Validasi metadata tidak mengautentikasi reviewer atau menggantikan review PR independen.'};
}
