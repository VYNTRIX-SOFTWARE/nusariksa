import {originAccepted,tokenFromCookies} from './auth-http.js';
import {findSession} from './sessions.js';
import {userHasPermission} from './authorization.js';
import {IncidentError,createIncident,updateIncident,appendIncidentTimeline,archiveIncident,
  listIncidents,getIncident,incidentHistory,listIncidentOptions} from './ti-incidents.js';

const UUID='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const DETAIL=new RegExp('^/incidents/('+UUID+')$','i');
const HISTORY=new RegExp('^/incidents/('+UUID+')/history$','i');
const TIMELINE=new RegExp('^/incidents/('+UUID+')/timeline$','i');
const ARCHIVE=new RegExp('^/incidents/('+UUID+')/archive$','i');
const MAX_BODY=16384;
const reply=(res,status,body)=>{res.writeHead(status);res.end(JSON.stringify(body));};
async function readJson(req){
  if(req.headers['content-type']?.split(';')[0]?.trim()?.toLowerCase()!=='application/json')
    return {status:415};
  let size=0,tooLarge=false;const parts=[];
  for await(const chunk of req){
    size+=chunk.length;
    if(size>MAX_BODY)tooLarge=true;
    else parts.push(chunk);
  }
  if(tooLarge)return {status:413};
  try{
    const body=JSON.parse(Buffer.concat(parts).toString('utf8'));
    if(!body||typeof body!=='object'||Array.isArray(body))return {status:400};
    return {body};
  }catch{return {status:400};}
}
export function createIncidentHandler({
  db,appOrigin,list=listIncidents,detail=getIncident,history=incidentHistory,
  options=listIncidentOptions,create=createIncident,update=updateIncident,
  timeline=appendIncidentTimeline,archive=archiveIncident,
}={}){
  return async function handle(req,res){
    let url;
    try{url=new URL(req.url,'http://localhost');}
    catch{reply(res,400,{error:'Invalid URL'});return;}
    const root=url.pathname==='/incidents';
    const optionsReq=url.pathname==='/incidents/options'&&req.method==='GET';
    const match=DETAIL.exec(url.pathname),hist=HISTORY.exec(url.pathname),
      note=TIMELINE.exec(url.pathname),arch=ARCHIVE.exec(url.pathname);
    const listing=root&&req.method==='GET',creating=root&&req.method==='POST',
      getting=Boolean(match)&&req.method==='GET',
      editing=Boolean(match)&&req.method==='PATCH',
      historyReq=Boolean(hist)&&req.method==='GET',
      addingNote=Boolean(note)&&req.method==='POST',
      archiving=Boolean(arch)&&req.method==='POST';
    if(!listing&&!creating&&!optionsReq&&!getting&&!editing
      &&!historyReq&&!addingNote&&!archiving){
      reply(res,404,{error:'Not found'});return;
    }
    if(!db||!appOrigin){reply(res,503,{error:'Unavailable'});return;}
    const write=creating||editing||addingNote||archiving;
    if(write&&!originAccepted(req,appOrigin)){reply(res,403,{error:'Forbidden'});return;}
    const token=tokenFromCookies(req.headers.cookie);
    const session=token?await findSession(db,token):null;
    if(!session){reply(res,401,{error:'Unauthorized'});return;}
    if(!await userHasPermission(db,session.userId,write?'incidents:write':'incidents:read')){
      reply(res,403,{error:'Forbidden'});return;
    }
    try{
      if(listing){
        const keys=[...url.searchParams.keys()];
        if(keys.some(k=>!['q','view','status','severity','category','offset'].includes(k))
          ||new Set(keys).size!==keys.length)
          throw new IncidentError(400,'Filter insiden tidak valid');
        reply(res,200,await list(db,{actorId:session.userId,
          q:url.searchParams.get('q')??'',view:url.searchParams.get('view')??'active',
          status:url.searchParams.get('status')??'all',
          severity:url.searchParams.get('severity')??'all',
          category:url.searchParams.get('category')??'all',
          offset:Number(url.searchParams.get('offset')??'0'),
        }));return;
      }
      if(optionsReq){reply(res,200,await options(db,{actorId:session.userId}));return;}
      if(getting){reply(res,200,await detail(db,{actorId:session.userId,id:match[1]}));return;}
      if(historyReq){reply(res,200,await history(db,{actorId:session.userId,id:hist[1]}));return;}
      const body=await readJson(req);
      if(body.status){reply(res,body.status,{error:'Invalid request'});return;}
      if(archiving){
        if(Object.keys(body.body).length!==1
          ||!Object.hasOwn(body.body,'expectedRevision'))
          throw new IncidentError(400,'Data arsip tidak valid');
        reply(res,200,await archive(db,{actorId:session.userId,id:arch[1],...body.body}));
      }else if(addingNote){
        reply(res,200,await timeline(db,{actorId:session.userId,id:note[1],...body.body}));
      }else if(editing){
        reply(res,200,await update(db,{actorId:session.userId,id:match[1],...body.body}));
      }else reply(res,201,await create(db,{actorId:session.userId,...body.body}));
    }catch(error){
      if(!(error instanceof IncidentError))throw error;
      reply(res,error.status,{error:error.message});
    }
  };
}
