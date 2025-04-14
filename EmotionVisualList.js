// EmotionVisualList.js
// Defines which visual modules (vc_*.js) are active for each mood.
// Keys should match the keys used in VisualCanvas's moduleConfig.

const EmotionVisualModules = {
    calm: [
        'lighting',
        'stars',
        'landscape',
        'water',
        'particles', // Subtle dust/mist particles
        'dreamEffects', // Gentle orbs
        // 'celestial', // Maybe no prominent sun/moon
        // 'plants', // Maybe sparse or no plants
        // 'clouds', // Maybe only very light, high clouds
    ],
    soft: [
        'lighting',
        'stars', // Softer stars
        'landscape', // Smoother landscape
        'water', // Calmer water
        'particles', // Firefly-like particles
        'plants', // Gentle, swaying plants
        'celestial', // Soft moon or warm sun
        // 'clouds',
        // 'dreamEffects',
    ],
    uplifting: [
        'lighting', // Brighter lighting
        'stars', // Sparkling stars
        'landscape', // More dynamic landscape
        // 'water', // Maybe less prominent water
        'particles', // Energetic particles
        'celestial', // Bright sun
        'clouds', // Dynamic clouds
        // 'plants',
        // 'dreamEffects', // Maybe faster moving effects
    ],
    warm: [
        'lighting', // Warm tones
        'landscape', // Rolling hills
        'water', // Reflective water
        'particles', // Ember-like particles
        'plants', // Lush plants
        'celestial', // Warm, setting sun
        'clouds', // Soft clouds
        // 'stars', // Less prominent stars
        // 'dreamEffects',
    ],
    cosmic: [
        'lighting', // Deep space lighting
        'stars', // Dense starfield
        'nebulae', // Activate nebulae (assuming vc_stars handles this or separate module)
        'celestial', // Planets, strange suns/moons
        'particles', // Cosmic dust/energy
        'dreamEffects', // Abstract floaters, portals
        // 'landscape', // Maybe abstract or no landscape
        // 'water', // Maybe no water
        // 'plants',
        // 'clouds', // Maybe nebula clouds instead of atmospheric
    ],
    // Define lists for other moods ('bright', 'mystical')
    bright: [ // Example
        'lighting',
        'stars',
        'landscape',
        'particles',
        'celestial',
        'clouds',
        'dreamEffects',
    ],
    mystical: [ // Example
        'lighting',
        'stars',
        'landscape', // Maybe slightly distorted
        'water', // Still water
        'particles', // Wispy particles
        'celestial', // Strange moon/planets
        'dreamEffects', // Orbs and floaters
        'plants', // Unusual plants
    ],
    // Default set
    default: [
        'lighting',
        'stars',
        'landscape',
        'particles',
    ]
};

// Make globally accessible (if not using modules/bundler)
window.EmotionVisualModules = EmotionVisualModules;

console.log("EmotionVisualList.js loaded.");