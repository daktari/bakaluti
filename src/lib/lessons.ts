import { getLang } from "./i18n";

/**
 * The bakaluti course. Each lesson introduces exactly one idea, assumes
 * zero musical knowledge, and is "passed" when the check spots the idea
 * being used in the code. Text in `intro`/`task`/`success` may use
 * `backticks` for inline code; { code } entries render as blocks.
 */

export type IntroBlock = string | { code: string };

export interface Lesson {
  id: string;
  title: string;
  intro: IntroBlock[];
  example: string;
  task: string;
  check: (code: string) => boolean;
  success: string;
}

const activeLines = (code: string) =>
  code
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("--"));

/** Checks are language-independent — shared by both lesson sets. */
const CHECKS: Record<string, (code: string) => boolean> = {
  "primer-ritmo": (code) => (code.match(/\bbd\b/g) ?? []).length >= 2,
  capas: (code) => activeLines(code).length >= 2 && /\bhh\b/.test(code),
  despensa: (code) => /\b(cb|rm|lt|mt|ht|ho)\b/.test(code),
  sabores: (code) => /:\d/.test(code),
  dobles: (code) => /\[|\*\d/.test(code),
  sorpresas: (code) => /<|\?/.test(code),
  magicos: (code) =>
    /\(\d+,\d+\)/.test(code) && code.replace(/\s+/g, " ").trim() !== "bd(3,8)",
  tuberia: (code) => /\|\s*(fast|slow|rev|every)\b/.test(code),
  efectos: (code) => /\|\s*(lpf|delay|reverb|pan)\b/.test(code),
  melodia: (code) => /\|\s*(synth|scale)\b/.test(code),
  maquinas: (code) => /\|\s*(kit|bank)\b/.test(code),
  groove: (code) => /\|\s*(swing|drive)\b/.test(code),
  voz: (code) => /\bv[1-8]\b/.test(code),
  pista: (code) =>
    activeLines(code).length >= 3 && /\|\s*kit\b/.test(code) && /\|\s*synth\b/.test(code),
};

type LessonText = Omit<Lesson, "check">;

const ES: LessonText[] = [
  {
    id: "primer-ritmo",
    title: "Tu primer ritmo",
    intro: [
      "No necesitas saber nada de música. En serio, nada.",
      "🎧 Esto:",
      { code: "bd ~ sn ~" },
      "suena así:",
      { code: "BUM … TAK …" },
      "`bd` es un golpe profundo, `sn` un golpe seco, y `~` es un silencio. Cuando le das a Play, se repite una y otra vez. Como un latido. 💓",
    ],
    example: "bd ~ sn ~",
    task: "Cambia uno de los `~` por `bd` y escucha la diferencia.",
    success:
      "¡Eso es! 🎉 Pusiste un bd donde había silencio y el ritmo se llenó de energía. Más golpes = más movimiento. Sigue jugando o pasa a la siguiente lección.",
  },
  {
    id: "capas",
    title: "Capas",
    intro: [
      "Un ritmo de verdad tiene varias cosas sonando a la vez: algo grave abajo, algo brillante arriba.",
      "Aquí cada línea es una capa. Todas suenan al mismo tiempo, en bucle.",
      "`hh` es un brillo cortito, como un tic de reloj.",
    ],
    example: "bd ~ sn ~",
    task: "Añade debajo una segunda línea que diga: `hh hh hh hh`",
    success:
      "¡Escucha eso! 🎉 Ahora hay dos capas: el latido abajo y el brillo arriba. Así se construye la música: capa a capa. Prueba a añadir una tercera.",
  },
  {
    id: "despensa",
    title: "La despensa de sonidos",
    intro: [
      "Hay más sonidos esperándote:",
      "`cp` palmada · `cb` campana · `rm` toque de madera · `ho` brillo largo",
      "`lt` `mt` `ht` — tres tambores: grave, medio y agudo.",
      "La lista completa está siempre en el panel de la derecha del Editor.",
    ],
    example: "bd ~ cp ~",
    task: "Cambia el `cp` por otro sonido: `cb`, `rm`, `lt`… el que más te guste.",
    success:
      "¡Nuevo sabor! 🎉 Cada sonido cambia el carácter del ritmo entero. Los tambores lt mt ht suenan genial seguidos: prueba `lt mt ht ~`.",
  },
  {
    id: "sabores",
    title: "Sabores",
    intro: [
      "Cada sonido no es uno solo: es una caja con muchas versiones.",
      "`bd:3` es la versión 3 del golpe profundo. `sn:7` la versión 7 del seco. Mismo tipo de golpe, otro sabor.",
      "El bombo tiene 24 versiones y la caja ¡52! Nadie las ha escuchado todas… 👀",
    ],
    example: "bd ~ sn ~",
    task: "Ponle un número a algún sonido: `bd:3`, `sn:7`, `hh:2`…",
    success:
      "¡Coleccionista de sonidos! 🎉 Cambiar versiones es la forma más rápida de hacer tuyo un ritmo sin cambiar ni un golpe.",
  },
  {
    id: "dobles",
    title: "Dobles",
    intro: [
      "Hasta ahora cada palabra ocupa un paso. Pero puedes meter dos golpes en el espacio de uno:",
      { code: "bd ~ [sn sn] ~" },
      "Los corchetes `[ ]` aprietan lo que haya dentro en un solo paso. `hh*2` es un atajo que hace lo mismo: el sonido dos veces, rapidito.",
    ],
    example: "bd ~ sn ~",
    task: "Convierte el `sn` en `[sn sn]`, o algún `~` en `hh*2`.",
    success:
      "¡Eso ya suena a batería de verdad! 🎉 Los dobles dan urgencia al ritmo. Se pueden anidar: `[bd [hh hh]]` mete tres golpes en un paso.",
  },
  {
    id: "sorpresas",
    title: "Sorpresas",
    intro: [
      "Dos trucos para que el ritmo no suene siempre igual:",
      "`<bd cp>` — alterna: una vuelta suena bd, la siguiente cp, y vuelta a empezar.",
      "`hh?` — el interrogante hace que suene solo a veces. Cada vuelta decide al azar. 🎲",
      { code: "<bd cp> hh <sn [sn sn]> hh?" },
    ],
    example: "bd hh sn hh",
    task: "Cambia el primer `hh` por `<hh ho>`, o ponle `?` al último.",
    success:
      "¡Tu ritmo ya tiene vida propia! 🎉 Escucha unas cuantas vueltas: nunca suena exactamente igual. Ese pequeño caos es lo que hace la música interesante.",
  },
  {
    id: "magicos",
    title: "Ritmos mágicos",
    intro: [
      "Este es el truco favorito de todo el mundo. Escribe:",
      { code: "bd(3,8)" },
      "y significa: reparte 3 golpes en 8 pasos, lo más equilibrado posible. El resultado es un ritmo que suena bien… siempre. Es matemática antigua: así funcionan ritmos de Cuba, África y los Balcanes.",
      "Prueba `(5,8)`, `(3,16)`, `(7,16)`… o dos líneas mágicas a la vez:",
      { code: "bd(3,8)\ncb(5,16)" },
    ],
    example: "bd(3,8)",
    task: "Cambia los números, o añade otra línea mágica: `cb(2,8)`.",
    success:
      "¡Magia confirmada! 🎉 Dos líneas euclidianas con números distintos crean ritmos que se persiguen. Prueba `bd(3,8)` + `cb(5,16)`.",
  },
  {
    id: "tuberia",
    title: "La tubería",
    intro: [
      "Al final de una línea puedes añadir trucos con una barra `|`:",
      { code: "hh hh hh hh | fast 2" },
      "`fast 2` — el doble de rápido · `slow 2` — la mitad de lento",
      "`rev` — del revés · `every 4 rev` — cada 4 vueltas, del revés",
      "Cada línea lleva sus propios trucos: los hats pueden volar mientras el bombo camina.",
    ],
    example: "bd ~ sn ~\nhh hh hh hh",
    task: "Añade `| fast 2` al final de la línea de los hats.",
    success:
      "¡Cada capa a su velocidad! 🎉 Eso que acabas de hacer se llama polirritmia y hay quien estudia años para entenderla. Tú la acabas de escribir. Prueba `| every 4 rev` en el bombo.",
  },
  {
    id: "efectos",
    title: "Efectos",
    intro: [
      "Los trucos de `|` también cambian cómo suena la línea:",
      "`| lpf 800` — apaga los agudos (como oír desde otra habitación)",
      "`| delay 0.5` — eco · `| reverb 0.5` — espacio, como en una cueva",
      "`| pan -1` — todo a la izquierda, `1` a la derecha · `| gain 0.5` — más bajito",
      "Se encadenan: `cp ~ ~ cp | delay 0.5 | pan 0.6`",
    ],
    example: "bd ~ sn ~\ncp ~ ~ cp",
    task: "Ponle `| delay 0.5` o `| reverb 0.5` a la línea de las palmadas.",
    success:
      "¡Escucha ese espacio! 🎉 Los efectos convierten golpes secos en paisajes. Truco de productor: reverb en las palmadas, nunca en el bombo.",
  },
  {
    id: "melodia",
    title: "Melodía",
    intro: [
      "Las letras `c d e f g a b` son notas: do, re, mi, fa, sol, la, si. `c5` suena más aguda y `c#` un pelín más alta.",
      { code: "c e g c5 | synth piano" },
      "¿No sabes qué notas pegan juntas? Usa números: `0 2 4 7` son peldaños de una escalera afinada — con `| scale menor` es imposible desafinar.",
      "`| synth bass` para el bajo, `| synth pad` para nubes de fondo.",
    ],
    example: "c e g c5\nbd ~ sn ~",
    task: "Añade `| synth bass` a la melodía, o cámbiala por `0 0 3 5 | synth bass | scale menor`.",
    success:
      "¡Ya haces canciones! 🎉 Ritmo + bajo + melodía: eso es un tema. Ve al Editor, junta todo lo que aprendiste y guárdalo con tu nombre. 🚀",
  },
  {
    id: "maquinas",
    title: "Máquinas legendarias",
    intro: [
      "En 1980, Roland fabricó una caja de ritmos que fue un fracaso de ventas: la TR-808. Después inventó el hip-hop, el trap y medio pop moderno.",
      "`| kit 808` — la 808, el sonido del trap · `| kit 909` — la 909, el sonido del techno · `| kit linn` — la LinnDrum, el sonido de los 80",
      { code: "bd ~ sn ~ | kit 808" },
      "Mismo patrón, otra máquina, otra alma. Y son las máquinas de verdad, sampleadas.",
    ],
    example: "bd ~ sn ~\nhh hh hh hh | gain 0.6",
    task: "Añade `| kit 808` a una línea. Luego cámbialo por `| kit 909` y escucha la diferencia.",
    success:
      "¡Historia de la música en tus dedos! 🎉 Cada máquina arrastra 40 años de género. Prueba el mismo patrón con las tres y elige tu bando.",
  },
  {
    id: "groove",
    title: "El groove",
    intro: [
      "Un robot toca perfecto. Un músico llega un pelín tarde a propósito — y eso es lo que engancha. Se llama swing.",
      "`| swing 0.3` retrasa un poquito los golpes pares de la línea. Pruébalo en los hats y nota cómo el ritmo deja de marchar y empieza a caminar.",
      "`| drive 0.5` es el otro condimento: distorsión. Poca = calor. Mucha = rabia. ⚡",
    ],
    example: "bd ~ sn ~ | kit linn\nhh hh hh hh | gain 0.6",
    task: "Ponle `| swing 0.3` a los hats, o `| drive 0.6` al bombo.",
    success:
      "¿Lo notas? 🎉 Eso que acaba de pasar no se ve en el grid: se siente en el cuerpo. El swing es la diferencia entre programar un ritmo y tocarlo.",
  },
  {
    id: "voz",
    title: "Tu voz",
    intro: [
      "Hasta ahora usaste sonidos de otros. Se acabó: aquí abajo tienes la fila VOZ. 🎤",
      "Pulsa `v1 ●`, di algo corto (¡pa!, ¡tsss!, un beatbox, tu gato…) y desde ese momento existe el token `v1`.",
      "Funciona con todo lo que sabes: `[v1 v1]`, `v1(3,8)`, `| reverb 0.5`, `| fast 2`…",
    ],
    example: "bd ~ sn ~ | kit 808",
    task: "Graba `v1` en la fila VOZ y añade una línea: `v1 ~ v1 v1?`",
    success:
      "¡Estás DENTRO del ritmo! 🎉 Tu voz es ahora un instrumento. Graba v2 con otro sonido y prueba `v2(3,8) | delay 0.4`. Y expórtalo a WAV: eso se comparte.",
  },
  {
    id: "pista",
    title: "La pista completa",
    intro: [
      "Última lección: no hay ningún truco nuevo. Toca juntarlo todo.",
      "Una pista suele tener: un bombo que ancla, algo que responde (caja o palmada), brillo arriba (hats), un bajo por debajo y un adorno que sorprende.",
      "Y un secreto más: en el Editor está `⟳ AUTO` — la app muta tu ritmo sola cada pocas vueltas. Fija con ▣ las líneas que quieras proteger y deja evolucionar el resto. Jardinería musical. 🌱",
    ],
    example: "bd ~ bd ~ | kit 909\n~ ~ cp ~ | kit 909",
    task: "Monta una pista con al menos 3 líneas, un `| kit` y un `| synth`. Luego ve al Editor, guárdala y suelta el AUTO.",
    success:
      "🎓 Curso completado. Ritmo, capas, euclidianos, efectos, máquinas legendarias, groove, tu voz… Ya haces live coding. El Editor es tuyo: monta algo, guárdalo, compártelo. 🚀",
  },
];

const EN: LessonText[] = [
  {
    id: "primer-ritmo",
    title: "Your first beat",
    intro: [
      "You don't need to know anything about music. Seriously, nothing.",
      "🎧 This:",
      { code: "bd ~ sn ~" },
      "sounds like:",
      { code: "BOOM … TAK …" },
      "`bd` is a deep hit, `sn` a sharp hit, and `~` is silence. When you hit Play, it repeats over and over. Like a heartbeat. 💓",
    ],
    example: "bd ~ sn ~",
    task: "Change one of the `~` into `bd` and hear the difference.",
    success:
      "That's it! 🎉 You put a bd where there was silence and the beat filled with energy. More hits = more movement. Keep playing or move on to the next lesson.",
  },
  {
    id: "capas",
    title: "Layers",
    intro: [
      "A real beat has several things playing at once: something deep below, something bright on top.",
      "Here, each line is a layer. They all play at the same time, looping.",
      "`hh` is a tiny shimmer, like the tick of a clock.",
    ],
    example: "bd ~ sn ~",
    task: "Add a second line below that says: `hh hh hh hh`",
    success:
      "Listen to that! 🎉 Now there are two layers: the heartbeat below and the shimmer on top. That's how music is built: layer by layer. Try adding a third.",
  },
  {
    id: "despensa",
    title: "The sound pantry",
    intro: [
      "There are more sounds waiting for you:",
      "`cp` handclap · `cb` cowbell · `rm` wood tap · `ho` long shimmer",
      "`lt` `mt` `ht` — three toms: low, mid and high.",
      "The full list is always in the right-hand panel of the Editor.",
    ],
    example: "bd ~ cp ~",
    task: "Swap the `cp` for another sound: `cb`, `rm`, `lt`… whichever you like best.",
    success:
      "New flavor! 🎉 Each sound changes the character of the whole beat. The toms lt mt ht sound great in a row: try `lt mt ht ~`.",
  },
  {
    id: "sabores",
    title: "Flavors",
    intro: [
      "Each sound isn't just one: it's a box with many versions.",
      "`bd:3` is version 3 of the deep hit. `sn:7` is version 7 of the sharp one. Same kind of hit, different flavor.",
      "The kick has 24 versions and the snare 52! Nobody has heard them all… 👀",
    ],
    example: "bd ~ sn ~",
    task: "Put a number on some sound: `bd:3`, `sn:7`, `hh:2`…",
    success:
      "Sound collector! 🎉 Swapping versions is the fastest way to make a beat your own without changing a single hit.",
  },
  {
    id: "dobles",
    title: "Doubles",
    intro: [
      "So far each word takes one step. But you can fit two hits into the space of one:",
      { code: "bd ~ [sn sn] ~" },
      "Brackets `[ ]` squeeze whatever's inside into a single step. `hh*2` is a shortcut that does the same: the sound twice, quickly.",
    ],
    example: "bd ~ sn ~",
    task: "Turn the `sn` into `[sn sn]`, or some `~` into `hh*2`.",
    success:
      "Now that sounds like real drumming! 🎉 Doubles give a beat urgency. They nest too: `[bd [hh hh]]` packs three hits into one step.",
  },
  {
    id: "sorpresas",
    title: "Surprises",
    intro: [
      "Two tricks so your beat never sounds the same twice:",
      "`<bd cp>` — alternates: one loop plays bd, the next cp, then back again.",
      "`hh?` — the question mark makes it play only sometimes. Every loop rolls the dice. 🎲",
      { code: "<bd cp> hh <sn [sn sn]> hh?" },
    ],
    example: "bd hh sn hh",
    task: "Change the first `hh` into `<hh ho>`, or put a `?` on the last one.",
    success:
      "Your beat has a life of its own now! 🎉 Listen for a few loops: it never sounds exactly the same. That little bit of chaos is what makes music interesting.",
  },
  {
    id: "magicos",
    title: "Magic rhythms",
    intro: [
      "This is everyone's favorite trick. Write:",
      { code: "bd(3,8)" },
      "and it means: spread 3 hits over 8 steps, as evenly as possible. The result is a rhythm that sounds good… always. It's ancient math: rhythms from Cuba, Africa and the Balkans work this way.",
      "Try `(5,8)`, `(3,16)`, `(7,16)`… or two magic lines at once:",
      { code: "bd(3,8)\ncb(5,16)" },
    ],
    example: "bd(3,8)",
    task: "Change the numbers, or add another magic line: `cb(2,8)`.",
    success:
      "Magic confirmed! 🎉 Two euclidean lines with different numbers create rhythms that chase each other. Try `bd(3,8)` + `cb(5,16)`.",
  },
  {
    id: "tuberia",
    title: "The pipe",
    intro: [
      "At the end of a line you can add tricks with a bar `|`:",
      { code: "hh hh hh hh | fast 2" },
      "`fast 2` — twice as fast · `slow 2` — half as slow",
      "`rev` — backwards · `every 4 rev` — every 4 loops, backwards",
      "Each line carries its own tricks: the hats can fly while the kick walks.",
    ],
    example: "bd ~ sn ~\nhh hh hh hh",
    task: "Add `| fast 2` to the end of the hats line.",
    success:
      "Every layer at its own speed! 🎉 What you just did is called polyrhythm and some people study it for years. You just typed it. Try `| every 4 rev` on the kick.",
  },
  {
    id: "efectos",
    title: "Effects",
    intro: [
      "The `|` tricks can also change how a line sounds:",
      "`| lpf 800` — turns down the highs (like hearing through a wall)",
      "`| delay 0.5` — echo · `| reverb 0.5` — space, like in a cave",
      "`| pan -1` — all the way left, `1` right · `| gain 0.5` — quieter",
      "They chain: `cp ~ ~ cp | delay 0.5 | pan 0.6`",
    ],
    example: "bd ~ sn ~\ncp ~ ~ cp",
    task: "Put `| delay 0.5` or `| reverb 0.5` on the claps line.",
    success:
      "Hear that space! 🎉 Effects turn dry hits into landscapes. Producer trick: reverb on the claps, never on the kick.",
  },
  {
    id: "melodia",
    title: "Melody",
    intro: [
      "The letters `c d e f g a b` are notes. `c5` sounds higher and `c#` a touch sharper.",
      { code: "c e g c5 | synth piano" },
      "Don't know which notes go together? Use numbers: `0 2 4 7` are steps of a tuned ladder — with `| scale menor` it's impossible to play out of tune.",
      "`| synth bass` for basslines, `| synth pad` for background clouds.",
    ],
    example: "c e g c5\nbd ~ sn ~",
    task: "Add `| synth bass` to the melody, or replace it with `0 0 3 5 | synth bass | scale menor`.",
    success:
      "You're making songs now! 🎉 Beat + bass + melody: that's a track. Go to the Editor, put together everything you learned and save it with your name on it. 🚀",
  },
  {
    id: "maquinas",
    title: "Legendary machines",
    intro: [
      "In 1980, Roland built a drum machine that flopped commercially: the TR-808. Then it invented hip-hop, trap and half of modern pop.",
      "`| kit 808` — the 808, the sound of trap · `| kit 909` — the 909, the sound of techno · `| kit linn` — the LinnDrum, the sound of the 80s",
      { code: "bd ~ sn ~ | kit 808" },
      "Same pattern, different machine, different soul. And they're the real machines, sampled.",
    ],
    example: "bd ~ sn ~\nhh hh hh hh | gain 0.6",
    task: "Add `| kit 808` to a line. Then swap it for `| kit 909` and hear the difference.",
    success:
      "Music history at your fingertips! 🎉 Each machine carries 40 years of genre. Try the same pattern on all three and pick your side.",
  },
  {
    id: "groove",
    title: "The groove",
    intro: [
      "A robot plays perfectly. A musician arrives a tiny bit late on purpose — and that's what hooks you. It's called swing.",
      "`| swing 0.3` delays the even steps of the line a little. Try it on the hats and feel the beat stop marching and start walking.",
      "`| drive 0.5` is the other seasoning: distortion. A little = warmth. A lot = rage. ⚡",
    ],
    example: "bd ~ sn ~ | kit linn\nhh hh hh hh | gain 0.6",
    task: "Put `| swing 0.3` on the hats, or `| drive 0.6` on the kick.",
    success:
      "Feel that? 🎉 What just happened doesn't show in the grid: you feel it in your body. Swing is the difference between programming a beat and playing one.",
  },
  {
    id: "voz",
    title: "Your voice",
    intro: [
      "So far you've used other people's sounds. That ends now: right below is the VOICE row. 🎤",
      "Press `v1 ●`, say something short (pa!, tsss!, beatbox, your cat…) and from that moment the token `v1` exists.",
      "It works with everything you know: `[v1 v1]`, `v1(3,8)`, `| reverb 0.5`, `| fast 2`…",
    ],
    example: "bd ~ sn ~ | kit 808",
    task: "Record `v1` in the VOICE row and add a line: `v1 ~ v1 v1?`",
    success:
      "You're INSIDE the beat! 🎉 Your voice is an instrument now. Record v2 with another sound and try `v2(3,8) | delay 0.4`. Then export to WAV — that's the shareable one.",
  },
  {
    id: "pista",
    title: "The full track",
    intro: [
      "Last lesson: no new tricks. Time to put it all together.",
      "A track usually has: a kick that anchors, something that answers (snare or clap), shimmer on top (hats), a bass underneath and one surprise.",
      "One more secret: in the Editor there's `⟳ AUTO` — the app mutates your beat on its own every few loops. Lock the lines you want to protect with ▣ and let the rest evolve. Musical gardening. 🌱",
    ],
    example: "bd ~ bd ~ | kit 909\n~ ~ cp ~ | kit 909",
    task: "Build a track with at least 3 lines, one `| kit` and one `| synth`. Then go to the Editor, save it and unleash AUTO.",
    success:
      "🎓 Course complete. Beats, layers, euclideans, effects, legendary machines, groove, your own voice… You're live coding now. The Editor is yours: build something, save it, share it. 🚀",
  },
];

export function getLessons(): Lesson[] {
  const texts = getLang() === "en" ? EN : ES;
  return texts.map((text) => ({ ...text, check: CHECKS[text.id] }));
}

// ------------------------------------------------- recipes & deep dives

export type ExtraKind = "receta" | "fondo";

/** Goal-oriented mini-guides ("recetas") and optional deep dives ("a fondo").
 *  No challenge, no progress — reference material with playable examples. */
export interface Extra {
  id: string;
  kind: ExtraKind;
  title: string;
  intro: IntroBlock[];
  example: string;
}

const EXTRAS_ES: Extra[] = [
  {
    id: "receta-redoble",
    kind: "receta",
    title: "¿Cómo hago un redoble?",
    intro: [
      "Un redoble es meter varios golpes en el espacio de uno. De suave a intenso:",
      { code: "bd ~ [sn sn] ~" },
      { code: "bd ~ sn*3 ~" },
      "Y el redoble de hats del trap — mezclar velocidades dentro de la misma línea:",
      { code: "hh hh [hh hh] hh [hh hh hh] hh hh" },
    ],
    example: "bd ~ [sn sn] ~\nhh hh hh [hh hh hh]",
  },
  {
    id: "receta-variacion",
    kind: "receta",
    title: "¿Cómo evito que suene siempre igual?",
    intro: [
      "Tres herramientas, de la más predecible a la más caótica.",
      "`<a b>` alterna en cada vuelta — cambio regular, hipnótico:",
      { code: "<bd cp> ~ sn ~" },
      "`?` tira un dado en cada vuelta — caos controlado:",
      { code: "bd ~ sn ~\nhh hh? hh hh?" },
      "`every` guarda un giro para cada N vueltas — sorpresa programada:",
      { code: "bd ~ sn cp | every 4 rev" },
    ],
    example: "<bd cp> ~ sn ~ | every 4 rev\nhh hh? hh hh?",
  },
  {
    id: "receta-pro",
    kind: "receta",
    title: "¿Cómo sueno más pro?",
    intro: [
      "Tres reglas de mezcla que usan todos los productores:",
      "1 · El bombo manda: dale `gain 0.9` y pon todo lo demás por debajo — si todo grita, nada se oye.",
      "2 · Reparte el espacio: `pan` negativo a la izquierda, positivo a la derecha.",
      "3 · La `reverb` va en palmadas y cajas. En el bombo, nunca — lo vuelve barro.",
      { code: "bd ~ bd ~ | kit 909 | gain 0.9\n~ ~ cp ~ | kit 909 | reverb 0.35 | gain 0.5\nhh hh hh hh | fast 2 | gain 0.3 | pan -0.3\ncb(2,8) | gain 0.3 | pan 0.4" },
    ],
    example: "bd ~ bd ~ | kit 909 | gain 0.9\n~ ~ cp ~ | kit 909 | reverb 0.35 | gain 0.5\nhh hh hh hh | fast 2 | gain 0.3 | pan -0.3",
  },
  {
    id: "receta-melodia",
    kind: "receta",
    title: "¿Cómo hago melodías que no desafinen?",
    intro: [
      "Usa peldaños (números) con una escala: la escalera ya está afinada, es imposible fallar.",
      { code: "0 2 4 7 | synth piano | scale menor" },
      "Para un bajo con intención: insiste en la raíz (`0`) y visita vecinos de vez en cuando.",
      { code: "0 0 3 5 | synth bass | scale menor" },
      "Y para flotar sin rumbo fijo, la escala `penta` — todo pega con todo:",
      { code: "<0 4> <2 7> <4 9> <2 5> | synth pad | scale penta | slow 2 | reverb 0.5" },
    ],
    example: "0 0 3 5 | synth bass | scale menor\nbd ~ sn ~",
  },
  {
    id: "receta-acordes",
    kind: "receta",
    title: "¿Cómo hago acordes?",
    intro: [
      "Cada línea toca una nota a la vez… pero nada impide que dos líneas suenen juntas. Dos pads en paralelo = un acorde:",
      { code: "<0 5> ~ ~ ~ | synth pad | scale menor | slow 2 | reverb 0.5\n<2 7> ~ ~ ~ | synth pad | scale menor | slow 2 | reverb 0.5 | gain 0.7" },
      "La primera línea pone la base, la segunda la armonía dos peldaños más arriba. Cambia los pares — `<0 3>`, `<2 5>` — y el acorde viaja. Así se hacen los strings del techno de Detroit.",
    ],
    example: "<0 5> ~ ~ ~ | synth pad | scale menor | slow 2 | reverb 0.5\n<2 7> ~ ~ ~ | synth pad | scale menor | slow 2 | reverb 0.5 | gain 0.7\nbd ~ bd ~ | kit 909 | gain 0.8",
  },
  {
    id: "fondo-persiguen",
    kind: "fondo",
    title: "¿Por qué las líneas se persiguen?",
    intro: [
      "Escucha esto un rato largo: una línea de 3 pasos contra una de 4.",
      { code: "bd ~ cb\nhh hh hh hh" },
      "La línea de 4 da la vuelta cada 4 pasos. La de 3, cada 3. Solo vuelven a coincidir cada 12 pasos — y hasta entonces, el cencerro cae cada vez en un sitio distinto respecto a los hats.",
      "Esto se llama polimetría, y aquí es gratis: basta escribir líneas de largos distintos. 3 contra 4, 5 contra 8, 7 contra 16… cuanto más raros los números, más tarda el dibujo en repetirse.",
      { code: "bd ~ ~ ~ ~\ncb ~ ~ ~ ~ ~ ~\nhh hh hh hh" },
    ],
    example: "bd ~ cb\nhh hh hh hh",
  },
  {
    id: "fondo-escalas",
    kind: "fondo",
    title: "¿Qué es una escala de verdad?",
    intro: [
      "Entre una nota y su doble aguda (`c` → `c5`) hay 12 escalones iguales: los semitonos. Una escala es elegir 7 de esos 12 y prometerte usar solo esos.",
      "`mayor` elige los que suenan luminosos. `menor` cambia tres escalones y todo se vuelve melancólico. Mismos peldaños, distinta escalera — compara:",
      { code: "0 2 4 7 | synth piano | scale mayor" },
      { code: "0 2 4 7 | synth piano | scale menor" },
      "Por eso los números nunca desafinan: tú eliges el peldaño, la escalera ya viene afinada. Las notas con letra (`c e g`) son el modo experto: ahí eliges el semitono exacto, con libertad para acertar… y para fallar.",
    ],
    example: "0 2 4 7 | synth piano | scale menor\nbd ~ sn ~ | gain 0.7",
  },
];

const EXTRAS_EN: Extra[] = [
  {
    id: "receta-redoble",
    kind: "receta",
    title: "How do I make a roll?",
    intro: [
      "A roll packs several hits into the space of one. From soft to intense:",
      { code: "bd ~ [sn sn] ~" },
      { code: "bd ~ sn*3 ~" },
      "And the trap hat roll — mixing speeds inside one line:",
      { code: "hh hh [hh hh] hh [hh hh hh] hh hh" },
    ],
    example: "bd ~ [sn sn] ~\nhh hh hh [hh hh hh]",
  },
  {
    id: "receta-variacion",
    kind: "receta",
    title: "How do I keep it from sounding the same?",
    intro: [
      "Three tools, from most predictable to most chaotic.",
      "`<a b>` alternates every loop — regular, hypnotic change:",
      { code: "<bd cp> ~ sn ~" },
      "`?` rolls a die every loop — controlled chaos:",
      { code: "bd ~ sn ~\nhh hh? hh hh?" },
      "`every` saves a twist for every Nth loop — scheduled surprise:",
      { code: "bd ~ sn cp | every 4 rev" },
    ],
    example: "<bd cp> ~ sn ~ | every 4 rev\nhh hh? hh hh?",
  },
  {
    id: "receta-pro",
    kind: "receta",
    title: "How do I sound more pro?",
    intro: [
      "Three mixing rules every producer uses:",
      "1 · The kick rules: give it `gain 0.9` and keep everything else below — when everything shouts, nothing is heard.",
      "2 · Share the space: negative `pan` goes left, positive right.",
      "3 · `reverb` belongs on claps and snares. Never on the kick — it turns to mud.",
      { code: "bd ~ bd ~ | kit 909 | gain 0.9\n~ ~ cp ~ | kit 909 | reverb 0.35 | gain 0.5\nhh hh hh hh | fast 2 | gain 0.3 | pan -0.3\ncb(2,8) | gain 0.3 | pan 0.4" },
    ],
    example: "bd ~ bd ~ | kit 909 | gain 0.9\n~ ~ cp ~ | kit 909 | reverb 0.35 | gain 0.5\nhh hh hh hh | fast 2 | gain 0.3 | pan -0.3",
  },
  {
    id: "receta-melodia",
    kind: "receta",
    title: "How do I write melodies that stay in tune?",
    intro: [
      "Use degrees (numbers) with a scale: the ladder comes pre-tuned, you can't miss.",
      { code: "0 2 4 7 | synth piano | scale menor" },
      "For a bassline with intent: insist on the root (`0`) and visit neighbors now and then.",
      { code: "0 0 3 5 | synth bass | scale menor" },
      "And to float freely, the `penta` scale — everything fits with everything:",
      { code: "<0 4> <2 7> <4 9> <2 5> | synth pad | scale penta | slow 2 | reverb 0.5" },
    ],
    example: "0 0 3 5 | synth bass | scale menor\nbd ~ sn ~",
  },
  {
    id: "receta-acordes",
    kind: "receta",
    title: "How do I make chords?",
    intro: [
      "Each line plays one note at a time… but nothing stops two lines from sounding together. Two parallel pads = a chord:",
      { code: "<0 5> ~ ~ ~ | synth pad | scale menor | slow 2 | reverb 0.5\n<2 7> ~ ~ ~ | synth pad | scale menor | slow 2 | reverb 0.5 | gain 0.7" },
      "The first line lays the base, the second the harmony two degrees up. Change the pairs — `<0 3>`, `<2 5>` — and the chord travels. That's how Detroit techno strings are made.",
    ],
    example: "<0 5> ~ ~ ~ | synth pad | scale menor | slow 2 | reverb 0.5\n<2 7> ~ ~ ~ | synth pad | scale menor | slow 2 | reverb 0.5 | gain 0.7\nbd ~ bd ~ | kit 909 | gain 0.8",
  },
  {
    id: "fondo-persiguen",
    kind: "fondo",
    title: "Why do lines chase each other?",
    intro: [
      "Listen to this for a good while: a 3-step line against a 4-step one.",
      { code: "bd ~ cb\nhh hh hh hh" },
      "The 4-step line loops every 4 steps. The 3-step one, every 3. They only meet again every 12 steps — until then, the cowbell lands somewhere different against the hats every time.",
      "This is called polymeter, and here it's free: just write lines of different lengths. 3 against 4, 5 against 8, 7 against 16… the stranger the numbers, the longer the pattern takes to repeat.",
      { code: "bd ~ ~ ~ ~\ncb ~ ~ ~ ~ ~ ~\nhh hh hh hh" },
    ],
    example: "bd ~ cb\nhh hh hh hh",
  },
  {
    id: "fondo-escalas",
    kind: "fondo",
    title: "What is a scale, really?",
    intro: [
      "Between a note and its higher double (`c` → `c5`) there are 12 equal steps: semitones. A scale means choosing 7 of those 12 and promising to use only those.",
      "`mayor` picks the bright-sounding ones. `menor` shifts three steps and everything turns melancholic. Same degrees, different ladder — compare:",
      { code: "0 2 4 7 | synth piano | scale mayor" },
      { code: "0 2 4 7 | synth piano | scale menor" },
      "That's why numbers never go out of tune: you pick the step, the ladder comes tuned. Letter notes (`c e g`) are expert mode: you pick the exact semitone — free to nail it… and to miss.",
    ],
    example: "0 2 4 7 | synth piano | scale menor\nbd ~ sn ~ | gain 0.7",
  },
];

export function getExtras(): Extra[] {
  return getLang() === "en" ? EXTRAS_EN : EXTRAS_ES;
}
