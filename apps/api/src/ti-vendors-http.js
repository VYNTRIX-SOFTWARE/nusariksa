import {originAccepted,tokenFromCookies} from './auth-http.js';
import {findSession} from './sessions.js';
import {userHasPermission} from './authorization.js';
import {VendorError,createVendor,updateVendor,archiveVendor,listVendors,getVendor,vendorHistory,
  createContract,updateContract,archiveContract,listContracts,getContract,
  addServiceReview,listServiceReviews} from './ti-vendors.js';

const U='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const VENDOR=new RegExp('^/vendors/('+U+')$','i');
const HISTORY=new RegExp('^/vendors/('+U+')/history$','i');
const ARCHIVE=new RegExp('^/vendors/('+U+')/archive$','i');
const CONTRACTS=new RegExp('^/vendors/('+U+')/contracts$','i');
const CONTRACT=new RegExp('^/vendors/('+U+')/contracts/('+U+')$','i');
const CONTRACT_ARCHIVE=new RegExp('^/vendors/('+U+')/contracts/('+U+')/archive$','i');
const REVIEWS=new RegExp('^/vendors/('+U+')/contracts/('+U+')/reviews$','i');
const reply=(res,status,data)=>{res.writeHead(status);res.end(JSON.stringify(data));};
async function json(req){
  if(req.headers['content-type']?.split(';')[0]?.trim()?.toLowerCase()!=='application/json')
    return {error:415};
  const chunks=[];let n=0,oversized=false;
  for await(const chunk of req){
    n+=chunk.length;if(n>16384)oversized=true;else chunks.push(chunk);
  }
  if(oversized)return {error:413};
  try{
    const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return body&&typeof body==='object'&&!Array.isArray(body)?{body}:{error:400};
  }catch{return {error:400};}
}
export function createVendorHandler({
  db,appOrigin,
  list=listVendors,detail=getVendor,history=vendorHistory,
  create=createVendor,update=updateVendor,archive=archiveVendor,
  contracts=listContracts,contract=getContract,
  addContract=createContract,editContract=updateContract,endContract=archiveContract,
  reviews=listServiceReviews,addReview=addServiceReview,
}={}){
  return async function handle(req,res){
    let url;try{url=new URL(req.url,'http://localhost');}
    catch{reply(res,400,{error:'Invalid URL'});return;}
    const root=url.pathname==='/vendors',v=VENDOR.exec(url.pathname),
      h=HISTORY.exec(url.pathname),a=ARCHIVE.exec(url.pathname),
      cs=CONTRACTS.exec(url.pathname),c=CONTRACT.exec(url.pathname),
      ca=CONTRACT_ARCHIVE.exec(url.pathname),rs=REVIEWS.exec(url.pathname);
    const routes=[
      ['list',root,'GET'],['create',root,'POST'],['detail',Boolean(v),'GET'],
      ['update',Boolean(v),'PATCH'],['history',Boolean(h),'GET'],
      ['archive',Boolean(a),'POST'],['contracts',Boolean(cs),'GET'],
      ['addContract',Boolean(cs),'POST'],['contract',Boolean(c),'GET'],
      ['editContract',Boolean(c),'PATCH'],['endContract',Boolean(ca),'POST'],
      ['reviews',Boolean(rs),'GET'],['addReview',Boolean(rs),'POST'],
    ];
    const match=routes.find(x=>x[1]&&x[2]===req.method);
    if(!match){reply(res,404,{error:'Not found'});return;}
    if(!db||!appOrigin){reply(res,503,{error:'Unavailable'});return;}
    const [op]=match;
    const writing=['create','update','archive','addContract','editContract','endContract','addReview'].includes(op);
    if(writing&&!originAccepted(req,appOrigin)){reply(res,403,{error:'Forbidden'});return;}
    const token=tokenFromCookies(req.headers.cookie);
    const session=token?await findSession(db,token):null;
    if(!session){reply(res,401,{error:'Unauthorized'});return;}
    if(!await userHasPermission(db,session.userId,writing?'vendors:write':'vendors:read')){
      reply(res,403,{error:'Forbidden'});return;
    }
    const actorId=session.userId;
    try{
      if(op==='list'){
        const keys=[...url.searchParams.keys()];
        if(keys.some(k=>!['q','view','category','status','offset'].includes(k))
          ||new Set(keys).size!==keys.length)
          throw new VendorError(400,'Filter tidak valid');
        const offsetString=url.searchParams.get('offset')??'0';
        if(!/^(0|[1-9][0-9]{0,4})$/.test(offsetString))
          throw new VendorError(400,'Offset tidak valid');
        reply(res,200,await list(db,{
          actorId,q:url.searchParams.get('q')??'',view:url.searchParams.get('view')??'active',
          category:url.searchParams.get('category')??'all',
          status:url.searchParams.get('status')??'all',offset:Number(offsetString),
        }));return;
      }
      if(op==='detail'){reply(res,200,await detail(db,{actorId,id:v[1]}));return;}
      if(op==='history'){reply(res,200,await history(db,{actorId,id:h[1]}));return;}
      if(op==='contracts'){reply(res,200,await contracts(db,{actorId,vendorId:cs[1]}));return;}
      if(op==='contract'){
        reply(res,200,await contract(db,{actorId,vendorId:c[1],id:c[2]}));return;
      }
      if(op==='reviews'){
        reply(res,200,await reviews(db,{actorId,vendorId:rs[1],contractId:rs[2]}));return;
      }
      const parsed=await json(req);
      if(parsed.error){reply(res,parsed.error,{error:'Data permintaan tidak valid'});return;}
      if(op==='archive'||op==='endContract'){
        if(Object.keys(parsed.body).length!==1||!Object.hasOwn(parsed.body,'expectedRevision'))
          throw new VendorError(400,'Revisi tidak valid');
      }
      let result,status=200;
      if(op==='create'){result=await create(db,{actorId,...parsed.body});status=201;}
      else if(op==='update')result=await update(db,{actorId,id:v[1],...parsed.body});
      else if(op==='archive')result=await archive(db,{actorId,id:a[1],...parsed.body});
      else if(op==='addContract'){
        result=await addContract(db,{actorId,vendorId:cs[1],...parsed.body});status=201;
      }else if(op==='editContract'){
        result=await editContract(db,{actorId,vendorId:c[1],id:c[2],...parsed.body});
      }else if(op==='endContract'){
        result=await endContract(db,{actorId,vendorId:ca[1],id:ca[2],...parsed.body});
      }else{
        result=await addReview(db,{actorId,vendorId:rs[1],contractId:rs[2],...parsed.body});
        status=201;
      }
      reply(res,status,result);
    }catch(error){
      if(!(error instanceof VendorError))throw error;
      reply(res,error.status,{error:error.message});
    }
  };
}
