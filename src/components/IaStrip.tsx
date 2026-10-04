import { useEffect, useRef, useState } from "react";
import { parsePattern } from "../lib/parser";
import { audioEngine } from "../lib/audioEngine";
import {
  diffPatterns,
  extractBpm,
  IA_DAILY_LIMIT,
  iaConsumeUse,
  iaRefundUses,
  iaUsesLeft,
  sanitizeIaCode,
  streamGeneration,
  type PatternDiff,
} from "../lib/ia";
import { t } from "../lib/i18n";

type Phase = "idle" | "streaming" | "closed" | "limit" | "error";

interface Props {
  code: string;
  bpm: number;
  playing: boolean;
  /** the editor's master volume — fades return to it */
  volume: number;
  onApply: (code: string, bpm?: number) => void;
}

/**
 * The crates, embedded in the editor: AI adjustments over WHATEVER is
 * loaded — a lesson pattern, a sidebar style, a listener's shared track.
 * Adjusts swap in with the DJ duck-and-rise; one-level undo brings the
 * previous take back.
 */
export default function IaStrip({ code, bpm, playing, volume, onApply }: Props) {
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [raw, setRaw] = useState("");
  const [left, setLeft] = useState(() => iaUsesLeft());
  const [diff, setDiff] = useState<PatternDiff | null>(null);
  const [prev, setPrev] = useState<{ code: string; bpm: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const playingRef = useRef(playing);
  playingRef.current = playing;

  useEffect(() => () => abortRef.current?.abort(), []);

  // a local model can take ~20s before the first token: show life meanwhile
  useEffect(() => {
    if (phase !== "streaming") return;
    setElapsed(0);
    const id = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  const adjust = async () => {
    const wish = prompt.trim();
    if (!wish || phase === "streaming" || !code.trim()) return;
    if (iaUsesLeft() <= 0) {
      setPhase("limit");
      return;
    }
    const base = code;
    const baseBpm = bpm;
    let consumed = 1;
    iaConsumeUse();
    setLeft(iaUsesLeft());
    setPhase("streaming");
    setDiff(null);
    setRaw("");
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let text = await streamGeneration(wish, setRaw, { code: base, signal: controller.signal });
      let final = sanitizeIaCode(text);
      let parsed = parsePattern(final);
      if ((parsed.lanes.length === 0 || parsed.warnings.length > 0) && iaUsesLeft() > 0) {
        const complaints =
          parsed.warnings.length > 0
            ? parsed.warnings
            : ["todas las líneas son solo silencios (~): no suena nada — pon sonidos y notas"];
        consumed += 1;
        iaConsumeUse();
        setLeft(iaUsesLeft());
        text = await streamGeneration(wish, setRaw, {
          code: base,
          fix: { code: text, warnings: complaints },
          signal: controller.signal,
        });
        final = sanitizeIaCode(text);
        parsed = parsePattern(final);
      }
      if (parsed.lanes.length === 0) {
        iaRefundUses(consumed); // a failure must not eat the wallet
        setLeft(iaUsesLeft());
        setPhase("error");
        return;
      }
      const announced = extractBpm(final);
      setDiff(diffPatterns(base, final));
      setPrev({ code: base, bpm: baseBpm });
      setPrompt("");
      // DJ swap: duck, switch decks, come back up to the editor's volume
      if (playingRef.current) {
        audioEngine.fadeTo(Math.max(0.08, volume * 0.15), 0.5);
        window.setTimeout(() => {
          onApply(final, announced);
          audioEngine.fadeTo(volume, 1.4);
        }, 520);
      } else {
        onApply(final, announced);
      }
      setPhase("idle");
    } catch (err) {
      iaRefundUses(consumed); // a failure (or leaving the editor) must not eat the wallet
      if (controller.signal.aborted) return;
      setLeft(iaUsesLeft());
      setPhase(err instanceof Error && err.message === "cerrado" ? "closed" : "error");
    }
  };

  const undo = () => {
    if (!prev) return;
    onApply(prev.code, prev.bpm);
    setPrev(null);
    setDiff(null);
  };

  return (
    <div className="relative z-10 border border-acid/25 bg-panel px-3 py-2.5 space-y-2">
      <div className="flex gap-2 items-center">
        <span className="text-[9px] uppercase tracking-[0.2em] text-fog select-none hidden sm:inline">
          {t("ia.stripLabel")}
        </span>
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void adjust();
          }}
          maxLength={280}
          placeholder={t("ia.adjustPlaceholder")}
          className="flex-1 min-w-0 px-3 py-1.5 text-xs bg-black border border-acid/40 outline-none text-acid placeholder-fog focus:border-acid transition-all"
        />
        <button
          onClick={() => void adjust()}
          disabled={phase === "streaming" || !prompt.trim()}
          className="px-4 py-1.5 text-xs font-bold uppercase tracking-widest border border-acid text-acid hover:bg-acid hover:text-black transition-all disabled:opacity-50"
        >
          {phase === "streaming" ? (
            <span className="blink">{t("ia.stripBusy")}</span>
          ) : (
            t("ia.adjust")
          )}
        </button>
        {prev && phase !== "streaming" && (
          <button
            onClick={undo}
            title={t("ia.undo")}
            className="px-3 py-1.5 text-xs uppercase tracking-widest border border-mag/40 text-mag/80 hover:bg-mag hover:text-black transition-all"
          >
            ↺
          </button>
        )}
        <span className="text-[10px] text-fog/70 select-none hidden md:inline">
          {t("ia.left", { n: left })}
        </span>
      </div>

      {phase === "streaming" && (
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-mag">
          <span className="w-1.5 h-1.5 bg-mag blink shadow-[0_0_6px_#ff3ea5]" />
          {t("ia.stripBusy")} {elapsed}s
        </div>
      )}
      {phase === "streaming" && raw && (
        <pre className="px-3 py-2 bg-black/70 border border-mag/25 text-[11px] leading-relaxed text-mag/80 whitespace-pre-wrap break-words max-h-28 overflow-y-auto">
          {sanitizeIaCode(raw) || raw}
          <span className="blink">▮</span>
        </pre>
      )}
      {phase === "closed" && <p className="text-[11px] text-mag">{t("ia.closed")}</p>}
      {phase === "limit" && (
        <p className="text-[11px] text-mag">{t("ia.limit", { n: IA_DAILY_LIMIT })}</p>
      )}
      {phase === "error" && <p className="text-[11px] text-red-400">{t("ia.error")}</p>}

      {diff && (diff.added.length > 0 || diff.changed.length > 0 || diff.removed.length > 0) && (
        <div className="text-[11px] leading-relaxed">
          <div className="text-[9px] uppercase tracking-[0.2em] text-fog mb-1">{t("ia.diff")}</div>
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
    </div>
  );
}
