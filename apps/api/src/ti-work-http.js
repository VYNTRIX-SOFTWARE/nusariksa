import {tokenFromCookies} from './auth-http.js';
import {findSession} from './sessions.js';
import {getTiWorkOverview,TiWorkError} from './ti-work-overview.js';

const respond=(res,status,body)=>{res.writeHead(status);res.end(JSON.stringify(body));};
export function createTiWorkHandler({db,appOrigin,overview=getTiWorkOverview}={}){
  return async function handle(req,res){
    if(req.method!=='GET'||req.url!=='/ti-work/overview'){
      respond(res,404,{error:'Not found'});return;
    }
    if(!db||!appOrigin){respond(res,503,{error:'Unavailable'});return;}
    const token=tokenFromCookies(req.headers.cookie);
    const session=token?await findSession(db,token):null;
    if(!session){respond(res,401,{error:'Unauthorized'});return;}
    try{
      const result=await overview(db,{actorId:session.userId});
      res.setHeader('Cache-Control','no-store');
      respond(res,200,result);
    }catch(error){
      if(!(error instanceof TiWorkError))throw error;
      respond(res,error.status,{error:error.message});
    }
  };
}
