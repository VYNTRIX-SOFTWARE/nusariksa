import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from '../src/server.js';
import { once } from 'node:events';

test('role change endpoint is unavailable without database configuration', async () => {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const response = await fetch('http://127.0.0.1:' + server.address().port
      + '/users/00000000-0000-4000-8000-000000000001/roles', {
      method: 'PATCH', headers: {
        Origin: 'http://127.0.0.1:3000', 'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'VIEWER', action: 'GRANT' }),
    });
    assert.equal(response.status, 503);
  } finally {
    server.close();
    await once(server, 'close');
  }
});
