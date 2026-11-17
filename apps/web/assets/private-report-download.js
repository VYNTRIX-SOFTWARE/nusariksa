import {ApiError} from './session.js';
/**
 * Downloads sensitive reports through the same authenticated, no-store channel
 * as the rest of the app. A 401 is an explicit session error, never a PDF file.
 */
export async function downloadPrivateReport(path,filename,{accept='application/pdf,text/csv'}={}){
  if(typeof path!=='string'||!path.startsWith('/')||path.startsWith('//')
    ||/[?#]/.test(path)||typeof filename!=='string'
    ||!/^[a-z0-9_.-]{5,120}$/i.test(filename))
    throw new TypeError('Alamat unduhan tidak valid.');
  const response=await fetch(path,{method:'GET',credentials:'same-origin',
    cache:'no-store',redirect:'error',headers:{Accept:accept}});
  if(!response.ok){
    let reason='Unduhan tidak tersedia';
    try{const json=await response.json();if(typeof json.error==='string')reason=json.error;}catch{}
    throw new ApiError(response.status,reason);
  }
  const type=response.headers.get('content-type')??'';
  if(!/^(application\/pdf|text\/csv)(?:;|$)/i.test(type))
    throw new TypeError('Server tidak mengirim file laporan yang valid.');
  const blob=await response.blob();
  if(blob.size<1||blob.size>40*1024*1024)
    throw new TypeError('Ukuran file unduhan tidak valid.');
  const url=URL.createObjectURL(blob);
  try{
    const link=document.createElement('a');
    link.href=url;link.download=filename;
    document.body.append(link);link.click();link.remove();
  }finally{
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  return {bytes:blob.size,contentType:type};
}
export function reportDownloadError(error){
  if(error?.status===401)return 'Sesi masuk telah berakhir. Masuk kembali untuk mengunduh laporan.';
  if(error?.status===403)return 'Akun ini belum memiliki izin mengunduh laporan.';
  if(error?.status===404)return 'Data laporan tidak ditemukan.';
  if(error?.status===409)return 'Laporan belum dapat dibuat pada status ini.';
  return 'Unduhan gagal. Periksa koneksi atau muat ulang laporan.';
}
