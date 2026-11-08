import {originAccepted,tokenFromCookies} from './auth-http.js';
import {findSession} from './sessions.js';
import {userHasPermission} from './authorization.js';
import {
  CrosswalkError,listCrosswalkReviews,recordMappingReview,mappingReviewHistory,
} from './padk-crosswalk-reviews.js';
const BASE='/regulatory/padk43/cyber/crosswalk';
const UPDATE=/^\/regulatory\/padk43\/cyber\/crosswalk\/([1-9][0-9]?)$/;
const HISTORY=/^\/regulatory\/padk43\/cyber\/crosswalk\/([1-9][0-9]?)\/history$/;
const MAX=4096;
function respond(response,status,body){
  response.writeHead(status);response.end(JSON.stringify(body));
}
async function readPayload(request){
  if(request.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json')
    return {status:415};
  let length=0,tooLarge=false;const chunks=[];
  for await(const chunk of request){
    length+=chunk.length;
    if(length>MAX)tooLarge=true;else chunks.push(chunk);
  }
  if(tooLarge)return {status:413};
  try{
    const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const fields=['reviewTrack','decision','proposedTable3Number','proposedPdfPage',
      'basis','sourcePdfSha256','expectedLatestEventId'];
    if(!body||typeof body!=='object'||Array.isArray(body)
      ||Object.keys(body).length!==fields.length||!fields.every(k=>Object.hasOwn(body,k)))
      return {status:400};
    return {body};
  }catch{return {status:400};}
}
export function createCrosswalkReviewHandler({
  db,appOrigin,list=listCrosswalkReviews,
  submit=recordMappingReview,history=mappingReviewHistory,
}){
  return async function handle(request,response){
    const path=request.url??'',method=request.method;
    const update=UPDATE.exec(path),audit=HISTORY.exec(path);
    if(!((path===BASE&&method==='GET')||(update&&method==='POST')
      ||(audit&&method==='GET'))){
      respond(response,404,{error:'Not found'});return;
    }
    if(!db||!appOrigin){respond(response,503,{error:'Unavailable'});return;}
    if(update&&!originAccepted(request,appOrigin)){
      respond(response,403,{error:'Forbidden'});return;
    }
    const token=tokenFromCookies(request.headers.cookie);
    const session=token?await findSession(db,token):null;
    if(!session){respond(response,401,{error:'Unauthorized'});return;}
    if(!await userHasPermission(db,session.userId,'assessments:approve')){
      respond(response,403,{error:'Forbidden'});return;
    }
    try{
      if(path===BASE){
        respond(response,200,await list(db,{actorId:session.userId}));return;
      }
      if(audit){
        respond(response,200,await history(db,{
          actorId:session.userId,number:audit[1],
        }));return;
      }
      const payload=await readPayload(request);
      if(payload.status){
        respond(response,payload.status,{error:'Invalid request'});return;
      }
      respond(response,201,await submit(db,{
        actorId:session.userId,number:update[1],...payload.body,
      }));
    }catch(error){
      if(!(error instanceof CrosswalkError))throw error;
      respond(response,error.status,{error:error.message});
    }
  };
}
