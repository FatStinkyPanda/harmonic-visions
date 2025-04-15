// EmotionVisualList.js - Updated Structure
// Defines which visual modules are active and their high-level configuration per mood.
// - occurrence: Controls density/count of elements (0-100). 100 = max count defined by module.
// - intensity: Controls strength/prominence of visual effects (0-100). 100 = max effect defined by module.
// Copyright (c) 2025 FatStinkyPanda - All rights reserved.

const EmotionVisualModules = {
    calm: [
        { module: 'lighting', occurrence: 100, intensity: 60 },
        { module: 'stars', occurrence: 80, intensity: 65 },
        { module: 'landscape', occurrence: 100, intensity: 40 }, // Less dramatic landscape
        { module: 'water', occurrence: 100, intensity: 50 },
        { module: 'particles', occurrence: 40, intensity: 30 }, // Subtle dust/mist
        { module: 'dreamEffects', occurrence: 20, intensity: 40 }, // Few gentle orbs
        // { module: 'celestial', occurrence: 0, intensity: 0 }, // No sun/moon
        // { module: 'plants', occurrence: 30, intensity: 40 }, // Sparse gentle plants
        // { module: 'clouds', occurrence: 20, intensity: 30 }, // Light, high clouds
    ],
    soft: [
        { module: 'lighting', occurrence: 100, intensity: 70 }, // Warmer light intensity
        { module: 'stars', occurrence: 60, intensity: 50 }, // Softer stars
        { module: 'landscape', occurrence: 100, intensity: 50 }, // Smoother
        { module: 'water', occurrence: 80, intensity: 40 }, // Calmer water
        { module: 'particles', occurrence: 60, intensity: 55 }, // Firefly-like
        { module: 'plants', occurrence: 70, intensity: 60 }, // Gentle swaying plants
        { module: 'celestial', occurrence: 100, intensity: 60 }, // Soft moon or warm sun
        // { module: 'clouds', occurrence: 40, intensity: 40 },
        // { module: 'dreamEffects', occurrence: 0, intensity: 0 },
    ],
    uplifting: [
        { module: 'lighting', occurrence: 100, intensity: 85 }, // Brighter
        { module: 'stars', occurrence: 90, intensity: 80 }, // Sparkling
        { module: 'landscape', occurrence: 100, intensity: 70 }, // More dynamic
        // { module: 'water', occurrence: 50, intensity: 60 }, // Less water focus
        { module: 'particles', occurrence: 85, intensity: 75 }, // Energetic
        { module: 'celestial', occurrence: 100, intensity: 80 }, // Bright sun
        { module: 'clouds', occurrence: 70, intensity: 65 }, // Dynamic clouds
        // { module: 'plants', occurrence: 0, intensity: 0 },
        { module: 'dreamEffects', occurrence: 50, intensity: 60 }, // Faster effects
    ],
    warm: [
        { module: 'lighting', occurrence: 100, intensity: 75 }, // Warm tones emphasized
        { module: 'landscape', occurrence: 100, intensity: 60 }, // Rolling hills
        { module: 'water', occurrence: 60, intensity: 30 }, // Calm, reflective water
        { module: 'particles', occurrence: 70, intensity: 65 }, // Ember-like
        { module: 'plants', occurrence: 80, intensity: 70 }, // Lush plants
        { module: 'celestial', occurrence: 100, intensity: 70 }, // Warm, setting sun
        { module: 'clouds', occurrence: 50, intensity: 50 }, // Soft clouds
        // { module: 'stars', occurrence: 30, intensity: 40 }, // Less stars
        // { module: 'dreamEffects', occurrence: 10, intensity: 30 },
    ],
    cosmic: [
        { module: 'lighting', occurrence: 100, intensity: 90 }, // Deep space, high contrast
        { module: 'stars', occurrence: 100, intensity: 95 }, // Dense starfield & nebulae
        { module: 'celestial', occurrence: 80, intensity: 85 }, // Planets, strange suns
        { module: 'particles', occurrence: 90, intensity: 80 }, // Cosmic dust/energy
        { module: 'dreamEffects', occurrence: 70, intensity: 75 }, // Abstract floaters, portals
        // { module: 'landscape', occurrence: 20, intensity: 50 }, // Abstract/minimal landscape
        // { module: 'water', occurrence: 0, intensity: 0 },
        // { module: 'plants', occurrence: 0, intensity: 0 },
        { module: 'clouds', occurrence: 60, intensity: 70 }, // Nebula clouds
    ],
    // --- Additional Example Moods ---
    bright: [
        { module: 'lighting', occurrence: 100, intensity: 90 },
        { module: 'stars', occurrence: 70, intensity: 85 },
        { module: 'landscape', occurrence: 100, intensity: 65 },
        { module: 'particles', occurrence: 90, intensity: 80 },
        { module: 'celestial', occurrence: 100, intensity: 75 },
        { module: 'clouds', occurrence: 60, intensity: 60 },
        { module: 'dreamEffects', occurrence: 60, intensity: 70 },
    ],
    mystical: [
        { module: 'lighting', occurrence: 100, intensity: 65 },
        { module: 'stars', occurrence: 85, intensity: 70 },
        { module: 'landscape', occurrence: 100, intensity: 55 }, // Slightly distorted
        { module: 'water', occurrence: 70, intensity: 25 }, // Still water
        { module: 'particles', occurrence: 55, intensity: 60 }, // Wispy
        { module: 'celestial', occurrence: 60, intensity: 70 }, // Strange moon/planets
        { module: 'dreamEffects', occurrence: 80, intensity: 70 }, // Orbs and floaters
        { module: 'plants', occurrence: 40, intensity: 50 }, // Unusual plants
        { module: 'clouds', occurrence: 30, intensity: 45 }, // Low mist/fog like
    ],
    // --- Default Fallback ---
    default: [
        { module: 'lighting', occurrence: 100, intensity: 70 },
        { module: 'stars', occurrence: 70, intensity: 60 },
        { module: 'landscape', occurrence: 100, intensity: 50 },
        { module: 'particles', occurrence: 50, intensity: 50 },
    ]
};

// Make globally accessible
window.EmotionVisualModules = EmotionVisualModules;

console.log("EmotionVisualList.js loaded and defined EmotionVisualModules (Updated Structure).");