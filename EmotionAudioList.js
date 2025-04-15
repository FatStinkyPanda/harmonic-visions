// EmotionAudioList.js - Updated Structure
// Defines which audio modules are active and their high-level configuration per mood.
// - volume: Master gain (0-100). 100 = volume defined in module defaults/data.js.
// - occurrence: How often/dense (0-100). 100 = max rate/density defined by module.
// - intensity: Strength of effects (LFO depth, Q, wet mix, etc.) (0-100). 100 = max effect defined by module.
// Copyright (c) 2025 FatStinkyPanda - All rights reserved.

const EmotionAudioModules = {
    calm: [
        // Pads & Drones (Gentle, Sustained)


        // { module: 'ae_pads', volume: 65, occurrence: 60, intensity: 40 },

        // { module: 'ae_padSoftString', volume: 90, occurrence: 60, intensity: 50 },

        // { module: 'ae_padWarmAnalog', volume: 80, occurrence: 40, intensity: 60 },

        // { module: 'ae_bassSubSine', volume: 40, occurrence: 35, intensity: 20 },

        // // Melody (Sparse, Soft)


        { module: 'ae_melodySine', volume: 10, occurrence: 25, intensity: 5 }, // Low occurrence

        { module: 'ae_melodyFluteSynth', volume: 80, occurrence: 35, intensity: 75 },

        // Ambient (Natural, Peaceful)


        { module: 'ae_ambientStreamGentle', volume: 10, occurrence: 100, intensity: 15 },

        { module: 'ae_ambientWavesCalm', volume: 100, occurrence: 100, intensity: 35 },

        { module: 'ae_ambientWindLight', volume: 20, occurrence: 15, intensity: 40 },
        { module: 'ae_ambientInsectsNight', volume: 8, occurrence: 15, intensity: 5 },

        // { module: 'ae_ambientWaterDrips', volume: 4, occurrence: 15, intensity: 80 }, // Low occurrence, high intensity (echo)

        // Percussion (Minimal, Subtle)


        { module: 'ae_percKickSoft', volume: 15, occurrence: 10, intensity: 5 }, // Very sparse

        // Instruments/Effects (Subtle)


        // { module: 'ae_instrumentPianoChord', volume: 1, occurrence: 1, intensity: 1 }, // Very sparse, sustained

        // { module: 'ae_effectHeartbeat', volume: 80, occurrence: 100, intensity: 100 },
    ],

    soft: [
        { module: 'ae_pads', volume: 70, occurrence: 100, intensity: 50 },
        { module: 'ae_padWarmAnalog', volume: 60, occurrence: 100, intensity: 60 },
        { module: 'ae_padSoftString', volume: 50, occurrence: 100, intensity: 55 },
        { module: 'ae_bassWarmTriangle', volume: 65, occurrence: 100, intensity: 40 },
        { module: 'ae_melodyFluteSynth', volume: 55, occurrence: 50, intensity: 50 },
        { module: 'ae_melodyPluck', volume: 50, occurrence: 40, intensity: 60 },
        { module: 'ae_ambientBirdsong', volume: 45, occurrence: 70, intensity: 50 },
        { module: 'ae_ambientWindLight', volume: 40, occurrence: 100, intensity: 45 },
        { module: 'ae_ambientFireCrackle', volume: 30, occurrence: 40, intensity: 60 },
        { module: 'ae_percShaker', volume: 35, occurrence: 50, intensity: 40 },
        { module: 'ae_percSnareBrush', volume: 40, occurrence: 30, intensity: 45 },
        { module: 'ae_percKickSoft', volume: 60, occurrence: 40, intensity: 40 },
        { module: 'ae_instrumentPianoChord', volume: 45, occurrence: 30, intensity: 65 },
        { module: 'ae_instrumentViolinSwell', volume: 35, occurrence: 25, intensity: 70 },
    ],

     uplifting: [
        { module: 'ae_pads', volume: 60, occurrence: 100, intensity: 65 },
        { module: 'ae_padBrightShimmer', volume: 70, occurrence: 100, intensity: 75 },
        { module: 'ae_padGlassyFM', volume: 55, occurrence: 100, intensity: 70 },
        { module: 'ae_melodyArp', volume: 65, occurrence: 85, intensity: 70 },
        { module: 'ae_melodyCrystal', volume: 60, occurrence: 60, intensity: 80 },
        { module: 'ae_melodyBell', volume: 50, occurrence: 50, intensity: 65 },
        { module: 'ae_bassResonantFilter', volume: 70, occurrence: 75, intensity: 70 },
        { module: 'ae_ambientBirdsong', volume: 50, occurrence: 80, intensity: 60 },
        { module: 'ae_ambientStreamGentle', volume: 40, occurrence: 100, intensity: 70 },
        { module: 'ae_percKickDeep', volume: 75, occurrence: 80, intensity: 60 },
        { module: 'ae_percHiHatClosed', volume: 55, occurrence: 90, intensity: 50 },
        { module: 'ae_percSnareBrush', volume: 50, occurrence: 65, intensity: 55 },
        { module: 'ae_percRimshot', volume: 45, occurrence: 40, intensity: 65 },
        { module: 'ae_percShaker', volume: 40, occurrence: 70, intensity: 50 },
        { module: 'ae_percCymbalSwell', volume: 40, occurrence: 15, intensity: 75 },
        { module: 'ae_cosmicStarlight', volume: 45, occurrence: 60, intensity: 80 },
    ],

    warm: [
        { module: 'ae_pads', volume: 75, occurrence: 100, intensity: 55 },
        { module: 'ae_padWarmAnalog', volume: 70, occurrence: 100, intensity: 65 },
        { module: 'ae_padFilteredNoise', volume: 40, occurrence: 100, intensity: 40 }, // Subtle texture
        { module: 'ae_melodyPluck', volume: 55, occurrence: 45, intensity: 55 },
        { module: 'ae_melodySine', volume: 40, occurrence: 30, intensity: 35 }, // Lower register
        { module: 'ae_bassWarmTriangle', volume: 70, occurrence: 100, intensity: 45 },
        { module: 'ae_bassSubSine', volume: 60, occurrence: 100, intensity: 30 },
        { module: 'ae_ambientFireplace', volume: 50, occurrence: 100, intensity: 60 },
        { module: 'ae_ambientFireCrackle', volume: 35, occurrence: 50, intensity: 65 },
        { module: 'ae_ambientWindLight', volume: 30, occurrence: 100, intensity: 35 },
        { module: 'ae_percKickSoft', volume: 65, occurrence: 50, intensity: 40 },
        { module: 'ae_percTomLow', volume: 45, occurrence: 20, intensity: 70 },
        { module: 'ae_percShaker', volume: 30, occurrence: 40, intensity: 45 },
        { module: 'ae_effectHeartbeat', volume: 40, occurrence: 80, intensity: 50 },
        { module: 'ae_instrumentPianoChord', volume: 50, occurrence: 35, intensity: 70 },
        { module: 'ae_instrumentViolinSwell', volume: 40, occurrence: 30, intensity: 60 },
    ],

    cosmic: [
        { module: 'ae_pads', volume: 70, occurrence: 100, intensity: 70 },
        { module: 'ae_padCosmicDeep', volume: 80, occurrence: 100, intensity: 80 },
        { module: 'ae_padResonant', volume: 65, occurrence: 100, intensity: 75 },
        { module: 'ae_droneMystical', volume: 60, occurrence: 100, intensity: 60 },
        { module: 'ae_cosmicSpaceDrone', volume: 75, occurrence: 100, intensity: 85 },
        { module: 'ae_melodyBell', volume: 45, occurrence: 20, intensity: 85 }, // Sparse, echoing
        { module: 'ae_melodySine', volume: 50, occurrence: 15, intensity: 50 }, // Pure tones
        { module: 'ae_bassDroneDeep', volume: 85, occurrence: 100, intensity: 75 },
        { module: 'ae_bassSubSine', volume: 80, occurrence: 100, intensity: 40 },
        { module: 'ae_cosmicPulsar', volume: 55, occurrence: 60, intensity: 70 },
        { module: 'ae_cosmicStarlight', volume: 60, occurrence: 75, intensity: 80 },
        { module: 'ae_ambientWindHeavy', volume: 40, occurrence: 100, intensity: 60 }, // Solar wind
        { module: 'ae_percTomLow', volume: 40, occurrence: 10, intensity: 80 }, // Very sparse deep hits
        { module: 'ae_percCymbalSwell', volume: 50, occurrence: 10, intensity: 85 }, // Long swells
    ],

    // --- Additional Example Moods ---
     bright: [
        { module: 'ae_pads', volume: 65, occurrence: 100, intensity: 70 },
        { module: 'ae_padBrightShimmer', volume: 75, occurrence: 100, intensity: 80 },
        { module: 'ae_padGlassyFM', volume: 60, occurrence: 100, intensity: 75 },
        { module: 'ae_melodyArp', volume: 70, occurrence: 90, intensity: 75 },
        { module: 'ae_melodyCrystal', volume: 65, occurrence: 70, intensity: 85 },
        { module: 'ae_melodySawFiltered', volume: 55, occurrence: 50, intensity: 70 },
        { module: 'ae_melodyBell', volume: 50, occurrence: 60, intensity: 65 },
        { module: 'ae_bassResonantFilter', volume: 75, occurrence: 80, intensity: 75 },
        { module: 'ae_cosmicStarlight', volume: 50, occurrence: 70, intensity: 80 },
        { module: 'ae_percKickDeep', volume: 80, occurrence: 85, intensity: 65 },
        { module: 'ae_percSnareBrush', volume: 55, occurrence: 70, intensity: 60 },
        { module: 'ae_percHiHatClosed', volume: 60, occurrence: 95, intensity: 55 },
        { module: 'ae_percHiHatOpen', volume: 45, occurrence: 25, intensity: 70 },
        { module: 'ae_percRimshot', volume: 50, occurrence: 45, intensity: 70 },
        { module: 'ae_percCymbalSwell', volume: 40, occurrence: 15, intensity: 70 },
    ],

    mystical: [
        { module: 'ae_pads', volume: 60, occurrence: 100, intensity: 60 },
        { module: 'ae_padResonant', volume: 70, occurrence: 100, intensity: 80 },
        { module: 'ae_padFilteredNoise', volume: 45, occurrence: 100, intensity: 50 },
        { module: 'ae_droneMystical', volume: 75, occurrence: 100, intensity: 70 },
        { module: 'ae_padCosmicDeep', volume: 65, occurrence: 100, intensity: 65 },
        { module: 'ae_melodyBell', volume: 50, occurrence: 25, intensity: 75 },
        { module: 'ae_melodyPluck', volume: 45, occurrence: 35, intensity: 65 },
        { module: 'ae_melodyFluteSynth', volume: 40, occurrence: 30, intensity: 55 },
        { module: 'ae_bassDroneDeep', volume: 80, occurrence: 100, intensity: 70 },
        { module: 'ae_bassSubSine', volume: 70, occurrence: 100, intensity: 35 },
        { module: 'ae_ambientWaterDrips', volume: 55, occurrence: 25, intensity: 80 },
        { module: 'ae_ambientWindHeavy', volume: 45, occurrence: 100, intensity: 55 },
        { module: 'ae_ambientThunderDistant', volume: 30, occurrence: 5, intensity: 70 },
        { module: 'ae_cosmicStarlight', volume: 40, occurrence: 40, intensity: 70 },
        { module: 'ae_percTomLow', volume: 50, occurrence: 15, intensity: 75 },
        { module: 'ae_percTomMid', volume: 45, occurrence: 10, intensity: 70 },
        { module: 'ae_percShaker', volume: 35, occurrence: 30, intensity: 55 },
        { module: 'ae_percCymbalSwell', volume: 45, occurrence: 10, intensity: 80 },
        { module: 'ae_instrumentViolinSwell', volume: 30, occurrence: 15, intensity: 75 },
    ],

    // --- Default Fallback ---
    default: [
        { module: 'ae_pads', volume: 60, occurrence: 100, intensity: 50 },
        { module: 'ae_padWarmAnalog', volume: 50, occurrence: 100, intensity: 60 },
        { module: 'ae_melodySine', volume: 40, occurrence: 40, intensity: 40 },
        { module: 'ae_bassSubSine', volume: 70, occurrence: 100, intensity: 30 },
        { module: 'ae_ambientStreamGentle', volume: 50, occurrence: 100, intensity: 60 },
    ]
};

window.EmotionAudioModules = EmotionAudioModules;
console.log("EmotionAudioList.js loaded and defined EmotionAudioModules (Updated Structure).");