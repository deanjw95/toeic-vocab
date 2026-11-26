// Pure helpers for the Mac example agent (tested in tests/mac-agent.test.ts).

export const BATCH = 25;

export const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, example: { type: 'string' }, exampleKo: { type: 'string' } },
        required: ['id', 'example', 'exampleKo'],
      },
    },
  },
  required: ['items'],
};

/** Local calendar date and hour on this Mac (the user lives in KST). */
export function localDay(now) {
  const d = new Date(now);
  const pad = (n) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, hour: d.getHours() };
}

/**
 * Whether this tick should generate: an app request newer than the last handled one,
 * or the daily run (first tick at or after 12:00 that the Mac is awake for).
 */
export function shouldRun(state, examples, now, dailyHour = 12) {
  const req = examples?.requestedAt ?? 0;
  if (req > (state.lastRequestHandled ?? 0)) return 'request';
  const { date, hour } = localDay(now);
  if (hour >= dailyHour && state.lastDailyDate !== date) return 'daily';
  return null;
}

/** Live entries whose example is empty, in the order they were added. */
export function missingExamples(rows) {
  return rows
    .filter((r) => r.kind === 'entry' && r.data && !String(r.data.example ?? '').trim())
    .map((r) => r.data)
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
}

/** Latest value of every row after a full pull (later seq wins). */
export function latestRows(rows) {
  const m = new Map();
  for (const r of rows) m.set(`${r.kind}|${r.id}`, r);
  return [...m.values()];
}

export function buildPrompt(batch) {
  const items = batch.map((e) => ({ id: e.id, word: e.word, pos: e.pos || undefined, meaning: e.meaning }));
  return [
    'You write example sentences for a Korean learner preparing for the TOEIC.',
    'For each item, write ONE natural English sentence in TOEIC style (Part 5/7: offices, hiring, sales, shipping, finance, events, customer service).',
    'Rules:',
    '- Use the word exactly in the meaning the learner wrote (Korean "meaning"). If several meanings are listed (comma-separated), use the first one. Ignore senses the learner did not write.',
    '- Use the word itself or an inflected form (plural, past tense, -ing). 10 to 22 words. Plain, realistic business English.',
    '- exampleKo: a natural Korean translation of your sentence.',
    '- Return every id exactly once. Output only the JSON object.',
    '',
    'Items:',
    JSON.stringify(items, null, 1),
  ].join('\n');
}

/** Reads `claude -p --output-format json` output, with or without --json-schema support. */
export function parseClaudeOutput(stdout) {
  const outer = JSON.parse(stdout);
  if (outer.is_error) throw new Error(String(outer.result || 'claude error'));
  let body = outer.structured_output;
  if (!body) {
    const text = String(outer.result ?? '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    body = JSON.parse(text);
  }
  if (!Array.isArray(body?.items)) throw new Error('claude did not return items');
  return body.items;
}

/** Sync rows for the filled entries; anything malformed or unknown is dropped. */
export function filledRows(batch, items, now) {
  const byId = new Map(batch.map((e) => [e.id, e]));
  const out = [];
  for (const it of items) {
    const e = byId.get(it.id);
    const example = String(it.example ?? '').trim();
    const exampleKo = String(it.exampleKo ?? '').trim();
    if (!e || !example || !exampleKo) continue;
    byId.delete(it.id);
    out.push({ kind: 'entry', id: e.id, data: { ...e, example, exampleKo, updatedAt: now }, updated_at: now });
  }
  return out;
}
