import { pick, t, type Localized } from "../lib/i18n";

interface Snippet {
  name: Localized;
  hint: Localized;
  code: string;
  /** Recommended tempo — applied when the snippet loads. */
  bpm?: number;
}

interface SnippetGroup {
  title: Localized;
  items: Snippet[];
}

const GROUPS: SnippetGroup[] = [
  {
    title: { es: "Aprende", en: "Learn" },
    items: [
      {
        name: { es: "Ritmo básico", en: "Basic beat" },
        hint: { es: "BUM … TAK …", en: "BOOM … TAK …" },
        code: "-- drums\nbd ~ sn ~\n\n-- hats\nhh hh ho hh",
      },
      {
        name: { es: "Doblados", en: "Doubles" },
        hint: { es: "[sn sn] y hh*2", en: "[sn sn] and hh*2" },
        code: "-- drums\nbd ~ [sn sn] ~\n\n-- hats\nhh*2 hh hh*2 hh",
      },
      {
        name: { es: "Tresillo", en: "Tresillo" },
        hint: { es: "euclidiano bd(3,8)", en: "euclidean bd(3,8)" },
        code: "-- drums\nbd(3,8)\n\n-- percusión\ncb(2,8)\n\n-- hats\nhh hh hh hh hh hh hh hh",
      },
      {
        name: { es: "Cambiante", en: "Shifting" },
        hint: { es: "<bd cp> alterna solo", en: "<bd cp> alternates" },
        code: "-- drums\n<bd cp> ~ sn ~\n\n-- hats\nhh <hh ho> hh hh?",
      },
      {
        name: { es: "Marea", en: "Tide" },
        hint: { es: "every 4 rev + pan", en: "every 4 rev + pan" },
        code: "bd ~ sn ~ | every 4 rev\nhh ho hh hh | slow 2 | pan -0.6\ncb(2,8) | pan 0.6 | gain 0.5",
      },
      {
        name: { es: "Eco espacial", en: "Space echo" },
        hint: { es: "delay, reverb y lpf", en: "delay, reverb & lpf" },
        code: "bd ~ ~ ~ | reverb 0.5\ncp ~ ~ cp | delay 0.5 | gain 0.7\nhh(5,8) | lpf 900",
      },
      {
        name: { es: "Primera melodía", en: "First melody" },
        hint: { es: "notas: c e g", en: "notes: c e g" },
        code: "-- melodía\nc e g <c5 b> | synth piano\n\n-- drums\nbd ~ sn ~\nhh hh hh hh | gain 0.5",
      },
      {
        name: { es: "Bajo que anda", en: "Walking bass" },
        hint: { es: "peldaños + scale menor", en: "degrees + scale menor" },
        code: "-- bajo\n0 0 3 5 | synth bass | scale menor\n\n-- drums\nbd ~ [sn sn] ~\nhh*2 hh hh*2 hh | gain 0.5",
      },
      {
        name: { es: "Nube", en: "Cloud" },
        hint: { es: "pad + penta + reverb", en: "pad + penta + reverb" },
        code: "-- nube\n<0 4> <2 5> | synth pad | scale penta | slow 2 | reverb 0.6\n\n-- drums\nbd(3,8) | gain 0.8",
      },
    ],
  },
  {
    title: { es: "Estilos", en: "Styles" },
    items: [
      {
        name: { es: "Techno de Detroit", en: "Detroit techno" },
        hint: { es: "strings + funk del futuro", en: "strings + future funk" },
        code: "bd ~ bd ~ | kit 909 | gain 0.9 -- bombo constante\n~ ~ cp ~ | kit 909 | reverb 0.3 | gain 0.5 -- palmada en el 2 y el 4\n~ ho ~ ho | kit 909 | gain 0.4 -- hat abierto a contratiempo\nhh hh hh hh | kit 909 | fast 2 | swing 0.3 | gain 0.28 -- hats rápidos con swing\n0 ~ [~ 0] ~ 3 ~ [~ 5] ~ | synth bass | scale menor | swing 0.15 | gain 0.7 -- bajo funk\n<0 5> ~ ~ ~ | synth pad | scale menor | slow 2 | reverb 0.55 | gain 0.55 -- cuerdas: la base\n<2 7> ~ ~ ~ | synth pad | scale menor | slow 2 | reverb 0.55 | gain 0.4 -- cuerdas: la armonía\n~ ~ <7 ~> ~ ~ <9 12> ~ ~ | synth piano | scale menor | delay 0.45 | pan 0.3 | gain 0.4 -- detalles de piano",
        bpm: 124,
      },
      {
        name: { es: "House clásico", en: "Classic house" },
        hint: { es: "swing + hat abierto", en: "swing + open hat" },
        code: "bd ~ bd ~ | kit 909 | gain 0.9 -- bombo constante\n~ ho ~ ho | kit 909 | gain 0.45 | swing 0.15 -- hat abierto a contratiempo\nhh hh hh hh | fast 2 | swing 0.4 | gain 0.3 -- hats con swing\n~ ~ cp ~ | kit linn | reverb 0.3 | gain 0.5 -- palmada\n0 ~ [~ 4] ~ 7 ~ <4 9> ~ | synth bass | scale mayor | swing 0.3 | gain 0.7 -- bajo saltarín\n<7 ~ ~ 9> ~ ~ <~ 11> ~ | synth piano | scale mayor | delay 0.5 | pan 0.3 | gain 0.45 -- pianito con eco",
        bpm: 124,
      },
      {
        name: { es: "Boom bap", en: "Boom bap" },
        hint: { es: "hip-hop con swing 0.3", en: "hip-hop with swing 0.3" },
        code: "bd ~ ~ [~ bd] ~ ~ bd ~ | kit linn | swing 0.3 | gain 0.9 -- bombo con swing\n~ ~ ~ ~ sn:4 ~ ~ [~ sn:4?] | swing 0.3 | reverb 0.15 | gain 0.7 -- caja + golpe fantasma\nhh hh hh [hh hh?] hh hh hh hh? | swing 0.4 | gain 0.4 | lpf 5000 -- hats apagados\n0 ~ ~ 0 ~ ~ -3 ~ | synth bass | scale menor | swing 0.3 | lpf 600 | gain 0.75 -- bajo gordo\n<7 5> ~ ~ ~ 3 ~ <2 5> ~ | synth piano | scale menor | reverb 0.45 | delay 0.3 | gain 0.4 -- piano triste, como sampleado",
        bpm: 90,
      },
      {
        name: { es: "Drum & bass", en: "Drum & bass" },
        hint: { es: "breakbeat a 172", en: "breakbeat at 172" },
        code: "bd ~ ~ ~ ~ ~ ~ ~ ~ ~ [~ bd] ~ ~ ~ ~ ~ | fast 2 | gain 0.9 -- bombo two-step\n~ ~ ~ ~ sn ~ ~ ~ ~ ~ ~ ~ sn ~ [~ sn?] ~ | fast 2 | gain 0.7 -- caja en el 2 y el 4\nhh ~ hh hh ~ hh hh ~ | fast 2 | gain 0.35 | pan -0.3 -- hats picados\nho? ~ ~ ho ~ ~ | fast 2 | gain 0.25 | pan 0.4 | delay 0.3 -- hat abierto suelto\n0 ~ ~ ~ ~ ~ ~ ~ | synth bass | scale menor | slow 2 | lpf 350 | gain 0.9 -- subgrave\n<0 0 5 3> | synth pad | scale menor | slow 4 | reverb 0.7 | gain 0.5 -- atmósfera de fondo",
        bpm: 172,
      },
      {
        name: { es: "Electro Miami", en: "Miami electro" },
        hint: { es: "808 + cencerro", en: "808 + cowbell" },
        code: "bd ~ ~ bd ~ ~ bd ~ | kit 808 | gain 0.9 -- bombo 808\n~ ~ ~ ~ sn ~ ~ ~ | kit 808 | reverb 0.25 | gain 0.65 -- la caja\nhh hh hh <hh ho> | kit 808 | fast 2 | gain 0.35 | pan -0.3 -- hats\ncb ~ cb ~ ~ cb ~ [cb cb?] | kit 808 | gain 0.3 | pan 0.5 | delay 0.35 -- cencerros en eco\n0 ~ 0 ~ 3 ~ <5 -2> ~ | synth bass | scale menor | gain 0.7 -- bajo robot",
        bpm: 128,
      },
      {
        name: { es: "Gabber", en: "Gabber" },
        hint: { es: "⚠ drive al máximo", en: "⚠ drive maxed out" },
        code: "bd ~ bd ~ | kit 909 | drive 0.8 | lpf 3000 | gain 0.85 -- el martillo\n~ ~ ~ ~ ~ ~ ~ [bd bd] | kit 909 | drive 0.7 | gain 0.5 -- doble bombo\n~ ~ cp ~ | kit 909 | drive 0.4 | reverb 0.25 | gain 0.5 -- palmada distorsionada\nhh*2 hh*2 hh*2 [hh*2 ho] | kit 909 | gain 0.3 -- hats frenéticos\n7 7 <7 10> 7 | synth acid | scale menor | drive 0.5 | gain 0.5 -- sinte chillando",
        bpm: 175,
      },
      {
        name: { es: "Alma de trap", en: "Trap soul" },
        hint: { es: "kit 808", en: "kit 808" },
        code: "bd ~ ~ [~ bd] ~ ~ <bd [bd bd]> ~ | kit 808 | gain 0.95 -- bombo 808 sincopado\n~ ~ ~ ~ sn ~ ~ ~ | kit 808 | reverb 0.2 | gain 0.7 -- caja en el tercer tiempo\nhh hh [hh hh] hh hh [hh hh hh] hh <hh [hh hh]> | kit 808 | gain 0.45 -- redobles de hats\n~ ~ ~ ~ ~ ~ ~ cb? | kit 808 | pan 0.5 | gain 0.25 | delay 0.4 -- cencerro ocasional\n0 ~ ~ ~ <-3 -5> ~ ~ ~ | synth bass | scale menor | slow 2 | gain 0.85 -- el sub baja de tono",
        bpm: 140,
      },
      {
        name: { es: "Ácido", en: "Acid" },
        hint: { es: "synth acid (303)", en: "synth acid (303)" },
        code: "0 [0 12] 0 7 0 [0 12] <3 5> 0 | synth acid | scale menor | delay 0.3 | gain 0.75 -- la línea del 303\nbd ~ bd ~ | kit 909 | gain 0.9 -- bombo constante\n~ ho ~ ho | kit 909 | gain 0.35 -- hat abierto a contratiempo\n~ ~ cp ~ | kit 909 | reverb 0.3 | gain 0.5 -- palmada\nhh hh hh hh | kit 909 | fast 2 | swing 0.2 | gain 0.25 -- hats bajitos",
        bpm: 122,
      },
      {
        name: { es: "Funk de los 80", en: "80s funk" },
        hint: { es: "LinnDrum con swing", en: "LinnDrum with swing" },
        code: "bd ~ [~ bd] ~ bd ~ ~ ~ | kit linn | swing 0.25 | gain 0.9\n~ ~ ~ ~ sn ~ ~ [~ sn?] | kit linn | swing 0.25 | reverb 0.2 | gain 0.65\nhh hh? hh hh hh hh? hh [hh hh] | kit linn | swing 0.3 | gain 0.4\ncb ~ ~ cb ~ ~ cb ~ | kit linn | gain 0.3 | pan 0.5\n0 ~ 4 ~ <5 7> ~ [~ 4] ~ | synth bass | scale mayor | swing 0.25 | gain 0.7",
        bpm: 108,
      },
      {
        name: { es: "Reggaetón mínimo", en: "Minimal reggaeton" },
        hint: { es: "dembow clásico", en: "classic dembow" },
        code: "bd ~ ~ bd ~ ~ bd ~ | kit 808 | gain 0.9\n~ ~ sn ~ ~ sn ~ ~ | reverb 0.2 | gain 0.6\nhh hh hh <hh [hh hh]> | gain 0.4\n0 ~ ~ 0 ~ ~ <0 3> ~ | synth bass | scale menor | gain 0.7",
        bpm: 95,
      },
      {
        name: { es: "Balcánico", en: "Balkan" },
        hint: { es: "ritmo cojo (7,16)", en: "limping beat (7,16)" },
        code: "bd(7,16) | every 4 rev | gain 0.85\nsn(3,16) | delay 0.3 | reverb 0.2 | gain 0.55\nhh(11,16) | gain 0.35 | pan 0.3\n7 ~ 9 ~ 7 ~ <11 12> ~ | synth acid | scale menor | fast 2 | gain 0.4 | pan -0.2",
        bpm: 130,
      },
      {
        name: { es: "Nana sintética", en: "Synthetic lullaby" },
        hint: { es: "pad + penta + reverb", en: "pad + penta + reverb" },
        code: "<0 4> <2 5> <4 7> <2 5> | synth pad | scale penta | slow 2 | reverb 0.7 | gain 0.8\n7 ~ ~ 9 ~ ~ <7 12> ~ | synth piano | scale penta | delay 0.5 | swing 0.2 | gain 0.5\nbd ~ ~ ~ ~ ~ ~ ~ | lpf 300 | gain 0.6",
        bpm: 75,
      },
      {
        name: { es: "Máquina de escribir", en: "Typewriter" },
        hint: { es: "rimshots nerviosos", en: "nervous rimshots" },
        code: "rm rm? rm [rm rm] rm? rm rm rm? | pan -0.5 | gain 0.6\nrm? rm rm? rm | pan 0.5 | delay 0.4 | gain 0.45\nbd ~ ~ ~ bd ~ ~ ~ | kit 909 | gain 0.8\n~ ~ ~ ~ ~ ~ cb ~ | delay 0.5 | gain 0.3",
        bpm: 120,
      },
      {
        name: { es: "Tu voz aquí", en: "Your voice here" },
        hint: { es: "graba v1 y v2 en VOZ", en: "record v1 & v2 in VOICE" },
        code: "-- graba v1 y v2 en la fila VOZ 🎤\nv1 ~ [~ v1] v1? | reverb 0.35 | gain 0.8 -- tu voz\nv2(3,8) | delay 0.45 | pan 0.4 | gain 0.6 -- tu voz en eco\nbd ~ ~ bd ~ ~ bd ~ | kit 808 | gain 0.85 -- bombo 808\nhh hh hh <hh ho> | kit 808 | gain 0.35 -- hats",
        bpm: 100,
      },
    ],
  },
];

export default function Sidebar({
  onSelect,
  className = "",
}: {
  onSelect: (code: string, bpm?: number) => void;
  className?: string;
}) {
  return (
    <aside
      className={
        "w-52 border-r border-white/10 bg-panel p-3 space-y-2 overflow-y-auto shrink-0 " + className
      }
    >
      {GROUPS.map((group) => (
        <div key={group.title.es} className="space-y-2">
          <h2 className="text-[10px] uppercase tracking-[0.2em] text-fog px-1 pt-2 first:pt-0">
            {pick(group.title)}
          </h2>
          {group.items.map((s) => (
            <button
              key={s.name.es}
              onClick={() => onSelect(s.code, s.bpm)}
              className="w-full text-left px-3 py-2 border border-white/10 hover:border-acid/60 hover:bg-acid/5 transition-all group"
            >
              <div className="text-xs text-slate-200 group-hover:text-acid">{pick(s.name)}</div>
              <div className="text-[10px] text-fog mt-0.5">{pick(s.hint)}</div>
            </button>
          ))}
        </div>
      ))}
      <p className="text-[10px] text-fog/70 px-1 pt-2 leading-relaxed">{t("sidebar.hint")}</p>
    </aside>
  );
}
