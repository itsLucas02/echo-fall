export type SoundCue =
  | 'jump'
  | 'land'
  | 'step'
  | 'shard'
  | 'stomp'
  | 'hurt'
  | 'record'
  | 'echo'
  | 'plate'
  | 'gate'
  | 'checkpoint'
  | 'win'
  | 'bounce'
  | 'crumble'
  | 'toggle'
  | 'chime'
  | 'shoot'
  | 'pop'
  | 'slam'
  | 'good'
  | 'bad'
  | 'unlock'
  | 'throw'
  | 'hit'
  | 'clang'
  | 'growl'
  | 'swoop'
  | 'reject'
  | 'tick'
  | 'stepheavy';

export type AmbienceProfile = 'city' | 'cave' | 'highland' | 'dusk';

export interface PlayOptions {
  /** 0..1, usually distance-attenuated by the scene. */
  volume?: number;
  /** -1 (left) .. 1 (right), usually direction-attenuated by the scene. */
  pan?: number;
}

export type AmbienceFlavor = 'city' | 'cave' | 'highland' | 'dusk';

/**
 * Procedural audio engine. All sounds are synthesized (no assets), routed
 * through a compressor to keep them warm, and accept per-call volume/pan so
 * the scene can play them positionally.
 */
export class AudioDirector {
  private context?: AudioContext;
  private master?: GainNode;
  private noiseBuffer?: AudioBuffer;
  private ambienceTimer?: number;
  private ambienceStep = 0;
  private ambience: AmbienceFlavor = 'city';
  private windGain?: GainNode;
  private windFilter?: BiquadFilterNode;
  private windLevelSent = -1;
  private muted = false;

  start() {
    if (!this.context) {
      this.context = new AudioContext();
      const compressor = this.context.createDynamicsCompressor();
      compressor.threshold.value = -20;
      compressor.knee.value = 24;
      compressor.ratio.value = 5;
      compressor.attack.value = .004;
      compressor.release.value = .18;
      compressor.connect(this.context.destination);
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : .8;
      this.master.connect(compressor);
      this.startWindLoop();
    }
    void this.context.resume();
    if (!this.ambienceTimer) {
      this.ambienceTimer = window.setInterval(() => this.playAmbienceStep(), 880);
      this.playAmbienceStep();
    }
  }

  toggleMuted() {
    this.muted = !this.muted;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : .8, this.context.currentTime, .025);
    }
    return this.muted;
  }

  /** Selects the per-chapter ambient soundscape (safe to call before start()). */
  setAmbience(flavor: AmbienceFlavor) {
    this.ambience = flavor;
  }

  /** 0..1 — raises or lowers the looping wind bed (smoothed internally). */
  wind(level: number) {
    const target = Math.min(1, Math.max(0, level));
    if (Math.abs(target - this.windLevelSent) < .04) return;
    this.windLevelSent = target;
    if (this.windGain && this.context) {
      this.windGain.gain.setTargetAtTime(target * .16, this.context.currentTime, .25);
    }
  }

  play(cue: SoundCue, options: PlayOptions = {}) {
    if (!this.context || !this.master || this.muted) return;
    const volume = Math.min(1.15, Math.max(0, options.volume ?? 1));
    if (volume <= .02) return;
    const pan = Math.min(1, Math.max(-1, options.pan ?? 0));
    switch (cue) {
      case 'jump':
        this.tone(310, .13, 'triangle', .1 * volume, 540, 0, pan);
        this.noise(.05, .028 * volume, 900, pan, 1200);
        break;
      case 'land':
        this.thump(95, .3, .16 * volume, pan);
        break;
      case 'step':
        this.tone(170, .03, 'triangle', .03 * volume, 120, 0, pan);
        break;
      case 'stepheavy':
        this.thump(60, .22, .3 * volume, pan);
        this.noise(.07, .07 * volume, 240, pan);
        break;
      case 'tick':
        this.tone(1650, .025, 'square', .018 * volume, 1400, 0, pan);
        break;
      case 'shard':
        this.tone(780, .16, 'sine', .1 * volume, 820, 0, pan);
        this.tone(1170, .26, 'sine', .06 * volume, 1190, .05, pan);
        this.tone(2340, .3, 'sine', .022 * volume, 2330, .07, pan);
        break;
      case 'stomp':
        this.thump(120, .18, .2 * volume, pan);
        this.noise(.05, .05 * volume, 700, pan);
        break;
      case 'hurt':
        this.noise(.14, .1 * volume, 800, pan);
        this.tone(160, .22, 'sawtooth', .06 * volume, 70, 0, pan, 500);
        break;
      case 'record':
        this.tone(220, .15, 'sine', .08 * volume, 440, 0, pan);
        this.tone(330, .2, 'triangle', .05 * volume, 660, .06, pan);
        this.tone(1318, .2, 'sine', .018 * volume, 1310, .1, pan);
        break;
      case 'echo':
        this.tone(660, .3, 'sine', .07 * volume, 260, 0, pan);
        this.tone(880, .36, 'triangle', .04 * volume, 340, .04, pan);
        this.tone(440, .4, 'sine', .03 * volume, 220, .12, pan);
        break;
      case 'plate':
        this.tone(420, .05, 'triangle', .07 * volume, 300, 0, pan);
        this.noise(.03, .04 * volume, 1600, pan);
        break;
      case 'gate':
        this.noise(.26, .05 * volume, 320, pan);
        this.tone(80, .3, 'sine', .08 * volume, 46, 0, pan);
        break;
      case 'checkpoint':
        [392, 494, 659, 784].forEach((frequency, index) =>
          this.tone(frequency, .34, 'triangle', .055 * volume, frequency, index * .09, pan));
        break;
      case 'win':
        [330, 440, 554, 660, 880].forEach((frequency, index) =>
          this.tone(frequency, .5, 'triangle', .07 * volume, frequency * 1.01, index * .12, pan));
        this.tone(165, .9, 'sine', .05 * volume, 165, .1, pan);
        break;
      case 'bounce':
        this.tone(150, .18, 'triangle', .09 * volume, 640, 0, pan);
        this.tone(300, .14, 'sine', .05 * volume, 960, .04, pan);
        break;
      case 'crumble':
        this.noise(.24, .09 * volume, 420, pan);
        this.tone(95, .26, 'sawtooth', .045 * volume, 50, 0, pan, 320);
        break;
      case 'toggle':
        this.tone(520, .045, 'square', .045 * volume, 500, 0, pan);
        this.tone(390, .06, 'square', .035 * volume, 380, .05, pan);
        break;
      case 'chime':
        this.tone(880, .26, 'sine', .08 * volume, 900, 0, pan);
        this.tone(1320, .34, 'sine', .045 * volume, 1315, .05, pan);
        this.tone(1760, .4, 'sine', .02 * volume, 1765, .1, pan);
        break;
      case 'shoot':
        this.tone(300, .12, 'sine', .08 * volume, 80, 0, pan);
        this.noise(.07, .035 * volume, 620, pan);
        break;
      case 'pop':
        this.tone(260, .07, 'square', .06 * volume, 540, 0, pan);
        this.noise(.05, .05 * volume, 1400, pan);
        break;
      case 'slam':
        // A rounded underground whump: quick low swell, gentle tail, dust.
        this.tone(58, .34, 'sine', .15 * volume, 26, 0, pan);
        this.tone(116, .16, 'sine', .06 * volume, 52, 0, pan);
        this.noise(.11, .03 * volume, 140, pan);
        break;
      case 'good':
        this.tone(523, .11, 'triangle', .07 * volume, 525, 0, pan);
        this.tone(659, .14, 'triangle', .06 * volume, 660, .08, pan);
        break;
      case 'bad':
        this.tone(150, .2, 'sawtooth', .055 * volume, 95, 0, pan, 420);
        this.tone(110, .22, 'triangle', .04 * volume, 80, .05, pan);
        break;
      case 'unlock':
        [392, 523, 659, 784, 1046].forEach((frequency, index) =>
          this.tone(frequency, .32, 'triangle', .055 * volume, frequency, index * .075, pan));
        break;
      case 'throw':
        this.whoosh(.5, 2400, .14, .07 * volume, pan);
        break;
      case 'hit':
        this.tone(900, .05, 'triangle', .06 * volume, 500, 0, pan);
        this.noise(.04, .05 * volume, 2200, pan);
        break;
      case 'clang':
        this.tone(620, .16, 'square', .04 * volume, 600, 0, pan);
        this.tone(932, .2, 'square', .03 * volume, 915, .015, pan);
        this.noise(.05, .05 * volume, 3200, pan);
        break;
      case 'growl':
        this.tone(95, .32, 'sawtooth', .07 * volume, 55, 0, pan, 260);
        this.noise(.2, .03 * volume, 180, pan);
        break;
      case 'swoop':
        this.whoosh(1.1, 500, .26, .055 * volume, pan);
        break;
      case 'reject':
        this.tone(120, .09, 'sine', .06 * volume, 85, 0, pan);
        break;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Synthesis helpers
  //──────────────────────────────────────────────────────────────

  private out(pan: number): AudioNode {
    if (!this.context || !this.master) return this.master!;
    if (!pan || !this.context.createStereoPanner) return this.master;
    const panner = this.context.createStereoPanner();
    panner.pan.value = Math.min(1, Math.max(-1, pan));
    panner.connect(this.master);
    return panner;
  }

  /** Frees the per-sound panner once its source has finished. */
  private releaseWhenEnded(node: AudioScheduledSourceNode, destination: AudioNode) {
    node.onended = () => {
      if (destination !== this.master) destination.disconnect();
    };
  }

  private getNoiseBuffer(): AudioBuffer {
    const context = this.context!;
    if (!this.noiseBuffer) {
      const length = context.sampleRate;
      this.noiseBuffer = context.createBuffer(1, length, context.sampleRate);
      const channel = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) channel[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuffer;
  }

  private tone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    endFrequency = frequency,
    delay = 0,
    pan = 0,
    lowpass?: number,
  ) {
    if (!this.context) return;
    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), now + .014);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    let tail: AudioNode = gain;
    if (lowpass) {
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      gain.connect(filter);
      tail = filter;
    }
    const destination = this.out(pan);
    tail.connect(destination);
    oscillator.connect(gain);
    this.releaseWhenEnded(oscillator, destination);
    oscillator.start(now);
    oscillator.stop(now + duration + .03);
  }

  private noise(duration: number, volume: number, cutoff: number, pan = 0, _unusedHighpass?: number) {
    if (!this.context) return;
    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    source.buffer = this.getNoiseBuffer();
    source.loop = true;
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(Math.max(.0002, volume), now);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    const destination = this.out(pan);
    source.connect(filter).connect(gain).connect(destination);
    this.releaseWhenEnded(source, destination);
    source.start(now, Math.random() * .5);
    source.stop(now + duration + .02);
  }

  /** Filtered noise sweep — whooshes, swoops, throws. */
  private whoosh(startCutoff: number, endCutoff: number, duration: number, volume: number, pan = 0) {
    if (!this.context) return;
    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    source.buffer = this.getNoiseBuffer();
    source.loop = true;
    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.4;
    filter.frequency.setValueAtTime(startCutoff, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, endCutoff), now + duration);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), now + duration * .3);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    const destination = this.out(pan);
    source.connect(filter).connect(gain).connect(destination);
    this.releaseWhenEnded(source, destination);
    source.start(now, Math.random() * .5);
    source.stop(now + duration + .03);
  }

  /** Body impact: sub-bass drop plus a soft noise transient. */
  private thump(frequency: number, duration: number, volume: number, pan = 0) {
    if (!this.context) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(24, frequency * .4), now + duration);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), now + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain).connect(this.out(pan));
    oscillator.start(now);
    oscillator.stop(now + duration + .03);
    this.noise(.05, volume * .5, 320, pan);
  }

  private startWindLoop() {
    if (!this.context || !this.master || this.windGain) return;
    const source = this.context.createBufferSource();
    source.buffer = this.getNoiseBuffer();
    source.loop = true;
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 340;
    filter.Q.value = .6;
    const gain = this.context.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
    this.windGain = gain;
    this.windFilter = filter;
  }

  private playAmbienceStep() {
    if (!this.context || this.muted) return;
    const step = this.ambienceStep;
    const profiles: Record<AmbienceProfile, { notes: number[]; volume: number }> = {
      city: { notes: [55, 65.41, 73.42, 65.41], volume: .018 },
      cave: { notes: [49, 58.27, 65.41, 58.27], volume: .02 },
      highland: { notes: [65.41, 73.42, 82.41, 73.42], volume: .016 },
      dusk: { notes: [43.65, 51.91, 58.27, 51.91], volume: .022 },
    };
    const profile = profiles[this.ambience];
    const note = profile.notes[step % profile.notes.length];
    this.tone(note, .8, 'triangle', profile.volume, profile.notes[(step + 1) % profile.notes.length]);
    this.tone(110, .03, 'square', .014, 95, .42);

    // Sparse per-chapter life. The city keeps only its quiet clockwork tick —
    // no random clanks; anything event-like must come from actual world events.
    const roll = Math.random();
    if (this.ambience === 'cave' && roll < .22) {
      this.tone(1350, .16, 'sine', .03, 420, Math.random() * .3);
      this.tone(1350, .12, 'sine', .012, 420, .34);
    } else if (this.ambience === 'highland' && roll < .2) {
      const base = 1800 + Math.random() * 500;
      this.tone(base, .06, 'sine', .02, base * 1.25);
      this.tone(base * 1.1, .07, 'sine', .018, base * 1.4, .09);
    } else if (this.ambience === 'dusk' && roll < .18) {
      this.tone(1560, .12, 'sine', .012, 2080, Math.random() * .4);
    }
    this.ambienceStep += 1;
  }
}
