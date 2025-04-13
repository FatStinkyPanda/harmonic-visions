// data.js - Stores configuration data and mood settings

// Experience descriptions for different moods
const moodDescriptions = {
    calm: "A serene journey through gentle landscapes bathed in soft blue light. The soundscape features calming water streams and gentle night sounds, perfect for relaxation and meditation.",
    soft: "Warm golden hues blend with peaceful melodies, creating a nurturing atmosphere that soothes the soul. Birdsong and gentle winds provide a comforting sanctuary for reflection.",
    uplifting: "Vibrant emerald landscapes pulse with energy and life. Dynamic rhythms and cheerful melodies inspire creativity and positive emotions, perfect for boosting your mood.",
    warm: "Enveloped in rose and amber tones, this experience recreates the feeling of being wrapped in love. Harmonies flow like a heartbeat, creating a deeply comforting atmosphere.",
    cosmic: "Journey beyond our world into the cosmic unknown. Deep purples and celestial patterns combine with ethereal sounds that expand consciousness and inspire wonder."
  };
  
  // Available mood options
  const moods = [
    { id: 'calm', label: 'Calm' },
    { id: 'soft', label: 'Soft' },
    { id: 'uplifting', label: 'Uplifting' },
    { id: 'warm', label: 'Warm' },
    { id: 'cosmic', label: 'Cosmic' }
  ];
  
  // Export quality options
  const qualityOptions = [
    { id: 'low', label: 'Low' },
    { id: 'medium', label: 'Medium' },
    { id: 'high', label: 'High' },
    { id: 'ultra', label: 'Ultra' }
  ];
  
  // Export format options
  const formatOptions = [
    { id: 'webm', label: 'WebM' },
    { id: 'mp4', label: 'MP4' },
    { id: 'gif', label: 'GIF' }
  ];
  
  // Audio settings for different moods
  const moodAudioSettings = {
    calm: {
      tempo: 60, // BPM
      baseFreq: 220, // A3
      scale: 'pentatonic',
      harmonics: [1, 2, 3, 5, 8],
      attackTime: 1.5,
      releaseTime: 2.0,
      filterFreq: 800,
      filterQ: 2,
      modulationFreq: 0.12,
      modulationAmount: 10,
      reverbTime: 3.0,
      reverbDamping: 0.4,
      ambientSounds: ['water', 'night'],
      panning: true,
      ambientVolume: 0.25,
      melodyVolume: 0.2,
      padVolume: 0.3,
      bassVolume: 0.2,
    },
    soft: {
      tempo: 70, // BPM
      baseFreq: 261.63, // C4
      scale: 'major',
      harmonics: [1, 3, 5, 6, 8],
      attackTime: 1.0,
      releaseTime: 1.5,
      filterFreq: 1200,
      filterQ: 1,
      modulationFreq: 0.15,
      modulationAmount: 15,
      reverbTime: 2.0,
      reverbDamping: 0.3,
      ambientSounds: ['wind', 'birds'],
      panning: true,
      ambientVolume: 0.2,
      melodyVolume: 0.25,
      padVolume: 0.3,
      bassVolume: 0.2,
    },
    uplifting: {
      tempo: 95, // BPM
      baseFreq: 329.63, // E4
      scale: 'lydian',
      harmonics: [1, 2, 4, 5, 7],
      attackTime: 0.5,
      releaseTime: 1.0,
      filterFreq: 2000,
      filterQ: 1.5,
      modulationFreq: 0.2,
      modulationAmount: 20,
      reverbTime: 1.5,
      reverbDamping: 0.2,
      ambientSounds: ['birds', 'water'],
      panning: true,
      ambientVolume: 0.2,
      melodyVolume: 0.3,
      padVolume: 0.25,
      bassVolume: 0.25,
    },
    warm: {
      tempo: 75, // BPM
      baseFreq: 293.66, // D4
      scale: 'mixolydian',
      harmonics: [1, 2, 3, 4, 6],
      attackTime: 0.8,
      releaseTime: 1.2,
      filterFreq: 1500,
      filterQ: 1,
      modulationFreq: 0.12,
      modulationAmount: 12,
      reverbTime: 2.5,
      reverbDamping: 0.3,
      ambientSounds: ['fire', 'birds'],
      panning: true,
      ambientVolume: 0.2,
      melodyVolume: 0.25,
      padVolume: 0.35,
      bassVolume: 0.2,
    },
    cosmic: {
      tempo: 55, // BPM
      baseFreq: 174.61, // F3
      scale: 'phrygian',
      harmonics: [1, 3, 5, 7, 9],
      attackTime: 2.0,
      releaseTime: 3.0,
      filterFreq: 600,
      filterQ: 3,
      modulationFreq: 0.08,
      modulationAmount: 25,
      reverbTime: 4.0,
      reverbDamping: 0.5,
      ambientSounds: ['space', 'wind'],
      panning: true,
      ambientVolume: 0.3,
      melodyVolume: 0.2,
      padVolume: 0.35,
      bassVolume: 0.25,
    }
  };
  
  // Musical scales
  const musicalScales = {
    pentatonic: [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24],
    major: [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24],
    minor: [0, 2, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19, 20, 22, 24],
    lydian: [0, 2, 4, 6, 7, 9, 11, 12, 14, 16, 18, 19, 21, 23, 24],
    mixolydian: [0, 2, 4, 5, 7, 9, 10, 12, 14, 16, 17, 19, 21, 22, 24],
    phrygian: [0, 1, 3, 5, 7, 8, 10, 12, 13, 15, 17, 19, 20, 22, 24]
  };
  
  // Visual settings for different moods
  const moodSettings = {
    calm: {
      colors: ['#1a5276', '#2980b9', '#3498db', '#85c1e9', '#d6eaf8'],
      fogColor: '#1a3c5e',
      fogDensity: 0.015,
      speed: 0.5,
      complexity: 0.4,
      bloom: 0.5,
      particleCount: 1500,
      cameraDistance: 20,
      fluidMotion: 0.6, // Controls fluid-like motion amount
      morphSpeed: 0.3, // Controls organic morphing speed
      colorShift: 0.2, // Controls subtle color shifting
      dreaminess: 0.7 // Controls overall dreamlike quality
    },
    soft: {
      colors: ['#f7dc6f', '#f8c471', '#f39c12', '#e67e22', '#f5b7b1'],
      fogColor: '#59453c',
      fogDensity: 0.01,
      speed: 0.6,
      complexity: 0.6,
      bloom: 0.7,
      particleCount: 2000,
      cameraDistance: 18,
      fluidMotion: 0.7,
      morphSpeed: 0.4,
      colorShift: 0.3,
      dreaminess: 0.8
    },
    uplifting: {
      colors: ['#58d68d', '#2ecc71', '#138d75', '#1abc9c', '#abebc6'],
      fogColor: '#2a6350',
      fogDensity: 0.005,
      speed: 0.8,
      complexity: 0.7,
      bloom: 0.8,
      particleCount: 3000,
      cameraDistance: 16,
      fluidMotion: 0.9,
      morphSpeed: 0.6,
      colorShift: 0.4,
      dreaminess: 0.6
    },
    warm: {
      colors: ['#e74c3c', '#ec7063', '#f1948a', '#f5b7b1', '#fadbd8'],
      fogColor: '#4a2e2c',
      fogDensity: 0.012,
      speed: 0.6,
      complexity: 0.5,
      bloom: 0.6,
      particleCount: 2500,
      cameraDistance: 17,
      fluidMotion: 0.8,
      morphSpeed: 0.5,
      colorShift: 0.5,
      dreaminess: 0.7
    },
    cosmic: {
      colors: ['#6c3483', '#8e44ad', '#9b59b6', '#bb8fce', '#d2b4de'],
      fogColor: '#281435',
      fogDensity: 0.02,
      speed: 0.7,
      complexity: 0.9,
      bloom: 1.0,
      particleCount: 4000,
      cameraDistance: 25,
      fluidMotion: 1.0,
      morphSpeed: 0.8,
      colorShift: 0.7,
      dreaminess: 1.0
    }
  };