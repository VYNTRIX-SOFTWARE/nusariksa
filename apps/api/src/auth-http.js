import { authenticateUser } from './authentication.js';
import { getUserPermissions } from './authorization.js';
import { createSession, findSession, revokeSession } from './sessions.js';
import { changePassword, PasswordChangeError } from './change-password.js';
import {
  MfaError,readMfaKey,mfaStatus,startTotpEnrollment,
  confirmTotpEnrollment,startMfaLogin,verifyMfaLogin,
} from './totp-mfa.js';

const COOKIE_NAME = '__Host-nusariksa_session';
const COOKIE_OPTIONS = '; Path=/; Secure; HttpOnly; SameSite=Strict';
const MAX_BODY_BYTES = 4096;

function respond(response, status, body) {
  response.writeHead(status);
  response.end(JSON.stringify(body));
}

export function tokenFromCookies(header) {
  if (typeof header !== 'string') return null;
  const candidates = header.split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(COOKIE_NAME + '='));
  if (candidates.length !== 1) return null;
  return candidates[0].slice(COOKIE_NAME.length + 1);
}

export function originAccepted(request, appOrigin) {
  return typeof appOrigin === 'string'
    && request.headers.origin === appOrigin
    && request.headers['sec-fetch-site'] !== 'cross-site';
}

async function readChangePasswordPayload(request){
  if(request.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json')
    return {status:415};
  let size=0,oversized=false;const chunks=[];
  for await(const chunk of request){
    size+=chunk.length;
    if(size>MAX_BODY_BYTES)oversized=true;
    else chunks.push(chunk);
  }
  if(oversized)return {status:413};
  try{
    const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!body||typeof body!=='object'||Array.isArray(body)
      ||Object.keys(body).length!==2
      ||typeof body.currentPassword!=='string'||typeof body.newPassword!=='string')
      return {status:400};
    return {body};
  }catch{return {status:400};}
}

async function readMfaPayload(request,fields) {
  if(request.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json')
    return {status:415};
  let size=0,oversized=false;const chunks=[];
  for await(const chunk of request){
    size+=chunk.length;
    if(size>MAX_BODY_BYTES)oversized=true;
    else chunks.push(chunk);
  }
  if(oversized)return {status:413};
  try{
    const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!body||typeof body!=='object'||Array.isArray(body)
      ||Object.keys(body).length!==fields.length
      ||!fields.every(name=>typeof body[name]==='string'))
      return {status:400};
    return {body};
  }catch{return {status:400};}
}

async function readLoginPayload(request) {
  const type = request.headers['content-type']?.split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') return { status: 415 };

  let length = 0;
  let oversized = false;
  const chunks = [];
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_BODY_BYTES) {
      oversized = true;
      continue;
    }
    chunks.push(chunk);
  }
  if (oversized) return { status: 413 };

  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return { status: 400 };
  }
  if (!body || Array.isArray(body) || typeof body !== 'object'
    || typeof body.email !== 'string' || body.email.length > 254
    || typeof body.password !== 'string'
    || Buffer.byteLength(body.password, 'utf8') > 1024
    || body.password.length === 0) {
    return { status: 400 };
  }

  return { email: body.email.trim().toLowerCase(), password: body.password };
}

export function createAuthHandler({
  db,appOrigin,limiter,changeUserPassword=changePassword,
  mfaEncryptionKey=process.env.MFA_ENCRYPTION_KEY,
  mfaActions={
    status:mfaStatus,setup:startTotpEnrollment,
    confirm:confirmTotpEnrollment,beginLogin:startMfaLogin,
    verifyLogin:verifyMfaLogin,
  },
}) {
  return async function handleAuth(request, response) {
    if (!db || !appOrigin) {
      respond(response, 503, { error: 'Unavailable' });
      return;
    }

    if (request.method === 'GET' && request.url === '/auth/session') {
      const token = tokenFromCookies(request.headers.cookie);
      const session = token ? await findSession(db, token) : null;
      if (!session) {
        respond(response, 401, { authenticated: false });
        return;
      }
      respond(response, 200, { authenticated: true, userId: session.userId });
      return;
    }

    if (request.method === 'GET' && request.url === '/auth/permissions') {
      const token = tokenFromCookies(request.headers.cookie);
      const session = token ? await findSession(db, token) : null;
      if (!session) {
        respond(response, 401, { error: 'Unauthorized' });
        return;
      }
      const permissions = await getUserPermissions(db, session.userId);
      respond(response, 200, { permissions });
      return;
    }

    if(request.method==='GET'&&request.url==='/auth/mfa/status'){
      const token=tokenFromCookies(request.headers.cookie);
      const session=token?await findSession(db,token):null;
      if(!session){respond(response,401,{error:'Unauthorized'});return;}
      respond(response,200,await mfaActions.status(db,session.userId));
      return;
    }

    if (!originAccepted(request, appOrigin)) {
      respond(response, 403, { error: 'Forbidden' });
      return;
    }

    if (request.method === 'POST' && request.url === '/auth/logout') {
      const token = tokenFromCookies(request.headers.cookie);
      if (token) await revokeSession(db, token);
      response.setHeader('Set-Cookie', COOKIE_NAME + '=' + COOKIE_OPTIONS + '; Max-Age=0');
      respond(response, 200, { authenticated: false });
      return;
    }

    if(request.method==='POST'&&request.url==='/auth/change-password'){
      const token=tokenFromCookies(request.headers.cookie);
      const session=token?await findSession(db,token):null;
      if(!session){respond(response,401,{error:'Unauthorized'});return;}
      const address=request.socket.remoteAddress??'unknown';
      const limitKey='password-change:'+session.userId;
      if(!limiter.allow(address,limitKey)){
        response.setHeader('Retry-After','900');
        respond(response,429,{error:'Too many attempts'});return;
      }
      const payload=await readChangePasswordPayload(request);
      if(payload.status){
        respond(response,payload.status,{error:'Invalid request'});return;
      }
      try{
        const changed=await changeUserPassword(db,{
          userId:session.userId,...payload.body,
        });
        limiter.success(address,limitKey);
        response.setHeader('Set-Cookie',
          COOKIE_NAME+'='+changed.token+COOKIE_OPTIONS+'; Max-Age=28800');
        respond(response,200,{authenticated:true,userId:changed.userId,passwordChanged:true});
      }catch(error){
        if(!(error instanceof PasswordChangeError))throw error;
        if(error.status===401)limiter.failure(address,limitKey);
        respond(response,error.status,{error:error.message});
      }
      return;
    }

    if(request.method==='POST'&&request.url==='/auth/mfa/setup'){
      const token=tokenFromCookies(request.headers.cookie);
      const session=token?await findSession(db,token):null;
      if(!session){respond(response,401,{error:'Unauthorized'});return;}
      const address=request.socket.remoteAddress??'unknown';
      const rateKey='mfa-setup:'+session.userId;
      if(!limiter.allow(address,rateKey)){
        response.setHeader('Retry-After','900');
        respond(response,429,{error:'Too many attempts'});return;
      }
      const parsed=await readMfaPayload(request,['currentPassword']);
      if(parsed.status){respond(response,parsed.status,{error:'Invalid request'});return;}
      try{
        const result=await mfaActions.setup(db,{
          userId:session.userId,currentPassword:parsed.body.currentPassword,
          key:readMfaKey(mfaEncryptionKey),
        });
        limiter.success(address,rateKey);
        respond(response,200,result);
      }catch(error){
        if(!(error instanceof MfaError))throw error;
        if(error.status===401)limiter.failure(address,rateKey);
        respond(response,error.status,{error:error.message});
      }
      return;
    }

    if(request.method==='POST'&&request.url==='/auth/mfa/confirm'){
      const token=tokenFromCookies(request.headers.cookie);
      const session=token?await findSession(db,token):null;
      if(!session){respond(response,401,{error:'Unauthorized'});return;}
      const address=request.socket.remoteAddress??'unknown';
      const rateKey='mfa-confirm:'+session.userId;
      if(!limiter.allow(address,rateKey)){
        response.setHeader('Retry-After','900');
        respond(response,429,{error:'Too many attempts'});return;
      }
      const parsed=await readMfaPayload(request,['code']);
      if(parsed.status){respond(response,parsed.status,{error:'Invalid request'});return;}
      try{
        const result=await mfaActions.confirm(db,{
          userId:session.userId,code:parsed.body.code,
          key:readMfaKey(mfaEncryptionKey),
        });
        limiter.success(address,rateKey);
        response.setHeader('Set-Cookie',
          COOKIE_NAME+'='+result.token+COOKIE_OPTIONS+'; Max-Age=28800');
        respond(response,200,{enabled:true,recoveryCodes:result.recoveryCodes});
      }catch(error){
        if(!(error instanceof MfaError))throw error;
        if(error.status===401)limiter.failure(address,rateKey);
        respond(response,error.status,{error:error.message});
      }
      return;
    }

    if(request.method==='POST'&&request.url==='/auth/mfa/login'){
      const parsed=await readMfaPayload(request,['challengeToken','code']);
      if(parsed.status){respond(response,parsed.status,{error:'Invalid request'});return;}
      try{
        const result=await mfaActions.verifyLogin(db,{
          ...parsed.body,key:readMfaKey(mfaEncryptionKey),
        });
        response.setHeader('Set-Cookie',
          COOKIE_NAME+'='+result.token+COOKIE_OPTIONS+'; Max-Age=28800');
        respond(response,200,{authenticated:true,userId:result.userId,
          recoveryUsed:result.recoveryUsed});
      }catch(error){
        if(!(error instanceof MfaError))throw error;
        respond(response,error.status,{error:error.message});
      }
      return;
    }

    if (request.method === 'POST' && request.url === '/auth/login') {
      const payload = await readLoginPayload(request);
      if (payload.status) {
        respond(response, payload.status, { error: 'Invalid request' });
        return;
      }

      const address = request.socket.remoteAddress ?? 'unknown';
      if (!limiter.allow(address, payload.email)) {
        response.setHeader('Retry-After', '900');
        respond(response, 429, { error: 'Too many attempts' });
        return;
      }

      const user = await authenticateUser(db, payload.email, payload.password);
      if (!user) {
        limiter.failure(address, payload.email);
        respond(response, 401, { error: 'Invalid credentials' });
        return;
      }

      if((await mfaActions.status(db,user.userId)).enabled){
        let challenge;
        try{
          challenge=await mfaActions.beginLogin(db,{
            userId:user.userId,key:readMfaKey(mfaEncryptionKey),
          });
        }catch(error){
          if(!(error instanceof MfaError))throw error;
          if(error.status===429)response.setHeader('Retry-After','900');
          respond(response,error.status,{error:error.message});return;
        }
        limiter.success(address,payload.email);
        const previousToken=tokenFromCookies(request.headers.cookie);
        if(previousToken)await revokeSession(db,previousToken);
        response.setHeader('Set-Cookie',COOKIE_NAME+'='+COOKIE_OPTIONS+'; Max-Age=0');
        respond(response,200,{mfaRequired:true,...challenge});
        return;
      }
      const session = await createSession(db, user.userId);
      limiter.success(address, payload.email);
      const previousToken = tokenFromCookies(request.headers.cookie);
      if (previousToken) await revokeSession(db, previousToken);
      response.setHeader('Set-Cookie',
        COOKIE_NAME + '=' + session.token + COOKIE_OPTIONS + '; Max-Age=28800');
      respond(response, 200, { authenticated: true, userId: user.userId });
      return;
    }

    respond(response, 404, { error: 'Not found' });
  };
}
