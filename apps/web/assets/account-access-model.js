// Client-side guidance only. The server remains authoritative for activation.
export function invitationCodeLooksValid(raw){
  return typeof raw==='string'&&/^[A-Za-z0-9_-]{43}$/.test(raw.trim());
}
export function passwordReadiness(password,confirmation){
  if(typeof password!=='string'||typeof confirmation!=='string')
    throw new TypeError('Password tidak valid.');
  const longEnough=password.length>=12&&password.length<=1024;
  const match=confirmation.length>0&&password===confirmation;
  return {longEnough,match,ready:longEnough&&match};
}
