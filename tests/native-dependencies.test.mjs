import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import sharp from 'sharp';
import vm from 'node:vm';
import { transform, transformSync } from '@esbuild-kit/core-utils';

const root = path.resolve(import.meta.dirname, '..');
const run = (source, args = []) => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source, ...args], {
    cwd: root, encoding: 'utf8', timeout: 15_000,
  });
  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.signal, null, result.stderr);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};

test('native SQLite transactions persist across explicit close and natural process exit', { timeout: 30_000 }, t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'native-sqlite-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const file = path.join(temp, 'native.db');
  run(`import Database from 'better-sqlite3';
    const db = new Database(process.argv[1]);
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE records(id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
    const insert = db.prepare('INSERT INTO records(value) VALUES (?)');
    db.transaction(() => { for (let i=0;i<100;i++) insert.run('医疗记录 '+i); })();
    try { db.transaction(() => { insert.run('rollback'); throw Error('rollback'); })(); } catch {}
    db.pragma('wal_checkpoint(TRUNCATE)'); db.close();`, [file]);
  const output = run(`import Database from 'better-sqlite3';
    const db = new Database(process.argv[1]);
    console.log(JSON.stringify({count:db.prepare('SELECT count(*) AS n FROM records').get().n,
      value:db.prepare('SELECT value FROM records WHERE id=100').get().value,
      integrity:db.pragma('integrity_check',{simple:true})}));
    db.close();`, [file]);
  assert.deepEqual(JSON.parse(output), { count: 100, value: '医疗记录 99', integrity: 'ok' });
});

test('built API restarts with persisted SQLite and decodable resized/private image files', { timeout: 45_000 }, async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'native-api-'));
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const base = `http://127.0.0.1:${port}/api`;
  const env = { ...process.env, PORT: String(port), DATABASE_URL: path.join(temp, 'api.db'),
    STORAGE_DIR: path.join(temp, 'files'), TMPDIR: temp, SESSION_SECRET: 'native-regression-only-stable-secret-32chars', API_KEY_ENCRYPTION_KEY: randomBytes(32).toString('hex'), TRUSTED_PROXY_IPS: '' };
  let child, exited, logs = '';
  const stop = async () => {
    if (!child) return;
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    const timer = setTimeout(() => child?.kill('SIGKILL'), 5000);
    let code, signal;
    try { [code, signal] = await exited; } finally { clearTimeout(timer); child = undefined; }
    assert.equal(code, null, logs);
    assert.equal(signal, 'SIGTERM', logs); // SIGSEGV and premature exits must fail.
  };
  t.after(async () => { try { await stop(); } finally { fs.rmSync(temp, { recursive: true, force: true }); } });
  const start = async () => {
    child = spawn(process.execPath, ['apps/api/dist/server.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    exited = once(child, 'exit');
    child.stdout.on('data', b => logs += b); child.stderr.on('data', b => logs += b);
    for (let i = 0; i < 150; i++) {
      assert.equal(child.exitCode, null, logs); assert.equal(child.signalCode, null, logs);
      try { if ((await fetch(base + '/health', { signal: AbortSignal.timeout(500) })).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.fail('API startup timed out: ' + logs);
  };
  await start();
  const request = (route, key, body) => fetch(base + route, {
    method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(5000),
    headers: { ...(key ? { Authorization: 'Bearer ' + key } : {}),
      ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? body instanceof FormData ? body : JSON.stringify(body) : undefined,
  });
  const registered = await request('/auth/register', null, { email: 'native@example.test', password: 'test-password' });
  assert.equal(registered.status, 201); const { apiKey } = await registered.json();
  const png = await sharp({ create: { width: 3000, height: 1500, channels: 3, background: '#f97316' } }).png().toBuffer();
  const upload = async route => {
    const form = new FormData(); form.append('file', new Blob([png], { type: 'image/png' }), '医疗图片.png');
    form.append('purpose', 'reference');
    const response = await request(route, apiKey, form); assert.equal(response.status, 201, await response.clone().text());
    return response.json();
  };
  const resized = await upload('/media'), original = await upload('/files');
  const fixtureDb = new DatabaseSync(env.DATABASE_URL);fixtureDb.prepare('INSERT INTO categories(id,name,slug) VALUES(?,?,?)').run('fixture-category','业务分类','fixture-category');fixtureDb.close();
  const reqResponse = await request('/requirements', apiKey, { categoryId: 'fixture-category', title: '原生依赖回归', content: '# 医疗业务\n\n重启后必须保留。', fileIds: [original.id] });
  assert.equal(reqResponse.status, 201); const req = await reqResponse.json();
  await stop(); await start();
  const detail = await request('/requirements/' + req.id, apiKey);
  assert.equal(detail.status, 200); const data = await detail.json();
  assert.equal(data.content, '# 医疗业务\n\n重启后必须保留。'); assert.equal(data.files[0].id, original.id);
  for (const [file, format, width, height] of [[resized, 'webp', 2400, 1200], [original, 'png', 3000, 1500]]) {
    const route = file.url.replace('/api', '');
    assert.equal((await request(route)).status, 401);
    const response = await request(route, apiKey); assert.equal(response.status, 200);
    const bytes = Buffer.from(await response.arrayBuffer()); const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.format, format); assert.equal(metadata.width, width); assert.equal(metadata.height, height);
    const decoded = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
    assert.equal(decoded.info.width, width); assert.ok(decoded.data.length >= width * height * 3);
  }
  await stop();
});

test('Drizzle CLI generates actual schema and migrates an isolated database twice', { timeout: 45_000 }, t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'native-drizzle-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const config = path.join(temp, 'drizzle.config.ts'), file = path.join(temp, 'cli.db');
  fs.writeFileSync(config, 'const config: Record<string, unknown> = ' + JSON.stringify({ schema: path.join(root, 'apps/api/src/schema.ts'),
    out: path.join(temp, 'migrations'), dialect: 'sqlite', dbCredentials: { url: file } }) + '; export default config;');
  for (const command of ['generate', 'migrate', 'migrate']) {
    const result = spawnSync(process.execPath, ['node_modules/drizzle-kit/bin.cjs', command, '--config', config], {
      cwd: root, encoding: 'utf8', timeout: 15_000,
    });
    assert.equal(result.error, undefined, String(result.error));
    assert.equal(result.signal, null, result.stderr);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
  const output = run(`import Database from 'better-sqlite3'; const db = new Database(process.argv[1]);
    console.log(JSON.stringify({table:db.prepare("SELECT name FROM sqlite_master WHERE name='requirement_files'").get().name,
      migrations:db.prepare('SELECT count(*) AS n FROM __drizzle_migrations').get().n})); db.close();`, [file]);
  assert.deepEqual(JSON.parse(output), { table: 'requirement_files', migrations: 1 });
});

// Drizzle Kit still includes this deprecated loader; exercise both APIs affected by the scoped override.
test('legacy TypeScript loader stays compatible with patched esbuild', async () => {
  const source = 'export const value: number = 24;';
  for (const result of [transformSync(source, '/tmp/dependency-sync.ts', { format: 'cjs' }), await transform(source, '/tmp/dependency-async.ts', { format: 'cjs' })]) {
    const context = { module: { exports: {} } };
    vm.runInNewContext(result.code, context, { timeout: 1000 });
    assert.equal(context.module.exports.value, 24);
    assert.ok(result.map.sources[0].endsWith('.ts'));
  }
});
