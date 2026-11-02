import { originAccepted, tokenFromCookies } from './auth-http.js';
import { userHasPermission } from './authorization.js';
import { findSession } from './sessions.js';
import {
  ReviewError, listReviewHistory, submitAssessment, reviewAssessment,
} from './assessment-reviews.js';

const ID = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
const SUBMIT = new RegExp('^/assessments/' + ID + '/submit$', 'i');
const REVIEW = new RegExp('^/assessments/' + ID + '/review$', 'i');
const HISTORY = new RegExp('^/assessments/' + ID + '/reviews$', 'i');
const MAX_BYTES = 4096;

function respond(response, status, body) {
  response.writeHead(status);
  response.end(JSON.stringify(body));
}

async function readDecision(request) {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase()
    !== 'application/json') return { error: 415 };

  let size = 0;
  let oversized = false;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BYTES) oversized = true;
    else chunks.push(chunk);
  }
  if (oversized) return { error: 413 };

  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== 2
      || typeof value.decision !== 'string' || typeof value.note !== 'string') {
      return { error: 400 };
    }
    return { value };
  } catch {
    return { error: 400 };
  }
}

export function createAssessmentReviewsHandler({
  db, appOrigin,
  submit = submitAssessment,
  review = reviewAssessment,
  history = listReviewHistory,
}) {
  return async function handleReview(request, response) {
    const path = request.url ?? '';
    const isSubmit = request.method === 'POST' ? SUBMIT.exec(path) : null;
    const isReview = request.method === 'POST' ? REVIEW.exec(path) : null;
    const isHistory = request.method === 'GET' ? HISTORY.exec(path) : null;
    if (!isSubmit && !isReview && !isHistory) {
      respond(response, 404, { error: 'Not found' });
      return;
    }
    if (!db || !appOrigin) {
      respond(response, 503, { error: 'Unavailable' });
      return;
    }
    if ((isSubmit || isReview) && !originAccepted(request, appOrigin)) {
      respond(response, 403, { error: 'Forbidden' });
      return;
    }

    const cookie = tokenFromCookies(request.headers.cookie);
    const session = cookie ? await findSession(db, cookie) : null;
    if (!session) {
      respond(response, 401, { error: 'Unauthorized' });
      return;
    }
    const permission = isSubmit ? 'assessments:write'
      : isReview ? 'assessments:approve' : 'assessments:read';
    if (!await userHasPermission(db, session.userId, permission)) {
      respond(response, 403, { error: 'Forbidden' });
      return;
    }

    try {
      if (isHistory) {
        respond(response, 200, await history(db, session.userId, isHistory[1]));
      } else if (isSubmit) {
        respond(response, 200, await submit(db, {
          actorId: session.userId, assessmentId: isSubmit[1],
        }));
      } else {
        const parsed = await readDecision(request);
        if (parsed.error) {
          respond(response, parsed.error, { error: 'Invalid request' });
          return;
        }
        respond(response, 200, await review(db, {
          actorId: session.userId, assessmentId: isReview[1],
          ...parsed.value,
        }));
      }
    } catch (error) {
      if (!(error instanceof ReviewError)) throw error;
      respond(response, error.status, { error: error.message });
    }
  };
}
