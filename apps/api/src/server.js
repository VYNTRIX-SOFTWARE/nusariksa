import { createServer as createHttpServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createAuthHandler } from './auth-http.js';
import { createAssessmentsHandler } from './assessments-http.js';
import { createAssessmentResultsHandler } from './assessment-results-http.js';
import { createAssessmentReviewsHandler } from './assessment-reviews-http.js';
import { createAssessmentReportsHandler } from './assessment-reports-http.js';
import { createAssessmentEvidenceHandler } from './assessment-evidence-http.js';
import { createMaturityHandler } from './maturity-http.js';
import { createControlCatalogsHandler } from './control-catalogs-http.js';
import { checkDatabase, createPool } from './database.js';
import { createLoginLimiter } from './login-limiter.js';
import { createRolesHandler } from './roles-http.js';
import { createUserAccountsHandler } from './users-http.js';
import { serveWebAsset } from './web-assets.js';

export function createServer({
  checkReadiness = async () => false,
  authDb = null,
  appOrigin = null,
  loginLimiter = createLoginLimiter(),
  changeRole,
  createUser,
  activateUser,
  disableUser,
  listUsers,
  createAssessment,
  listAssessments,
  getAssessment,
  startAssessment,
  catalogHandlers,
  resultHandlers,
  reviewHandlers,
  reportHandler,
  evidenceHandlers,
  maturityHandlers,
  evidenceKey = process.env.EVIDENCE_ENCRYPTION_KEY,
} = {}) {
  const handleAuth = createAuthHandler({ db: authDb, appOrigin, limiter: loginLimiter });
  const handleAssessments = createAssessmentsHandler({
    db: authDb, appOrigin, create: createAssessment, list: listAssessments,
    get: getAssessment, start: startAssessment,
  });
  const handleCatalogs = createControlCatalogsHandler({ db: authDb, appOrigin, ...catalogHandlers });
  const handleResults = createAssessmentResultsHandler({ db: authDb, appOrigin, ...resultHandlers });
  const handleReviews = createAssessmentReviewsHandler({ db: authDb, appOrigin, ...reviewHandlers });
  const handleReport = createAssessmentReportsHandler({ db: authDb, appOrigin, report: reportHandler });
  const handleMaturity = createMaturityHandler({
    db: authDb, appOrigin, ...maturityHandlers,
  });
  const handleEvidence = createAssessmentEvidenceHandler({
    db: authDb, appOrigin, evidenceKey, ...evidenceHandlers,
  });
  const handleRoles = createRolesHandler({ db: authDb, appOrigin, changeRole });
  const handleAccounts = createUserAccountsHandler({
    db: authDb, appOrigin, createUser, activateUser, disableUser, listUsers,
  });
  return createHttpServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Frame-Options', 'DENY');

    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200);
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (request.method === 'GET' && request.url === '/ready') {
      let ready = false;
      try {
        ready = await checkReadiness();
      } catch {
        // Informasi koneksi database tidak boleh muncul dalam respons HTTP.
      }
      response.writeHead(ready ? 200 : 503);
      response.end(JSON.stringify({ status: ready ? 'ready' : 'unavailable' }));
      return;
    }

    if (request.url === '/auth/login' || request.url === '/auth/logout'
      || request.url === '/auth/session' || request.url === '/auth/permissions') {
      try {
        await handleAuth(request, response);
      } catch {
        if (!response.headersSent) {
          response.writeHead(503);
          response.end(JSON.stringify({ error: 'Unavailable' }));
        } else {
          response.destroy();
        }
      }
      return;
    }

    if (request.url === '/users' || request.url === '/auth/activate'
      || request.url?.startsWith('/users/')) {
      try {
        if (request.url?.endsWith('/roles')) await handleRoles(request, response);
        else await handleAccounts(request, response);
      } catch {
        if (!response.headersSent) {
          response.writeHead(503);
          response.end(JSON.stringify({ error: 'Unavailable' }));
        } else {
          response.destroy();
        }
      }
      return;
    }

    if (request.url === '/catalogs' || request.url?.startsWith('/catalogs/')
      || request.url?.startsWith('/catalog-versions/')
      || request.url?.endsWith('/catalog') || request.url?.endsWith('/checklist')) {
      try {
        await handleCatalogs(request, response);
      } catch {
        if (!response.headersSent) {
          response.writeHead(503);
          response.end(JSON.stringify({ error: 'Unavailable' }));
        } else {
          response.destroy();
        }
      }
      return;
    }

    if (request.url === '/maturity-models' ||
      request.url?.startsWith('/maturity-models/') ||
      request.url?.startsWith('/maturity-versions/') ||
      request.url?.startsWith('/maturity-domains/')) {
      try {
        await handleMaturity(request, response);
      } catch {
        if (!response.headersSent) {
          response.writeHead(503);
          response.end(JSON.stringify({ error: 'Unavailable' }));
        } else {
          response.destroy();
        }
      }
      return;
    }

    if (request.url?.startsWith('/assessments/') && request.url.includes('/evidence')) {
      try {
        await handleEvidence(request, response);
      } catch {
        if (!response.headersSent) {
          response.writeHead(503);
          response.end(JSON.stringify({ error: 'Unavailable' }));
        } else {
          response.destroy();
        }
      }
      return;
    }

    if (request.url?.startsWith('/assessments/') && request.url.endsWith('/report')) {
      try {
        await handleReport(request, response);
      } catch {
        if (!response.headersSent) {
          response.writeHead(503);
          response.end(JSON.stringify({ error: 'Unavailable' }));
        } else {
          response.destroy();
        }
      }
      return;
    }

    if (request.url?.startsWith('/assessments/') && (
      request.url.endsWith('/submit') || request.url.endsWith('/review')
      || request.url.endsWith('/reviews'))) {
      try {
        await handleReviews(request, response);
      } catch {
        if (!response.headersSent) {
          response.writeHead(503);
          response.end(JSON.stringify({ error: 'Unavailable' }));
        } else {
          response.destroy();
        }
      }
      return;
    }

    if (request.url?.startsWith('/assessments/') && request.url.includes('/results')) {
      try {
        await handleResults(request, response);
      } catch {
        if (!response.headersSent) {
          response.writeHead(503);
          response.end(JSON.stringify({ error: 'Unavailable' }));
        } else {
          response.destroy();
        }
      }
      return;
    }

    if (request.url === '/assessments' || request.url?.startsWith('/assessments/')) {
      try {
        await handleAssessments(request, response);
      } catch {
        if (!response.headersSent) {
          response.writeHead(503);
          response.end(JSON.stringify({ error: 'Unavailable' }));
        } else {
          response.destroy();
        }
      }
      return;
    }

    if (await serveWebAsset(request, response)) return;

    response.writeHead(404);
    response.end(JSON.stringify({ error: 'Not found' }));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('PORT harus berupa bilangan bulat antara 1 dan 65535.');
    process.exitCode = 1;
  } else {
    const pool = createPool();
    const server = createServer({
      checkReadiness: () => checkDatabase(pool),
      authDb: pool,
      appOrigin: process.env.APP_ORIGIN,
    });
    server.on('close', () => { if (pool) void pool.end(); });
    server.listen(port, '127.0.0.1', () => {
      console.log('API pengembangan tersedia di http://127.0.0.1:' + port);
    });
  }
}
