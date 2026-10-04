import { mulberry32, pick, rint, rnum, chance, type Rng } from "./rng";

/**
 * The radio's composer: given a style and a seed, deterministically builds
 * a track — same seed, same track, in every browser. Each grammar distills
 * a style into weighted parameter ranges, never fixed values.
 *
 * Design rules (from the blind-judge review):
 * - ONE groove per track: every swung lane shares the same swing value.
 * - ONE kit per track (mixing kits reads as a bug, not a choice).
 * - No cosmetic values (a pan of 0.02 does nothing — pan wide or not at all).
 * - Structural variety between seeds, not decimal jitter: riffs are built
 *   from templates + degree pools, layers appear/disappear, progressions
 *   use 4 positions, sample variants and `?` get real use.
 *
 * A track carries `states` (arrangement: fewer layers in, everything, out).
 */

export type StyleName = "motor" | "oxido" | "casa" | "niebla";

export const STYLES: StyleName[] = ["motor", "oxido", "casa", "niebla"];

export interface Track {
  style: StyleName;
  title: string;
  bpm: number;
  /** arrangement: states[0] = intro, last = full picture */
  states: string[];
  /** the full pattern (last state) — what "remix this" copies */
  code: string;
}

interface Lane {
  line: string;
  /** 1 = foundation (intro), 2 = body, 3 = decoration (only in full state) */
  tier: 1 | 2 | 3;
}

interface Sketch {
  bpm: number;
  lanes: Lane[];
}

// ------------------------------------------------------------------ helpers

const TITLES: Record<StyleName, string[]> = {
  motor: ["Autopista", "Cromo", "Turbina", "Medianoche en la fábrica", "Bujía", "Correa"],
  oxido: [
    "Herrumbre", "Chapa y pintura", "Polígono", "Soldadura", "Viga maestra", "Fundición",
    "Turno de noche", "Cortina de ride", "Grúa", "Chatarra", "Látigo", "Nave 7",
  ],
  casa: ["Portal abierto", "Vecinos", "Azotea", "Llave maestra", "Rellano", "Persiana"],
  niebla: [
    "Marea baja", "Vapor", "Duermevela", "Faro lejano", "Escarcha", "Bajamar",
    "Sala de espera", "Cinta gastada", "Deshielo", "Postal", "Cuarto oscuro", "Secuencia",
  ],
};

/** signed pan far enough from center to be audible (never cosmetic) */
const span = (rng: Rng, min: number, max: number): number =>
  (chance(rng, 0.5) ? 1 : -1) * rnum(rng, min, max);

/** fill a riff template: R = root (insistent), X/Y = wandering degrees.
 *  Draws without replacement so `<X Y>` never degenerates into `<3 3>`. */
function riff(rng: Rng, template: string, root: number, others: number[]): string {
  const pool = [...others];
  return template.replaceAll("R", String(root)).replace(/X|Y/g, () => {
    if (pool.length === 0) pool.push(...others);
    const i = Math.floor(rng() * pool.length);
    return String(pool.splice(i, 1)[0]);
  });
}

/** a one-token lane with the voice placed at `lead` (voices interleave
 *  instead of all hitting at position 0 of their loops) */
function offsetLane(token: string, lead: number, length: number): string {
  const slots = Array(length).fill("~");
  slots[Math.min(lead, length - 1)] = token;
  return slots.join(" ");
}

// ----------------------------------------------------------------- grammars

/** MOTOR — clean machine soul: 4-chord pad progressions, funk bass. */
function motor(rng: Rng): Sketch {
  const bpm = rint(rng, 122, 128);
  const hatKind = rng();
  // ONE groove — and if the hats are the straight 3-step polymeter, the
  // whole track goes straight with them (no split feel)
  const groove = hatKind < 0.75 ? rnum(rng, 0.12, 0.25) : 0;
  const lanes: Lane[] = [];

  // kick: constant, sometimes with an alternating double-hit fill
  lanes.push({
    tier: 1,
    line: `bd${chance(rng, 0.4) ? `:${rint(rng, 0, 3)}` : ""} ~ bd ~ bd ~ ${chance(rng, 0.25) ? "<bd [bd bd]>" : "bd"} ~ | kit 909 | sub ${rnum(rng, 0.2, 0.35)} | gain 0.9 -- bombo constante`,
  });

  // backbeat FAMILY — the clap used to be a byte-for-byte clone across tracks
  const backbeat = pick(rng, [
    "~ ~ cp ~",
    "~ ~ cp ~ ~ ~ [cp cp?] ~",
    "~ ~ sn ~",
    "~ ~ cp ~ ~ ~ <cp [cp cp]> ~",
  ]);
  lanes.push({
    tier: 1,
    line: `${backbeat} | kit 909 | reverb ${rnum(rng, 0.25, 0.35)} | gain 0.5 -- contragolpe`,
  });

  const offbeat = pick(rng, ["~ ho ~ ho", "~ [~ ho] ~ ho", "~ ho ~ ho?"]);
  lanes.push({
    tier: 2,
    line: `${offbeat} | kit 909 | gain ${rnum(rng, 0.35, 0.45)} -- contratiempo`,
  });

  // hats: 16ths, straight 8ths with ?, or a 3-step polymeter shimmer
  const hatEvolve = chance(rng, 0.3) ? " | every 8 rev" : "";
  if (hatKind < 0.45) {
    lanes.push({
      tier: 3,
      line: `hh hh hh hh | kit 909 | fast 2 | swing ${groove} | gain ${rnum(rng, 0.25, 0.32)}${hatEvolve} -- hats`,
    });
  } else if (hatKind < 0.75) {
    lanes.push({
      tier: 3,
      line: `hh hh? hh hh | kit 909 | swing ${groove} | gain ${rnum(rng, 0.3, 0.38)}${hatEvolve} -- hats`,
    });
  } else {
    lanes.push({
      tier: 3,
      line: `hh hh hh | kit 909 | gain ${rnum(rng, 0.24, 0.3)} -- hats, 3 contra 4`,
    });
  }

  // signature percussion: an odd-grid voice that makes THIS track's grid its own
  if (chance(rng, 0.45)) {
    const percPan = span(rng, 0.25, 0.45);
    const perc = pick(rng, [
      `rm(3,8) | kit 909 | pan ${percPan} | gain ${rnum(rng, 0.26, 0.32)} -- rim rodando`,
      `~ ~ rm | kit 909 | pan ${percPan} | gain ${rnum(rng, 0.26, 0.32)} -- rim, 3 contra 4`,
      `mt ~ ~ ~ mt ~ ~ | kit 909 | slow 2 | pan ${percPan} | gain ${rnum(rng, 0.28, 0.34)} -- toms lejanos`,
    ]);
    lanes.push({ tier: 3, line: perc });
  }

  const bassTemplates = [
    "R ~ [~ R] ~ X ~ [~ Y] ~",
    "R ~ R [~ X] ~ R <Y X> ~",
    "R ~ [~ R] X ~ <R Y> ~ ~",
    "R [~ R] ~ X ~ ~ [~ Y] ~",
    "R ~ ~ [~ X] R ~ <Y ~> ~",
    "R [~ R?] ~ [R R] X ~ [~ Y] ~",
    "R ~ [X ~] R [~ R?] ~ <Y X> ~",
  ];
  const root = pick(rng, [0, 0, 0, -2]);
  lanes.push({
    // half the intros open kick+bass instead of always kick+clap
    tier: chance(rng, 0.5) ? 1 : 2,
    line: `${riff(rng, pick(rng, bassTemplates), root, [3, 5, 7, -2].filter((d) => d !== root))} | synth bass | scale menor${groove > 0 ? ` | swing ${groove}` : ""} | duck ${rnum(rng, 0.3, 0.45)} | gain ${rnum(rng, 0.65, 0.75)} -- bajo funk`,
  });

  // 4-position progression with a two-level twist: the last chord resolves
  // differently every other pass — the harmonic cycle stops photocopying
  const prog = pick(rng, [
    [0, 3, 5, 2],
    [0, -2, 3, 2],
    [0, 5, 3, -2],
    [3, 2, 0, -2],
  ]);
  const nestLast = chance(rng, 0.5);
  const voice = (offset: number) =>
    prog
      .map((d, i) =>
        i === 3 && nestLast ? `<${d + offset} ${d + offset - 2}>` : String(d + offset)
      )
      .join(" ");
  const rev = rnum(rng, 0.5, 0.6);
  const voicing = pick(rng, [2, 4]); // thirds or sixths — the chord's colour
  if (chance(rng, 0.35)) {
    // STAB strings: the progression hits offbeats instead of blocking on the 1
    const stabLpf = rint(rng, 1600, 2600);
    lanes.push({
      tier: 2,
      line: `~ <${voice(0)}> ~ ~ ~ <${voice(0)}> ~ ~ | synth pad | scale menor | lpf ${stabLpf} | delay ${rnum(rng, 0.2, 0.3)} | gain ${rnum(rng, 0.45, 0.52)} -- cuerdas: stabs`,
    });
    lanes.push({
      tier: 3,
      line: `~ ~ ~ <${voice(voicing)}> ~ ~ ~ ~ | synth pad | scale menor | lpf ${stabLpf + 500} | reverb ${rev} | pan ${span(rng, 0.2, 0.4)} | gain ${rnum(rng, 0.32, 0.38)} -- cuerdas: respuesta`,
    });
  } else {
    lanes.push({
      tier: 2,
      line: `<${voice(0)}> ~ ~ ~ | synth pad | scale menor | slow 2 | reverb ${rev} | size 0.6 | duck 0.3 | gain ${rnum(rng, 0.5, 0.6)} -- cuerdas: progresión`,
    });
    lanes.push({
      tier: 3,
      line: `<${voice(voicing)}> ~ ~ ~ | synth pad | scale menor | slow 2 | reverb ${rev} | size 0.6 | duck 0.3 | gain ${rnum(rng, 0.35, 0.42)} -- cuerdas: armonía`,
    });
  }

  // detail voice: sparse piano, a distant acid line, or an acid arpeggio
  const detail = rng();
  if (detail < 0.5) {
    const motifs = [
      "~ ~ <7 ~> ~ ~ <9 12> ~ ~",
      "~ <9 ~> ~ ~ 7 ~ ~ <12 ~>",
      "<7 ~ 9 ~> ~ ~ ~ <11 ~> ~ ~ ~ ~",
      "~ ~ 7 ~ ~ <9 ~> ~ ~ 12 ~ ~ ~",
      "7 ~ ~ <11 9> ~ ~ ~ <14 ~> ~ ~ ~",
    ];
    lanes.push({
      tier: 3,
      line: `${pick(rng, motifs)} | synth piano | scale menor | delay ${rnum(rng, 0.4, 0.5)} | pan ${span(rng, 0.2, 0.4)} | gain ${rnum(rng, 0.38, 0.45)}${chance(rng, 0.3) ? " | every 4 rev" : ""} -- detalles de piano`,
    });
  } else if (detail < 0.8) {
    lanes.push({
      tier: 3,
      line: `${riff(rng, "R ~ ~ <X ~> ~ ~ R ~", 7, [12, 14, 10])} | synth acid | scale menor | delay ${rnum(rng, 0.25, 0.35)} | gain ${rnum(rng, 0.3, 0.38)} -- ácido lejano`,
    });
  } else {
    lanes.push({
      tier: 3,
      line: `${riff(rng, "R X 7 12 ~ 7 X ~", 0, [3, 5])} | synth acid | fast 2 | scale menor | lpf ${rint(rng, 700, 1100)} | gain ${rnum(rng, 0.28, 0.34)}${chance(rng, 0.4) ? " | every 4 rev" : ""} -- arpegio ácido`,
    });
  }

  return { bpm, lanes };
}

// ----------------------------------------------------------------- ÓXIDO
//
// The grid: one step is an EIGHTH note (8 steps = one 4/4 bar at the shown
// tempo — the lessons, the gallery and the step grid all agree). So the
// four-on-the-floor is `bd ~ bd ~ bd ~ bd ~` (or `bd ~ bd ~`, looping),
// the backbeat `~ ~ cp ~`, offbeat hats `~ hh ~ hh …`, sixteenths are
// `hh hh hh hh | fast 2`. Every grammar and anchor is written on it.
//
// Seven archetypes, each distilled from one UK/industrial lineage (kitchen
// notes in PLAN-FM.md): the Birmingham roller, the Downwards dub slab, the
// noise foundry, the tribal polyrhythm, the swung metal, the Axis hammer and
// the hypnotic loop with a chorus. Common law: no melodic breakdown, no
// bassline funk; variation comes from grids, filters and drive.

/** `~ ~ x ~` with `token` on the given 0-based slots of a `length` loop */
function slots(token: string, length: number, at: number[]): string {
  const out = Array(length).fill("~");
  for (const i of at) if (i < length) out[i] = token;
  return out.join(" ");
}

const KICK_4x4 = "bd ~ bd ~ bd ~ bd ~";

function oxidoRodillo(rng: Rng, lanes: Lane[]): number {
  // Birmingham 90s: relentless kick, tom circles of half a bar and a bar
  // that roll forever, a gauzy ride curtain, a dry clap, no melody.
  const bpm = rint(rng, 134, 140);
  lanes.push({
    tier: 1,
    line: `${KICK_4x4} | kit 909 | drive ${rnum(rng, 0.4, 0.55)} | sub ${rnum(rng, 0.3, 0.45)} | rumble ${rnum(rng, 0.2, 0.4)} | gain 0.9 -- el martillo`,
  });
  const tomPan = span(rng, 0.3, 0.5);
  const circle = pick(rng, [
    "lt lt mt ~ lt ~ mt ~",
    "mt ~ mt mt ~ lt ~ ~",
    "lt ~ ~ lt mt ~ lt ~ ~ lt ~ mt ~ ~ lt ~",
    "mt(5,8)",
    "lt ~ mt ~ ~ lt ~ mt ~ ~ lt ~ ~ mt ~ ~",
  ]);
  lanes.push({
    tier: 1,
    line: `${circle} | drive ${rnum(rng, 0.6, 0.8)} | pan ${tomPan} | gain ${rnum(rng, 0.5, 0.58)}${chance(rng, 0.5) ? " | every 4 rev" : ""} -- toms en círculo`,
  });
  lanes.push({
    tier: 2,
    line: `ho ho ho ho ho ho ho ho | kit 909 | lpf ${rint(rng, 6000, 8000)} | drive 0.3 | gain ${rnum(rng, 0.3, 0.38)} -- cortina de ride`,
  });
  lanes.push({
    tier: 2,
    line: `${pick(rng, ["~ hh ~ hh ~ hh ~ hh", "~ hh ~ hh? ~ hh ~ hh", "~ hh ~ hh ~ hh ~ [hh hh]"])} | kit 909 | drive 0.3 | gain ${rnum(rng, 0.28, 0.34)} -- hat a contratiempo`,
  });
  lanes.push({
    tier: 2,
    line: `${pick(rng, ["~ ~ cp ~ ~ ~ cp ~", slots("cp", 16, [10]), "~ ~ cp ~ ~ ~ <cp [cp cp]> ~"])} | kit 909 | drive 0.4 | gain ${rnum(rng, 0.42, 0.5)} -- palmada seca`,
  });
  lanes.push({
    tier: 1,
    line: chance(rng, 0.5)
      ? `0 ~ 0 ~ 0 ~ 0 ~ | synth bass | scale menor | lpf ${rint(rng, 250, 350)} | drive 0.4 | duck ${rnum(rng, 0.4, 0.6)} | gain ${rnum(rng, 0.6, 0.68)} -- sub a pulsos`
      : `0 ~ 0 ~ 0 ~ <0 1> ~ | synth bass | scale frigia | lpf ${rint(rng, 250, 350)} | drive 0.4 | duck ${rnum(rng, 0.4, 0.6)} | gain ${rnum(rng, 0.6, 0.68)} -- sub a pulsos, con el roce`,
  });
  if (chance(rng, 0.6)) {
    lanes.push({
      tier: 3,
      line: `rm ~ ~ rm ~ ~ rm ~ ~ ~ rm ~ ~ rm ~ ~ | drive 0.5 | pan ${(-Math.sign(tomPan) * rnum(rng, 0.25, 0.45)).toFixed(2)} | gain ${rnum(rng, 0.38, 0.44)} -- rim en tresillos`,
    });
  }
  if (chance(rng, 0.4)) {
    lanes.push({
      tier: 3,
      line: `0 ~ ~ ~ ~ ~ ~ ~ | synth pad | scale frigia | slow 4 | lpf ${rint(rng, 300, 500)} | drive 0.3 | duck 0.5 | gain ${rnum(rng, 0.42, 0.5)} -- la losa`,
    });
  }
  return bpm;
}

function oxidoHondo(rng: Rng, lanes: Lane[]): number {
  // Downwards / Sandwell: low-slung, stepping, Basic Channel's dub space —
  // ONE percussion carries the echo whip; frosty snare; ominous strings on
  // the flat second.
  const bpm = rint(rng, 124, 131);
  lanes.push({
    tier: 1,
    line: `${chance(rng, 0.7) ? KICK_4x4 : "bd ~ bd ~ bd ~ bd [~ bd]"} | kit 909 | drive ${rnum(rng, 0.3, 0.45)} | sub ${rnum(rng, 0.35, 0.5)} | rumble ${rnum(rng, 0.3, 0.45)} | gain 0.9 -- el martillo, hondo`,
  });
  const whipPan = span(rng, 0.3, 0.45);
  lanes.push({
    tier: 2,
    line: `${pick(rng, ["rm ~ ~ rm ~ rm ~", "rm ~ ~ ~ rm ~ ~ rm ~ ~ ~ ~", "rm ~ ~ ~ ~ rm ~ ~ ~ rm? ~ ~"])} | drive 0.3 | delay ${rnum(rng, 0.2, 0.25)} | reverb ${rnum(rng, 0.2, 0.3)} | pan ${whipPan} | gain ${rnum(rng, 0.4, 0.46)} -- el látigo`,
  });
  lanes.push({
    tier: 3,
    line: `${slots("lt", 12, [0, 8]).replace(/lt(?=[^l]*$)/, "lt?")} | drive 0.4 | pan ${(-Math.sign(whipPan) * rnum(rng, 0.25, 0.4)).toFixed(2)} | gain ${rnum(rng, 0.42, 0.48)} -- tom perdido`,
  });
  lanes.push({
    tier: 2,
    line: `hh? ~ hh ~ hh? ~ hh ~ | kit 909 | lpf ${rint(rng, 4000, 5500)} | drive 0.25 | gain ${rnum(rng, 0.26, 0.32)} -- hats escasos`,
  });
  lanes.push({
    tier: 2,
    line: `~ ~ ~ ~ sn ~ ~ ~ | kit 909 | reverb ${rnum(rng, 0.25, 0.3)} | delay ${rnum(rng, 0.15, 0.2)} | drive 0.3 | gain ${rnum(rng, 0.38, 0.44)} -- caja helada`,
  });
  lanes.push({
    tier: 1,
    line: `<0 1 0 4> ~ ~ ~ ~ ~ ~ ~ | synth pad | scale frigia | slow 4 | lpf ${rint(rng, 700, 1000)} | reverb 0.3 | size 0.6 | duck ${rnum(rng, 0.4, 0.55)} | gain ${rnum(rng, 0.45, 0.52)} -- cuerdas ominosas`,
  });
  lanes.push({
    tier: 1,
    line: `${pick(rng, ["0 _ _ ~ ~ ~ ~ ~", "0 _ ~ ~ 0 _ ~ ~", "0 _ _ ~ ~ ~ <0 -3> ~"])} | synth sub | scale frigia | duck ${rnum(rng, 0.3, 0.45)} | gain ${rnum(rng, 0.6, 0.66)} -- sub`,
  });
  if (chance(rng, 0.4)) {
    lanes.push({
      tier: 3,
      line: `~ ~ ~ ~ ~ cb? ~ ~ ~ | drive 0.3 | lpf 3000 | gain 0.28 -- cencerro al fondo`,
    });
  }
  return bpm;
}

function oxidoFundicion(rng: Rng, lanes: Lane[]): number {
  // Modern noise industrial: everything saturated, struck metal on odd
  // loops, snare optional, an acid hook or a sub — bone dry.
  const bpm = chance(rng, 0.2) ? rint(rng, 120, 124) : rint(rng, 130, 138);
  lanes.push({
    tier: 1,
    line: `${chance(rng, 0.7) ? KICK_4x4 : "bd ~ bd ~ bd ~ bd [~ bd?]"} | kit 909 | drive ${rnum(rng, 0.8, 0.95)} | sub ${rnum(rng, 0.3, 0.5)} | rumble ${rnum(rng, 0.15, 0.3)} | gain 0.9 -- el martillo al rojo`,
  });
  const metalPan = span(rng, 0.3, 0.5);
  lanes.push({
    tier: 1,
    line: `${pick(rng, ["cb ~ rm ~ ~", "rm cb? ~ rm ~", "cb ~ ~ rm cb?"])} | drive ${rnum(rng, 0.75, 0.9)} | lpf ${rint(rng, 3000, 6000)} | pan ${metalPan} | gain ${rnum(rng, 0.46, 0.54)} -- chatarra, 5 pasos`,
  });
  lanes.push({
    tier: 2,
    line: `${pick(rng, ["rm ~ ~ cb ~ ~ ~ rm ~", "~ rm ~ ~ cb ~ rm ~ ~"])} | drive ${rnum(rng, 0.7, 0.85)} | lpf ${rint(rng, 2500, 5000)} | pan ${(-Math.sign(metalPan) * rnum(rng, 0.25, 0.45)).toFixed(2)} | gain ${rnum(rng, 0.4, 0.46)}${chance(rng, 0.5) ? " | every 3 rev" : ""} -- chatarra, 9 pasos`,
  });
  lanes.push({
    tier: 2,
    line: chance(rng, 0.6)
      ? `hh? hh hh? hh hh hh? hh hh | fast 2 | kit 909 | drive 0.8 | gain ${rnum(rng, 0.26, 0.32)} -- hats de ruido`
      : `ho ~ ~ ho ~ ~ ~ | drive 0.85 | lpf ${rint(rng, 2000, 3000)} | gain ${rnum(rng, 0.26, 0.32)} -- soplete`,
  });
  if (chance(rng, 0.5)) {
    lanes.push({
      tier: 2,
      line: `${slots("sn", 16, [12])} | kit 909 | drive 0.8 | gain ${rnum(rng, 0.42, 0.5)} -- caja de ruido, cada dos compases`,
    });
  }
  lanes.push({
    tier: 1,
    line: chance(rng, 0.6)
      ? `${pick(rng, ["0^ 0 ~ 0 _ <0 1> 0 ~", "0 ~ 0^ 0 ~ 0 _ <1 0>", "0^ 0 0 ~ <0 1> 0 _ ~"])} | synth acid | scale frigia | cutoff ${rint(rng, 300, 600)} | res ${rnum(rng, 0.55, 0.8)} | env ${rnum(rng, 0.5, 0.8)} | decay ${rnum(rng, 0.15, 0.35)} | drive ${rnum(rng, 0.5, 0.7)} | duck 0.3 | gain ${rnum(rng, 0.55, 0.62)} -- gancho ácido`
      : `-7 _ _ ~ ~ ~ ~ ~ | synth sub | scale menor | drive 0.4 | duck 0.35 | gain ${rnum(rng, 0.6, 0.66)} -- sub de fundición`,
  });
  if (chance(rng, 0.4)) {
    lanes.push({
      tier: 3,
      line: `lt(3,8) | drive 0.7 | pan ${span(rng, 0.2, 0.35)} | gain ${rnum(rng, 0.42, 0.48)} -- tom de yunque`,
    });
  }
  return bpm;
}

function oxidoTribal(rng: Rng, lanes: Lane[]): number {
  // Surgeon's galloping polyrhythms, Function's psychic warfare, the dry
  // tribal loops of odd length — grids as the signature, one shared gallop.
  const bpm = rint(rng, 128, 135);
  const groove = chance(rng, 0.5) ? rnum(rng, 0.12, 0.2) : 0;
  const sw = groove > 0 ? ` | swing ${groove}` : "";
  const broken = chance(rng, 0.35); // the 3+3+2 kick of the soundsystem
  lanes.push({
    tier: 1,
    line: `${broken ? "bd ~ ~ bd ~ ~ bd ~" : KICK_4x4} | kit 909 | drive ${rnum(rng, 0.4, 0.5)} | sub ${rnum(rng, 0.3, 0.45)} | gain 0.9 -- el martillo${broken ? ", roto" : ""}`,
  });
  const tomPan = span(rng, 0.3, 0.5);
  lanes.push({
    tier: 1,
    line: `${pick(rng, ["lt(5,8)", "lt(5,12)", "lt ~ lt ~ ~ lt ~ lt ~ ~"])} | drive 0.45 | pan ${tomPan} | gain ${rnum(rng, 0.48, 0.55)} -- toms tribales`,
  });
  lanes.push({
    tier: 2,
    line: `${pick(rng, ["mt(3,8)", "mt ~ ~ mt ~ mt ~ ~ ~ mt", "mt ~ ~ ~ mt ~ ~ mt ~"])} | drive 0.4 | pan ${(-Math.sign(tomPan) * rnum(rng, 0.25, 0.45)).toFixed(2)} | gain ${rnum(rng, 0.4, 0.46)}${chance(rng, 0.4) ? " | every 4 rev" : ""} -- toms, la respuesta`,
  });
  lanes.push({
    tier: 2,
    line: `${pick(rng, ["hh(7,16)", "hh(5,8)", "hh(9,16)"])} | kit 909 | drive 0.3 | lpf ${rint(rng, 5500, 7000)}${sw} | gain ${rnum(rng, 0.3, 0.36)} -- hats euclídeos`,
  });
  lanes.push({
    tier: 2,
    line: `~ ~ ~ ~ rm ~ ~ ~ | drive 0.35${sw} | gain ${rnum(rng, 0.38, 0.42)} -- rim en el tres`,
  });
  lanes.push({
    tier: 3,
    line: `${slots("ho", 11, [3, 9])} | drive 0.3 | lpf ${rint(rng, 5000, 6500)} | gain ${rnum(rng, 0.26, 0.32)} -- hat abierto, 11 pasos`,
  });
  lanes.push({
    tier: 1,
    line: chance(rng, 0.5)
      ? `0 ~ ~ 0 ~ ~ 0 ~ | synth bass | scale penta | lpf ${rint(rng, 260, 340)} | drive 0.4 | duck ${rnum(rng, 0.35, 0.5)} | gain ${rnum(rng, 0.58, 0.64)} -- bajo en tresillo`
      : `<-7 -5> ~ ~ ~ ~ ~ ~ ~ | synth pad | scale penta | slow 8 | lpf ${rint(rng, 350, 500)} | drive 0.25 | duck ${rnum(rng, 0.35, 0.5)} | gain ${rnum(rng, 0.48, 0.54)} -- drone de fondo`,
  });
  if (chance(rng, 0.4)) {
    lanes.push({
      tier: 3,
      line: `cb ~ ~ ~ cb? ~ ~ | drive 0.4 | lpf 4000${sw} | pan ${span(rng, 0.2, 0.35)} | gain 0.3 -- cencerro, 7 pasos`,
    });
  }
  return bpm;
}

function oxidoMetalico(rng: Rng, lanes: Lane[]): number {
  // Blawan / Karenn: heavy kick, swung mid-range metal in 18 against 10,
  // a raw offbeat hat and an acid line that snarls on eighths.
  const bpm = rint(rng, 128, 132);
  const groove = rnum(rng, 0.3, 0.4);
  lanes.push({
    tier: 1,
    line: `${KICK_4x4} | kit 909 | drive ${rnum(rng, 0.4, 0.5)} | sub ${rnum(rng, 0.35, 0.5)} | rumble ${rnum(rng, 0.2, 0.35)} | gain 0.9 -- el martillo, pesado`,
  });
  const metalPan = span(rng, 0.3, 0.45);
  lanes.push({
    tier: 1,
    line: `${pick(rng, ["rm ~ ~ cb ~ rm ~ ~ ~ ~ rm ~ cb ~ ~ ~ rm ~", "cb ~ rm ~ ~ ~ rm ~ cb ~ ~ rm ~ ~ ~ ~ rm ~"])} | swing ${groove} | drive 0.45 | lpf ${rint(rng, 4000, 6000)} | pan ${metalPan} | gain ${rnum(rng, 0.44, 0.5)} -- metal, 18 pasos`,
  });
  lanes.push({
    tier: 2,
    line: `${pick(rng, ["cb ~ ~ rm? ~ ~ cb ~ ~ ~", "rm ~ ~ ~ cb ~ ~ rm? ~ ~"])} | swing ${groove} | drive 0.45 | pan ${(-Math.sign(metalPan) * rnum(rng, 0.25, 0.4)).toFixed(2)} | gain ${rnum(rng, 0.38, 0.44)} -- metal, 10 pasos`,
  });
  lanes.push({
    tier: 2,
    line: `~ hh ~ hh ~ hh ~ hh | kit 909 | swing ${groove} | drive 0.4 | gain ${rnum(rng, 0.28, 0.34)} -- hat crudo`,
  });
  lanes.push({
    tier: 3,
    line: `~ ~ ~ ~ sn? ~ ~ ~ | kit 909 | drive 0.4 | reverb 0.25 | gain ${rnum(rng, 0.38, 0.42)} -- caja a veces`,
  });
  lanes.push({
    tier: 1,
    line: `${pick(rng, ["0^ 0 <0 3> 0 _ 0 <5 0> 0^", "0 0^ 0 <3 0> 0 _ 0 <0 5>", "0^ <0 3> 0 0 <0 5>^ 0 _ 0"])} | synth acid | scale menor | cutoff ${rint(rng, 350, 650)} | res ${rnum(rng, 0.5, 0.75)} | env ${rnum(rng, 0.45, 0.7)} | decay ${rnum(rng, 0.2, 0.4)} | delay ${rnum(rng, 0.2, 0.25)} | drive 0.45 | duck 0.4 | gain ${rnum(rng, 0.55, 0.6)} | every 8 rev -- ácido que gruñe`,
  });
  if (chance(rng, 0.6)) {
    lanes.push({
      tier: 2,
      line: `-7 _ _ _ ~ ~ ~ ~ | synth reese | scale menor | cutoff ${rint(rng, 350, 550)} | duck 0.5 | gain ${rnum(rng, 0.5, 0.56)} -- bajo clavado`,
    });
  }
  return bpm;
}

function oxidoEje(rng: Rng, lanes: Lane[]): number {
  // Axis / Tresor: up-tempo, driving, sixteenth hats, a bright ride, a
  // clap on 2 and 4, one-note bass and a tiny high riff.
  const bpm = rint(rng, 138, 148);
  lanes.push({
    tier: 1,
    line: `${KICK_4x4} | kit 909 | drive ${rnum(rng, 0.3, 0.4)} | sub ${rnum(rng, 0.25, 0.4)} | rumble ${rnum(rng, 0.15, 0.25)} | gain 0.9 -- el martillo, rápido`,
  });
  lanes.push({
    tier: 2,
    line: `hh hh hh hh hh hh hh hh${chance(rng, 0.4) ? "?" : ""} | fast 2 | kit 909 | drive 0.25 | gain ${rnum(rng, 0.26, 0.32)} -- dieciseisavos`,
  });
  lanes.push({
    tier: 2,
    line: `~ ho ~ ho ~ ho ~ ho | kit 909 | drive 0.2 | gain ${rnum(rng, 0.3, 0.36)} -- ride brillante`,
  });
  lanes.push({
    tier: 2,
    line: `~ ~ cp ~ ~ ~ cp ~ | kit 909 | drive 0.3 | gain ${rnum(rng, 0.42, 0.48)} -- palmada`,
  });
  lanes.push({
    tier: 3,
    line: `${pick(rng, ["[rm rm] ~ ~ ~ [rm rm] ~ ~ ~", "rm ~ rm ~ ~ rm ~ ~ rm ~ ~ ~ rm ~ rm ~"])} | drive 0.3 | pan ${span(rng, 0.25, 0.4)} | gain ${rnum(rng, 0.38, 0.42)} | every 4 rev -- rim mínimo`,
  });
  lanes.push({
    tier: 1,
    line: `0 ~ 0 ~ 0 ~ 0 ~ | synth bass | scale menor | lpf ${rint(rng, 280, 340)} | drive 0.35 | duck ${rnum(rng, 0.4, 0.55)} | gain ${rnum(rng, 0.6, 0.64)} -- bajo de una nota`,
  });
  lanes.push({
    tier: 3,
    line: `${pick(rng, ["~ ~ ~ 12 ~ ~ <14 12> ~", "~ ~ 12 ~ ~ ~ ~ <14 ~>", "12 ~ ~ <12 14> ~ ~ ~ ~"])} | synth piano | scale menor | delay 0.2 | pan ${span(rng, 0.2, 0.35)} | gain ${rnum(rng, 0.4, 0.46)} -- riff de campanas`,
  });
  return bpm;
}

function oxidoPoligono(rng: Rng, lanes: Lane[]): number {
  // The hypnotic loop with a chorus — Madrid 96-02, the PoleGroup school:
  // dark, rolling, one 8-step acid riff that keeps coming back.
  const bpm = rint(rng, 132, 138);
  lanes.push({
    tier: 1,
    line: `${KICK_4x4} | kit 909 | drive ${rnum(rng, 0.45, 0.6)} | sub ${rnum(rng, 0.35, 0.5)} | rumble ${rnum(rng, 0.3, 0.45)} | gain 0.9 -- el martillo`,
  });
  lanes.push({
    tier: 2,
    line: `hh hh hh hh? hh hh hh? hh | fast 2 | kit 909 | drive 0.35 | gain ${rnum(rng, 0.26, 0.32)} -- hats hipnóticos`,
  });
  lanes.push({
    tier: 2,
    line: `~ ho ~ ho ~ ho ~ ho | kit 909 | lpf ${rint(rng, 5000, 7000)} | drive 0.3 | gain ${rnum(rng, 0.28, 0.34)} -- ride oscuro`,
  });
  lanes.push({
    tier: 2,
    line: `${pick(rng, ["~ ~ ~ ~ sn ~ ~ ~", "~ ~ ~ ~ sn ~ ~ [~ sn?]"])} | kit 909 | drive 0.45 | gain ${rnum(rng, 0.42, 0.48)} -- caja seca en el tres`,
  });
  const riff = riff_(rng);
  lanes.push({
    tier: 1,
    line: `${riff} | synth acid | scale ${pick(rng, ["menor", "frigia"])} | cutoff ${rint(rng, 350, 700)} | res ${rnum(rng, 0.5, 0.75)} | env ${rnum(rng, 0.5, 0.75)} | decay ${rnum(rng, 0.2, 0.4)} | drive ${rnum(rng, 0.4, 0.55)} | duck 0.35 | gain ${rnum(rng, 0.56, 0.62)} | every 4 rev -- el estribillo`,
  });
  const percPan = span(rng, 0.3, 0.45);
  lanes.push({
    tier: 3,
    line: `${pick(rng, ["mt ~ ~ mt ~ ~ mt ~ ~ ~", "rm(5,12)", "mt ~ ~ ~ ~ mt ~"])} | drive 0.45 | pan ${percPan} | gain ${rnum(rng, 0.4, 0.46)} -- percusión rodando`,
  });
  if (chance(rng, 0.5)) {
    lanes.push({
      tier: 3,
      line: `<0 1> ~ ~ ~ ~ ~ ~ ~ | synth pad | scale frigia | slow 4 | lpf ${rint(rng, 400, 700)} | drive 0.25 | duck 0.5 | gain ${rnum(rng, 0.4, 0.46)} -- niebla de polígono`,
    });
  }
  return bpm;
}

/** an 8-step acid chorus: root insistent, one or two neighbours */
function riff_(rng: Rng): string {
  return riff(rng, pick(rng, ["R^ ~ R X ~ R _ <X Y>", "R^ R ~ X _ ~ R <Y ~>", "R ~ X^ ~ R _ <X Y> R"]), 0, [1, 3, -2, 5]);
}

/** ÓXIDO — hard, dry, UK-leaning techno in seven lineages. */
function oxido(rng: Rng): Sketch {
  const lanes: Lane[] = [];
  const roll = rng();
  const bpm =
    roll < 0.2
      ? oxidoRodillo(rng, lanes)
      : roll < 0.35
        ? oxidoHondo(rng, lanes)
        : roll < 0.5
          ? oxidoFundicion(rng, lanes)
          : roll < 0.65
            ? oxidoTribal(rng, lanes)
            : roll < 0.75
              ? oxidoMetalico(rng, lanes)
              : roll < 0.85
                ? oxidoEje(rng, lanes)
                : oxidoPoligono(rng, lanes);

  // structural guarantee: no dead loops — if every layer came out static,
  // the second lane carries the evolution
  if (!lanes.some((lane) => /[<?]|every/.test(lane.line))) {
    lanes[1].line = lanes[1].line.replace(" -- ", " | every 4 rev -- ");
  }
  return { bpm, lanes };
}

/** CASA — warm four-on-floor; ONE shuffle locks every layer together. */
function casa(rng: Rng): Sketch {
  const bpm = rint(rng, 122, 126);
  const groove = rnum(rng, 0.25, 0.4); // the shuffle, shared by ALL swung lanes
  const kit = pick(rng, ["909", "909", "linn"]); // one kit for the whole kitchen
  const scale = chance(rng, 0.75) ? "mayor" : "menor"; // some evenings are wistful
  const lanes: Lane[] = [];

  lanes.push({
    tier: 1,
    line: `bd${chance(rng, 0.3) ? `:${rint(rng, 0, 3)}` : ""} ~ bd ~ bd ~ ${chance(rng, 0.2) ? "<bd [bd bd]>" : "bd"} ~ | kit ${kit} | sub ${rnum(rng, 0.2, 0.3)} | gain 0.9 -- bombo constante`,
  });
  const hoPat = pick(rng, ["~ ho ~ ho", "~ [~ ho] ~ ho", "~ ho ~ ho?"]);
  lanes.push({
    tier: 1,
    line: `${hoPat} | kit ${kit} | swing ${groove} | gain ${rnum(rng, 0.36, 0.45)} -- hat abierto a contratiempo`,
  });
  const clap = pick(rng, ["~ ~ cp ~", "~ ~ cp ~ ~ ~ [cp cp?] ~", "~ ~ cp ~ ~ ~ <cp [cp cp]> ~"]);
  lanes.push({
    tier: 2,
    line: `${clap} | kit ${kit} | swing ${groove} | reverb ${rnum(rng, 0.25, 0.35)} | gain 0.5 -- palmada`,
  });

  // texture slot: hats OR a colour percussion rolling against the grid
  const texture = rng();
  if (texture < 0.35) {
    lanes.push({
      tier: 3,
      line: `hh hh hh hh | kit ${kit} | fast 2 | swing ${groove} | gain ${rnum(rng, 0.22, 0.28)} -- hats`,
    });
  } else if (texture < 0.65) {
    lanes.push({
      tier: 3,
      line: `hh hh? hh hh${chance(rng, 0.5) ? "?" : ""} | kit ${kit} | swing ${groove} | gain ${rnum(rng, 0.3, 0.38)} -- hats`,
    });
  } else {
    const colour = pick(rng, ["rm(3,8)", "mt(5,16)", "~ ~ mt"]);
    lanes.push({
      tier: 3,
      line: `${colour} | kit ${kit} | swing ${groove} | pan ${span(rng, 0.2, 0.4)} | gain ${rnum(rng, 0.24, 0.3)} -- percusión de color`,
    });
  }

  // bass BANK: three mutually exclusive characters, not one mould
  const bassTemplates = [
    "R ~ [~ X] ~ Y ~ <X 9> ~",
    "R ~ [~ R] X ~ <Y 9> ~ ~",
    "R ~ X [~ X] ~ Y ~ <9 11>",
    "R [~ R] ~ X ~ [~ Y] ~ <X 2>",
  ];
  const root = pick(rng, [0, 0, 3]);
  const bassKind = rng();
  const bassSoft = chance(rng, 0.6) ? ` | lpf ${rint(rng, 380, 650)}` : ""; // round it off
  let bass: string;
  let bassName: string;
  if (bassKind < 0.5) {
    bass = riff(rng, pick(rng, bassTemplates), root, [4, 7, root + 4]);
    bassName = "bajo saltarín";
  } else if (bassKind < 0.75) {
    bass = `~ ${root} ~ ${root} ~ ${root} ~ <${root + 7} ${root + pick(rng, [4, 5])}>`;
    bassName = "bajo a contratiempo";
  } else {
    bass = `${root} [~ ${root + 7}] ~ ${root} [~ ${root + 7}] ~ <${root + pick(rng, [4, 5])} ${root + 7}> ~`;
    bassName = "bajo en octavas";
  }
  lanes.push({
    // some intros open kick+bass — the house classic
    tier: chance(rng, 0.4) ? 1 : 2,
    line: `${bass} | synth bass | scale ${scale}${bassSoft} | swing ${groove} | duck ${rnum(rng, 0.3, 0.45)} | gain ${rnum(rng, 0.65, 0.72)} -- ${bassName}`,
  });

  const prog = pick(rng, [
    [7, 9, 11, 9],
    [9, 7, 12, 11],
    [7, 11, 9, 14],
  ]);
  if (chance(rng, 0.3)) {
    // STAB block: the house chord — rhythmic, percussive, on the offbeats
    const stabMask = pick(rng, ["~ [~ D] ~ ~ ~ [~ D] ~ ~", "~ ~ [~ D] ~ ~ [D ~] ~ ~"]);
    const stabLpf = rint(rng, 2000, 3000);
    const stabRev = rnum(rng, 0.2, 0.3);
    const d0 = pick(rng, [0, 2]);
    lanes.push({
      tier: 2,
      line: `${stabMask.replaceAll("D", String(d0))} | synth pad | scale ${scale} | lpf ${stabLpf} | reverb ${stabRev} | swing ${groove} | gain ${rnum(rng, 0.42, 0.48)} -- stab: la base`,
    });
    lanes.push({
      tier: 3,
      line: `${stabMask.replaceAll("D", String(d0 + 2))} | synth pad | scale ${scale} | lpf ${stabLpf} | reverb ${stabRev} | swing ${groove} | pan ${span(rng, 0.2, 0.35)} | gain ${rnum(rng, 0.32, 0.38)} -- stab: la tercera`,
    });
  } else {
    // sparkles with a real 4-position contour — and a silhouette of their own
    const sparkleDelay = rnum(rng, 0.45, 0.55);
    const sparklePan = span(rng, 0.2, 0.4);
    const sparkleProg = prog
      .map((d, i) => (i === 3 && chance(rng, 0.5) ? `<${d} ${d + 2}>` : String(d)))
      .join(" ");
    const echo = `<${pick(rng, [11, 12, 14])} ~>`;
    const mask = pick(rng, ["~ P ~ ~ E ~ ~ ~", "~ ~ P ~ ~ ~ E ~", "P ~ ~ ~ E ~ ~ ~ ~"]);
    lanes.push({
      tier: 3,
      line: `${mask.replace("P", `<${sparkleProg}>`).replace("E", echo)} | synth piano | scale ${scale} | delay ${sparkleDelay} | pan ${sparklePan} | gain ${rnum(rng, 0.4, 0.48)}${chance(rng, 0.25) ? " | every 8 rev" : ""} -- pianito con eco`,
    });
    // …and half the time a parallel third answers from the other side
    if (chance(rng, 0.5)) {
      lanes.push({
        tier: 3,
        line: `~ <${prog.map((d) => d + 2).join(" ")}> ~ ~ ~ ~ ~ ~ | synth piano | scale ${scale} | delay ${sparkleDelay} | pan ${-sparklePan} | gain ${rnum(rng, 0.3, 0.36)} -- la tercera responde`,
      });
    }
  }

  return { bpm, lanes };
}

/** NIEBLA, the first four archetypes — coral, destello, latido, marea. */
function nieblaClasica(rng: Rng): Sketch {
  const bpm = rint(rng, 60, 74);
  const scale = pick(rng, ["menor", "penta", "mayor"]);
  const rev = rnum(rng, 0.6, 0.72);
  const size = rnum(rng, 0.6, 0.85);
  const lanes: Lane[] = [];

  // the seed first decides WHAT KIND of ambient piece this is
  const archetype = pick(rng, ["coral", "destello", "latido", "marea"] as const);

  // The floor FAMILY — what the piece stands on. Every track opening with
  // the same pad-drone shape was the tell that unmasked the channel, so the
  // seed now picks the floor's nature, not only its decimals. Base-step
  // periods stay disjoint from each archetype's upper voices: pads = 24|32,
  // sub = 12, media altura = 32, aliento = 10.
  const floorLane = (opts: { shy?: boolean; noBreath?: boolean } = {}) => {
    const soft = opts.shy ? -0.12 : 0;
    const kinds = opts.noBreath
      ? ["grave", "respira", "sub", "medio"]
      : ["grave", "respira", "sub", "medio", "aliento"];
    const kind = pick(rng, kinds);
    const r = pick(rng, [-3, -5, -7, -10, -12]);
    if (kind === "grave") {
      lanes.push({
        tier: 1,
        line: `<${r} ${r + pick(rng, [2, -2, 3, -5])}> ${"~ ".repeat(pick(rng, [2, 3])).trim()} | synth pad | scale ${scale} | slow 8 | lpf ${rint(rng, 400, 700)} | reverb ${rev} | size ${size} | gain ${rnum(rng, 0.5 + soft, 0.6 + soft)} -- suelo grave`,
      });
    } else if (kind === "respira") {
      lanes.push({
        tier: 1,
        line: `<${r} ${r + 2} ${r - 2} ${r + 4}> ~ ~ | synth pad | scale ${scale} | slow 8 | lpf ${rint(rng, 400, 650)} | reverb ${rev} | size ${size} | gain ${rnum(rng, 0.46 + soft, 0.56 + soft)} -- suelo que respira`,
      });
    } else if (kind === "sub") {
      lanes.push({
        tier: 1,
        line: `${r} ~ ~ | synth bass | scale ${scale} | slow 4 | lpf ${rint(rng, 200, 320)} | gain ${rnum(rng, 0.55 + soft, 0.62 + soft)} -- suelo de sub`,
      });
    } else if (kind === "medio") {
      lanes.push({
        tier: 1,
        line: `<${r + 7} ${r + 5}> ~ ~ ~ | synth pad | scale ${scale} | slow 8 | lpf ${rint(rng, 500, 800)} | reverb ${rev} | size ${size} | gain ${rnum(rng, 0.4 + soft, 0.48 + soft)} -- suelo a media altura`,
      });
    } else {
      lanes.push({
        tier: 1,
        line: `ho ~ ~ ~ ~ | slow 2 | lpf ${rint(rng, 280, 420)} | reverb ${rev} | size ${size} | gain ${rnum(rng, 0.24, 0.3)} -- lecho de aliento`,
      });
    }
  };

  if (archetype === "coral") {
    // three pad voices, unequal lengths — a chordal cloud, no melody at all
    floorLane();
    const prog = pick(rng, [[0, 3, 5, 2], [0, 4, 2, 5], [0, 2, -2, 3]]);
    const progStr = prog
      .map((d, i) => (i === 2 && chance(rng, 0.5) ? `<${d} ${d + 2}>` : String(d)))
      .join(" ");
    // mid period 16 | 40 — can never equal low (24|32) or high (20|28)
    const [midSlow, midRests] = pick(rng, [[4, 3], [8, 4]] as [number, number][]);
    lanes.push({
      tier: 1,
      line: `<${progStr}> ${"~ ".repeat(midRests).trim()} | synth pad | scale ${scale} | slow ${midSlow} | delay ${rnum(rng, 0.3, 0.45)} | reverb ${rev} | size ${size} | gain ${rnum(rng, 0.42, 0.5)} -- bruma media`,
    });
    lanes.push({
      tier: 2,
      line: `${offsetLane(`<${pick(rng, [7, 9])} ${pick(rng, [11, 12])}>${chance(rng, 0.35) ? "?" : ""}`, rint(rng, 1, 3), pick(rng, [5, 7]))} | synth pad | scale ${scale} | slow 4 | reverb ${rev} | size ${size} | pan ${span(rng, 0.25, 0.5)} | gain ${rnum(rng, 0.3, 0.38)} -- bruma alta, desplazada`,
    });
    if (chance(rng, 0.4)) {
      lanes.push({
        tier: 3,
        line: `bd ${"~ ".repeat(7).trim()} | lpf ${rint(rng, 200, 280)} | reverb 0.4 | gain ${rnum(rng, 0.4, 0.48)} -- latido enterrado`,
      });
    }
  } else if (archetype === "destello") {
    // melody-led: the melody IS the intro; the floor is optional and shy
    if (chance(rng, 0.6)) floorLane({ shy: true });
    const melodies = [
      "7 ~ 9 ~ <12 11> ~ ~ 7 ~ <5 9> ~ ~",
      "<9 7> ~ 12 ~ ~ <11 13> ~ 9 ~ ~ 7 ~",
      "7 ~ ~ 9 <12 ~> ~ 11 ~ ~ <9 14> ~ ~",
    ];
    const melDelay = rnum(rng, 0.45, 0.55);
    lanes.push({
      tier: 1,
      line: `${pick(rng, melodies)} | synth piano | scale ${scale} | delay ${melDelay} | reverb ${rnum(rng, 0.4, 0.5)} | gain ${rnum(rng, 0.44, 0.5)}${chance(rng, 0.4) ? " | every 8 rev" : ""} -- melodía`,
    });
    lanes.push({
      tier: 2,
      line: `~ ~ ~ ~ ~ <7 ~> ~ ~ ~ ~ ~ | synth piano | scale ${scale} | delay ${melDelay} | pan ${span(rng, 0.3, 0.5)} | gain ${rnum(rng, 0.26, 0.32)} -- eco al otro lado`,
    });
  } else if (archetype === "latido") {
    // the floor is a slow BASS pulse, not the same pad drone as everyone else
    lanes.push({
      tier: 1,
      line: `${pick(rng, [-5, -7, -10, -12])} ${"~ ".repeat(pick(rng, [2, 4])).trim()} | synth bass | scale ${scale} | slow 2 | lpf ${rint(rng, 250, 350)} | gain ${rnum(rng, 0.55, 0.62)} -- pulso grave`,
    });
    const prog = pick(rng, [[0, 3, 5, 2], [0, 2, -2, 3]]);
    const progStr = prog
      .map((d, i) => (i === 1 && chance(rng, 0.5) ? `<${d} ${d - 2}>` : String(d)))
      .join(" ");
    lanes.push({
      tier: 1,
      line: `${offsetLane(`<${progStr}>`, rint(rng, 1, 2), pick(rng, [5, 6]))} | synth pad | scale ${scale} | slow 4 | delay ${rnum(rng, 0.3, 0.5)} | reverb ${rev} | size ${size} | gain ${rnum(rng, 0.45, 0.55)} -- bruma, desplazada`,
    });
    lanes.push({
      tier: 2,
      line: `${pick(rng, ["7 ~ ~ ~ <9 13> ~ ~ 12? ~", "<7 9> ~ ~ ~ ~ 12 ~ ~ ~"])} | synth piano | scale ${scale} | delay ${rnum(rng, 0.5, 0.6)} | reverb ${rnum(rng, 0.4, 0.5)} | gain ${rnum(rng, 0.4, 0.48)} -- destellos`,
    });
    lanes.push({
      tier: 2,
      line: `bd ${"~ ".repeat(7).trim()} | lpf ${rint(rng, 200, 300)} | reverb ${rnum(rng, 0.3, 0.4)} | gain ${rnum(rng, 0.45, 0.55)} -- latido enterrado`,
    });
  } else {
    // marea: interleaved swells over uneven distant ticks.
    // Periods measured in BASE steps must never coincide: suelo = 24|40,
    // bruma = len×4 (20|28) — no combination collides, so the voices
    // drift forever instead of hitting together.
    if (chance(rng, 0.5)) {
      floorLane({ noBreath: true }); // marea already has its own breath lane
    } else {
      lanes.push({
        tier: 1,
        line: `<-7 -5> ~ <-9 ${pick(rng, ["-7", "-12"])}> ~ ~ | synth pad | scale ${scale} | slow 8 | lpf ${rint(rng, 400, 700)} | reverb ${rev} | size ${size} | gain ${rnum(rng, 0.48, 0.56)} -- suelo que camina`,
      });
    }
    const chord = `<0 <${pick(rng, [2, 4])} ${pick(rng, [5, 7])}>>`;
    lanes.push({
      tier: 1,
      line: `${offsetLane(chord, rint(rng, 1, 2), pick(rng, [5, 7]))} | synth pad | scale ${scale} | slow 4 | delay ${rnum(rng, 0.35, 0.5)} | reverb ${rev} | size ${size} | gain ${rnum(rng, 0.42, 0.5)} -- bruma, desplazada`,
    });
    const hoPan = span(rng, 0.25, 0.5);
    lanes.push({
      tier: 2,
      line: `${offsetLane("ho", rint(rng, 0, 2), pick(rng, [5, 7]))} | lpf ${rint(rng, 400, 600)} | pan ${hoPan} | gain 0.2 -- aliento`,
    });
    const [gk, gn] = pick(rng, [[3, 16], [2, 13], [3, 14]] as [number, number][]);
    lanes.push({
      tier: 3,
      line: `rm(${gk},${gn}) | lpf ${rint(rng, 700, 1000)} | delay ${rnum(rng, 0.4, 0.55)} | pan ${(-Math.sign(hoPan) * rnum(rng, 0.2, 0.4)).toFixed(2)} | gain ${rnum(rng, 0.16, 0.22)} -- gotas irregulares, al otro lado`,
    });
  }

  return { bpm, lanes };
}

// ----------------------------------------------------------------- NIEBLA
//
// Eight more archetypes, each distilled from one ambient lineage (kitchen
// notes in PLAN-FM.md). Eno's two laws run through all of them: per lane,
// silence at least twice the sound; and loop periods that never line up
// (28/36/44/52, 64/72/80…), so the full coincidence takes minutes.
// Variation comes from `?` and `<>` and the drift, never from new chords.

/** a lane with one voice at `at` of a `length` loop (the Airports tape) */
const tape = (token: string, length: number, at: number) => slots(token, length, [at]);

function nieblaAeropuertos(rng: Rng, lanes: Lane[]): number {
  // Eno 2/1: single sung notes on tape loops of incommensurable length.
  const bpm = rint(rng, 60, 66);
  const scale = pick(rng, ["mayor", "lidia", "mayor"]);
  const degrees = [0, 2, 4, 5, 7, 9, 11].sort(() => rng() - 0.5);
  const rev = rnum(rng, 0.7, 0.82);
  const lengths = [7, 9, 11, 13];
  lengths.forEach((length, i) => {
    // one tape carries two notes (the record's "most dissonant" neighbour)
    const voice =
      i === 1 ? `<${degrees[i]} ${degrees[i] + pick(rng, [-1, 2, 1])}>` : String(degrees[i]);
    const synth = i === 3 ? "piano" : "pad";
    lanes.push({
      tier: i < 2 ? 1 : i === 2 ? 2 : 3,
      line: `${tape(voice, length, rint(rng, 0, length - 1))} | synth ${synth} | scale ${scale} | slow 4 | lpf ${rint(rng, 2000, 4000)} | delay ${rnum(rng, 0.3, 0.4)} | reverb ${rev} | size 0.8 | pan ${span(rng, 0.2, 0.5)} | gain ${rnum(rng, 0.36, 0.46)} -- cinta ${length}`,
    });
  });
  lanes.push({
    tier: 1,
    line: `0 ~ ~ ~ ~ ~ ~ ~ | synth bass | scale ${scale} | slow 8 | lpf ${rint(rng, 160, 240)} | gain ${rnum(rng, 0.42, 0.5)} -- suelo pedal`,
  });
  return bpm;
}

function nieblaCoro(rng: Rng, lanes: Lane[]): number {
  // The Lid: a two-chord chorale that leans major to minor and back, no
  // melody, no drums — only swells.
  const bpm = rint(rng, 60, 70);
  const rev = rnum(rng, 0.85, 0.95);
  const lpf = rint(rng, 1500, 3000);
  const voices = pick(rng, [
    ["<0 -3>", "<4 2>", "7"],
    ["<0 -2>", "<4 5>", "<7 9>"],
    ["<-3 0>", "2", "<7 4>"],
  ]);
  const lengths = [8, 9, 10];
  voices.forEach((voice, i) => {
    lanes.push({
      tier: i < 2 ? 1 : 2,
      line: `${tape(voice, lengths[i], i === 0 ? 0 : rint(rng, 1, 4))} | synth pad | scale mayor | slow 8 | lpf ${lpf + i * 300} | reverb ${rev} | size 0.95 | pan ${i === 0 ? 0 : span(rng, 0.25, 0.45)} | gain ${rnum(rng, 0.42, 0.5) - i * 0.05} -- ${i === 0 ? "suelo coral" : i === 1 ? "voz media" : "voz alta"}`,
    });
  });
  if (chance(rng, 0.6)) {
    lanes.push({
      tier: 3,
      line: `~ ~ ${pick(rng, ["11", "<11 9>", "12?"])} ~ ~ | synth piano | scale mayor | slow 6 | delay 0.2 | reverb ${rnum(rng, 0.6, 0.7)} | pan ${span(rng, 0.3, 0.5)} | gain ${rnum(rng, 0.26, 0.32)} -- piano al fondo`,
    });
  }
  return bpm;
}

function nieblaCristal(rng: Rng, lanes: Lane[]): number {
  // Kankyō ongaku: bright pentatonic clusters with plenty of air, echoes
  // crossing the stereo field, never louder than a conversation.
  const bpm = rint(rng, 66, 75);
  const delay = rnum(rng, 0.45, 0.6);
  const pan = span(rng, 0.3, 0.5);
  lanes.push({
    tier: 1,
    line: `${pick(rng, ["7 ~ 9 ~ ~ 11? ~", "9 ~ ~ 7 ~ <11 14> ~", "7 ~ ~ <9 11> ~ ~ 14? ~ ~"])} | synth piano | scale penta | slow 2 | delay ${delay} | reverb ${rnum(rng, 0.4, 0.55)} | pan ${pan} | gain ${rnum(rng, 0.42, 0.48)} -- cristal`,
  });
  lanes.push({
    tier: 2,
    line: `${pick(rng, ["~ ~ 4 ~ ~ ~ 2? ~ ~", "2 ~ ~ ~ ~ <4 0> ~ ~ ~ ~ ~ ~", "~ ~ ~ 0 ~ ~ ~ ~ 4? ~ ~ ~"])} | synth piano | scale penta | slow 3 | delay ${delay} | reverb ${rnum(rng, 0.4, 0.55)} | pan ${(-pan).toFixed(2)} | gain ${rnum(rng, 0.34, 0.4)} -- eco cruzado`,
  });
  if (chance(rng, 0.4)) {
    lanes.push({
      tier: 1,
      line: `-7 ~ ~ ~ | synth bass | scale penta | slow 8 | lpf ${rint(rng, 200, 280)} | gain ${rnum(rng, 0.38, 0.44)} -- suelo de agua`,
    });
  }
  if (chance(rng, 0.5)) {
    lanes.push({
      tier: 3,
      line: `${tape("rm?", pick(rng, [5, 7]), rint(rng, 0, 4))} | slow 2 | lpf ${rint(rng, 2000, 4000)} | delay ${delay} | reverb 0.5 | pan ${span(rng, 0.2, 0.4)} | gain ${rnum(rng, 0.1, 0.14)} -- gota`,
    });
  }
  return bpm;
}

function nieblaEnterrado(rng: Rng, lanes: Lane[]): number {
  // Pop-ambient: a very far away bass drum walking through endlessness
  // under two minor pads and a hiss.
  const bpm = rint(rng, 118, 126);
  const rev = rnum(rng, 0.85, 0.92);
  lanes.push({
    tier: 1,
    line: `${KICK_4x4} | lpf ${rint(rng, 200, 350)} | sub 0.3 | reverb 0.3 | size 0.7 | gain ${rnum(rng, 0.4, 0.48)} -- latido enterrado`,
  });
  lanes.push({
    tier: 1,
    line: `<0 -2> ~ ~ ~ ~ ~ ~ ~ | synth pad | scale menor | slow 8 | lpf ${rint(rng, 800, 1500)} | reverb ${rev} | size 0.9 | gain ${rnum(rng, 0.46, 0.54)} -- bruma de bosque`,
  });
  lanes.push({
    tier: 2,
    line: `${tape(pick(rng, ["<-5 -7>", "<2 -5>", "-3"]), 12, rint(rng, 1, 5))} | synth pad | scale menor | slow 8 | lpf ${rint(rng, 600, 1100)} | reverb ${rev} | size 0.9 | pan ${span(rng, 0.25, 0.45)} | gain ${rnum(rng, 0.36, 0.44)} -- bruma, más lejos`,
  });
  lanes.push({
    tier: 2,
    line: `-12 ~ ~ ~ ~ ~ ~ ~ | synth bass | scale menor | slow 8 | lpf ${rint(rng, 140, 200)} | gain ${rnum(rng, 0.46, 0.54)} -- suelo de bosque`,
  });
  if (chance(rng, 0.6)) {
    lanes.push({
      tier: 3,
      line: `hh? ~ ~ ~ hh? ~ ~ ~ | lpf ${rint(rng, 800, 1200)} | gain ${rnum(rng, 0.08, 0.12)} -- siseo`,
    });
  }
  return bpm;
}

function nieblaCinta(rng: Rng, lanes: Lane[]): number {
  // The disintegration loop: a worn phrase with dropouts, an unsynced
  // countermelody, the hiss of the tape.
  const bpm = rint(rng, 60, 72);
  const scale = pick(rng, ["menor", "dorica"]);
  lanes.push({
    tier: 1,
    line: `${pick(rng, ["0 ~ 3 ~ ~ 5? ~ 7", "7 ~ ~ 5 ~ 3? ~ ~", "0 ~ ~ 7 ~ <5 3> ~ 3?"])} | synth piano | scale ${scale} | slow 4 | lpf ${rint(rng, 800, 2000)} | delay ${rnum(rng, 0.45, 0.55)} | reverb ${rnum(rng, 0.75, 0.85)} | size 0.75 | gain ${rnum(rng, 0.42, 0.5)} -- la frase, gastada`,
  });
  lanes.push({
    tier: 2,
    line: `${tape(pick(rng, ["<7 5>", "<5 3>", "<7 10>"]), 5, rint(rng, 0, 4))} | synth pad | scale ${scale} | slow 3 | lpf ${rint(rng, 600, 1000)} | reverb ${rnum(rng, 0.75, 0.85)} | size 0.75 | pan ${span(rng, 0.3, 0.5)} | gain ${rnum(rng, 0.3, 0.38)} -- contramelodía sin sincronizar`,
  });
  lanes.push({
    tier: 1,
    line: `-7 ~ ~ ~ | synth bass | scale ${scale} | slow 8 | lpf ${rint(rng, 180, 240)} | gain ${rnum(rng, 0.44, 0.5)} -- suelo de cinta`,
  });
  lanes.push({
    tier: 3,
    line: `${tape("hh?", 9, rint(rng, 0, 8))} | lpf ${rint(rng, 1200, 1800)} | gain ${rnum(rng, 0.08, 0.12)} -- siseo de cinta`,
  });
  return bpm;
}

function nieblaSecuencia(rng: Rng, lanes: Lane[]): number {
  // Kosmische / Colundi: one slow sequencer pattern, transposed by the
  // alternation, revolving like wind chimes over a drone.
  const bpm = rint(rng, 100, 116);
  const scale = pick(rng, ["penta", "menor", "lidia"]);
  const seq = pick(rng, [
    "0 ~ ~ 7 ~ ~ 12 ~ ~ 3 ~ ~ 10 ~ ~ ~",
    "<0 -2> ~ ~ 7 ~ ~ ~ 12 ~ ~ 9 ~ ~ 7 ~ ~",
    "0 ~ ~ ~ 7 ~ ~ 12 ~ ~ ~ <14 9> ~ ~ 7 ~",
  ]);
  lanes.push({
    tier: 1,
    line: `${seq} | synth bass | scale ${scale} | lpf ${rint(rng, 400, 900)} | delay ${rnum(rng, 0.45, 0.55)} | gain ${rnum(rng, 0.48, 0.56)}${chance(rng, 0.6) ? " | every 4 rev" : ""} -- la secuencia`,
  });
  lanes.push({
    tier: 1,
    line: `<-7 -5> ~ ~ ~ ~ ~ ~ ~ | synth pad | scale ${scale} | slow 8 | lpf ${rint(rng, 350, 600)} | reverb ${rnum(rng, 0.65, 0.75)} | size 0.7 | gain ${rnum(rng, 0.44, 0.52)} -- suelo de secuencia`,
  });
  lanes.push({
    tier: 2,
    line: `${tape(pick(rng, ["14", "<12 14>", "16?"]), 9, rint(rng, 0, 8))} | synth piano | scale ${scale} | slow 2 | delay ${rnum(rng, 0.5, 0.6)} | reverb 0.5 | pan ${span(rng, 0.3, 0.5)} | gain ${rnum(rng, 0.28, 0.34)} -- campanilla`,
  });
  if (chance(rng, 0.5)) {
    lanes.push({
      tier: 3,
      line: `${tape("bd", 16, 0)} | lpf ${rint(rng, 180, 260)} | reverb 0.4 | gain ${rnum(rng, 0.32, 0.38)} -- pulso lejano`,
    });
  }
  return bpm;
}

function nieblaGlaciar(rng: Rng, lanes: Lane[]): number {
  // Arctic: a sub that never moves, a pad rubbing against its flat second
  // with a little grit, wind, and the crack of ice once in a while.
  const bpm = rint(rng, 60, 66);
  const rev = rnum(rng, 0.9, 0.95);
  lanes.push({
    tier: 1,
    line: `-12 ~ ~ ~ ~ ~ ~ ~ | synth bass | scale frigia | slow 8 | lpf ${rint(rng, 150, 250)} | gain ${rnum(rng, 0.5, 0.56)} -- suelo glaciar`,
  });
  lanes.push({
    tier: 1,
    line: `${tape(pick(rng, ["<0 1>", "<0 -1>", "<1 0>"]), 9, rint(rng, 0, 3))} | synth pad | scale frigia | slow 8 | lpf ${rint(rng, 300, 900)} | reverb ${rev} | size 0.95 | drive ${rnum(rng, 0.15, 0.25)} | gain ${rnum(rng, 0.42, 0.5)} -- el roce`,
  });
  lanes.push({
    tier: 2,
    line: `${tape(pick(rng, ["<7 ~>", "7?", "<7 6>"]), 11, rint(rng, 2, 8))} | synth pad | scale frigia | slow 8 | lpf ${rint(rng, 500, 1200)} | reverb ${rev} | size 0.95 | pan ${span(rng, 0.3, 0.5)} | gain ${rnum(rng, 0.3, 0.38)} -- luz lejana`,
  });
  lanes.push({
    tier: 2,
    line: `ho ~ ~ ~ ~ ~ ~ | slow 2 | lpf ${rint(rng, 250, 400)} | reverb ${rev} | size 0.95 | pan ${span(rng, 0.2, 0.4)} | gain ${rnum(rng, 0.16, 0.22)} -- viento`,
  });
  lanes.push({
    tier: 3,
    line: `${tape(pick(rng, ["rm?", "cb?"]), 16, rint(rng, 4, 15))} | lpf ${rint(rng, 1000, 1500)} | delay ${rnum(rng, 0.6, 0.7)} | reverb 0.7 | gain ${rnum(rng, 0.12, 0.16)} -- crujido de hielo`,
  });
  return bpm;
}

function nieblaDub(rng: Rng, lanes: Lane[]): number {
  // Dub-ambient: one drowned chord in long delay, a slow heartbeat, a
  // distant note — the healer's room.
  const bpm = rint(rng, 100, 118);
  const scale = pick(rng, ["menor", "dorica", "dorica"]);
  const delay = rnum(rng, 0.6, 0.8);
  lanes.push({
    tier: 1,
    line: `bd ~ ~ ~ bd ~ ~ ~ | lpf ${rint(rng, 220, 300)} | sub 0.35 | reverb 0.3 | size 0.7 | gain ${rnum(rng, 0.4, 0.46)} -- latido dub`,
  });
  lanes.push({
    tier: 1,
    line: `${tape(pick(rng, ["<0 2>", "<0 -2>", "0"]), 6, rint(rng, 1, 3))} | synth pad | scale ${scale} | slow 2 | lpf ${rint(rng, 800, 1500)} | delay ${delay} | reverb ${rnum(rng, 0.65, 0.75)} | size 0.85 | pan ${span(rng, 0.25, 0.4)} | gain ${rnum(rng, 0.42, 0.5)}${chance(rng, 0.5) ? " | every 2 rev" : ""} -- acorde ahogado`,
  });
  lanes.push({
    tier: 1,
    line: `<0 -5> ~ ~ ~ ~ ~ ~ ~ | synth bass | scale ${scale} | slow 2 | lpf ${rint(rng, 180, 240)} | gain ${rnum(rng, 0.48, 0.56)} -- suelo dub`,
  });
  lanes.push({
    tier: 2,
    line: `${tape(pick(rng, ["7", "<7 9>", "12?"]), 9, rint(rng, 2, 8))} | synth piano | scale ${scale} | slow 4 | delay ${delay} | reverb 0.6 | pan ${span(rng, 0.3, 0.5)} | gain ${rnum(rng, 0.3, 0.36)} -- nota lejana`,
  });
  if (chance(rng, 0.6)) {
    lanes.push({
      tier: 3,
      line: `~ hh? ~ hh? ~ hh? ~ hh? | lpf ${rint(rng, 1200, 1800)} | gain ${rnum(rng, 0.1, 0.14)} -- siseo`,
    });
  }
  return bpm;
}

/** NIEBLA — twelve ambient archetypes so no two hours sound the same. */
function niebla(rng: Rng): Sketch {
  const roll = rng();
  if (roll < 0.32) return nieblaClasica(rng);
  const lanes: Lane[] = [];
  const bpm =
    roll < 0.41
      ? nieblaAeropuertos(rng, lanes)
      : roll < 0.5
        ? nieblaCoro(rng, lanes)
        : roll < 0.59
          ? nieblaCristal(rng, lanes)
          : roll < 0.67
            ? nieblaEnterrado(rng, lanes)
            : roll < 0.76
              ? nieblaCinta(rng, lanes)
              : roll < 0.84
                ? nieblaSecuencia(rng, lanes)
                : roll < 0.92
                  ? nieblaGlaciar(rng, lanes)
                  : nieblaDub(rng, lanes);
  return { bpm, lanes };
}

const GRAMMARS: Record<StyleName, (rng: Rng) => Sketch> = { motor, oxido, casa, niebla };

// ------------------------------------------------------------------ compose

export function compose(style: StyleName, seed: number): Track {
  const rng = mulberry32(seed * 2654435761 + style.length);
  const sketch = GRAMMARS[style](rng);

  const byTier = (max: number) =>
    sketch.lanes
      .filter((lane) => lane.tier <= max)
      .map((lane) => lane.line)
      .join("\n");

  const states = [byTier(1), byTier(2), byTier(3)].filter(
    (state, i, all) => i === 0 || state !== all[i - 1]
  );

  return {
    style,
    title: `${pick(rng, TITLES[style])} #${(seed % 900) + 100}`,
    bpm: sketch.bpm,
    states,
    code: states[states.length - 1],
  };
}
