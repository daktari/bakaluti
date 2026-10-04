import type { Track } from "./composer";

/**
 * Curated anchor tracks — the station's own singles, aired every 4th slot.
 * Hand-tuned, stable across composer changes. More land in phase B.
 */

const anchor = (
  style: Track["style"],
  title: string,
  bpm: number,
  code: string,
  /** optional arrangement: earlier states are thinner pictures of `code` */
  intro: string[] = []
): Track => ({ style, title, bpm, code, states: [...intro, code] });

// "Nave 7" — the station's first single. The hypnotic loop with a chorus,
// built in four pictures so a recording has somewhere to go.
const NAVE7_KICK = "bd ~ bd ~ bd ~ bd ~ | kit 909 | drive 0.55 | sub 0.45 | rumble 0.4 | gain 0.9 -- el martillo";
const NAVE7_HATS = "hh hh hh hh? hh hh hh? hh | fast 2 | kit 909 | drive 0.35 | gain 0.3 -- hats hipnóticos";
const NAVE7_RIDE = "~ ho ~ ho ~ ho ~ ho | kit 909 | lpf 6000 | drive 0.3 | gain 0.3 -- ride oscuro";
const NAVE7_SUB = "0 _ ~ ~ 0 _ ~ <0 1> | synth sub | scale frigia | duck 0.4 | gain 0.62 -- sub, con el roce";
const NAVE7_PERC = "mt ~ ~ mt ~ ~ mt ~ ~ ~ | drive 0.45 | pan -0.4 | gain 0.42 -- percusión rodando, 10 pasos";
const NAVE7_HOOK =
  "0^ ~ 0 3 ~ 0 _ <3 1> | synth acid | scale frigia | cutoff 420 | res 0.72 | env 0.7 | decay 0.3 | drive 0.5 | duck 0.35 | gain 0.6 | every 4 rev -- el estribillo";
const NAVE7_SNARE = "~ ~ ~ ~ sn ~ ~ [~ sn?] | kit 909 | drive 0.45 | gain 0.45 -- caja seca en el tres";
const NAVE7_FOG = "<0 1> ~ ~ ~ ~ ~ ~ ~ | synth pad | scale frigia | slow 4 | lpf 550 | drive 0.25 | duck 0.5 | gain 0.42 -- niebla de polígono";

export const ANCHORS: Track[] = [
  // ---------------------------------------------------------------- MOTOR
  anchor(
    "motor",
    "Correa de distribución",
    124,
    `bd ~ bd ~ | kit 909 | sub 0.3 | gain 0.9 -- bombo constante
~ ~ cp ~ | kit 909 | reverb 0.3 | gain 0.5 -- palmada
~ ho ~ ho | kit 909 | gain 0.4 -- contratiempo
0 ~ [~ 0] ~ 3 ~ [~ 5] ~ | synth bass | scale menor | swing 0.15 | duck 0.4 | gain 0.7 -- bajo funk
<0 5> ~ ~ ~ | synth pad | scale menor | slow 2 | reverb 0.55 | gain 0.55 -- cuerdas: base
<2 7> ~ ~ ~ | synth pad | scale menor | slow 2 | reverb 0.55 | gain 0.4 -- cuerdas: armonía
~ ~ <7 ~> ~ ~ <9 12> ~ ~ | synth piano | scale menor | delay 0.45 | pan 0.3 | gain 0.4 -- detalles`
  ),
  anchor(
    "motor",
    "Cromo y humo",
    126,
    `bd:1 ~ bd ~ | kit 909 | gain 0.9 -- bombo constante
~ ~ cp ~ | kit 909 | reverb 0.3 | gain 0.5 -- palmada
~ ho ~ ho | kit 909 | gain 0.42 -- contratiempo
hh hh hh | kit 909 | gain 0.26 -- hats, 3 contra 4
0 ~ ~ [~ 0] ~ 3 ~ <5 7> | synth bass | scale menor | swing 0.18 | duck 0.4 | gain 0.72 -- bajo funk
<0 -2 3 2> ~ ~ ~ | synth pad | scale menor | slow 2 | reverb 0.55 | gain 0.55 -- cuerdas: progresión
<2 0 5 4> ~ ~ ~ | synth pad | scale menor | slow 2 | reverb 0.55 | gain 0.38 -- cuerdas: armonía
0 ~ ~ <12 ~> ~ ~ 7 _ | synth acid | scale menor | cutoff 500 | res 0.5 | env 0.5 | decay 0.3 | delay 0.3 | gain 0.34 -- ácido lejano`
  ),
  anchor(
    "motor",
    "Última ronda en la fábrica",
    122,
    `bd ~ bd ~ | kit 909 | gain 0.9 -- bombo constante
~ ~ cp ~ | kit 909 | reverb 0.35 | gain 0.5 -- palmada escasa
~ ho ~ ho | kit 909 | gain 0.38 -- contratiempo
-2 ~ [~ -2] ~ 2 ~ [~ 3] ~ | synth bass | scale menor | swing 0.12 | duck 0.4 | gain 0.7 -- bajo grave
<0 3 5 2> ~ ~ ~ | synth pad | scale menor | slow 2 | reverb 0.6 | gain 0.55 -- cuerdas: progresión
<2 5 7 4> ~ ~ ~ | synth pad | scale menor | slow 2 | reverb 0.6 | gain 0.4 -- cuerdas: armonía
~ <9 ~> ~ ~ 7 ~ ~ <12 ~> | synth piano | scale menor | delay 0.5 | pan -0.35 | gain 0.4 -- detalles`
  ),
  // ---------------------------------------------------------------- ÓXIDO
  // (grid: one step = one eighth, 8 steps = a bar — the kick sits on the
  // even steps, so 138 means 138)
  anchor(
    "oxido",
    "Nave 7",
    134,
    [NAVE7_KICK, NAVE7_HATS, NAVE7_RIDE, NAVE7_SUB, NAVE7_PERC, NAVE7_HOOK, NAVE7_SNARE, NAVE7_FOG].join("\n"),
    [
      [NAVE7_KICK, NAVE7_HATS, NAVE7_RIDE].join("\n"),
      [NAVE7_KICK, NAVE7_HATS, NAVE7_RIDE, NAVE7_SUB, NAVE7_PERC].join("\n"),
      [NAVE7_KICK, NAVE7_HATS, NAVE7_RIDE, NAVE7_SUB, NAVE7_PERC, NAVE7_HOOK, NAVE7_SNARE].join("\n"),
    ]
  ),
  anchor(
    "oxido",
    "Herrumbre madre",
    138,
    `bd ~ bd ~ bd ~ bd ~ | kit 909 | drive 0.5 | sub 0.4 | rumble 0.3 | gain 0.9 -- el martillo
lt lt mt ~ lt ~ mt ~ | drive 0.7 | pan -0.4 | gain 0.55 | every 4 rev -- toms en círculo
ho ho ho ho ho ho ho ho | kit 909 | lpf 7000 | drive 0.3 | gain 0.34 -- cortina de ride
~ hh ~ hh ~ hh ~ hh? | kit 909 | drive 0.3 | gain 0.3 -- hat a contratiempo
~ ~ cp ~ ~ ~ cp ~ | kit 909 | drive 0.4 | gain 0.46 -- palmada seca
0 ~ 0 ~ 0 ~ <0 1> ~ | synth bass | scale frigia | lpf 300 | drive 0.4 | duck 0.5 | gain 0.65 -- sub a pulsos, con el roce
rm ~ ~ rm ~ ~ rm ~ ~ ~ rm ~ ~ rm ~ ~ | drive 0.5 | pan 0.35 | gain 0.4 -- rim en tresillos`
  ),
  anchor(
    "oxido",
    "Turno de noche",
    128,
    `bd ~ bd ~ bd ~ bd ~ | kit 909 | drive 0.4 | sub 0.45 | rumble 0.4 | gain 0.9 -- el martillo, hondo
rm ~ ~ rm ~ rm ~ | drive 0.3 | delay 0.22 | reverb 0.25 | pan 0.4 | gain 0.44 -- el látigo
lt ~ ~ ~ ~ ~ ~ ~ lt? ~ ~ ~ | drive 0.4 | pan -0.35 | gain 0.45 -- tom perdido
hh? ~ hh ~ hh? ~ hh ~ | kit 909 | lpf 5000 | drive 0.25 | gain 0.3 -- hats escasos
~ ~ ~ ~ sn ~ ~ ~ | kit 909 | reverb 0.28 | delay 0.18 | drive 0.3 | gain 0.42 -- caja helada
<0 1 0 4> ~ ~ ~ ~ ~ ~ ~ | synth pad | scale frigia | slow 4 | lpf 850 | reverb 0.3 | size 0.6 | duck 0.5 | gain 0.5 -- cuerdas ominosas
0 _ ~ ~ 0 _ ~ ~ | synth sub | scale frigia | duck 0.35 | gain 0.64 -- sub`
  ),
  anchor(
    "oxido",
    "Viga y martillo",
    136,
    `bd ~ bd ~ bd ~ bd [~ bd?] | kit 909 | drive 0.9 | sub 0.4 | rumble 0.2 | gain 0.9 -- el martillo al rojo
cb ~ rm ~ ~ | drive 0.85 | lpf 4500 | pan 0.4 | gain 0.5 -- chatarra, 5 pasos
rm ~ ~ cb ~ ~ ~ rm ~ | drive 0.8 | lpf 3500 | pan -0.35 | gain 0.44 | every 3 rev -- chatarra, 9 pasos
hh? hh hh? hh hh hh? hh hh | fast 2 | kit 909 | drive 0.8 | gain 0.3 -- hats de ruido
~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ sn ~ ~ ~ | kit 909 | drive 0.8 | gain 0.46 -- caja de ruido, cada dos compases
0^ 0 ~ 0 _ <0 1> 0 ~ | synth acid | scale frigia | cutoff 420 | res 0.75 | env 0.7 | decay 0.25 | drive 0.6 | duck 0.3 | gain 0.6 -- gancho ácido`
  ),
  anchor(
    "oxido",
    "Polígono, de madrugada",
    135,
    `bd ~ bd ~ bd ~ bd ~ | kit 909 | drive 0.55 | sub 0.45 | rumble 0.4 | gain 0.9 -- el martillo
hh hh hh hh? hh hh hh? hh | fast 2 | kit 909 | drive 0.35 | gain 0.3 -- hats hipnóticos
~ ho ~ ho ~ ho ~ ho | kit 909 | lpf 6000 | drive 0.3 | gain 0.3 -- ride oscuro
~ ~ ~ ~ sn ~ ~ [~ sn?] | kit 909 | drive 0.45 | gain 0.45 -- caja seca en el tres
0^ ~ 0 3 ~ 0 _ <3 -2> | synth acid | scale menor | cutoff 450 | res 0.65 | env 0.65 | decay 0.3 | drive 0.5 | duck 0.35 | gain 0.6 | every 4 rev -- el estribillo
mt ~ ~ mt ~ ~ mt ~ ~ ~ | drive 0.45 | pan -0.4 | gain 0.42 -- percusión rodando
<0 1> ~ ~ ~ ~ ~ ~ ~ | synth pad | scale frigia | slow 4 | lpf 550 | drive 0.25 | duck 0.5 | gain 0.42 -- niebla de polígono`
  ),
  anchor(
    "oxido",
    "Danza de la grúa",
    131,
    `bd ~ ~ bd ~ ~ bd ~ | kit 909 | drive 0.45 | sub 0.4 | gain 0.9 -- el martillo, roto
lt(5,8) | drive 0.45 | pan 0.4 | gain 0.52 -- toms tribales
mt ~ ~ mt ~ mt ~ ~ ~ mt | drive 0.4 | pan -0.35 | gain 0.44 | every 4 rev -- toms, la respuesta
hh(7,16) | kit 909 | drive 0.3 | lpf 6000 | swing 0.15 | gain 0.33 -- hats euclídeos
~ ~ ~ ~ rm ~ ~ ~ | drive 0.35 | swing 0.15 | gain 0.4 -- rim en el tres
~ ~ ~ ho ~ ~ ~ ~ ~ ho ~ | drive 0.3 | lpf 5500 | gain 0.28 -- hat abierto, 11 pasos
0 ~ ~ 0 ~ ~ 0 ~ | synth bass | scale penta | lpf 300 | drive 0.4 | duck 0.45 | gain 0.6 -- bajo en tresillo`
  ),
  anchor(
    "oxido",
    "Garaje de chapa",
    130,
    `bd ~ bd ~ bd ~ bd ~ | kit 909 | drive 0.45 | sub 0.45 | rumble 0.3 | gain 0.9 -- el martillo, pesado
rm ~ ~ cb ~ rm ~ ~ ~ ~ rm ~ cb ~ ~ ~ rm ~ | swing 0.35 | drive 0.45 | lpf 5000 | pan 0.35 | gain 0.46 -- metal, 18 pasos
cb ~ ~ rm? ~ ~ cb ~ ~ ~ | swing 0.35 | drive 0.45 | pan -0.3 | gain 0.4 -- metal, 10 pasos
~ hh ~ hh ~ hh ~ hh | kit 909 | swing 0.35 | drive 0.4 | gain 0.3 -- hat crudo
0^ 0 <0 3> 0 _ 0 <5 0> 0^ | synth acid | scale menor | cutoff 480 | res 0.7 | env 0.6 | decay 0.3 | delay 0.22 | drive 0.45 | duck 0.4 | gain 0.58 | every 8 rev -- ácido que gruñe
-7 _ _ _ ~ ~ ~ ~ | synth reese | scale menor | cutoff 450 | duck 0.5 | gain 0.52 -- bajo clavado`
  ),
  // ----------------------------------------------------------------- CASA
  anchor(
    "casa",
    "Portal abierto",
    124,
    `bd ~ bd ~ | kit 909 | sub 0.25 | gain 0.9 -- bombo constante
~ ho ~ ho | kit 909 | swing 0.32 | gain 0.45 -- hat abierto a contratiempo
~ ~ cp ~ | kit 909 | reverb 0.3 | gain 0.5 -- palmada
hh hh? hh hh | kit 909 | swing 0.32 | gain 0.34 -- hats
0 ~ [~ 4] ~ 7 ~ <4 9> ~ | synth bass | scale mayor | swing 0.32 | duck 0.4 | gain 0.7 -- bajo saltarín
~ <7 9 11 9> ~ ~ <12 ~> ~ ~ ~ | synth piano | scale mayor | delay 0.5 | pan 0.3 | gain 0.45 -- pianito`
  ),
  anchor(
    "casa",
    "Vecinos bailando",
    123,
    `bd ~ bd ~ | kit linn | gain 0.9 -- bombo constante
~ ho ~ ho | kit linn | swing 0.38 | gain 0.42 -- hat abierto a contratiempo
~ ~ cp ~ | kit linn | reverb 0.32 | gain 0.5 -- palmada
hh hh hh hh | kit linn | fast 2 | swing 0.38 | gain 0.24 -- hats
3 ~ [~ 3] 4 ~ <7 9> ~ ~ | synth bass | scale mayor | swing 0.38 | duck 0.4 | gain 0.68 -- bajo saltarín
~ <9 7 12 11> ~ ~ <11 ~> ~ ~ ~ | synth piano | scale mayor | delay 0.52 | pan -0.28 | gain 0.44 -- pianito`
  ),
  anchor(
    "casa",
    "Azotea al sol",
    125,
    `bd ~ bd ~ | kit 909 | gain 0.9 -- bombo constante
~ ho ~ ho | kit 909 | swing 0.28 | gain 0.46 -- hat abierto a contratiempo
~ ~ cp ~ | kit 909 | reverb 0.28 | gain 0.5 -- palmada
0 [~ 0] ~ 4 ~ [~ 7] ~ <4 2> | synth bass | scale mayor | swing 0.28 | duck 0.4 | gain 0.7 -- bajo saltarín
~ <7 11 9 14> ~ ~ <12 ~> ~ ~ ~ | synth piano | scale mayor | delay 0.48 | pan 0.34 | gain 0.46 -- pianito
cb(2,8) | pan 0.45 | gain 0.28 -- cencerro lejano`
  ),
  // --------------------------------------------------------------- NIEBLA
  anchor(
    "niebla",
    "Romance en la niebla",
    72,
    `<-7 -4> ~ ~ ~ | synth pad | scale menor | slow 4 | lpf 500 | reverb 0.65 | gain 0.55 -- suelo grave
<0 3 5 2> ~ ~ ~ ~ | synth pad | scale menor | slow 4 | delay 0.4 | reverb 0.65 | gain 0.5 -- bruma
7 ~ ~ ~ 9 ~ ~ <12 ~> ~ | synth piano | scale menor | delay 0.6 | reverb 0.5 | gain 0.42 -- destellos fríos
bd ~ ~ ~ ~ ~ ~ ~ | lpf 250 | reverb 0.4 | gain 0.5 -- latido enterrado
ho ~ ~ ~ ~ ~ | lpf 550 | pan 0.4 | gain 0.2 -- aliento`
  ),
  anchor(
    "niebla",
    "Faro y marea",
    66,
    `<-7 -9> ~ ~ ~ ~ | synth pad | scale penta | slow 8 | lpf 450 | reverb 0.7 | gain 0.55 -- suelo grave
<0 4 2 5> ~ ~ ~ ~ ~ | synth pad | scale penta | slow 4 | delay 0.45 | reverb 0.7 | gain 0.48 -- bruma
<7 9> ~ ~ ~ ~ 12 ~ ~ ~ | synth piano | scale penta | delay 0.55 | reverb 0.45 | gain 0.4 -- destellos
bd ~ ~ ~ ~ ~ ~ ~ | lpf 220 | reverb 0.35 | gain 0.48 -- latido enterrado`
  ),
  anchor(
    "niebla",
    "Vapor de radiador",
    62,
    `<-7 -5> ~ ~ | synth pad | scale menor | slow 8 | lpf 600 | reverb 0.68 | gain 0.56 -- suelo grave
<0 2 -2 3> ~ ~ ~ ~ | synth pad | scale menor | slow 4 | delay 0.38 | reverb 0.68 | gain 0.48 -- bruma
9 ~ ~ <7 ~> ~ ~ ~ <12 14> ~ | synth piano | scale menor | delay 0.58 | reverb 0.42 | gain 0.4 -- destellos
ho ~ ~ ~ ~ | lpf 480 | pan -0.4 | gain 0.2 -- aliento`
  ),
  anchor(
    "niebla",
    "Sala de espera",
    63,
    `~ ~ 4 ~ ~ ~ ~ | synth pad | scale lidia | slow 4 | lpf 3000 | delay 0.35 | reverb 0.78 | size 0.8 | pan -0.4 | gain 0.42 -- cinta 7
<7 6> ~ ~ ~ ~ ~ ~ ~ ~ | synth pad | scale lidia | slow 4 | lpf 2600 | delay 0.35 | reverb 0.78 | size 0.8 | pan 0.3 | gain 0.4 -- cinta 9
~ ~ ~ ~ ~ 2 ~ ~ ~ ~ ~ | synth pad | scale lidia | slow 4 | lpf 3400 | delay 0.35 | reverb 0.78 | size 0.8 | pan 0.45 | gain 0.38 -- cinta 11
~ ~ ~ ~ ~ ~ ~ 11 ~ ~ ~ ~ ~ | synth piano | scale lidia | slow 4 | delay 0.4 | reverb 0.78 | pan -0.25 | gain 0.4 -- cinta 13
0 ~ ~ ~ ~ ~ ~ ~ | synth bass | scale lidia | slow 8 | lpf 200 | gain 0.46 -- suelo pedal`
  ),
  anchor(
    "niebla",
    "Réquiem para un radiador",
    64,
    `<0 -3> ~ ~ ~ ~ ~ ~ ~ | synth pad | scale mayor | slow 8 | lpf 1800 | reverb 0.9 | size 0.95 | gain 0.48 -- suelo coral
~ ~ <4 2> ~ ~ ~ ~ ~ ~ | synth pad | scale mayor | slow 8 | lpf 2100 | reverb 0.9 | size 0.95 | pan 0.35 | gain 0.43 -- voz media
~ ~ ~ 7 ~ ~ ~ ~ ~ ~ | synth pad | scale mayor | slow 8 | lpf 2400 | reverb 0.9 | size 0.95 | pan -0.4 | gain 0.38 -- voz alta
~ ~ <11 9> ~ ~ | synth piano | scale mayor | slow 6 | delay 0.2 | reverb 0.65 | pan 0.4 | gain 0.28 -- piano al fondo`
  ),
  anchor(
    "niebla",
    "Nueve postales",
    70,
    `7 ~ 9 ~ ~ 11? ~ | synth piano | scale penta | slow 2 | delay 0.5 | reverb 0.45 | pan 0.4 | gain 0.45 -- cristal
~ ~ 4 ~ ~ ~ 2? ~ ~ | synth piano | scale penta | slow 3 | delay 0.5 | reverb 0.45 | pan -0.4 | gain 0.36 -- eco cruzado
-7 ~ ~ ~ | synth bass | scale penta | slow 8 | lpf 240 | gain 0.4 -- suelo de agua
~ ~ rm? ~ ~ ~ ~ | slow 2 | lpf 3000 | delay 0.5 | reverb 0.5 | pan 0.25 | gain 0.12 -- gota`
  ),
  anchor(
    "niebla",
    "Cuarto del curandero",
    108,
    `bd ~ ~ ~ bd ~ ~ ~ | lpf 260 | sub 0.35 | reverb 0.3 | size 0.7 | gain 0.42 -- latido dub
~ <0 2> ~ ~ ~ ~ | synth pad | scale dorica | slow 2 | lpf 1100 | delay 0.7 | reverb 0.7 | size 0.85 | pan 0.3 | gain 0.46 -- acorde ahogado
<0 -5> ~ ~ ~ ~ ~ ~ ~ | synth bass | scale dorica | slow 2 | lpf 210 | gain 0.52 -- suelo dub
~ ~ ~ ~ 7 ~ ~ ~ ~ | synth piano | scale dorica | slow 4 | delay 0.7 | reverb 0.6 | pan -0.4 | gain 0.32 -- nota lejana
~ hh? ~ hh? ~ hh? ~ hh? | lpf 1500 | gain 0.12 -- siseo`
  ),
  anchor(
    "niebla",
    "Deshielo",
    62,
    `-12 ~ ~ ~ ~ ~ ~ ~ | synth bass | scale frigia | slow 8 | lpf 200 | gain 0.52 -- suelo glaciar
<0 1> ~ ~ ~ ~ ~ ~ ~ ~ | synth pad | scale frigia | slow 8 | lpf 600 | reverb 0.92 | size 0.95 | drive 0.2 | gain 0.46 -- el roce
~ ~ ~ ~ <7 ~> ~ ~ ~ ~ ~ ~ | synth pad | scale frigia | slow 8 | lpf 900 | reverb 0.92 | size 0.95 | pan 0.4 | gain 0.34 -- luz lejana
ho ~ ~ ~ ~ ~ ~ | slow 2 | lpf 320 | reverb 0.92 | size 0.95 | pan -0.3 | gain 0.18 -- viento
~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ rm? ~ ~ ~ ~ | lpf 1200 | delay 0.65 | reverb 0.7 | gain 0.14 -- crujido de hielo`
  ),
];
