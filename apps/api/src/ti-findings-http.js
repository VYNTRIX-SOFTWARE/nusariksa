import {originAccepted,tokenFromCookies} from './auth-http.js';
import {findSession} from './sessions.js';
import {userHasPermission} from './authorization.js';
import {FindingError,createFinding,updateFinding,submitFinding,reviewFinding,
  archiveFinding,listFindings,getFinding,findingHistory,findingSources}
  from './ti-findings.js';
const UUID='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const DETAIL=new RegExp('^/findings/('+UUID+')$','i');
const HISTORY=new RegExp('^/findings/('+UUID+')/history$','i');
const SUBMIT=new RegExp('^/findings/('+UUID+')/submit$','i');
const REVIEW=new RegExp('^/findings/('+UUID+')/review$','i');
const ARCHIVE=new RegExp('^/findings/('+UUID+')/archive$','i');
const reply=(res,status,data)=>{res.writeHead(status);res.end(JSON.stringify(data));};
async function readJson(req){
  if(req.headers['content-type']?.split(';')[0]?.trim()?.toLowerCase()!=='application/json')
    return {error:415};
  let length=0,tooLarge=false;const chunks=[];
  for await(const chunk of req){
    length+=chunk.length;
    if(length>16384)tooLarge=true;
    else chunks.push(chunk);
  }
  if(tooLarge)return {error:413};
  try{
    const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!body||typeof body!=='object'||Array.isArray(body))return {error:400};
    return {body};
  }catch{return {error:400};}
}
export function createFindingHandler({
  db,appOrigin,list=listFindings,detail=getFinding,history=findingHistory,
  sources=findingSources,create=createFinding,update=updateFinding,
  submit=submitFinding,review=reviewFinding,archive=archiveFinding,
}={}){
  return async function handle(req,res){
    let url;
    try{url=new URL(req.url,'http://localhost');}
    catch{reply(res,400,{error:'Invalid URL'});return;}
    const root=url.pathname==='/findings';
    const sourceOptions=url.pathname==='/findings/sources'&&req.method==='GET';
    const match=DETAIL.exec(url.pathname),hist=HISTORY.exec(url.pathname),
      sub=SUBMIT.exec(url.pathname),rev=REVIEW.exec(url.pathname),arc=ARCHIVE.exec(url.pathname);
    const listing=root&&req.method==='GET',creating=root&&req.method==='POST',
      getting=Boolean(match)&&req.method==='GET',
      editing=Boolean(match)&&req.method==='PATCH',readingHistory=Boolean(hist)&&req.method==='GET',
      submitting=Boolean(sub)&&req.method==='POST',
      reviewing=Boolean(rev)&&req.method==='POST',
      archiving=Boolean(arc)&&req.method==='POST';
    if(!listing&&!creating&&!sourceOptions&&!getting&&!editing&&!readingHistory
      &&!submitting&&!reviewing&&!archiving){
      reply(res,404,{error:'Not found'});return;
    }
    if(!db||!appOrigin){reply(res,503,{error:'Unavailable'});return;}
    const write=creating||editing||submitting||reviewing||archiving;
    if(write&&!originAccepted(req,appOrigin)){reply(res,403,{error:'Forbidden'});return;}
    const token=tokenFromCookies(req.headers.cookie);
    const session=token?await findSession(db,token):null;
    if(!session){reply(res,401,{error:'Unauthorized'});return;}
    const required=reviewing?'findings:verify':write?'findings:write':'findings:read';
    if(!await userHasPermission(db,session.userId,required)){
      reply(res,403,{error:'Forbidden'});return;
    }
    try{
      if(listing){
        const keys=[...url.searchParams.keys()];
        if(keys.some(k=>!['q','view','status','priority','source','offset'].includes(k))
          ||new Set(keys).size!==keys.length)
          throw new FindingError(400,'Filter temuan tidak valid');
        reply(res,200,await list(db,{actorId:session.userId,
          q:url.searchParams.get('q')??'',view:url.searchParams.get('view')??'active',
          status:url.searchParams.get('status')??'all',
          priority:url.searchParams.get('priority')??'all',
          source:url.searchParams.get('source')??'all',
          offset:Number(url.searchParams.get('offset')??'0'),
        }));return;
      }
      if(sourceOptions){reply(res,200,await sources(db,{actorId:session.userId}));return;}
      if(getting){reply(res,200,await detail(db,{actorId:session.userId,id:match[1]}));return;}
      if(readingHistory){
        reply(res,200,await history(db,{actorId:session.userId,id:hist[1]}));return;
      }
      const parsed=await readJson(req);
      if(parsed.error){reply(res,parsed.error,{error:'Permintaan tidak valid'});return;}
      if(submitting||archiving){
        if(Object.keys(parsed.body).length!==1||!Object.hasOwn(parsed.body,'expectedRevision'))
          throw new FindingError(400,'Data permintaan tidak valid');
        if(submitting)reply(res,200,await submit(db,{actorId:session.userId,id:sub[1],...parsed.body}));
        else reply(res,200,await archive(db,{actorId:session.userId,id:arc[1],...parsed.body}));
      }else if(reviewing){
        reply(res,200,await review(db,{actorId:session.userId,id:rev[1],...parsed.body}));
      }else if(editing){
        reply(res,200,await update(db,{actorId:session.userId,id:match[1],...parsed.body}));
      }else{
        reply(res,201,await create(db,{actorId:session.userId,...parsed.body}));
      }
    }catch(e){
      if(!(e instanceof FindingError))throw e;
      reply(res,e.status,{error:e.message});
    }
  };
}
