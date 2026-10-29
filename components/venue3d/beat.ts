// The event-night show: a shared beat clock, the look of each act, and original music synthesised in the
// browser with Web Audio. No recordings, samples or downloads: every sound is generated here, so nothing is
// licensed and nothing is the artist's own music. Sound starts only after the user clicks.
import type { EventKind, VenueEvent } from "./geometry";

export type Section = "intro" | "build" | "drop" | "break";
export type Style = {
  id: "rock" | "pop" | "rnb" | "country" | "indie" | "electro" | "orchestral" | "hockey";
  bpm: number;
  /** MIDI note of the key's root. */
  root: number;
  minor: boolean;
  /** Scale degrees (0-6) of the chord on each bar of a 4-bar loop. */
  prog: number[];
  swing: number;
  drive: number;
};
export type Look = {
  /** Stage-light colours, strongest first. */
  colors: string[];
  /** Background of the LED wall. */
  wall: string;
  /** Text and banner colour on screens. */
  ink: string;
  label: string;
  /** Banners the ribbon boards scroll through. */
  banners: string[];
};
export type ShowSpec = { style: Style; look: Look; home?: Team; away?: Team };
export type Team = { name: string; short: string; colors: [string, string] };

const S = (id: Style["id"], bpm: number, root: number, minor: boolean, prog: number[], swing = 0, drive = 0): Style => ({ id, bpm, root, minor, prog, swing, drive });

/** Stage looks per act. These are this app's own lighting designs, not the tour's. */
const ACTS: { match: RegExp; style: Style; colors: string[]; wall: string; ink: string }[] = [
  { match: /man[aá]/i, style: S("rock", 126, 45, true, [0, 5, 2, 6], 0, 0.6), colors: ["#ff3b1f", "#ffb12b", "#ffe8b0", "#c4122f"], wall: "#2a0705", ink: "#ffd27a" },
  { match: /phoebe/i, style: S("indie", 92, 50, true, [0, 3, 5, 4]), colors: ["#5f8bff", "#ffffff", "#2a3dff", "#a8c6ff"], wall: "#050a1f", ink: "#e9efff" },
  { match: /kacey/i, style: S("country", 112, 52, false, [0, 3, 4, 0], 0.08), colors: ["#ff7ac8", "#ffd36b", "#ffffff", "#b26bff"], wall: "#2b0a26", ink: "#ffe3f3" },
  { match: /beabadoobee/i, style: S("indie", 118, 55, false, [0, 4, 5, 3], 0, 0.3), colors: ["#ffb3d1", "#9fe3ff", "#fff4a8", "#c7a6ff"], wall: "#1b1426", ink: "#fff1f7" },
  { match: /gorillaz/i, style: S("electro", 104, 43, true, [0, 0, 5, 6], 0.12), colors: ["#7cff3a", "#00e1ff", "#ff2fd1", "#ffffff"], wall: "#06140a", ink: "#b8ff8a" },
  { match: /bryson/i, style: S("rnb", 84, 46, true, [0, 5, 3, 4], 0.18), colors: ["#ff1f3d", "#ff7a2b", "#ffffff", "#8a0a1f"], wall: "#140306", ink: "#ffd0d6" },
  { match: /teddy/i, style: S("rnb", 96, 48, false, [0, 5, 3, 4], 0.1), colors: ["#ffb347", "#ff6a2b", "#fff1d6", "#d9480f"], wall: "#1f0e03", ink: "#ffe6c2" },
  { match: /smashing/i, style: S("rock", 132, 42, true, [0, 6, 5, 6], 0, 0.8), colors: ["#a35bff", "#e0e0ff", "#ff2f6d", "#5b2bff"], wall: "#0e061f", ink: "#efe2ff" },
  { match: /lauryn|fugees/i, style: S("rnb", 90, 47, true, [0, 3, 4, 3], 0.2), colors: ["#ffcf3a", "#3aff8f", "#ff6a2b", "#ffffff"], wall: "#14110a", ink: "#ffe9a8" },
  { match: /garth/i, style: S("country", 120, 50, false, [0, 4, 5, 3], 0.05, 0.3), colors: ["#ffffff", "#ffc56b", "#7fb2ff", "#ff9b3a"], wall: "#0b0d12", ink: "#ffffff" },
  { match: /katseye/i, style: S("pop", 122, 49, true, [0, 5, 2, 6]), colors: ["#ff3fb4", "#7a5cff", "#ffffff", "#3ad7ff"], wall: "#1a0420", ink: "#ffd6f2" },
  { match: /taemin|k-era/i, style: S("pop", 124, 47, true, [0, 5, 3, 4]), colors: ["#ff2f6d", "#ffffff", "#7a5cff", "#ffd36b"], wall: "#14030a", ink: "#ffe0ea" },
  { match: /trans-siberian/i, style: S("orchestral", 138, 45, true, [0, 5, 3, 4], 0, 0.7), colors: ["#ff2b2b", "#ffffff", "#ffb02b", "#2b6bff"], wall: "#1a0303", ink: "#fff1e0" },
];

const TEAMS: Record<string, [string, string]> = {
  "Detroit Red Wings": ["#ce1126", "#ffffff"], "Utah Mammoth": ["#090909", "#6cace4"], "Minnesota Wild": ["#154734", "#ddcba4"],
  "Toronto Maple Leafs": ["#00205b", "#ffffff"], "Calgary Flames": ["#c8102e", "#f1be48"], "New York Rangers": ["#0038a8", "#ce1126"],
  "Vancouver Canucks": ["#00205b", "#00843d"], "Anaheim Ducks": ["#fc4c02", "#000000"], "Chicago Blackhawks": ["#cf0a2c", "#000000"],
  "Edmonton Oilers": ["#041e42", "#ff4c00"],
};
const KRAKEN: Team = { name: "Seattle Kraken", short: "SEA", colors: ["#99d9d9", "#001628"] };
const shortOf = (n: string) => ({ "Detroit Red Wings": "DET", "Utah Mammoth": "UTA", "Minnesota Wild": "MIN", "Toronto Maple Leafs": "TOR", "Calgary Flames": "CGY", "New York Rangers": "NYR", "Vancouver Canucks": "VAN", "Anaheim Ducks": "ANA", "Chicago Blackhawks": "CHI", "Edmonton Oilers": "EDM" } as Record<string, string>)[n] ?? n.slice(0, 3).toUpperCase();

function monthDay(date: string) {
  const d = new Date(date + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
}

export function showFor(event: VenueEvent, kind: EventKind): ShowSpec {
  const act = (event.headliner ?? event.title).replace(/^K-ERA Fest 2026: /, "").replace(/ & Wyclef Jean.*$/, " & Wyclef Jean");
  if (kind !== "concert") {
    const opp = (event.headliner ?? event.title).replace(/^Seattle Kraken vs\.? /, "").trim();
    const away: Team = { name: opp, short: shortOf(opp), colors: TEAMS[opp] ?? ["#888888", "#ffffff"] };
    return {
      style: S("hockey", 100, 48, false, [0, 3, 4, 4]),
      home: KRAKEN, away,
      look: {
        colors: ["#99d9d9", "#e9072b", "#ffffff", "#68a2b9"], wall: "#001628", ink: "#e9fbff", label: "Seattle Kraken",
        banners: [`KRAKEN vs ${away.name.toUpperCase()}`, "RELEASE THE KRAKEN", `${monthDay(event.date)} · CLIMATE PLEDGE ARENA`, "MAKE SOME NOISE"],
      },
    };
  }
  const a = ACTS.find((x) => x.match.test(act)) ?? { style: S("pop", 118, 48, false, [0, 5, 3, 4]), colors: ["#d7ff3a", "#ff6a2b", "#ffffff", "#3ad7ff"], wall: "#0f110c", ink: "#f2f0e8" };
  return {
    style: a.style,
    look: { colors: a.colors, wall: a.wall, ink: a.ink, label: act, banners: [act.toUpperCase(), "LIVE AT CLIMATE PLEDGE ARENA", `${monthDay(event.date)} · SEATTLE`, "ONE NIGHT ONLY"] },
  };
}

/* ---------- Beat clock ---------- */

/** Shared show state, read every frame by the 3D view. Lights run on this clock even with the sound off. */
export const pulse = {
  bpm: 120,
  t0: 0,
  /** Beats since the show started. */
  beat: 0,
  /** 0-1 envelope of the last kick. */
  kick: 0,
  /** 0-1 envelope of the last snare or clap. */
  snare: 0,
  section: "intro" as Section,
  /** 0-1 how full the music is right now. */
  energy: 0.3,
  /** performance.now() of the last goal, 0 if none. */
  goalAt: 0,
  /** Hockey: pre-game show with the house dark and projections on the ice. */
  intro: false,
  /** Spectrum (0-1, 16 bands) when the sound is on, otherwise a synthetic one. */
  bands: new Float32Array(16),
  sound: false,
};

// Exposed for screenshots and debugging in the browser console.
if (typeof window !== "undefined") (window as unknown as { __venueShow?: typeof pulse }).__venueShow = pulse;

const SECTIONS: Section[] = ["intro", "build", "drop", "drop", "break", "build", "drop", "drop"];
export function sectionAt(beat: number): Section { return SECTIONS[Math.floor(beat / 32) % SECTIONS.length]; }

/** Advance the clock; call once per frame. */
export function tick(now = performance.now()) {
  const p = pulse;
  if (!p.t0) p.t0 = now;
  const beat = ((now - p.t0) / 60000) * p.bpm;
  p.beat = beat;
  p.section = sectionAt(beat);
  const target = p.section === "drop" ? 1 : p.section === "build" ? 0.55 + 0.4 * ((beat % 32) / 32) : p.section === "break" ? 0.22 : 0.35;
  p.energy += (target - p.energy) * 0.05;
  const frac = beat % 1;
  const kickOn = p.section !== "break" && p.section !== "intro";
  const env = Math.exp(-frac * 7);
  p.kick = kickOn ? env : p.section === "intro" ? (Math.floor(beat) % 2 === 0 ? env * 0.4 : 0) : 0;
  const half = (beat + 1) % 2;
  p.snare = p.section === "intro" ? 0 : half < 1 ? Math.exp(-half * 9) : 0;
  if (!engine || !engine.analyser) {
    for (let i = 0; i < 16; i++) {
      const wob = 0.5 + 0.5 * Math.sin(beat * (1.3 + i * 0.37) + i);
      p.bands[i] = Math.min(1, p.energy * (0.35 + 0.65 * wob) * (1 - i / 22) + p.kick * (i < 4 ? 0.5 : 0.1));
    }
  } else engine.readBands(p.bands);
}

export function resetClock(bpm: number) { pulse.bpm = bpm; pulse.t0 = performance.now(); pulse.goalAt = 0; }

/* ---------- Synth ---------- */

const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10];
const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class Engine {
  ctx: AudioContext;
  out: GainNode;
  bus: GainNode;
  analyser: AnalyserNode;
  delay: DelayNode;
  noise: AudioBuffer;
  shaper: WaveShaperNode;
  crowd: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  timer = 0;
  nextStep = -1;
  style: Style;
  perf0: number;
  ctx0: number;
  freq = new Uint8Array(64);

  constructor(style: Style) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    this.style = style;
    const c = this.ctx;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.out = c.createGain(); this.out.gain.value = 0.55;
    this.bus = c.createGain(); this.bus.gain.value = 1;
    this.analyser = c.createAnalyser(); this.analyser.fftSize = 128; this.analyser.smoothingTimeConstant = 0.7;
    // A big room: a short feedback delay standing in for arena reverb.
    this.delay = c.createDelay(1); this.delay.delayTime.value = 0.11;
    const fb = c.createGain(); fb.gain.value = 0.34;
    const wet = c.createGain(); wet.gain.value = 0.22;
    const damp = c.createBiquadFilter(); damp.type = "lowpass"; damp.frequency.value = 2600;
    this.bus.connect(comp); this.bus.connect(this.delay); this.delay.connect(damp); damp.connect(fb); fb.connect(this.delay); damp.connect(wet); wet.connect(comp);
    comp.connect(this.out); this.out.connect(this.analyser); this.analyser.connect(c.destination);
    this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.shaper = c.createWaveShaper();
    const k = 40, curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); }
    this.shaper.curve = curve;
    const sg = c.createGain(); sg.gain.value = 0.18; this.shaper.connect(sg); sg.connect(this.bus);
    this.perf0 = performance.now(); this.ctx0 = c.currentTime;
  }

  /** Context time of a beat on the shared clock. */
  timeOf(beat: number) { return this.ctx0 + (pulse.t0 + (beat * 60000) / pulse.bpm - this.perf0) / 1000; }

  start() {
    this.perf0 = performance.now(); this.ctx0 = this.ctx.currentTime;
    this.nextStep = Math.floor(pulse.beat * 4) + 1;
    this.startCrowd();
    const loop = () => {
      const ahead = this.ctx.currentTime + 0.15;
      while (this.timeOf(this.nextStep / 4) < ahead) {
        const t = this.timeOf(this.nextStep / 4);
        if (t > this.ctx.currentTime - 0.02) this.step(this.nextStep, Math.max(t, this.ctx.currentTime));
        this.nextStep++;
      }
    };
    this.timer = window.setInterval(loop, 30);
    loop();
  }

  stop() { window.clearInterval(this.timer); this.ctx.close().catch(() => {}); }

  readBands(out: Float32Array) {
    this.analyser.getByteFrequencyData(this.freq);
    for (let i = 0; i < 16; i++) {
      const a = this.freq[Math.floor(i * 2.2) + 1] / 255;
      out[i] = Math.min(1, a * 1.25);
    }
  }

  /* --- voices --- */
  env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  kick(t: number, v = 1) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    this.env(g, t, 0.003, 0.95 * v, 0.38); o.connect(g); g.connect(this.bus); o.start(t); o.stop(t + 0.45);
  }
  noiseHit(t: number, type: BiquadFilterType, f: number, q: number, peak: number, dur: number, dest: AudioNode = this.bus) {
    const c = this.ctx, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    this.env(g, t, 0.002, peak, dur); s.connect(fl); fl.connect(g); g.connect(dest); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  snare(t: number) {
    this.noiseHit(t, "bandpass", 1900, 0.8, 0.5, 0.18);
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = "triangle"; o.frequency.value = 190;
    this.env(g, t, 0.002, 0.35, 0.09); o.connect(g); g.connect(this.bus); o.start(t); o.stop(t + 0.12);
  }
  clap(t: number) { for (let i = 0; i < 3; i++) this.noiseHit(t + i * 0.011, "bandpass", 1400, 1.2, 0.42, i === 2 ? 0.16 : 0.02); }
  hat(t: number, open = false, v = 1) { this.noiseHit(t, "highpass", 7600, 0.7, 0.16 * v, open ? 0.22 : 0.045); }
  tone(t: number, f: number, dur: number, type: OscillatorType, peak: number, cutoff = 2000, a = 0.01, detune = 0, dest: AudioNode = this.bus) {
    const c = this.ctx, o = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain();
    o.type = type; o.frequency.value = f; o.detune.value = detune;
    fl.type = "lowpass"; fl.frequency.setValueAtTime(cutoff, t); fl.frequency.exponentialRampToValueAtTime(Math.max(120, cutoff * 0.35), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.setValueAtTime(peak, t + Math.max(a, dur * 0.6)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(fl); fl.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  organ(t: number, m: number, dur: number) {
    [1, 2, 3, 4].forEach((h, i) => this.tone(t, hz(m) * h, dur, "sine", [0.09, 0.05, 0.035, 0.02][i], 6000, 0.008));
  }
  horn(t: number) {
    [43, 47, 50, 55].forEach((m) => this.tone(t, hz(m), 2.6, "sawtooth", 0.12, 900, 0.05, Math.random() * 8));
    for (let i = 0; i < 6; i++) this.noiseHit(t + 0.2 + i * 0.35, "bandpass", 1200 + Math.random() * 900, 0.6, 0.3, 0.9, this.out);
    this.cheer(t, 0.7);
  }
  startCrowd() {
    const c = this.ctx, s = c.createBufferSource(), lp = c.createBiquadFilter(), bp = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; s.loop = true; lp.type = "lowpass"; lp.frequency.value = 900; bp.type = "peaking"; bp.frequency.value = 450; bp.gain.value = 6;
    g.gain.value = this.style.id === "hockey" ? 0.09 : 0.05;
    s.connect(lp); lp.connect(bp); bp.connect(g); g.connect(this.out); s.start();
    this.crowd = { src: s, gain: g };
  }
  cheer(t: number, peak = 0.6) {
    if (!this.crowd) return;
    const g = this.crowd.gain.gain, base = this.style.id === "hockey" ? 0.09 : 0.05;
    g.cancelScheduledValues(t); g.setValueAtTime(base, t); g.linearRampToValueAtTime(peak, t + 0.4); g.linearRampToValueAtTime(base, t + 5);
  }

  chord(bar: number) {
    const st = this.style, sc = st.minor ? MINOR : MAJOR, deg = st.prog[bar % st.prog.length];
    const note = (d: number) => st.root + sc[d % 7] + 12 * Math.floor(d / 7);
    return [note(deg), note(deg + 2), note(deg + 4)];
  }

  /** One sixteenth note. */
  step(n: number, t: number) {
    const st = this.style, beat = n / 4, sec = sectionAt(beat), s16 = n % 16, bar = Math.floor(n / 16);
    const ch = this.chord(bar), sixteenth = 60 / st.bpm / 4;
    const sw = n % 2 === 1 ? st.swing * sixteenth : 0, tt = t + sw;
    const full = sec === "drop", build = sec === "build", brk = sec === "break", intro = sec === "intro";
    const posInSec = (beat % 32) / 32;

    if (st.id === "hockey") {
      // Arena organ riff, stomp-stomp-clap, crowd bed.
      if (s16 === 0 || s16 === 4) this.kick(t, 0.8);
      if (s16 === 8) this.clap(t);
      if (s16 % 2 === 0 && !brk) this.hat(tt, false, 0.5);
      const riff = [0, 4, 7, 12, 7, 4, 7, 12];
      if (s16 % 2 === 0 && (full || build)) this.organ(t, st.root + 12 + riff[(s16 / 2 + bar * 2) % riff.length], sixteenth * 1.8);
      if (s16 === 0 && (intro || brk)) ch.forEach((m) => this.organ(t, m + 12, sixteenth * 15));
      if (s16 === 0 && bar % 8 === 0) this.cheer(t, 0.25);
      return;
    }

    // Drums
    const four = st.id === "pop" || st.id === "electro" || st.id === "orchestral" || (st.id === "rock" && full);
    if (!brk && !intro) {
      if (four ? s16 % 4 === 0 : s16 === 0 || s16 === 10 || (s16 === 8 && st.id === "rock")) this.kick(t);
      if (s16 === 4 || s16 === 12) (st.id === "pop" || st.id === "electro" || st.id === "rnb" ? this.clap(tt) : this.snare(tt));
      if (build && posInSec > 0.75 && s16 % 2 === 0) this.snare(tt);
    }
    if (intro && s16 === 0) this.kick(t, 0.5);
    if (!brk) {
      if (st.id === "rnb") { if (s16 % 2 === 0 || (full && Math.random() < 0.3)) this.hat(tt, false, 0.8); }
      else if (s16 % 2 === 0) this.hat(tt, s16 % 4 === 2 && full, intro ? 0.5 : 1);
    }
    if (build && posInSec > 0.5 && s16 === 0) this.noiseHit(t, "highpass", 1500 + 5000 * posInSec, 1, 0.08 + 0.12 * posInSec, sixteenth * 16);

    // Pad on every bar
    if (s16 === 0) {
      const padType: OscillatorType = st.id === "country" ? "triangle" : "sawtooth";
      ch.forEach((m, i) => [-7, 7].forEach((dt) => this.tone(t, hz(m + 12), sixteenth * 16, padType, brk || intro ? 0.035 : 0.022, brk ? 900 : 1600, 0.25, dt + i)));
    }
    // Bass
    if (!intro) {
      const pat = st.id === "rock" || st.id === "orchestral" ? s16 % 2 === 0 : st.id === "rnb" ? [0, 3, 6, 10].includes(s16) : st.id === "country" ? s16 % 4 === 0 : [0, 3, 6, 8, 11, 14].includes(s16);
      if (pat && !brk) {
        const m = ch[0] - 12 + (st.id === "country" && s16 % 8 === 4 ? 7 : 0);
        this.tone(t, hz(m), sixteenth * (st.id === "rnb" ? 3 : 1.6), st.id === "rnb" ? "sine" : "sawtooth", st.id === "rnb" ? 0.32 : 0.2, st.id === "rnb" ? 400 : 700, 0.005);
      }
    }
    // Guitars: power chords through the drive for rock
    if (st.drive > 0 && (full || (build && posInSec > 0.5)) && s16 % 2 === 0) {
      [ch[0] - 12, ch[0] - 5, ch[0]].forEach((m) => this.tone(t, hz(m), sixteenth * 1.7, "sawtooth", 0.18 * st.drive, 3000, 0.004, 0, this.shaper));
    }
    // Lead arpeggio on the drops
    if (full && st.id !== "rock") {
      const arp = [0, 1, 2, 1, 0, 2, 1, 2];
      if (s16 % (st.id === "rnb" || st.id === "indie" ? 4 : 2) === 0) {
        const m = ch[arp[(s16 / 2) % arp.length]] + 24;
        const type: OscillatorType = st.id === "country" ? "triangle" : st.id === "orchestral" ? "sawtooth" : "square";
        this.tone(tt, hz(m), sixteenth * 1.5, type, 0.06, 3200, 0.004);
      }
    }
    if (full && st.id === "rock" && s16 === 0 && bar % 2 === 0) this.tone(t, hz(ch[0] + 24), sixteenth * 7, "sawtooth", 0.05, 2400, 0.02, 0, this.shaper);
    if (full && s16 === 0 && bar % 4 === 0) this.cheer(t, 0.16);
    if (st.id === "orchestral" && s16 % 4 === 0 && (full || build)) ch.forEach((m) => this.tone(t, hz(m + 12), sixteenth * 3.5, "sawtooth", 0.025, 2600, 0.03, 4));
  }
}

let engine: Engine | null = null;

/** Start or stop the sound. Must be called from a click handler (browsers block audio otherwise). */
export function setSound(on: boolean, spec: ShowSpec) {
  if (engine) { engine.stop(); engine = null; }
  pulse.sound = false;
  if (!on || typeof window === "undefined") return;
  try {
    engine = new Engine(spec.style);
    engine.ctx.resume().catch(() => {});
    engine.start();
    pulse.sound = true;
  } catch { engine = null; }
}

export function goal() {
  pulse.goalAt = performance.now();
  if (engine) engine.horn(engine.ctx.currentTime + 0.02);
}
