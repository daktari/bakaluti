import {
  collectPianoMidis,
  collectSampleKeys,
  degreeToMidi,
  SCALES,
  type LaneDef,
  type Loc,
  type Node,
  type SynthName,
} from "./parser";
import { kitSampleId } from "./sounds";
import { sampleBank } from "./sampleBank";
import { voiceBank } from "./voiceBank";

export const DEFAULT_BPM = 120;
export const MIN_BPM = 60;
export const MAX_BPM = 180;

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_SECONDS = 0.12;
/** Max time to wait for samples before starting playback anyway. */
const PRELOAD_TIMEOUT_MS = 2000;

type StepListener = (step: number) => void;
type FlashListener = (from: number, to: number) => void;

interface LaneState {
  nextTime: number;
  index: number;
  /** last acid-synth frequency, for the 303-style glide */
  acidFreq: number | null;
  /** ringing open hats — choked when a closed hat arrives */
  openHats: { gain: GainNode; start: number }[];
}

interface Chain {
  input: GainNode;
  delay: DelayNode | null;
  nodes: AudioNode[];
}

/** Everything a lane needs to render events into some audio context. */
interface LaneIO {
  ctx: BaseAudioContext;
  dest: AudioNode;
  lane: LaneDef;
  state: LaneState;
  flash: ((loc: Loc, time: number) => void) | null;
}

// ------------------------------------------------------- shared audio helpers

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buffer = noiseCache.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, buffer);
  }
  return buffer;
}

const impulseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Synthesized 1.5s decaying-noise impulse response — free "room". */
function impulseResponse(ctx: BaseAudioContext): AudioBuffer {
  let buffer = impulseCache.get(ctx);
  if (!buffer) {
    const length = Math.floor(ctx.sampleRate * 1.5);
    buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
      }
    }
    impulseCache.set(ctx, buffer);
  }
  return buffer;
}

/** Soft-clip curve for the `drive` effect. */
function driveCurve(amount: number): Float32Array {
  const k = 1 + amount * 40;
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

/** Gentle master compressor — keeps stacked lanes from clipping. */
function makeCompressor(ctx: BaseAudioContext): DynamicsCompressorNode {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 20;
  comp.ratio.value = 4;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;
  return comp;
}

/** Per-lane fx chain: input → [lpf] → pan → master, + delay/reverb sends. */
function createChains(
  ctx: BaseAudioContext,
  master: AudioNode,
  lanes: LaneDef[],
  laneGains: number[],
  delaySeconds: number
): Chain[] {
  return lanes.map((lane, i) => {
    const nodes: AudioNode[] = [];
    const input = ctx.createGain();
    input.gain.value = (laneGains[i] ?? 1) * lane.fx.gain;
    nodes.push(input);
    let head: AudioNode = input;

    if (lane.fx.drive > 0) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = driveCurve(lane.fx.drive);
      shaper.oversample = "2x";
      const post = ctx.createGain();
      post.gain.value = 1 - lane.fx.drive * 0.35;
      head.connect(shaper);
      shaper.connect(post);
      head = post;
      nodes.push(shaper, post);
    }

    if (lane.fx.lpf !== null) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = lane.fx.lpf;
      filter.Q.value = 1;
      head.connect(filter);
      head = filter;
      nodes.push(filter);
    }

    const panner = ctx.createStereoPanner();
    panner.pan.value = lane.fx.pan;
    head.connect(panner);
    panner.connect(master);
    nodes.push(panner);

    let delay: DelayNode | null = null;
    if (lane.fx.delay > 0) {
      const send = ctx.createGain();
      send.gain.value = lane.fx.delay * 0.7;
      delay = ctx.createDelay(2);
      delay.delayTime.value = delaySeconds;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.35;
      panner.connect(send);
      send.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(master);
      nodes.push(send, delay, feedback);
    }

    if (lane.fx.reverb > 0) {
      const send = ctx.createGain();
      send.gain.value = lane.fx.reverb;
      const convolver = ctx.createConvolver();
      convolver.buffer = impulseResponse(ctx);
      panner.connect(send);
      send.connect(convolver);
      convolver.connect(master);
      nodes.push(send, convolver);
    }

    return { input, delay, nodes };
  });
}

/** AudioBuffer → 16-bit stereo PCM WAV blob. */
function encodeWav(buffer: AudioBuffer): Blob {
  const channels = Math.min(2, buffer.numberOfChannels);
  const frames = buffer.length;
  const dataSize = frames * channels * 2;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  const channelData = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const sample = Math.max(-1, Math.min(1, channelData[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([arrayBuffer], { type: "audio/wav" });
}

// ------------------------------------------------------------------- engine

/**
 * Lookahead scheduler with one clock per lane (so `fast`/`slow` work) plus
 * a base clock that drives the UI step highlight. Sounds route through
 * per-lane fx chains into a master gain → compressor → speakers, with an
 * analyser tap for the visualizer. Can also render the pattern offline
 * to a WAV file. Falls back to synthesized bd/sn/hh when offline.
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private timer: number | null = null;
  private uiTimeouts: number[] = [];

  private lanes: LaneDef[] = [];
  private laneStates: LaneState[] = [];
  private chains: Chain[] = [];
  private chainSignature = "";
  private startTime = 0;
  private uiNextTime = 0;
  private uiStep = 0;
  private onStep: StepListener | null = null;
  private onFlash: FlashListener | null = null;

  private bpm = DEFAULT_BPM;
  private volume = 0.9;
  private laneGains: number[] = [];

  get isPlaying(): boolean {
    return this.timer !== null;
  }

  /** Each base step lasts one eighth note: 250ms at 120 BPM. */
  private get stepSeconds(): number {
    return 60 / this.bpm / 2;
  }

  /** Dotted eighth — the classic musical delay time. */
  private get delaySeconds(): number {
    return (60 / this.bpm) * 0.75;
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = makeCompressor(this.ctx);
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.75;
      this.master.connect(this.analyser);
    }
    return this.ctx;
  }

  /** Fill `data` with the current spectrum; false if audio never started. */
  getFrequencyData(data: Uint8Array): boolean {
    if (!this.analyser) return false;
    this.analyser.getByteFrequencyData(data);
    return true;
  }

  setBpm(bpm: number) {
    this.bpm = Math.min(MAX_BPM, Math.max(MIN_BPM, bpm));
    for (const chain of this.chains) {
      if (chain.delay && this.ctx) {
        chain.delay.delayTime.setTargetAtTime(this.delaySeconds, this.ctx.currentTime, 0.1);
      }
    }
  }

  setVolume(volume: number) {
    this.volume = volume;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.02);
    }
  }

  /** Smooth linear fade — the station's transition between tracks. */
  fadeTo(volume: number, seconds: number) {
    this.volume = volume;
    if (this.master && this.ctx) {
      const gain = this.master.gain;
      gain.cancelScheduledValues(this.ctx.currentTime);
      gain.setValueAtTime(gain.value, this.ctx.currentTime);
      gain.linearRampToValueAtTime(volume, this.ctx.currentTime + seconds);
    }
  }

  setLaneGains(gains: number[]) {
    this.laneGains = gains;
    this.chains.forEach((chain, i) => {
      chain.input.gain.value = (gains[i] ?? 1) * (this.lanes[i]?.fx.gain ?? 1);
    });
  }

  private crackle: { gain: GainNode; src: AudioBufferSourceNode } | null = null;

  /** Vinyl surface noise — the sound of the IA digging in the crates. */
  setCrackle(on: boolean) {
    if (!on) {
      if (this.crackle && this.ctx) {
        const { gain, src } = this.crackle;
        gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
        window.setTimeout(() => src.stop(), 700);
        this.crackle = null;
      }
      return;
    }
    if (this.crackle) return;
    const ctx = this.ensureContext();
    void ctx.resume();
    // 2s loop: faint hiss + sparse baked-in pops, lowpassed like worn vinyl
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.012;
    for (let pop = 0; pop < 50; pop++) {
      const at = Math.floor(Math.random() * (data.length - 90));
      const amp = 0.08 + Math.random() * 0.28;
      for (let j = 0; j < 90; j++) data[at + j] += (Math.random() * 2 - 1) * amp * (1 - j / 90);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const lpf = ctx.createBiquadFilter();
    lpf.type = "lowpass";
    lpf.frequency.value = 4200;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(0.5, ctx.currentTime, 0.25);
    src.connect(lpf);
    lpf.connect(gain);
    gain.connect(this.master!);
    src.start();
    this.crackle = { gain, src };
  }

  /** Public handle for UI features that need the shared context (voice rec). */
  getAudioContext(): AudioContext {
    return this.ensureContext();
  }

  /**
   * Call synchronously inside a user gesture (tap, key) when playback will
   * start LATER from a non-gesture path — e.g. the IA stream's first line.
   * iOS only lets a context resume from a gesture; resuming here keeps it
   * unlocked for the asynchronous start that follows.
   */
  unlock() {
    const ctx = this.ensureContext();
    if (ctx.state !== "running") void ctx.resume();
  }

  /** Fetch + decode the samples a pattern needs (fire-and-forget friendly). */
  async preload(lanes: LaneDef[]): Promise<void> {
    const ctx = this.ensureContext();
    const keys = collectSampleKeys(lanes);
    const pianoMidis = collectPianoMidis(lanes);
    await Promise.all([
      keys.length > 0 ? sampleBank.preload(ctx, keys) : Promise.resolve(),
      pianoMidis.length > 0 ? sampleBank.preloadPitched(ctx, "piano", pianoMidis) : Promise.resolve(),
      voiceBank.ensureDecoded(ctx),
    ]);
  }

  /** One-shot audition of a drum/voice sound (Inspector and grid taps). */
  async previewSound(id: string, variant = 0, kit: string | null = null): Promise<void> {
    const ctx = this.ensureContext();
    void ctx.resume();
    const keys = [`${id}:${variant}`];
    if (kit) keys.unshift(`${kitSampleId(kit, id)}:${variant}`);
    if (!id.startsWith("v")) await sampleBank.preload(ctx, keys);
    const io = this.previewIO(ctx, { kit } as LaneDef);
    this.triggerHit(io, id, variant, ctx.currentTime + 0.02);
  }

  /** One-shot audition of a melodic note with a given synth. */
  async previewNote(synth: SynthName, midi: number): Promise<void> {
    const ctx = this.ensureContext();
    void ctx.resume();
    if (synth === "piano") await sampleBank.preloadPitched(ctx, "piano", [midi]);
    const io = this.previewIO(ctx, { synth, scale: SCALES.mayor } as LaneDef);
    this.playNote(io, midi, ctx.currentTime + 0.02, 0.4);
  }

  private previewIO(ctx: AudioContext, lane: LaneDef): LaneIO {
    return {
      ctx,
      dest: this.master ?? ctx.destination,
      lane,
      state: { nextTime: 0, index: 0, acidFreq: null, openHats: [] },
      flash: null,
    };
  }

  async play(lanes: LaneDef[], onStep: StepListener, onFlash?: FlashListener) {
    this.stop();
    this.lanes = lanes;
    this.onStep = onStep;
    this.onFlash = onFlash ?? null;

    const ctx = this.ensureContext();
    void ctx.resume();

    // Give samples a moment to arrive so the first loop already sounds real,
    // but never block playback on a slow/absent network.
    await Promise.race([
      this.preload(lanes),
      new Promise((resolve) => window.setTimeout(resolve, PRELOAD_TIMEOUT_MS)),
    ]);
    if (this.onStep !== onStep) return; // stopped while waiting

    // updatePattern() may have swapped this.lanes while we waited (the IA
    // tab starts with an empty pattern and streams lines in): the lane
    // states must track the CURRENT lanes, or every lane goes silent until
    // the next update.
    this.rebuildChainsIfNeeded(true);
    this.startTime = ctx.currentTime + 0.08;
    this.uiNextTime = this.startTime;
    this.uiStep = 0;
    this.laneStates = this.lanes.map(() => ({
      nextTime: this.startTime,
      index: 0,
      acidFreq: null,
      openHats: [],
    }));
    this.timer = window.setInterval(() => this.scheduleWindow(), LOOKAHEAD_MS);
  }

  /** Swap the pattern while the loop keeps running (live-coding feel). */
  updatePattern(lanes: LaneDef[]) {
    this.lanes = lanes;
    void this.preload(lanes);
    if (!this.isPlaying) return;

    this.rebuildChainsIfNeeded(false);
    // Re-align every lane to the next base-step boundary, keeping its
    // position in the loop as close as possible to where it was.
    this.laneStates = lanes.map((lane, i) => {
      const duration = this.stepSeconds / lane.speed;
      const index = Math.max(0, Math.round((this.uiNextTime - this.startTime) / duration));
      return {
        nextTime: this.uiNextTime,
        index,
        acidFreq: this.laneStates[i]?.acidFreq ?? null,
        openHats: this.laneStates[i]?.openHats ?? [],
      };
    });
  }

  stop() {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.uiTimeouts.forEach((t) => window.clearTimeout(t));
    this.uiTimeouts = [];
    this.onStep = null;
    this.onFlash = null;
    // chains stay connected so delay/reverb tails ring out naturally
  }

  // ------------------------------------------------------------- WAV export

  /** Render `baseSteps` base steps (default 4 loops of the 8-step grid). */
  async renderWav(lanes: LaneDef[], baseSteps = 32): Promise<Blob> {
    await this.preload(lanes);

    const rate = 44100;
    const body = baseSteps * this.stepSeconds;
    const octx = new OfflineAudioContext(2, Math.ceil(rate * (body + 1.2)), rate);
    const master = octx.createGain();
    master.gain.value = this.volume;
    const comp = makeCompressor(octx);
    master.connect(comp);
    comp.connect(octx.destination);
    const chains = createChains(octx, master, lanes, this.laneGains, this.delaySeconds);

    lanes.forEach((lane, i) => {
      const io: LaneIO = {
        ctx: octx,
        dest: chains[i]?.input ?? master,
        lane,
        state: { nextTime: 0, index: 0, acidFreq: null, openHats: [] },
        flash: null,
      };
      const duration = this.stepSeconds / lane.speed;
      const length = lane.steps.length;
      let time = 0.03;
      let index = 0;
      while (time < body) {
        const cycle = Math.floor(index / length);
        const steps =
          lane.everyN && lane.everySteps && cycle % lane.everyN === 0
            ? lane.everySteps
            : lane.steps;
        const swung = time + (index % 2 === 1 ? lane.swing * duration * 0.5 : 0);
        this.renderNode(steps[index % length], swung, duration, cycle, io);
        time += duration;
        index += 1;
      }
    });

    return encodeWav(await octx.startRendering());
  }

  // ------------------------------------------------------------ scheduling

  private scheduleWindow() {
    const ctx = this.ctx;
    if (!ctx) return;
    const horizon = ctx.currentTime + SCHEDULE_AHEAD_SECONDS;

    // Base clock → UI step highlight.
    while (this.uiNextTime < horizon) {
      const step = this.uiStep;
      this.scheduleUiCallback(this.uiNextTime, () => this.onStep?.(step));
      this.uiNextTime += this.stepSeconds;
      this.uiStep += 1;
    }

    // One independent clock per lane (speed can differ).
    this.lanes.forEach((lane, laneIndex) => {
      const state = this.laneStates[laneIndex];
      if (!state) return;
      const io: LaneIO = {
        ctx,
        dest: this.chains[laneIndex]?.input ?? this.master ?? ctx.destination,
        lane,
        state,
        flash: this.onFlash
          ? (loc, time) => this.scheduleUiCallback(time, () => this.onFlash?.(loc[0], loc[1]))
          : null,
      };
      const duration = this.stepSeconds / lane.speed;
      const length = lane.steps.length;
      while (state.nextTime < horizon) {
        const cycle = Math.floor(state.index / length);
        const steps =
          lane.everyN && lane.everySteps && cycle % lane.everyN === 0
            ? lane.everySteps
            : lane.steps;
        const swung =
          state.nextTime + (state.index % 2 === 1 ? lane.swing * duration * 0.5 : 0);
        this.renderNode(steps[state.index % length], swung, duration, cycle, io);
        state.nextTime += duration;
        state.index += 1;
      }
    });
  }

  private scheduleUiCallback(time: number, callback: () => void) {
    const ctx = this.ctx;
    if (!ctx) return;
    const delayMs = Math.max(0, (time - ctx.currentTime) * 1000);
    const timeout = window.setTimeout(() => {
      this.uiTimeouts = this.uiTimeouts.filter((t) => t !== timeout);
      callback();
    }, delayMs);
    this.uiTimeouts.push(timeout);
  }

  private renderNode(node: Node, time: number, duration: number, cycle: number, io: LaneIO) {
    switch (node.kind) {
      case "rest":
        return;
      case "hit":
        if (node.loc) io.flash?.(node.loc, time);
        this.triggerHit(io, node.id, node.variant, time);
        return;
      case "note":
        if (node.loc) io.flash?.(node.loc, time);
        this.playNote(io, node.midi, time, duration);
        return;
      case "degree": {
        if (node.loc) io.flash?.(node.loc, time);
        this.playNote(io, degreeToMidi(node.n, io.lane.scale ?? SCALES.mayor), time, duration);
        return;
      }
      case "group": {
        const sub = duration / node.children.length;
        node.children.forEach((child, i) => this.renderNode(child, time + i * sub, sub, cycle, io));
        return;
      }
      case "alt": {
        const n = node.choices.length;
        this.renderNode(node.choices[cycle % n], time, duration, Math.floor(cycle / n), io);
        return;
      }
      case "prob":
        if (Math.random() < node.p) this.renderNode(node.child, time, duration, cycle, io);
        return;
    }
  }

  // ------------------------------------------------------------ triggering

  private triggerHit(io: LaneIO, id: string, variant: number, time: number) {
    // Recorded voice slots (v1..v8).
    if (/^v[1-8]$/.test(id)) {
      const voice = voiceBank.get(id);
      if (voice) this.playBuffer(io, voice, time);
      return;
    }

    // Closed hat chokes the ringing open hat on the same lane (like real kits).
    if (id === "hh" || id === "ho") {
      io.state.openHats = io.state.openHats.filter((hat) => {
        if (hat.start < time) {
          hat.gain.gain.setTargetAtTime(0, time, 0.008);
          return false;
        }
        return true;
      });
    }

    // Kit sample first (e.g. RolandTR808_bd), default sample as fallback.
    let buffer = io.lane.kit ? sampleBank.get(kitSampleId(io.lane.kit, id), variant) : undefined;
    buffer = buffer ?? sampleBank.get(id, variant);
    if (buffer) {
      if (id === "ho") {
        const choke = io.ctx.createGain();
        choke.connect(io.dest);
        io.state.openHats.push({ gain: choke, start: time });
        this.playBuffer(io, buffer, time, choke);
        return;
      }
      this.playBuffer(io, buffer, time);
    } else if (id === "bd") this.playKick(io, time);
    else if (id === "sn") this.playSnare(io, time);
    else if (id === "hh") this.playHat(io, time);
    // other sounds stay silent until their sample arrives
  }

  private playBuffer(io: LaneIO, buffer: AudioBuffer, time: number, through?: AudioNode) {
    const source = io.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(through ?? io.dest);
    source.start(time);
  }

  private playKick(io: LaneIO, time: number) {
    const { ctx, dest } = io;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.12);
    g.gain.setValueAtTime(1, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
    osc.connect(g).connect(dest);
    osc.start(time);
    osc.stop(time + 0.45);
  }

  private playSnare(io: LaneIO, time: number) {
    const { ctx, dest } = io;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx);
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "highpass";
    noiseFilter.frequency.value = 1200;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.7, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
    noise.connect(noiseFilter).connect(noiseGain).connect(dest);
    noise.start(time);
    noise.stop(time + 0.2);

    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(200, time);
    oscGain.gain.setValueAtTime(0.4, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    osc.connect(oscGain).connect(dest);
    osc.start(time);
    osc.stop(time + 0.12);
  }

  private playHat(io: LaneIO, time: number) {
    const { ctx, dest } = io;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.35, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    noise.connect(filter).connect(g).connect(dest);
    noise.start(time);
    noise.stop(time + 0.06);
  }

  // ------------------------------------------------------- melodic synths

  private playNote(io: LaneIO, midi: number, time: number, duration: number) {
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const synth = io.lane.synth ?? "piano";
    if (synth === "piano") this.playPiano(io, freq, time, midi);
    else if (synth === "bass") this.playBass(io, freq, time);
    else if (synth === "acid") this.playAcid(io, freq, time, duration);
    else this.playPad(io, freq, time, duration);
  }

  /** Real sampled piano (pitched via playback rate); triangle-synth fallback. */
  private playPiano(io: LaneIO, freq: number, time: number, midi: number) {
    const { ctx, dest } = io;

    const sampled = sampleBank.getPitched("piano", midi);
    if (sampled) {
      const source = ctx.createBufferSource();
      source.buffer = sampled.buffer;
      source.playbackRate.value = sampled.rate;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.55, time);
      g.gain.setTargetAtTime(0, time + 1.6, 0.25);
      source.connect(g).connect(dest);
      source.start(time);
      source.stop(time + 2.6);
      return;
    }

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 2500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(0.4, time + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.8);
    osc.connect(filter).connect(g).connect(dest);
    osc.start(time);
    osc.stop(time + 0.85);
  }

  /** Sawtooth an octave down, dark filter, short punch. */
  private playBass(io: LaneIO, freq: number, time: number) {
    const { ctx, dest } = io;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq / 2;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(0.5, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
    osc.connect(filter).connect(g).connect(dest);
    osc.start(time);
    osc.stop(time + 0.4);
  }

  /** 303-style: sawtooth + squelchy resonant filter sweep + glide. */
  private playAcid(io: LaneIO, freq: number, time: number, duration: number) {
    const { ctx, dest, state } = io;
    const target = freq / 2; // an octave down, like a proper acid bassline
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    const from = state.acidFreq ?? target;
    osc.frequency.setValueAtTime(from, time);
    if (from !== target) {
      osc.frequency.exponentialRampToValueAtTime(target, time + Math.min(0.08, duration * 0.4));
    }
    state.acidFreq = target;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 12;
    filter.frequency.setValueAtTime(2800, time);
    filter.frequency.exponentialRampToValueAtTime(280, time + 0.18);

    const g = ctx.createGain();
    const end = Math.max(0.16, duration * 0.95);
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(0.38, time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, time + end);
    osc.connect(filter).connect(g).connect(dest);
    osc.start(time);
    osc.stop(time + end + 0.03);
  }

  /** Two detuned saws. The envelope scales with the note: short notes get
   *  string-like swells, long ambient notes EMERGE instead of hitting —
   *  and long releases overlap into near-continuous texture. */
  private playPad(io: LaneIO, freq: number, time: number, duration: number) {
    const { ctx, dest } = io;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1400;
    const g = ctx.createGain();
    const attack = Math.min(1.4, Math.max(0.08, duration * 0.45));
    const release = Math.min(2.5, Math.max(0.6, duration * 0.7));
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(0.22, time + attack);
    g.gain.setValueAtTime(0.22, time + duration);
    g.gain.exponentialRampToValueAtTime(0.001, time + duration + release);
    filter.connect(g).connect(dest);

    for (const detune of [-7, 7]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start(time);
      osc.stop(time + duration + release + 0.05);
    }
  }

  // -------------------------------------------------------- effect chains

  /** Rebuild lane chains only when the fx setup actually changed. */
  private rebuildChainsIfNeeded(force: boolean) {
    const signature = JSON.stringify(this.lanes.map((lane) => lane.fx));
    if (!force && signature === this.chainSignature && this.chains.length === this.lanes.length) {
      return;
    }
    this.chainSignature = signature;

    const ctx = this.ensureContext();
    this.chains.forEach((chain) => chain.nodes.forEach((node) => node.disconnect()));
    this.chains = createChains(ctx, this.master!, this.lanes, this.laneGains, this.delaySeconds);
  }
}

export const audioEngine = new AudioEngine();
