import {originAccepted,tokenFromCookies} from './auth-http.js';
import {findSession} from './sessions.js';
import {userHasPermission} from './authorization.js';
import {AssetError,createAsset,updateAsset,archiveAsset,listAssets,getAsset,assetHistory}
  from './ti-assets.js';

const UUID='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const DETAIL=new RegExp('^/assets/('+UUID+')$','i');
const HISTORY=new RegExp('^/assets/('+UUID+')/history$','i');
const ARCHIVE=new RegExp('^/assets/('+UUID+')/archive$','i');
const MAX_BODY=8192;
function reply(res,status,body){res.writeHead(status);res.end(JSON.stringify(body));}
async function readJson(request){
  if(request.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json')
    return {error:415};
  let size=0,large=false;const chunks=[];
  for await(const chunk of request){size+=chunk.length;if(size>MAX_BODY)large=true;else chunks.push(chunk);}
  if(large)return {error:413};
  try{
    const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!body||typeof body!=='object'||Array.isArray(body))return {error:400};
    return {body};
  }catch{return {error:400};}
}
export function createAssetHandler({
  db,appOrigin,
  list=listAssets,detail=getAsset,history=assetHistory,
  create=createAsset,update=updateAsset,archive=archiveAsset,
}={}){
  return async function handleAsset(req,res){
    let url;
    try{url=new URL(req.url,'http://localhost');}catch{reply(res,400,{error:'Invalid URL'});return;}
    const root=url.pathname==='/assets';
    const match=DETAIL.exec(url.pathname),hist=HISTORY.exec(url.pathname),arc=ARCHIVE.exec(url.pathname);
    const getList=root&&req.method==='GET',post=root&&req.method==='POST';
    const getDetail=Boolean(match)&&req.method==='GET';
    const patch=Boolean(match)&&req.method==='PATCH';
    const getHistory=Boolean(hist)&&req.method==='GET';
    const archiveReq=Boolean(arc)&&req.method==='POST';
    if(!getList&&!post&&!getDetail&&!patch&&!getHistory&&!archiveReq){
      reply(res,404,{error:'Not found'});return;
    }
    if(!db||!appOrigin){reply(res,503,{error:'Unavailable'});return;}
    if(!getList&&!getDetail&&!getHistory&&!originAccepted(req,appOrigin)){
      reply(res,403,{error:'Forbidden'});return;
    }
    const token=tokenFromCookies(req.headers.cookie);
    const session=token?await findSession(db,token):null;
    if(!session){reply(res,401,{error:'Unauthorized'});return;}
    const permission=getList||getDetail||getHistory?'assets:read':'assets:write';
    if(!await userHasPermission(db,session.userId,permission)){
      reply(res,403,{error:'Forbidden'});return;
    }
    try{
      if(getList){
        if([...url.searchParams].some(([k])=>!['q','status','kind','criticality','offset'].includes(k))
          ||new Set(url.searchParams.keys()).size!==[...url.searchParams.keys()].length)
          throw new AssetError(400,'Filter tidak valid');
        reply(res,200,await list(db,{
          actorId:session.userId,q:url.searchParams.get('q')??'',
          status:url.searchParams.get('status')??'active',
          kind:url.searchParams.get('kind')??'all',
          criticality:url.searchParams.get('criticality')??'all',
          offset:Number(url.searchParams.get('offset')??'0'),
        }));
        return;
      }
      if(getDetail){reply(res,200,await detail(db,{actorId:session.userId,id:match[1]}));return;}
      if(getHistory){reply(res,200,await history(db,{actorId:session.userId,id:hist[1]}));return;}
      const body=await readJson(req);
      if(body.error){reply(res,body.error,{error:'Invalid request'});return;}
      if(archiveReq){
        if(Object.keys(body.body).length!==1||!Object.hasOwn(body.body,'expectedRevision'))
          throw new AssetError(400,'Invalid archive data');
        reply(res,200,await archive(db,{actorId:session.userId,id:arc[1],...body.body}));
      }else if(patch){
        reply(res,200,await update(db,{actorId:session.userId,id:match[1],...body.body}));
      }else{
        reply(res,201,await create(db,{actorId:session.userId,...body.body}));
      }
    }catch(error){
      if(!(error instanceof AssetError))throw error;
      reply(res,error.status,{error:error.message});
    }
  };
}
