import { parsePattern, type LaneDef, type Node } from "./parser";
import type { StyleName, Track } from "./composer";

/**
 * The static critic: a musical linter that scores a track WITHOUT playing
 * it. It enforces the mixing and style rules we apply by hand, so quality
 * doesn't depend on anyone's ear. Also the future doorman for listener
 * submissions and the live AI DJ.
 */

export interface Verdict {
  ok: boolean;
  issues: string[];
}

interface StyleRules {
  bpm: [number, number];
  lanes: [number, number];
  /** must the loudest lane be a kick lane? */
  kickAnchors: boolean;
  maxSwing: number;
  minDrivenLanes?: number;
  /** minimum ratio of rests among top-level steps (airiness) */
  minSilence?: number;
  requiresSwing?: boolean;
  forbidsFast?: boolean;
  /** industrial styles refuse sweetening */
  maxReverb?: number;
  maxDelay?: number;
}

const RULES: Record<StyleName, StyleRules> = {
  motor: { bpm: [122, 128], lanes: [7, 9], kickAnchors: true, maxSwing: 0.4 },
  // bpm spans the lineages (Sandwell 124 → Axis 148); swing only for the
  // swung-metal archetype (one shared value, the judge rule); delay and
  // reverb capped low — Basic Channel's whip on ONE percussion, never a wash
  oxido: {
    bpm: [120, 148],
    lanes: [5, 8],
    kickAnchors: true,
    maxSwing: 0.4,
    minDrivenLanes: 3,
    maxReverb: 0.3,
    maxDelay: 0.25,
  },
  casa: { bpm: [122, 126], lanes: [5, 7], kickAnchors: true, maxSwing: 0.5, requiresSwing: true },
  // 60-75 is the slow clock; the buried-kick, dub and sequence archetypes
  // run a real pulse at 100-126 (pop-ambient, the healer's room, kosmische)
  niebla: {
    bpm: [60, 126],
    lanes: [2, 6],
    kickAnchors: false,
    maxSwing: 0.3,
    minSilence: 0.45,
    forbidsFast: true,
  },
};

const laneStats = (lane: LaneDef) => {
  let rests = 0;
  let hits = 0;
  let hasKick = false;
  const walk = (node: Node) => {
    if (node.kind === "rest") rests++;
    else if (node.kind === "hit") {
      hits++;
      if (node.id === "bd") hasKick = true;
    } else if (node.kind === "note" || node.kind === "degree") hits++;
    else if (node.kind === "group") node.children.forEach(walk);
    else if (node.kind === "alt") walk(node.choices[0]);
    else if (node.kind === "prob") walk(node.child);
  };
  lane.steps.forEach(walk);
  return { rests, hits, hasKick };
};

export function critique(track: Track, style: StyleName): Verdict {
  const issues: string[] = [];
  const rules = RULES[style];

  // every arrangement state must parse clean, not just the final code
  for (const state of track.states) {
    const { warnings } = parsePattern(state);
    if (warnings.length > 0) issues.push(`estado con avisos: ${warnings[0]}`);
  }

  const { lanes } = parsePattern(track.code);
  const stats = lanes.map(laneStats);

  if (track.bpm < rules.bpm[0] || track.bpm > rules.bpm[1]) {
    issues.push(`bpm ${track.bpm} fuera de rango [${rules.bpm}]`);
  }
  if (lanes.length < rules.lanes[0] || lanes.length > rules.lanes[1]) {
    issues.push(`${lanes.length} líneas, esperadas [${rules.lanes}]`);
  }

  // mixing: exactly one anchor, nothing shouting over it
  const gains = lanes.map((l) => l.fx.gain);
  const loudest = Math.max(...gains);
  if (rules.kickAnchors) {
    const anchorIndex = gains.indexOf(loudest);
    if (!stats[anchorIndex]?.hasKick) issues.push("la línea más alta no es el bombo");
    if (loudest < 0.8) issues.push(`ancla floja (gain ${loudest})`);
  }
  if (gains.filter((g) => g > 0.75).length > 2) issues.push("más de 2 líneas gritando (>0.75)");

  // hats never loud
  lanes.forEach((lane, i) => {
    if (/\bh[ho]\b/.test(track.code.split("\n")[i] ?? "") && lane.fx.gain > 0.55) {
      issues.push(`hats demasiado altos (${lane.fx.gain})`);
    }
  });

  // swing policy
  lanes.forEach((lane) => {
    if (lane.swing > rules.maxSwing) issues.push(`swing ${lane.swing} > máx ${rules.maxSwing}`);
  });
  if (rules.requiresSwing && !lanes.some((l) => l.swing >= 0.2)) {
    issues.push("estilo con groove pero sin swing");
  }

  // drive policy
  if (rules.minDrivenLanes) {
    const driven = lanes.filter((l) => l.fx.drive >= 0.2).length;
    if (driven < rules.minDrivenLanes) issues.push(`solo ${driven} líneas con drive`);
  }

  // airiness
  if (rules.minSilence) {
    const rests = stats.reduce((a, s) => a + s.rests, 0);
    const total = rests + stats.reduce((a, s) => a + s.hits, 0);
    const ratio = total > 0 ? rests / total : 0;
    if (ratio < rules.minSilence) {
      issues.push(`poco aire: silencio ${(ratio * 100).toFixed(0)}%`);
    }
  }
  if (rules.forbidsFast && lanes.some((l) => l.speed > 1)) issues.push("fast en estilo lento");

  // ONE groove: every swung lane shares the same swing value (judge rule)
  const swings = [...new Set(lanes.map((l) => l.swing).filter((s) => s > 0))];
  if (swings.length > 1) issues.push(`grooves distintos en un mismo tema: ${swings.join(", ")}`);

  // ONE kit: mixing machines reads as a bug, not a choice (judge rule)
  const kits = [...new Set(lanes.map((l) => l.kit).filter(Boolean))];
  if (kits.length > 1) issues.push(`kits mezclados: ${kits.join(", ")}`);

  // no cosmetic values: a pan you can't hear is noise in the score (judge rule)
  lanes.forEach((lane) => {
    const p = Math.abs(lane.fx.pan);
    if (p > 0 && p < 0.12) issues.push(`pan cosmético (${lane.fx.pan})`);
  });

  // industrial styles refuse sweetening
  if (rules.maxReverb !== undefined && lanes.some((l) => l.fx.reverb > rules.maxReverb!)) {
    issues.push("reverb fuera de estilo");
  }
  if (rules.maxDelay !== undefined && lanes.some((l) => l.fx.delay > rules.maxDelay!)) {
    issues.push("delay fuera de estilo");
  }

  // movement: something must evolve
  if (!/[<?]|every/.test(track.code)) issues.push("bucle muerto: sin <>, ? ni every");

  // laziness: duplicated lines
  const lines = track.code.split("\n");
  if (new Set(lines).size !== lines.length) issues.push("líneas duplicadas");

  // arrangement sanity
  if (track.states.length < 2) issues.push("sin arreglo (un solo estado)");

  return { ok: issues.length === 0, issues };
}
