import assert from 'node:assert/strict';
import {test} from 'node:test';
import {formatTiDocumentNumber} from '../src/ti-document-numbers.js';

test('tujuh jenis nomor dokumen memiliki prefix dan rentang valid',()=>{
 for(const [kind,prefix] of Object.entries({asset:'AST',incident:'INC',risk:'RSK',finding:'FND',vendor:'VND',contract:'CTR',recovery:'RCP'})){
  assert.equal(formatTiDocumentNumber(kind,2026,1),prefix+'-2026-000001');
  assert.equal(formatTiDocumentNumber(kind,2027,999999),prefix+'-2027-999999');
 }
 for(const [k,y,n] of [['unknown',2026,1],['risk',2026,0],['risk',2026,1000000],['risk',1999,1],['vendor',2026,1.5]])assert.throws(()=>formatTiDocumentNumber(k,y,n),TypeError);
});
