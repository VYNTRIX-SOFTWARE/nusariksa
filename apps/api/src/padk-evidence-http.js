import {originAccepted,tokenFromCookies} from './auth-http.js';
import {userHasPermission} from './authorization.js';
import {findSession} from './sessions.js';
import {EvidenceError} from './assessment-evidence.js';
import {configureEvidenceKeys} from './evidence-keyring.js';
import {PadkPreparationError} from './padk-preparations.js';
import {
  listPadkEvidence,uploadPadkEvidence,downloadPadkEvidence,
} from './padk-evidence.js';

const UUID='([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
const BASE='/regulatory/padk43/cyber/preparations/';
const LIST=new RegExp('^'+BASE+UUID+'/indicators/([1-9][0-9]?)/evidence$','i');
const FILE=new RegExp('^'+BASE+UUID+'/evidence/'+UUID+'/download$','i');
const MAX_BODY=1410000;
const respond=(res,status,body)=>{res.writeHead(status);res.end(JSON.stringify(body));};
async function parseUpload(req){
  if(req.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json')
    return {status:415};
  const chunks=[];let size=0,over=false;
  for await(const chunk of req){
    size+=chunk.length;if(size>MAX_BODY)over=true;else chunks.push(chunk);
  }
  if(over)return {status:413};
  try{
    const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const keys=['fileName','mediaType','contentBase64'];
    if(!data||typeof data!=='object'||Array.isArray(data)
      ||Object.keys(data).length!==keys.length
      ||!keys.every(x=>typeof data[x]==='string'))
      return {status:400};
    return {data};
  }catch{return {status:400};}
}
export function createPadkEvidenceHandler({
  db,appOrigin,evidenceKey,evidenceKeyring,evidenceActiveKeyId,
  list=listPadkEvidence,upload=uploadPadkEvidence,download=downloadPadkEvidence,
}){
  const key=configureEvidenceKeys({legacyKey:evidenceKey,keysJson:evidenceKeyring,activeId:evidenceActiveKeyId});
  return async function handlePadkEvidence(req,res){
    const path=req.url??'',method=req.method;
    const indicator=LIST.exec(path),file=FILE.exec(path);
    const isList=method==='GET'&&!!indicator,isUpload=method==='POST'&&!!indicator,
      isDownload=method==='GET'&&!!file;
    if(!isList&&!isUpload&&!isDownload){
      respond(res,404,{error:'Not found'});return;
    }
    if(!db||!appOrigin){respond(res,503,{error:'Unavailable'});return;}
    if(isUpload&&!originAccepted(req,appOrigin)){
      respond(res,403,{error:'Forbidden'});return;
    }
    const token=tokenFromCookies(req.headers.cookie);
    const session=token?await findSession(db,token):null;
    if(!session){respond(res,401,{error:'Unauthorized'});return;}
    if(!await userHasPermission(db,session.userId,
      isUpload?'evidence:write':'evidence:read')){
      respond(res,403,{error:'Forbidden'});return;
    }
    if((isUpload||isDownload)&&!key){
      respond(res,503,{error:'Evidence encryption is not configured'});return;
    }
    try{
      if(isList){
        respond(res,200,await list(db,{
          actorId:session.userId,id:indicator[1],number:indicator[2],
        }));return;
      }
      if(isDownload){
        const result=await download(db,{
          actorId:session.userId,id:file[1],evidenceId:file[2],key,
        });
        res.setHeader('Content-Type','application/octet-stream');
        res.setHeader('Content-Disposition',
          'attachment; filename="padk-evidence.bin"; filename*=UTF-8'+
          "''"+encodeURIComponent(result.fileName));
        res.setHeader('Content-Security-Policy','sandbox');
        res.setHeader('Content-Length',String(result.data.length));
        res.writeHead(200);res.end(result.data);return;
      }
      const body=await parseUpload(req);
      if(body.status){respond(res,body.status,{error:'Invalid request'});return;}
      respond(res,201,await upload(db,{
        actorId:session.userId,id:indicator[1],number:indicator[2],
        ...body.data,key,
      }));
    }catch(error){
      if(!(error instanceof EvidenceError||error instanceof PadkPreparationError))
        throw error;
      respond(res,error.status,{error:error.message});
    }
  };
}
