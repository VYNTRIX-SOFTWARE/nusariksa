import { createServer as createHttpServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createAuthHandler } from './auth-http.js';
import { createAssessmentsHandler } from './assessments-http.js';
import { createAssessmentResultsHandler } from './assessment-results-http.js';
import { createAssessmentReviewsHandler } from './assessment-reviews-http.js';
import { createAssessmentReportsHandler } from './assessment-reports-http.js';
import { createAssessmentEvidenceHandler } from './assessment-evidence-http.js';
import { createMaturityHandler } from './maturity-http.js';
import { createMaturityAssessmentsHandler } from './maturity-assessments-http.js';
import { createPadkCyberHandler } from './padk-cyber-http.js';
import { createPadkPreparationsHandler } from './padk-preparations-http.js';
import {createPadkEvidenceHandler} from './padk-evidence-http.js';
import {createPadkDraftReviewHandler} from './padk-draft-review-http.js';
import {createCrosswalkReviewHandler} from './padk-crosswalk-reviews-http.js';
import { createControlCatalogsHandler } from './control-catalogs-http.js';
import {createAssetHandler} from './ti-assets-http.js';
import {createRiskHandler} from './ti-risks-http.js';
import {createIncidentHandler} from './ti-incidents-http.js';
import {createFindingHandler} from './ti-findings-http.js';
import {createVendorHandler} from './ti-vendors-http.js';
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
  changeUserPassword,
  mfaEncryptionKey,
  mfaActions,
  changeRole,
  createUser,
  activateUser,
  disableUser,
  listUsers,
  createAssessment,
  createReadyAssessment,
  listAssessments,
  getAssessment,
  startAssessment,
  catalogHandlers,
  assetHandlers,
  riskHandlers,
  incidentHandlers,
  findingHandlers,
  vendorHandlers,
  resultHandlers,
  reviewHandlers,
  reportHandler,
  evidenceHandlers,
  maturityHandlers,
  maturityAssessmentHandlers,
  padkCyberHandlers,
  padkPreparationHandlers,
  padkEvidenceHandlers,
  padkDraftReviewHandlers,
  crosswalkHandlers,
  evidenceKey = process.env.EVIDENCE_ENCRYPTION_KEY,
  evidenceKeyring=process.env.EVIDENCE_KEYRING,
  evidenceActiveKeyId=process.env.EVIDENCE_ACTIVE_KEY_ID,
} = {}) {
  const handleAuth = createAuthHandler({
    db:authDb,appOrigin,limiter:loginLimiter,changeUserPassword,
    mfaEncryptionKey,mfaActions,
  });
  const handleAssessments = createAssessmentsHandler({
    db: authDb, appOrigin, create: createAssessment, list: listAssessments,
    get: getAssessment, start: startAssessment, startDefault: createReadyAssessment,
  });
  const handleCatalogs = createControlCatalogsHandler({ db: authDb, appOrigin, ...catalogHandlers });
  const handleAssets = createAssetHandler({db:authDb,appOrigin,...assetHandlers});
  const handleRisks = createRiskHandler({db:authDb,appOrigin,...riskHandlers});
  const handleIncidents = createIncidentHandler({db:authDb,appOrigin,...incidentHandlers});
  const handleFindings = createFindingHandler({db:authDb,appOrigin,...findingHandlers});
  const handleVendors = createVendorHandler({db:authDb,appOrigin,...vendorHandlers});
  const handleResults = createAssessmentResultsHandler({ db: authDb, appOrigin, ...resultHandlers });
  const handleReviews = createAssessmentReviewsHandler({ db: authDb, appOrigin, ...reviewHandlers });
  const handleReport = createAssessmentReportsHandler({ db: authDb, appOrigin, report: reportHandler });
  const handleMaturity = createMaturityHandler({
    db: authDb, appOrigin, ...maturityHandlers,
  });
  const handleMaturityAssessments = createMaturityAssessmentsHandler({
    db: authDb, appOrigin, ...maturityAssessmentHandlers,
  });
  const handlePadkCyber = createPadkCyberHandler({
    db: authDb, appOrigin, ...padkCyberHandlers,
  });
  const handlePadkPreparations = createPadkPreparationsHandler({
    db: authDb, appOrigin, ...padkPreparationHandlers,
  });
  const handlePadkEvidence = createPadkEvidenceHandler({
    db:authDb,appOrigin,evidenceKey,evidenceKeyring,evidenceActiveKeyId,...padkEvidenceHandlers,
  });
  const handlePadkDraftReview = createPadkDraftReviewHandler({
    db:authDb,appOrigin,...padkDraftReviewHandlers,
  });
  const handleCrosswalk = createCrosswalkReviewHandler({
    db:authDb,appOrigin,...crosswalkHandlers,
  });
  const handleEvidence = createAssessmentEvidenceHandler({
    db: authDb, appOrigin, evidenceKey,evidenceKeyring,evidenceActiveKeyId, ...evidenceHandlers,
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
      || request.url === '/auth/session' || request.url === '/auth/permissions'
      || request.url === '/auth/change-password' || request.url?.startsWith('/auth/mfa/')) {
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

    if (request.url === '/vendors' || request.url?.startsWith('/vendors?')
      || request.url?.startsWith('/vendors/')) {
      try{await handleVendors(request,response);}
      catch{
        if(!response.headersSent){response.writeHead(503);response.end(JSON.stringify({error:'Unavailable'}));}
        else response.destroy();
      }
      return;
    }

    if (request.url === '/findings' || request.url?.startsWith('/findings?')
      || request.url?.startsWith('/findings/')) {
      try{await handleFindings(request,response);}
      catch{
        if(!response.headersSent){response.writeHead(503);response.end(JSON.stringify({error:'Unavailable'}));}
        else response.destroy();
      }
      return;
    }

    if (request.url === '/incidents' || request.url?.startsWith('/incidents?')
      || request.url?.startsWith('/incidents/')) {
      try{await handleIncidents(request,response);}
      catch{
        if(!response.headersSent){response.writeHead(503);response.end(JSON.stringify({error:'Unavailable'}));}
        else response.destroy();
      }
      return;
    }

    if (request.url === '/risks' || request.url?.startsWith('/risks?')
      || request.url?.startsWith('/risks/')) {
      try{await handleRisks(request,response);}
      catch{
        if(!response.headersSent){response.writeHead(503);response.end(JSON.stringify({error:'Unavailable'}));}
        else response.destroy();
      }
      return;
    }

    // Asset API shares /assets with static web files; match only REST paths.
    if (/^\/assets(?:\?.*)?$/.test(request.url??'')
      || /^\/assets\/[0-9a-f-]{36}(?:\/(?:history|archive))?$/i.test(request.url??'')) {
      try{await handleAssets(request,response);}
      catch{
        if(!response.headersSent){response.writeHead(503);response.end(JSON.stringify({error:'Unavailable'}));}
        else response.destroy();
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

    if(request.url?.startsWith('/regulatory/padk43/cyber/crosswalk')){
      try{await handleCrosswalk(request,response);}
      catch{
        if(!response.headersSent){
          response.writeHead(503);response.end(JSON.stringify({error:'Unavailable'}));
        }else response.destroy();
      }
      return;
    }

    if (request.url?.startsWith('/regulatory/padk43/cyber/preparations')) {
      try {
        if(request.url?.includes('/draft-review'))await handlePadkDraftReview(request,response);
        else if(request.url?.includes('/evidence'))await handlePadkEvidence(request,response);
        else await handlePadkPreparations(request, response);
      } catch {
        if (!response.headersSent) {
          response.writeHead(503);
          response.end(JSON.stringify({ error: 'Unavailable' }));
        } else response.destroy();
      }
      return;
    }

    if (request.url?.startsWith('/regulatory/padk43/cyber')) {
      try {
        await handlePadkCyber(request, response);
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

    if (request.url === '/maturity-assessments' ||
      request.url?.startsWith('/maturity-assessments/')) {
      try {
        await handleMaturityAssessments(request, response);
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
