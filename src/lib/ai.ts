import { getKv, setKv } from './db';
import type { AiProvider, Settings } from './types';

export interface Sense {
  pos: string;
  meaning: string;
  example: string;
  exampleKo: string;
}
export interface LookupResult {
  word: string;
  senses: Sense[];
  collocations: string[];
  suggestion?: string;
  provider: AiProvider;
}

const SCHEMA = {
  type: 'object',
  properties: {
    senses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          pos: { type: 'string' },
          meaning: { type: 'string' },
          example: { type: 'string' },
          exampleKo: { type: 'string' },
        },
        required: ['pos', 'meaning', 'example', 'exampleKo'],
      },
    },
    collocations: { type: 'array', items: { type: 'string' } },
    suggestion: { type: 'string' },
  },
  required: ['senses', 'collocations'],
};

export function buildPrompt(word: string) {
  return `너는 한국인 수험생을 위한 토익(TOEIC) 단어장 편집자다.
영단어 "${word}"를 정리해라.

규칙:
- senses: 토익 LC/RC에 실제로 자주 나오는 뜻만, 많이 나오는 순서로 1~4개. 토익에 거의 안 나오는 뜻은 넣지 마라.
- pos: n. / v. / adj. / adv. / prep. / conj. / phr. 중 하나.
- meaning: 짧은 한국어 뜻. 비슷한 뜻은 쉼표로 묶어 최대 2개 (예: "상환하다, 변제하다").
- example: 그 뜻으로 쓰인 토익 Part 5/7 스타일 영어 문장 1개. 회사, 사무, 고객, 출장, 행사 같은 비즈니스 상황, 10~20단어. 반드시 "${word}" 또는 그 활용형을 포함.
- exampleKo: example의 자연스러운 한국어 번역.
- collocations: 토익에 자주 나오는 짝꿍 표현 0~3개 (영어만).
- 철자가 틀렸거나 영어 단어가 아니면 senses는 빈 배열로 두고 suggestion에 올바른 철자를 넣어라.
JSON만 출력해라.`;
}

function parse(raw: string, word: string, provider: AiProvider): LookupResult {
  const text = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const j = JSON.parse(text) as Partial<LookupResult>;
  const senses = (Array.isArray(j.senses) ? j.senses : [])
    .filter((s): s is Sense => !!s && typeof s.meaning === 'string' && typeof s.example === 'string')
    .slice(0, 4)
    .map((s) => ({ pos: String(s.pos ?? '').trim(), meaning: s.meaning.trim(), example: s.example.trim(), exampleKo: String(s.exampleKo ?? '').trim() }));
  const collocations = (Array.isArray(j.collocations) ? j.collocations : []).filter((c) => typeof c === 'string').slice(0, 3);
  return { word, senses, collocations, suggestion: j.suggestion || undefined, provider };
}

async function withTimeout<T>(ms: number, f: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await f(ctl.signal);
  } finally {
    clearTimeout(t);
  }
}

async function callGemini(word: string, s: Settings): Promise<LookupResult> {
  if (!s.geminiKey) throw new Error('Gemini API 키가 없습니다. 설정에서 넣어 주세요.');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(s.geminiModel)}:generateContent`;
  const res = await withTimeout(30_000, (signal) =>
    fetch(url, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.geminiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: buildPrompt(word) }] }],
        generationConfig: { temperature: 0.4, responseMimeType: 'application/json', responseSchema: SCHEMA },
      }),
    })
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 429) throw new Error('Gemini 무료 사용량을 넘었습니다. 잠시 뒤 다시 시도해 주세요.');
    if (res.status === 400 || res.status === 403) throw new Error(`Gemini가 요청을 거절했습니다 (${res.status}). API 키와 모델 이름을 확인해 주세요.`);
    throw new Error(`Gemini 오류 ${res.status}: ${body.slice(0, 120)}`);
  }
  const j = await res.json();
  const text = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
  if (!text) throw new Error('Gemini가 빈 응답을 보냈습니다.');
  return parse(text, word, 'gemini');
}

async function callOllama(word: string, s: Settings): Promise<LookupResult> {
  if (!s.ollamaModel) throw new Error('로컬 모델 이름이 비어 있습니다. 설정에서 넣어 주세요.');
  const base = s.ollamaUrl.replace(/\/+$/, '');
  let res: Response;
  try {
    res = await withTimeout(120_000, (signal) =>
      fetch(`${base}/api/chat`, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: s.ollamaModel,
          stream: false,
          think: false,
          format: SCHEMA,
          options: { temperature: 0.3 },
          messages: [{ role: 'user', content: buildPrompt(word) }],
        }),
      })
    );
  } catch {
    throw new Error('Mac의 로컬 모델에 연결하지 못했습니다. Ollama가 켜져 있는지, OLLAMA_ORIGINS 설정을 했는지 확인해 주세요.');
  }
  if (!res.ok) throw new Error(`로컬 모델 오류 ${res.status}. 모델 이름(${s.ollamaModel})을 확인해 주세요.`);
  const j = await res.json();
  return parse(j?.message?.content ?? '', word, 'ollama');
}

export function providersToTry(s: Settings): AiProvider[] {
  return s.aiOrder.filter((p) => (p === 'gemini' ? !!s.geminiKey : !!s.ollamaModel));
}

/** Tries each configured provider in order; caches the first good answer per word. */
export async function lookupWord(rawWord: string, s: Settings, opts: { fresh?: boolean } = {}): Promise<LookupResult> {
  const word = rawWord.trim();
  const key = `ai:${word.toLowerCase()}`;
  if (!opts.fresh) {
    const hit = await getKv<LookupResult>(key);
    if (hit) return hit;
  }
  const order = providersToTry(s);
  if (!order.length) throw new Error('자동 채우기를 쓰려면 설정에서 Gemini API 키나 로컬 모델 이름을 넣어 주세요.');
  const errors: string[] = [];
  for (const p of order) {
    try {
      const r = p === 'gemini' ? await callGemini(word, s) : await callOllama(word, s);
      if (r.senses.length) await setKv(key, r);
      return r;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  throw new Error(errors.join('\n'));
}
