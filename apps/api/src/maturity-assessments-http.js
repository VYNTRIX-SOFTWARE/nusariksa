import {originAccepted,tokenFromCookies} from './auth-http.js';
import {userHasPermission} from './authorization.js';
import {findSession} from './sessions.js';
import {MaturityError} from './maturity-models.js';
import {
  submitMaturityAssessment,reviewMaturityAssessment,listMaturityReviewHistory,
  listPendingMaturityReviews,
} from './maturity-assessment-reviews.js';
import {
  createMaturityAssessment,listMaturityAssessments,getMaturityAssessment,
  rateMaturityDomain,listMaturityDomainHistory,
} from './maturity-assessments.js';

const ID='([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
const SINGLE=new RegExp('^/maturity-assessments/'+ID+'$','i');
const RESULT=new RegExp('^/maturity-assessments/'+ID+'/domains/'+ID+'$','i');
const HISTORY=new RegExp('^/maturity-assessments/'+ID+'/domains/'+ID+'/history$','i');
const SUBMIT=new RegExp('^/maturity-assessments/'+ID+'/submit'+String.fromCharCode(36),'i');
const REVIEW_QUEUE='/maturity-assessments/review-queue';
const REVIEW=new RegExp('^/maturity-assessments/'+ID+'/review$','i');
const REVIEWS=new RegExp('^/maturity-assessments/'+ID+'/reviews$','i');
const MAX_BODY=6000;
function respond(response,status,value){
  response.writeHead(status);
  response.end(JSON.stringify(value));
}
async function bodyJson(request,required,optional=[]){
  if(request.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json')
    return {status:415};
  const chunks=[];let length=0,oversized=false;
  for await(const chunk of request){
    length+=chunk.length;
    if(length>MAX_BODY)oversized=true;else chunks.push(chunk);
  }
  if(oversized)return {status:413};
  try{
    const obj=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!obj||typeof obj!=='object'||Array.isArray(obj)
      ||!required.every(key=>Object.hasOwn(obj,key))
      ||!Object.keys(obj).every(key=>required.includes(key)||optional.includes(key)))
      return {status:400};
    return {data:obj};
  }catch{return {status:400};}
}

export function createMaturityAssessmentsHandler({
  db,appOrigin,
  create=createMaturityAssessment,list=listMaturityAssessments,
  detail=getMaturityAssessment,rate=rateMaturityDomain,
  history=listMaturityDomainHistory,
  submit=submitMaturityAssessment,review=reviewMaturityAssessment,
  reviews=listMaturityReviewHistory,queue=listPendingMaturityReviews,
}){
  return async function handleMaturityAssessment(request,response){
    const path=request.url??'',method=request.method;
    const matchSingle=SINGLE.exec(path),matchResult=RESULT.exec(path),
      matchHistory=HISTORY.exec(path),matchSubmit=SUBMIT.exec(path),
      matchReview=REVIEW.exec(path),matchReviews=REVIEWS.exec(path);
    const supported=(path==='/maturity-assessments'&&['GET','POST'].includes(method))
      ||(path===REVIEW_QUEUE&&method==='GET')
      ||(matchSingle&&method==='GET')
      ||(matchResult&&method==='PUT')
      ||(matchHistory&&method==='GET')
      ||(matchSubmit&&method==='POST')
      ||(matchReview&&method==='POST')
      ||(matchReviews&&method==='GET');
    if(!supported){respond(response,404,{error:'Not found'});return;}
    if(!db||!appOrigin){respond(response,503,{error:'Unavailable'});return;}
    const writing=method==='POST'||method==='PUT';
    if(writing&&!originAccepted(request,appOrigin)){
      respond(response,403,{error:'Forbidden'});return;
    }
    const token=tokenFromCookies(request.headers.cookie);
    const session=token?await findSession(db,token):null;
    if(!session){respond(response,401,{error:'Unauthorized'});return;}
    if(!await userHasPermission(db,session.userId,
      (matchReview||path===REVIEW_QUEUE)?'assessments:approve':writing?'assessments:write':'assessments:read')){
      respond(response,403,{error:'Forbidden'});return;
    }
    try{
      if(method==='GET'){
        const value=path===REVIEW_QUEUE?await queue(db,{actorId:session.userId})
          :path==='/maturity-assessments'
          ?await list(db,{actorId:session.userId})
          :matchHistory?await history(db,{actorId:session.userId,
            assessmentId:matchHistory[1],domainId:matchHistory[2]})
          :matchReviews?await reviews(db,{actorId:session.userId,
            assessmentId:matchReviews[1]})
          :await detail(db,{actorId:session.userId,id:matchSingle[1]});
        respond(response,200,value);return;
      }
      if(matchSubmit){
        respond(response,200,await submit(db,{actorId:session.userId,
          assessmentId:matchSubmit[1]}));return;
      }
      const parsed=await bodyJson(request,
        matchReview?['decision','note']:method==='POST'
          ?['modelVersionId','title','periodStart','periodEnd']
          :['level','justification','expectedRevision'],
        method==='PUT'?['evidenceId']:[]);
      if(parsed.status){respond(response,parsed.status,{error:'Invalid request'});return;}
      const saved=matchReview
        ?await review(db,{actorId:session.userId,
          assessmentId:matchReview[1],...parsed.data})
        :method==='POST'?await create(db,{actorId:session.userId,...parsed.data})
        :await rate(db,{actorId:session.userId,
          assessmentId:matchResult[1],domainId:matchResult[2],...parsed.data});
      respond(response,method==='POST'&&!matchReview?201:200,saved);
    }catch(error){
      if(!(error instanceof MaturityError))throw error;
      respond(response,error.status,{error:error.message});
    }
  };
}