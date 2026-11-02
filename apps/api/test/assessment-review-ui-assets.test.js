import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createServer } from '../src/server.js';

test('UI review dan antrean disajikan dengan CSP same-origin',async()=>{
  const server=createServer();
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  try{
    const page=await fetch(base+'/');
    assert.equal(page.status,200);
    assert.match(page.headers.get('content-security-policy'),/script-src 'self'/);
    const html=await page.text();
    for(const id of ['review-menu','review-menu-group','page-reviews',
      'review-queue-table','review-queue-reload','workspace-review-panel',
      'workspace-submit-area','workspace-submit-review','workspace-review-form',
      'workspace-review-decision','workspace-review-note','workspace-review-save',
      'workspace-review-history','workspace-review-history-reload','workspace-review-cycle'])
      assert.ok(html.includes('id="'+id+'"'),id+' missing');
    assert.doesNotMatch(html,/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i);
    const model=await fetch(base+'/assets/assessment-review-model.js');
    assert.equal(model.status,200);
    assert.match(model.headers.get('content-type'),/text\/javascript/);
    assert.match(await model.text(),/canDecideReview/);
    const workspace=await(await fetch(base+'/assets/assessment-workspace.js')).text();
    assert.match(workspace,/runAction\('\/submit'\)/);
    assert.match(workspace,/base\('\/review'\)/);
    assert.match(workspace,/base\('\/reviews'\)/);
    assert.match(workspace,/decision,note/);
    assert.match(workspace,/window\.confirm/);
    const app=await(await fetch(base+'/assets/app.js')).text();
    assert.match(app,/pendingReviewQueue/);
    assert.match(app,/onChanged:loadWorkspace/);
    assert.match(app,/data-review-id/);
    assert.equal((await fetch(base+'/assets/assessment-review-secret.js')).status,404);
  }finally{server.close();await once(server,'close');}
});
