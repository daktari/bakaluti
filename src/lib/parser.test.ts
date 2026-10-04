import { describe, expect, it } from "vitest";
import { collectPianoMidis, collectSampleKeys, degreeToMidi, parsePattern, SCALES } from "./parser";

const steps = (code: string) =>
  parsePattern(code).lanes[0].steps.map((s) => (s.kind === "hit" ? s.id : s.kind));

describe("mini-notation", () => {
  it("parses plain tokens and rests", () => {
    expect(steps("bd ~ sn ~")).toEqual(["bd", "rest", "sn", "rest"]);
  });

  it("parses groups, alternation, repetition and probability", () => {
    const { lanes, warnings } = parsePattern("[bd hh]*2 <sn cp>? hh*2");
    expect(warnings).toEqual([]);
    expect(lanes[0].steps.map((s) => s.kind)).toEqual(["group", "prob", "group"]);
  });

  it("expands euclidean rhythms to the classic tresillo", () => {
    expect(steps("bd(3,8)")).toEqual([
      "bd", "rest", "rest", "bd", "rest", "rest", "bd", "rest",
    ]);
  });

  it("accepts Strudel aliases (sd, oh, rim)", () => {
    expect(steps("sd oh rim")).toEqual(["sn", "ho", "rm"]);
  });

  it("parses voice tokens v1..v8 and rejects v9", () => {
    expect(steps("v1 v8")).toEqual(["v1", "v8"]);
    expect(parsePattern("v9").warnings).toHaveLength(1);
  });

  it("tracks source locations, also on later lines", () => {
    const { lanes } = parsePattern("-- x\nbd ~ sn ~");
    const first = lanes[0].steps[0];
    expect(first.kind === "hit" && first.loc).toEqual([5, 7]);
  });

  it("warns on unknown tokens without crashing", () => {
    const { lanes, warnings } = parsePattern("bd xx sn");
    expect(warnings).toHaveLength(1);
    expect(lanes[0].steps).toHaveLength(2);
  });

  it("recovers from unclosed brackets", () => {
    const { lanes, warnings } = parsePattern("bd [sn ~");
    expect(warnings).toHaveLength(1);
    expect(lanes[0].steps[1].kind).toBe("group");
  });
});

describe("inline comments", () => {
  it("ignores everything after --", () => {
    const { lanes, warnings } = parsePattern("bd ~ sn ~ | kit 808 -- el bombo");
    expect(warnings).toEqual([]);
    expect(lanes[0].kit).toBe("808");
  });

  it("still skips full-line comments", () => {
    expect(parsePattern("-- solo un comentario").lanes).toHaveLength(0);
  });
});

describe("pipe commands", () => {
  it("parses fx, speed, swing and drive with clamping", () => {
    const lane = parsePattern(
      "bd ~ | fast 2 | swing 0.3 | drive 0.6 | lpf 800 | pan 99 | gain 0.5"
    ).lanes[0];
    expect(lane.speed).toBe(2);
    expect(lane.swing).toBe(0.3);
    expect(lane.fx.drive).toBe(0.6);
    expect(lane.fx.lpf).toBe(800);
    expect(lane.fx.pan).toBe(1); // clamped
    expect(lane.fx.gain).toBe(0.5);
  });

  it("accepts room as alias of reverb and bank as alias of kit", () => {
    const lane = parsePattern("bd ~ | room 0.4 | bank RolandTR909").lanes[0];
    expect(lane.fx.reverb).toBe(0.4);
    expect(lane.kit).toBe("909");
  });

  it("builds every-N-rev variants", () => {
    const lane = parsePattern("bd ~ sn cp | every 4 rev").lanes[0];
    expect(lane.everyN).toBe(4);
    expect(lane.everySteps?.map((s) => (s.kind === "hit" ? s.id : "~"))).toEqual([
      "cp", "sn", "~", "bd",
    ]);
  });

  it("warns on unknown commands and bad values", () => {
    const { warnings } = parsePattern("bd ~ | foo | fast | synth flauta");
    expect(warnings).toHaveLength(3);
  });
});

describe("melody", () => {
  it("maps notes to midi (c4 = 60)", () => {
    const lane = parsePattern("c e g c5 c# b3").lanes[0];
    const midis = lane.steps.map((s) => (s.kind === "note" ? s.midi : -1));
    expect(midis).toEqual([60, 64, 67, 72, 61, 59]);
  });

  it("resolves scale degrees with octave wrap and negatives", () => {
    expect([0, 2, 4, 7].map((n) => degreeToMidi(n, SCALES.mayor))).toEqual([60, 64, 67, 72]);
    expect(degreeToMidi(-1, SCALES.mayor)).toBe(59);
    expect(degreeToMidi(3, SCALES.menor)).toBe(65);
  });

  it("knows the three modes, in Spanish and in Strudel's English", () => {
    // frigia: flat second — the dark clash; lidia: raised fourth — floating
    expect(degreeToMidi(1, SCALES.frigia)).toBe(61);
    expect(degreeToMidi(3, SCALES.lidia)).toBe(66);
    expect(degreeToMidi(5, SCALES.dorica)).toBe(69);
    expect(SCALES.dorian).toEqual(SCALES.dorica);
    expect(SCALES.phrygian).toEqual(SCALES.frigia);
    expect(SCALES.lydian).toEqual(SCALES.lidia);
    const { lanes, warnings } = parsePattern("0 1 | synth pad | scale frigia");
    expect(warnings).toEqual([]);
    expect(lanes[0].scale).toEqual(SCALES.frigia);
  });

  it("collects piano midis only from piano lanes", () => {
    const { lanes } = parsePattern("0 2 | synth piano | scale menor\n0 2 | synth bass");
    expect(collectPianoMidis(lanes).sort()).toEqual([60, 63]);
  });
});

describe("sample keys", () => {
  it("includes kit-prefixed keys with plain fallback", () => {
    const keys = collectSampleKeys(parsePattern("bd sn | kit 808").lanes);
    expect(keys).toContain("RolandTR808_bd:0");
    expect(keys).toContain("RolandTR808_sd:0");
    expect(keys).toContain("bd:0");
  });
});
