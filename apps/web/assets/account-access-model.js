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

export function invitationCodeProgress(raw){
  if(typeof raw!=='string')return {length:0,formatValid:false,message:'Tempel kode undangan dari administrator.'};
  const code=raw.trim(),length=code.length,formatValid=invitationCodeLooksValid(code);
  if(formatValid)return {length,formatValid,
    message:'Format kode sesuai. Keabsahan dan masa berlaku diperiksa saat aktivasi.'};
  if(length===0)return {length,formatValid,
    message:'Belum ada kode undangan. Minta administrator mengundang akun Anda.'};
  if(length>43)return {length,formatValid,message:'Kode terlalu panjang. Pastikan hanya menempel satu kode undangan.'};
  if(length===43)return {length,formatValid,
    message:'Kode mengandung karakter yang tidak dikenal. Salin ulang dari administrator.'};
  return {length,formatValid,message:'Kode belum lengkap ('+length+' dari 43 karakter).'};
}
