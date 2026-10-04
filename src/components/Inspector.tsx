import { SOUNDS, type SoundColor } from "../lib/sounds";
import { audioEngine } from "../lib/audioEngine";
import { pick, t } from "../lib/i18n";
import Rich from "./Rich";

const COLOR_TEXT: Record<SoundColor, string> = {
  cyan: "text-acid",
  fuchsia: "text-mag",
  slate: "text-white/80",
  amber: "text-warn",
};

function Row({ code, color, text }: { code: string; color: string; text: string }) {
  return (
    <div className="flex gap-2 text-[11px] leading-relaxed">
      <code className={`w-20 shrink-0 ${color}`}>{code}</code>
      <span className="text-slate-400">{text}</span>
    </div>
  );
}

function Title({ text }: { text: string }) {
  return <h2 className="text-[10px] uppercase tracking-[0.2em] text-fog mb-2">{text}</h2>;
}

export default function Inspector({
  warnings,
  className = "",
}: {
  warnings: string[];
  className?: string;
}) {
  return (
    <aside
      className={
        "w-64 border-l border-white/10 bg-panel p-4 space-y-5 overflow-y-auto shrink-0 " + className
      }
    >
      <section>
        <Title text={t("insp.sounds")} />
        <div className="space-y-1.5">
          {SOUNDS.map((s) => (
            <button
              key={s.id}
              onClick={() => void audioEngine.previewSound(s.id)}
              title={t("vox.playTitle")}
              aria-label={`${s.id} — ${t("vox.playTitle")}`}
              className="w-full flex items-baseline gap-3 text-xs text-left hover:bg-acid/5 px-1 -mx-1 transition-colors"
            >
              <code className={`w-6 font-bold ${COLOR_TEXT[s.color]}`}>{s.id}</code>
              <span className="text-slate-400 flex-1">{pick(s.name)}</span>
              <span className="text-fog/70">{s.feel}</span>
            </button>
          ))}
          <div className="flex items-baseline gap-3 text-xs">
            <code className="w-6 font-bold text-fog">~</code>
            <span className="text-slate-400 flex-1">{t("insp.silence")}</span>
            <span className="text-fog/70">…</span>
          </div>
        </div>
        <p className="text-[10px] text-fog/70 mt-2 leading-relaxed">{t("insp.tap")}</p>
        <p className="text-[10px] text-fog/70 mt-1 leading-relaxed">
          <Rich text={t("insp.aliases")} />
        </p>
      </section>

      <section>
        <Title text={t("insp.kits")} />
        <div className="space-y-1.5">
          <Row code="| kit 808" color="text-warn" text={t("insp.kit808")} />
          <Row code="| kit 909" color="text-warn" text={t("insp.kit909")} />
          <Row code="| kit linn" color="text-warn" text={t("insp.kitlinn")} />
        </div>
        <p className="text-[10px] text-fog/70 mt-2 leading-relaxed">{t("insp.kitsNote")}</p>
      </section>

      <section>
        <Title text={t("insp.voice")} />
        <p className="text-[11px] text-slate-400 leading-relaxed">
          <Rich text={t("insp.voiceBody")} />
        </p>
      </section>

      <section>
        <Title text={t("insp.variants")} />
        <p className="text-[11px] text-slate-400 leading-relaxed">
          <Rich text={t("insp.variantsBody")} />
        </p>
      </section>

      <section>
        <Title text={t("insp.tricks")} />
        <div className="space-y-1.5">
          <Row code="[bd bd]" color="text-acid" text={t("insp.trickGroup")} />
          <Row code="bd*2" color="text-acid" text={t("insp.trickRepeat")} />
          <Row code="<bd sn>" color="text-mag" text={t("insp.trickAlt")} />
          <Row code="bd(3,8)" color="text-warn" text={t("insp.trickEuclid")} />
          <Row code="hh?" color="text-white/80" text={t("insp.trickProb")} />
          <Row code="bd^ 0^" color="text-acid" text={t("insp.trickAccent")} />
          <Row code="0 _ 3" color="text-acid" text={t("insp.trickTie")} />
        </div>
      </section>

      <section>
        <Title text={t("insp.melody")} />
        <div className="space-y-1.5">
          <Row code="c e g b" color="text-ice" text={t("insp.melNotes")} />
          <Row code="c5 c#" color="text-ice" text={t("insp.melOct")} />
          <Row code="0 2 4 7" color="text-ice" text={t("insp.melDegrees")} />
          <Row code="| synth bass" color="text-mag" text={t("insp.melSynth")} />
          <Row code="| cutoff 500" color="text-mag" text={t("insp.cutoff")} />
          <Row code="| env 0.6" color="text-mag" text={t("insp.env")} />
          <Row code="| decay 0.3" color="text-mag" text={t("insp.decay")} />
          <Row code="| scale menor" color="text-mag" text={t("insp.melScale")} />
        </div>
      </section>

      <section>
        <h2 className="text-[10px] uppercase tracking-[0.2em] text-fog mb-2">
          {t("insp.pipe")} <span className="text-acid">|</span>
        </h2>
        <p className="text-[11px] text-fog mb-2 leading-relaxed">
          <Rich text={t("insp.pipeIntro")} />
        </p>
        <div className="space-y-1.5">
          <Row code="| fast 2" color="text-acid" text={t("insp.fast")} />
          <Row code="| slow 2" color="text-acid" text={t("insp.slow")} />
          <Row code="| rev" color="text-mag" text={t("insp.rev")} />
          <Row code="| every 4 rev" color="text-mag" text={t("insp.every")} />
          <Row code="| swing 0.3" color="text-acid" text={t("insp.swing")} />
          <Row code="| lpf 800" color="text-warn" text={t("insp.lpf")} />
          <Row code="| hpf 200" color="text-warn" text={t("insp.hpf")} />
          <Row code="| res 0.5" color="text-warn" text={t("insp.res")} />
          <Row code="| delay 0.3" color="text-warn" text={t("insp.delay")} />
          <Row code="| reverb 0.4" color="text-warn" text={t("insp.reverb")} />
          <Row code="| size 0.8" color="text-warn" text={t("insp.size")} />
          <Row code="| drive 0.5" color="text-warn" text={t("insp.drive")} />
          <Row code="| duck 0.6" color="text-warn" text={t("insp.duck")} />
          <Row code="| sub 0.5" color="text-warn" text={t("insp.sub")} />
          <Row code="| rumble 0.4" color="text-warn" text={t("insp.rumble")} />
          <Row code="| pitch -3" color="text-warn" text={t("insp.pitch")} />
          <Row code="| cut 0.1" color="text-warn" text={t("insp.cut")} />
          <Row code="| pan -1" color="text-warn" text={t("insp.pan")} />
          <Row code="| gain 0.5" color="text-warn" text={t("insp.gain")} />
        </div>
      </section>

      <section>
        <Title text={t("insp.how")} />
        <ul className="text-[11px] text-slate-400 space-y-1.5 leading-relaxed">
          {["insp.how1", "insp.how2", "insp.how3", "insp.how4", "insp.how5", "insp.how6"].map(
            (key) => (
              <li key={key}>
                · <Rich text={t(key)} />
              </li>
            )
          )}
        </ul>
      </section>

      <section>
        <Title text={t("insp.note")} />
        <p className="text-[11px] text-fog leading-relaxed">{t("insp.noteBody")}</p>
      </section>

      {warnings.length > 0 && (
        <section className="border border-warn/40 bg-warn/5 p-3">
          <h2 className="text-[10px] uppercase tracking-[0.2em] text-warn mb-2">{t("insp.warn")}</h2>
          <ul className="text-[11px] text-warn/90 space-y-1 leading-relaxed">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
