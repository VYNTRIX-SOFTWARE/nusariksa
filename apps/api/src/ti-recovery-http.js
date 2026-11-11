import {originAccepted,tokenFromCookies} from './auth-http.js';
import {findSession} from './sessions.js';
import {userHasPermission} from './authorization.js';
import {RecoveryError,listRecoveryPlans,getRecoveryPlan,createRecoveryPlan,
 updateRecoveryPlan,archiveRecoveryPlan,listRecoveryExercises,addRecoveryExercise,recoveryHistory} from './ti-recovery.js';
const U='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PLAN=new RegExp('^/recovery-plans/('+U+')$','i');
const ARCHIVE=new RegExp('^/recovery-plans/('+U+')/archive$','i');
const HISTORY=new RegExp('^/recovery-plans/('+U+')/history$','i');
const EXERCISE=new RegExp('^/recovery-plans/('+U+')/exercises$','i');
const reply=(res,status,data)=>{res.writeHead(status);res.end(JSON.stringify(data));};
async function json(req){
 if(req.headers['content-type']?.split(';')[0]?.trim()?.toLowerCase()!=='application/json')return {error:415};
 const parts=[];let n=0,over=false;
 for await(const chunk of req){n+=chunk.length;if(n>32768)over=true;else parts.push(chunk);}
 if(over)return {error:413};
 try{const body=JSON.parse(Buffer.concat(parts).toString('utf8'));return body&&typeof body==='object'&&!Array.isArray(body)?{body}:{error:400};}
 catch{return {error:400};}
}
export function createRecoveryHandler({db,appOrigin,list=listRecoveryPlans,detail=getRecoveryPlan,
 create=createRecoveryPlan,update=updateRecoveryPlan,archive=archiveRecoveryPlan,
 exercises=listRecoveryExercises,addExercise=addRecoveryExercise,history=recoveryHistory}={}){
 return async(req,res)=>{
  let url;try{url=new URL(req.url,'http://localhost');}catch{reply(res,400,{error:'Invalid URL'});return;}
  const root=url.pathname==='/recovery-plans',p=PLAN.exec(url.pathname),
   a=ARCHIVE.exec(url.pathname),h=HISTORY.exec(url.pathname),x=EXERCISE.exec(url.pathname);
  const op=[['list',root,'GET'],['create',root,'POST'],['detail',!!p,'GET'],['update',!!p,'PATCH'],
    ['archive',!!a,'POST'],['history',!!h,'GET'],['exercises',!!x,'GET'],['addExercise',!!x,'POST']]
    .find(v=>v[1]&&v[2]===req.method)?.[0];
  if(!op){reply(res,404,{error:'Not found'});return;}
  if(!db||!appOrigin){reply(res,503,{error:'Unavailable'});return;}
  const writing=['create','update','archive','addExercise'].includes(op);
  if(writing&&!originAccepted(req,appOrigin)){reply(res,403,{error:'Forbidden'});return;}
  const token=tokenFromCookies(req.headers.cookie),session=token?await findSession(db,token):null;
  if(!session){reply(res,401,{error:'Unauthorized'});return;}
  const actorId=session.userId;
  if(!await userHasPermission(db,actorId,writing?'recovery:write':'recovery:read')){
   reply(res,403,{error:'Forbidden'});return;}
  try{
   if(op==='list'){
    const keys=[...url.searchParams.keys()];
    if(keys.some(k=>!['view','q','offset'].includes(k))||new Set(keys).size!==keys.length)
      throw new RecoveryError(400,'Filter tidak valid');
    const os=url.searchParams.get('offset')??'0';
    if(!/^(0|[1-9][0-9]{0,4})$/.test(os))throw new RecoveryError(400,'Offset tidak valid');
    reply(res,200,await list(db,{actorId,view:url.searchParams.get('view')??'active',q:url.searchParams.get('q')??'',offset:Number(os)}));return;
   }
   if(op==='detail'){reply(res,200,await detail(db,{actorId,id:p[1]}));return;}
   if(op==='history'){reply(res,200,await history(db,{actorId,id:h[1]}));return;}
   if(op==='exercises'){reply(res,200,await exercises(db,{actorId,id:x[1]}));return;}
   const parsed=await json(req);
   if(parsed.error){reply(res,parsed.error,{error:'Data permintaan tidak valid'});return;}
   if(op==='archive'&&(!Object.hasOwn(parsed.body,'expectedRevision')||Object.keys(parsed.body).length!==1))
     throw new RecoveryError(400,'Revisi tidak valid');
   let result;
   if(op==='create')result=await create(db,{actorId,...parsed.body});
   else if(op==='update')result=await update(db,{actorId,id:p[1],...parsed.body});
   else if(op==='archive')result=await archive(db,{actorId,id:a[1],...parsed.body});
   else result=await addExercise(db,{actorId,id:x[1],...parsed.body});
   reply(res,['create','addExercise'].includes(op)?201:200,result);
  }catch(e){if(!(e instanceof RecoveryError))throw e;reply(res,e.status,{error:e.message});}
 };
}
