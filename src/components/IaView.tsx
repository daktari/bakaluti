import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePlayer } from "../lib/usePlayer";
import { parsePattern } from "../lib/parser";
import { audioEngine, DEFAULT_BPM, MAX_BPM, MIN_BPM } from "../lib/audioEngine";
import { addPattern } from "../lib/storage";
import { sessionUrl, type SessionStep } from "../lib/share";
import {
  diffPatterns,
  extractBpm,
  IA_DAILY_LIMIT,
  iaConsumeUse,
  iaRefundUses,
  iaUsesLeft,
  playableSlice,
  sanitizeIaCode,
  streamGeneration,
  type PatternDiff,
} from "../lib/ia";
import Visualizer from "./Visualizer";
import { getLang, t } from "../lib/i18n";

const CodeEditor = lazy(() => import("./CodeEditor"));

type Phase = "idle" | "streaming" | "done" | "closed" | "limit" | "error";

/** One request in the session: what was asked and the pattern it produced —
 *  a checkpoint you can jump back to. */
interface Step {
  wish: string;
  mode: "new" | "adjust";
  code: string;
  bpm: number;
}

const EXAMPLES = [
  "un techno berlinés duro y seco",
  "house cálido con piano",
  "algo tranquilo para estudiar",
  "acid house rápido",
  "un ritmo que suene a lluvia",
];

const ADJUST_EXAMPLES = [
  "añádele más groove",
  "más oscuro y lento",
  "quita el piano",
  "dobla los hats",
  "métele acid",
];

/** Mood knobs: each composes a piece of the wish. Negative pulls left. */
const MOODS = [
  { key: "dark", left: "ia.moodBright", right: "ia.moodDark" },
  { key: "dense", left: "ia.moodAiry", right: "ia.moodDense" },
  { key: "broken", left: "ia.moodStraight", right: "ia.moodBroken" },
  { key: "fast", left: "ia.moodSlow", right: "ia.moodFast" },
] as const;

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

const SpeechRecognitionCtor =
  typeof window !== "undefined"
    ? ((window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike })
        .webkitSpeechRecognition ??
      null)
    : null;

interface Props {
  onOpen: (code: string, bpm?: number) => void;
  /** a track sent over from the radio to be remixed */
  seed?: { code: string; bpm: number; title: string } | null;
  onSeedConsumed?: () => void;
  /** a shared session (#s=…) to replay */
  session?: SessionStep[] | null;
}

/**
 * The IA tab: natural language in, a playing pattern out. Tokens stream
 * straight into view (the pattern types itself) and playback starts as soon
 * as the first line parses. Adjusts crossfade in like a DJ mixing the next
 * record — with vinyl crackle while the machine digs in the crates.
 */
export default function IaView({ onOpen, seed, onSeedConsumed, session }: Props) {
  const initialSteps: Step[] = seed
    ? [{ wish: t("ia.fromRadio", { title: seed.title }), mode: "new", code: seed.code, bpm: seed.bpm }]
    : (session ?? []).map((s, i) => ({
        wish: s.w,
        mode: i === 0 ? "new" : "adjust",
        code: s.c,
        bpm: s.b,
      }));
  const lastStep = initialSteps[initialSteps.length - 1];

  const [prompt, setPrompt] = useState("");
  const [raw, setRaw] = useState("");
  const [code, setCode] = useState(lastStep?.code ?? "");
  const [bpm, setBpm] = useState(lastStep?.bpm ?? DEFAULT_BPM);
  const [phase, setPhase] = useState<Phase>(lastStep ? "done" : "idle");
  const [left, setLeft] = useState(() => iaUsesLeft());
  const [history, setHistory] = useState<Step[]>(initialSteps);
  const [pending, setPending] = useState<Step | null>(null);
  const [diff, setDiff] = useState<PatternDiff | null>(null);
  const [moods, setMoods] = useState<number[]>([0, 0, 0, 0]);
  const [listening, setListening] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const startedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const modeRef = useRef<"new" | "adjust">("new");
  const playingRef = useRef(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  const flashFn = useRef<((from: number, to: number) => void) | null>(null);
  const registerFlash = useCallback((fn: (from: number, to: number) => void) => {
    flashFn.current = fn;
  }, []);

  const { playing, play, stop } = usePlayer(code, {
    bpm,
    onFlash: (from, to) => flashFn.current?.(from, to),
  });
  playingRef.current = playing;

  // a radio seed arrives already playing in spirit — keep the music going
  useEffect(() => {
    if (seed) {
      onSeedConsumed?.();
      play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // leaving the tab stops the stream, the sound and the crackle
  useEffect(
    () => () => {
      abortRef.current?.abort();
      recRef.current?.stop();
      audioEngine.setCrackle(false);
      audioEngine.setVolume(0.9);
      stop();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => (current === message ? null : current)), 2200);
  };

  /** Adjusts swap like a DJ: duck, switch on the fly, come back up. */
  const swapCode = (next: string, dj: boolean) => {
    if (dj && playingRef.current) {
      audioEngine.fadeTo(0.12, 0.5);
      window.setTimeout(() => {
        setCode(next);
        audioEngine.fadeTo(0.9, 1.4);
      }, 520);
    } else {
      setCode(next);
    }
  };

  const applyText = (accumulated: string) => {
    setRaw(accumulated);
    // adjusts keep the old record spinning until the new one is complete
    if (modeRef.current === "adjust") return;
    const playable = playableSlice(accumulated);
    if (playable === "") return;
    const { lanes, warnings } = parsePattern(playable);
    if (lanes.length === 0 || warnings.length > 0) return;
    setCode(playable);
    const announced = extractBpm(playable);
    if (announced) setBpm(announced);
    if (!startedRef.current) {
      startedRef.current = true;
      play();
    }
  };

  const generate = async (mode: "new" | "adjust", wishOverride?: string) => {
    const wish = (wishOverride ?? prompt).trim();
    if (!wish || phase === "streaming") return;
    if (iaUsesLeft() <= 0) {
      setPhase("limit");
      return;
    }
    // vibe-coding: the current pattern travels along and gets rewritten
    const base = mode === "adjust" && code ? code : undefined;
    const effectiveMode = base ? mode : "new";
    modeRef.current = effectiveMode;
    // still inside the tap: unlock audio now, playback starts from the stream
    audioEngine.unlock();
    let consumed = 1;
    iaConsumeUse();
    setLeft(iaUsesLeft());
    setPhase("streaming");
    setPending({ wish, mode: effectiveMode, code: "", bpm });
    setPrompt(""); // the request moves into the session stack
    setDiff(null);
    setRaw("");
    if (!base) setCode("");
    startedRef.current = false;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    // crackle only while digging from scratch — during an adjust the old
    // record keeps spinning, and music beats surface noise
    if (!base) audioEngine.setCrackle(true);

    try {
      let text = await streamGeneration(wish, applyText, {
        code: base,
        signal: controller.signal,
      });
      let final = sanitizeIaCode(text);
      let parsed = parsePattern(final);

      // one silent retry: hand the parser's complaints back to the model
      if ((parsed.lanes.length === 0 || parsed.warnings.length > 0) && iaUsesLeft() > 0) {
        const complaints =
          parsed.warnings.length > 0
            ? parsed.warnings
            : ["todas las líneas son solo silencios (~): no suena nada — pon sonidos y notas"];
        consumed += 1;
        iaConsumeUse();
        setLeft(iaUsesLeft());
        text = await streamGeneration(wish, applyText, {
          code: base,
          fix: { code: text, warnings: complaints },
          signal: controller.signal,
        });
        final = sanitizeIaCode(text);
        parsed = parsePattern(final);
      }

      audioEngine.setCrackle(false);
      if (parsed.lanes.length === 0) {
        if (base) setCode(base); // a failed adjust must not eat the pattern
        iaRefundUses(consumed); // a failure must not eat the wallet either
        setLeft(iaUsesLeft());
        setPending(null);
        setPrompt(wish); // give the request back for another try
        setPhase("error");
        return;
      }
      const announced = extractBpm(final);
      if (announced) setBpm(announced);
      if (base) setDiff(diffPatterns(base, final));
      swapCode(final, effectiveMode === "adjust");
      if (!startedRef.current && !playingRef.current) {
        startedRef.current = true;
        play();
      }
      setPending(null);
      setHistory((steps) =>
        (effectiveMode === "new" ? [] : steps).concat({
          wish,
          mode: effectiveMode,
          code: final,
          bpm: announced ?? bpm,
        })
      );
      setPhase("done");
    } catch (err) {
      iaRefundUses(consumed); // a failure (or leaving the tab) must not eat the wallet
      if (controller.signal.aborted) return;
      audioEngine.setCrackle(false);
      setLeft(iaUsesLeft());
      setPending(null);
      setPrompt(wish); // give the request back for another try
      setPhase(err instanceof Error && err.message === "cerrado" ? "closed" : "error");
    }
  };

  /** Jump back to a checkpoint; later steps fall off the stack. */
  const restore = (index: number) => {
    if (phase === "streaming") return;
    const step = history[index];
    setCode(step.code);
    setBpm(step.bpm);
    setHistory(history.slice(0, index + 1));
    setDiff(null);
    setPhase("done");
  };

  /** Turn the mood knobs into words and send them to the crates — except
   *  tempo, which is a deck parameter: it turns the pitch fader directly
   *  (instant, free, always audible) instead of asking the model. */
  const applyMoods = () => {
    const tempoIndex = MOODS.findIndex((mood) => mood.key === "fast");
    const tempo = moods[tempoIndex];
    const newBpm = Math.min(MAX_BPM, Math.max(MIN_BPM, bpm + tempo * 8));
    const pieces = MOODS.map((mood, i) => {
      const value = moods[i];
      if (value === 0 || i === tempoIndex) return null;
      const what = t(value > 0 ? mood.right : mood.left);
      return t(Math.abs(value) === 2 ? "ia.moodMuchMore" : "ia.moodBitMore", { what });
    }).filter(Boolean) as string[];

    if (pieces.length === 0) {
      if (tempo === 0) return;
      setMoods([0, 0, 0, 0]);
      setBpm(newBpm);
      // the checkpoint keeps the new tempo, so restoring it sounds right
      setHistory((steps) =>
        steps.length > 0
          ? [...steps.slice(0, -1), { ...steps[steps.length - 1], bpm: newBpm }]
          : steps
      );
      flash(`${newBpm} bpm`);
      return;
    }

    if (tempo !== 0) pieces.push(`pon el tempo en ${newBpm} bpm`);
    setMoods([0, 0, 0, 0]);
    void generate("adjust", pieces.join(", "));
  };

  const toggleVoice = () => {
    if (!SpeechRecognitionCtor) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new SpeechRecognitionCtor();
    rec.lang = getLang() === "es" ? "es-ES" : "en-US";
    rec.interimResults = true;
    rec.onresult = (event) => {
      const transcript = Array.from({ length: event.results.length }, (_, i) =>
        event.results[i][0].transcript
      ).join(" ");
      setPrompt(transcript.trim());
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  const confirmSave = () => {
    addPattern(saveName.trim() || t("ed.defaultName"), code, bpm);
    setSaveOpen(false);
    setSaveName("");
    flash(t("ed.saved"));
  };

  const shareSession = async () => {
    await navigator.clipboard.writeText(
      sessionUrl(history.map((s) => ({ w: s.wish, c: s.code, b: s.bpm })))
    );
    flash(t("ia.sessionCopied"));
  };

  const streamingText = sanitizeIaCode(raw) || raw;

  return (
    <div className="flex-1 overflow-y-auto p-5 md:p-7 relative min-w-0">
      <Visualizer />
      <div className="relative z-10 max-w-3xl mx-auto">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-mag mb-1">
          <span className="w-2 h-2 bg-mag blink shadow-[0_0_8px_#ff3ea5]" />
          {t("ia.eyebrow")}
        </div>
        <h1 className="text-2xl md:text-3xl uppercase tracking-wide led mb-2">{t("ia.title")}</h1>
        <p className="text-xs text-fog leading-relaxed max-w-lg mb-5">{t("ia.sub")}</p>

        {/* On a phone the buttons wrap under the input instead of squeezing
            it to a few pixels (basis-full keeps the input on its own row). */}
        <div className="flex flex-wrap gap-2">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void generate(code ? "adjust" : "new");
            }}
            maxLength={280}
            enterKeyHint="send"
            autoCapitalize="off"
            autoCorrect="off"
            placeholder={code ? t("ia.adjustPlaceholder") : t("ia.placeholder")}
            className="basis-full sm:basis-0 flex-1 min-w-0 px-3 py-2.5 text-sm bg-black border border-acid/40 outline-none text-acid placeholder-fog focus:border-acid transition-all"
          />
          {SpeechRecognitionCtor && (
            <button
              onClick={toggleVoice}
              title={t("ia.voice")}
              className={
                "px-3 py-2.5 text-xs uppercase tracking-widest border transition-all " +
                (listening
                  ? "border-red-500 text-red-400"
                  : "border-white/20 text-fog hover:text-acid hover:border-acid/60")
              }
            >
              {listening ? <span className="blink">● {t("ia.listening")}</span> : `● ${t("ia.voice")}`}
            </button>
          )}
          {code && (
            <button
              onClick={() => void generate("adjust")}
              disabled={phase === "streaming" || !prompt.trim()}
              className="px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-black bg-acid shadow-[4px_4px_0_#ff3ea5] hover:shadow-[2px_2px_0_#ff3ea5] hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-50 disabled:shadow-none"
            >
              {phase === "streaming" ? (
                <span className="blink">{t("ia.generating")}</span>
              ) : (
                t("ia.adjust")
              )}
            </button>
          )}
          <button
            onClick={() => void generate("new")}
            disabled={phase === "streaming" || !prompt.trim()}
            className={
              code
                ? "px-4 py-2.5 text-xs uppercase tracking-widest border border-white/20 text-fog hover:border-acid/60 hover:text-acid transition-all disabled:opacity-50"
                : "px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-black bg-acid shadow-[4px_4px_0_#ff3ea5] hover:shadow-[2px_2px_0_#ff3ea5] hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-50 disabled:shadow-none"
            }
          >
            {phase === "streaming" && !code ? (
              <span className="blink">{t("ia.generating")}</span>
            ) : code ? (
              t("ia.fresh")
            ) : (
              t("ia.generate")
            )}
          </button>
        </div>

        <div className="flex gap-2 flex-wrap mt-3">
          {(code ? ADJUST_EXAMPLES : EXAMPLES).map((example) => (
            <button
              key={example}
              onClick={() => setPrompt(example)}
              className="px-2.5 py-1 text-[10px] border border-white/15 text-fog hover:text-acid hover:border-acid/60 transition-all"
            >
              {example}
            </button>
          ))}
          <span className="ml-auto text-[10px] text-fog/70 self-center">
            {prompt.length > 0 && <span className="mr-3">{prompt.length}/280</span>}
            {t("ia.left", { n: left })}
          </span>
        </div>

        {code && phase !== "streaming" && (
          <div className="mt-4 flex items-end gap-4 flex-wrap border border-white/10 bg-panel px-3 py-2.5">
            {MOODS.map((mood, i) => (
              <label key={mood.key} className="flex flex-col text-[9px] uppercase tracking-widest text-fog select-none">
                <input
                  type="range"
                  min={-2}
                  max={2}
                  step={1}
                  value={moods[i]}
                  onChange={(e) =>
                    setMoods(moods.map((v, j) => (j === i ? Number(e.target.value) : v)))
                  }
                  className="w-24 accent-acid"
                />
                <span className="flex justify-between w-24 mt-0.5">
                  <span className={moods[i] < 0 ? "text-acid" : ""}>{t(mood.left)}</span>
                  <span className={moods[i] > 0 ? "text-acid" : ""}>{t(mood.right)}</span>
                </span>
              </label>
            ))}
            <button
              onClick={applyMoods}
              disabled={moods.every((v) => v === 0)}
              className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border border-acid/60 text-acid hover:bg-acid hover:text-black transition-all disabled:opacity-40"
            >
              {t("ia.moodApply")}
            </button>
          </div>
        )}

        {(history.length > 0 || pending) && (
          <div className="mt-5 space-y-1 text-[11px]">
            {history.map((step, i) => (
              <button
                key={`${i}-${step.wish}`}
                onClick={() => restore(i)}
                title={t("ia.restore")}
                style={{ marginLeft: Math.min(i, 6) * 14 }}
                className={
                  "block text-left px-2.5 py-1 border transition-all " +
                  (i === history.length - 1 && !pending
                    ? "border-acid/50 text-acid"
                    : "border-white/10 text-fog hover:text-acid hover:border-acid/40")
                }
              >
                {step.mode === "adjust" ? "└ " : "▸ "}
                {step.wish}
              </button>
            ))}
            {pending && (
              <div
                style={{ marginLeft: Math.min(history.length, 6) * 14 }}
                className="px-2.5 py-1 border border-mag/50 text-mag w-fit"
              >
                <span className="blink">
                  {pending.mode === "adjust" ? "└ " : "▸ "}
                  {pending.wish}
                </span>
              </div>
            )}
          </div>
        )}

        {phase === "closed" && (
          <p className="mt-5 px-3 py-2.5 border border-mag/50 text-mag text-xs">{t("ia.closed")}</p>
        )}
        {phase === "limit" && (
          <p className="mt-5 px-3 py-2.5 border border-mag/50 text-mag text-xs">
            {t("ia.limit", { n: IA_DAILY_LIMIT })}
          </p>
        )}
        {phase === "error" && (
          <p className="mt-5 px-3 py-2.5 border border-red-500/50 text-red-400 text-xs">
            {t("ia.error")}
          </p>
        )}

        {phase === "streaming" && modeRef.current === "adjust" && streamingText && (
          <pre className="mt-5 px-4 py-3 bg-black/70 border border-mag/25 text-[13px] leading-relaxed text-mag/80 whitespace-pre-wrap break-words">
            {streamingText}
            <span className="blink">▮</span>
          </pre>
        )}

        {phase === "streaming" && modeRef.current === "new" && (
          <pre className="mt-5 px-4 py-3 bg-black/70 border border-acid/25 text-[13px] leading-relaxed text-acid whitespace-pre-wrap break-words min-h-[8rem]">
            {streamingText}
            <span className="blink">▮</span>
          </pre>
        )}

        {code && phase !== "streaming" && (
          <div className="mt-5 h-52 bg-black border border-acid/25 overflow-hidden">
            <Suspense
              fallback={
                <pre className="px-4 py-3 text-[13px] leading-relaxed text-acid whitespace-pre-wrap">
                  {code}
                </pre>
              }
            >
              <CodeEditor
                value={code}
                onChange={() => {}}
                readOnly
                registerFlash={registerFlash}
                className="h-full"
              />
            </Suspense>
          </div>
        )}

        {diff && (diff.added.length > 0 || diff.changed.length > 0 || diff.removed.length > 0) && (
          <div className="mt-3 border border-white/10 bg-panel px-3 py-2.5 text-[11px] leading-relaxed">
            <div className="text-[9px] uppercase tracking-[0.2em] text-fog mb-1.5">
              {t("ia.diff")}
            </div>
            {diff.added.map((line) => (
              <div key={`a-${line}`} className="text-acid">＋ {line}</div>
            ))}
            {diff.changed.map((line) => (
              <div key={`c-${line}`} className="text-mag">± {line}</div>
            ))}
            {diff.removed.map((line) => (
              <div key={`r-${line}`} className="text-fog/60 line-through">− {line}</div>
            ))}
          </div>
        )}

        {code && (
          <div className="flex items-center gap-2.5 flex-wrap mt-4">
            <button
              onClick={playing ? stop : play}
              className={
                "px-5 py-2 text-xs font-bold uppercase tracking-widest border transition-all " +
                (playing
                  ? "border-mag text-mag hover:bg-mag hover:text-black"
                  : "border-acid text-acid hover:bg-acid hover:text-black")
              }
            >
              {playing ? "■ Stop" : "▶ Play"}
            </button>
            <span className="px-2.5 py-1 border border-acid/40 text-[10px] uppercase tracking-widest led">
              {bpm} bpm
            </span>
            {saveOpen ? (
              <span className="flex items-center gap-1">
                <input
                  autoFocus
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmSave();
                    if (e.key === "Escape") setSaveOpen(false);
                  }}
                  placeholder={t("ed.savePlaceholder")}
                  className="w-36 px-2 py-1.5 text-xs bg-black border border-acid/40 outline-none text-acid placeholder-fog"
                />
                <button
                  onClick={confirmSave}
                  className="px-2 py-1.5 text-xs text-acid border border-acid/40 hover:bg-acid hover:text-black transition-all"
                >
                  ✓
                </button>
              </span>
            ) : (
              <button
                onClick={() => setSaveOpen(true)}
                className="px-3 py-2 text-xs uppercase tracking-widest text-slate-300 border border-white/15 hover:border-acid/60 hover:text-acid transition-all"
              >
                {t("ed.save")}
              </button>
            )}
            {history.length > 0 && (
              <button
                onClick={() => void shareSession()}
                className="px-3 py-2 text-xs uppercase tracking-widest text-slate-300 border border-white/15 hover:border-acid/60 hover:text-acid transition-all"
              >
                {t("ia.session")}
              </button>
            )}
            <button
              onClick={() => onOpen(code, bpm)}
              className="ml-auto px-5 py-2 text-xs font-bold uppercase tracking-widest border border-mag text-mag hover:bg-mag hover:text-black transition-all"
            >
              {t("ia.open")}
            </button>
          </div>
        )}
        {notice && <p className="mt-2 text-[10px] text-acid">{notice}</p>}

        <p className="mt-6 text-[10px] text-fog/70 leading-relaxed max-w-md">{t("ia.note")}</p>
      </div>
    </div>
  );
}
