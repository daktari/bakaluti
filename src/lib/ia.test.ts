import { describe, expect, it } from "vitest";
import { diffPatterns, extractBpm, playableSlice, repairLine, sanitizeIaCode, sseDelta } from "./ia";

describe("IA output sanitizer", () => {
  it("keeps a clean pattern untouched", () => {
    const code = "-- bpm 128\nbd bd bd bd | kit 909 | gain 0.9 -- bombo\n~ cp ~ cp -- palmada";
    expect(sanitizeIaCode(code)).toBe(code);
  });

  it("strips markdown fences and surrounding prose", () => {
    const raw =
      "Aquí tienes tu patrón:\n```\n-- bpm 130\nbd bd bd bd -- bombo\n```\n¡Que lo disfrutes!";
    expect(sanitizeIaCode(raw)).toBe("-- bpm 130\nbd bd bd bd -- bombo");
  });

  it("drops prose lines the parser rejects, keeps valid ones", () => {
    const raw = "Este es un techno duro.\nbd bd bd bd | drive 0.6 -- martillo\nEspero que te guste.";
    expect(sanitizeIaCode(raw)).toBe("bd bd bd bd | drive 0.6 -- martillo");
  });

  it("drops silent lanes: valid syntax, zero content", () => {
    const raw =
      "-- bpm 72\n~ ~ ~ ~ | synth pad | slow 8 | reverb 0.7\n7 ~ ~ 9 | synth piano | delay 0.5\n~ ~ | synth bass | lpf 200";
    expect(sanitizeIaCode(raw)).toBe("-- bpm 72\n7 ~ ~ 9 | synth piano | delay 0.5");
  });

  it("playableSlice drops the half-written last line while streaming", () => {
    const streamed = "-- bpm 124\nbd bd bd bd -- bombo\n~ cp ~ c";
    expect(playableSlice(streamed)).toBe("-- bpm 124\nbd bd bd bd -- bombo");
  });

  it("diffs an adjust: added, retouched and removed lines", () => {
    const before = "-- bpm 126\nbd bd bd bd | gain 0.9\n~ cp ~ cp | reverb 0.3\n7 ~ 9 ~ | synth piano";
    const after =
      "-- bpm 126\nbd bd bd bd | gain 0.9\n~ cp ~ cp | reverb 0.3 | swing 0.3\n~ ho ~ ho | swing 0.3";
    const diff = diffPatterns(before, after);
    expect(diff.added).toEqual(["~ ho ~ ho | swing 0.3"]);
    expect(diff.changed).toEqual(["~ cp ~ cp | reverb 0.3 | swing 0.3"]);
    expect(diff.removed).toEqual(["7 ~ 9 ~ | synth piano"]);
  });

  it("extracts and clamps the announced bpm", () => {
    expect(extractBpm("-- bpm 128\nbd bd bd bd")).toBe(128);
    expect(extractBpm("-- BPM 999\nbd")).toBe(180);
    expect(extractBpm("-- bpm 10\nbd")).toBe(60);
    expect(extractBpm("bd bd bd bd")).toBeUndefined();
  });
});

describe("SSE delta parsing", () => {
  it("reads Workers AI and OpenAI shapes", () => {
    expect(sseDelta('{"response":" bpm"}')).toBe(" bpm");
    expect(sseDelta('{"choices":[{"delta":{"content":"bd"}}]}')).toBe("bd");
  });

  it("keeps digits that Workers AI serialises as JSON numbers", () => {
    // real production payload: the token "0" arrives as the number 0
    expect(sseDelta('{"response":0,"tool_calls":[],"p":"abdef"}')).toBe("0");
    expect(sseDelta('{"response":9}')).toBe("9");
    const stream = ['"--"', '" bpm"', '" "', "1", "4", "0"].map((d) => `{"response":${d}}`);
    expect(stream.map(sseDelta).join("")).toBe("-- bpm 140");
  });

  it("ignores payloads without text and torn JSON", () => {
    expect(sseDelta('{"response":"","usage":{"neurons":70}}')).toBe("");
    expect(sseDelta('{"tool_calls":[],"p":"ab"}')).toBeNull();
    expect(sseDelta('{"response":"bd')).toBeNull();
  });
});

describe("label repair", () => {
  it("peels the recipe label off a line and keeps it as the comment", () => {
    expect(repairLine("pianito ~ <7 9 11 9> ~ ~ | synth piano | delay 0.5")).toBe(
      "~ <7 9 11 9> ~ ~ | synth piano | delay 0.5 -- pianito"
    );
    expect(repairLine("bajo sincopado 0 ~ [~ 0] ~ 3 ~ <5 7> ~ | synth bass | scale menor")).toBe(
      "0 ~ [~ 0] ~ 3 ~ <5 7> ~ | synth bass | scale menor -- bajo sincopado"
    );
    expect(repairLine("hats [hh hh hh] hh <hh [hh hh]> hh")).toBe("[hh hh hh] hh <hh [hh hh]> hh -- hats");
  });

  it("leaves clean lines alone and gives up on lines with nothing playable", () => {
    expect(repairLine("bd ~ sn ~ | kit 909")).toBe("bd ~ sn ~ | kit 909");
    expect(repairLine("bajo grave | lpf 300 | drive 0.5")).toBeNull();
    expect(repairLine("Aquí tienes tu patrón:")).toBeNull();
  });

  it("the sanitizer rescues a house pattern whose piano and bass were labelled", () => {
    const raw =
      "-- bpm 124\nbd ~ bd ~ | kit 909 | gain 0.9\n~ ho ~ ho | swing 0.3\nbajo saltarín 0 ~ [~ 4] ~ 7 ~ | synth bass | swing 0.3\npianito ~ <7 9 11 9> ~ ~ | synth piano | delay 0.5";
    const clean = sanitizeIaCode(raw);
    expect(clean.split("\n")).toHaveLength(5);
    expect(clean).toContain("| synth bass | swing 0.3 -- bajo saltarín");
    expect(clean).toContain("| synth piano | delay 0.5 -- pianito");
  });
});
