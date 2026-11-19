import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';

const root=new URL('../../web/index.html',import.meta.url);
const actions=new URL('../../web/assets/register-export-buttons.js',import.meta.url);
test('tombol PDF tersedia untuk setiap register dan menggunakan unduhan privat',async()=>{
  const [html,js]=await Promise.all([
    readFile(root,'utf8'),readFile(actions,'utf8'),
  ]);
  const types=['assets','risks','incidents','findings','vendors',
    'vendor-contracts','vendor-sla','recovery','recovery-tests'];
  for(const type of types){
    assert.match(html,new RegExp('data-register-export="'+type+'"'));
    assert.match(html,new RegExp('data-register-pdf="'+type+'"'));
  }
  assert.match(js,/downloadPrivateReport/);
  assert.match(js,/data-register-pdf/);
  assert.match(js,/reports:read/);
  assert.match(js,/accept:format==='pdf'\?'application\/pdf':'text\/csv'/);
  assert.doesNotMatch(js,/window\.open\(/);
});
