import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {validateTiWorkOverview} from '../../web/assets/ti-work-ui.js';

const ID='00000000-0000-4000-8000-000000000001';
const make=()=>({kind:'TI_WORK_OVERVIEW',generatedAt:'2026-11-20T00:00:00Z',
  modules:[{type:'risks',count:1},{type:'findings',count:0}],
  items:[{type:'risks',id:ID,relatedId:null,
    code:'RSK-2026-000001',title:'Risiko CBS',reason:'Risiko inheren tinggi/kritis belum ditutup',
    priority:3,dueDate:'2027-01-31'}],hasMore:false});

test('model pusat pekerjaan menolak kategori, kode, atau ID tidak terpercaya',()=>{
  assert.equal(validateTiWorkOverview(make()).items[0].code,'RSK-2026-000001');
  assert.throws(()=>validateTiWorkOverview({...make(),kind:'UNKNOWN'}),TypeError);
  assert.throws(()=>validateTiWorkOverview({...make(),modules:[
    {type:'risks',count:1},{type:'risks',count:3}]}),TypeError);
  assert.throws(()=>validateTiWorkOverview({...make(),items:[{
    ...make().items[0],type:'vendors'}]}),TypeError);
  assert.throws(()=>validateTiWorkOverview({...make(),items:[{
    ...make().items[0],id:'../private'}]}),TypeError);
  assert.throws(()=>validateTiWorkOverview({...make(),items:[{
    ...make().items[0],priority:-1}]}),TypeError);
});

test('navigasi dan halaman pusat pekerjaan terhubung tanpa link eksternal',async()=>{
  const [html,app,source]=await Promise.all([
    readFile(new URL('../../web/index.html',import.meta.url),'utf8'),
    readFile(new URL('../../web/assets/app.js',import.meta.url),'utf8'),
    readFile(new URL('../../web/assets/ti-findings-ui.js',import.meta.url),'utf8'),
  ]);
  for(const id of ['ti-work-menu','page-ti-work','ti-work-list','ti-work-groups',
    'ti-work-filter','ti-work-refresh'])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(app,/openTiWorkRecord/);
  assert.match(app,/createTiWorkUI/);
  assert.match(source,/onOpenSource/);
  assert.match(source,/getPermissions\(\)\.includes\(permission\)/);
  assert.doesNotMatch(app,/window\.open\(/);
});
