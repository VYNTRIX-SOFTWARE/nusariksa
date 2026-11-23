import assert from 'node:assert/strict';
import {test} from 'node:test';
import {EventEmitter} from 'node:events';
import {createServiceShutdown,installShutdownSignals} from '../src/service-lifecycle.js';

test('SIGTERM/SIGINT memakai satu shutdown dan menutup pool sekali',async()=>{
  let closes=0,ends=0;
  const server={close:cb=>{closes++;queueMicrotask(()=>cb());}};
  const pool={end:async()=>{ends++;}};
  const shutdown=createServiceShutdown({server,pool});
  const source=new EventEmitter();
  const detach=installShutdownSignals(shutdown,{source});
  assert.equal(source.listenerCount('SIGTERM'),1);
  assert.equal(source.listenerCount('SIGINT'),1);
  source.emit('SIGTERM');
  assert.equal(source.listenerCount('SIGTERM'),0);
  assert.equal(source.listenerCount('SIGINT'),0);
  await shutdown();
  assert.equal(closes,1);assert.equal(ends,1);
  await shutdown();assert.equal(closes,1);assert.equal(ends,1);
  detach();
});

test('shutdown membatasi drain koneksi dan tetap menutup pool',async()=>{
  let forced=0,callback=null,ends=0;
  const server={
    close:cb=>{callback=cb;},
    closeAllConnections:()=>{forced++;callback?.();},
  };
  const shutdown=createServiceShutdown({server,pool:{end:async()=>{ends++;}},drainMs:5});
  await shutdown();
  assert.equal(forced,1);assert.equal(ends,1);
});

test('server belum berjalan tidak menghalangi pembersihan pool',async()=>{
  let ends=0;
  const server={close:cb=>cb(Object.assign(new Error('not listening'),{
    code:'ERR_SERVER_NOT_RUNNING',
  }))};
  await createServiceShutdown({server,pool:{end:async()=>{ends++;}}})();
  assert.equal(ends,1);
});

test('kegagalan penutupan melapor tanpa mengeluarkan rahasia mentah',async()=>{
  let onError=0;
  const source=new EventEmitter();
  const detach=installShutdownSignals(async()=>{
    throw new Error('secret source connection string');
  },{source,onError:()=>{onError++;}});
  source.emit('SIGINT');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(onError,1);
  assert.equal(source.listenerCount('SIGINT'),0);
  detach();
});

test('konfigurasi shutdown tidak menerima batas waktu tidak valid',()=>{
  assert.throws(()=>createServiceShutdown({server:{close(){}},drainMs:0}),TypeError);
  assert.throws(()=>installShutdownSignals(null),TypeError);
});
