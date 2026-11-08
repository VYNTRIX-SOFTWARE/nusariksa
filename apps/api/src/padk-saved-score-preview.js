import {readFile} from 'node:fs/promises';
import {getPadkPreparation,PadkPreparationError} from './padk-preparations.js';
import {previewPadkCyberMaturity,PadkCyberError} from './padk-cyber-maturity.js';

const SOURCES=new Map([
  [1,new URL('../../../regulations/padk43/cyber/drafts/kategori-1.json',import.meta.url)],
  [2,new URL('../../../regulations/padk43/cyber/drafts/kategori-2.json',import.meta.url)],
]);
const CODES=new Set(['TK','ID','PL','DT','PP']);
export async function loadPadkPreviewManifest(category){
  const url=SOURCES.get(category);
  if(!url)throw new PadkPreparationError(400,'Invalid PADK category');
  const draft=JSON.parse(await readFile(url,'utf8'));
  const count=category===1?80:60;
  if(draft.status!=='DRAFT_UNVERIFIED'||draft.category!==category
    ||draft.source?.verifiedAgainstOfficialPdf!==false
    ||!Array.isArray(draft.items)||draft.items.length!==count)
    throw new PadkPreparationError(503,'Draft PADK domain mapping unavailable');
  const indicators=draft.items.map((item,index)=>{
    if(item.number!==index+1||!CODES.has(item.domain)
      ||item.reviewStatus!=='NEEDS_SOURCE_REVIEW'
      ||typeof item.subdomain!=='string'
      ||typeof item.workingSummary!=='string'||item.workingSummary.length<8
      ||!Array.isArray(item.rankCriteria)||item.rankCriteria.length!==0)
      throw new PadkPreparationError(503,'Draft PADK mapping integrity failed');
    // The existing preview engine caps subdomain codes at 32 chars.
    // Shorten only the internal code used by this preview; source drafts
    // remain untouched, and official indicator wording is still unverified.
    return {number:item.number,domain:item.domain,
      subdomain:item.subdomain.slice(0,32),title:item.workingSummary};
  });
  return {reference:'43/PADK.03/2025:LAMPIRAN_IV',category,indicators};
}
/**
 * INTERNAL WORKING PREVIEW ONLY. The mapping is DRAFT_UNVERIFIED and this
 * result is deliberately never a signed regulatory report or approved result.
 */
export async function getPadkSavedScorePreview(db,{actorId,id}){
  const preparation=await getPadkPreparation(db,{actorId,id});
  const manifest=await loadPadkPreviewManifest(preparation.category);
  const rows=await db.query(
    'SELECT indicator_number,provisional_rank FROM padk_preparation_indicator_notes '+
    'WHERE preparation_id=$1 AND provisional_rank IS NOT NULL ORDER BY indicator_number',[id],
  );
  const ratings=rows.rows.map(row=>({
    number:Number(row.indicator_number),rank:Number(row.provisional_rank),
  }));
  let computed;
  try{computed=previewPadkCyberMaturity({manifest,ratings});}
  catch(error){
    if(!(error instanceof PadkCyberError))throw error;
    throw new PadkPreparationError(503,'PADK preview calculation failed integrity check');
  }
  return {
    preparationId:id,category:preparation.category,
    status:'PREVIEW_UNVERIFIED',
    sourceStatus:'DRAFT_UNVERIFIED',mappingVerified:false,
    criteriaVerified:false,roundingPolicyVerified:false,
    officialScoreAvailable:false,officialApprovalAvailable:false,
    finalReportAvailable:false,
    ...computed,
  };
}
