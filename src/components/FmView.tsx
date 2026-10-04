import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePlayer } from "../lib/usePlayer";
import { audioEngine } from "../lib/audioEngine";

const CodeEditor = lazy(() => import("./CodeEditor"));
import { radioAt, CHANNELS, SLOT_SECONDS, ID_SECONDS, type Dial, type OnAir } from "../lib/radio";
import { momentUrl, type SharedMoment } from "../lib/share";
import { downloadBlob, slug } from "../lib/download";
import { coverPng } from "../lib/cover";
import { SINGLES, playerSrc, type Single } from "../lib/singles";
import Visualizer from "./Visualizer";
import { getLang, t } from "../lib/i18n";

const nowSeconds = () => Math.floor(Date.now() / 1000);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

interface Props {
  onRemix: (code: string, bpm?: number) => void;
  /** send what's on air to the IA tab as a remix base */
  onIaRemix?: (code: string, bpm: number, title: string) => void;
  /** an #fm=…&t=… link: open in replay mode at that historical moment */
  moment?: SharedMoment | null;
  onClearMoment?: () => void;
}

/**
 * The station console. The broadcast is a pure function of the clock:
 * every listener computes the same track for the same moment. Tuning in
 * starts the engine; slot and arrangement changes flow through the live
 * pattern update, so transitions are seamless DJ cuts. Because the clock
 * is the only input, a shared moment link (dial + unix second) replays
 * the past broadcast exactly — time travel without a single recording.
 */
export default function FmView({ onRemix, onIaRemix, moment, onClearMoment }: Props) {
  const [dial, setDial] = useState<Dial>(moment?.dial ?? "fm");
  const [tuned, setTuned] = useState(false);
  const [vol, setVol] = useState(0.9);
  /** seconds between the listened broadcast and the wall clock (0 = live) */
  const [offset, setOffset] = useState(() => (moment ? moment.t - nowSeconds() : 0));
  const [notice, setNotice] = useState<string | null>(null);
  const [recMinutes, setRecMinutes] = useState(4);
  /** which single's SoundCloud player the listener asked to load */
  const [player, setPlayer] = useState<Single | null>(null);
  const [recording, setRecording] = useState<string | null>(null);
  const [air, setAir] = useState<OnAir>(() =>
    radioAt(moment?.dial ?? "fm", moment ? moment.t : nowSeconds())
  );
  const volRef = useRef(vol);
  volRef.current = vol;

  const flashFn = useRef<((from: number, to: number) => void) | null>(null);
  const registerFlash = useCallback((fn: (from: number, to: number) => void) => {
    flashFn.current = fn;
  }, []);

  const code = air.track.states[Math.min(air.stateIndex, air.track.states.length - 1)];
  const { playing, play, stop } = usePlayer(code, {
    bpm: air.track.bpm,
    volume: vol,
    onFlash: (from, to) => flashFn.current?.(from, to),
  });

  // radio fade: wind the volume down at the slot's tail, back up on the new
  // track — the honest cousin of a crossfade with a single deck
  const fadeState = useRef<{ fadedSlot: number; live: boolean }>({ fadedSlot: -1, live: false });
  fadeState.current.live = tuned && playing;

  // the clock drives everything — recomputing also resyncs after background
  useEffect(() => {
    const tick = () => {
      const next = radioAt(dial, nowSeconds() + offset);
      setAir((prev) => {
        if (fadeState.current.live) {
          if (next.secondsLeft <= 4 && fadeState.current.fadedSlot !== next.slot) {
            fadeState.current.fadedSlot = next.slot;
            audioEngine.fadeTo(Math.max(0.05, volRef.current * 0.1), 3);
          } else if (prev.slot !== next.slot) {
            audioEngine.fadeTo(volRef.current, 1.5);
          }
        }
        return next;
      });
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    const onVisible = () => tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [dial, offset]);

  const tune = () => {
    setTuned(true);
    play();
  };

  const mute = () => {
    setTuned(false);
    stop();
    audioEngine.setVolume(volRef.current);
  };

  // leaving the FM tab must not leave the master faded
  useEffect(() => () => audioEngine.setVolume(0.9), []);

  const switchDial = (next: Dial) => {
    if (next === dial) return;
    setDial(next);
    setAir(radioAt(next, nowSeconds() + offset));
  };

  const backToLive = () => {
    setOffset(0);
    onClearMoment?.();
    // a reload must not re-enter the replay
    history.replaceState(null, "", location.pathname + location.search);
    setAir(radioAt(dial, nowSeconds()));
  };

  const shareMoment = async () => {
    await navigator.clipboard.writeText(momentUrl(dial, nowSeconds() + offset));
    setNotice(t("fm.momentCopied"));
    window.setTimeout(() => setNotice(null), 2200);
  };

  /** A standalone recording of the track on air: arrangement + fade. */
  const recordTrack = async () => {
    if (recording) return;
    const track = air.track;
    setRecording("0%");
    try {
      const blob = await audioEngine.renderTrack(track, recMinutes * 60, (done, total) =>
        setRecording(`${Math.round((done / total) * 100)}%`)
      );
      downloadBlob(`bakaluti-${slug(track.title)}.wav`, blob);
      setNotice(t("fm.recorded"));
    } catch {
      setNotice(t("fm.recordError"));
    } finally {
      setRecording(null);
      window.setTimeout(() => setNotice(null), 3000);
    }
  };

  const makeCover = async () => {
    const track = air.track;
    const blob = await coverPng({
      title: track.title,
      channel: CHANNELS[track.style],
      bpm: track.bpm,
      code: track.code,
    });
    downloadBlob(`bakaluti-${slug(track.title)}.png`, blob);
  };

  // preview past the next slot's ID window, so it names the actual track
  const upNext = radioAt(dial, (air.slot + 1) * SLOT_SECONDS + ID_SECONDS + 1);
  const live = tuned && playing;
  const replaying = offset !== 0;
  const airDate = new Date((nowSeconds() + offset) * 1000).toLocaleString(
    getLang() === "es" ? "es-ES" : "en-GB",
    { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
  );

  return (
    <div className="flex flex-1 min-h-0">
      {/* rail */}
      <aside className="hidden md:block w-56 border-r border-white/10 bg-panel p-4 space-y-6 overflow-y-auto shrink-0">
        <section>
          <h3 className="text-[10px] uppercase tracking-[0.25em] text-fog mb-2">{t("fm.dial")}</h3>
          <button
            onClick={() => switchDial("fm")}
            className={
              "block w-full text-left px-3 py-2.5 mb-2 border text-xs uppercase tracking-widest transition-all " +
              (dial === "fm"
                ? "border-acid text-acid bg-acid/5 shadow-[3px_3px_0_rgba(200,255,0,0.2)]"
                : "border-white/15 text-fog hover:text-acid")
            }
          >
            ▸ bakaluti FM
            <small className="block text-[9px] normal-case tracking-normal text-fog mt-0.5">
              {t("fm.dialFmDesc")}
            </small>
          </button>
          <button
            onClick={() => switchDial("niebla")}
            className={
              "block w-full text-left px-3 py-2.5 border text-xs uppercase tracking-widest transition-all " +
              (dial === "niebla"
                ? "border-acid text-acid bg-acid/5 shadow-[3px_3px_0_rgba(200,255,0,0.2)]"
                : "border-white/15 text-fog hover:text-acid")
            }
          >
            niebla FM
            <small className="block text-[9px] normal-case tracking-normal text-fog mt-0.5">
              {t("fm.dialNieblaDesc")}
            </small>
          </button>
        </section>

        {SINGLES.length > 0 && (
          <section>
            <h3 className="text-[10px] uppercase tracking-[0.25em] text-fog mb-2">{t("fm.singles")}</h3>
            {SINGLES.map((single) => (
              <button
                key={single.url}
                onClick={() => setPlayer(player?.url === single.url ? null : single)}
                className={
                  "block w-full text-left border px-3 py-2 mb-2 transition-all " +
                  (player?.url === single.url
                    ? "border-mag text-mag"
                    : "border-white/10 text-slate-200 hover:border-mag/60 hover:text-mag")
                }
              >
                <b className="block text-[11px] font-normal">▸ {single.title}</b>
                <span className="text-[9px] uppercase tracking-wider text-fog">
                  {CHANNELS[single.style]} · {single.bpm} bpm · SoundCloud
                </span>
              </button>
            ))}
            <p className="text-[9px] text-fog/70 leading-relaxed">{t("fm.singlesNote")}</p>
          </section>
        )}

        <section>
          <h3 className="text-[10px] uppercase tracking-[0.25em] text-fog mb-2">{t("fm.next")}</h3>
          <div className="border border-white/10 px-3 py-2">
            <b className="block text-[11px] font-normal text-slate-200">{upNext.track.title}</b>
            <span className="text-[9px] uppercase tracking-wider text-fog">
              {CHANNELS[upNext.track.style]} · {upNext.track.bpm} bpm ·{" "}
              {t("fm.in")} {mmss(air.secondsLeft)}
            </span>
          </div>
        </section>
      </aside>

      {/* stage */}
      <main className="flex-1 p-5 md:p-7 relative overflow-y-auto min-w-0">
        <Visualizer />
        <div className="relative z-10 max-w-3xl">
          {/* mobile dial */}
          <div className="md:hidden flex gap-2 mb-4">
            <button
              onClick={() => switchDial("fm")}
              className={
                "flex-1 px-3 py-2 border text-[11px] uppercase tracking-widest transition-all " +
                (dial === "fm" ? "border-acid text-acid bg-acid/5" : "border-white/15 text-fog")
              }
            >
              bakaluti FM
            </button>
            <button
              onClick={() => switchDial("niebla")}
              className={
                "flex-1 px-3 py-2 border text-[11px] uppercase tracking-widest transition-all " +
                (dial === "niebla" ? "border-acid text-acid bg-acid/5" : "border-white/15 text-fog")
              }
            >
              niebla FM
            </button>
          </div>

          {replaying && (
            <div className="flex items-center gap-3 mb-4 px-3 py-2 border border-mag/50 text-[10px] uppercase tracking-widest">
              <span className="text-mag blink">◉ {t("fm.replay")}</span>
              <span className="text-fog normal-case tracking-normal">{airDate}</span>
              <button
                onClick={backToLive}
                className="ml-auto px-3 py-1 border border-acid/60 text-acid hover:bg-acid hover:text-black transition-all"
              >
                ● {t("fm.backLive")}
              </button>
            </div>
          )}

          <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.3em]">
            {live ? (
              <>
                <span
                  className={
                    "w-2.5 h-2.5 blink " +
                    (replaying ? "bg-mag shadow-[0_0_10px_#ff3ea5]" : "bg-acid shadow-[0_0_10px_#c8ff00]")
                  }
                />
                <span className={replaying ? "text-mag" : "text-acid"}>
                  {replaying ? t("fm.replay") : t("fm.live")}
                </span>
              </>
            ) : (
              <span className="text-fog">{t("fm.off")}</span>
            )}
            <span className="ml-auto text-fog tracking-[0.15em]">slot #{air.slot}</span>
          </div>

          <h1 className="text-2xl md:text-3xl uppercase tracking-wide led mt-4 mb-2 text-wrap-balance">
            {air.track.title}
          </h1>
          <div className="flex gap-2 flex-wrap text-[10px] uppercase tracking-widest">
            {air.isStationId ? (
              <span className="px-2.5 py-1 border border-acid/60 text-acid blink">{t("fm.id")}</span>
            ) : (
              <span className="px-2.5 py-1 border border-mag/50 text-mag">
                {CHANNELS[air.track.style]}
              </span>
            )}
            <span className="px-2.5 py-1 border border-acid/40 led">{air.track.bpm} bpm</span>
            {air.isAnchor && (
              <span className="px-2.5 py-1 border border-white/15 text-fog">{t("fm.anchor")}</span>
            )}
          </div>

          <div className="h-[3px] bg-white/10 mt-5">
            <div
              className="h-full bg-acid shadow-[0_0_8px_rgba(200,255,0,0.6)]"
              style={{ width: `${(air.secondsIntoSlot / SLOT_SECONDS) * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-[9px] uppercase tracking-widest text-fog mt-1">
            <span>{mmss(air.secondsIntoSlot)}</span>
            <span>
              {t("fm.left")} {mmss(air.secondsLeft)}
            </span>
          </div>

          <div className="mt-5 h-56 bg-black border border-acid/25 overflow-hidden">
            <Suspense
              fallback={<pre className="px-4 py-3 text-[13px] leading-relaxed text-acid">{code}</pre>}
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

          <div className="flex items-center gap-2.5 flex-wrap mt-5">
            {live ? (
              <button
                onClick={mute}
                className="px-5 py-2 text-xs font-bold uppercase tracking-widest border border-mag text-mag hover:bg-mag hover:text-black transition-all"
              >
                {t("fm.mute")}
              </button>
            ) : (
              <button
                onClick={tune}
                className="px-8 py-2.5 text-sm font-bold uppercase tracking-widest text-black bg-acid shadow-[5px_5px_0_#ff3ea5] hover:shadow-[2px_2px_0_#ff3ea5] hover:translate-x-[3px] hover:translate-y-[3px] transition-all"
              >
                {t("fm.tune")}
              </button>
            )}
            <label className="flex items-center gap-2 px-3 py-2 bg-black border border-mag/30 text-[10px] uppercase tracking-widest text-fog select-none">
              vol
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={vol}
                onChange={(e) => setVol(Number(e.target.value))}
                className="w-24 accent-mag"
              />
            </label>
            <button
              onClick={() => void shareMoment()}
              className="px-4 py-2 text-xs uppercase tracking-widest border border-acid/50 text-acid hover:bg-acid hover:text-black transition-all"
            >
              ◉ {t("fm.moment")}
            </button>
            <button
              onClick={() => onRemix(air.track.code, air.track.bpm)}
              className="ml-auto px-5 py-2 text-xs font-bold uppercase tracking-widest border border-mag text-mag hover:bg-mag hover:text-black transition-all"
            >
              {t("fm.remix")}
            </button>
            {onIaRemix && (
              <button
                onClick={() => onIaRemix(air.track.code, air.track.bpm, air.track.title)}
                className="px-4 py-2 text-xs uppercase tracking-widest border border-acid/50 text-acid hover:bg-acid hover:text-black transition-all"
              >
                {t("fm.iaRemix")}
              </button>
            )}
          </div>
          {notice && <p className="mt-2 text-[10px] text-acid">{notice}</p>}

          {/* the recording desk: a standalone WAV of the track on air */}
          {!air.isStationId && (
            <div className="flex items-center gap-2 flex-wrap mt-3 text-[10px] uppercase tracking-widest">
              <button
                onClick={() => void recordTrack()}
                disabled={recording !== null}
                className="px-4 py-2 border border-red-500/50 text-red-400 hover:bg-red-500 hover:text-black transition-all disabled:opacity-60"
              >
                {recording ? (
                  <span className="blink">● {t("fm.recording", { p: recording })}</span>
                ) : (
                  <span>
                    <span className="text-red-500">●</span> {t("fm.record")}
                  </span>
                )}
              </button>
              <select
                value={recMinutes}
                onChange={(e) => setRecMinutes(Number(e.target.value))}
                aria-label={t("fm.recordLength")}
                className="px-1 py-2 bg-black border border-white/15 text-fog outline-none"
              >
                {[3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} min
                  </option>
                ))}
              </select>
              <button
                onClick={() => void makeCover()}
                className="px-3 py-2 border border-white/15 text-fog hover:text-acid hover:border-acid/60 transition-all"
              >
                {t("fm.cover")}
              </button>
              <span className="text-fog/60 normal-case tracking-normal">{t("fm.recordNote")}</span>
            </div>
          )}

          {/* the released singles: SoundCloud's player, loaded on request */}
          {SINGLES.length > 0 && (
            <div className="mt-6 border border-white/10 bg-panel p-3">
              <div className="flex items-center gap-2 flex-wrap text-[10px] uppercase tracking-[0.2em] text-fog">
                <span>{t("fm.singles")}</span>
                {SINGLES.map((single) => (
                  <button
                    key={single.url}
                    onClick={() => setPlayer(player?.url === single.url ? null : single)}
                    className={
                      "px-2.5 py-1 border transition-all " +
                      (player?.url === single.url
                        ? "border-mag text-mag"
                        : "border-white/15 text-slate-200 hover:border-mag/60 hover:text-mag")
                    }
                  >
                    ▸ {single.title}
                  </button>
                ))}
                {player && (
                  <a
                    href={player.url}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto px-2.5 py-1 border border-white/15 text-fog hover:text-acid hover:border-acid/60 transition-all normal-case tracking-normal"
                  >
                    {t("fm.openSoundcloud")} ↗
                  </a>
                )}
              </div>
              {player ? (
                <iframe
                  key={player.url}
                  title={`${player.title} — SoundCloud`}
                  src={playerSrc(player)}
                  width="100%"
                  height="166"
                  scrolling="no"
                  allow="autoplay; encrypted-media"
                  className="mt-3 border-0 bg-black"
                />
              ) : (
                <p className="mt-2 text-[10px] text-fog/70 leading-relaxed">{t("fm.singlesNote")}</p>
              )}
            </div>
          )}

          <p className="md:hidden mt-4 text-[10px] uppercase tracking-wider text-fog">
            {t("fm.next")}: {upNext.track.title} · {CHANNELS[upNext.track.style]}
          </p>

          <p className="mt-6 text-[10px] text-fog/70 leading-relaxed max-w-md">{t("fm.note")}</p>
        </div>
      </main>
    </div>
  );
}
