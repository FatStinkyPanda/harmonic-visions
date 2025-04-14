// EmotionAudioList.js
// Defines which audio modules (ae_*.js files) are active for each mood.
// Used by AudioEngine to configure the soundscape.
// Part of the Harmonic Visions project by FatStinkyPanda
// Copyright (c) 2025 FatStinkyPanda - All rights reserved.

/**
 * @description Maps mood keys to arrays of audio module identifiers.
 * The identifiers should correspond to the base filenames (without .js)
 * of the audio module scripts (e.g., 'ae_padWarmAnalog').
 * The AudioEngine uses this configuration to load and manage active sounds.
 */
const EmotionAudioModules = {

    // --- Core Moods ---

    calm: [
        // Pads & Drones (Gentle, Sustained)
        'ae_pads', // Core pad generator
        'ae_padSoftString',
        'ae_padWarmAnalog',
        'ae_bassSubSine', // Deep, simple foundation

        // Melody (Sparse, Soft)
        'ae_melodySine', // Pure tone, sparse notes
        'ae_melodyFluteSynth', // Gentle, breathy

        // Ambient (Natural, Peaceful)
        'ae_ambientStreamGentle',
        'ae_ambientWavesCalm', // Rhythmic lapping
        'ae_ambientWindLight',
        'ae_ambientInsectsNight', // If appropriate for visuals
        'ae_ambientWaterDrips', // Occasional, echoing

        // Percussion (Minimal, Subtle)
        'ae_percKickSoft', // Barely audible pulse
        // 'ae_percShaker', // Maybe too active?

        // Instruments/Effects (Subtle)
        'ae_instrumentPianoChord', // Very soft, sustained chords
        'ae_effectHeartbeat', // Slow, rhythmic pulse
    ],

    soft: [
        // Pads & Drones (Warm, Smooth)
        'ae_pads',
        'ae_padWarmAnalog',
        'ae_padSoftString',
        'ae_bassWarmTriangle', // Rounded bass

        // Melody (Gentle, Flowing)
        'ae_melodyFluteSynth',
        'ae_melodyPluck', // Kalimba/Harp-like
        'ae_melodySine',

        // Ambient (Comforting, Natural)
        'ae_ambientBirdsong', // Gentle chorus
        'ae_ambientWindLight',
        'ae_ambientFireCrackle', // Soft, intermittent
        'ae_ambientStreamGentle',

        // Percussion (Soft, Rhythmic)
        'ae_percShaker', // Gentle rhythm
        'ae_percSnareBrush', // Soft hits
        'ae_percKickSoft',
        'ae_percTomLow', // Very occasional deep tone

        // Instruments/Effects (Warm)
        'ae_instrumentPianoChord', // Slightly richer chords
        'ae_instrumentViolinSwell', // Gentle swells
    ],

    uplifting: [
        // Pads & Drones (Bright, Shimmering)
        'ae_pads',
        'ae_padBrightShimmer',
        'ae_padGlassyFM', // Clear, bell-like

        // Melody (Active, Bright, Rhythmic)
        'ae_melodyArp', // Arpeggiated patterns
        'ae_melodyCrystal', // Bright lead
        'ae_melodyBell', // Clear tones

        // Bass (Moving, Defined)
        'ae_bassResonantFilter', // Filter sweeps add energy
        'ae_bassWarmTriangle', // Solid foundation

        // Ambient (Energetic, Positive)
        'ae_ambientBirdsong', // More active birds
        'ae_ambientStreamGentle', // Flowing water adds energy

        // Percussion (Clear, Driving - but not overwhelming)
        'ae_percKickDeep', // Defined kick
        'ae_percHiHatClosed', // Rhythmic ticks
        'ae_percSnareBrush', // Adds texture
        'ae_percRimshot', // Sharp accents
        'ae_percShaker',

        // Instruments/Effects (Accents)
        'ae_percCymbalSwell', // For transitions/emphasis
        'ae_cosmicStarlight', // Add sparkle
    ],

    warm: [
        // Pads & Drones (Rich, Analog, Cozy)
        'ae_pads',
        'ae_padWarmAnalog',
        'ae_padFilteredNoise', // Subtle texture layer

        // Melody (Comforting, Plucked)
        'ae_melodyPluck',
        'ae_melodySine', // Lower register, warm tone

        // Bass (Grounded, Smooth)
        'ae_bassWarmTriangle',
        'ae_bassSubSine',

        // Ambient (Cozy, Enveloping)
        'ae_ambientFireplace', // Steady warmth
        'ae_ambientFireCrackle',
        'ae_ambientWindLight', // Gentle breeze outside
        'ae_ambientRainLight', // Optional: Cozy rain

        // Percussion (Deep, Grounded)
        'ae_percKickSoft',
        'ae_percTomLow', // Deep resonance
        'ae_percShaker', // Gentle texture

        // Instruments/Effects (Intimate)
        'ae_effectHeartbeat', // Comforting rhythm
        'ae_instrumentPianoChord', // Rich, warm chords
        'ae_instrumentViolinSwell',
    ],

    cosmic: [
        // Pads & Drones (Deep, Evolving, Ethereal)
        'ae_pads',
        'ae_padCosmicDeep',
        'ae_padResonant', // Shifting resonant frequencies
        'ae_droneMystical', // Inharmonic overtones
        'ae_cosmicSpaceDrone', // Very low frequency vastness

        // Melody (Sparse, High, Pure/Strange)
        'ae_melodyBell', // High, echoing tones
        'ae_melodySine', // Pure, sustained notes
        // 'ae_melodyCrystal', // Maybe too sharp? Use sparingly if at all.

        // Bass (Very Deep, Sustained)
        'ae_bassDroneDeep',
        'ae_bassSubSine', // Foundational low end

        // Ambient (Space, Ethereal)
        'ae_cosmicPulsar', // Rhythmic pulsing synth
        'ae_cosmicStarlight', // High-frequency twinkles
        'ae_ambientWindHeavy', // Distant solar wind?

        // Percussion (Minimal, Deep, Ambient)
        'ae_percTomLow', // Very sparse, deep hits
        'ae_percCymbalSwell', // Reversed or long swells
        // Avoid standard rhythmic percussion

        // Instruments/Effects
        // None typically needed, focus on pads/drones/ambient
    ],

    // --- Additional Example Moods ---

    bright: [ // Similar to uplifting, maybe more synthetic/sharp
        // Pads & Drones
        'ae_pads',
        'ae_padBrightShimmer',
        'ae_padGlassyFM',

        // Melody
        'ae_melodyArp',
        'ae_melodyCrystal',
        'ae_melodySawFiltered', // Classic synth lead
        'ae_melodyBell',

        // Bass
        'ae_bassResonantFilter',

        // Ambient
        'ae_cosmicStarlight', // Active sparkle
        // Less nature sounds

        // Percussion
        'ae_percKickDeep',
        'ae_percSnareBrush',
        'ae_percHiHatClosed',
        'ae_percHiHatOpen', // More sizzle
        'ae_percRimshot',

        // Instruments/Effects
        'ae_percCymbalSwell',
    ],

    mystical: [ // Ethereal, ancient, slightly strange
        // Pads & Drones
        'ae_pads',
        'ae_padResonant',
        'ae_padFilteredNoise',
        'ae_droneMystical',
        'ae_padCosmicDeep', // Less intense than 'cosmic'

        // Melody
        'ae_melodyBell', // Echoing, sparse
        'ae_melodyPluck', // Kalimba/ancient harp feel
        'ae_melodyFluteSynth', // Breathy, ethereal

        // Bass
        'ae_bassDroneDeep', // Low, sustained foundation
        'ae_bassSubSine',

        // Ambient
        'ae_ambientWaterDrips', // Cave/spring feel
        'ae_ambientWindHeavy', // Distant, moaning wind
        'ae_ambientThunderDistant', // Rare, ominous rumble
        'ae_cosmicStarlight', // Sparse, magical twinkles

        // Percussion (Sparse, Ritualistic)
        'ae_percTomLow',
        'ae_percTomMid', // Resonant hits
        'ae_percShaker', // Rattles, textures
        'ae_percCymbalSwell', // Long swells

        // Instruments/Effects
        'ae_instrumentViolinSwell', // Slow, eerie swells
    ],

    // --- Default Fallback ---
    // A minimal, safe set if the requested mood doesn't exist
    default: [
        'ae_pads',
        'ae_padWarmAnalog',
        'ae_melodySine',
        'ae_bassSubSine',
        'ae_ambientStreamGentle',
    ]
};

// Make globally accessible (if not using modules/bundler)
// This allows AudioEngine.js to access this configuration directly.
window.EmotionAudioModules = EmotionAudioModules;

console.log("EmotionAudioList.js loaded and defined EmotionAudioModules.");