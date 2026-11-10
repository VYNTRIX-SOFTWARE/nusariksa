import {originAccepted,tokenFromCookies} from './auth-http.js';
import {findSession} from './sessions.js';
import {userHasPermission} from './authorization.js';
import {RiskError,createRisk,updateRisk,archiveRisk,listRisks,getRisk,riskHistory,listRiskAssets}
  from './ti-risks.js';
const UUID='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const DETAIL=new RegExp('^/risks/('+UUID+')$','i');
const HISTORY=new RegExp('^/risks/('+UUID+')/history$','i');
const ARCHIVE=new RegExp('^/risks/('+UUID+')/archive$','i');
const MAX_BODY=8192;
const reply=(res,status,data)=>{res.writeHead(status);res.end(JSON.stringify(data));};
async function readJson(req){
  if(req.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json')
    return {status:415};
  let size=0,oversized=false;const parts=[];
  for await(const chunk of req){
    size+=chunk.length;
    if(size>MAX_BODY)oversized=true;
    else parts.push(chunk);
  }
  if(oversized)return {status:413};
  try{
    const body=JSON.parse(Buffer.concat(parts).toString('utf8'));
    if(!body||typeof body!=='object'||Array.isArray(body))return {status:400};
    return {body};
  }catch{return {status:400};}
}
export function createRiskHandler({db,appOrigin,list=listRisks,detail=getRisk,
  history=riskHistory,assets=listRiskAssets,create=createRisk,update=updateRisk,
  archive=archiveRisk}={}){
  return async function handle(req,res){
    let url;
    try{url=new URL(req.url,'http://localhost');}
    catch{reply(res,400,{error:'Invalid URL'});return;}
    const root=url.pathname==='/risks';
    const assetOptions=url.pathname==='/risks/asset-options'&&req.method==='GET';
    const match=DETAIL.exec(url.pathname),historyMatch=HISTORY.exec(url.pathname),
      archiveMatch=ARCHIVE.exec(url.pathname);
    const listing=root&&req.method==='GET',creating=root&&req.method==='POST',
      getting=Boolean(match)&&req.method==='GET',
      editing=Boolean(match)&&req.method==='PATCH',
      historyReq=Boolean(historyMatch)&&req.method==='GET',
      archiving=Boolean(archiveMatch)&&req.method==='POST';
    if(!listing&&!creating&&!assetOptions&&!getting&&!editing&&!historyReq&&!archiving){
      reply(res,404,{error:'Not found'});return;
    }
    if(!db||!appOrigin){reply(res,503,{error:'Unavailable'});return;}
    const writing=creating||editing||archiving;
    if(writing&&!originAccepted(req,appOrigin)){reply(res,403,{error:'Forbidden'});return;}
    const token=tokenFromCookies(req.headers.cookie);
    const session=token?await findSession(db,token):null;
    if(!session){reply(res,401,{error:'Unauthorized'});return;}
    if(!await userHasPermission(db,session.userId,writing?'risks:write':'risks:read')){
      reply(res,403,{error:'Forbidden'});return;
    }
    try{
      if(listing){
        const keys=[...url.searchParams.keys()];
        if(keys.some(x=>!['q','view','status','level','assetId','offset'].includes(x))
          ||new Set(keys).size!==keys.length)throw new RiskError(400,'Filter risiko tidak valid');
        reply(res,200,await list(db,{
          actorId:session.userId,q:url.searchParams.get('q')??'',
          view:url.searchParams.get('view')??'active',
          status:url.searchParams.get('status')??'all',
          level:url.searchParams.get('level')??'all',
          assetId:url.searchParams.get('assetId')??'all',
          offset:Number(url.searchParams.get('offset')??'0'),
        }));return;
      }
      if(assetOptions){reply(res,200,await assets(db,{actorId:session.userId}));return;}
      if(getting){reply(res,200,await detail(db,{actorId:session.userId,id:match[1]}));return;}
      if(historyReq){
        reply(res,200,await history(db,{actorId:session.userId,id:historyMatch[1]}));return;
      }
      const parsed=await readJson(req);
      if(parsed.status){reply(res,parsed.status,{error:'Invalid request'});return;}
      if(archiving){
        if(Object.keys(parsed.body).length!==1
          ||!Object.hasOwn(parsed.body,'expectedRevision'))
          throw new RiskError(400,'Payload arsip tidak valid');
        reply(res,200,await archive(db,{actorId:session.userId,id:archiveMatch[1],...parsed.body}));
      }else if(editing){
        reply(res,200,await update(db,{actorId:session.userId,id:match[1],...parsed.body}));
      }else reply(res,201,await create(db,{actorId:session.userId,...parsed.body}));
    }catch(error){
      if(!(error instanceof RiskError))throw error;
      reply(res,error.status,{error:error.message});
    }
  };
}
