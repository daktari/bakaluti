# bakaluti 🥁

**En producción → [bakaluti.com](https://bakaluti.com)**

Antes «bombocaja». Un mini-playground web para aprender a hacer ritmos escribiendo texto.
Inspirado en Strudel / TidalCycles, pero radicalmente simplificado para
gente sin ningún conocimiento musical.

![El editor de bakaluti: código que baila, rejilla de pasos y todo el lenguaje a la vista](docs/editor.png)

## Correr (solo necesitas Docker)

```bash
docker compose up --build          # desarrollo con hot reload
```

Abre http://localhost:5173

## Producción

```bash
docker compose --profile prod up --build prod   # build + nginx
```

Abre http://localhost:8880. El build es una SPA estática (`npm run build` →
`dist/`), así que también puedes desplegarla gratis en Cloudflare Pages o
Netlify: build command `npm run build`, output `dist`. Al desplegar,
actualiza `og:image` en `index.html` con la URL absoluta de tu dominio
(los scrapers de WhatsApp/Twitter no siguen rutas relativas).

Los sonidos base y los 3 kits van **self-hosted** en `public/samples/`
(~2,6 MB): la app suena aunque GitHub no responda; las variantes extra
siguen llegando de los repos de Strudel.

## El lenguaje (todo el lenguaje)

| token | sonido            |
| ----- | ----------------- |
| `bd`  | golpe profundo    |
| `sn`  | golpe seco        |
| `hh`  | brillo corto      |
| `ho`  | brillo largo      |
| `cp`  | palmada           |
| `rm`  | toque de madera   |
| `cb`  | campana           |
| `lt`  | tambor grave      |
| `mt`  | tambor medio      |
| `ht`  | tambor agudo      |
| `~`   | silencio          |

- Sonidos separados por espacios.
- `bd:3` = variante 3 del bombo (cada sonido tiene varias versiones).
- Cada línea es una capa; todas suenan a la vez en bucle.
- Líneas que empiezan con `--` son comentarios.
- Tempo ajustable (60–180 BPM) y volumen general + por línea.

### Mini-notación

| sintaxis  | qué hace                                    |
| --------- | ------------------------------------------- |
| `[bd bd]` | dos golpes en el espacio de un paso         |
| `bd*2`    | lo mismo, escrito más corto                 |
| `<bd sn>` | alterna: una vuelta bd, la siguiente sn     |
| `bd(3,8)` | ritmo euclidiano: 3 golpes repartidos en 8  |
| `hh?`     | suena solo a veces (50%)                    |

Se pueden combinar y anidar: `[bd hh]*2`, `<bd [sn sn]>?`…

### Trucos con `|`

Al final de una línea, separados por `|`:

| comando        | qué hace                              |
| -------------- | ------------------------------------- |
| `\| fast 2`    | la línea va el doble de rápido        |
| `\| slow 2`    | la mitad de lento                     |
| `\| rev`       | los pasos del revés                   |
| `\| every 4 rev` | cada 4 vueltas suena del revés      |
| `\| lpf 800`   | filtro: apaga los agudos (100–12000)  |
| `\| delay 0.3` | eco (0–1)                             |
| `\| reverb 0.4`| espacio (0–1)                         |
| `\| pan -1`    | izquierda ↔ derecha (-1 a 1)          |
| `\| gain 0.5`  | volumen de la línea (0–2)             |

```
bd ~ sn ~ | every 4 rev
hh hh hh hh | fast 2 | lpf 900
cp ~ ~ cp | delay 0.5 | pan 0.4
```

### Cajas de ritmos

`| kit 808` (Roland TR-808), `| kit 909` (TR-909) o `| kit linn` (LinnDrum):
mismo patrón, máquina legendaria sampleada de verdad. También se acepta la
forma de Strudel: `| bank RolandTR808`. Y los alias de sonidos de Strudel
(`sd`, `oh`, `rim`) valen igual que los nuestros (`sn`, `ho`, `rm`).

```
bd ~ sn ~ | kit 808
hh*2 hh hh*2 hh | kit 909
```

### Tu voz (v1…v8)

Graba hasta 8 sonidos con el micro (fila **VOZ** del Editor) y úsalos como
tokens: `v1 ~ v1 v2 | reverb 0.5`. Se combinan con toda la mini-notación y
persisten en tu navegador (IndexedDB). El export a WAV los incluye.

### Modo AUTO

El botón **⟳ AUTO** hace que la app mute el ritmo sola cada 4 vueltas
(cambia un sonido, añade un `?`, dobla un golpe…). Fija con ▣ las líneas
que te gusten y deja evolucionar el resto. Aprende viendo a la máquina
live-codear.

### Groove

`| swing 0.3` arrastra los pasos pares (el groove del hip-hop/house),
`| drive 0.5` añade distorsión, y el hat cerrado corta al abierto como en
una batería real.

### Melodía

- Notas: `c d e f g a b` (do–si), `c5` = más aguda, `c#` = sostenido.
- Peldaños: `0 2 4 7` — números sobre una escala; imposible desafinar.
- `| synth piano` (o `bass`, `pad`) elige el instrumento.
- `| scale menor` (o `mayor`, `penta`, `dorica`, `frigia`, `lidia`) elige la escala de los peldaños.

```
c e g <c5 b> | synth piano
0 0 3 5 | synth bass | scale menor
bd ~ sn ~
```

La mini-notación completa funciona también con notas: `[c e] g`, `<c e>?`…

### Editor

CodeMirror con resaltado de sintaxis y autocompletado, y **el código baila**:
cada token se ilumina justo cuando suena. `Ctrl/⌘+Enter` = Play ·
`Ctrl/⌘+.` = Stop. El fondo del editor es un espectro que reacciona al audio.

### Exportar

Botón 🔴 Exportar: graba 4 vueltas del patrón (render offline, sin ruido)
y descarga un `.wav` listo para compartir donde quieras.

```
-- drums
bd ~ sn ~

-- hats
hh hh ho hh
```

## Sonidos

Los samples reales vienen de [Dirt-Samples](https://github.com/tidalcycles/Dirt-Samples)
(la misma librería que usa Strudel) y se descargan del navegador la primera
vez que se usan. Sin conexión, `bd` / `sn` / `hh` suenan con versiones
sintetizadas de respaldo.

## La radio: bakaluti FM 📻

Pestaña **FM**: una emisora 24/7 que emite código, no audio. La programación
es una función del reloj — todo el que sintoniza en el mismo momento oye el
mismo tema, sin servidores, y la parrilla no se acaba nunca (cada bloque de
150s siembra al compositor con su propio número). Dos diales: **bakaluti FM**
(techno/house/ambient por franjas horarias) y **niebla FM** (ambient 24/7
para trabajar). Cada 4 bloques suena un tema ancla curado de la casa, los
temas evolucionan por dentro (entran capas, se despiden al final) y el botón
**▸ remezclar esto** se lleva el tema sonante a tu editor. La calidad de lo
generado la vigilan un linter musical (10.000 temas validados en los tests)
y revisiones a ciegas de un agente crítico independiente.

![bakaluti FM reproduciendo un tema generado, con su partitura en directo](docs/fm.png)

## La residente: pídele un ritmo 🎧

Pestaña **Residente**: la DJ residente de la casa. Le pides en lenguaje
natural («un techno berlinés duro y seco», «algo para estudiar») y el patrón
se escribe solo en pantalla, sonando según aparece. Luego se vibe-codea a
peticiones («añádele más groove»), con historial de checkpoints, knobs de
mood, diff de cada ajuste y sesiones compartibles por URL. En el Editor, el
botón **◉ asistente IA** aplica lo mismo sobre cualquier patrón cargado.
Corre en Workers AI dentro de la capa gratuita; en desarrollo apunta a un
modelo local tuyo.

![La cabina de peticiones de la residente, con el hilo de la sesión y los knobs de mood](docs/residente.png)

### IA en local

En desarrollo no hay Workers AI: la cabina llama a un servidor **compatible
con la API de OpenAI** en el puerto **1234** de tu máquina (vía el proxy
`/llm` del dev server, así que sin líos de CORS).

- **LM Studio** (lo más fácil): descarga un modelo — recomendado uno tipo
  *coder*, p. ej. Qwen Coder de 7B para iterar rápido — y en la pestaña del
  servidor dale a **Start Server** (el puerto 1234 es el de serie). La app
  detecta sola qué modelo tienes cargado.
- **Ollama u otro servidor**: también valen (API OpenAI-compatible), pero
  sirven en otro puerto — cambia el `target` del proxy `/llm` en
  [`vite.config.ts`](vite.config.ts) (p. ej. `http://host.docker.internal:11434`
  para Ollama).
- **Sin modelo local no pasa nada**: el resto de la app funciona igual;
  solo las funciones de IA responderán con error.

## Aprender, guardar y compartir

- **Learn**: curso de 10 lecciones progresivas (de "tu primer ritmo" a melodía
  con escalas). El progreso se guarda en tu navegador.
- **Guardar**: botón 💾 en el Editor → tus ritmos aparecen en Library.
- **Compartir**: botón 🔗 copia un enlace con el ritmo codificado en la URL —
  quien lo abra lo verá cargado en su editor. Sin servidor, sin cuentas.

## Idioma, móvil y offline

- Interfaz y curso completos en **español e inglés** — toggle `es→en` arriba
  a la derecha.
- **Responsive**: en pantallas pequeñas los paneles laterales se abren como
  drawers y el índice de lecciones se convierte en una tira horizontal.
- **PWA**: instalable, con service worker que cachea la app y los samples ya
  descargados (funciona sin conexión tras la primera visita; el SW solo se
  activa en el build de producción).

## Para IAs (vibe coding)

La mini-notación es **compatible a propósito con Strudel / TidalCycles**
(`[a b]`, `<a b>`, `(3,8)`, `*2`, `?`…), que los LLMs sí conocen de serie.
Lo que es dialecto propio de bakaluti — los trucos con `|`, los comandos en
español, `kit`, `synth`, `scale`, la voz `v1…v8` — está en la especificación
completa: [`/llms.txt`](public/llms.txt), en producción
`https://bakaluti.com/llms.txt`. Pásasela a Claude Code, Cursor o cualquier
modelo como contexto y generará patrones válidos a la primera.

## Créditos y licencia

- Los samples vienen de [Dirt-Samples](https://github.com/tidalcycles/Dirt-Samples)
  y [tidal-drum-machines](https://github.com/ritchse/tidal-drum-machines), las
  librerías comunitarias del ecosistema [TidalCycles](https://tidalcycles.org).
- Inspirada en [Strudel](https://strudel.cc) y TidalCycles, referentes del
  live coding. La mini-notación es compatible con la suya a propósito.
- **Privacidad**: sin cuentas ni cookies. Ritmos, progreso y grabaciones de
  voz viven solo en tu navegador. La única llamada a servidor de toda la app
  es la petición a la IA de la pestaña Residente, y no se guarda nada.
- Código bajo licencia [AGPL-3.0](LICENSE).

## Limitaciones

- Los ritmos se guardan en localStorage (solo en este navegador).
- Los sonidos que no sean bd/sn/hh necesitan internet la primera vez.
- Export a WAV sí; a MIDI no (de momento).
