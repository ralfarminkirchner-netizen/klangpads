# KLANGPADS

Studio-Instrument: 16 Gummi-Pads, 8×16 Pattern-Matrix, Loops, Mikro, Datei, Lied.

Schwester von [LOOPTiSCH](https://ralfarminkirchner-netizen.github.io/looptisch/).

## Spielen

- Pad tippen = Sound. Oben auf dem Pad = lauter.
- **BEAT** laden, **▶** — Kick/Snare/Hut/Klatsch im Kreis, cyaner Playhead.
- Rasterzelle kippt den Schritt. Muster **1–4** unabhängig.
- **●** + Play: Overdub, quantisiert.
- **LOOP** latched das gewählte Pad. **■** schneidet Loops ab.
- **SWING** zieht ungerade 16tel (~18%).
- Audio auf ein Pad droppen, **MIKRO** (max 4 s) oder **DATEI**. **FIT** trimmt, normalisiert, snappt ans Tempo.
- **LIED** rendert 2 Takte Master als WAV.

Eingebaute Stimmen sind synthetisch (kein Sample-Copyright). BPM, Swing, Muster und Loop-Flags bleiben lokal.

## Deploy

Railway liest `railway.json` + `Dockerfile`. Start: `node scripts/railway-start.mjs` auf `0.0.0.0:$PORT`.
