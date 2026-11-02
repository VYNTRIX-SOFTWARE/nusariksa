import { originAccepted, tokenFromCookies } from './auth-http.js';
import { userHasPermission } from './authorization.js';
import { findSession } from './sessions.js';
import {
  CatalogError, createCatalog, listCatalogs, listVersions,
  createNextVersion, addControl, publishVersion, listControls,
  assignCatalog, getChecklist,
} from './control-catalogs.js';

const ID = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
const CATALOG_VERSIONS = new RegExp('^/catalogs/' + ID + '/versions$', 'i');
const VERSION_CONTROLS = new RegExp('^/catalog-versions/' + ID + '/controls$', 'i');
const VERSION_PUBLISH = new RegExp('^/catalog-versions/' + ID + '/publish$', 'i');
const ASSESSMENT_CATALOG = new RegExp('^/assessments/' + ID + '/catalog$', 'i');
const ASSESSMENT_CHECKLIST = new RegExp('^/assessments/' + ID + '/checklist$', 'i');
const MAX_BODY = 4096;

function respond(response, status, data) {
  response.writeHead(status);
  response.end(JSON.stringify(data));
}

async function parseBody(request, mandatory, optional = []) {
  const contentType = request.headers['content-type']?.split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') return { error: 415 };
  const chunks = [];
  let total = 0;
  let oversized = false;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_BODY) oversized = true;
    else chunks.push(chunk);
  }
  if (oversized) return { error: 413 };
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const keys = Object.keys(body ?? {});
    if (!body || Array.isArray(body) || typeof body !== 'object'
      || !mandatory.every((key) => typeof body[key] === 'string')
      || !keys.every((key) => mandatory.includes(key) || optional.includes(key))
      || !optional.every((key) => body[key] === undefined || body[key] === null
        || typeof body[key] === 'string')) return { error: 400 };
    return { body };
  } catch {
    return { error: 400 };
  }
}

export function createControlCatalogsHandler({
  db, appOrigin,
  create = createCatalog, list = listCatalogs, versions = listVersions,
  nextVersion = createNextVersion, add = addControl,
  publish = publishVersion, controls = listControls,
  assign = assignCatalog, checklist = getChecklist,
}) {
  return async function handleCatalogs(request, response) {
    const path = request.url ?? '';
    const method = request.method;
    const catalogVersions = CATALOG_VERSIONS.exec(path);
    const versionControls = VERSION_CONTROLS.exec(path);
    const versionPublish = VERSION_PUBLISH.exec(path);
    const assessmentCatalog = ASSESSMENT_CATALOG.exec(path);
    const assessmentChecklist = ASSESSMENT_CHECKLIST.exec(path);
    const action = (method === 'GET' || method === 'POST') && (
      path === '/catalogs' || (method === 'GET' && assessmentChecklist)
      || (catalogVersions && (method === 'GET' || method === 'POST'))
      || (versionControls && (method === 'GET' || method === 'POST'))
      || (versionPublish && method === 'POST')
      || (assessmentCatalog && method === 'POST')
    );
    if (!action) {
      respond(response, 404, { error: 'Not found' });
      return;
    }
    if (!db || !appOrigin) {
      respond(response, 503, { error: 'Unavailable' });
      return;
    }
    if (method === 'POST' && !originAccepted(request, appOrigin)) {
      respond(response, 403, { error: 'Forbidden' });
      return;
    }
    const token = tokenFromCookies(request.headers.cookie);
    const session = token ? await findSession(db, token) : null;
    if (!session) {
      respond(response, 401, { error: 'Unauthorized' });
      return;
    }
    const required = method === 'GET' ? 'assessments:read' : 'assessments:write';
    if (!await userHasPermission(db, session.userId, required)) {
      respond(response, 403, { error: 'Forbidden' });
      return;
    }

    try {
      if (method === 'GET') {
        if (path === '/catalogs') respond(response, 200, await list(db, session.userId));
        else if (catalogVersions) respond(response, 200,
          await versions(db, session.userId, catalogVersions[1]));
        else if (versionControls) respond(response, 200,
          await controls(db, session.userId, versionControls[1]));
        else respond(response, 200, await checklist(db, session.userId, assessmentChecklist[1]));
        return;
      }

      if (catalogVersions) {
        respond(response, 201, await nextVersion(db, {
          actorId: session.userId, catalogId: catalogVersions[1],
        }));
        return;
      }
      if (versionPublish) {
        respond(response, 200, await publish(db, {
          actorId: session.userId, versionId: versionPublish[1],
        }));
        return;
      }
      let parsed;
      if (path === '/catalogs') parsed = await parseBody(request, ['code', 'title']);
      else if (versionControls) parsed = await parseBody(request, ['code', 'title'],
        ['description', 'sourceDocument', 'sourceSection']);
      else parsed = await parseBody(request, ['versionId']);
      if (parsed.error) {
        respond(response, parsed.error, { error: 'Invalid request' });
        return;
      }

      if (path === '/catalogs') {
        respond(response, 201, await create(db, { actorId: session.userId, ...parsed.body }));
      } else if (versionControls) {
        respond(response, 201, await add(db, {
          actorId: session.userId, versionId: versionControls[1], ...parsed.body,
        }));
      } else {
        respond(response, 201, await assign(db, {
          actorId: session.userId, assessmentId: assessmentCatalog[1],
          versionId: parsed.body.versionId,
        }));
      }
    } catch (error) {
      if (!(error instanceof CatalogError)) throw error;
      respond(response, error.status, { error: error.message });
    }
  };
}
