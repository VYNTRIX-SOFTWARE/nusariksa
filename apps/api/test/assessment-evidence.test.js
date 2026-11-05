import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EvidenceError, validateEvidence, parseEvidenceKey, encryptEvidence, decryptEvidence,
  EVIDENCE_MAX_BYTES,
} from '../src/assessment-evidence.js';
import {
  evidenceCanWrite, validEvidenceListing, fileToBase64,
} from '../../web/assets/assessment-evidence.js';

const key = parseEvidenceKey('ab'.repeat(32));
const assessmentId='11111111-1111-4111-8111-111111111111';
const controlId='22222222-2222-4222-8222-222222222222';
const pdf=Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF','utf8');

test('bukti menerima media yang cocok dengan ekstensi dan magic bytes',()=>{
  const good=validateEvidence({
    fileName:'kebijakan TI.pdf', mediaType:'application/pdf',
    contentBase64:pdf.toString('base64'),
  });
  assert.deepEqual(good.bytes,pdf);
  assert.equal(good.mediaType,'application/pdf');
  const png=Buffer.from([137,80,78,71,13,10,26,10,0,0]);
  assert.equal(validateEvidence({fileName:'bukti.PNG',mediaType:'image/png',
    contentBase64:png.toString('base64')}).bytes.length,10);
  const jpeg=Buffer.from([255,216,255,1,0,255,217]);
  assert.equal(validateEvidence({fileName:'foto.jpeg',mediaType:'image/jpeg',
    contentBase64:jpeg.toString('base64')}).bytes.length,7);
});

test('bukti menolak file palsu, path dan base64 tidak kanonis',()=>{
  const base64=pdf.toString('base64');
  for(const value of [
    {fileName:'../aturan.pdf',mediaType:'application/pdf',contentBase64:base64},
    {fileName:'folder/x.pdf',mediaType:'application/pdf',contentBase64:base64},
    {fileName:'a\r\nb.pdf',mediaType:'application/pdf',contentBase64:base64},
    {fileName:'laporan.js',mediaType:'application/pdf',contentBase64:base64},
    {fileName:'laporan.pdf',mediaType:'text/html',contentBase64:base64},
    {fileName:'laporan.pdf',mediaType:'application/pdf',contentBase64:'%%//'},
    {fileName:'laporan.pdf',mediaType:'application/pdf',contentBase64:'AA=='},
    {fileName:'laporan.pdf',mediaType:'application/pdf',contentBase64:'AAB='},
    {fileName:'laporan.pdf',mediaType:'application/pdf',contentBase64:Buffer.alloc(EVIDENCE_MAX_BYTES+1).toString('base64')},
  ])assert.throws(()=>validateEvidence(value),e=>e instanceof EvidenceError&&e.status===400);
  assert.equal(parseEvidenceKey('bad'),null);
  assert.equal(parseEvidenceKey('gg'.repeat(32)),null);
});

test('AES-256-GCM terikat metadata, nonce acak dan SHA-256 plaintext',()=>{
  const input=validateEvidence({
    fileName:'kebijakan.pdf',mediaType:'application/pdf',contentBase64:pdf.toString('base64'),
  });
  const first=encryptEvidence({...input,assessmentId,controlId},key);
  const second=encryptEvidence({...input,assessmentId,controlId},key);
  assert.equal(first.ciphertext.equals(pdf),false);
  assert.equal(first.nonce.equals(second.nonce),false);
  assert.deepEqual(decryptEvidence(first,key),pdf);
  assert.throws(()=>decryptEvidence({...first,file_name:'ubah.pdf'},key),
    e=>e instanceof EvidenceError&&e.status===503);
  const tampered=Buffer.from(first.ciphertext);
  tampered[0]^=1;
  assert.throws(()=>decryptEvidence({...first,ciphertext:tampered},key),EvidenceError);
  assert.throws(()=>decryptEvidence(first,Buffer.alloc(32)),EvidenceError);
  assert.throws(()=>encryptEvidence({...input,assessmentId,controlId},null),
    e=>e.status===503);
});

test('UI mengizinkan unggah hanya oleh pemilik yang berizin dan berstatus aktif',()=>{
  assert.equal(evidenceCanWrite(['evidence:write'],assessmentId,assessmentId,'in_progress'),true);
  assert.equal(evidenceCanWrite(['evidence:write'],assessmentId,assessmentId,'changes_requested'),true);
  assert.equal(evidenceCanWrite(['evidence:read'],assessmentId,assessmentId,'in_progress'),false);
  assert.equal(evidenceCanWrite(['evidence:write'],controlId,assessmentId,'in_progress'),false);
  assert.equal(evidenceCanWrite(['evidence:write'],assessmentId,assessmentId,'approved'),false);
  assert.throws(()=>validEvidenceListing({assessmentId,controlId,evidence:[{id:'bad',fileName:'x',sizeBytes:1}]},assessmentId,controlId));
  assert.deepEqual(validEvidenceListing({assessmentId,controlId,evidence:[]},assessmentId,controlId),[]);
});

test('browser membatasi file sebelum encoding',async()=>{
  const mock={type:'application/pdf',size:pdf.length,name:'uji.pdf',
    arrayBuffer:async()=>Uint8Array.from(pdf).buffer};
  assert.equal(await fileToBase64(mock),pdf.toString('base64'));
  await assert.rejects(fileToBase64({...mock,type:'text/html'}),TypeError);
  await assert.rejects(fileToBase64({...mock,size:EVIDENCE_MAX_BYTES+1}),TypeError);
});
