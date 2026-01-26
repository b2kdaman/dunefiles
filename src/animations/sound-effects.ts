import * as Tone from "tone";

// Sound system - Cyberpunk/Tron style
let reverb: Tone.Reverb;
let filter: Tone.Filter;
let bassSynth: Tone.MonoSynth;
let subBass: Tone.MonoSynth;
let glitchSynth: Tone.MonoSynth;
let fmSynth: Tone.FMSynth;
let audioStarted = false;
let initialized = false;

export function initSoundSystem() {
  if (initialized) return;

  reverb = new Tone.Reverb({ decay: 1.5, wet: 0.3 }).toDestination();
  filter = new Tone.Filter(800, "lowpass").connect(reverb);

  // Deep bass synth for main sounds
  bassSynth = new Tone.MonoSynth({
    oscillator: { type: "sawtooth" },
    envelope: { attack: 0.02, decay: 0.3, sustain: 0.2, release: 0.4 },
    filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.3, baseFrequency: 200, octaves: 2 },
    volume: -8,
  }).connect(filter);

  // Sub bass for impacts
  subBass = new Tone.MonoSynth({
    oscillator: { type: "sine" },
    envelope: { attack: 0.01, decay: 0.4, sustain: 0, release: 0.3 },
    volume: -6,
  }).connect(reverb);

  // Glitchy high synth for accents
  glitchSynth = new Tone.MonoSynth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.005, decay: 0.1, sustain: 0, release: 0.1 },
    filterEnvelope: { attack: 0.005, decay: 0.1, sustain: 0, release: 0.1, baseFrequency: 2000, octaves: -2 },
    volume: -18,
  }).connect(reverb);

  // FM synth for digital sounds
  fmSynth = new Tone.FMSynth({
    harmonicity: 3,
    modulationIndex: 10,
    oscillator: { type: "triangle" },
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.3 },
    modulation: { type: "square" },
    modulationEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.2 },
    volume: -22,
  }).connect(filter);

  initialized = true;
}

export async function ensureAudio() {
  if (!audioStarted) {
    await Tone.start();
    audioStarted = true;
  }
}

export function playPickup() {
  ensureAudio();
  bassSynth.triggerAttackRelease("C2", 0.15);
  glitchSynth.triggerAttackRelease("G4", 0.08, Tone.now() + 0.02);
}

export function playDrop() {
  ensureAudio();
  subBass.triggerAttackRelease("E1", 0.25);
  glitchSynth.triggerAttackRelease("C3", 0.1);
}

export function playNavigateIn() {
  ensureAudio();
  fmSynth.triggerAttackRelease("C2", 0.2, Tone.now());
  fmSynth.triggerAttackRelease("G2", 0.15, Tone.now() + 0.1);
  glitchSynth.triggerAttackRelease("C4", 0.1, Tone.now() + 0.15);
}

export function playNavigateBack() {
  ensureAudio();
  fmSynth.triggerAttackRelease("G2", 0.15, Tone.now());
  fmSynth.triggerAttackRelease("C2", 0.2, Tone.now() + 0.1);
  subBass.triggerAttackRelease("C1", 0.3, Tone.now() + 0.05);
}

export function playSpawn() {
  ensureAudio();
  bassSynth.triggerAttackRelease("G1", 0.1);
  glitchSynth.triggerAttackRelease("E5", 0.05, Tone.now() + 0.02);
}

export function playLand() {
  ensureAudio();
  subBass.triggerAttackRelease("C1", 0.15);
}

export function playShoot() {
  ensureAudio();
  glitchSynth.triggerAttackRelease("C5", 0.05);
  bassSynth.triggerAttackRelease("C2", 0.1);
}

export function playMechaAppear() {
  ensureAudio();
  const now = Tone.now();
  bassSynth.triggerAttackRelease("C2", 0.25, now);
  bassSynth.triggerAttackRelease("G1", 0.25, now + 0.25);
  fmSynth.triggerAttackRelease("C4", 0.12, now + 0.05);
  fmSynth.triggerAttackRelease("E4", 0.12, now + 0.18);
  fmSynth.triggerAttackRelease("G4", 0.12, now + 0.31);
  glitchSynth.triggerAttackRelease("C5", 0.05, now + 0.36);
  subBass.triggerAttackRelease("C1", 0.4, now + 0.4);
}

// Export synths for direct access if needed
export function getSynths() {
  return { bassSynth, subBass, glitchSynth, fmSynth };
}
