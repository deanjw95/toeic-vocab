// Pure helpers for the Mac example agent (tested in tests/mac-agent.test.ts).

export const BATCH = 25;
export const POS = ['n.', 'v.', 'adj.', 'adv.', 'prep.', 'conj.', 'phr.'];

/** What the last check looked at; a changed word or meaning is checked again. */
export const checkKey = (e) => `${String(e.word ?? '').trim()}|${String(e.meaning ?? '').trim()}`;

export const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          example: { type: 'string' },
          exampleKo: { type: 'string' },
          pos: { type: 'string', enum: POS },
          wordFix: { type: 'string' },
          meaningFix: { type: 'string' },
        },
        required: ['id', 'example', 'exampleKo', 'pos', 'wordFix', 'meaningFix'],
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

/**
 * Live entries that need work, in the order they were added: no example, no part of speech,
 * or a word/meaning that hasn't been spell-checked in its current form.
 */
export function entriesToProcess(rows) {
  return rows
    .filter((r) => r.kind === 'entry' && r.data)
    .map((r) => r.data)
    .filter((e) => !String(e.example ?? '').trim() || !e.pos || e.checkedFor !== checkKey(e))
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
}
/** Kept for older callers: entries with no example. */
export const missingExamples = (rows) => entriesToProcess(rows).filter((e) => !String(e.example ?? '').trim());

/** Latest value of every row after a full pull (later seq wins). */
export function latestRows(rows) {
  const m = new Map();
  for (const r of rows) m.set(`${r.kind}|${r.id}`, r);
  return [...m.values()];
}

export function buildPrompt(batch) {
  const items = batch.map((e) => ({
    id: e.id, word: e.word, meaning: e.meaning, pos: e.pos || undefined,
    example: String(e.example ?? '').trim() || undefined,
  }));
  return [
    'You help a Korean learner preparing for the TOEIC. The learner typed each English word and its Korean meaning by hand.',
    'For each item return:',
    `- pos: the part of speech of the word in the learner's meaning, one of ${POS.join(' ')} (phr. for multi-word phrases and idioms). If several meanings are listed, use the first.`,
    '- wordFix: if "word" is misspelled (not a real English word or phrase, e.g. "recieve", "acomodate"), the correct spelling; otherwise "". Do not change correct words, British spellings, plurals or other forms the learner chose.',
    '- meaningFix: if the Korean "meaning" has a typo or spelling mistake (맞춤법, e.g. "수수로" for "수수료", "몇일"), the corrected Korean with the same sense and the same comma-separated parts; otherwise "". Never add, remove or reword meanings, and do not judge whether the meaning is the best translation.',
    '- example: if the item already has an example, return it unchanged. Otherwise write ONE natural English sentence in TOEIC style (Part 5/7: offices, hiring, sales, shipping, finance, events, customer service), using the (corrected) word in the learner\'s first meaning, 10 to 22 words.',
    '- exampleKo: a natural Korean translation of the example.',
    'Return every id exactly once. Output only the JSON object.',
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

/**
 * Sync rows for the processed entries; anything malformed or unknown is dropped.
 * Fills a missing example and part of speech. Spelling suggestions are stored as `check`
 * for the learner to accept or dismiss in the app; nothing the learner wrote is overwritten.
 */
export function filledRows(batch, items, now) {
  const byId = new Map(batch.map((e) => [e.id, e]));
  const out = [];
  for (const it of items) {
    const e = byId.get(it.id);
    if (!e) continue;
    const hadExample = !!String(e.example ?? '').trim();
    const example = hadExample ? e.example : String(it.example ?? '').trim();
    const exampleKo = hadExample ? e.exampleKo : String(it.exampleKo ?? '').trim();
    if (!hadExample && (!example || !exampleKo)) continue;
    byId.delete(it.id);
    const pos = e.pos || (POS.includes(it.pos) ? it.pos : '');
    const wordFix = String(it.wordFix ?? '').trim();
    const meaningFix = String(it.meaningFix ?? '').trim();
    const check = {};
    if (wordFix && wordFix.toLowerCase() !== String(e.word).trim().toLowerCase()) check.word = wordFix;
    if (meaningFix && meaningFix !== String(e.meaning).trim()) check.meaning = meaningFix;
    const data = { ...e, example, exampleKo, pos, checkedFor: checkKey(e), updatedAt: now };
    if (Object.keys(check).length) data.check = check;
    else delete data.check;
    out.push({ kind: 'entry', id: e.id, data, updated_at: now });
  }
  return out;
}
