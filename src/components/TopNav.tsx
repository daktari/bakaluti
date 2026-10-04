import { useState } from "react";
import { getLang, t, toggleLang } from "../lib/i18n";
import Rich from "./Rich";

export type Tab = "editor" | "fm" | "ia" | "learn" | "library";

const TABS: Tab[] = ["editor", "fm", "ia", "learn", "library"];

const LINKS = [
  { label: "strudel.cc", href: "https://strudel.cc" },
  { label: "tidalcycles.org", href: "https://tidalcycles.org" },
  { label: "Dirt-Samples", href: "https://github.com/tidalcycles/Dirt-Samples" },
  { label: "tidal-drum-machines", href: "https://github.com/ritchse/tidal-drum-machines" },
];

export default function TopNav({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const [about, setAbout] = useState(false);

  return (
    <header className="flex flex-wrap md:flex-nowrap items-center gap-x-3 gap-y-1 md:gap-6 px-3 md:px-5 py-1.5 md:py-0 md:h-12 border-b border-acid/25 bg-panel shrink-0">
      <div className="text-sm tracking-widest select-none uppercase whitespace-nowrap shrink-0">
        <span className="text-fog">[</span>
        <span className="text-acid">baka</span>
        <span className="text-mag">luti</span>
        <span className="text-fog hidden md:inline"> v1.0</span>
        <span className="text-fog">]</span>
        <span className="text-acid blink">▮</span>
      </div>
      {/* On a phone the tabs get their own full-width row under the logo
          (and scroll sideways if even that is short) instead of pushing the
          last ones and the ?/lang buttons off a clipped viewport. */}
      <nav className="flex gap-1 text-xs basis-full md:basis-auto order-last md:order-none min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((id) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={
              "shrink-0 px-2 md:px-3 py-1.5 uppercase tracking-widest transition-colors " +
              (tab === id
                ? "bg-acid text-black font-bold"
                : "text-fog hover:text-acid hover:bg-acid/10")
            }
          >
            {t(`nav.${id}`)}
          </button>
        ))}
      </nav>
      <span className="ml-auto text-[10px] text-fog/60 uppercase tracking-widest select-none hidden md:inline">
        {t("nav.tagline")}
      </span>
      <button
        onClick={() => setAbout(true)}
        title={t("about.button")}
        className="md:ml-3 ml-auto shrink-0 px-2 py-1 text-[10px] border border-white/15 text-fog hover:text-acid hover:border-acid/60 transition-all"
      >
        ?
      </button>
      <button
        onClick={toggleLang}
        title="español / english"
        className="shrink-0 px-2 py-1 text-[10px] uppercase tracking-widest border border-white/15 text-fog hover:text-acid hover:border-acid/60 transition-all"
      >
        {getLang() === "es" ? "es→en" : "en→es"}
      </button>

      {about && (
        <div
          className="fixed inset-0 z-50 bg-ink/90 backdrop-blur-sm flex items-center justify-center"
          onClick={() => setAbout(false)}
        >
          <div
            className="max-w-md mx-4 border border-acid/30 bg-panel p-6 space-y-4 shadow-[6px_6px_0_rgba(200,255,0,0.15)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm tracking-widest select-none uppercase">
              <span className="text-fog">[</span>
              <span className="text-acid">baka</span>
              <span className="text-mag">luti</span>
              <span className="text-fog">]</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              <Rich text={t("about.sounds")} />
            </p>
            <p className="text-xs text-slate-300 leading-relaxed">
              <Rich text={t("about.inspired")} />
            </p>
            <p className="text-xs text-slate-400 leading-relaxed border border-white/10 p-3">
              {t("about.privacy")}
            </p>
            <div className="flex flex-wrap gap-2 text-[10px]">
              {LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2 py-1 border border-white/15 text-fog hover:text-acid hover:border-acid/60 transition-all"
                >
                  {link.label} ↗
                </a>
              ))}
            </div>
            <p className="text-[10px] text-fog/70">{t("about.license")}</p>
            <button
              onClick={() => setAbout(false)}
              className="w-full px-4 py-2 text-xs font-bold uppercase tracking-widest text-acid border border-acid hover:bg-acid hover:text-black transition-all"
            >
              {t("about.close")}
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
