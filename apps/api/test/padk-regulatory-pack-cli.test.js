import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const script=join(root,'scripts','check-padk-regulatory-packs.js');
const packDir=join(root,'regulations','padk43','cyber','packs');

test('release gate menolak rilis saat kedua regulatory pack belum ada',()=>{
  const packs=['kategori-1.json','kategori-2.json'];
  if(packs.every(name=>existsSync(join(packDir,name)))) {
    // Full content validation remains tested by padk-regulatory-pack-review.test.js.
    return;
  }
  const development=spawnSync(process.execPath,[script],{
    cwd:root,encoding:'utf8',timeout:15000,
  });
  assert.equal(development.status,0,development.stderr);
  assert.match(development.stdout,/Release gate TIDAK LULUS/);

  const release=spawnSync(process.execPath,[script,'--release'],{
    cwd:root,encoding:'utf8',timeout:15000,
  });
  assert.equal(release.status,1,release.stdout+'\n'+release.stderr);
  assert.match(release.stderr,/Regulatory pack gate gagal/);
});
