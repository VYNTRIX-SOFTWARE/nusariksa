import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validatePadkRegulatoryPack} from './padk-regulatory-pack-review.js';

const ROOT=new URL('../../../regulations/padk43/cyber/',import.meta.url);
const SHA='63868e2fe99a48485b17646618934c1fffb27b125811929e12bd70d170081e1b';
const STATUS='ASSEMBLED_PENDING_SUBSTANCE_AND_TECHNICAL_REVIEW';
const SOURCE_STATUS='MACHINE_EXTRACTED_REVIEW_PENDING';
const RISK=[3,18,19,20,24,29,32];
const CONFLICT=[2,20,21,22,27,28,29];
const SOURCE_ISSUES=[2,20,21,22,27,28,29];
const KEY=n=>String(n).padStart(3,'0');
const fail=message=>{throw new TypeError('Regulatory candidate tidak konsisten: '+message);};
const json=async path=>JSON.parse(await readFile(new URL(path,ROOT),'utf8'));
const stable=data=>createHash('sha256').update(JSON.stringify(data)).digest('hex');

export async function inspectPadkCandidatePacks(){
  const [extraction,one,two,manifest,draft1,draft2,mapping]=await Promise.all([
    json('sources/lampiran-iv-extraction.json'),
    json('candidates/kategori-1.json'),
    json('candidates/kategori-2.json'),
    json('candidates/review-manifest.json'),
    json('drafts/kategori-1.json'),
    json('drafts/kategori-2.json'),
    json('review/category2-candidates.json'),
  ]);
  if(extraction.schemaVersion!==1||extraction.status!==SOURCE_STATUS
    ||extraction.sourcePdfSha256!==SHA
    ||extraction.counts?.total!==540||extraction.counts?.category1!==80
    ||extraction.counts?.category2!==60||extraction.counts?.table3Criteria!==400
    ||!Array.isArray(extraction.records)||extraction.records.length!==540)
    fail('rekaman ekstraksi tidak lengkap');
  const byId=new Map();
  for(const row of extraction.records){
    if(!row||typeof row.id!=='string'||byId.has(row.id)
      ||row.status!==SOURCE_STATUS||typeof row.parameterText!=='string'
      ||row.parameterText.length<12||!Array.isArray(row.physicalPdfPages)
      ||row.physicalPdfPages.length===0
      ||row.physicalPdfPages.some(p=>!Number.isInteger(p)||p<135||p>198)
      ||typeof row.criterionText!=='string')
      fail('baris ekstraksi tidak lengkap/berulang');
    byId.set(row.id,row);
  }
  const criteria=new Map();
  for(let n=1;n<=80;n++){
    const ranks=Array.from({length:5},(_,i)=>byId.get('T3-I'+KEY(n)+'-R'+(i+1)));
    if(ranks.some((row,i)=>!row||row.kind!=='T3'||row.indicator!==n
      ||row.rank!==i+1||row.physicalPdfPages[0]<157
      ||row.physicalPdfPages.at(-1)>198||row.criterionText.length<12))
      fail('lima kriteria sumber tidak lengkap untuk Tabel 3 nomor '+n);
    criteria.set(n,ranks);
  }
  if(byId.size!==540)fail('jumlah ID sumber');
  if(mapping?.status!=='DRAFT_UNVERIFIED'||mapping.sourcePdfSha256!==SHA
    ||!Array.isArray(mapping.candidateMappings)||mapping.candidateMappings.length!==60)
    fail('peta kandidat belum lengkap');
  if(manifest?.status!==STATUS||manifest.sourcePdfSha256!==SHA
    ||manifest.sourceRowCount!==540
    ||manifest.uniqueTable3Criteria!==400||manifest.totalCriterionPlacements!==700
    ||manifest.category1?.indicators!==80||manifest.category1?.criterionPlacements!==400
    ||manifest.category2?.indicators!==60||manifest.category2?.criterionPlacements!==300
    ||manifest.sourceExtractionReviewed!==false||manifest.crosswalkApproved!==false
    ||manifest.independentReviewCompleted!==false||manifest.productionEligible!==false
    ||JSON.stringify(manifest.category2NeedsMappingReview)!==JSON.stringify(RISK)
    ||JSON.stringify(manifest.sourceCriteriaIssues)!==JSON.stringify(CONFLICT)
    ||JSON.stringify(manifest.multiAspectC2Indicator29?.aspectTable3Numbers)!=='[32,35]'
    ||manifest.multiAspectC2Indicator29?.candidateSelectedForDraftPack!==35
    ||manifest.multiAspectC2Indicator29?.officialCombinedRankRuleAvailable!==false)
    fail('metadata status atau anomali tidak sinkron');
  const packs=[one,two], drafts=[draft1,draft2];
  const fingerprints=[];
  for(let category=1;category<=2;category++){
    const pack=packs[category-1],draft=drafts[category-1];
    const expected=category===1?80:60;
    const checked=validatePadkRegulatoryPack(pack);
    if(checked.category!==category||checked.source.pdfSha256!==SHA
      ||checked.indicators.length!==expected||draft?.items?.length!==expected
      ||draft.status!=='DRAFT_UNVERIFIED'||draft.category!==category)
      fail('pack atau kategori tidak sesuai');
    for(let i=0;i<expected;i++){
      const item=checked.indicators[i],d=draft.items[i];
      const row=byId.get('K'+category+'-I'+KEY(i+1));
      const table3=category===1?i+1:mapping.candidateMappings[i]?.table3CandidateNumber;
      const sourceRanks=criteria.get(table3);
      if(!row||!sourceRanks||row.kind!=='K'+category||row.indicator!==i+1
        ||row.physicalPdfPages[0]<(category===1?135:147)
        ||row.physicalPdfPages.at(-1)>(category===1?146:156)
        ||item.number!==i+1||item.title!==row.parameterText
        ||item.tablePage!==row.physicalPdfPages[0]-119
        ||item.domain!==d.domain||item.subdomain!==d.subdomain
        ||(category===2&&mapping.candidateMappings[i].category2Number!==i+1))
        fail('redaksi atau posisi parameter tidak cocok: K'+category+'-'+(i+1));
      for(let j=0;j<5;j++){
        const rank=item.rankCriteria[j],source=sourceRanks[j];
        if(rank.rank!==j+1||rank.criterion!==source.criterionText
          ||rank.criteriaPage!==source.physicalPdfPages[0]-119)
          fail('sel kriteria tidak cocok dengan transkripsi sumber: K'+category+'-'+(i+1)+'-R'+(j+1));
      }
    }
    fingerprints.push(stable(checked));
  }
  return {
    status:STATUS,sourcePdfSha256:SHA,sourceRows:540,
    categories:[{category:1,indicators:80,criterionPlacements:400,packSha256:fingerprints[0]},
      {category:2,indicators:60,criterionPlacements:300,packSha256:fingerprints[1]}],
    uniqueSourceCriteria:400,totalCriterionPlacements:700,
    flaggedSourceCriteriaParameterNumbers:[...SOURCE_ISSUES],
    category2MappingReviewNumbers:[...RISK],
    category2MultiAspect29:[32,35],
    sourceExtractionReviewed:false,crosswalkApproved:false,
    independentReviewCompleted:false,productionEligible:false,
    note:'Pack kandidat lengkap secara struktur dan pencocokan antar-dataset. Verifikasi naskah PDF serta keputusan substansi independen belum selesai.',
  };
}
