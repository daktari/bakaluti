/**
 * From a radio track's arrangement states to a timeline of sections for a
 * standalone recording: intro, body, the full picture, a thinner outro.
 * Pure, so the plan is testable without an audio context.
 */

export interface Section {
  code: string;
  bars: number;
}

/** Round to whole 4-bar phrases, never below one phrase. */
const phrases = (bars: number) => Math.max(4, Math.round(bars / 4) * 4);

export function arrangementPlan(states: string[], seconds: number, bpm: number): Section[] {
  const barSeconds = (60 / bpm) * 4;
  const total = phrases(seconds / barSeconds);
  const n = states.length;
  if (n <= 1) return [{ code: states[0] ?? "", bars: total }];

  const intro = phrases(total * (n === 2 ? 0.2 : 0.12));
  const outro = phrases(total * 0.12);
  const middle = states.slice(1, n - 1);
  const middleEach = middle.length ? phrases((total * 0.28) / middle.length) : 0;
  const full = Math.max(4, total - intro - outro - middleEach * middle.length);

  return [
    { code: states[0], bars: intro },
    ...middle.map((code) => ({ code, bars: middleEach })),
    { code: states[n - 1], bars: full },
    // the outro drops the decorations: back to the state before the full one
    { code: states[Math.max(0, n - 2)], bars: outro },
  ];
}

/** Total seconds a plan lasts at a tempo (without the final tail). */
export function planSeconds(plan: Section[], bpm: number): number {
  const barSeconds = (60 / bpm) * 4;
  return plan.reduce((sum, s) => sum + s.bars, 0) * barSeconds;
}
