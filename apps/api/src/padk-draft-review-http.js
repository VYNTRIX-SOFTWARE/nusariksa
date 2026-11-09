import {originAccepted,tokenFromCookies} from './auth-http.js';
import {findSession} from './sessions.js';
import {PadkPreparationError} from './padk-preparations.js';
import {
  padkDraftReviewStatus,padkDraftReviewHistory,listPendingPadkDrafts,
  submitPadkDraft,reviewPadkDraft,
} from './padk-draft-review.js';

const UUID='([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
const BASE='/regulatory/padk43/cyber/preparations/';
const QUEUE=BASE+'draft-review/pending';
const STATUS=new RegExp('^'+BASE+UUID+'/draft-review$','i');
const HISTORY=new RegExp('^'+BASE+UUID+'/draft-review/history$','i');
const SUBMIT=new RegExp('^'+BASE+UUID+'/draft-review/submit$','i');
const DECIDE=new RegExp('^'+BASE+UUID+'/draft-review/decision$','i');
const reply=(r,s,obj)=>{r.writeHead(s);r.end(JSON.stringify(obj));};
async function readDecision(req){
  if(req.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json')
    return {error:415};
  let size=0,tooLarge=false;const chunks=[];
  for await(const part of req){
    size+=part.length;if(size>3000)tooLarge=true;else chunks.push(part);
  }
  if(tooLarge)return {error:413};
  try{
    const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!value||typeof value!=='object'||Array.isArray(value)
      ||Object.keys(value).length!==2||!Object.hasOwn(value,'decision')
      ||!Object.hasOwn(value,'note'))return {error:400};
    return {body:value};
  }catch{return {error:400};}
}
export function createPadkDraftReviewHandler({
  db,appOrigin,status=padkDraftReviewStatus,history=padkDraftReviewHistory,
  queue=listPendingPadkDrafts,submit=submitPadkDraft,review=reviewPadkDraft,
}){
  return async function handle(req,res){
    const path=req.url??'',method=req.method;
    const state=STATUS.exec(path),events=HISTORY.exec(path),
      send=SUBMIT.exec(path),decision=DECIDE.exec(path);
    const pending=method==='GET'&&path===QUEUE;
    const fetching=method==='GET'&&state,
      listing=method==='GET'&&events,
      submitting=method==='POST'&&send,
      reviewing=method==='POST'&&decision;
    if(!pending&&!fetching&&!listing&&!submitting&&!reviewing){
      reply(res,404,{error:'Not found'});return;
    }
    if(!db||!appOrigin){reply(res,503,{error:'Unavailable'});return;}
    if((submitting||reviewing)&&!originAccepted(req,appOrigin)){
      reply(res,403,{error:'Forbidden'});return;
    }
    const cookie=tokenFromCookies(req.headers.cookie);
    const session=cookie?await findSession(db,cookie):null;
    if(!session){reply(res,401,{error:'Unauthorized'});return;}
    try{
      if(pending){reply(res,200,await queue(db,{actorId:session.userId}));return;}
      const id=(state??events??send??decision)[1],args={actorId:session.userId,id};
      if(fetching){reply(res,200,await status(db,args));return;}
      if(listing){reply(res,200,await history(db,args));return;}
      if(submitting){
        if(req.headers['content-length']&&Number(req.headers['content-length'])>0){
          reply(res,400,{error:'Submission does not accept a body'});return;
        }
        reply(res,200,await submit(db,args));return;
      }
      const payload=await readDecision(req);
      if(payload.error){reply(res,payload.error,{error:'Invalid request'});return;}
      reply(res,200,await review(db,{...args,...payload.body}));
    }catch(error){
      if(!(error instanceof PadkPreparationError))throw error;
      reply(res,error.status,{error:error.message});
    }
  };
}
