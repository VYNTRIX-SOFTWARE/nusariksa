import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';

const assets=[
  'app.js','assessment-evidence.js','assessment-report.js',
  'assessment-workspace.js','control-catalog.js',
  'maturity-assessment-ui.js','maturity-ui.js',
  'padk-preparation-ui.js','padk-indicator-note-ui.js','padk-evidence-ui.js',
  'padk-crosswalk-review-ui.js',
];

test('referensi ID statis di controller frontend tersedia pada HTML',async()=>{
  const html=await readFile(new URL('../../web/index.html',import.meta.url),'utf8');
  const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]));
  for(const name of assets){
    const source=await readFile(new URL('../../web/assets/'+name,import.meta.url),'utf8');
    for(const match of source.matchAll(/\$\(['"]([^'"]+)['"]\)/g))
      assert.ok(ids.has(match[1]),name+' mengakses ID yang tidak ada: '+match[1]);
  }
});
