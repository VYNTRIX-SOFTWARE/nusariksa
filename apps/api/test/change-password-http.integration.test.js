import assert from 'node:assert/strict';
import {once} from 'node:events';
import {test} from 'node:test';
import {createPool} from '../src/database.js';
import {runMigrations} from '../src/migrations.js';
import {hashPassword,verifyPassword} from '../src/passwords.js';
import {createSession,findSession} from '../src/sessions.js';
import {createServer} from '../src/server.js';
import {changePasswordInTransaction,validatePasswordChange} from '../src/change-password.js';

const ORIGIN='http://127.0.0.1:3000';

test('password change rejects invalid inputs before checking credentials',()=>{
  for(const value of [
    {currentPassword:'',newPassword:'longpassword123'},
    {currentPassword:'old',newPassword:'short'},
    {currentPassword:'samepassword12',newPassword:'samepassword12'},
    {currentPassword:'old',newPassword:'x'.repeat(1025)},
    {currentPassword:1,newPassword:'securepassword123'},
  ])assert.throws(()=>validatePasswordChange(value));
});

test('password change rotates the active session, revokes other devices and logs audit', {
  skip:!process.env.DATABASE_URL,
},async()=>{
  const pool=createPool();
  try{
    await runMigrations(pool);
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      await db.query("INSERT INTO institutions(name,kind) VALUES('Bank Password Test','BPR')");
      const oldPassword='OriginalPass_2026';
      const newPassword='AnotherLongPass_2026';
      const created=await db.query(
        "INSERT INTO users(email,status,password_hash) VALUES($1,'active',$2) RETURNING id",
        ['change-password@example.test',await hashPassword(oldPassword)],
      );
      const userId=created.rows[0].id;
      const initial=await createSession(db,userId);
      const another=await createSession(db,userId);
      const cookie=token=>'__Host-nusariksa_session='+token;
      const server=createServer({
        authDb:db,appOrigin:ORIGIN,
        changeUserPassword:(client,args)=>changePasswordInTransaction(client,args),
      });
      server.listen(0,'127.0.0.1');await once(server,'listening');
      const base='http://127.0.0.1:'+server.address().port;
      const send=(token,body,origin=ORIGIN,type='application/json')=>fetch(base+'/auth/change-password',{
        method:'POST',
        headers:{Origin:origin,'Content-Type':type,...(token?{Cookie:cookie(token)}:{})},
        body:typeof body==='string'?body:JSON.stringify(body),
      });
      try{
        assert.equal((await send(null,{currentPassword:oldPassword,newPassword})).status,401);
        assert.equal((await send(initial.token,{currentPassword:oldPassword,newPassword},'https://evil.example')).status,403);
        assert.equal((await send(initial.token,{currentPassword:oldPassword,newPassword},ORIGIN,'text/plain')).status,415);
        assert.equal((await send(initial.token,{currentPassword:oldPassword,newPassword,extra:'x'})).status,400);
        assert.equal((await send(initial.token,{currentPassword:oldPassword,newPassword:'short'})).status,400);
        assert.equal((await send(initial.token,{currentPassword:'wrong-password',newPassword})).status,401);
        assert.ok(await findSession(db,initial.token));
        assert.ok(await findSession(db,another.token));
        const failed=await db.query(
          "SELECT count(*)::int AS n FROM user_account_events WHERE action='PASSWORD_CHANGE'",
        );
        assert.equal(failed.rows[0].n,0);
        const changed=await send(initial.token,{currentPassword:oldPassword,newPassword});
        assert.equal(changed.status,200);
        const token=changed.headers.get('set-cookie')?.match(/^__Host-nusariksa_session=([A-Za-z0-9_-]{43});/);
        assert.ok(token);
        assert.match(changed.headers.get('set-cookie'),/Secure; HttpOnly; SameSite=Strict/);
        assert.equal((await changed.json()).passwordChanged,true);
        assert.equal(await findSession(db,initial.token),null);
        assert.equal(await findSession(db,another.token),null);
        assert.equal((await fetch(base+'/auth/session',{headers:{Cookie:cookie(another.token)}})).status,401);
        assert.equal((await fetch(base+'/auth/session',{headers:{Cookie:cookie(token[1])}})).status,200);
        const updated=await db.query('SELECT password_hash FROM users WHERE id=$1',[userId]);
        assert.equal(await verifyPassword(oldPassword,updated.rows[0].password_hash),false);
        assert.equal(await verifyPassword(newPassword,updated.rows[0].password_hash),true);
        const audits=await db.query(
          "SELECT action FROM user_account_events WHERE actor_user_id=$1 ORDER BY id",[userId],
        );
        assert.deepEqual(audits.rows.map(x=>x.action),['PASSWORD_CHANGE']);
        for(let i=0;i<5;i++)
          assert.equal((await send(token[1],{
            currentPassword:oldPassword,newPassword:'ThirdLongPass_2026',
          })).status,401);
        const blocked=await send(token[1],{
          currentPassword:newPassword,newPassword:'ThirdLongPass_2026',
        });
        assert.equal(blocked.status,429);
        assert.equal(blocked.headers.get('retry-after'),'900');
      }finally{server.close();await once(server,'close');}
      await db.query('ROLLBACK');
    }finally{db.release();}
  }finally{await pool.end();}
});
