import {
  createCipheriv,createDecipheriv,createHash,createHmac,
  randomBytes,timingSafeEqual,
} from 'node:crypto';
import {verifyPassword} from './passwords.js';
import {createSession} from './sessions.js';

const BASE32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const CODE=/^\d{6}$/;
const RECOVERY=/^[0-9A-Fa-f]{32}$/;
const WINDOW=30;
const MAX_CHALLENGE_ATTEMPTS=5;
const BASE32_DECODE=new Map([...BASE32].map((c,i)=>[c,i]));

export class MfaError extends Error{
  constructor(status,message){super(message);this.name='MfaError';this.status=status;}
}
export function readMfaKey(encoded=process.env.MFA_ENCRYPTION_KEY){
  if(typeof encoded!=='string')throw new MfaError(503,'MFA key unavailable');
  const raw=Buffer.from(encoded,'base64');
  if(raw.length!==32||raw.toString('base64')!==encoded)
    throw new MfaError(503,'MFA key unavailable');
  return raw;
}
export function base32Encode(data){
  let bits=0,value=0,output='';
  for(const byte of data){
    value=(value<<8)|byte;bits+=8;
    while(bits>=5){output+=BASE32[(value>>>(bits-=5))&31];}
  }
  if(bits>0)output+=BASE32[(value<<(5-bits))&31];
  return output;
}
export function base32Decode(text){
  if(typeof text!=='string'||!/^[A-Z2-7]{32}$/.test(text))return null;
  let bits=0,value=0;const bytes=[];
  for(const c of text){
    value=(value<<5)|BASE32_DECODE.get(c);bits+=5;
    if(bits>=8){bytes.push((value>>>(bits-=8))&255);}
  }
  const result=Buffer.from(bytes);
  return result.length===20&&base32Encode(result)===text?result:null;
}
export function totpForStep(secret,step){
  if(!Buffer.isBuffer(secret)||secret.length!==20||!Number.isSafeInteger(step)||step<0)
    throw new TypeError('Invalid TOTP input');
  const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(step));
  const digest=createHmac('sha1',secret).update(counter).digest();
  const offset=digest[digest.length-1]&15;
  const number=(digest.readUInt32BE(offset)&0x7fffffff)%1000000;
  return String(number).padStart(6,'0');
}
export function matchTotp(secret,code,{time=Date.now(),afterStep=-1}={}){
  if(typeof code!=='string'||!CODE.test(code))return null;
  const now=Math.floor(time/1000/WINDOW);
  for(const step of [now-1,now,now+1]){
    if(step<=afterStep||step<0)continue;
    const expected=Buffer.from(totpForStep(secret,step),'ascii');
    if(timingSafeEqual(expected,Buffer.from(code,'ascii')))return step;
  }
  return null;
}
function protect(secret,key,userId){
  const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);
  cipher.setAAD(Buffer.from('nusariksa-totp:'+userId));
  const secretCiphertext=Buffer.concat([cipher.update(secret),cipher.final()]);
  return {nonce,secretCiphertext,authTag:cipher.getAuthTag()};
}
function reveal(row,key,userId){
  const decipher=createDecipheriv('aes-256-gcm',key,row.nonce);
  decipher.setAAD(Buffer.from('nusariksa-totp:'+userId));
  decipher.setAuthTag(row.auth_tag);
  return Buffer.concat([decipher.update(row.secret_ciphertext),decipher.final()]);
}
function hashToken(token){
  if(typeof token!=='string'||!TOKEN.test(token))return null;
  const raw=Buffer.from(token,'base64url');
  if(raw.length!==32||raw.toString('base64url')!==token)return null;
  return createHash('sha256').update(raw).digest();
}
function codeHash(code,key){
  return createHmac('sha256',key).update('nusariksa-recovery:'+code.toUpperCase()).digest();
}
async function transaction(pool,fn){
  const db=await pool.connect();
  try{
    await db.query('BEGIN');
    const result=await fn(db);
    await db.query('COMMIT');
    return result;
  }catch(error){
    await db.query('ROLLBACK').catch(()=>{});
    throw error;
  }finally{db.release();}
}
export async function mfaStatus(db,userId){
  const result=await db.query('SELECT 1 FROM user_totp_factors WHERE user_id=$1',[userId]);
  return {enabled:result.rowCount===1};
}
export async function startTotpEnrollment(db,{userId,currentPassword,key}){
  if(typeof currentPassword!=='string'||Buffer.byteLength(currentPassword,'utf8')>1024
    ||currentPassword.length===0)throw new MfaError(400,'Invalid request');
  const checked=await db.query(
    "SELECT email,password_hash FROM users WHERE id=$1 AND status='active' AND password_hash IS NOT NULL",
    [userId],
  );
  if(checked.rowCount!==1||!await verifyPassword(currentPassword,checked.rows[0].password_hash))
    throw new MfaError(401,'Invalid current password');
  if((await mfaStatus(db,userId)).enabled)throw new MfaError(409,'MFA already enabled');
  const secret=randomBytes(20),secured=protect(secret,key,userId);
  await db.query(
    'INSERT INTO totp_enrollments(user_id,nonce,secret_ciphertext,auth_tag,expires_at) '+
    "VALUES($1,$2,$3,$4,now()+interval '10 minutes') "+
    'ON CONFLICT(user_id) DO UPDATE SET nonce=EXCLUDED.nonce, '+
    'secret_ciphertext=EXCLUDED.secret_ciphertext,auth_tag=EXCLUDED.auth_tag,'+
    'expires_at=EXCLUDED.expires_at,created_at=now()',
    [userId,secured.nonce,secured.secretCiphertext,secured.authTag],
  );
  const encoded=base32Encode(secret);
  const label=encodeURIComponent('NusaRiksa:'+checked.rows[0].email);
  return {secret:encoded,otpauthUrl:
    'otpauth://totp/'+label+'?secret='+encoded+
    '&issuer=NusaRiksa&algorithm=SHA1&digits=6&period=30',expiresIn:600};
}
export async function confirmTotpEnrollmentInTransaction(db,{userId,code,key}){
  if(!CODE.test(code))throw new MfaError(400,'Invalid verification code');
  const pending=await db.query(
    "SELECT nonce,secret_ciphertext,auth_tag FROM totp_enrollments "+
    'WHERE user_id=$1 AND expires_at>now() FOR UPDATE',[userId],
  );
  if(pending.rowCount!==1)throw new MfaError(409,'MFA setup expired');
  const secret=reveal(pending.rows[0],key,userId);
  const step=matchTotp(secret,code);
  if(step===null)throw new MfaError(401,'Invalid verification code');
  if((await mfaStatus(db,userId)).enabled)throw new MfaError(409,'MFA already enabled');
  await db.query(
    'INSERT INTO user_totp_factors(user_id,nonce,secret_ciphertext,auth_tag,last_step) '+
    'SELECT user_id,nonce,secret_ciphertext,auth_tag,$2 FROM totp_enrollments WHERE user_id=$1',
    [userId,step],
  );
  await db.query('DELETE FROM totp_enrollments WHERE user_id=$1',[userId]);
  const codes=Array.from({length:10},()=>randomBytes(16).toString('hex').toUpperCase());
  for(const recovery of codes){
    await db.query('INSERT INTO totp_recovery_codes(user_id,code_hash) VALUES($1,$2)',
      [userId,codeHash(recovery,key)]);
  }
  await db.query(
    'UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',
    [userId],
  );
  const session=await createSession(db,userId);
  await db.query(
    "INSERT INTO user_account_events(actor_user_id,target_user_id,action) VALUES($1,$1,'MFA_ENABLE')",
    [userId],
  );
  return {enabled:true,recoveryCodes:codes,token:session.token,userId};
}
export const confirmTotpEnrollment=(pool,args)=>transaction(pool,db=>
  confirmTotpEnrollmentInTransaction(db,args));
export async function startMfaLogin(db,{userId,key}){
  const status=await mfaStatus(db,userId);
  if(!status.enabled)return null;
  if(!key)throw new MfaError(503,'MFA key unavailable');
  const factor=await db.query(
    'SELECT locked_until FROM user_totp_factors WHERE user_id=$1',[userId],
  );
  if(factor.rows[0]?.locked_until && new Date(factor.rows[0].locked_until).getTime()>Date.now())
    throw new MfaError(429,'MFA temporarily locked');
  const recent=await db.query(
    'SELECT count(*)::int AS total FROM mfa_login_challenges '+
    'WHERE user_id=$1 AND expires_at>now() AND consumed_at IS NULL AND attempts<5',
    [userId],
  );
  if(recent.rows[0].total>=5)throw new MfaError(429,'Too many MFA challenges');
  const bytes=randomBytes(32),token=bytes.toString('base64url');
  const hash=createHash('sha256').update(bytes).digest();
  await db.query(
    'INSERT INTO mfa_login_challenges(token_hash,user_id,expires_at) '+
    "VALUES($1,$2,now()+interval '5 minutes')",[hash,userId],
  );
  return {challengeToken:token,expiresIn:300};
}
export async function verifyMfaLoginInTransaction(db,{challengeToken,code,key}){
  const tokenHash=hashToken(challengeToken);
  if(!tokenHash||typeof code!=='string'||(!CODE.test(code)&&!RECOVERY.test(code)))
    throw new MfaError(400,'Invalid MFA request');
  const challenge=await db.query(
    'SELECT user_id,attempts FROM mfa_login_challenges '+
    'WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>now() AND attempts<5 FOR UPDATE',
    [tokenHash],
  );
  if(challenge.rowCount!==1)return {status:401,error:'Invalid or expired MFA challenge'};
  const userId=challenge.rows[0].user_id;
  const factor=await db.query(
    'SELECT f.nonce,f.secret_ciphertext,f.auth_tag,f.last_step,'+
    'f.failed_attempts,f.failure_window_at,f.locked_until FROM user_totp_factors f '+
    "JOIN users u ON u.id=f.user_id AND u.status='active' AND u.password_hash IS NOT NULL "+
    'WHERE f.user_id=$1 FOR UPDATE OF f',[userId],
  );
  if(factor.rowCount!==1)return {status:401,error:'Invalid or expired MFA challenge'};
  const currentFactor=factor.rows[0];
  if(currentFactor.locked_until&&new Date(currentFactor.locked_until).getTime()>Date.now())
    return {status:429,error:'MFA temporarily locked'};
  let recovery=false,step=null;
  if(CODE.test(code)){
    const secret=reveal(factor.rows[0],key,userId);
    step=matchTotp(secret,code,{afterStep:Number(factor.rows[0].last_step)});
  }else{
    const verified=await db.query(
      'SELECT 1 FROM totp_recovery_codes WHERE user_id=$1 AND code_hash=$2 AND used_at IS NULL FOR UPDATE',
      [userId,codeHash(code,key)],
    );
    recovery=verified.rowCount===1;
  }
  if(step===null&&!recovery){
    const expired=!currentFactor.failure_window_at
      ||Date.now()-new Date(currentFactor.failure_window_at).getTime()>=15*60*1000;
    const attempts=expired?1:Math.min(Number(currentFactor.failed_attempts)+1,5);
    await db.query(
      'UPDATE user_totp_factors SET failed_attempts=$2,failure_window_at=$3,locked_until=$4 '+
      'WHERE user_id=$1',
      [userId,attempts,expired?new Date():currentFactor.failure_window_at,
        attempts>=5?new Date(Date.now()+15*60*1000):null],
    );
    await db.query(
      'UPDATE mfa_login_challenges SET attempts=attempts+1 WHERE token_hash=$1',[tokenHash],
    );
    return {status:401,error:'Invalid MFA code'};
  }
  await db.query(
    'UPDATE user_totp_factors SET failed_attempts=0,failure_window_at=NULL,locked_until=NULL WHERE user_id=$1',
    [userId],
  );
  if(recovery){
    await db.query(
      'UPDATE totp_recovery_codes SET used_at=now() '+
      'WHERE user_id=$1 AND code_hash=$2 AND used_at IS NULL',[userId,codeHash(code,key)],
    );
  }else{
    await db.query('UPDATE user_totp_factors SET last_step=$2 WHERE user_id=$1',[userId,step]);
  }
  await db.query('UPDATE mfa_login_challenges SET consumed_at=now() WHERE token_hash=$1',[tokenHash]);
  const session=await createSession(db,userId);
  await db.query(
    'INSERT INTO user_account_events(actor_user_id,target_user_id,action) '+
    "VALUES($1,$1,$2)",[userId,recovery?'MFA_RECOVERY_LOGIN':'MFA_LOGIN'],
  );
  return {userId,token:session.token,recoveryUsed:recovery};
}
export async function verifyMfaLogin(pool,args){
  const result=await transaction(pool,db=>verifyMfaLoginInTransaction(db,args));
  if(result.status)throw new MfaError(result.status,result.error);
  return result;
}
