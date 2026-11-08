import {readFile} from 'node:fs/promises';
import {brotliDecompressSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {getPadkPreparation,PadkPreparationError} from './padk-preparations.js';
import {parseIndicatorNumber} from './padk-preparation-indicators.js';

const SOURCE_FILE=new URL('../../../regulations/padk43/cyber/drafts/table3-criteria-source.br',import.meta.url);
const MAP_FILE=new URL('../../../regulations/padk43/cyber/review/category2-candidates.json',import.meta.url);
const SOURCE_PDF_SHA='63868e2fe99a48485b17646618934c1fffb27b125811929e12bd70d170081e1b';
const EXTRACT_SHA='91edaaadcad31247ff3f703fe1e2dddbb470e99860e3bb07a00280c1c5fd4c60';
const NAMES=['Sangat Memadai','Memadai','Cukup Memadai','Kurang Memadai','Tidak Memadai'];
const ISSUE_NUMBERS=new Set([3,18,19,20,24,29,32]);
const fail=(message)=>{throw new PadkPreparationError(503,message);};

export async function readExtractedTable3(){
  let body;
  try{
    const bytes=await readFile(SOURCE_FILE);
    body=brotliDecompressSync(bytes,{maxOutputLength:100000});
  }catch{fail('Draft Table 3 source is unavailable');}
  if(createHash('sha256').update(body).digest('hex')!==EXTRACT_SHA)
    fail('Draft Table 3 integrity mismatch');
  let draft;
  try{draft=JSON.parse(body.toString('utf8'));}catch{fail('Draft Table 3 malformed');}
  if(!draft||draft.status!=='DRAFT_UNVERIFIED'||draft.pdfSha256!==SOURCE_PDF_SHA
    ||draft.sourceTextVerified!==false||draft.sourceAuthenticityVerified!==false
    ||!Array.isArray(draft.table3)||draft.table3.length!==80)
    fail('Draft Table 3 regulatory status mismatch');
  const entries=draft.table3.map((entry,i)=>{
    if(!Array.isArray(entry)||entry.length!==3||entry[0]!==i+1
      ||!Array.isArray(entry[1])||entry[1].length<1||entry[1].length>3
      ||entry[1].some(p=>!Number.isInteger(p)||p<157||p>198)
      ||!Array.isArray(entry[2])||entry[2].length!==5
      ||entry[2].some(text=>typeof text!=='string'||text.length<10||text.length>3000))
      fail('Draft Table 3 has invalid criteria row '+(i+1));
    return {number:entry[0],pdfPages:entry[1],
      ranks:entry[2].map((text,index)=>({rank:index+1,label:NAMES[index],
        textDraft:text,pdfPages:entry[1]}))};
  });
  return entries;
}
async function getCandidateMapping(number){
  let map;
  try{map=JSON.parse(await readFile(MAP_FILE,'utf8'));}catch{fail('Draft Category 2 mapping unavailable');}
  if(!map||map.status!=='DRAFT_UNVERIFIED'||map.sourcePdfSha256!==SOURCE_PDF_SHA
    ||map.sourceAuthenticityVerified!==false||map.fullCriteriaVerified!==false
    ||map.productionScoringAvailable!==false||!Array.isArray(map.candidateMappings)
    ||map.candidateMappings.length!==60)
    fail('Draft Category 2 mapping integrity mismatch');
  const entry=map.candidateMappings[number-1];
  if(!entry||entry.category2Number!==number
    ||!Number.isInteger(entry.table3CandidateNumber)
    ||entry.table3CandidateNumber<1||entry.table3CandidateNumber>80
    ||!['SOURCE_REVIEW_REQUIRED','CANDIDATE_NOT_APPROVED'].includes(entry.risk)
    ||(entry.risk==='SOURCE_REVIEW_REQUIRED')!==ISSUE_NUMBERS.has(number))
    fail('Draft Category 2 candidate mapping invalid');
  return entry;
}
/**
 * The 400 textual rank criteria are a machine extraction from the uploaded
 * PDF. These are NOT official, proofread, or reviewer-attested criteria.
 * Render for human source comparison only; never unlock scoring.
 */
export async function getPadkDraftCriteria(db,{actorId,id,number}){
  const preparation=await getPadkPreparation(db,{actorId,id});
  const indicator=parseIndicatorNumber(number,preparation.category);
  const mapping=preparation.category===2?await getCandidateMapping(indicator):null;
  const criteriaNumber=mapping?.table3CandidateNumber??indicator;
  const entries=await readExtractedTable3();
  const entry=entries[criteriaNumber-1];
  if(!entry||entry.number!==criteriaNumber)fail('Draft criterion number unavailable');
  return {
    preparationId:id,category:preparation.category,indicatorNumber:indicator,
    table3CandidateNumber:criteriaNumber,table3PdfPages:entry.pdfPages,
    criteria:entry.ranks,category2MappingRisk:mapping?.risk??null,
    mappingVerified:false,criteriaVerified:false,sourceTextVerified:false,
    sourceAuthenticityVerified:false,sourcePdfSha256:SOURCE_PDF_SHA,
    officialScoreAvailable:false,finalReportAvailable:false,
    status:'EXTRACTED_SOURCE_UNVERIFIED',
    note:preparation.category===2
      ?'Category 2 candidate mapping has not been approved. Compare Tables 2 and 3 with the source PDF before choosing a provisional rank.'
      :'Text is machine-extracted from Table 3. Verify every criterion visually against the source PDF.',
  };
}
