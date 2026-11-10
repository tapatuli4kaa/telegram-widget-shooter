// Telegram bot (Bot API 10.4 widgets): sends a raycaster shooter widget.
// No dependencies: Node 18+.  Config: .env next to this file (see .env.example) or environment variables.
//   node bot.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const env = { ...readEnv(path.join(ROOT, '.env')), ...process.env };
const TOKEN = env.BOT_TOKEN || die('BOT_TOKEN is not set (put it in .env)');
const BASE = (env.BOT_API || 'https://api.telegram.org').replace(/\/+$/, '');
const URL_ = env.BOT_TEST_ENV === '1' ? `${BASE}/bot${TOKEN}/test` : `${BASE}/bot${TOKEN}`;

function readEnv(f) {
  const o = {};
  if (fs.existsSync(f)) for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(l);
    if (m && !l.trim().startsWith('#')) o[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return o;
}
function die(msg) { console.error(msg); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, params = {}) {
  for (;;) {
    let body;
    try {
      const res = await fetch(`${URL_}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(params) });
      body = await res.json();
    } catch (e) { throw new Error(`${method}: ${String(e.message).split(TOKEN).join('<token>')}`); }
    if (body.ok) return body.result;
    const wait = body.parameters?.retry_after;
    if (wait) { console.log(`  flood wait ${wait}s on ${method}`); await sleep(wait * 1000 + 200); continue; }
    throw new Error(`${method}: ${body.description}`);
  }
}

// ---- widgets

const shooterHtml = () => fs.readFileSync(path.join(ROOT, 'shooter', 'widget.html'), 'utf8');

function checkSize(name, html) {
  const z = zlib.deflateSync(Buffer.from(html), { level: 9 }).length;
  const raw = Buffer.byteLength(html);
  console.log(`${name}: ${raw} B html, ~${z} B compressed (limits 32768 / 4096)`);
  if (raw > 32768 || z > 4096) console.warn(`  ${name} is over the limit, the server will refuse it`);
}

async function onMessage(m) {
  const chat_id = m.chat.id;
  const c = String(m.text ?? '').split(/\s+/)[0].split('@')[0];
  if (c === '/shooter') {
    await api('sendWidget', { chat_id, html: shooterHtml(), width: 0, height: 0 });
  } else if (c === '/start' || c === '/help') {
    await api('sendMessage', { chat_id, text: '/shooter — a tiny raycaster shooter' });
  }
}

// ---- main

checkSize('shooter', shooterHtml());
const me = await api('getMe');
await api('setMyCommands', { commands: [{ command: 'shooter', description: 'Tiny raycaster shooter' }] });
console.log(`@${me.username} is running (Ctrl+C to stop)`);
let offset = 0;
for (;;) {
  let updates = [];
  try { updates = await api('getUpdates', { offset, timeout: 30, allowed_updates: ['message'] }); }
  catch (e) { console.error(e.message); await sleep(3000); continue; }
  for (const u of updates) {
    offset = u.update_id + 1;
    if (u.message) onMessage(u.message).catch((e) => console.error(e.message));
  }
}
