#!/usr/bin/env node
// Fills missing example sentences with Claude Code on this Mac.
// Runs every 5 minutes from launchd (only while the Mac is awake) and does real work only
// when the app asked for it or once a day after 12:00. Options: --force, --dry-run.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { BATCH, SCHEMA, buildPrompt, filledRows, latestRows, localDay, missingExamples, parseClaudeOutput, shouldRun } from './lib.mjs';

const DIR = join(homedir(), '.toeic-vocab');
const CONFIG = join(DIR, 'config.json');
const STATE = join(DIR, 'state.json');
const FN = 'https://qosmmsyxmucjrsnugful.supabase.co/functions/v1/sync';
const APIKEY = 'sb_publishable_NVzV9ABgFzi62nfi51NOpA_E2fzAUSv';

const force = process.argv.includes('--force');
const dry = process.argv.includes('--dry-run');
const log = (...a) => console.log(new Date().toISOString(), ...a);

const readJson = (p, d) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : d);
mkdirSync(DIR, { recursive: true });
const config = readJson(CONFIG, null);
if (!config?.key) {
  console.error(`설정이 없어요. mac/install.sh 를 먼저 실행하세요 (${CONFIG}).`);
  process.exit(1);
}
const state = readJson(STATE, {});

async function call(body) {
  const r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: APIKEY }, body: JSON.stringify({ key: config.key, ...body }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `sync ${r.status}`);
  return d;
}

async function pullAll() {
  const rows = [];
  let since = 0;
  for (;;) {
    const d = await call({ action: 'sync', since, rows: [] });
    rows.push(...d.rows);
    since = d.seq;
    if (!d.more) break;
  }
  return latestRows(rows);
}

function runClaude(prompt) {
  const args = ['-p', prompt, '--output-format', 'json', '--json-schema', JSON.stringify(SCHEMA), '--tools', '', '--no-session-persistence'];
  if (config.model) args.push('--model', config.model);
  return new Promise((resolve, reject) => {
    execFile(config.claude || 'claude', args, { cwd: DIR, timeout: 10 * 60_000, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`claude 실행 실패: ${err.message}${stderr ? `\n${stderr}` : ''}`));
      resolve(stdout);
    });
  });
}

const now = Date.now();
const rows = await pullAll();
const examples = rows.find((r) => r.kind === 'settings' && r.id === 'examples')?.data ?? {};
const why = force ? 'force' : shouldRun(state, examples, now);
if (!why) process.exit(0);

const missing = missingExamples(rows);
log(`run (${why}): ${missing.length} words without an example`);

let filled = 0;
let error;
try {
  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    const items = parseClaudeOutput(await runClaude(buildPrompt(batch)));
    const out = filledRows(batch, items, Date.now());
    if (dry) {
      for (const r of out) log(r.data.word, '→', r.data.example, '/', r.data.exampleKo);
    } else if (out.length) {
      await call({ action: 'sync', since: 0x7fffffff, rows: out });
    }
    filled += out.length;
    log(`batch ${i / BATCH + 1}: ${out.length}/${batch.length}`);
  }
} catch (e) {
  error = e instanceof Error ? e.message.slice(0, 300) : String(e);
  log('error', error);
}

if (!dry) {
  const t = Date.now();
  const status = { requestedAt: examples.requestedAt, doneAt: t, filled, ...(error ? { error } : {}) };
  await call({ action: 'sync', since: 0x7fffffff, rows: [{ kind: 'settings', id: 'examples', data: status, updated_at: t }] });
  if (why === 'request' || why === 'force') state.lastRequestHandled = Math.max(examples.requestedAt ?? 0, state.lastRequestHandled ?? 0);
  // any run at or after noon counts as today's daily run
  if (why === 'daily' || localDay(now).hour >= 12) state.lastDailyDate = localDay(now).date;
  writeFileSync(STATE, JSON.stringify(state, null, 2));
}
log(`done: ${filled} filled${error ? ' (with error)' : ''}`);
