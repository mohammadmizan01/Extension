// JobHunt Tracker backend — API smoke test (uses in-memory MongoDB)
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

async function main() {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);

  const app = require('../src/server.js');
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const results = [];
  const check = (name, cond) => {
    results.push([cond ? 'PASS' : 'FAIL', name]);
    if (!cond) process.exitCode = 1;
  };

  const api = async (method, path, body, token) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  };

  // 1. health
  let r = await api('GET', '/api/health');
  check('health 200', r.status === 200 && r.json.ok === true);

  // 2. register device A
  r = await api('POST', '/api/devices/register', { name: 'laptop' });
  check('register 201', r.status === 201 && r.json.syncKey && r.json.deviceToken);
  const { syncKey, deviceToken: tokenA } = r.json;

  // 3. link device B with sync key
  r = await api('POST', '/api/devices/link', { syncKey, name: 'phone' });
  check('link 201', r.status === 201 && r.json.deviceToken);
  const tokenB = r.json.deviceToken;

  // 4. link with wrong key → 404
  r = await api('POST', '/api/devices/link', { syncKey: 'nope' });
  check('link bad key 404', r.status === 404);

  // 5. unauthenticated sync → 401
  r = await api('GET', '/api/sync/pull');
  check('pull without token 401', r.status === 401);

  // 6. push 2 jobs from device A
  const now = new Date().toISOString();
  r = await api('POST', '/api/sync/push', {
    jobs: [
      { clientId: 'job_1', title: 'Frontend Dev', company: 'Acme', status: 'applied', clientUpdatedAt: now },
      { clientId: 'job_2', title: 'Backend Dev', company: 'Beta', status: 'saved', clientUpdatedAt: now },
    ],
  }, tokenA);
  check('push upserted 2', r.status === 200 && r.json.upserted === 2);

  // 7. pull from device B sees both
  r = await api('GET', '/api/sync/pull', null, tokenB);
  check('pull sees 2 jobs', r.status === 200 && r.json.jobs.length === 2);

  // 8. stale push loses (last-write-wins)
  const older = new Date(Date.now() - 60000).toISOString();
  r = await api('POST', '/api/sync/push', {
    jobs: [{ clientId: 'job_1', title: 'STALE', status: 'saved', clientUpdatedAt: older }],
  }, tokenB);
  r = await api('GET', '/api/sync/pull', null, tokenA);
  const job1 = r.json.jobs.find((j) => j.clientId === 'job_1');
  check('stale push ignored', job1.title === 'Frontend Dev' && job1.status === 'applied');

  // 9. newer push wins
  const newer = new Date(Date.now() + 1000).toISOString();
  await api('POST', '/api/sync/push', {
    jobs: [{ clientId: 'job_1', title: 'Frontend Dev', status: 'interview', clientUpdatedAt: newer }],
  }, tokenB);
  r = await api('GET', '/api/sync/pull', null, tokenA);
  check('newer push wins', r.json.jobs.find((j) => j.clientId === 'job_1').status === 'interview');

  // 10. delete tombstone propagates
  await api('POST', '/api/sync/push', {
    jobs: [{ clientId: 'job_2', deleted: true, clientUpdatedAt: new Date().toISOString() }],
  }, tokenA);
  r = await api('GET', '/api/sync/pull', null, tokenB);
  check('tombstone propagates', r.json.jobs.find((j) => j.clientId === 'job_2').deleted === true);

  // 11. list devices (auth)
  r = await api('GET', '/api/devices', null, tokenA);
  check('device list 2', r.status === 200 && r.json.devices.length === 2);

  // 12. revoke device B, then B is locked out
  const devB = r.json.devices.find((d) => !d.current);
  r = await api('POST', `/api/devices/${devB.id}/revoke`, {}, tokenA);
  check('revoke ok', r.status === 200 && r.json.ok === true);
  r = await api('GET', '/api/sync/pull', null, tokenB);
  check('revoked token 401', r.status === 401);

  console.log('\n' + results.map(([s, n]) => `${s}  ${n}`).join('\n'));
  const failed = results.filter(([s]) => s === 'FAIL').length;
  console.log(failed === 0 ? '\nALL TESTS PASSED' : `\n${failed} FAILED`);

  server.close();
  await mongoose.disconnect();
  await mongod.stop();
}

main().catch((e) => {
  console.error('TEST CRASH:', e);
  process.exit(1);
});
