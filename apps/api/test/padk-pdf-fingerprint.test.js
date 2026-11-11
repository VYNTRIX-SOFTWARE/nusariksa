import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {inspectPadkPdfCopy,KNOWN_WORKING_COPY_SHA256}
 from '../../../scripts/padk-pdf-fingerprint.js';

test('fingerprint PDF tidak mempromosikan salinan ke instrumen resmi',()=>{
 const bytes=Buffer.concat([Buffer.from('%PDF-1.5\n'),Buffer.alloc(2048,32)]);
 const result=inspectPadkPdfCopy(bytes);
 assert.equal(result.sha256,createHash('sha256').update(bytes).digest('hex'));
 assert.equal(result.sameAsRecordedWorkingCopy,false);
 assert.equal(result.sourceAuthenticityVerified,false);
 assert.equal(result.regulatoryContentVerified,false);
 assert.equal(result.approvedForScoring,false);
 assert.equal(KNOWN_WORKING_COPY_SHA256.length,64);
 assert.throws(()=>inspectPadkPdfCopy(Buffer.from('not a pdf')),/PDF valid/);
 assert.throws(()=>inspectPadkPdfCopy('input'),/PDF valid/);
});
