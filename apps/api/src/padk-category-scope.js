import {readFile} from 'node:fs/promises';
import {PadkPreparationError} from './padk-preparations.js';

const FILE=new URL('../../../regulations/padk43/cyber/review/category-scope.json',import.meta.url);
export const PADK_SOURCE_SHA='63868e2fe99a48485b17646618934c1fffb27b125811929e12bd70d170081e1b';

/**
 * Master 80 / marker 60: an internal comparison crosswalk pending source verification.
 * The category-2 indicator text remains in kategori-2.json, never copied from
 * any comparison dataset or overwritten by the master.
 */
export async function readPadkDraftCategoryScope(){
  let data;
  try{data=JSON.parse(await readFile(FILE,'utf8'));}
  catch{throw new PadkPreparationError(503,'PADK draft category scope unavailable');}
  const list=data?.category2Table3Numbers;
  if(data.schemaVersion!==1||data.status!=='DRAFT_UNVERIFIED'
    ||data.masterParameterCount!==80||data.category1ParameterCount!==80
    ||data.category2MarkerCount!==60||data.sourcePdfSha256!==PADK_SOURCE_SHA
    ||data.comparisonStatus!=='INTERNAL_DRAFT_UNVERIFIED'
    ||data.sourceAuthenticityVerified!==false||data.mappingVerified!==false
    ||data.productionScoringAvailable!==false||!Array.isArray(list)
    ||list.length!==60||list.some((n,i)=>!Number.isInteger(n)
      ||n<1||n>80||(i>0&&n<=list[i-1])))
    throw new PadkPreparationError(503,'PADK draft category scope invalid');
  return {status:data.status,masterParameterCount:80,category1ParameterCount:80,
    category2MarkerCount:60,sourcePdfSha256:data.sourcePdfSha256,
    referenceStatus:data.comparisonStatus,
    category2Table3Numbers:[...list]};
}

export function resolvePadkDraftReferences(scope,{category,indicator,primaryNumber}){
  if(!scope||scope.status!=='DRAFT_UNVERIFIED'
    ||scope.masterParameterCount!==80||scope.category2MarkerCount!==60
    ||!Array.isArray(scope.category2Table3Numbers)
    ||scope.category2Table3Numbers.length!==60
    ||![1,2].includes(category)||!Number.isInteger(indicator)
    ||indicator<1||indicator>(category===1?80:60)
    ||!Number.isInteger(primaryNumber)||primaryNumber<1||primaryNumber>80)
    throw new PadkPreparationError(503,'PADK draft reference lookup invalid');
  const comparisonNumber=category===2
    ?scope.category2Table3Numbers[indicator-1]:null;
  const numbers=comparisonNumber===null||comparisonNumber===primaryNumber
    ?[primaryNumber]:[primaryNumber,comparisonNumber];
  return {
    status:'DRAFT_UNVERIFIED',masterParameterCount:80,
    category2MarkerCount:60,referenceStatus:scope.referenceStatus,
    comparisonTable3Number:comparisonNumber,
    candidateTable3Numbers:numbers,
    candidateDisagreement:numbers.length>1,
    officialMappingAvailable:false,
  };
}
