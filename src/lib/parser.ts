import { KITS, kitSampleId, SOUND_ALIASES, SOUND_IDS } from "./sounds";
import { t } from "./i18n";

/**
 * Mini-notation AST. Each top-level node of a lane occupies one step;
 * groups subdivide their step, alternation picks a child per loop,
 * probability plays its child ~half the time. `loc` is the token's
 * character range in the source code, used for the editor hit-flash.
 */
export type Loc = [from: number, to: number];

/** Performance marks on a sounding token: `bd^` / `0^` = accent (louder,
 *  and on the acid a wider filter bite); `hold` = how many `_` ties follow
 *  (the sound lasts that many extra steps); `slide` = the note the acid
 *  glides into when a held note runs straight into the next one (303). */
export interface Marks {
  accent?: boolean;
  hold?: number;
  slide?: { kind: "note"; midi: number } | { kind: "degree"; n: number };
}

export type Node =
  | { kind: "rest" }
  | ({ kind: "hit"; id: string; variant: number; loc?: Loc } & Marks)
  | ({ kind: "note"; midi: number; label: string; loc?: Loc } & Marks)
  | ({ kind: "degree"; n: number; label: string; loc?: Loc } & Marks)
  | { kind: "group"; children: Node[] }
  | { kind: "alt"; choices: Node[] }
  | { kind: "prob"; child: Node; p: number };

export type SynthName = "piano" | "bass" | "pad" | "acid" | "sub" | "reese";

export const SYNTH_NAMES: SynthName[] = ["piano", "bass", "pad", "acid", "sub", "reese"];

/** Scale intervals in semitones from the root (c4). Strudel names accepted.
 *  The three modes are the radio's colours: dórica = minor with a bright
 *  sixth (dub, deep house), frigia = minor with a flat second (the dark,
 *  industrial clash), lidia = major with a raised fourth (floating,
 *  unresolved — ambient's favourite). */
export const SCALES: Record<string, number[]> = {
  mayor: [0, 2, 4, 5, 7, 9, 11],
  menor: [0, 2, 3, 5, 7, 8, 10],
  penta: [0, 2, 4, 7, 9],
  dorica: [0, 2, 3, 5, 7, 9, 10],
  frigia: [0, 1, 3, 5, 7, 8, 10],
  lidia: [0, 2, 4, 6, 7, 9, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};

const SEMITONES: Record<string, number> = {
  c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11,
};

/** Scale degree → MIDI note, rooted at c4 (60). Degree 7 = next octave. */
export function degreeToMidi(n: number, scale: number[]): number {
  const len = scale.length;
  const octave = Math.floor(n / len);
  const index = ((n % len) + len) % len;
  return 60 + octave * 12 + scale[index];
}

export interface LaneFx {
  gain: number;
  pan: number;
  lpf: number | null;
  /** resonance of the lane's lpf (0..1) */
  res: number;
  hpf: number | null;
  delay: number;
  reverb: number;
  /** reverb size: 0 = small room … 1 = cathedral (default 0.35) */
  size: number;
  /** 0..1 waveshaper distortion */
  drive: number;
  /** sidechain: how deep this lane dips on every kick of the pattern (0..1) */
  duck: number;
  /** kick extras: sine sub layer and reverberated low rumble tail (0..1) */
  sub: number;
  rumble: number;
  /** samples: retune in semitones, and cut their tail after N seconds */
  pitch: number;
  cut: number | null;
  /** synth voice: filter cutoff Hz, envelope depth 0..1 and decay seconds */
  cutoff: number | null;
  env: number | null;
  decay: number | null;
}

export const DEFAULT_FX: LaneFx = {
  gain: 1,
  pan: 0,
  lpf: null,
  res: 0,
  hpf: null,
  delay: 0,
  reverb: 0,
  size: 0.35,
  drive: 0,
  duck: 0,
  sub: 0,
  rumble: 0,
  pitch: 0,
  cut: null,
  cutoff: null,
  env: null,
  decay: null,
};

export interface LaneDef {
  steps: Node[];
  /** Playback speed: 2 = double (fast 2), 0.5 = half (slow 2). */
  speed: number;
  /** When set, every Nth loop plays `everySteps` instead of `steps`. */
  everyN: number | null;
  everySteps: Node[] | null;
  fx: LaneFx;
  /** Instrument for note/degree tokens in this lane. */
  synth: SynthName;
  /** Scale intervals for degree tokens (default: mayor). */
  scale: number[];
  /** Drum machine kit ("808", "909", "linn") or null for default sounds. */
  kit: string | null;
  /** 0..1 — delays every second step for groove. */
  swing: number;
}

export interface ParseResult {
  lanes: LaneDef[];
  /** Human-friendly warnings; playback still works. */
  warnings: string[];
}

const REST: Node = { kind: "rest" };

// ---------------------------------------------------------------- tokenizer

interface Tok {
  type: "[" | "]" | "<" | ">" | "word";
  text: string;
  /** true when there was no whitespace before this token (e.g. "]*2") */
  glued: boolean;
  /** character offsets within the line */
  from: number;
  to: number;
}

const BRACKETS = "[]<>";

function tokenize(line: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  let glued = false;
  while (i < line.length) {
    const ch = line[i];
    if (/\s/.test(ch)) {
      glued = false;
      i++;
      continue;
    }
    if (BRACKETS.includes(ch)) {
      toks.push({ type: ch as Tok["type"], text: ch, glued, from: i, to: i + 1 });
      glued = true;
      i++;
      continue;
    }
    let j = i;
    while (j < line.length && !/\s/.test(line[j]) && !BRACKETS.includes(line[j])) j++;
    toks.push({ type: "word", text: line.slice(i, j), glued, from: i, to: j });
    glued = true;
    i = j;
  }
  return toks;
}

// ------------------------------------------------------------------ parser

// mods: *N repeat · ? probability · ^ accent (performance mark)
const MODS = "(?:\\*\\d+|\\?|\\^)*";
// sound[:variant][(k,n)][mods]  e.g. bd, bd:3, bd(3,8), hh*2?, bd^
const WORD_RE = new RegExp(`^([a-z]+)(?::(\\d+))?(?:\\((\\d+),(\\d+)\\))?(${MODS})$`);
// note[octave][mods]  e.g. c, c#, e5, c#3*2
const NOTE_RE = new RegExp(`^([a-g]#?)(\\d)?(${MODS})$`);
// scale degree  e.g. 0, 7, -2, 0^
const DEGREE_RE = new RegExp(`^(-?\\d{1,2})(${MODS})$`);
// recorded voice slot  e.g. v1, v3(3,8), v2*2
const VOICE_RE = new RegExp(`^(v[1-8])(?:\\((\\d+),(\\d+)\\))?(${MODS})$`);
const REST_RE = /^~(?:\*\d+|\?)*$/;
// `_` prolongs the previous sound one step (Strudel's tie)
const TIE_RE = /^_$/;
const MODS_RE = /^(?:\*\d+|\?|\^)+$/;

const TIE: Node = { kind: "rest" };

function applyMods(node: Node, mods: string): Node {
  for (const m of mods.match(/\*\d+|\?|\^/g) ?? []) {
    if (m === "^") {
      if (node.kind === "hit" || node.kind === "note" || node.kind === "degree") node.accent = true;
    } else if (m === "?") {
      node = { kind: "prob", child: node, p: 0.5 };
    } else {
      const times = Math.min(16, Math.max(1, parseInt(m.slice(1), 10)));
      if (times > 1) node = { kind: "group", children: Array(times).fill(node) };
    }
  }
  return node;
}

const isLeaf = (node: Node): node is Extract<Node, { kind: "hit" | "note" | "degree" }> =>
  node.kind === "hit" || node.kind === "note" || node.kind === "degree";

/** Resolve `_` ties in a sequence: each tie becomes a rest and adds one step
 *  of `hold` to the last sounding token before it. A held note that runs
 *  straight into the next note is a 303 slide: remember where it glides. */
function tieUp(nodes: Node[]): Node[] {
  let last: Extract<Node, { kind: "hit" | "note" | "degree" }> | null = null;
  let tied = false;
  return nodes.map((node) => {
    if (node === TIE) {
      if (last) {
        last.hold = (last.hold ?? 0) + 1;
        tied = true;
      }
      return REST;
    }
    if (isLeaf(node)) {
      if (tied && last && node.kind !== "hit") {
        last.slide = node.kind === "note" ? { kind: "note", midi: node.midi } : { kind: "degree", n: node.n };
      }
      last = node;
    } else {
      last = null;
    }
    tied = false;
    return node;
  });
}

class LineParser {
  private pos = 0;

  constructor(
    private toks: Tok[],
    private lineNumber: number,
    private warnings: string[],
    /** absolute offset of this line's start in the full source */
    private lineOffset = 0
  ) {}

  parse(): Node[] {
    return this.parseSeq(null);
  }

  private warn(message: string) {
    this.warnings.push(t("w.line", { n: this.lineNumber }) + message);
  }

  private parseSeq(closer: "]" | ">" | null): Node[] {
    const nodes: Node[] = [];
    while (this.pos < this.toks.length) {
      const tok = this.toks[this.pos];
      if (tok.type === closer) {
        this.pos++;
        return tieUp(nodes);
      }
      nodes.push(...this.parseElement());
    }
    if (closer) this.warn(t("w.unclosed", { c: closer }));
    return tieUp(nodes);
  }

  private parseElement(): Node[] {
    const tok = this.toks[this.pos++];

    if (tok.type === "[" || tok.type === "<") {
      const inner = this.parseSeq(tok.type === "[" ? "]" : ">");
      const node: Node =
        inner.length === 0
          ? REST
          : tok.type === "["
            ? { kind: "group", children: inner }
            : { kind: "alt", choices: inner };
      return [this.withGluedMods(node)];
    }

    if (tok.type === "]" || tok.type === ">") {
      this.warn(t("w.stray", { c: tok.text }));
      return [];
    }

    return this.parseWord(tok);
  }

  /** Attach modifiers written right after a bracket, e.g. "[bd sn]*2". */
  private withGluedMods(node: Node): Node {
    const tok = this.toks[this.pos];
    if (tok && tok.type === "word" && tok.glued && MODS_RE.test(tok.text)) {
      this.pos++;
      return applyMods(node, tok.text);
    }
    return node;
  }

  private parseWord(tok: Tok): Node[] {
    const text = tok.text;
    const loc: Loc = [this.lineOffset + tok.from, this.lineOffset + tok.to];
    if (REST_RE.test(text)) return [REST];
    if (TIE_RE.test(text)) return [TIE];

    const m = WORD_RE.exec(text);
    const soundId = m ? (SOUND_ALIASES[m[1]] ?? m[1]) : "";
    if (m && SOUND_IDS.has(soundId)) {
      const [, , variantRaw, kRaw, nRaw, mods] = m;
      const hit: Node = {
        kind: "hit",
        id: soundId,
        variant: parseInt(variantRaw ?? "0", 10) || 0,
        loc,
      };
      return this.finishHit(hit, text, kRaw, nRaw, mods);
    }

    const voice = VOICE_RE.exec(text);
    if (voice) {
      const [, slot, kRaw, nRaw, mods] = voice;
      const hit: Node = { kind: "hit", id: slot, variant: 0, loc };
      return this.finishHit(hit, text, kRaw, nRaw, mods);
    }

    const note = NOTE_RE.exec(text);
    if (note) {
      const [, name, octaveRaw, mods] = note;
      const octave = octaveRaw !== undefined ? parseInt(octaveRaw, 10) : 4;
      const midi =
        12 * (Math.min(8, Math.max(1, octave)) + 1) +
        SEMITONES[name[0]] +
        (name.endsWith("#") ? 1 : 0);
      const label = name + (octaveRaw ?? "");
      return [applyMods({ kind: "note", midi, label, loc }, mods)];
    }

    const degree = DEGREE_RE.exec(text);
    if (degree) {
      const [, nRaw, mods] = degree;
      const n = parseInt(nRaw, 10);
      return [applyMods({ kind: "degree", n, label: nRaw, loc }, mods)];
    }

    this.warn(t("w.unknownSound", { token: text }));
    return [];
  }

  /** Shared tail for drum/voice hits: euclid expansion or modifiers. */
  private finishHit(
    hit: Node,
    text: string,
    kRaw: string | undefined,
    nRaw: string | undefined,
    mods: string
  ): Node[] {
    if (kRaw !== undefined && nRaw !== undefined) {
      // Euclidean rhythm: expand in place to n steps with k evenly spread hits.
      if (mods) this.warn(t("w.euclidExtra", { token: text }));
      const n = Math.min(32, Math.max(1, parseInt(nRaw, 10)));
      const k = Math.min(n, parseInt(kRaw, 10));
      return Array.from({ length: n }, (_, i) => ((i * k) % n < k ? hit : REST));
    }
    return [applyMods(hit, mods)];
  }
}

// ------------------------------------------------- "|" commands (fx/tricks)

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const COMMAND_HELP =
  "fast, slow, rev, every, swing, lpf, hpf, res, delay, reverb, size, drive, duck, sub, rumble, pitch, cut, cutoff, env, decay, pan, gain, synth, scale, kit";

function parseCommands(
  segments: string[],
  steps: Node[],
  lineNumber: number,
  warnings: string[]
): LaneDef {
  const warn = (message: string) => warnings.push(`Línea ${lineNumber}: ${message}`);
  let speed = 1;
  let everyN: number | null = null;
  let everySteps: Node[] | null = null;
  let synth: SynthName = "piano";
  let scale = SCALES.mayor;
  let kit: string | null = null;
  let swing = 0;
  const fx: LaneFx = { ...DEFAULT_FX };

  for (const segment of segments) {
    const words = segment.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    const [cmd, a, b] = words;
    const num = parseFloat(a);
    const needsNumber = () => {
      if (Number.isNaN(num)) {
        warn(t("w.needsNumber", { cmd }));
        return true;
      }
      return false;
    };

    switch (cmd) {
      case "fast":
        if (!needsNumber()) speed *= clamp(Math.round(num), 1, 8);
        break;
      case "slow":
        if (!needsNumber()) speed /= clamp(Math.round(num), 1, 8);
        break;
      case "rev":
        steps = [...steps].reverse();
        break;
      case "every":
        if (Number.isNaN(num) || b !== "rev") {
          warn(t("w.every"));
        } else {
          everyN = clamp(Math.round(num), 2, 16);
          everySteps = [...steps].reverse();
        }
        break;
      case "lpf":
        if (!needsNumber()) fx.lpf = clamp(num, 100, 12000);
        break;
      case "delay":
        if (!needsNumber()) fx.delay = clamp(num, 0, 1);
        break;
      case "reverb":
      case "room": // Strudel calls it room
        if (!needsNumber()) fx.reverb = clamp(num, 0, 1);
        break;
      case "pan":
        if (!needsNumber()) fx.pan = clamp(num, -1, 1);
        break;
      case "gain":
        if (!needsNumber()) fx.gain = clamp(num, 0, 2);
        break;
      case "swing":
        if (!needsNumber()) swing = clamp(num, 0, 1);
        break;
      case "drive":
        if (!needsNumber()) fx.drive = clamp(num, 0, 1);
        break;
      case "hpf":
        if (!needsNumber()) fx.hpf = clamp(num, 20, 8000);
        break;
      case "res":
        if (!needsNumber()) fx.res = clamp(num, 0, 1);
        break;
      case "size":
        if (!needsNumber()) fx.size = clamp(num, 0, 1);
        break;
      case "duck":
        if (!needsNumber()) fx.duck = clamp(num, 0, 1);
        break;
      case "sub":
        if (!needsNumber()) fx.sub = clamp(num, 0, 1);
        break;
      case "rumble":
        if (!needsNumber()) fx.rumble = clamp(num, 0, 1);
        break;
      case "pitch":
        if (!needsNumber()) fx.pitch = clamp(num, -24, 24);
        break;
      case "cut":
        if (!needsNumber()) fx.cut = clamp(num, 0.01, 4);
        break;
      case "cutoff":
        if (!needsNumber()) fx.cutoff = clamp(num, 50, 8000);
        break;
      case "env":
        if (!needsNumber()) fx.env = clamp(num, 0, 1);
        break;
      case "decay":
        if (!needsNumber()) fx.decay = clamp(num, 0.02, 2);
        break;
      case "synth":
        if ((SYNTH_NAMES as string[]).includes(a)) synth = a as SynthName;
        else warn(t("w.synth", { list: SYNTH_NAMES.join(", ") }));
        break;
      case "scale":
        if (a in SCALES) scale = SCALES[a];
        else warn(t("w.scale"));
        break;
      case "kit":
        if (a in KITS) kit = a;
        else warn(t("w.kit", { list: Object.keys(KITS).join(", ") }));
        break;
      case "bank": {
        // Strudel-style: bank RolandTR808 — resolve to our short kit name.
        const short = Object.keys(KITS).find((k) => KITS[k] === a);
        if (short) kit = short;
        else warn(t("w.bank", { list: Object.values(KITS).join(", ") }));
        break;
      }
      default:
        warn(t("w.unknownCmd", { cmd, list: COMMAND_HELP }));
    }
  }

  return { steps, speed: clamp(speed, 1 / 8, 8), everyN, everySteps, fx, synth, scale, kit, swing };
}

export function parsePattern(code: string): ParseResult {
  const lanes: LaneDef[] = [];
  const warnings: string[] = [];
  let offset = 0;

  code.split("\n").forEach((rawLine, index) => {
    const lineOffset = offset;
    offset += rawLine.length + 1;

    // Everything after "--" is a comment — full-line or inline (like Tidal).
    const commentIndex = rawLine.indexOf("--");
    const effective = commentIndex >= 0 ? rawLine.slice(0, commentIndex) : rawLine;
    if (effective.trim() === "") return;

    // Tokenize the untrimmed pattern part so token offsets stay accurate.
    const patternPart = effective.split("|")[0];
    const commandParts = effective.split("|").slice(1);
    const steps = new LineParser(tokenize(patternPart), index + 1, warnings, lineOffset).parse();
    if (steps.length === 0) return;

    lanes.push(parseCommands(commandParts, steps, index + 1, warnings));
  });

  return { lanes, warnings };
}

/** Every sample-map key a pattern can play — used to preload samples. */
export function collectSampleKeys(lanes: LaneDef[]): string[] {
  const keys = new Set<string>();
  const walk = (node: Node, kit: string | null) => {
    if (node.kind === "hit") {
      // Kit sample first choice, default sample as fallback.
      if (kit) keys.add(`${kitSampleId(kit, node.id)}:${node.variant}`);
      keys.add(`${node.id}:${node.variant}`);
    } else if (node.kind === "group") node.children.forEach((c) => walk(c, kit));
    else if (node.kind === "alt") node.choices.forEach((c) => walk(c, kit));
    else if (node.kind === "prob") walk(node.child, kit);
  };
  lanes.forEach((lane) => {
    lane.steps.forEach((n) => walk(n, lane.kit));
    lane.everySteps?.forEach((n) => walk(n, lane.kit));
  });
  return [...keys];
}

/** MIDI notes that piano lanes can play — used to preload pitched samples. */
export function collectPianoMidis(lanes: LaneDef[]): number[] {
  const midis = new Set<number>();
  const walk = (node: Node, lane: LaneDef) => {
    if (node.kind === "note" && lane.synth === "piano") midis.add(node.midi);
    else if (node.kind === "degree" && lane.synth === "piano") {
      midis.add(degreeToMidi(node.n, lane.scale));
    } else if (node.kind === "group") node.children.forEach((c) => walk(c, lane));
    else if (node.kind === "alt") node.choices.forEach((c) => walk(c, lane));
    else if (node.kind === "prob") walk(node.child, lane);
  };
  lanes.forEach((lane) => {
    lane.steps.forEach((n) => walk(n, lane));
    lane.everySteps?.forEach((n) => walk(n, lane));
  });
  return [...midis];
}
