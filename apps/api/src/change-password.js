import {hashPassword,verifyPassword} from './passwords.js';
import {createSession} from './sessions.js';

export class PasswordChangeError extends Error {
  constructor(status,message){super(message);this.name='PasswordChangeError';this.status=status;}
}

export function validatePasswordChange({currentPassword,newPassword}={}){
  if(typeof currentPassword!=='string'||typeof newPassword!=='string'
    ||Buffer.byteLength(currentPassword,'utf8')<1
    ||Buffer.byteLength(currentPassword,'utf8')>1024
    ||Buffer.byteLength(newPassword,'utf8')<12
    ||Buffer.byteLength(newPassword,'utf8')>1024
    ||currentPassword===newPassword)
    throw new PasswordChangeError(400,'Invalid password change request');
  return {currentPassword,newPassword};
}

export async function changePasswordInTransaction(db,{userId,...input}){
  const {currentPassword,newPassword}=validatePasswordChange(input);
  const user=await db.query(
    "SELECT password_hash FROM users WHERE id=$1 AND status='active' "+
    'AND password_hash IS NOT NULL FOR UPDATE',[userId],
  );
  if(user.rowCount!==1)throw new PasswordChangeError(401,'Unauthorized');
  if(!await verifyPassword(currentPassword,user.rows[0].password_hash))
    throw new PasswordChangeError(401,'Invalid current password');
  // A password change must not silently accept the existing credential.
  if(await verifyPassword(newPassword,user.rows[0].password_hash))
    throw new PasswordChangeError(400,'New password must differ from current password');
  const replacementHash=await hashPassword(newPassword);
  await db.query('UPDATE users SET password_hash=$2 WHERE id=$1',[userId,replacementHash]);
  await db.query(
    'UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',
    [userId],
  );
  const session=await createSession(db,userId);
  await db.query(
    "INSERT INTO user_account_events(actor_user_id,target_user_id,action) "+
    "VALUES($1,$1,'PASSWORD_CHANGE')",[userId],
  );
  return {userId,token:session.token};
}

export async function changePassword(pool,args){
  const db=await pool.connect();
  try{
    await db.query('BEGIN');
    const result=await changePasswordInTransaction(db,args);
    await db.query('COMMIT');
    return result;
  }catch(error){
    await db.query('ROLLBACK');
    throw error;
  }finally{db.release();}
}
