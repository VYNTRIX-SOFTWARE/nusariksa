import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const script=join(root,'scripts','check-padk-regulatory-packs.js');

test('release gate menolak sumber PDF yang tidak disediakan',()=>{
  const result=spawnSync(process.execPath,[script,'--release'],{
    cwd:root,encoding:'utf8',timeout:15000,
  });
  assert.equal(result.status,1);
  assert.match(result.stderr,/--source-pdf/);
});

test('release gate menolak berkas yang tidak ada atau bukan PDF',()=>{
  const dir=mkdtempSync(join(tmpdir(),'nusariksa-padk-'));
  try{
    const missing=spawnSync(process.execPath,[
      script,'--release','--source-pdf='+join(dir,'missing.pdf'),
    ],{cwd:root,encoding:'utf8',timeout:15000});
    assert.equal(missing.status,1);
    assert.match(missing.stderr,/PDF sumber tidak dapat dibaca/);

    const fake=join(dir,'document.pdf');
    writeFileSync(fake,Buffer.alloc(2048,0x61));
    const invalid=spawnSync(process.execPath,[
      script,'--release','--source-pdf='+fake,
    ],{cwd:root,encoding:'utf8',timeout:15000});
    assert.equal(invalid.status,1);
    assert.match(invalid.stderr,/bukan berkas PDF/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
