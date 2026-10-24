import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QrLogin } from '../lib/login.js';
const qrUrl = 'https://api.xiaoheihe.cn/account/qr_login/?qr=test-secret&app=web';
function setup() {
  let clock = 10000;
  const replies = [];
  const requests = [];
  const identities = [];
  const qr = new QrLogin({ now: () => clock, encode: async () => 'data:image/png;base64,test', authenticate: (account) => identities.push(account), request: async (...args) => {
    requests.push(args);
    const reply = replies.shift();
    if (reply instanceof Error) throw reply;
    return typeof reply === 'function' ? reply() : reply;
  } });
  return { qr, replies, requests, identities, advance: (ms = 1600) => clock += ms, start: async () => {
    replies.push({ data: { status: 'ok', result: { qr_url: qrUrl, expire: 120 } }, cookies: ['qr_cookie=abc; Path=/; HttpOnly'] });
    return qr.start();
  } };
}
const state = (error, extra = {}) => ({ data: { status: 'ok', result: { error, ...extra } }, cookies: [] });

test('QR lifecycle: waiting, scanned, confirmed; secrets remain on host', async () => {
  const s = setup(); const started = await s.start();
  assert.equal(started.expiresAt, 130000);
  assert.equal(started.status, 'waiting');
  assert.ok(!JSON.stringify(started).includes('test-secret'));
  s.replies.push(state('wait')); await s.qr.poll(started.sessionId);
  assert.equal(s.requests.at(-1)[2], 'qr_cookie=abc');
  const count = s.requests.length;
  await s.qr.poll(started.sessionId); assert.equal(s.requests.length, count, 'polls are throttled');
  s.advance(); s.replies.push(state('ready'));
  assert.equal((await s.qr.poll(started.sessionId)).status, 'scanned');
  s.advance(); s.replies.push(state('ok', { profile: { heybox_id: 123 }, pkey: 'private-key' }));
  const confirmed = await s.qr.poll(started.sessionId);
  assert.equal(confirmed.status, 'authenticated'); assert.equal(confirmed.image, null);
  assert.equal(s.identities[0].heyboxId, '123');
  assert.ok(s.identities[0].cookie.includes('user_pkey=private-key'));
  assert.ok(!JSON.stringify(confirmed).includes('private-key'));
  await s.qr.poll(started.sessionId); assert.equal(s.identities.length, 1);
});
test('confirmation can restore login from host-only cookies', async () => {
  const s = setup(); const started = await s.start();
  s.replies.push({ ...state('ok'), cookies: ['user_pkey=server-key; HttpOnly; Path=/'] },
    { data: { status: 'ok', result: { account_detail: { userid: '456' }, pkey: 'restored' } }, cookies: [] });
  assert.equal((await s.qr.poll(started.sessionId)).status, 'authenticated');
  assert.equal(s.requests.at(-1)[0], '/account/restore_login');
  assert.ok(s.requests.at(-1)[2].includes('user_pkey=server-key'));
});
test('local expiry, platform expiry and 2FA never authenticate', async () => {
  for (const mode of ['clock', 'platform', '2fa']) {
    const s = setup(); const started = await s.start();
    if (mode === 'clock') s.advance(120001);
    else s.replies.push(mode === 'platform' ? state('expired') : { data: { status: 'need_google_check', result: { secret: 'never-expose' } }, cookies: [] });
    const result = await s.qr.poll(started.sessionId);
    assert.equal(result.status, mode === '2fa' ? 'requires_2fa' : 'expired');
    assert.equal(result.image, null); assert.equal(s.identities.length, 0);
    assert.ok(!JSON.stringify(result).includes('never-expose'));
  }
});
test('cancel or refresh during an in-flight confirmation cannot overwrite account', async () => {
  for (const replace of [false, true]) {
    const s = setup(); const started = await s.start();
    let resolve;
    s.replies.push(() => new Promise((done) => resolve = done));
    const pending = s.qr.poll(started.sessionId);
    if (replace) await s.start(); else s.qr.cancelSession(started.sessionId);
    resolve(state('ok', { profile: { heybox_id: '123' }, pkey: 'old-key' }));
    await assert.rejects(pending, /取消/); assert.equal(s.identities.length, 0);
  }
});
test('reject missing credentials, untrusted QR URLs and retry after network errors', async () => {
  const s = setup();
  s.replies.push({ data: { status: 'ok', result: { qr_url: 'https://example.org/?qr=x' } } });
  await assert.rejects(s.qr.start(), /二维码无效/);
  const started = await s.start();
  s.replies.push(new Error('network')); await assert.rejects(s.qr.poll(started.sessionId), /network/);
  s.advance(); s.replies.push(state('ok'), { data: { status: 'login' }, cookies: [] });
  await assert.rejects(s.qr.poll(started.sessionId), /完整登录凭据/);
  assert.equal(s.identities.length, 0);
});

test('host routes persist confirmed account privately and never return credentials', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { Readable } = await import('node:stream');
  const { apply } = await import('../lib/index.js');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'heybox-login-test-'));
  const priorHome = process.env.DSH_HOME;
  const priorFetch = global.fetch;
  process.env.DSH_HOME = directory;
  const routes = new Map();
  global.fetch = async (url) => {
    const endpoint = new URL(url).pathname;
    const data = endpoint === '/account/get_qrcode_url/'
      ? { status: 'ok', result: { qr_url: qrUrl, expire: 120 } }
      : { status: 'ok', result: { error: 'ok', profile: { heybox_id: '123' }, pkey: 'host-only-key' } };
    return new Response(JSON.stringify(data), { headers: { 'Set-Cookie': 'extra=host-only-cookie; HttpOnly; Path=/' } });
  };
  async function call(route, body, extra = {}) {
    const request = Readable.from([Buffer.from(JSON.stringify(body))]);
    Object.assign(request, { method: 'POST', headers: { host: 'localhost', origin: 'http://localhost', 'content-type': 'application/json', ...extra } });
    let status, result;
    const response = { setHeader() {}, writeHead(code) { status = code; }, end(value) { result = JSON.parse(value); } };
    await routes.get(route).handler(request, response);
    return { status, result };
  }
  try {
    apply({ webServer: { register(spec) { routes.set(spec.path, spec); } }, effect() {} });
    let watchedResult, watchedCode;
    const watchedResponse = { setHeader() {}, writeHead(code) { watchedCode = code; }, end(value) { watchedResult = JSON.parse(value); } };
    routes.get('/heybox/watched').handler({ method: 'GET', url: '/heybox/watched?offset=0&limit=50' }, watchedResponse);
    assert.equal(watchedCode, 200);
    assert.equal(watchedResult.total, 0);
    routes.get('/heybox/watched').handler({ method: 'GET', url: '/heybox/watched?limit=999' }, watchedResponse);
    assert.equal(watchedCode, 400);
    assert.equal((await call('/heybox/dependencies', { action: 'install' }, { origin: 'https://other.example' })).status, 403);
    assert.equal((await call('/heybox/dependencies', { action: 'install' }, { 'content-type': 'text/plain' })).status, 415);
    assert.equal((await call('/heybox/dependencies', { action: 'arbitrary-command', command: 'must-not-run' })).status, 400);
    const envRequest = Readable.from([]);
    Object.assign(envRequest, { method: 'GET', headers: { host: 'localhost' } });
    let environment;
    await routes.get('/heybox/dependencies').handler(envRequest, { setHeader() {}, writeHead() {}, end(value) { environment = JSON.parse(value); } });
    assert.equal(environment.qrReady, true);
    assert.equal(environment.installing, false);
    assert.equal((await call('/heybox/login', { action: 'start' }, { origin: 'https://other.example' })).status, 403);
    assert.equal((await call('/heybox/login', { action: 'start' }, { 'content-type': 'text/plain' })).status, 415);
    const started = await call('/heybox/login', { action: 'start' });
    assert.equal(started.status, 200);
    assert.ok(started.result.image.startsWith('data:image/png;base64,'));
    const confirmed = await call('/heybox/login', { action: 'poll', sessionId: started.result.sessionId });
    assert.equal(confirmed.result.status, 'authenticated');
    assert.ok(!JSON.stringify(confirmed).includes('host-only'));
    const file = path.join(directory, 'heybox', 'state.json');
    const saved = JSON.parse(fs.readFileSync(file));
    assert.equal(saved.heyboxId, '123');
    assert.ok(saved.cookie.includes('user_pkey=host-only-key'));
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    const publicState = await call('/heybox/state', { action: 'logout' });
    assert.equal(publicState.result.loggedIn, false);
    assert.ok(!JSON.stringify(publicState).includes('host-only'));
  } finally {
    global.fetch = priorFetch;
    if (priorHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = priorHome;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
