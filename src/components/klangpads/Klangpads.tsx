import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_SNAP,
  KlangEngine,
  PAD_GRID,
  TRACKS,
  type PadId,
} from "@/lib/klangpads/engine";

function velFrom(e: React.PointerEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  const y = (e.clientY - r.top) / Math.max(1, r.height);
  return 0.25 + (1 - Math.max(0, Math.min(1, y))) * 0.75;
}

export function Klangpads() {
  const [eng, setEng] = useState<KlangEngine | null>(null);
  const [, setTick] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const holdRef = useRef<number | null>(null);
  const [dragPad, setDragPad] = useState<PadId | null>(null);

  useEffect(() => {
    const e = new KlangEngine();
    const unsub = e.subscribe(() => setTick((n) => n + 1));
    e.load();
    setEng(e);
    const vis = () => {
      e.unlock();
    };
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("focus", vis);
    return () => {
      unsub();
      e.dispose();
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("focus", vis);
      if (holdRef.current) window.clearInterval(holdRef.current);
    };
  }, []);

  const snap = eng?.snapshot() ?? DEFAULT_SNAP;

  const unlock = () => eng?.unlock();

  const holdBpm = (d: number) => {
    eng?.nudgeBpm(d);
    if (holdRef.current) window.clearInterval(holdRef.current);
    const t = window.setTimeout(() => {
      holdRef.current = window.setInterval(() => eng?.nudgeBpm(d), 80);
    }, 380);
    holdRef.current = t;
  };
  const stopHold = () => {
    if (holdRef.current) {
      window.clearTimeout(holdRef.current);
      window.clearInterval(holdRef.current);
      holdRef.current = null;
    }
  };

  const onPadDown = (id: PadId, e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    unlock();
    eng?.hitPad(id, velFrom(e));
  };

  const onDropPad = (id: PadId, e: React.DragEvent) => {
    e.preventDefault();
    setDragPad(null);
    const file = e.dataTransfer.files[0];
    if (file) void eng?.loadFile(id, file);
  };

  return (
    <main
      className="kp-stage"
      onPointerDown={unlock}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="kp-device">
        <header className="kp-top">
          <h1 className="kp-brand">KLANGPADS</h1>
          <div className="kp-bpm">
            <span className="kp-bpm-label">BPM</span>
            <div className="kp-lcd" aria-live="polite">
              {snap.bpm}
            </div>
            <button
              type="button"
              className="kp-tr"
              aria-label="BPM minus"
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                unlock();
                holdBpm(-1);
              }}
              onPointerUp={stopHold}
              onPointerCancel={stopHold}
              onPointerLeave={stopHold}
            >
              −
            </button>
            <button
              type="button"
              className="kp-tr"
              aria-label="BPM plus"
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                unlock();
                holdBpm(1);
              }}
              onPointerUp={stopHold}
              onPointerCancel={stopHold}
              onPointerLeave={stopHold}
            >
              +
            </button>
          </div>
          <div className="kp-transport">
            <button
              type="button"
              className="kp-tr"
              aria-label="Stop"
              onPointerDown={(e) => {
                e.preventDefault();
                unlock();
                eng?.stop();
              }}
            >
              ■
            </button>
            <button
              type="button"
              className={`kp-tr kp-tr-play${snap.playing ? " is-play" : ""}`}
              aria-label="Play"
              onPointerDown={(e) => {
                e.preventDefault();
                unlock();
                if (!snap.playing) eng?.play();
              }}
            >
              ▶
            </button>
            <button
              type="button"
              className={`kp-tr${snap.rec ? " is-rec" : ""}`}
              aria-label="Aufnahme"
              onPointerDown={(e) => {
                e.preventDefault();
                unlock();
                eng?.toggleRec();
              }}
            >
              ●
            </button>
          </div>
        </header>

        <div className="kp-keys">
          <div className="kp-keys-row r4">
            {[0, 1, 2, 3].map((i) => (
              <button
                key={i}
                type="button"
                className={`kp-key${snap.pattern === i ? " is-on" : ""}`}
                aria-label={`Muster ${i + 1}`}
                aria-pressed={snap.pattern === i}
                onPointerDown={(e) => {
                  e.preventDefault();
                  unlock();
                  eng?.setPattern(i);
                }}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <div className="kp-keys-row r5">
            <button
              type="button"
              className={`kp-key${snap.loopMode[snap.selectedPad] ? " is-loop" : ""}`}
              aria-pressed={snap.loopMode[snap.selectedPad]}
              onPointerDown={(e) => {
                e.preventDefault();
                unlock();
                eng?.toggleLoop();
              }}
            >
              LOOP
            </button>
            <button
              type="button"
              className="kp-key"
              onPointerDown={(e) => {
                e.preventDefault();
                unlock();
                eng?.fitSelected();
              }}
            >
              FIT
            </button>
            <button
              type="button"
              className={`kp-key${snap.mic ? " is-mic" : ""}`}
              aria-pressed={snap.mic}
              onPointerDown={(e) => {
                e.preventDefault();
                unlock();
                void eng?.startMic();
              }}
            >
              MIKRO
            </button>
            <button
              type="button"
              className="kp-key"
              onPointerDown={(e) => {
                e.preventDefault();
                unlock();
                fileRef.current?.click();
              }}
            >
              DATEI
            </button>
            <button
              type="button"
              className={`kp-key${snap.song ? " is-song" : ""}`}
              onPointerDown={(e) => {
                e.preventDefault();
                unlock();
                void eng?.recordSong();
              }}
            >
              LIED
            </button>
          </div>
          <div className="kp-keys-row r4">
            <button
              type="button"
              className="kp-key"
              onPointerDown={(e) => {
                e.preventDefault();
                unlock();
                eng?.applyPreset("beat");
              }}
            >
              BEAT
            </button>
            <button
              type="button"
              className="kp-key"
              onPointerDown={(e) => {
                e.preventDefault();
                unlock();
                eng?.applyPreset("melody");
              }}
            >
              MELODIE
            </button>
            <button
              type="button"
              className="kp-key"
              onPointerDown={(e) => {
                e.preventDefault();
                unlock();
                eng?.applyPreset("empty");
              }}
            >
              LEER
            </button>
            <button
              type="button"
              className={`kp-key${snap.swing ? " is-on" : ""}`}
              aria-pressed={snap.swing}
              onPointerDown={(e) => {
                e.preventDefault();
                unlock();
                eng?.toggleSwing();
              }}
            >
              SWING
            </button>
          </div>
        </div>

        <div className="kp-well kp-well-pads">
          <div className="kp-pads">
            {PAD_GRID.flat().map((pad) => {
              const hit = snap.flashPad === pad.id;
              const sel = snap.selectedPad === pad.id;
              const looping = snap.looping.includes(pad.id);
              return (
                <button
                  key={pad.id}
                  type="button"
                  className={`kp-pad${hit ? " is-hit" : ""}${sel ? " is-sel" : ""}${
                    looping ? " is-looping" : ""
                  }${dragPad === pad.id ? " is-drag" : ""}`}
                  aria-label={pad.label}
                  onPointerDown={(e) => onPadDown(pad.id, e)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragPad(pad.id);
                  }}
                  onDragLeave={() => setDragPad((p) => (p === pad.id ? null : p))}
                  onDrop={(e) => onDropPad(pad.id, e)}
                >
                  <span className="kp-pad-led" />
                  <span className="kp-pad-label">{pad.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="kp-well">
          <div className="kp-matrix">
            {TRACKS.map((tr, ti) => (
              <div className="kp-row" key={tr.id}>
                <button
                  type="button"
                  className={`kp-track${snap.selectedTrack === tr.id ? " is-on" : ""}`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    unlock();
                    eng?.hitPad(tr.pad, 0.85);
                  }}
                >
                  {tr.label}
                </button>
                {Array.from({ length: 16 }, (_, s) => {
                  const on = snap.grid[ti]?.[s];
                  const beat = s === 0 || s === 8;
                  const ph = snap.playing && snap.step === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      aria-label={`${tr.label} Schritt ${s + 1}`}
                      className={`kp-step${on ? " on" : ""}${beat ? " beat" : ""}${
                        ph ? " ph" : ""
                      }`}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        unlock();
                        eng?.toggleStep(tr.id, s);
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="kp-status" aria-live="polite">
          <span>{snap.statusPad}</span>
          <span className="kp-status-mode">{snap.statusMode}</span>
          {snap.note ? <span className="kp-status-note">{snap.note}</span> : null}
        </div>

        <input
          ref={fileRef}
          className="kp-file"
          type="file"
          accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm,.aif,.aiff"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void eng?.loadFile(snap.selectedPad, f);
            e.target.value = "";
          }}
        />
      </div>
    </main>
  );
}
