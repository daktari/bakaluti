/**
 * bakaluti — 4-pole ladder low-pass filter (AudioWorklet).
 *
 * The squelch of a 303 lives in a resonant 24 dB/oct filter with
 * saturation inside the feedback loop — nothing the stock biquads can do.
 * This is the classic Stilson/Smith "Moog VCF" model (CCRMA, musicdsp):
 * four one-pole stages, resonance fed back from the last stage, tanh on the
 * input and a cubic soft clip on the output. Cheap enough for one node per
 * note. `cutoff` is a-rate so the envelope is plain AudioParam automation.
 *
 * The main thread posts {until: <ctx time>} after the note's release; past
 * that the processor retires itself so finished voices don't pile up.
 */
class Ladder extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "cutoff", defaultValue: 1000, minValue: 20, maxValue: 9000, automationRate: "a-rate" },
      { name: "resonance", defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "drive", defaultValue: 1, minValue: 0.1, maxValue: 8, automationRate: "k-rate" },
    ];
  }

  constructor() {
    super();
    this.y1 = this.y2 = this.y3 = this.y4 = 0;
    this.ox = this.oy1 = this.oy2 = this.oy3 = 0;
    this.until = Infinity;
    this.port.onmessage = (e) => {
      if (e.data && typeof e.data.until === "number") this.until = e.data.until;
    };
  }

  process(inputs, outputs, params) {
    if (currentTime > this.until) return false;
    const out = outputs[0] && outputs[0][0];
    if (!out) return true;
    const input = inputs[0] && inputs[0][0];
    const cutoff = params.cutoff;
    const res = params.resonance[0];
    const drive = params.drive[0];
    const sr = sampleRate;
    for (let i = 0; i < out.length; i++) {
      const fc = cutoff.length > 1 ? cutoff[i] : cutoff[0];
      let f = (2 * fc) / sr;
      if (f > 0.42) f = 0.42; // the model is only well-behaved below ~sr/5
      const k = 3.6 * f - 1.6 * f * f - 1;
      const p = (k + 1) * 0.5;
      const scale = Math.exp((1 - p) * 1.386249);
      const r = res * scale * 0.96;
      let x = input ? Math.tanh(input[i] * drive) : 0;
      x -= r * this.y4;
      this.y1 = x * p + this.ox * p - k * this.y1;
      this.y2 = this.y1 * p + this.oy1 * p - k * this.y2;
      this.y3 = this.y2 * p + this.oy2 * p - k * this.y3;
      this.y4 = this.y3 * p + this.oy3 * p - k * this.y4;
      this.y4 -= (this.y4 * this.y4 * this.y4) / 6;
      this.ox = x;
      this.oy1 = this.y1;
      this.oy2 = this.y2;
      this.oy3 = this.y3;
      out[i] = this.y4;
    }
    if (!Number.isFinite(this.y4)) {
      this.y1 = this.y2 = this.y3 = this.y4 = 0;
      this.ox = this.oy1 = this.oy2 = this.oy3 = 0;
    }
    return true;
  }
}

registerProcessor("ladder", Ladder);
