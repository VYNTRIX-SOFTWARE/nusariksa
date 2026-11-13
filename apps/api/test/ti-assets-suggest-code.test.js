import assert from 'node:assert/strict';
import {test} from 'node:test';
import {suggestAssetCode} from '../../web/assets/ti-assets-ui.js';

test('saran kode aset memerlukan nama dan jenis yang dipilih petugas',()=>{
  assert.equal(suggestAssetCode('Server Core Banking','server'),'SRV-SERVER-CORE-BANKING');
  assert.equal(suggestAssetCode('Router Kantor Pusat','network'),'NET-ROUTER-KANTOR-PUSAT');
  assert.equal(suggestAssetCode('Laptop Teller','workstation'),'PC-LAPTOP-TELLER');
  assert.equal(suggestAssetCode('','server'),'');
  assert.equal(suggestAssetCode('Laptop','unknown'),'');
  assert.equal(suggestAssetCode('Server',''),'');
  assert.match(suggestAssetCode('Penunjang Sistem Operasional Sangat Panjang','software'),/^[A-Z][A-Z0-9-]{1,31}$/);
});
