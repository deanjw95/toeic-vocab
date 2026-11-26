import { describe, expect, it } from 'vitest';
import { pickRecordings, voiceScore } from '../src/lib/audio';

describe('pronunciation', () => {
  it('maps dictionary recordings by accent', () => {
    const data = [{ phonetics: [
      { audio: '' },
      { audio: 'https://api.dictionaryapi.dev/media/pronunciations/en/schedule-uk.mp3' },
      { audio: 'https://api.dictionaryapi.dev/media/pronunciations/en/schedule-us.mp3' },
      { audio: '//upload.wikimedia.org/x/En-au-schedule.ogg' },
    ] }];
    const r = pickRecordings(data);
    expect(r.us).toMatch(/-us\.mp3$/);
    expect(r.uk).toMatch(/-uk\.mp3$/);
    expect(r.other).toBe('https://upload.wikimedia.org/x/En-au-schedule.ogg');
    expect(pickRecordings({ title: 'No Definitions Found' })).toEqual({});
  });
  it('prefers premium and Google voices in the chosen accent', () => {
    const vs = [
      { name: 'Fred', lang: 'en-US' },
      { name: 'Google US English', lang: 'en-US' },
      { name: 'Ava (Premium)', lang: 'en-US' },
      { name: 'Daniel', lang: 'en-GB' },
      { name: 'Yuna', lang: 'ko-KR' },
    ];
    const best = (lang: string) => [...vs].sort((a, b) => voiceScore(b, lang) - voiceScore(a, lang))[0].name;
    expect(best('en-US')).toBe('Ava (Premium)');
    expect(best('en-GB')).toBe('Daniel');
  });
});

describe('neural clip path', () => {
  it('matches the server naming and ignores spacing', async () => {
    const { clipPath } = await import('../src/lib/audio');
    const a = await clipPath('uk', '  The  agenda was sent. ');
    expect(a).toMatch(/^uk\/[0-9a-f]{40}\.mp3$/);
    expect(await clipPath('uk', 'The agenda was sent.')).toBe(a);
  });
});
