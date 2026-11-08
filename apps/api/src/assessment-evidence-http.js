import { originAccepted, tokenFromCookies } from './auth-http.js';
import { userHasPermission } from './authorization.js';
import { findSession } from './sessions.js';
import {
  EvidenceError, getEvidence, listEvidence, uploadEvidence,
} from './assessment-evidence.js';
import {configureEvidenceKeys} from './evidence-keyring.js';

const ID = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
const LIST = new RegExp('^/assessments/' + ID + '/controls/' + ID + '/evidence$', 'i');
const DOWNLOAD = new RegExp('^/assessments/' + ID + '/evidence/' + ID + '/download$', 'i');
const MAX_BODY = 1410000;

function respond(response, status, payload) {
  response.writeHead(status);
  response.end(JSON.stringify(payload));
}

async function parseUpload(request) {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase()
    !== 'application/json') return { status: 415 };
  let length = 0;
  const chunks = [];
  let exceeded = false;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_BODY) exceeded = true;
    else chunks.push(chunk);
  }
  if (exceeded) return { status: 413 };
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== 3
      || !Object.keys(value).every(k=>['fileName','mediaType','contentBase64'].includes(k))
      || !['fileName','mediaType','contentBase64'].every(k=>typeof value[k]==='string')) {
      return { status: 400 };
    }
    return { value };
  } catch {
    return { status: 400 };
  }
}

export function createAssessmentEvidenceHandler({
  db, appOrigin, evidenceKey,evidenceKeyring,evidenceActiveKeyId,
  list = listEvidence, upload = uploadEvidence, download = getEvidence,
}) {
  const key = configureEvidenceKeys({legacyKey:evidenceKey,keysJson:evidenceKeyring,activeId:evidenceActiveKeyId});
  return async function handleEvidence(request, response) {
    const path = request.url ?? '';
    const listMatch = LIST.exec(path);
    const downloadMatch = DOWNLOAD.exec(path);
    const isUpload = request.method === 'POST' && !!listMatch;
    const isList = request.method === 'GET' && !!listMatch;
    const isDownload = request.method === 'GET' && !!downloadMatch;

    if (!isUpload && !isList && !isDownload) {
      respond(response, 404, {error:'Not found'});
      return;
    }
    if (!db || !appOrigin) {
      respond(response, 503, {error:'Unavailable'});
      return;
    }
    if (isUpload && !originAccepted(request, appOrigin)) {
      respond(response, 403, {error:'Forbidden'});
      return;
    }
    const token = tokenFromCookies(request.headers.cookie);
    const session = token ? await findSession(db, token) : null;
    if (!session) {
      respond(response, 401, {error:'Unauthorized'});
      return;
    }
    const permission = isUpload ? 'evidence:write' : 'evidence:read';
    if (!await userHasPermission(db, session.userId, permission)) {
      respond(response, 403, {error:'Forbidden'});
      return;
    }
    if ((isUpload || isDownload) && !key) {
      respond(response, 503, {error:'Evidence encryption is not configured'});
      return;
    }

    try {
      if (isList) {
        respond(response, 200, await list(db, {
          actorId:session.userId, assessmentId:listMatch[1], controlId:listMatch[2],
        }));
      } else if (isDownload) {
        const file = await download(db, {
          actorId:session.userId, assessmentId:downloadMatch[1],
          evidenceId:downloadMatch[2], key,
        });
        response.setHeader('Content-Type','application/octet-stream');
        response.setHeader('Content-Disposition',
          'attachment; filename="evidence.bin"; filename*=UTF-8' + "''" +
            encodeURIComponent(file.fileName));
        response.setHeader('Content-Security-Policy','sandbox');
        response.setHeader('Content-Length',String(file.data.length));
        response.writeHead(200);
        response.end(file.data);
      } else {
        const parsed = await parseUpload(request);
        if (parsed.status) {
          respond(response, parsed.status, {error:'Invalid request'});
          return;
        }
        respond(response, 201, await upload(db, {
          actorId:session.userId, assessmentId:listMatch[1], controlId:listMatch[2],
          ...parsed.value, key,
        }));
      }
    } catch(error) {
      if (!(error instanceof EvidenceError)) throw error;
      respond(response, error.status, {error:error.message});
    }
  };
}
