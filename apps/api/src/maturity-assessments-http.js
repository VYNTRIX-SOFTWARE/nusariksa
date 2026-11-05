import {originAccepted,tokenFromCookies} from './auth-http.js';
import {userHasPermission} from './authorization.js';
import {findSession} from './sessions.js';
import {MaturityError} from './maturity-models.js';
import {
  createMaturityAssessment,listMaturityAssessments,getMaturityAssessment,
  rateMaturityDomain,listMaturityDomainHistory,
} from './maturity-assessments.js';

const ID='([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
const SINGLE=new RegExp('^/maturity-assessments/'+ID+'$','i');
const RESULT=new RegExp('^/maturity-assessments/'+ID+'/domains/'+ID+'$','i');
const HISTORY=new RegExp('^/maturity-assessments/'+ID+'/domains/'+ID+'/history$','i');
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
}){
  return async function handleMaturityAssessment(request,response){
    const path=request.url??'',method=request.method;
    const matchSingle=SINGLE.exec(path),matchResult=RESULT.exec(path),
      matchHistory=HISTORY.exec(path);
    const supported=(path==='/maturity-assessments'&&['GET','POST'].includes(method))
      ||(matchSingle&&method==='GET')
      ||(matchResult&&method==='PUT')
      ||(matchHistory&&method==='GET');
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
      writing?'assessments:write':'assessments:read')){
      respond(response,403,{error:'Forbidden'});return;
    }
    try{
      if(method==='GET'){
        const value=path==='/maturity-assessments'
          ?await list(db,{actorId:session.userId})
          :matchHistory?await history(db,{actorId:session.userId,
            assessmentId:matchHistory[1],domainId:matchHistory[2]})
            :await detail(db,{actorId:session.userId,id:matchSingle[1]});
        respond(response,200,value);return;
      }
      const parsed=await bodyJson(request,
        method==='POST'?['modelVersionId','title','periodStart','periodEnd']
          :['level','justification','expectedRevision'],
        method==='PUT'?['evidenceId']:[]);
      if(parsed.status){respond(response,parsed.status,{error:'Invalid request'});return;}
      const saved=method==='POST'
        ?await create(db,{actorId:session.userId,...parsed.data})
        :await rate(db,{actorId:session.userId,
          assessmentId:matchResult[1],domainId:matchResult[2],...parsed.data});
      respond(response,method==='POST'?201:200,saved);
    }catch(error){
      if(!(error instanceof MaturityError))throw error;
      respond(response,error.status,{error:error.message});
    }
  };
}
