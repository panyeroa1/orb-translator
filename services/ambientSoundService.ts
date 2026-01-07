
import { OrbStatus } from '../types';

export class AmbientSoundService {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private currentSource: OscillatorNode | AudioBufferSourceNode | null = null;
  private noiseNode: AudioBufferSourceNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private lfo: OscillatorNode | null = null;

  constructor() {
    // Context is initialized on first user interaction
  }

  private initContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.05; // Extremely subtle by default
      this.masterGain.connect(this.ctx.destination);
      
      this.filterNode = this.ctx.createBiquadFilter();
      this.filterNode.type = 'lowpass';
      this.filterNode.frequency.value = 1000;
      this.filterNode.connect(this.masterGain);
    }
  }

  private createNoiseBuffer() {
    if (!this.ctx) return null;
    const bufferSize = 2 * this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  public async setStatus(status: OrbStatus, isMonitoring: boolean) {
    this.initContext();
    if (!this.ctx || !this.masterGain || !this.filterNode) return;

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    // Stop current sounds gracefully
    this.stopCurrent();

    if (!isMonitoring && status === OrbStatus.IDLE) {
      this.playIdle();
      return;
    }

    switch (status) {
      case OrbStatus.IDLE:
        this.playActiveIdle();
        break;
      case OrbStatus.BUFFERING:
        this.playBuffering();
        break;
      case OrbStatus.SPEAKING:
        this.playSpeaking();
        break;
      case OrbStatus.RECORDING:
        this.playRecording();
        break;
      case OrbStatus.ERROR:
        this.playError();
        break;
      default:
        this.playIdle();
        break;
    }
  }

  private stopCurrent() {
    if (this.currentSource) {
      try { this.currentSource.stop(); } catch(e) {}
      this.currentSource = null;
    }
    if (this.noiseNode) {
      try { this.noiseNode.stop(); } catch(e) {}
      this.noiseNode = null;
    }
    if (this.lfo) {
      try { this.lfo.stop(); } catch(e) {}
      this.lfo = null;
    }
  }

  private playIdle() {
    if (!this.ctx || !this.filterNode) return;
    // Ultra-low steady hum
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 40;
    osc.connect(this.filterNode);
    osc.start();
    this.currentSource = osc;
    
    this.masterGain!.gain.setTargetAtTime(0.02, this.ctx.currentTime, 0.5);
    this.filterNode.frequency.setTargetAtTime(200, this.ctx.currentTime, 0.5);
  }

  private playActiveIdle() {
    if (!this.ctx || !this.filterNode) return;
    // Breathing hum
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 55;
    
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 0.2; // 5 second cycle
    lfoGain.gain.value = 0.01;
    lfo.connect(lfoGain);
    lfoGain.connect(this.masterGain!.gain);
    lfo.start();
    this.lfo = lfo;

    osc.connect(this.filterNode);
    osc.start();
    this.currentSource = osc;

    this.masterGain!.gain.setTargetAtTime(0.04, this.ctx.currentTime, 0.5);
    this.filterNode.frequency.setTargetAtTime(400, this.ctx.currentTime, 0.5);
  }

  private playBuffering() {
    if (!this.ctx || !this.filterNode) return;
    // Fast digital pulse
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 80;
    
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.type = 'square';
    lfo.frequency.value = 8; // Fast 8Hz pulse
    lfoGain.gain.value = 100;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfo.start();
    this.lfo = lfo;

    osc.connect(this.filterNode);
    osc.start();
    this.currentSource = osc;

    this.masterGain!.gain.setTargetAtTime(0.03, this.ctx.currentTime, 0.1);
    this.filterNode.frequency.setTargetAtTime(800, this.ctx.currentTime, 0.1);
  }

  private playSpeaking() {
    if (!this.ctx) return;
    // Duck the ambient almost completely for voice clarity
    this.masterGain!.gain.setTargetAtTime(0.005, this.ctx.currentTime, 0.3);
  }

  private playRecording() {
    if (!this.ctx || !this.filterNode) return;
    // Focused white noise (shhh)
    const buffer = this.createNoiseBuffer();
    if (buffer) {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(this.filterNode);
      source.start();
      this.noiseNode = source;
    }
    
    this.masterGain!.gain.setTargetAtTime(0.03, this.ctx.currentTime, 0.5);
    this.filterNode.frequency.setTargetAtTime(1500, this.ctx.currentTime, 0.5);
  }

  private playError() {
    if (!this.ctx || !this.filterNode) return;
    // Dissonant low buzz
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 60;
    osc.connect(this.filterNode);
    osc.start();
    this.currentSource = osc;

    this.masterGain!.gain.setTargetAtTime(0.06, this.ctx.currentTime, 0.1);
    this.filterNode.frequency.setTargetAtTime(300, this.ctx.currentTime, 0.1);
  }
}
