import { parsePattern } from "./parser";
import { MIN_BPM, MAX_BPM } from "./audioEngine";
import { SPEC, adjustMessage, fixMessage } from "../../worker/prompt";

/**
 * Client side of the IA tab. The model streams tokens over SSE; these
 * helpers turn that raw text into something playable (and keep chatty
 * models honest by dropping every line the parser doesn't accept).
 */

/** A lane that parses but never makes a sound is noise, not music. */
function isAllRests(line: string): boolean {
  const body = line.split("|")[0].replace(/--.*$/, "");
  const tokens = body.split(/[\s[\]<>]+/).filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => token.startsWith("~"));
}

const parsesClean = (line: string) => {
  const { lanes, warnings } = parsePattern(line);
  return lanes.length > 0 && warnings.length === 0;
};

/**
 * Models label their lines the way the spec's recipes once did — "bajo
 * sincopado 0 ~ [~ 0] …", "pianito ~ <7 9> …", "hats hh hh hh hh" — and
 * the label words parse as unknown sounds. Peel up to three leading words
 * off the pattern part until what's left parses clean; the label survives
 * as the line's comment. Returns null when nothing playable remains.
 */
export function repairLine(line: string): string | null {
  if (parsesClean(line)) return line;
  const pipe = line.indexOf("|");
  const body = pipe >= 0 ? line.slice(0, pipe) : line;
  const rest = pipe >= 0 ? line.slice(pipe) : "";
  const words = body.trim().split(/\s+/);
  for (let drop = 1; drop <= Math.min(3, words.length - 1); drop++) {
    const candidate = `${words.slice(drop).join(" ")} ${rest}`.trim();
    if (parsesClean(candidate)) {
      const label = words.slice(0, drop).join(" ");
      return candidate.includes("--") ? candidate : `${candidate} -- ${label}`;
    }
  }
  return null;
}

/** Strip markdown fences, prose and silent lanes: keep what the parser
 *  accepts AND actually sounds. */
export function sanitizeIaCode(raw: string): string {
  let text = raw;
  const fence = raw.match(/```(?:\w*\n)?([\s\S]*?)(?:```|$)/);
  if (fence) text = fence[1];
  const lines = text.split("\n").map((line) => line.trimEnd());
  const kept: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    // "bpm 124" without the dashes is the tempo line, not a pattern
    const tempo = trimmed.match(/^bpm\s*:?\s*(\d{2,3})\s*$/i);
    if (tempo) {
      kept.push(`-- bpm ${tempo[1]}`);
      continue;
    }
    if (trimmed === "" || trimmed.startsWith("--")) {
      kept.push(line);
      continue;
    }
    if (isAllRests(trimmed)) continue;
    const repaired = repairLine(line);
    if (repaired !== null) kept.push(repaired);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** While streaming, the last line may be half-written — play all but it. */
export function playableSlice(streamed: string): string {
  const lines = streamed.split("\n");
  lines.pop();
  return sanitizeIaCode(lines.join("\n"));
}

/** The model announces tempo as a comment: `-- bpm 128`. */
export function extractBpm(code: string): number | undefined {
  const match = code.match(/--\s*bpm\s+(\d{2,3})/i);
  if (!match) return undefined;
  return Math.min(MAX_BPM, Math.max(MIN_BPM, parseInt(match[1], 10)));
}

// ------------------------------------------------------------------- diff

export interface PatternDiff {
  added: string[];
  changed: string[];
  removed: string[];
}

/** What did the adjust touch? Lines keyed by their pattern part (before
 *  the first |): same key + different fx = retouched; new key = added. */
export function diffPatterns(before: string, after: string): PatternDiff {
  const clean = (codeText: string) =>
    codeText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("--"));
  const key = (line: string) => line.split("|")[0].trim();
  const oldLines = clean(before);
  const newLines = clean(after);
  const oldExact = new Set(oldLines);
  const newExact = new Set(newLines);
  const oldKeys = new Set(oldLines.map(key));
  const newKeys = new Set(newLines.map(key));

  const added: string[] = [];
  const changed: string[] = [];
  for (const line of newLines) {
    if (oldExact.has(line)) continue;
    if (oldKeys.has(key(line))) changed.push(line);
    else added.push(line);
  }
  const removed = oldLines.filter((line) => !newExact.has(line) && !newKeys.has(key(line)));
  return { added, changed, removed };
}

// ------------------------------------------------------------- daily quota
// Client-side courtesy limit so one enthusiast doesn't drain the free
// Workers AI allocation for everyone before noon.

export const IA_DAILY_LIMIT = 10;
// .v2: the key rotated after the 2026-07-31 outage drained everyone's
// counter — rotating it grants amnesty to every affected browser
const QUOTA_KEY = "bakaluti.ia.v2";

/** Local calendar day — the booth reopens at the visitor's midnight, not UTC's. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function iaUsesLeft(): number {
  if (import.meta.env.DEV) return IA_DAILY_LIMIT; // local model: on the house
  if (typeof localStorage === "undefined") return IA_DAILY_LIMIT;
  const raw = localStorage.getItem(QUOTA_KEY);
  if (!raw) return IA_DAILY_LIMIT;
  const [day, count] = raw.split(":");
  if (day !== today()) return IA_DAILY_LIMIT;
  return Math.max(0, IA_DAILY_LIMIT - (parseInt(count, 10) || 0));
}

export function iaConsumeUse(): void {
  if (typeof localStorage === "undefined") return;
  const used = IA_DAILY_LIMIT - iaUsesLeft();
  localStorage.setItem(QUOTA_KEY, `${today()}:${used + 1}`);
}

/** Server failures must not eat the visitor's daily wallet. */
export function iaRefundUses(count: number): void {
  if (typeof localStorage === "undefined" || count <= 0) return;
  const used = IA_DAILY_LIMIT - iaUsesLeft();
  localStorage.setItem(QUOTA_KEY, `${today()}:${Math.max(0, used - count)}`);
}

// ---------------------------------------------------------------- streaming

export interface FixPayload {
  code: string;
  warnings: string[];
}

// In dev there is no worker: the tab talks to a local LM Studio server
// (OpenAI-compatible API on port 1234) through vite's /llm proxy, so no
// CORS setup is needed and any loaded model works.
const LOCAL_LLM = "/llm/v1";
let localModel: string | null = null;

async function localModelId(signal?: AbortSignal): Promise<string> {
  if (localModel) return localModel;
  const res = await fetch(`${LOCAL_LLM}/models`, { signal });
  const data = (await res.json()) as { data: { id: string }[] };
  const model = data.data.find((m) => !m.id.includes("embed"))?.id;
  if (!model) throw new Error("error");
  localModel = model;
  return model;
}

function localRequest(prompt: string, code?: string, fix?: FixPayload, model = "local") {
  const messages = [
    { role: "system", content: SPEC },
    { role: "user", content: code ? adjustMessage(code, prompt) : prompt },
  ];
  if (fix) {
    messages.push({ role: "assistant", content: fix.code });
    messages.push({ role: "user", content: fixMessage(fix.code, fix.warnings) });
  }
  return { model, messages, stream: true, max_tokens: 320, temperature: 0.8 };
}

/**
 * One SSE payload → its text delta, or null when it carries none.
 * Workers AI shape ({response}) or OpenAI shape (choices[].delta).
 *
 * Workers AI serialises a token that happens to be a bare digit as a JSON
 * NUMBER (`"response":0`, not `"0"`), so a string-only check silently drops
 * every number the model writes — bpm, kit 909, gain 0.9, scale degrees —
 * and the pattern arrives as `-- bpm` / `kit  | drive .`. Numbers are text.
 */
export function sseDelta(payload: string): string | null {
  try {
    const parsed = JSON.parse(payload) as {
      response?: unknown;
      choices?: { delta?: { content?: unknown } }[];
    };
    const delta = parsed.response ?? parsed.choices?.[0]?.delta?.content;
    if (typeof delta === "string") return delta;
    if (typeof delta === "number") return String(delta);
    return null;
  } catch {
    // partial JSON in a torn chunk — ignored, the buffer catches up
    return null;
  }
}

/**
 * POST to the worker (production) or a local LM Studio (dev) and hand each
 * accumulated text snapshot to `onText`. Throws "cerrado" when the free
 * daily allocation ran out (503).
 */
export async function streamGeneration(
  prompt: string,
  onText: (accumulated: string) => void,
  options: { code?: string; fix?: FixPayload; signal?: AbortSignal } = {}
): Promise<string> {
  const res = import.meta.env.DEV
    ? await fetch(`${LOCAL_LLM}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          localRequest(prompt, options.code, options.fix, await localModelId(options.signal))
        ),
        signal: options.signal,
      })
    : await fetch("/api/generar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, code: options.code, fix: options.fix }),
        signal: options.signal,
      });
  if (res.status === 503) {
    // the worker says WHY it closed (quota, deprecated model, missing
    // binding…) — surface it in the console so an outage is diagnosable
    const detail = await res.text().catch(() => "");
    console.warn("residente: 503", detail);
    throw new Error("cerrado");
  }
  if (!res.ok || !res.body) throw new Error("error");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      for (const line of event.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") continue;
        const delta = sseDelta(payload);
        if (delta !== null) {
          text += delta;
          onText(text);
        }
      }
    }
  }
  return text;
}
