import {
  collectPianoMidis,
  collectSampleKeys,
  DEFAULT_FX,
  degreeToMidi,
  SCALES,
  type LaneDef,
  type LaneFx,
  type Loc,
  type Marks,
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
/** The ladder filter lives in an AudioWorklet served as a static file. */
const LADDER_URL = "/ladder.js";

type StepListener = (step: number) => void;
type FlashListener = (from: number, to: number) => void;

interface LaneState {
  nextTime: number;
  index: number;
  /** acid: a note reached by a slide from the previous one starts here —
   *  it must not retrigger (the previous voice already glided into it) */
  slideUntil: number | null;
  /** ringing open hats — choked when a closed hat arrives */
  openHats: { gain: GainNode; start: number }[];
}

interface Chain {
  input: GainNode;
  /** sidechain gain: dips on every kick of the pattern (`duck`) */
  duck: GainNode;
  delay: DelayNode | null;
  /** kick rumble bus: kicks feed it, a long dark reverb rings under them */
  rumbleIn: GainNode | null;
  rumbleGain: GainNode | null;
  nodes: AudioNode[];
  lastDuck: number;
}

/** Everything a lane needs to render events into some audio context. */
interface LaneIO {
  ctx: BaseAudioContext;
  dest: AudioNode;
  chain: Chain | null;
  lane: LaneDef;
  state: LaneState;
  flash: ((loc: Loc, time: number) => void) | null;
  /** kick times rendered so far — the sidechain reads them after the pass */
  kicks: number[];
}

const freshState = (): LaneState => ({ nextTime: 0, index: 0, slideUntil: null, openHats: [] });

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

const impulseCache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

/**
 * Synthesized stereo impulse response. `size` 0..1 maps to 0.6-6 s. The
 * tail is split in two bands: highs die much sooner than lows (as in any
 * real room), the sub is kept out of the tail so it never turns to mud,
 * the two channels are decorrelated noise, and a short predelay keeps the
 * dry hit in front. `dark` = the kick rumble's basement.
 */
function impulseResponse(ctx: BaseAudioContext, size: number, dark = false): AudioBuffer {
  let perCtx = impulseCache.get(ctx);
  if (!perCtx) {
    perCtx = new Map();
    impulseCache.set(ctx, perCtx);
  }
  const key = `${Math.round(size * 20)}${dark ? "d" : ""}`;
  const cached = perCtx.get(key);
  if (cached) return cached;

  const sr = ctx.sampleRate;
  const seconds = 0.6 + size * 5.4;
  const predelay = Math.floor(sr * 0.015);
  const length = Math.floor(sr * seconds) + predelay;
  const buffer = ctx.createBuffer(2, length, sr);
  const t60Low = seconds;
  const t60High = seconds * (dark ? 0.15 : 0.45);
  const decayLow = Math.log(1000) / (t60Low * sr);
  const decayHigh = Math.log(1000) / (t60High * sr);
  // one-pole split around 1.2 kHz (dark: 300 Hz), one-pole sub cut ~110 Hz
  const splitA = 1 - Math.exp((-2 * Math.PI * (dark ? 300 : 1200)) / sr);
  const subA = 1 - Math.exp((-2 * Math.PI * 110) / sr);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let low = 0;
    let sub = 0;
    for (let i = predelay; i < length; i++) {
      const n = Math.random() * 2 - 1;
      low += splitA * (n - low);
      const high = n - low;
      const k = i - predelay;
      let v = low * Math.exp(-decayLow * k) + high * Math.exp(-decayHigh * k);
      sub += subA * (v - sub);
      v -= sub;
      data[i] = v;
    }
  }
  perCtx.set(key, buffer);
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

/** Gentle tape-style saturation for the master: barely audible at normal
 *  levels, rounds the peaks when the mix pushes. */
function tapeCurve(): Float32Array {
  const curve = new Float32Array(2048);
  const k = 1.6;
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * k) / Math.tanh(k);
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

/** Brickwall-ish limiter: the last thing before the speakers. */
function makeLimiter(ctx: BaseAudioContext): DynamicsCompressorNode {
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -1.5;
  lim.knee.value = 0;
  lim.ratio.value = 20;
  lim.attack.value = 0.001;
  lim.release.value = 0.08;
  return lim;
}

/** master gain → sub cut → glue → tape → limiter → out */
function buildMaster(ctx: BaseAudioContext, volume: number): GainNode {
  const master = ctx.createGain();
  master.gain.value = volume;
  const hpf = ctx.createBiquadFilter();
  hpf.type = "highpass";
  hpf.frequency.value = 25;
  hpf.Q.value = 0.7;
  const comp = makeCompressor(ctx);
  const tape = ctx.createWaveShaper();
  tape.curve = tapeCurve();
  tape.oversample = "2x";
  const limiter = makeLimiter(ctx);
  master.connect(hpf);
  hpf.connect(comp);
  comp.connect(tape);
  tape.connect(limiter);
  limiter.connect(ctx.destination);
  return master;
}

/** Per-lane fx chain: input → duck → [drive] → [hpf] → [lpf] → pan → master,
 *  + delay/reverb sends, + the kick rumble bus. */
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
    const duck = ctx.createGain();
    duck.gain.value = 1;
    input.connect(duck);
    nodes.push(input, duck);
    let head: AudioNode = duck;

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

    if (lane.fx.hpf !== null) {
      const filter = ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = lane.fx.hpf;
      filter.Q.value = 0.7;
      head.connect(filter);
      head = filter;
      nodes.push(filter);
    }

    if (lane.fx.lpf !== null) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = lane.fx.lpf;
      filter.Q.value = 1 + lane.fx.res * 12;
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
      convolver.buffer = impulseResponse(ctx, lane.fx.size);
      panner.connect(send);
      send.connect(convolver);
      convolver.connect(master);
      nodes.push(send, convolver);
    }

    let rumbleIn: GainNode | null = null;
    let rumbleGain: GainNode | null = null;
    if (lane.fx.rumble > 0) {
      rumbleIn = ctx.createGain();
      rumbleIn.gain.value = 1;
      const convolver = ctx.createConvolver();
      convolver.buffer = impulseResponse(ctx, 0.55, true);
      const low = ctx.createBiquadFilter();
      low.type = "lowpass";
      low.frequency.value = 160;
      low.Q.value = 0.8;
      rumbleGain = ctx.createGain();
      rumbleGain.gain.value = lane.fx.rumble * 1.4;
      rumbleIn.connect(convolver);
      convolver.connect(low);
      low.connect(rumbleGain);
      rumbleGain.connect(master);
      nodes.push(rumbleIn, convolver, low, rumbleGain);
    }

    return { input, duck, delay, rumbleIn, rumbleGain, nodes, lastDuck: -1 };
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

/** does this lane ever trigger a kick? (the sidechain's source) */
export function laneHasKick(lane: LaneDef): boolean {
  const walk = (node: Node): boolean =>
    node.kind === "hit"
      ? node.id === "bd"
      : node.kind === "group"
        ? node.children.some(walk)
        : node.kind === "alt"
          ? node.choices.some(walk)
          : node.kind === "prob"
            ? walk(node.child)
            : false;
  return lane.steps.some(walk) || (lane.everySteps?.some(walk) ?? false);
}

// ------------------------------------------------------------------- engine

/**
 * Lookahead scheduler with one clock per lane (so `fast`/`slow` work) plus
 * a base clock that drives the UI step highlight. Sounds route through
 * per-lane fx chains into a master gain → sub cut → glue compressor → tape
 * → limiter → speakers, with an analyser tap for the visualizer. Can also
 * render the pattern offline to a WAV file. Falls back to synthesized
 * bd/sn/hh when offline.
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
  /** kicks scheduled in the current window — ducks are applied after it */
  private liveKicks: number[] = [];

  private bpm = DEFAULT_BPM;
  private volume = 0.9;
  private laneGains: number[] = [];

  /** per context: is the ladder worklet usable? */
  private ladder = new WeakMap<BaseAudioContext, Promise<boolean>>();

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
      this.master = buildMaster(this.ctx, this.volume);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.75;
      this.master.connect(this.analyser);
      void this.loadLadder(this.ctx);
    }
    return this.ctx;
  }

  /** Load the ladder filter worklet once per context (true when usable). */
  private loadLadder(ctx: BaseAudioContext): Promise<boolean> {
    let promise = this.ladder.get(ctx);
    if (!promise) {
      promise = (async () => {
        if (!ctx.audioWorklet) return false;
        try {
          await ctx.audioWorklet.addModule(LADDER_URL);
          return true;
        } catch (err) {
          console.warn("ladder worklet unavailable, using biquads:", err);
          return false;
        }
      })();
      this.ladder.set(ctx, promise);
    }
    return promise;
  }

  private ladderReady = new WeakSet<BaseAudioContext>();

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
      this.loadLadder(ctx).then((ok) => {
        if (ok) this.ladderReady.add(ctx);
      }),
    ]);
  }

  /** One-shot audition of a drum/voice sound (Inspector and grid taps). */
  async previewSound(id: string, variant = 0, kit: string | null = null): Promise<void> {
    const ctx = this.ensureContext();
    void ctx.resume();
    const keys = [`${id}:${variant}`];
    if (kit) keys.unshift(`${kitSampleId(kit, id)}:${variant}`);
    if (!id.startsWith("v")) await sampleBank.preload(ctx, keys);
    const io = this.previewIO(ctx, { kit, fx: DEFAULT_FX } as LaneDef);
    this.triggerHit(io, id, variant, ctx.currentTime + 0.02, {});
  }

  /** One-shot audition of a melodic note with a given synth. */
  async previewNote(synth: SynthName, midi: number): Promise<void> {
    const ctx = this.ensureContext();
    void ctx.resume();
    if (synth === "piano") await sampleBank.preloadPitched(ctx, "piano", [midi]);
    const io = this.previewIO(ctx, { synth, scale: SCALES.mayor, fx: DEFAULT_FX } as LaneDef);
    this.playNote(io, midi, ctx.currentTime + 0.02, 0.4, {});
  }

  private previewIO(ctx: AudioContext, lane: LaneDef): LaneIO {
    return {
      ctx,
      dest: this.master ?? ctx.destination,
      chain: null,
      lane,
      state: freshState(),
      flash: null,
      kicks: [],
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
    this.laneStates = this.lanes.map(() => ({ ...freshState(), nextTime: this.startTime }));
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
        slideUntil: this.laneStates[i]?.slideUntil ?? null,
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
    this.liveKicks = [];
    // chains stay connected so delay/reverb tails ring out naturally
  }

  // ------------------------------------------------------------- WAV export

  /** Render `baseSteps` base steps (default 4 loops of the 8-step grid). */
  async renderWav(lanes: LaneDef[], baseSteps = 32): Promise<Blob> {
    await this.preload(lanes);

    const rate = 44100;
    const body = baseSteps * this.stepSeconds;
    const octx = new OfflineAudioContext(2, Math.ceil(rate * (body + 1.5)), rate);
    if (await this.loadLadder(octx)) this.ladderReady.add(octx);
    const master = buildMaster(octx, this.volume);
    const chains = createChains(octx, master, lanes, this.laneGains, this.delaySeconds);
    const kicks: number[] = [];

    lanes.forEach((lane, i) => {
      const io: LaneIO = {
        ctx: octx,
        dest: chains[i]?.input ?? master,
        chain: chains[i] ?? null,
        lane,
        state: freshState(),
        flash: null,
        kicks,
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
    this.applyDucks(chains, lanes, kicks);

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
        chain: this.chains[laneIndex] ?? null,
        lane,
        state,
        flash: this.onFlash
          ? (loc, time) => this.scheduleUiCallback(time, () => this.onFlash?.(loc[0], loc[1]))
          : null,
        kicks: this.liveKicks,
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

    // every kick of the window is known now: dip the ducked lanes
    this.applyDucks(this.chains, this.lanes, this.liveKicks);
    this.liveKicks = [];
  }

  /** The sidechain: on every kick, ducked lanes drop and recover; the
   *  rumble bus ducks against its own kick so the sub stays clean. */
  private applyDucks(chains: Chain[], lanes: LaneDef[], kicks: number[]) {
    if (kicks.length === 0) return;
    const times = [...new Set(kicks)].sort((a, b) => a - b);
    const release = Math.max(0.06, this.stepSeconds * 0.9);
    chains.forEach((chain, i) => {
      const lane = lanes[i];
      const depth = lane?.fx.duck ?? 0;
      for (const t of times) {
        if (t <= chain.lastDuck + 0.005) continue;
        chain.lastDuck = t;
        if (depth > 0) {
          chain.duck.gain.setValueAtTime(1 - depth, t);
          chain.duck.gain.setTargetAtTime(1, t + 0.03, release / 3);
        }
        if (chain.rumbleGain) {
          const g = chain.rumbleGain.gain;
          const full = (lane?.fx.rumble ?? 0) * 1.4;
          g.setValueAtTime(full * 0.1, t);
          g.setTargetAtTime(full, t + 0.05, 0.1);
        }
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
        this.triggerHit(io, node.id, node.variant, time, node);
        return;
      case "note":
        if (node.loc) io.flash?.(node.loc, time);
        this.playNote(io, node.midi, time, duration, node);
        return;
      case "degree": {
        if (node.loc) io.flash?.(node.loc, time);
        this.playNote(io, degreeToMidi(node.n, io.lane.scale ?? SCALES.mayor), time, duration, node);
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

  private triggerHit(io: LaneIO, id: string, variant: number, time: number, marks: Marks) {
    const accent = marks.accent ? 1.5 : 1;

    // Recorded voice slots (v1..v8).
    if (/^v[1-8]$/.test(id)) {
      const voice = voiceBank.get(id);
      if (voice) this.playBuffer(io, voice, time, { gain: accent });
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

    if (id === "bd") {
      io.kicks.push(time);
      if (io.lane.fx.sub > 0) this.playSubKick(io, time, io.lane.fx.sub * accent);
    }

    // Kit sample first (e.g. RolandTR808_bd), default sample as fallback.
    let buffer = io.lane.kit ? sampleBank.get(kitSampleId(io.lane.kit, id), variant) : undefined;
    buffer = buffer ?? sampleBank.get(id, variant);
    if (buffer) {
      if (id === "ho") {
        const choke = io.ctx.createGain();
        choke.connect(io.dest);
        io.state.openHats.push({ gain: choke, start: time });
        this.playBuffer(io, buffer, time, { gain: accent, through: choke });
        return;
      }
      this.playBuffer(io, buffer, time, { gain: accent, rumble: id === "bd" });
    } else if (id === "bd") this.playKick(io, time, accent);
    else if (id === "sn") this.playSnare(io, time);
    else if (id === "hh") this.playHat(io, time);
    // other sounds stay silent until their sample arrives
  }

  private playBuffer(
    io: LaneIO,
    buffer: AudioBuffer,
    time: number,
    opts: { gain?: number; through?: AudioNode; rumble?: boolean } = {}
  ) {
    const { fx } = io.lane;
    const source = io.ctx.createBufferSource();
    source.buffer = buffer;
    if (fx.pitch !== 0) source.playbackRate.value = Math.pow(2, fx.pitch / 12);
    let out: AudioNode = source;
    if ((opts.gain ?? 1) !== 1 || fx.cut !== null) {
      const g = io.ctx.createGain();
      g.gain.setValueAtTime(opts.gain ?? 1, time);
      if (fx.cut !== null) {
        g.gain.setValueAtTime(opts.gain ?? 1, time + fx.cut);
        g.gain.linearRampToValueAtTime(0, time + fx.cut + 0.012);
      }
      source.connect(g);
      out = g;
    }
    out.connect(opts.through ?? io.dest);
    if (opts.rumble && io.chain?.rumbleIn) out.connect(io.chain.rumbleIn);
    source.start(time);
    if (fx.cut !== null) source.stop(time + fx.cut + 0.05);
  }

  /** The sine sub layer under a kick: a pitch drop and a long body. */
  private playSubKick(io: LaneIO, time: number, amount: number) {
    const { ctx } = io;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(95, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(0.75 * amount, time + 0.004);
    g.gain.setValueAtTime(0.75 * amount, time + 0.06);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.42);
    osc.connect(g).connect(io.dest);
    if (io.chain?.rumbleIn) g.connect(io.chain.rumbleIn);
    osc.start(time);
    osc.stop(time + 0.45);
  }

  private playKick(io: LaneIO, time: number, accent = 1) {
    const { ctx, dest } = io;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.12);
    g.gain.setValueAtTime(accent, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
    osc.connect(g).connect(dest);
    if (io.chain?.rumbleIn) g.connect(io.chain.rumbleIn);
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

  private playNote(io: LaneIO, midi: number, time: number, duration: number, marks: Marks) {
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const synth = io.lane.synth ?? "piano";
    const held = duration * (1 + (marks.hold ?? 0));
    if (synth === "piano") this.playPiano(io, freq, time, midi, marks);
    else if (synth === "bass") this.playBass(io, freq, time, held, marks);
    else if (synth === "acid") this.playAcid(io, freq, time, duration, marks);
    else if (synth === "sub") this.playSub(io, freq, time, held, marks);
    else if (synth === "reese") this.playReese(io, freq, time, held, marks);
    else this.playPad(io, freq, time, held, marks);
  }

  /** A lane's lowpass with its resonance, on a voice (synth-level filter). */
  private voiceFilter(ctx: BaseAudioContext, fx: LaneFx, cutoff: number): BiquadFilterNode {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    filter.Q.value = 0.7 + fx.res * 10;
    return filter;
  }

  /** Real sampled piano (pitched via playback rate); triangle-synth fallback. */
  private playPiano(io: LaneIO, freq: number, time: number, midi: number, marks: Marks) {
    const { ctx, dest } = io;
    const accent = marks.accent ? 1.35 : 1;
    const hold = 1 + (marks.hold ?? 0);

    const sampled = sampleBank.getPitched("piano", midi);
    if (sampled) {
      const source = ctx.createBufferSource();
      source.buffer = sampled.buffer;
      source.playbackRate.value = sampled.rate;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.55 * accent, time);
      g.gain.setTargetAtTime(0, time + 1.6 * hold, 0.25);
      source.connect(g).connect(dest);
      source.start(time);
      source.stop(time + 1.6 * hold + 1.2);
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
    g.gain.linearRampToValueAtTime(0.4 * accent, time + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.8 * hold);
    osc.connect(filter).connect(g).connect(dest);
    osc.start(time);
    osc.stop(time + 0.85 * hold);
  }

  /** Sawtooth an octave down with a sine under it, dark filter with a
   *  short envelope bite, punchy. */
  private playBass(io: LaneIO, freq: number, time: number, held: number, marks: Marks) {
    const { ctx, dest } = io;
    const fx = io.lane.fx;
    const accent = marks.accent ? 1.3 : 1;
    const saw = ctx.createOscillator();
    saw.type = "sawtooth";
    saw.frequency.value = freq / 2;
    const sine = ctx.createOscillator();
    sine.type = "sine";
    sine.frequency.value = freq / 2;
    const sineGain = ctx.createGain();
    sineGain.gain.value = 0.5;
    const cutoff = fx.cutoff ?? 700;
    const filter = this.voiceFilter(ctx, fx, cutoff);
    const peak = Math.min(8000, cutoff + (fx.env ?? 0.4) * 1800 * accent);
    filter.frequency.setValueAtTime(peak, time);
    filter.frequency.exponentialRampToValueAtTime(cutoff, time + (fx.decay ?? 0.16));
    const g = ctx.createGain();
    const end = Math.max(0.3, held * 0.9);
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(0.5 * accent, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, time + end);
    saw.connect(filter);
    sine.connect(sineGain).connect(filter);
    filter.connect(g).connect(dest);
    saw.start(time);
    sine.start(time);
    saw.stop(time + end + 0.05);
    sine.stop(time + end + 0.05);
  }

  /** Pure sine sub: a short pitch drop into the note, long body. */
  private playSub(io: LaneIO, freq: number, time: number, held: number, marks: Marks) {
    const { ctx, dest } = io;
    const accent = marks.accent ? 1.25 : 1;
    const target = freq / 2;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(target * 2, time);
    osc.frequency.exponentialRampToValueAtTime(target, time + 0.04);
    const g = ctx.createGain();
    const end = Math.max(0.35, held * 0.95);
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(0.6 * accent, time + 0.006);
    g.gain.setValueAtTime(0.6 * accent, time + end * 0.5);
    g.gain.exponentialRampToValueAtTime(0.001, time + end);
    osc.connect(g).connect(dest);
    osc.start(time);
    osc.stop(time + end + 0.05);
  }

  /** Reese: two detuned saws and a sine an octave under, a slow-breathing
   *  lowpass — the UK bass. */
  private playReese(io: LaneIO, freq: number, time: number, held: number, marks: Marks) {
    const { ctx, dest } = io;
    const fx = io.lane.fx;
    const accent = marks.accent ? 1.3 : 1;
    const cutoff = fx.cutoff ?? 520;
    const filter = this.voiceFilter(ctx, fx, cutoff);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.6;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = cutoff * 0.3;
    lfo.connect(lfoGain).connect(filter.frequency);
    const g = ctx.createGain();
    const end = Math.max(0.3, held * 0.92);
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(0.3 * accent, time + 0.012);
    g.gain.setValueAtTime(0.3 * accent, time + end);
    g.gain.exponentialRampToValueAtTime(0.001, time + end + 0.08);
    filter.connect(g).connect(dest);
    const oscs: OscillatorNode[] = [];
    for (const detune of [-14, 14]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq / 2;
      osc.detune.value = detune;
      osc.connect(filter);
      oscs.push(osc);
    }
    const sine = ctx.createOscillator();
    sine.type = "sine";
    sine.frequency.value = freq / 4;
    const sineGain = ctx.createGain();
    sineGain.gain.value = 0.6;
    sine.connect(sineGain).connect(filter);
    oscs.push(sine, lfo);
    for (const osc of oscs) {
      osc.start(time);
      osc.stop(time + end + 0.15);
    }
  }

  /**
   * The 303: one sawtooth into a resonant ladder filter whose cutoff is
   * kicked by its own envelope on every note. Accents (`0^`) hit louder,
   * bite wider and snap faster. A note held with `_` straight into the
   * next one slides: the voice keeps sounding and glides, nothing retriggers.
   */
  private playAcid(io: LaneIO, freq: number, time: number, duration: number, marks: Marks) {
    const { ctx, dest, state, lane } = io;
    const fx = lane.fx;
    // this note was reached by a slide from the previous one: already sounding
    if (state.slideUntil !== null && Math.abs(time - state.slideUntil) < duration * 0.25) {
      state.slideUntil = null;
      return;
    }
    const accent = !!marks.accent;
    const steps = 1 + (marks.hold ?? 0);
    const target = freq / 2; // an octave down, like a proper acid bassline
    let gate = marks.hold ? duration * steps - 0.01 : duration * 0.55;

    let slideFreq: number | null = null;
    if (marks.slide) {
      const midi =
        marks.slide.kind === "note"
          ? marks.slide.midi
          : degreeToMidi(marks.slide.n, lane.scale ?? SCALES.mayor);
      slideFreq = (440 * Math.pow(2, (midi - 69) / 12)) / 2;
      gate = duration * steps + duration * 0.55; // through the next note's gate
      state.slideUntil = time + duration * steps;
    }

    const base = fx.cutoff ?? 320;
    const envAmount = (fx.env ?? 0.65) * (accent ? 1.45 : 1);
    const decay = (fx.decay ?? 0.28) * (accent ? 0.75 : 1);
    const peak = Math.min(8800, base + envAmount * 5200);
    const res = fx.res ?? 0.55;

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(target, time);
    if (slideFreq !== null) {
      const boundary = time + duration * steps;
      osc.frequency.setValueAtTime(target, boundary - 0.07);
      osc.frequency.exponentialRampToValueAtTime(slideFreq, boundary + 0.03);
    }

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(accent ? 0.55 : 0.36, time + 0.003);
    g.gain.setValueAtTime(accent ? 0.55 : 0.36, time + gate);
    g.gain.exponentialRampToValueAtTime(0.001, time + gate + 0.03);
    const end = time + gate + 0.06;

    if (this.ladderReady.has(ctx)) {
      const ladder = new AudioWorkletNode(ctx, "ladder", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      const cutoff = ladder.parameters.get("cutoff")!;
      cutoff.setValueAtTime(peak, time);
      cutoff.exponentialRampToValueAtTime(Math.max(50, base), time + decay);
      ladder.parameters.get("resonance")!.value = 0.3 + res * 0.66;
      ladder.parameters.get("drive")!.value = 1.3 + res;
      ladder.port.postMessage({ until: end + 0.5 });
      osc.connect(ladder).connect(g).connect(dest);
    } else {
      // no worklet: two cascaded biquads make 24 dB/oct, close enough
      const a = this.voiceFilter(ctx, { ...fx, res: res * 0.7 }, base);
      const b = this.voiceFilter(ctx, { ...fx, res: res * 0.7 }, base);
      for (const f of [a, b]) {
        f.frequency.setValueAtTime(peak, time);
        f.frequency.exponentialRampToValueAtTime(Math.max(50, base), time + decay);
      }
      osc.connect(a).connect(b).connect(g).connect(dest);
    }
    osc.start(time);
    osc.stop(end);
  }

  /** Four detuned saws opened across the stereo field, a slow filter
   *  breath and a chorus. The envelope scales with the note: short notes
   *  swell like strings, long ambient notes EMERGE instead of hitting. */
  private playPad(io: LaneIO, freq: number, time: number, held: number, marks: Marks) {
    const { ctx, dest } = io;
    const fx = io.lane.fx;
    const accent = marks.accent ? 1.3 : 1;
    const cutoff = fx.cutoff ?? 1400;
    const filter = this.voiceFilter(ctx, fx, cutoff);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = cutoff * 0.3;
    lfo.connect(lfoGain).connect(filter.frequency);

    const g = ctx.createGain();
    const attack = Math.min(1.4, Math.max(0.08, held * 0.45));
    const release = Math.min(2.5, Math.max(0.6, held * 0.7));
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(0.13 * accent, time + attack);
    g.gain.setValueAtTime(0.13 * accent, time + held);
    g.gain.exponentialRampToValueAtTime(0.001, time + held + release);
    filter.connect(g);
    g.connect(dest);

    // chorus: a short delay wobbled by its own LFO, mixed in beside the dry
    const chorus = ctx.createDelay(0.05);
    chorus.delayTime.value = 0.017;
    const wobble = ctx.createOscillator();
    wobble.frequency.value = 0.35;
    const wobbleGain = ctx.createGain();
    wobbleGain.gain.value = 0.0025;
    wobble.connect(wobbleGain).connect(chorus.delayTime);
    const chorusMix = ctx.createGain();
    chorusMix.gain.value = 0.5;
    g.connect(chorus).connect(chorusMix).connect(dest);

    const left = ctx.createStereoPanner();
    left.pan.value = -0.35;
    const right = ctx.createStereoPanner();
    right.pan.value = 0.35;
    left.connect(filter);
    right.connect(filter);
    const stop = time + held + release + 0.05;
    const voices: [number, StereoPannerNode][] = [
      [-12, left],
      [-5, right],
      [5, left],
      [12, right],
    ];
    for (const [detune, side] of voices) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      osc.detune.value = detune;
      osc.connect(side);
      osc.start(time);
      osc.stop(stop);
    }
    lfo.start(time);
    lfo.stop(stop);
    wobble.start(time);
    wobble.stop(stop);
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
