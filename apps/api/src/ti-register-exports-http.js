import {tokenFromCookies} from './auth-http.js';
import {findSession} from './sessions.js';
import {MaturityError} from './maturity-models.js';
import {PadkPreparationError} from './padk-preparations.js';
import {userHasPermission} from './authorization.js';
import {
  REGISTER_EXPORTS,RegisterExportError,exportOperationalRegister,
  exportMaturityWorksheet,exportPadkDraftWorksheet,
} from './ti-register-exports.js';
import {exportOperationalRegisterPdf} from './ti-register-pdf.js';

const UUID='([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
const SINGLE=new RegExp('^/register-exports/(maturity|padk)/'+UUID+'\\.csv$','i');
const ROOT=/^\/register-exports\/([a-z-]+)\.(csv|pdf)$/;
const respond=(res,status,body)=>{res.writeHead(status);res.end(JSON.stringify(body));};
export function createTiRegisterExportsHandler({db,appOrigin,
  register=exportOperationalRegister,pdf=exportOperationalRegisterPdf,
  maturity=exportMaturityWorksheet,padk=exportPadkDraftWorksheet}={}){
  return async function handle(req,res){
    const path=req.url??'',detail=req.method==='GET'?SINGLE.exec(path):null;
    const simple=req.method==='GET'?ROOT.exec(path):null;
    if(!detail&&!(simple&&Object.hasOwn(REGISTER_EXPORTS,simple[1]))){
      respond(res,404,{error:'Not found'});return;
    }
    if(!db||!appOrigin){respond(res,503,{error:'Unavailable'});return;}
    const token=tokenFromCookies(req.headers.cookie);
    const session=token?await findSession(db,token):null;
    if(!session){respond(res,401,{error:'Unauthorized'});return;}
    if(!await userHasPermission(db,session.userId,'reports:read')){
      respond(res,403,{error:'Forbidden'});return;
    }
    try{
      const format=detail?'csv':simple[2];
      const type=detail?detail[1].toLowerCase():simple[1];
      const file=detail
        ?(type==='maturity'
          ?await maturity(db,{actorId:session.userId,id:detail[2]})
          :await padk(db,{actorId:session.userId,id:detail[2]}))
        :format==='pdf'
          ?await pdf(db,{actorId:session.userId,type})
          :await register(db,{actorId:session.userId,type});
      res.setHeader('Content-Type',format==='pdf'?'application/pdf':'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition',
        'attachment; filename="nusariksa-'+type+'-internal.'+format+'"');
      res.setHeader('Cache-Control','no-store');
      res.setHeader('X-Content-Type-Options','nosniff');
      res.setHeader('Content-Security-Policy','sandbox');
      res.writeHead(200);res.end(file);
    }catch(error){
      if(![RegisterExportError,MaturityError,PadkPreparationError].some(type=>error instanceof type))
        throw error;
      respond(res,error.status??400,{error:error.message});
    }
  };
}
