import { originAccepted, tokenFromCookies } from './auth-http.js';
import { userHasPermission } from './authorization.js';
import { findSession } from './sessions.js';
import {
  MaturityError, createMaturityModel, listMaturityModels, listMaturityVersions,
  createNextMaturityVersion, addMaturityDomain, setMaturityLevel,
  getMaturityRubric, publishMaturityVersion,
} from './maturity-models.js';

const ID='([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
const VERSIONS=new RegExp('^/maturity-models/'+ID+'/versions$','i');
const DOMAINS=new RegExp('^/maturity-versions/'+ID+'/domains$','i');
const PUBLISH=new RegExp('^/maturity-versions/'+ID+'/publish$','i');
const LEVEL=new RegExp('^/maturity-domains/'+ID+'/levels/([0-5])$','i');
const MAX_BODY=4096;
function respond(response,status,body){
  response.writeHead(status);
  response.end(JSON.stringify(body));
}
async function jsonBody(request,required,optional=[]) {
  if(request.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json')
    return {status:415};
  let size=0,tooLarge=false;
  const chunks=[];
  for await(const chunk of request){
    size+=chunk.length;
    if(size>MAX_BODY)tooLarge=true; else chunks.push(chunk);
  }
  if(tooLarge)return {status:413};
  try{
    const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!data || Array.isArray(data) || typeof data!=='object'
      || !required.every(k=>typeof data[k]==='string')
      || !Object.keys(data).every(k=>required.includes(k)||optional.includes(k))
      || !optional.every(k=>data[k]===undefined||typeof data[k]==='string')) {
      return {status:400};
    }
    return {data};
  }catch{return {status:400};}
}

export function createMaturityHandler({
  db,appOrigin,
  create=createMaturityModel,list=listMaturityModels,
  versions=listMaturityVersions,nextVersion=createNextMaturityVersion,
  domains=getMaturityRubric,addDomain=addMaturityDomain,
  setLevel=setMaturityLevel,publish=publishMaturityVersion,
}){
  return async function handleMaturity(request,response){
    const path=request.url??'';
    const method=request.method;
    const versionMatch=VERSIONS.exec(path);
    const domainMatch=DOMAINS.exec(path);
    const publishMatch=PUBLISH.exec(path);
    const levelMatch=LEVEL.exec(path);
    const isRead=method==='GET';
    const isWrite=method==='POST'||method==='PUT';
    const supported=(path==='/maturity-models' && (method==='GET'||method==='POST'))
      || (versionMatch && (method==='GET'||method==='POST'))
      || (domainMatch && (method==='GET'||method==='POST'))
      || (publishMatch&&method==='POST')
      || (levelMatch&&method==='PUT');
    if(!supported){respond(response,404,{error:'Not found'});return;}
    if(!db||!appOrigin){respond(response,503,{error:'Unavailable'});return;}
    if(isWrite&&!originAccepted(request,appOrigin)){
      respond(response,403,{error:'Forbidden'});return;
    }
    const token=tokenFromCookies(request.headers.cookie);
    const session=token?await findSession(db,token):null;
    if(!session){respond(response,401,{error:'Unauthorized'});return;}
    if(!await userHasPermission(db,session.userId,
      isRead?'assessments:read':'assessments:write')){
      respond(response,403,{error:'Forbidden'});return;
    }
    try{
      if(isRead) {
        if(path==='/maturity-models')respond(response,200,await list(db,session.userId));
        else if(versionMatch)respond(response,200,await versions(db,session.userId,versionMatch[1]));
        else respond(response,200,await domains(db,session.userId,domainMatch[1]));
        return;
      }
      if(versionMatch) {
        respond(response,201,await nextVersion(db,{actorId:session.userId,modelId:versionMatch[1]}));
        return;
      }
      if(publishMatch) {
        respond(response,200,await publish(db,{actorId:session.userId,versionId:publishMatch[1]}));
        return;
      }
      const required=levelMatch?['criterion']:path==='/maturity-models'
        ?['code','title','methodologyReference']:['code','title'];
      const parsed=await jsonBody(request,required,domainMatch?['description']:[]);
      if(parsed.status){respond(response,parsed.status,{error:'Invalid request'});return;}
      if(levelMatch){
        respond(response,200,await setLevel(db,{
          actorId:session.userId,domainId:levelMatch[1],
          level:Number(levelMatch[2]),criterion:parsed.data.criterion,
        }));
      }else if(domainMatch){
        respond(response,201,await addDomain(db,{
          actorId:session.userId,versionId:domainMatch[1],...parsed.data,
        }));
      }else{
        respond(response,201,await create(db,{actorId:session.userId,...parsed.data}));
      }
    }catch(error){
      if(!(error instanceof MaturityError))throw error;
      respond(response,error.status,{error:error.message});
    }
  };
}
