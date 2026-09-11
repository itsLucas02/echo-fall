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
  | 'unlock';

export class AudioDirector {
  private context?: AudioContext;
  private master?: GainNode;
  private ambienceTimer?: number;
  private ambienceStep = 0;
  private muted = false;

  start() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.7;
      this.master.connect(this.context.destination);
    }
    void this.context.resume();
    if (!this.ambienceTimer) {
      this.ambienceTimer = window.setInterval(() => this.playAmbienceStep(), 920);
      this.playAmbienceStep();
    }
  }

  toggleMuted() {
    this.muted = !this.muted;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.7, this.context.currentTime, .025);
    }
    return this.muted;
  }

  play(cue: SoundCue) {
    if (!this.context || !this.master || this.muted) return;
    switch (cue) {
      case 'jump': this.tone(280, .12, 'triangle', .12, 460); break;
      case 'land': this.noise(.07, .08, 460); break;
      case 'step': this.tone(125, .035, 'square', .026, 100); break;
      case 'shard':
        this.tone(740, .11, 'sine', .11, 980);
        this.tone(1110, .16, 'sine', .07, 1380, .07);
        break;
      case 'stomp': this.tone(150, .1, 'square', .08, 75); break;
      case 'hurt':
        this.noise(.16, .13, 900);
        this.tone(170, .2, 'sawtooth', .07, 70);
        break;
      case 'record':
        this.tone(220, .16, 'sine', .08, 440);
        this.tone(330, .2, 'triangle', .05, 660, .06);
        break;
      case 'echo':
        this.tone(660, .28, 'sine', .07, 250);
        this.tone(880, .35, 'triangle', .04, 330, .04);
        break;
      case 'plate': this.tone(190, .08, 'square', .06, 150); break;
      case 'gate':
        this.noise(.2, .035, 380);
        this.tone(92, .28, 'sawtooth', .045, 58);
        break;
      case 'checkpoint':
        [392, 494, 659].forEach((frequency, index) => this.tone(frequency, .32, 'sine', .07, frequency, index * .1));
        break;
      case 'win':
        [330, 440, 554, 660].forEach((frequency, index) => this.tone(frequency, .45, 'triangle', .08, frequency * 1.02, index * .13));
        break;
      case 'bounce':
        this.tone(180, .14, 'square', .08, 560);
        this.tone(360, .1, 'triangle', .05, 720, .03);
        break;
      case 'crumble':
        this.noise(.22, .09, 320);
        this.tone(110, .24, 'sawtooth', .04, 55);
        break;
      case 'toggle':
        this.tone(520, .05, 'square', .06, 520);
        this.tone(390, .07, 'square', .05, 390, .05);
        break;
      case 'chime':
        this.tone(880, .22, 'sine', .08, 1320);
        this.tone(1320, .3, 'sine', .04, 1760, .06);
        break;
      case 'shoot': this.tone(620, .09, 'sawtooth', .05, 180); break;
      case 'pop':
        this.tone(300, .08, 'square', .06, 620);
        this.noise(.05, .04, 1400);
        break;
      case 'slam':
        this.noise(.12, .11, 240);
        this.tone(70, .2, 'sawtooth', .07, 45);
        break;
      case 'good':
        this.tone(523, .1, 'triangle', .07, 523);
        this.tone(659, .12, 'triangle', .06, 659, .07);
        break;
      case 'bad':
        this.tone(220, .16, 'sawtooth', .06, 130);
        this.tone(160, .2, 'square', .04, 100, .05);
        break;
      case 'unlock':
        [392, 523, 659, 784].forEach((frequency, index) => this.tone(frequency, .3, 'triangle', .06, frequency, index * .08));
        break;
    }
  }

  private playAmbienceStep() {
    if (!this.context || this.muted) return;
    const notes = [55, 65.41, 73.42, 65.41];
    this.tone(notes[this.ambienceStep % notes.length], .75, 'triangle', .018, notes[(this.ambienceStep + 1) % notes.length]);
    this.tone(110, .025, 'square', .018, 95, .42);
    this.ambienceStep += 1;
  }

  private tone(frequency: number, duration: number, type: OscillatorType, volume: number, endFrequency = frequency, delay = 0) {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + .02);
  }

  private noise(duration: number, volume: number, cutoff: number) {
    if (!this.context || !this.master) return;
    const length = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) channel[i] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(volume, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.0001, this.context.currentTime + duration);
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
  }
}
