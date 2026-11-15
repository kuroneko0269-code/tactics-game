import { MELODIES, TIMBRES, type MelodyDefinition, type SoundEffectId } from '../data/sounds';

/**
 * 音（序章に足りない仕組み）。音声のファイルは使わず、ブラウザの Web Audio で合成する。
 * - 旋律（単音の列。src/data/sounds.ts）を、鼻歌のような柔らかい音・石が鳴るような澄んだ音・大勢の歌声で鳴らす。
 * - 効果音: 攻撃・命中・ミス・魔法・決定・取り消し・門・折れる・石の音・水。
 * - 音量と消音。ブラウザは最初のタップがあるまで音を鳴らせないので、最初のタップで音の仕組みを起こす（unlock）。
 * - 音がなくても内容が伝わるように、旋律が鳴っている間は画面に印（♪）を出す（onMelodyChange で画面に知らせる）。
 *   旋律の進み具合は、音が出ていなくても時計で数える（「節の終わりを待つ」が、消音でも同じ時間で進むように）。
 */
export interface SoundSystem {
  /** 最初のタップで呼ぶ（ブラウザの制限で、それまでは音が出ない） */
  unlock(): void;
  setVolume(volume: number, muted: boolean): void;
  /** 旋律を鳴らす（前の旋律は止める）。timbre は台本の音色の名前（鼻歌・石・歌声） */
  playMelody(melody: string, timbre: string, mark?: string): void;
  stopMelody(): void;
  /**
   * 鳴っている旋律の、終わりから remaining 個目の音が鳴りはじめるまで待つ（3 なら「終わりの三つの音」の1つ目が鳴りはじめた時。
   * 0 なら終わるまで。鳴っていないか、もう過ぎていればすぐ）
   */
  waitMelody(remaining: number): Promise<void>;
  /** 効果音 */
  effect(id: SoundEffectId): void;
  /** 今鳴っている旋律（自動テストと、画面の印に使う） */
  readonly melody: () => { readonly melody: string; readonly timbre: string; readonly mark?: string; readonly index: number; readonly total: number } | null;
  /** 旋律が鳴りはじめた・止まった時に呼ぶ */
  onMelodyChange(listener: () => void): void;
  /** 鳴らした効果音の記録（自動テスト用。新しい順に最大 20） */
  readonly recent: () => readonly SoundEffectId[];
}

const NOTE_INDEX: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 「E4」「F#4」を周波数（Hz）に。休み（-）は null */
export function noteFrequency(name: string): number | null {
  if (name === '-') return null;
  const m = /^([A-G])(#|b)?(\d)$/.exec(name);
  if (!m) throw new Error(`音の高さ ${name} を読めません`);
  const semitone = NOTE_INDEX[m[1]!]! + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
  return 440 * 2 ** ((semitone - 69) / 12);
}

/** 旋律を、音ごとの開始時刻（秒）・長さ（秒）・周波数の列にする */
export function melodyNotes(def: MelodyDefinition): { start: number; length: number; frequency: number | null }[] {
  let t = 0;
  return def.notes.map((n) => {
    const [pitch = '-', beats = '1'] = n.trim().split(/\s+/);
    const length = Number(beats) * def.beatSeconds;
    const note = { start: t, length, frequency: noteFrequency(pitch) };
    t += length;
    return note;
  });
}

export function createSoundSystem(): SoundSystem {
  let ctx: AudioContext | undefined;
  let master: GainNode | undefined;
  let volume = 70;
  let muted = false;
  const listeners: (() => void)[] = [];
  const recentEffects: SoundEffectId[] = [];

  /** 鳴っている旋律（音が出ていなくても、時計で進み具合を数える） */
  let current:
    | {
        melody: string;
        timbre: string;
        mark?: string;
        index: number;
        total: number;
        timers: number[];
        voices: { stop: (at: number) => void }[];
        waiters: { remaining: number; resolve: () => void }[];
      }
    | undefined;

  const gainValue = () => (muted ? 0 : (volume / 100) * 0.8);
  const notify = () => listeners.forEach((l) => l());

  const ensure = (): AudioContext | undefined => {
    if (ctx) return ctx;
    const Ctor = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return undefined;
    try {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = gainValue();
      master.connect(ctx.destination);
    } catch {
      ctx = undefined;
    }
    return ctx;
  };

  // ---- 合成のしかた ----
  /** 包絡（音量の立ち上がりと減衰）つきの音量の節 */
  const envelope = (ac: AudioContext, at: number, attack: number, peak: number, decay: number, sustainUntil?: number) => {
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
    if (sustainUntil !== undefined) g.gain.setValueAtTime(peak, Math.max(at + attack, sustainUntil));
    g.gain.exponentialRampToValueAtTime(0.0001, (sustainUntil ?? at + attack) + decay);
    return g;
  };

  /** 鼻歌: 柔らかい三角波とサイン波を重ね、高い所を削って、わずかに揺らす */
  const hum = (ac: AudioContext, out: AudioNode, f: number, at: number, length: number, detune = 0, level = 0.2) => {
    const end = at + length;
    const g = envelope(ac, at, 0.07, level, 0.18, end - 0.06);
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.7;
    const o1 = ac.createOscillator();
    o1.type = 'triangle';
    o1.frequency.value = f;
    o1.detune.value = detune;
    const o2 = ac.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f;
    o2.detune.value = detune;
    // 声のような揺れ
    const lfo = ac.createOscillator();
    lfo.frequency.value = 5.2;
    const lfoGain = ac.createGain();
    lfoGain.gain.value = 6;
    lfo.connect(lfoGain);
    lfoGain.connect(o1.detune);
    lfoGain.connect(o2.detune);
    o1.connect(filter);
    o2.connect(filter);
    filter.connect(g);
    g.connect(out);
    const oscs = [o1, o2, lfo];
    for (const o of oscs) {
      o.start(at);
      o.stop(end + 0.3);
    }
    return { stop: (t: number) => oscs.forEach((o) => o.stop(t)) };
  };

  /** 石の音: すぐに立ち上がり、長く澄んで減っていく。整数倍でない倍音を少し混ぜる（ガラスや石を打ったような音） */
  const stone = (ac: AudioContext, out: AudioNode, f: number, at: number, length: number, level = 0.22) => {
    const partials: [number, number][] = [
      [1, 1],
      [2.76, 0.28],
      [5.4, 0.08],
    ];
    const oscs: OscillatorNode[] = [];
    for (const [ratio, amp] of partials) {
      const o = ac.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * ratio;
      const g = envelope(ac, at, 0.004, level * amp, Math.max(0.6, length * 1.6) / ratio);
      o.connect(g);
      g.connect(out);
      o.start(at);
      o.stop(at + 2.2);
      oscs.push(o);
    }
    return { stop: (t: number) => oscs.forEach((o) => o.stop(t)) };
  };

  const noise = (ac: AudioContext, seconds: number) => {
    const buffer = ac.createBuffer(1, Math.max(1, Math.floor(ac.sampleRate * seconds)), ac.sampleRate);
    const data = buffer.getChannelData(0);
    // 雑音は見た目の効果音だけに使う（戦闘の結果には関わらない）
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buffer;
    return src;
  };

  const blip = (ac: AudioContext, out: AudioNode, from: number, to: number, at: number, seconds: number, type: OscillatorType, level: number) => {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, at);
    o.frequency.exponentialRampToValueAtTime(to, at + seconds);
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2400;
    const g = envelope(ac, at, 0.005, level, seconds);
    o.connect(filter);
    filter.connect(g);
    g.connect(out);
    o.start(at);
    o.stop(at + seconds + 0.05);
  };

  const filteredNoise = (ac: AudioContext, out: AudioNode, at: number, seconds: number, type: BiquadFilterType, freq: number, level: number, attack = 0.005) => {
    const src = noise(ac, seconds + 0.05);
    const filter = ac.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const g = envelope(ac, at, attack, level, seconds);
    src.connect(filter);
    filter.connect(g);
    g.connect(out);
    src.start(at);
    src.stop(at + seconds + 0.05);
  };

  const playEffect = (ac: AudioContext, out: AudioNode, id: SoundEffectId) => {
    const t = ac.currentTime + 0.01;
    switch (id) {
      case 'attack':
        filteredNoise(ac, out, t, 0.14, 'bandpass', 1400, 0.35);
        return;
      case 'hit':
        blip(ac, out, 160, 55, t, 0.16, 'sine', 0.5);
        filteredNoise(ac, out, t, 0.06, 'highpass', 2000, 0.2);
        return;
      case 'miss':
        filteredNoise(ac, out, t, 0.1, 'bandpass', 3200, 0.22);
        return;
      case 'magic':
        [660, 880, 1175, 1568].forEach((f, i) => stone(ac, out, f, t + i * 0.06, 0.3, 0.12));
        return;
      case 'confirm':
        blip(ac, out, 660, 660, t, 0.05, 'square', 0.08);
        blip(ac, out, 990, 990, t + 0.06, 0.07, 'square', 0.08);
        return;
      case 'select':
        blip(ac, out, 560, 560, t, 0.05, 'square', 0.06);
        return;
      case 'cancel':
        blip(ac, out, 520, 330, t, 0.1, 'square', 0.07);
        return;
      case 'gate':
        [523, 659, 784, 1046].forEach((f, i) => hum(ac, out, f, t + i * 0.12, 1.4, 0, 0.07));
        [1568, 2093].forEach((f, i) => stone(ac, out, f, t + 0.3 + i * 0.2, 1, 0.06));
        return;
      case 'break':
        filteredNoise(ac, out, t, 0.25, 'highpass', 1800, 0.4);
        blip(ac, out, 220, 70, t, 0.25, 'triangle', 0.35);
        return;
      case 'chime':
        stone(ac, out, 1318, t, 1, 0.2);
        return;
      case 'water':
        filteredNoise(ac, out, t, 1.6, 'lowpass', 700, 0.25, 0.4);
        return;
    }
  };

  const clearMelody = () => {
    if (!current) return;
    for (const timer of current.timers) window.clearTimeout(timer);
    const now = ctx?.currentTime ?? 0;
    for (const v of current.voices) {
      try {
        v.stop(now + 0.05);
      } catch {
        // すでに止まっていれば何もしない
      }
    }
    for (const w of current.waiters) w.resolve();
    current = undefined;
  };

  /** 終わりから remaining 個目の音が鳴りはじめたか（index は鳴りはじめた音の数） */
  const reached = (index: number, total: number, remaining: number) => (remaining <= 0 ? index > total : index >= total - remaining + 1);
  const resolveWaiters = () => {
    if (!current) return;
    const c = current;
    const done = c.waiters.filter((w) => reached(c.index, c.total, w.remaining));
    current.waiters = current.waiters.filter((w) => !done.includes(w));
    for (const w of done) w.resolve();
  };

  return {
    unlock() {
      const ac = ensure();
      if (ac && ac.state === 'suspended') void ac.resume();
    },
    setVolume(v, m) {
      volume = Math.max(0, Math.min(100, v));
      muted = m;
      if (master && ctx) master.gain.setTargetAtTime(gainValue(), ctx.currentTime, 0.02);
    },
    playMelody(name, timbreName, mark) {
      clearMelody();
      const def = MELODIES[name];
      if (!def) return;
      const notes = melodyNotes(def);
      const timbre = TIMBRES[timbreName] ?? 'hum';
      const playing: NonNullable<typeof current> = {
        melody: name,
        timbre: timbreName,
        ...(mark ? { mark } : {}),
        index: 0,
        total: notes.length,
        timers: [],
        voices: [],
        waiters: [],
      };
      current = playing;
      const ac = ctx && ctx.state === 'running' ? ctx : undefined;
      const base = ac ? ac.currentTime + 0.05 : 0;
      notes.forEach((n, i) => {
        // 進み具合は時計で数える（音が出ていなくても同じ）
        playing.timers.push(
          window.setTimeout(() => {
            if (current !== playing) return;
            playing.index = i + 1;
            resolveWaiters();
          }, Math.round(n.start * 1000)),
        );
        if (ac && master && n.frequency !== null) {
          const at = base + n.start;
          if (timbre === 'stone') playing.voices.push(stone(ac, master, n.frequency, at, n.length));
          else if (timbre === 'choir') {
            for (const d of [-7, 0, 6]) playing.voices.push(hum(ac, master, n.frequency, at, n.length, d, 0.1));
            playing.voices.push(hum(ac, master, n.frequency / 2, at, n.length, 0, 0.06));
          } else playing.voices.push(hum(ac, master, n.frequency, at, n.length));
        }
      });
      const last = notes[notes.length - 1];
      const end = last ? last.start + last.length : 0;
      playing.timers.push(
        window.setTimeout(() => {
          if (current !== playing) return;
          playing.index = playing.total;
          for (const w of playing.waiters) w.resolve();
          current = undefined;
          notify();
        }, Math.round(end * 1000) + 200),
      );
      notify();
    },
    stopMelody() {
      if (!current) return;
      clearMelody();
      notify();
    },
    waitMelody(remaining) {
      if (!current || reached(current.index, current.total, remaining)) return Promise.resolve();
      return new Promise<void>((resolve) => current!.waiters.push({ remaining, resolve }));
    },
    effect(id) {
      recentEffects.unshift(id);
      recentEffects.length = Math.min(recentEffects.length, 20);
      const ac = ctx && ctx.state === 'running' ? ctx : undefined;
      if (!ac || !master || muted || volume === 0) return;
      playEffect(ac, master, id);
    },
    melody: () =>
      current ? { melody: current.melody, timbre: current.timbre, ...(current.mark ? { mark: current.mark } : {}), index: current.index, total: current.total } : null,
    onMelodyChange(listener) {
      listeners.push(listener);
    },
    recent: () => recentEffects.slice(),
  };
}
