import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createServer } from '../src/server.js';

test('shell disajikan tanpa melemahkan CSP atau mengaktifkan fitur palsu',async()=>{
  const server=createServer();
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  try{
    const home=await fetch(base+'/');
    assert.equal(home.status,200);
    assert.match(home.headers.get('content-security-policy'),/script-src 'self'/);
    assert.match(home.headers.get('content-security-policy'),/style-src 'self'/);
    const html=await home.text();
    for(const marker of [
      'id="sidebar-toggle"','id="mobile-nav-toggle"','id="sidebar-backdrop"',
      'id="period-select"','id="assessment-search"','id="status-filter"',
      'id="detail-dialog"','id="metric-changes"',
    ]) assert.ok(html.includes(marker));
    assert.match(html,/data-page="catalogs"/);
    assert.match(html,/href="\/assets\/brand\/nusariksa-icon\.svg"/);
    assert.match(html,/src="\/assets\/brand\/nusariksa-primary\.svg"/);
    assert.match(html,/src="\/assets\/brand\/nusariksa-dark\.svg"/);
    assert.match(html,/id="catalog-menu"[^>]*hidden/);
    assert.match(html,/id="page-catalogs"[^>]*hidden/);
    assert.match(html,/data-page="reports"/);
    assert.match(html,/id="report-menu"[^>]*hidden/);
    assert.match(html,/id="report-menu-group"[^>]*hidden/);
    assert.match(html,/id="page-reports"[^>]*hidden/);
    assert.doesNotMatch(html,/DEMO\b|Patuh OJK|switcher bank/i);
    assert.doesNotMatch(html,/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i);
    const css=await(await fetch(base+'/assets/styles.css')).text();
    for(const token of ['#0A3E7F','#073264','#2999E0','#0B1B32','#F7F8FA','#E5E7EB'])
      assert.ok(css.includes(token));
    assert.match(css,/width:256px/);
    assert.match(css,/flex-basis:68px/);
    assert.match(css,/prefers-reduced-motion/);
    assert.match(css,/@media \(max-width: 760px\)/);
    const model=await fetch(base+'/assets/assessment-model.js');
    assert.equal(model.status,200);
    assert.match(model.headers.get('content-type'),/text\/javascript/);
    assert.match(await model.text(),/summarizeAssessments/);
    assert.equal((await fetch(base+'/assets/nope.js')).status,404);
    const app=await(await fetch(base+'/assets/app.js')).text();
    assert.match(app,/restoreSession/);
    assert.match(app,/getPermissions/);
    assert.match(app,/encodeURIComponent/);
    assert.match(app,/textContent/);
  }finally{server.close();await once(server,'close');}
});
