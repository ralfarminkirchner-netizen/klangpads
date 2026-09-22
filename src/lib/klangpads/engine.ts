export const PAD_IDS = [
  "flute",
  "flute2",
  "harp",
  "bass",
  "bell",
  "pluck",
  "air",
  "voice",
  "kick",
  "snare",
  "hat",
  "clap",
  "tom",
  "rim",
  "shaker",
  "perc",
] as const;
export type PadId = (typeof PAD_IDS)[number];

export const PAD_GRID: { id: PadId; label: string }[][] = [
  [
    { id: "flute", label: "FLÖTE" },
    { id: "flute2", label: "FLÖTE 2" },
    { id: "harp", label: "HARFE" },
    { id: "bass", label: "BASS" },
  ],
  [
    { id: "bell", label: "GLOCKE" },
    { id: "pluck", label: "PLUCK" },
    { id: "air", label: "LUFT" },
    { id: "voice", label: "STIMME" },
  ],
  [
    { id: "kick", label: "KICK" },
    { id: "snare", label: "SNARE" },
    { id: "hat", label: "HUT" },
    { id: "clap", label: "KLATSCH" },
  ],
  [
    { id: "tom", label: "TOM" },
    { id: "rim", label: "RIM" },
    { id: "shaker", label: "SHAKER" },
    { id: "perc", label: "PERC" },
  ],
];

export const TRACKS: { id: TrackId; label: string; pad: PadId }[] = [
  { id: "kick", label: "KICK", pad: "kick" },
  { id: "snare", label: "SNARE", pad: "snare" },
  { id: "hat", label: "HUT", pad: "hat" },
  { id: "clap", label: "KLATSCH", pad: "clap" },
  { id: "tom", label: "TOM", pad: "tom" },
  { id: "bass", label: "BASS", pad: "bass" },
  { id: "flute", label: "FLÖTE", pad: "flute" },
  { id: "bell", label: "GLOCKE", pad: "bell" },
];
export type TrackId = "kick" | "snare" | "hat" | "clap" | "tom" | "bass" | "flute" | "bell";

const PAD_TO_TRACK: Partial<Record<PadId, TrackId>> = {
  kick: "kick",
  snare: "snare",
  hat: "hat",
  clap: "clap",
  tom: "tom",
  bass: "bass",
  flute: "flute",
  bell: "bell",
};

const PAD_LABEL: Record<PadId, string> = {
  flute: "FLÖTE",
  flute2: "FLÖTE 2",
  harp: "HARFE",
  bass: "BASS",
  bell: "GLOCKE",
  pluck: "PLUCK",
  air: "LUFT",
  voice: "STIMME",
  kick: "KICK",
  snare: "SNARE",
  hat: "HUT",
  clap: "KLATSCH",
  tom: "TOM",
  rim: "RIM",
  shaker: "SHAKER",
  perc: "PERC",
};

const DEFAULT_LOOP: Record<PadId, boolean> = {
  flute: true,
  flute2: true,
  harp: false,
  bass: false,
  bell: false,
  pluck: false,
  air: false,
  voice: false,
  kick: false,
  snare: false,
  hat: false,
  clap: false,
  tom: false,
  rim: false,
  shaker: false,
  perc: false,
};

const STORAGE_KEY = "klangpads-v1";
const STEPS = 16;
const TRACK_COUNT = 8;
const PATTERNS = 4;

function midi(n: number) {
  return 440 * Math.pow(2, (n - 69) / 12);
}

function emptyGrid(): boolean[][] {
  return Array.from({ length: TRACK_COUNT }, () => Array<boolean>(STEPS).fill(false));
}

function emptyPatterns(): boolean[][][] {
  return Array.from({ length: PATTERNS }, () => emptyGrid());
}

function cloneGrid(g: boolean[][]): boolean[][] {
  return g.map((row) => row.slice());
}

type Sample = {
  buffer: AudioBuffer;
  rate: number;
};

export type Snapshot = {
  bpm: number;
  swing: boolean;
  pattern: number;
  playing: boolean;
  rec: boolean;
  step: number;
  selectedPad: PadId;
  selectedTrack: TrackId;
  loopMode: Record<PadId, boolean>;
  looping: PadId[];
  grid: boolean[][];
  statusPad: string;
  statusMode: "ONE-SHOT" | "LOOP";
  note: string;
  mic: boolean;
  song: boolean;
  flashPad: PadId | null;
};

export const DEFAULT_SNAP: Snapshot = {
  bpm: 90,
  swing: false,
  pattern: 0,
  playing: false,
  rec: false,
  step: 0,
  selectedPad: "kick",
  selectedTrack: "kick",
  loopMode: { ...DEFAULT_LOOP },
  looping: [],
  grid: emptyGrid(),
  statusPad: "KICK",
  statusMode: "ONE-SHOT",
  note: "",
  mic: false,
  song: false,
  flashPad: null,
};

export class KlangEngine {
  bpm = 90;
  swing = false;
  pattern = 0;
  playing = false;
  rec = false;
  step = 0;
  selectedPad: PadId = "kick";
  selectedTrack: TrackId = "kick";
  loopMode: Record<PadId, boolean> = { ...DEFAULT_LOOP };
  note = "";
  mic = false;
  song = false;
  flashPad: PadId | null = null;
  patterns: boolean[][][] = emptyPatterns();

  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private compressor!: DynamicsCompressorNode;
  private clipper!: WaveShaperNode;
  private noise!: AudioBuffer;
  private samples: Partial<Record<PadId, Sample>> = {};
  private activeLoops = new Map<PadId, () => void>();
  private loopSources = new Map<PadId, AudioBufferSourceNode>();
  private schedTimer: number | null = null;
  private nextStepTime = 0;
  private playhead = 0;
  private listeners = new Set<() => void>();
  private snap: Snapshot = { ...DEFAULT_SNAP, loopMode: { ...DEFAULT_LOOP }, grid: emptyGrid() };
  private noteTimer: number | null = null;
  private flashTimer: number | null = null;
  private micStop: (() => void) | null = null;
  private recProc: ScriptProcessorNode | null = null;
  private output!: AudioNode;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  snapshot = () => this.snap;

  private emit() {
    const looping: PadId[] = [];
    this.activeLoops.forEach((_v, k) => looping.push(k));
    this.snap = {
      bpm: this.bpm,
      swing: this.swing,
      pattern: this.pattern,
      playing: this.playing,
      rec: this.rec,
      step: this.playhead,
      selectedPad: this.selectedPad,
      selectedTrack: this.selectedTrack,
      loopMode: { ...this.loopMode },
      looping,
      grid: cloneGrid(this.patterns[this.pattern]!),
      statusPad: PAD_LABEL[this.selectedPad],
      statusMode: this.loopMode[this.selectedPad] ? "LOOP" : "ONE-SHOT",
      note: this.note,
      mic: this.mic,
      song: this.song,
      flashPad: this.flashPad,
    };
    this.listeners.forEach((fn) => fn());
  }

  private setNote(text: string, ms = 2600) {
    this.note = text;
    if (this.noteTimer) window.clearTimeout(this.noteTimer);
    if (text) {
      this.noteTimer = window.setTimeout(() => {
        this.note = "";
        this.emit();
      }, ms);
    }
    this.emit();
  }

  unlock() {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      this.ctx = new AC({ latencyHint: "interactive" });
      this.setupGraph();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  private setupGraph() {
    const ctx = this.ctx!;
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -10;
    this.compressor.knee.value = 2;
    this.compressor.ratio.value = 12;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.22;
    this.clipper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.max(-0.97, Math.min(0.97, x));
    }
    this.clipper.curve = curve;
    this.clipper.oversample = "2x";
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 18;
    this.master.connect(this.compressor);
    this.compressor.connect(this.clipper);
    this.clipper.connect(hp);
    hp.connect(ctx.destination);
    this.output = hp;

    const n = Math.floor(ctx.sampleRate * 1.2);
    this.noise = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }

  private dest() {
    return this.master;
  }

  private nsrc(t: number) {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    const off = Math.random() * 0.6;
    s.start(t, off);
    return s;
  }

  hitPad(id: PadId, vel: number) {
    this.unlock();
    if (!this.ctx) return;
    this.selectedPad = id;
    const track = PAD_TO_TRACK[id];
    if (track) this.selectedTrack = track;
    const v = Math.max(0.22, Math.min(1, vel));

    if (this.loopMode[id]) {
      if (this.activeLoops.has(id)) {
        this.stopLoop(id);
        this.flash(id);
        this.persist();
        this.emit();
        return;
      }
      this.startLoop(id, v);
    } else {
      this.playOnce(id, v, this.ctx.currentTime);
    }

    if (this.rec && this.playing && track) {
      const q = this.quantizeStep();
      this.patterns[this.pattern]![TRACKS.findIndex((tr) => tr.id === track)]![q] = true;
    }
    this.flash(id);
    this.persist();
    this.emit();
  }

  private flash(id: PadId) {
    this.flashPad = id;
    if (this.flashTimer) window.clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => {
      if (this.flashPad === id) {
        this.flashPad = null;
        this.emit();
      }
    }, 130);
  }

  private quantizeStep() {
    if (!this.ctx || !this.playing) return 0;
    const now = this.ctx.currentTime;
    const until = this.nextStepTime - now;
    const dur = this.stepDur(this.step);
    if (until < dur * 0.5) return this.step % STEPS;
    return (this.step + STEPS - 1) % STEPS;
  }

  private playOnce(id: PadId, vel: number, when: number) {
    const sample = this.samples[id];
    if (sample) {
      this.playSample(id, sample, vel, when, false);
      return;
    }
    this.synth(id, vel, when, false);
  }

  private playSample(id: PadId, sample: Sample, vel: number, when: number, loop: boolean) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = sample.buffer;
    src.playbackRate.value = sample.rate;
    src.loop = loop;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, vel * 0.95), when + 0.008);
    src.connect(g).connect(this.dest());
    src.start(when);
    if (loop) {
      this.loopSources.get(id)?.stop();
      this.loopSources.set(id, src);
    } else {
      const dur = sample.buffer.duration / sample.rate;
      src.stop(when + dur + 0.02);
    }
  }

  private startLoop(id: PadId, vel: number) {
    const ctx = this.ctx!;
    const sample = this.samples[id];
    if (sample) {
      this.playSample(id, sample, vel, ctx.currentTime, true);
      this.activeLoops.set(id, () => {
        try {
          this.loopSources.get(id)?.stop();
        } catch {
          /* already stopped */
        }
        this.loopSources.delete(id);
      });
      return;
    }
    if (id === "flute" || id === "flute2") {
      let cancelled = false;
      let next = ctx.currentTime;
      const tick = () => {
        if (cancelled || !this.ctx) return;
        const now = this.ctx.currentTime;
        const beat = 60 / this.bpm;
        while (next < now + 0.12) {
          this.synth(id, vel, next, true);
          next += beat;
        }
        const wait = Math.max(10, (next - now) * 1000 - 40);
        const h = window.setTimeout(tick, wait);
        this.activeLoops.set(id, () => {
          cancelled = true;
          window.clearTimeout(h);
        });
      };
      this.activeLoops.set(id, () => {
        cancelled = true;
      });
      tick();
      return;
    }
    let cancelled = false;
    let next = ctx.currentTime;
    const tick = () => {
      if (cancelled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const beat = 60 / this.bpm;
      while (next < now + 0.12) {
        this.synth(id, vel, next, false);
        next += beat;
      }
      const wait = Math.max(10, (next - now) * 1000 - 40);
      const h = window.setTimeout(tick, wait);
      this.activeLoops.set(id, () => {
        cancelled = true;
        window.clearTimeout(h);
      });
    };
    this.activeLoops.set(id, () => {
      cancelled = true;
    });
    tick();
  }

  private stopLoop(id: PadId) {
    const stop = this.activeLoops.get(id);
    if (stop) stop();
    this.activeLoops.delete(id);
    try {
      this.loopSources.get(id)?.stop();
    } catch {
      /* already stopped */
    }
    this.loopSources.delete(id);
  }

  cutLoops() {
    for (const id of [...this.activeLoops.keys()]) this.stopLoop(id);
  }

  private synth(id: PadId, vel: number, t: number, phrase: boolean, step = 0) {
    switch (id) {
      case "kick":
        this.kick(vel, t);
        break;
      case "snare":
        this.snare(vel, t);
        break;
      case "hat":
        this.hat(vel, t);
        break;
      case "clap":
        this.clap(vel, t);
        break;
      case "tom":
        this.tom(vel, t);
        break;
      case "rim":
        this.rim(vel, t);
        break;
      case "shaker":
        this.shaker(vel, t);
        break;
      case "perc":
        this.perc(vel, t);
        break;
      case "bass":
        this.bass(vel, t, step);
        break;
      case "flute":
        this.flute(vel, t, phrase, 0, step);
        break;
      case "flute2":
        this.flute(vel, t, phrase, 1, step);
        break;
      case "harp":
        this.harp(vel, t);
        break;
      case "bell":
        this.bell(vel, t, step);
        break;
      case "pluck":
        this.pluck(vel, t);
        break;
      case "air":
        this.air(vel, t);
        break;
      case "voice":
        this.voice(vel, t);
        break;
    }
  }

  private kick(vel: number, t: number) {
    const ctx = this.ctx!;
    const dest = this.dest();
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.072);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.95 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + 0.36);

    const click = ctx.createOscillator();
    click.type = "square";
    click.frequency.value = 2100;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.16 * vel, t);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.011);
    const cf = ctx.createBiquadFilter();
    cf.type = "highpass";
    cf.frequency.value = 1200;
    click.connect(cf).connect(cg).connect(dest);
    click.start(t);
    click.stop(t + 0.014);

    const n = this.nsrc(t);
    const nf = ctx.createBiquadFilter();
    nf.type = "lowpass";
    nf.frequency.value = 420;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.28 * vel, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.046);
    n.connect(nf).connect(ng).connect(dest);
    n.stop(t + 0.05);
  }

  private snare(vel: number, t: number) {
    const ctx = this.ctx!;
    const dest = this.dest();
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.42 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + 0.16);

    const n = this.nsrc(t);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 0.85;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 900;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.72 * vel, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    n.connect(bp).connect(hp).connect(ng).connect(dest);
    n.stop(t + 0.22);
  }

  private hat(vel: number, t: number) {
    const ctx = this.ctx!;
    const dest = this.dest();
    const n = this.nsrc(t);
    const hp1 = ctx.createBiquadFilter();
    hp1.type = "highpass";
    hp1.frequency.value = 8000;
    const hp2 = ctx.createBiquadFilter();
    hp2.type = "highpass";
    hp2.frequency.value = 10500;
    const g = ctx.createGain();
    const dur = 0.04 + vel * 0.04;
    g.gain.setValueAtTime(0.28 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(hp1).connect(hp2).connect(g).connect(dest);
    n.stop(t + dur + 0.01);
  }

  private clap(vel: number, t: number) {
    const ctx = this.ctx!;
    const dest = this.dest();
    const bursts = [0, 0.012, 0.023, 0.041];
    bursts.forEach((off, i) => {
      const n = this.nsrc(t + off);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1250;
      bp.Q.value = 0.7;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 700;
      const g = ctx.createGain();
      const peak = (i === bursts.length - 1 ? 0.62 : 0.38) * vel;
      const dur = i === bursts.length - 1 ? 0.22 : 0.035;
      g.gain.setValueAtTime(peak, t + off);
      g.gain.exponentialRampToValueAtTime(0.0001, t + off + dur);
      n.connect(bp).connect(hp).connect(g).connect(dest);
      n.stop(t + off + dur + 0.01);
    });
  }

  private tom(vel: number, t: number) {
    const ctx = this.ctx!;
    const dest = this.dest();
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.85 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + 0.34);
    const n = this.nsrc(t);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1800;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.18 * vel, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
    n.connect(hp).connect(ng).connect(dest);
    n.stop(t + 0.03);
  }

  private rim(vel: number, t: number) {
    const ctx = this.ctx!;
    const dest = this.dest();
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 820;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.55 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + 0.05);
    const n = this.nsrc(t);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 3000;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.35 * vel, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.018);
    n.connect(hp).connect(ng).connect(dest);
    n.stop(t + 0.02);
  }

  private shaker(vel: number, t: number) {
    const ctx = this.ctx!;
    const dest = this.dest();
    const n = this.nsrc(t);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 6200;
    bp.Q.value = 0.55;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.32 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);
    n.connect(bp).connect(g).connect(dest);
    n.stop(t + 0.08);
  }

  private perc(vel: number, t: number) {
    const ctx = this.ctx!;
    const dest = this.dest();
    const o1 = ctx.createOscillator();
    o1.type = "sine";
    o1.frequency.value = 980;
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = 1470;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o1.connect(g);
    o2.connect(g);
    g.connect(dest);
    o1.start(t);
    o2.start(t);
    o1.stop(t + 0.1);
    o2.stop(t + 0.1);
  }

  private bass(vel: number, t: number, step = 0) {
    const ctx = this.ctx!;
    const dest = this.dest();
    const seq = [36, 36, 43, 31, 36, 36, 43, 38, 36, 31, 43, 36, 36, 38, 43, 31];
    const f = midi(seq[step % 16]!);
    const s = ctx.createOscillator();
    s.type = "sine";
    s.frequency.value = f;
    const tr = ctx.createOscillator();
    tr.type = "triangle";
    tr.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(480, t);
    lp.frequency.exponentialRampToValueAtTime(160, t + 0.28);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.7 * vel, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    const tg = ctx.createGain();
    tg.gain.value = 0.32;
    s.connect(lp);
    tr.connect(tg).connect(lp);
    lp.connect(g).connect(dest);
    s.start(t);
    tr.start(t);
    s.stop(t + 0.44);
    tr.stop(t + 0.44);
  }

  private flute(vel: number, t: number, phrase: boolean, variant: 0 | 1, step = 0) {
    const ctx = this.ctx!;
    const beat = 60 / this.bpm;
    const a = variant === 0 ? [76, 79] : [72, 74];
    const seq0 = [76, 79, 81, 76, 74, 79, 81, 84, 76, 74, 79, 81, 76, 72, 74, 79];
    const seq1 = [72, 74, 76, 79, 74, 72, 76, 79, 72, 69, 74, 76, 72, 67, 69, 74];
    if (!phrase) {
      const f = midi((variant === 0 ? seq0 : seq1)[step % 16]!);
      this.fluteTone(f, vel, t, 0.22);
      return;
    }
    this.fluteTone(midi(a[0]!), vel, t, 0.2);
    this.fluteTone(midi(a[1]!), vel * 0.92, t + beat * 0.5, 0.22);
  }

  private fluteTone(freq: number, vel: number, t: number, dur: number) {
    const ctx = this.ctx!;
    const dest = this.dest();
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 14;
    lfo.connect(lfoG).connect(osc.detune);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2600;
    lp.Q.value = 0.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.38 * vel, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(lp).connect(g).connect(dest);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + dur + 0.02);
    lfo.stop(t + dur + 0.02);
  }

  private harp(vel: number, t: number) {
    const notes = [64, 68, 71];
    notes.forEach((n, i) => {
      const tt = t + i * 0.032;
      const ctx = this.ctx!;
      const dest = this.dest();
      const f = midi(n);
      [1, 2, 3].forEach((h, hi) => {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = f * h;
        const g = ctx.createGain();
        const peak = (0.34 / h) * vel * (hi === 0 ? 1 : 0.55);
        g.gain.setValueAtTime(0.0001, tt);
        g.gain.exponentialRampToValueAtTime(peak, tt + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.55 - hi * 0.08);
        o.connect(g).connect(dest);
        o.start(tt);
        o.stop(tt + 0.58);
      });
    });
  }

  private bell(vel: number, t: number, step = 0) {
    const ctx = this.ctx!;
    const dest = this.dest();
    const seq = [84, 88, 91, 96, 88, 84, 91, 88, 84, 96, 91, 88, 84, 79, 88, 96];
    const f = midi(seq[step % 16]!);
    const ratios = [1, 2.0, 2.76, 4.07];
    const decays = [1.4, 0.9, 0.7, 0.4];
    ratios.forEach((r, i) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f * r;
      const g = ctx.createGain();
      const peak = (0.28 / (i + 1)) * vel;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decays[i]!);
      o.connect(g).connect(dest);
      o.start(t);
      o.stop(t + decays[i]! + 0.02);
    });
  }

  private pluck(vel: number, t: number) {
    const ctx = this.ctx!;
    const dest = this.dest();
    const f = midi(67);
    const n = Math.max(20, Math.floor(ctx.sampleRate / f));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const delay = ctx.createDelay();
    delay.delayTime.value = 1 / f;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = f * 6;
    const fb = ctx.createGain();
    fb.gain.value = 0.96;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.55 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    src.connect(filter);
    filter.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(g).connect(dest);
    src.start(t);
    src.stop(t + 0.72);
  }

  private air(vel: number, t: number) {
    const ctx = this.ctx!;
    const dest = this.dest();
    const n = this.nsrc(t);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1400;
    bp.Q.value = 0.45;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22 * vel, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    n.connect(bp).connect(g).connect(dest);
    n.stop(t + 0.72);
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = 220;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.08 * vel, t + 0.1);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
    o.connect(og).connect(dest);
    o.start(t);
    o.stop(t + 0.68);
  }

  private voice(vel: number, t: number) {
    const ctx = this.ctx!;
    const dest = this.dest();
    const f = midi(57);
    const src = ctx.createOscillator();
    src.type = "sawtooth";
    src.frequency.value = f;
    const f1 = ctx.createBiquadFilter();
    f1.type = "bandpass";
    f1.frequency.value = 700;
    f1.Q.value = 8;
    const f2 = ctx.createBiquadFilter();
    f2.type = "bandpass";
    f2.frequency.value = 1200;
    f2.Q.value = 6;
    const mix = ctx.createGain();
    mix.gain.value = 0.55;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.34 * vel, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    src.connect(f1).connect(mix);
    src.connect(f2).connect(mix);
    mix.connect(g).connect(dest);
    src.start(t);
    src.stop(t + 0.4);
  }

  private stepDur(stepIndex: number) {
    const base = 60 / this.bpm / 4;
    if (!this.swing) return base;
    const delay = 0.18 * base;
    return stepIndex % 2 === 0 ? base + delay : base - delay;
  }

  play() {
    this.unlock();
    if (!this.ctx || this.playing) return;
    this.playing = true;
    this.step = 0;
    this.playhead = 0;
    this.nextStepTime = this.ctx.currentTime + 0.04;
    this.scheduler();
    this.emit();
  }

  stop() {
    this.playing = false;
    if (this.schedTimer != null) {
      window.clearTimeout(this.schedTimer);
      this.schedTimer = null;
    }
    this.cutLoops();
    this.step = 0;
    this.playhead = 0;
    this.emit();
  }

  togglePlay() {
    if (this.playing) this.stop();
    else this.play();
  }

  toggleRec() {
    this.unlock();
    this.rec = !this.rec;
    this.emit();
  }

  private scheduler = () => {
    if (!this.playing || !this.ctx) return;
    const ctx = this.ctx;
    while (this.nextStepTime < ctx.currentTime + 0.12) {
      const s = this.step;
      this.scheduleStep(s, this.nextStepTime);
      const t = this.nextStepTime;
      const delay = Math.max(0, (t - ctx.currentTime) * 1000);
      window.setTimeout(() => {
        if (!this.playing) return;
        this.playhead = s;
        this.emit();
      }, delay);
      this.nextStepTime += this.stepDur(s);
      this.step = (s + 1) % STEPS;
    }
    this.schedTimer = window.setTimeout(this.scheduler, 25);
  };

  private scheduleStep(step: number, when: number) {
    const grid = this.patterns[this.pattern]!;
    TRACKS.forEach((tr, i) => {
      if (!grid[i]![step]) return;
      const sample = this.samples[tr.pad];
      if (sample) this.playSample(tr.pad, sample, 0.88, when, false);
      else this.synth(tr.pad, 0.88, when, false, step);
    });
  }

  toggleStep(track: TrackId, step: number) {
    this.unlock();
    const ti = TRACKS.findIndex((t) => t.id === track);
    if (ti < 0) return;
    const row = this.patterns[this.pattern]![ti]!;
    row[step] = !row[step];
    this.selectedTrack = track;
    const pad = TRACKS[ti]!.pad;
    this.selectedPad = pad;
    this.persist();
    this.emit();
  }

  setPattern(i: number) {
    this.pattern = Math.max(0, Math.min(3, i));
    this.persist();
    this.emit();
  }

  nudgeBpm(d: number) {
    this.bpm = Math.max(40, Math.min(200, this.bpm + d));
    this.persist();
    this.emit();
  }

  toggleSwing() {
    this.swing = !this.swing;
    this.persist();
    this.emit();
  }

  toggleLoop() {
    const id = this.selectedPad;
    this.loopMode[id] = !this.loopMode[id];
    if (!this.loopMode[id] && this.activeLoops.has(id)) this.stopLoop(id);
    this.persist();
    this.emit();
  }

  applyPreset(kind: "beat" | "melody" | "empty") {
    const g = emptyGrid();
    if (kind === "beat") {
      const kick = [0, 4, 8, 12];
      const snare = [4, 12];
      const hat = [1, 3, 5, 7, 9, 11, 13, 15];
      kick.forEach((s) => (g[0]![s] = true));
      snare.forEach((s) => {
        g[1]![s] = true;
        g[3]![s] = true;
      });
      hat.forEach((s) => (g[2]![s] = true));
    } else if (kind === "melody") {
      [0, 4, 8, 12, 14].forEach((s) => (g[5]![s] = true));
      [0, 2, 6, 10, 11].forEach((s) => (g[6]![s] = true));
      [4, 7, 12, 15].forEach((s) => (g[7]![s] = true));
    }
    this.patterns[this.pattern] = g;
    this.persist();
    this.emit();
  }

  async loadFile(pad: PadId, file: File) {
    this.unlock();
    if (!this.ctx) return;
    this.selectedPad = pad;
    const track = PAD_TO_TRACK[pad];
    if (track) this.selectedTrack = track;
    try {
      const buf = await file.arrayBuffer();
      const audio = await this.ctx.decodeAudioData(buf.slice(0));
      this.applyFit(pad, audio);
      this.setNote(`${PAD_LABEL[pad]} · DATEI`);
    } catch {
      this.setNote("Datei nicht lesbar");
    }
  }

  fitSelected() {
    this.unlock();
    const pad = this.selectedPad;
    const sample = this.samples[pad];
    if (!sample) {
      this.setNote("Kein Clip");
      return;
    }
    this.applyFit(pad, sample.buffer, true);
    this.setNote(`${PAD_LABEL[pad]} · FIT`);
  }

  private applyFit(pad: PadId, buffer: AudioBuffer, alreadyTrimmed = false) {
    const ctx = this.ctx!;
    const trimmed = alreadyTrimmed ? buffer : trimSilence(buffer);
    const norm = normalizePeak(ctx, trimmed, 0.9);
    const dur = norm.duration;
    const beat = 60 / this.bpm;
    const targets = [0.5, 1, 2, 4].map((b) => b * beat);
    let best = targets[0]!;
    let bestD = Math.abs(dur - best);
    for (const t of targets) {
      const d = Math.abs(dur - t);
      if (d < bestD) {
        best = t;
        bestD = d;
      }
    }
    const rate = dur / best;
    this.samples[pad] = { buffer: norm, rate: Math.max(0.25, Math.min(4, rate)) };
    this.loopMode[pad] = dur >= 0.4;
    this.persist();
    this.emit();
  }

  async startMic() {
    this.unlock();
    if (!this.ctx) return;
    if (this.mic) {
      this.micStop?.();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      this.setNote("Mikrofon blockiert (file:// oder Berechtigung)");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    } catch {
      this.setNote("Mikrofon: Zugriff verweigert");
      return;
    }
    const ctx = this.ctx;
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(2048, 1, 1);
    const silent = ctx.createGain();
    silent.gain.value = 0;
    const chunks: Float32Array[] = [];
    let samples = 0;
    const maxS = Math.floor(ctx.sampleRate * 4);
    const started = ctx.currentTime;
    this.mic = true;
    this.setNote("MIKRO · Aufnahme");
    proc.onaudioprocess = (ev) => {
      const input = ev.inputBuffer.getChannelData(0);
      const copy = new Float32Array(input.length);
      copy.set(input);
      chunks.push(copy);
      samples += input.length;
      const elapsed = ctx.currentTime - started;
      this.note = `MIKRO · ${elapsed.toFixed(1)}s`;
      this.emit();
      if (samples >= maxS) this.micStop?.();
    };
    src.connect(proc);
    proc.connect(silent);
    silent.connect(ctx.destination);
    const finish = () => {
      if (!this.mic) return;
      this.mic = false;
      this.micStop = null;
      try {
        proc.disconnect();
        src.disconnect();
      } catch {
        /* already disconnected */
      }
      stream.getTracks().forEach((tr) => tr.stop());
      const merged = mergeFloat(chunks);
      if (merged.length < 64) {
        this.setNote("MIKRO · zu kurz");
        return;
      }
      const buf = ctx.createBuffer(1, merged.length, ctx.sampleRate);
      buf.copyToChannel(merged, 0);
      this.applyFit(this.selectedPad, buf);
      this.setNote(`${PAD_LABEL[this.selectedPad]} · MIKRO`);
    };
    this.micStop = finish;
    window.setTimeout(() => this.micStop?.(), 4000);
  }

  async recordSong() {
    this.unlock();
    if (!this.ctx || this.song) return;
    const ctx = this.ctx;
    const recDur = 2 * 16 * (60 / this.bpm / 4);
    const chunks: Float32Array[] = [];
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    const silent = ctx.createGain();
    silent.gain.value = 0;
    proc.onaudioprocess = (ev) => {
      const input = ev.inputBuffer.getChannelData(0);
      const copy = new Float32Array(input.length);
      copy.set(input);
      chunks.push(copy);
    };
    this.output.connect(proc);
    proc.connect(silent);
    silent.connect(ctx.destination);
    this.recProc = proc;
    this.song = true;
    this.setNote("LIED · 2 Takte", recDur * 1000 + 800);
    const wasPlaying = this.playing;
    if (!wasPlaying) this.play();
    await waitMs(recDur * 1000);
    try {
      proc.disconnect();
      this.output.disconnect(proc);
    } catch {
      /* already disconnected */
    }
    silent.disconnect();
    this.recProc = null;
    this.song = false;
    const merged = mergeFloat(chunks);
    const blob = encodeWav(merged, ctx.sampleRate);
    downloadBlob(blob, "klangpads-lied.wav");
    this.setNote("LIED · WAV");
    this.emit();
  }

  persist() {
    try {
      const data = {
        v: 1,
        bpm: this.bpm,
        swing: this.swing,
        pattern: this.pattern,
        patterns: this.patterns,
        loopMode: this.loopMode,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* quota / private mode */
    }
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        this.emit();
        return;
      }
      const data = JSON.parse(raw) as {
        v?: number;
        bpm?: number;
        swing?: boolean;
        pattern?: number;
        patterns?: boolean[][][];
        loopMode?: Partial<Record<PadId, boolean>>;
      };
      if (typeof data.bpm === "number") this.bpm = Math.max(40, Math.min(200, data.bpm));
      if (typeof data.swing === "boolean") this.swing = data.swing;
      if (typeof data.pattern === "number") this.pattern = Math.max(0, Math.min(3, data.pattern));
      if (Array.isArray(data.patterns) && data.patterns.length === 4) {
        this.patterns = data.patterns.map((p) => {
          const g = emptyGrid();
          for (let i = 0; i < TRACK_COUNT; i++) {
            for (let s = 0; s < STEPS; s++) g[i]![s] = Boolean(p?.[i]?.[s]);
          }
          return g;
        });
      }
      if (data.loopMode) {
        for (const id of PAD_IDS) {
          if (typeof data.loopMode[id] === "boolean") this.loopMode[id] = data.loopMode[id]!;
        }
      }
    } catch {
      /* ignore corrupt */
    }
    this.emit();
  }

  dispose() {
    this.stop();
    this.micStop?.();
    if (this.noteTimer) window.clearTimeout(this.noteTimer);
    if (this.flashTimer) window.clearTimeout(this.flashTimer);
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
    this.listeners.clear();
  }
}

function trimSilence(buffer: AudioBuffer) {
  const ch = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const win = Math.max(64, Math.floor(sr * 0.004));
  const thresh = 0.012;
  let start = 0;
  let end = ch.length - 1;
  for (let i = 0; i < ch.length - win; i += win) {
    let rms = 0;
    for (let j = 0; j < win; j++) rms += ch[i + j]! * ch[i + j]!;
    if (Math.sqrt(rms / win) > thresh) {
      start = Math.max(0, i - win);
      break;
    }
  }
  for (let i = ch.length - win; i >= 0; i -= win) {
    let rms = 0;
    for (let j = 0; j < win; j++) rms += ch[i + j]! * ch[i + j]!;
    if (Math.sqrt(rms / win) > thresh) {
      end = Math.min(ch.length - 1, i + win * 2);
      break;
    }
  }
  if (end <= start + 32) {
    start = 0;
    end = ch.length - 1;
  }
  const len = end - start + 1;
  const out = new AudioBuffer({
    length: len,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: sr,
  });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    out.getChannelData(c).set(buffer.getChannelData(c).subarray(start, start + len));
  }
  return out;
}

function normalizePeak(ctx: AudioContext, buffer: AudioBuffer, peak: number) {
  let max = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) max = Math.max(max, Math.abs(d[i]!));
  }
  const out = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const gain = max > 0.0001 ? peak / max : 1;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0; i < src.length; i++) dst[i] = src[i]! * gain;
  }
  return out;
}

function mergeFloat(chunks: Float32Array[]) {
  let n = 0;
  for (const c of chunks) n += c.length;
  const out = new Float32Array(n);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

function encodeWav(samples: Float32Array, sampleRate: number) {
  const n = samples.length;
  const buffer = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buffer);
  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  view.setUint32(4, 36 + n * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, n * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function waitMs(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}
