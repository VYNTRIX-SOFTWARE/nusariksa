import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import {createPool} from '../src/database.js';
import {runMigrations} from '../src/migrations.js';
import {hashPassword} from '../src/passwords.js';
import {createSession,findSession} from '../src/sessions.js';
import {createServer} from '../src/server.js';
import {
  MfaError,base32Decode,totpForStep,mfaStatus,
  startTotpEnrollment,confirmTotpEnrollmentInTransaction,
  startMfaLogin,verifyMfaLoginInTransaction,
} from '../src/totp-mfa.js';

const ORIGIN='http://127.0.0.1:3000';
const KEY=Buffer.alloc(32,9).toString('base64');
const cookie=token=>'__Host-nusariksa_session='+token;
const otp=secret=>totpForStep(base32Decode(secret),Math.floor(Date.now()/30000));
const actions={
  status:mfaStatus,setup:startTotpEnrollment,beginLogin:startMfaLogin,
  confirm:(db,args)=>confirmTotpEnrollmentInTransaction(db,args),
  verifyLogin:async(db,args)=>{
    const result=await verifyMfaLoginInTransaction(db,args);
    if(result.status)throw new MfaError(result.status,result.error);
    return result;
  },
};

test('MFA enrollment rotates sessions, login requires factor and recovery codes are single use',{
  skip:!process.env.DATABASE_URL,
},async()=>{
  const pool=createPool();
  try{
    await runMigrations(pool);
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions(name,kind) VALUES('Bank MFA Test','BPR')");
      const password='MfaSetupPassword_2026';
      const person=await db.query(
        "INSERT INTO users(email,status,password_hash) VALUES($1,'active',$2) RETURNING id",
        ['mfa-test@example.test',await hashPassword(password)],
      );
      const id=person.rows[0].id;
      const sess1=await createSession(db,id),sess2=await createSession(db,id);
      const server=createServer({
        authDb:db,appOrigin:ORIGIN,mfaEncryptionKey:KEY,mfaActions:actions,
      });
      server.listen(0,'127.0.0.1');await once(server,'listening');
      const base='http://127.0.0.1:'+server.address().port;
      const req=(path,body,token,origin=ORIGIN)=>fetch(base+path,{
        method:'POST',
        headers:{Origin:origin,'Content-Type':'application/json',
          ...(token?{Cookie:cookie(token)}:{})},
        body:JSON.stringify(body),
      });
      const passLogin=()=>req('/auth/login',{email:'mfa-test@example.test',password});
      try{
        assert.equal((await fetch(base+'/auth/mfa/status')).status,401);
        assert.equal((await req('/auth/mfa/setup',{currentPassword:password},
          sess1.token,'https://evil.example')).status,403);
        assert.equal((await req('/auth/mfa/setup',{currentPassword:'wrong'},sess1.token)).status,401);
        const setupResponse=await req('/auth/mfa/setup',{currentPassword:password},sess1.token);
        assert.equal(setupResponse.status,200);
        const setup=await setupResponse.json();
        assert.match(setup.secret,/^[A-Z2-7]{32}$/);
        assert.match(setup.otpauthUrl,/^otpauth:\/\/totp\//);
        const confirmation=await req('/auth/mfa/confirm',{code:otp(setup.secret)},sess1.token);
        assert.equal(confirmation.status,200);
        const enabled=await confirmation.json();
        assert.equal(enabled.recoveryCodes.length,10);
        assert.equal(new Set(enabled.recoveryCodes).size,10);
        const active=confirmation.headers.get('set-cookie')?.match(/^__Host-nusariksa_session=([A-Za-z0-9_-]{43});/);
        assert.ok(active);
        assert.equal(await findSession(db,sess1.token),null);
        assert.equal(await findSession(db,sess2.token),null);
        assert.ok(await findSession(db,active[1]));
        assert.deepEqual(await (await fetch(base+'/auth/mfa/status',{
          headers:{Cookie:cookie(active[1])},
        })).json(),{enabled:true});
        const login=await passLogin();
        assert.equal(login.status,200);
        const challenge=await login.json();
        assert.equal(challenge.mfaRequired,true);
        assert.match(challenge.challengeToken,/^[A-Za-z0-9_-]{43}$/);
        assert.match(login.headers.get('set-cookie'),/Max-Age=0$/);
        assert.equal((await fetch(base+'/auth/session')).status,401);
        const invalid=await req('/auth/mfa/login',{
          challengeToken:challenge.challengeToken,code:'000000',
        });
        assert.equal(invalid.status,401);
        const recovered=await req('/auth/mfa/login',{
          challengeToken:challenge.challengeToken,code:enabled.recoveryCodes[0],
        });
        assert.equal(recovered.status,200);
        assert.equal((await recovered.json()).recoveryUsed,true);
        const used=await db.query('SELECT count(*)::int AS n FROM totp_recovery_codes WHERE used_at IS NOT NULL');
        assert.equal(used.rows[0].n,1);
        assert.equal((await req('/auth/mfa/login',{
          challengeToken:challenge.challengeToken,code:enabled.recoveryCodes[1],
        })).status,401);
        const second=await (await passLogin()).json();
        assert.equal((await req('/auth/mfa/login',{
          challengeToken:second.challengeToken,code:enabled.recoveryCodes[0],
        })).status,401);
        // Force a previous step in this isolated test to exercise a valid OTP without sleeping.
        await db.query('UPDATE user_totp_factors SET last_step=-1 WHERE user_id=$1',[id]);
        const success=await req('/auth/mfa/login',{
          challengeToken:second.challengeToken,code:otp(setup.secret),
        });
        assert.equal(success.status,200);
        const third=await (await passLogin()).json();
        assert.equal((await req('/auth/mfa/login',{
          challengeToken:third.challengeToken,code:otp(setup.secret),
        })).status,401);
        assert.equal((await req('/auth/mfa/login',{
          challengeToken:third.challengeToken,code:enabled.recoveryCodes[1],
        })).status,200);
        const fourth=await (await passLogin()).json();
        const digest=createHash('sha256').update(Buffer.from(fourth.challengeToken,'base64url')).digest();
        await db.query(
          "UPDATE mfa_login_challenges SET expires_at=now()-interval '1 second' WHERE token_hash=$1",
          [digest],
        );
        assert.equal((await req('/auth/mfa/login',{
          challengeToken:fourth.challengeToken,code:enabled.recoveryCodes[2],
        })).status,401);
        const logs=await db.query('SELECT action FROM user_account_events ORDER BY id');
        assert.deepEqual(logs.rows.map(x=>x.action),[
          'MFA_ENABLE','MFA_RECOVERY_LOGIN','MFA_LOGIN','MFA_RECOVERY_LOGIN',
        ]);
        // Creating new challenges cannot reset the per-user failed-attempt window.
        const invalidOtp=otp(setup.secret)==='000000'?'999999':'000000';
        for(let n=0;n<5;n++){
          const attempt=await passLogin();
          assert.equal(attempt.status,200);
          const candidate=await attempt.json();
          assert.equal((await req('/auth/mfa/login',{
            challengeToken:candidate.challengeToken,code:invalidOtp,
          })).status,401);
        }
        const locked=await passLogin();
        assert.equal(locked.status,429);
        assert.equal(locked.headers.get('retry-after'),'900');
        await db.query(
          "UPDATE user_totp_factors SET locked_until=now()-interval '1 second',"+
          " failure_window_at=now()-interval '16 minutes' WHERE user_id=$1",[id],
        );
        await db.query(
          "UPDATE mfa_login_challenges SET expires_at=now()-interval '1 second' "+
          "WHERE user_id=$1 AND consumed_at IS NULL",[id],
        );
        assert.equal((await passLogin()).status,200);
      }finally{server.close();await once(server,'close');}
      await db.query('ROLLBACK');
    }finally{db.release();}
  }finally{await pool.end();}
});
test('MFA-enabled login fails closed when encryption key is not configured',{
  skip:!process.env.DATABASE_URL,
},async()=>{
  const pool=createPool();
  try{
    await runMigrations(pool);
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions(name,kind) VALUES('Bank MFA Key','BPR')");
      const password='MfaFailClosedPassword';
      const user=await db.query(
        "INSERT INTO users(email,status,password_hash) VALUES($1,'active',$2) RETURNING id",
        ['mfa-fail-closed@example.test',await hashPassword(password)],
      );
      // The factor only needs to exist here; decrypt is never attempted.
      await db.query(
        'INSERT INTO user_totp_factors(user_id,nonce,secret_ciphertext,auth_tag) '+
        "VALUES($1,decode(repeat('00',12),'hex'),decode('01','hex'),decode(repeat('00',16),'hex'))",
        [user.rows[0].id],
      );
      const server=createServer({
        authDb:db,appOrigin:ORIGIN,mfaEncryptionKey:'incorrect',
      });
      server.listen(0,'127.0.0.1');await once(server,'listening');
      try{
        const response=await fetch('http://127.0.0.1:'+server.address().port+'/auth/login',{
          method:'POST',
          headers:{Origin:ORIGIN,'Content-Type':'application/json'},
          body:JSON.stringify({email:'mfa-fail-closed@example.test',password}),
        });
        assert.equal(response.status,503);
        assert.equal(response.headers.get('set-cookie'),null);
      }finally{server.close();await once(server,'close');}
      await db.query('ROLLBACK');
    }finally{db.release();}
  }finally{await pool.end();}
});
