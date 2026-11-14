import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {serveWebAsset} from '../src/web-assets.js';

const assetList=[
  {path:'/assets/brand/nusariksa-primary.svg',file:'nusariksa-primary.svg',
   blob:'d83aa450a2c33b34bea71c6f76b984243a5ae5f0'},
  {path:'/assets/brand/nusariksa-dark.svg',file:'nusariksa-dark.svg',
   blob:'c54920cb3276a525f0ead48e27eba473cb23f490'},
  {path:'/assets/brand/nusariksa-icon.svg',file:'nusariksa-icon.svg',
   blob:'0d6b23ba285c4ef493d9e9fe5322d12ded0df289'},
];

test('logo Nusariksa memakai vektor resmi tanpa elemen aktif',async()=>{
  for(const asset of assetList){
    const file=await readFile(new URL('../../web'+asset.path,import.meta.url));
    const blob=Buffer.concat([Buffer.from('blob '+file.length+'\0'),file]);
    assert.equal(createHash('sha1').update(blob).digest('hex'),asset.blob,asset.file);
    const xml=file.toString('utf8');
    assert.match(xml,/^<svg\s/);
    assert.match(xml,/<path /);
    assert.doesNotMatch(xml,/<script|onload\s*=|foreignObject|<image\b|\shref\s*=\s*[\"']https?:/i);
  }
});

test('server hanya menyajikan tiga aset identitas dengan MIME dan CSP aman',async()=>{
  const server=createServer((request,response)=>{
    void serveWebAsset(request,response).then(found=>{
      if(!found){response.writeHead(404);response.end();}
    }).catch(()=>{response.writeHead(500);response.end();});
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  try{
    for(const asset of assetList){
      const response=await fetch(base+asset.path);
      assert.equal(response.status,200,asset.path);
      assert.match(response.headers.get('content-type'),/image\/svg\+xml/);
      assert.match(response.headers.get('content-security-policy'),/default-src 'none'/);
      assert.equal(response.headers.get('cross-origin-resource-policy'),'same-origin');
      assert.match(await response.text(),/Nusariksa/);
      const head=await fetch(base+asset.path,{method:'HEAD'});
      assert.equal(head.status,200);
      assert.equal(await head.text(),'');
    }
    const nonexistent=await fetch(base+'/assets/brand/private.svg');
    assert.equal(nonexistent.status,404);
    const post=await fetch(base+assetList[0].path,{method:'POST'});
    assert.equal(post.status,405);
  }finally{
    const closed=once(server,'close');
    server.close();await closed;
  }
});

test('halaman aplikasi memakai logo brand kit pada layar utama dan favicon',async()=>{
  const html=await readFile(new URL('../../web/index.html',import.meta.url),'utf8');
  for(const asset of assetList)assert.ok(html.includes(asset.path),asset.path);
  assert.match(html,/rel="icon"\s+type="image\/svg\+xml"/);
  assert.doesNotMatch(html,/<span class="brand-mark">N<\/span>/);
  assert.doesNotMatch(html,/<span class="loading-mark"[^>]*>N<\/span>/);
});
