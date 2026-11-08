import {originAccepted,tokenFromCookies} from './auth-http.js';
import {userHasPermission} from './authorization.js';
import {findSession} from './sessions.js';
import {
  PadkPreparationError,createPadkPreparation,listPadkPreparations,
  getPadkPreparation,savePadkPreparation,historyPadkPreparation,
} from './padk-preparations.js';
import {
  listPadkIndicatorNotes,savePadkIndicatorNote,historyPadkIndicatorNote,
} from './padk-preparation-indicators.js';
import {getPadkPreparationWorkpaper} from './padk-preparation-workpaper.js';

const BASE='/regulatory/padk43/cyber/preparations';
const UUID='([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
const DETAIL=new RegExp('^'+BASE+'/'+UUID+'$','i');
const HISTORY=new RegExp('^'+BASE+'/'+UUID+'/history$','i');
const INDICATORS=new RegExp('^'+BASE+'/'+UUID+'/indicators$','i');
const INDICATOR=new RegExp('^'+BASE+'/'+UUID+'/indicators/([1-9][0-9]?)$','i');
const INDICATOR_HISTORY=new RegExp('^'+BASE+'/'+UUID+'/indicators/([1-9][0-9]?)/history$','i');
const WORKPAPER=new RegExp('^'+BASE+'/'+UUID+'/workpaper\\.pdf$','i');
const LIMIT=12288;
function respond(response,status,data){response.writeHead(status);response.end(JSON.stringify(data));}
async function readJson(request,fields){
  if(request.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json')
    return {error:415};
  const chunks=[];let total=0,oversized=false;
  for await(const chunk of request){
    total+=chunk.length;
    if(total>LIMIT)oversized=true;else chunks.push(chunk);
  }
  if(oversized)return {error:413};
  try{
    const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!value||typeof value!=='object'||Array.isArray(value)
      ||Object.keys(value).length!==fields.length
      ||!fields.every(key=>Object.hasOwn(value,key)))
      return {error:400};
    return {body:value};
  }catch{return {error:400};}
}
export function createPadkPreparationsHandler({
  db,appOrigin,
  create=createPadkPreparation,list=listPadkPreparations,
  detail=getPadkPreparation,save=savePadkPreparation,
  history=historyPadkPreparation,
  indicators=listPadkIndicatorNotes,saveIndicator=savePadkIndicatorNote,
  indicatorHistory=historyPadkIndicatorNote,
  workpaper=getPadkPreparationWorkpaper,
}){
  return async function handlePadkPreparations(request,response){
    const path=request.url??'',method=request.method;
    const id=DETAIL.exec(path),audit=HISTORY.exec(path);
    const indicatorList=INDICATORS.exec(path),singleIndicator=INDICATOR.exec(path),
      indicatorAudit=INDICATOR_HISTORY.exec(path),workpaperMatch=WORKPAPER.exec(path);
    const listing=path===BASE&&method==='GET';
    const creation=path===BASE&&method==='POST';
    const fetching=id&&method==='GET';
    const saving=id&&method==='PUT';
    const events=audit&&method==='GET';
    const listingIndicators=indicatorList&&method==='GET';
    const updatingIndicator=singleIndicator&&method==='PUT';
    const listingIndicatorEvents=indicatorAudit&&method==='GET';
    const downloadingWorkpaper=workpaperMatch&&method==='GET';
    if(!listing&&!creation&&!fetching&&!saving&&!events
      &&!listingIndicators&&!updatingIndicator&&!listingIndicatorEvents&&!downloadingWorkpaper){
      respond(response,404,{error:'Not found'});return;
    }
    if(!db||!appOrigin){respond(response,503,{error:'Unavailable'});return;}
    if((creation||saving||updatingIndicator)&&!originAccepted(request,appOrigin)){
      respond(response,403,{error:'Forbidden'});return;
    }
    const token=tokenFromCookies(request.headers.cookie);
    const session=token?await findSession(db,token):null;
    if(!session){respond(response,401,{error:'Unauthorized'});return;}
    const permission=creation||saving||updatingIndicator?'assessments:write':
      downloadingWorkpaper?'reports:read':'assessments:read';
    if(!await userHasPermission(db,session.userId,permission)){
      respond(response,403,{error:'Forbidden'});return;
    }
    try{
      if(downloadingWorkpaper){
        const result=await workpaper(db,{actorId:session.userId,id:workpaperMatch[1]});
        response.setHeader('Content-Type','application/pdf');
        response.setHeader('Content-Disposition',
          'attachment; filename="'+result.filename+'"');
        response.setHeader('X-Content-Type-Options','nosniff');
        response.writeHead(200);response.end(result.pdf);return;
      }
      if(listing){respond(response,200,await list(db,{actorId:session.userId}));return;}
      if(fetching){respond(response,200,await detail(db,{actorId:session.userId,id:id[1]}));return;}
      if(events){respond(response,200,await history(db,{actorId:session.userId,id:audit[1]}));return;}
      if(listingIndicators){
        respond(response,200,await indicators(db,{actorId:session.userId,id:indicatorList[1]}));
        return;
      }
      if(listingIndicatorEvents){
        respond(response,200,await indicatorHistory(db,{
          actorId:session.userId,id:indicatorAudit[1],number:indicatorAudit[2],
        }));return;
      }
      const fields=creation?['title','category','periodStart','periodEnd']
        :['preparationNotes','evidencePlan','expectedRevision'];
      const input=await readJson(request,fields);
      if(input.error){respond(response,input.error,{error:'Invalid request'});return;}
      if(updatingIndicator){
        respond(response,200,await saveIndicator(db,{
          actorId:session.userId,id:singleIndicator[1],number:singleIndicator[2],
          ...input.body,
        }));
      }else if(creation){
        respond(response,201,await create(db,{actorId:session.userId,...input.body}));
      }else{
        respond(response,200,await save(db,{actorId:session.userId,id:id[1],...input.body}));
      }
    }catch(error){
      if(!(error instanceof PadkPreparationError))throw error;
      respond(response,error.status,{error:error.message});
    }
  };
}
