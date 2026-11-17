import { originAccepted, tokenFromCookies } from './auth-http.js';
import { userHasPermission } from './authorization.js';
import {CatalogError} from './control-catalogs.js';
import {ControlScopeError,listDefaultAssessmentControls} from './assessment-control-scopes.js';
import { findSession } from './sessions.js';
import {
  AssessmentError, createAssessment, createReadyAssessment, getAssessment, listAssessments, startAssessment,
} from './assessments.js';

const DETAILS = /^\/assessments\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const START = /^\/assessments\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/start$/i;
const MAX_BODY = 2048;
const MAX_SELECTION_BODY = 12000;

function respond(response, status, body) {
  response.writeHead(status);
  response.end(JSON.stringify(body));
}

async function readCreateBody(request,allowSelection=false) {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase()
    !== 'application/json') return { error: 415 };
  let size = 0;
  let oversized = false;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > (allowSelection?MAX_SELECTION_BODY:MAX_BODY)) oversized = true;
    else chunks.push(chunk);
  }
  if (oversized) return { error: 413 };
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || (Object.keys(body).length!==3 && !(allowSelection&&Object.keys(body).length===4))
      || !['title', 'periodStart', 'periodEnd'].every(key=>typeof body[key]==='string')
      || Object.keys(body).some(key=>!['title','periodStart','periodEnd',...(allowSelection?['controlIds']:[])].includes(key))
      || (Object.hasOwn(body,'controlIds')&&!Array.isArray(body.controlIds))) {
      return { error: 400 };
    }
    return { body };
  } catch {
    return { error: 400 };
  }
}

async function readStartBody(request){
  let size=0;const chunks=[];
  for await(const chunk of request){
    size+=chunk.length;
    if(size>MAX_SELECTION_BODY)return {error:413};
    chunks.push(chunk);
  }
  if(size===0)return {body:{}};
  if(request.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json')
    return {error:415};
  try{
    const parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!parsed||Array.isArray(parsed)||typeof parsed!=='object'
      ||Object.keys(parsed).length!==1||!Array.isArray(parsed.controlIds))
      return {error:400};
    return {body:parsed};
  }catch{return {error:400};}
}

export function createAssessmentsHandler({
  db, appOrigin,
  create = createAssessment, list = listAssessments,
  get = getAssessment, start = startAssessment, startDefault = createReadyAssessment,
  defaultControls=listDefaultAssessmentControls,
}) {
  return async function handleAssessments(request, response) {
    const isList = request.method === 'GET' && request.url === '/assessments';
    const isCreate = request.method === 'POST' && request.url === '/assessments';
    const isDefaultStart = request.method === 'POST' && request.url === '/assessments/start-default';
    const isDefaultControls=request.method==='GET'&&request.url==='/assessments/default-controls';
    const detail = request.method === 'GET' ? DETAILS.exec(request.url ?? '') : null;
    const begin = request.method === 'POST' ? START.exec(request.url ?? '') : null;
    if (!isList && !isCreate && !isDefaultStart && !isDefaultControls && !detail && !begin) {
      respond(response, 404, { error: 'Not found' });
      return;
    }
    if (!db || !appOrigin) {
      respond(response, 503, { error: 'Unavailable' });
      return;
    }
    if ((isCreate || isDefaultStart || begin) && !originAccepted(request, appOrigin)) {
      respond(response, 403, { error: 'Forbidden' });
      return;
    }

    const token = tokenFromCookies(request.headers.cookie);
    const session = token ? await findSession(db, token) : null;
    if (!session) {
      respond(response, 401, { error: 'Unauthorized' });
      return;
    }
    const permission = isCreate || isDefaultStart || begin ? 'assessments:write' : 'assessments:read';
    if (!await userHasPermission(db, session.userId, permission)) {
      respond(response, 403, { error: 'Forbidden' });
      return;
    }

    try {
      if(isDefaultControls){
        respond(response,200,await defaultControls(db,{actorId:session.userId}));return;
      }
      if (isList) {
        respond(response, 200, await list(db, session.userId));
        return;
      }
      if (detail) {
        respond(response, 200, await get(db, session.userId, detail[1]));
        return;
      }
      if (begin) {
        const scope=await readStartBody(request);
        if(scope.error){respond(response,scope.error,{error:'Invalid request'});return;}
        respond(response, 200, await start(db, { actorId: session.userId, id: begin[1],...scope.body }));
        return;
      }
      const input = await readCreateBody(request,isDefaultStart);
      if (input.error) {
        respond(response, input.error, { error: 'Invalid request' });
        return;
      }
      const result = await (isDefaultStart ? startDefault : create)(db, { actorId: session.userId, ...input.body });
      respond(response, 201, result);
    } catch (error) {
      if (!(error instanceof AssessmentError || error instanceof CatalogError
        || error instanceof ControlScopeError)) throw error;
      respond(response, error.status, { error: error.message });
    }
  };
}
