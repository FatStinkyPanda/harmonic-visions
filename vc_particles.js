// vc_particles.js - Visual Canvas Module for Dynamic Particle Systems
// Part of the Harmonic Visions project by FatStinkyPanda
// Copyright (c) 2025 FatStinkyPanda - All rights reserved.

/**
 * @class VCParticles
 * @description Manages dynamic, audio-reactive particle systems (e.g., fireflies, dust, energy)
 *              using THREE.Points and custom shaders. Adapts appearance and behavior based on mood.
 */
class VCParticles {
    constructor() {
        // --- Configuration ---
        this.BASE_PARTICLE_COUNT = 500; // Base number of particles
        this.MAX_PARTICLE_COUNT = 5000; // Max particles for high complexity/performance
        this.SPAWN_VOLUME_RADIUS = 60;  // Area where particles can exist
        this.SPAWN_VOLUME_HEIGHT = 30;  // Vertical range
        this.BASE_POINT_SIZE = 0.1;     // Base size in shader units
        this.MAX_POINT_SIZE_MULT = 3.0; // Max size multiplier based on attributes/audio

        // --- Module identifier ---
        this.MODULE_ID = 'VCParticles'; // For logging and identification
        
        // --- Volume/Occurrence/Intensity Configuration ---
        this.moodConfig = { volume: 100, occurrence: 100, intensity: 50 }; // Default config
        this.baseSettings = {}; // Store base settings from data.js

        // --- State ---
        this.particles = null;          // THREE.Points object
        this.geometry = null;           // THREE.BufferGeometry
        this.material = null;           // THREE.ShaderMaterial
        this.objects = [];              // Tracks all THREE objects for disposal
        this.currentMood = 'calm';      // Track the current mood
        this.scene = null;              // Store scene reference for reinitialization

        // --- Internal Animation/Reactivity State ---
        this.smoothedParams = {         // Store smoothed visual parameters locally
            movementSpeed: 1.0,
            fluidity: 0.5,
            dreaminess: 0.5,
            rawBass: 0.0,
            rawMid: 0.0,
            rawTreble: 0.0,
            peakImpact: 0.0,
            globalIntensity: 1.0,
            isBeat: false,
        };
        this.noiseTime = Math.random() * 1000; // Unique offset for noise evolution

        console.log("VCParticles module created");
    }

    /**
     * Maps a value from 0-100 range to a target range.
     * @param {number} value0to100 - The input value (0-100)
     * @param {number} minTarget - The minimum target value
     * @param {number} maxTarget - The maximum target value
     * @returns {number} The mapped value
     * @private
     */
    _mapValue(value0to100, minTarget, maxTarget) {
        const clampedValue = Math.max(0, Math.min(100, value0to100 ?? 100)); // Default to 100 if undefined
        return minTarget + (maxTarget - minTarget) * (clampedValue / 100.0);
    }
    
    /**
     * Applies the mood configuration (0-100 values for volume, occurrence, intensity)
     * @param {number} transitionTime - Time in seconds for smooth transitions
     * @private
     */
    _applyMoodConfig(transitionTime = 0) {
        if (!this.moodConfig) return; // Check if config exists

        // --- Apply Occurrence (Particle Count) ---
        if (this.moodConfig.occurrence !== undefined) {
            // Map occurrence to particle count
            const baseCount = this.BASE_PARTICLE_COUNT;
            const maxCount = this.MAX_PARTICLE_COUNT;
            const targetCount = Math.floor(this._mapValue(this.moodConfig.occurrence, 0, maxCount));
            console.log(`${this.MODULE_ID}: Applying Occurrence ${this.moodConfig.occurrence}/100 -> targetCount ${targetCount}`);
            
            // Store the target count for use in init/changeMood
            this.targetParticleCount = targetCount;
        }

        // --- Apply Intensity (Visual parameters) ---
        if (this.moodConfig.intensity !== undefined && this.material) {
            console.log(`${this.MODULE_ID}: Applying Intensity ${this.moodConfig.intensity}/100`);
            
            // Map intensity to point size multiplier
            const basePointSizeMult = 1.0;
            const maxPointSizeMult = this.MAX_POINT_SIZE_MULT;
            const targetPointSizeMult = this._mapValue(this.moodConfig.intensity, basePointSizeMult, maxPointSizeMult);
            console.log(`  -> Point Size Multiplier: ${targetPointSizeMult.toFixed(2)}`);
            
            // Update shader uniform
            if (this.material.uniforms.uMaxPointSizeMult) {
                this.material.uniforms.uMaxPointSizeMult.value = targetPointSizeMult;
            }
        }
        
        // Note: Volume doesn't apply to visual modules
    }

    /**
     * Initializes the particle system based on the current mood settings.
     * @param {THREE.Scene} scene - The main Three.js scene.
     * @param {object} settings - The mood-specific settings object from data.js.
     * @param {string} mood - The current mood string.
     * @param {object} moodConfig - The mood-specific volume/occurrence/intensity config
     */
    init(scene, settings, mood, moodConfig) {
        // --- Pre-checks ---
        if (!scene || !settings || !settings.colors || !THREE) {
            console.error("VCParticles: Scene, settings, settings.colors, or THREE library missing for initialization.");
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', 'Particle system initialization failed: Missing dependencies.');
            }
            return;
        }
        this.currentMood = mood || 'calm';
        this.scene = scene; // Store scene reference for later use
        const complexity = settings.complexity || 0.5;
        
        // Store base settings and mood config
        this.baseSettings = { ...settings };
        this.moodConfig = { ...this.moodConfig, ...moodConfig }; // Merge incoming config
        console.log(`${this.MODULE_ID}: Initializing for mood '${this.currentMood}'... Config:`, this.moodConfig);

        // --- Cleanup ---
        this.dispose(scene);

        try {
            // Apply mood config to calculate parameters
            this._applyMoodConfig(0); // Apply immediately (no transition)
            
            // --- Determine Particle Count ---
            // Use occurrence-based particle count if available, otherwise use complexity-based calculation
            let particleCount = this.targetParticleCount;
            if (!particleCount) {
                particleCount = Math.floor(
                    THREE.MathUtils.lerp(
                        this.BASE_PARTICLE_COUNT,
                        this.MAX_PARTICLE_COUNT,
                        complexity * complexity // Square complexity for more pronounced difference
                    )
                );
            }
            console.log(`VCParticles: Particle count: ${particleCount}`);
            if (particleCount <= 0) {
                console.warn("VCParticles: Particle count is zero, skipping initialization.");
                return;
            }

            // --- Geometry and Attributes ---
            this.geometry = new THREE.BufferGeometry();

            const positions = new Float32Array(particleCount * 3);
            const colors = new Float32Array(particleCount * 3);
            const randomFactors = new Float32Array(particleCount * 4); // x: speed, y: phase, z: sizeMod, w: type/behavior hint
            const baseSizes = new Float32Array(particleCount);

            const moodColors = settings.colors.map(c => new THREE.Color(c));

            for (let i = 0; i < particleCount; i++) {
                const i3 = i * 3;
                const i4 = i * 4;

                // --- Position ---
                // Distribute within a slightly flattened cylinder/sphere volume
                const radius = Math.random() * this.SPAWN_VOLUME_RADIUS;
                const angle = Math.random() * Math.PI * 2;
                const yPos = (Math.random() - 0.5) * this.SPAWN_VOLUME_HEIGHT + 5; // Center slightly above ground

                positions[i3 + 0] = radius * Math.cos(angle);
                positions[i3 + 1] = yPos;
                positions[i3 + 2] = radius * Math.sin(angle);

                // --- Color ---
                // Mix mood colors with slight variations
                const colorIndex1 = Math.floor(Math.random() * moodColors.length);
                const colorIndex2 = (colorIndex1 + 1 + Math.floor(Math.random()*2)) % moodColors.length; // Pick another nearby color
                const mixFactor = Math.random() * 0.5 + 0.25; // Blend mostly
                const particleColor = moodColors[colorIndex1].clone().lerp(moodColors[colorIndex2], mixFactor);
                // Add slight brightness/saturation variation
                particleColor.offsetHSL(0, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1);
                colors[i3 + 0] = particleColor.r;
                colors[i3 + 1] = particleColor.g;
                colors[i3 + 2] = particleColor.b;

                // --- Random Factors ---
                randomFactors[i4 + 0] = 0.5 + Math.random();      // Speed multiplier (0.5 - 1.5)
                randomFactors[i4 + 1] = Math.random() * Math.PI * 2; // Phase offset for movement/twinkle
                randomFactors[i4 + 2] = Math.random();      // Size modifier (0-1) used in shader
                randomFactors[i4 + 3] = Math.random();      // Generic random for type/behavior variation

                // --- Base Size ---
                baseSizes[i] = 0.5 + Math.random(); // Base size variation (0.5-1.5)
            }

            this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            this.geometry.setAttribute('randomFactor', new THREE.BufferAttribute(randomFactors, 4));
            this.geometry.setAttribute('baseSize', new THREE.BufferAttribute(baseSizes, 1));
            this.objects.push(this.geometry); // Track geometry

            // --- Material ---
            this._createParticleMaterial(settings);
            if (!this.material) {
                throw new Error("Failed to create particle material.");
            }
            
            // Apply intensity to material after creation
            if (this.moodConfig.intensity !== undefined) {
                const basePointSizeMult = 1.0;
                const maxPointSizeMult = this.MAX_POINT_SIZE_MULT;
                const targetPointSizeMult = this._mapValue(this.moodConfig.intensity, basePointSizeMult, maxPointSizeMult);
                this.material.uniforms.uMaxPointSizeMult.value = targetPointSizeMult;
            }
            
            this.objects.push(this.material); // Track material

            // --- Points Object ---
            this.particles = new THREE.Points(this.geometry, this.material);
            this.particles.userData = { module: 'VCParticles', mood: this.currentMood };
            this.particles.frustumCulled = false; // Often helps with Points objects

            scene.add(this.particles);
            this.objects.push(this.particles); // Track points object

            console.log(`VCParticles: Initialized successfully for mood '${this.currentMood}'.`);

        } catch (error) {
            console.error(`VCParticles: Error during initialization for mood '${this.currentMood}':`, error);
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', `Particle system failed to initialize: ${error.message}`);
            }
            this.dispose(scene); // Cleanup partial initialization
        }
    }

    /**
     * Creates the ShaderMaterial for the particles.
     * @param {object} settings - The mood-specific settings object.
     * @private
     */
    _createParticleMaterial(settings) {
        const moodType = this._getParticleTypeForMood(this.currentMood);

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0.0 },
                uMoodType: { value: moodType }, // Pass mood type hint to shader
                uBasePointSize: { value: this.BASE_POINT_SIZE },
                uMaxPointSizeMult: { value: this.MAX_POINT_SIZE_MULT },
                uPixelRatio: { value: window.devicePixelRatio },
                uNoiseTime: { value: this.noiseTime },
                // Audio Reactive Uniforms
                uGlobalIntensity: { value: 1.0 },
                uMovementSpeed: { value: 1.0 },
                uFluidity: { value: 0.5 },
                uDreaminess: { value: 0.5 },
                uPeakImpact: { value: 0.0 },
                uRawBass: { value: 0.0 },
                uRawMid: { value: 0.0 },
                uRawTreble: { value: 0.0 },
                // Fog Uniforms
                uFogColor: { value: new THREE.Color(settings.fogColor || '#000000') },
                uFogNear: { value: settings.cameraDistance ? settings.cameraDistance + 20 : 50 },
                uFogFar: { value: settings.cameraDistance ? settings.cameraDistance + this.SPAWN_VOLUME_RADIUS * 1.8 : 150 },
            },
            vertexShader: `
                attribute vec4 randomFactor; // x: speed, y: phase, z: sizeMod, w: typeHint
                attribute float baseSize;

                uniform highp float time;
                uniform float uMoodType; // 0: Calm/Soft (Slow Drift), 1: Uplifting/Bright (Sparkle/Fast), 2: Warm (Ember/Flow), 3: Cosmic (Nebulous/Slow Swirl)
                uniform float uNoiseTime;
                uniform float uBasePointSize;
                uniform float uMaxPointSizeMult;
                uniform float uPixelRatio;
                // Audio/Visual Params
                uniform float uGlobalIntensity;
                uniform float uMovementSpeed;
                uniform float uFluidity; // Controls randomness/turbulence
                uniform float uPeakImpact;
                uniform float uRawBass;
                uniform float uRawTreble;

                uniform float uRawMid;

                varying vec3 vColor;
                varying float vAlphaMod; // Modifier for alpha based on lifetime/audio/etc.
                varying float vGeneralRandom; // Pass general random factor

                // Pseudo-random noise function (replace with Simplex/Perlin if needed)
                float noise(vec3 p) {
                    return fract(sin(dot(p.xyz + vec3(12.9898, 78.233, 151.7182), vec3(uNoiseTime))) * 43758.5453);
                }
                float fbm(vec3 p) {
                    float value = 0.0; float amplitude = 0.5; float frequency = 1.0;
                    for (int i = 0; i < 3; ++i) {
                        value += amplitude * noise(p * frequency);
                        frequency *= 2.1; amplitude *= 0.45;
                    }
                    return value;
                }

                void main() {
                    vColor = color;
                    vGeneralRandom = randomFactor.w; // Pass random factor

                    float speedMod = randomFactor.x;
                    float phase = randomFactor.y;
                    float sizeMod = randomFactor.z;
                    float typeHint = randomFactor.w; // Use this for variation within a mood

                    float timeScaled = time * uMovementSpeed * speedMod;

                    vec3 animatedPos = position; // Start with original position

                    // --- Mood-Based Movement ---
                    if (uMoodType < 0.5) { // Calm / Soft (Slow Drift, Gentle Bobbing)
                        float bobbleSpeed = 0.2 + typeHint * 0.3;
                        animatedPos.y += sin(timeScaled * bobbleSpeed + phase) * (1.0 + uFluidity * 2.0);
                        animatedPos.x += cos(timeScaled * 0.1 + phase) * 0.5 * uFluidity;
                        animatedPos.z += sin(timeScaled * 0.15 + phase) * 0.5 * uFluidity;
                    } else if (uMoodType < 1.5) { // Uplifting / Bright (Faster, Sparkly, Upward Bias)
                        float riseSpeed = 0.5 + typeHint * 1.0;
                        animatedPos.y += time * riseSpeed * uMovementSpeed * 0.5;
                        // Add some jitter/sparkle movement
                        animatedPos.x += (noise(animatedPos * 0.5 + time * 0.5) - 0.5) * 2.0 * uFluidity;
                        animatedPos.z += (noise(animatedPos * 0.5 + time * 0.5 + vec3(5.0)) - 0.5) * 2.0 * uFluidity;
                        // Pop on impact
                        animatedPos += normalize(animatedPos - vec3(0.0, 5.0, 0.0)) * uPeakImpact * 5.0 * sizeMod;
                    } else if (uMoodType < 2.5) { // Warm (Flowing, Ember-like, Gentle Swirl)
                        float swirlSpeed = 0.1 + typeHint * 0.2;
                        float swirlRadius = 1.0 + uFluidity * 3.0;
                        animatedPos.x += cos(timeScaled * swirlSpeed + phase) * swirlRadius;
                        animatedPos.z += sin(timeScaled * swirlSpeed + phase) * swirlRadius;
                        animatedPos.y += sin(timeScaled * 0.3 + phase) * 0.5; // Gentle vertical wave
                    } else { // Cosmic (Slow Swirl, FBM Turbulence, Nebulous)
                        float swirlSpeed = 0.05 + typeHint * 0.1;
                        float swirlRadius = 2.0 + uFluidity * 5.0;
                        animatedPos.x += cos(timeScaled * swirlSpeed + phase) * swirlRadius;
                        animatedPos.z += sin(timeScaled * swirlSpeed + phase) * swirlRadius;
                        // FBM Turbulence
                        vec3 turbulence = vec3(
                            fbm(animatedPos * 0.05 + time * 0.02),
                            fbm(animatedPos * 0.05 + time * 0.02 + vec3(10.0)),
                            fbm(animatedPos * 0.05 + time * 0.02 + vec3(20.0))
                        ) * (2.0 + uFluidity * 6.0);
                        animatedPos += turbulence;
                    }

                    // --- Calculate Point Size ---
                    float baseSizeFactor = baseSize * (0.8 + sizeMod * 0.4); // Apply base size variation
                    float sizeAudioFactor = 1.0;
                    if (uMoodType < 1.5) { // Uplifting/Bright react more to Treble
                         sizeAudioFactor += uRawTreble * 1.5 * (0.5 + typeHint * 0.5);
                    } else if (uMoodType < 2.5) { // Warm react subtly to Mid
                         sizeAudioFactor += uRawMid * 0.5 * (0.5 + typeHint * 0.5);
                    } else { // Cosmic react subtly to Bass/Impact
                         sizeAudioFactor += (uRawBass * 0.3 + uPeakImpact * 0.5) * (0.5 + typeHint * 0.5);
                    }
                    float finalSize = uBasePointSize * baseSizeFactor * sizeAudioFactor * uGlobalIntensity * uMaxPointSizeMult;

                    // --- Calculate Alpha Modifier ---
                    // Twinkle effect combined with audio intensity
                    float twinkle = 0.6 + 0.4 * sin(time * (3.0 + speedMod * 2.0) + phase); // Base twinkle
                    vAlphaMod = twinkle * (0.7 + uGlobalIntensity * 0.3); // Modulate by global intensity
                    if (uMoodType > 0.5 && uMoodType < 1.5) { // Brighter moods pulse more with treble
                        vAlphaMod += uRawTreble * 0.5 * sizeMod;
                    }
                     vAlphaMod += uPeakImpact * 0.3 * sizeMod; // All moods pulse slightly on impact

                    // --- Final Position Calculation ---
                    vec4 mvPosition = modelViewMatrix * vec4(animatedPos, 1.0);
                    gl_PointSize = finalSize * (uPixelRatio * 200.0 / -mvPosition.z); // Attenuation
                    gl_PointSize = clamp(gl_PointSize, 1.0 * uPixelRatio, 15.0 * uPixelRatio); // Clamp size
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                precision highp float;
                uniform float uMoodType;
                uniform float uGlobalIntensity;
                uniform float uDreaminess;
                uniform float uRawMid;
                // Fog
                uniform vec3 uFogColor;
                uniform float uFogNear;
                uniform float uFogFar;

                varying vec3 vColor;
                varying float vAlphaMod; // Base alpha modifier from vertex
                varying float vGeneralRandom; // General random value

                void main() {
                    // Soft point shape
                    float dist = length(gl_PointCoord - vec2(0.5));
                    float shapeAlpha = 1.0 - smoothstep(0.4, 0.5, dist); // Soft edge

                    // --- Final Alpha Calculation ---
                    float finalAlpha = shapeAlpha * vAlphaMod;
                    // Dreaminess fades alpha slightly
                    finalAlpha *= (1.0 - uDreaminess * 0.3);
                    // Mid freqs can slightly boost alpha for some moods (e.g., warm embers)
                    if (uMoodType > 1.5 && uMoodType < 2.5) {
                        finalAlpha += uRawMid * 0.1 * vGeneralRandom;
                    }
                    finalAlpha = clamp(finalAlpha, 0.0, 1.0);

                    // --- Final Color Calculation ---
                    vec3 finalColor = vColor;
                    // Dreaminess slightly desaturates and brightens
                    finalColor = mix(finalColor, vec3(1.0), uDreaminess * 0.15);
                    // Global intensity affects brightness
                    finalColor *= (0.8 + uGlobalIntensity * 0.4);

                    // // --- Apply Fog ---
                    // float depth = gl_FragCoord.z / gl_FragCoord.w;
                    // float fogFactor = smoothstep(uFogNear, uFogFar, depth);

                    // gl_FragColor = vec4(mix(finalColor, uFogColor, fogFactor), finalAlpha);

                    // --- New Final Output ---
                    gl_FragColor = vec4(finalColor, finalAlpha); // Output color/alpha, Three.js adds fog

                    // Discard if fully transparent
                    if (gl_FragColor.a < 0.01) discard;
                }
            `,
            blending: THREE.AdditiveBlending, // Good for fireflies, sparkles, energy
            depthWrite: false, // Standard for particle systems
            transparent: true,
            vertexColors: true,
            fog: false // Enable fog uniform access
        });
    }

    /**
     * Maps mood string to a numerical type for the shader.
     * @param {string} mood
     * @returns {number} Mood type index (0-3)
     * @private
     */
    _getParticleTypeForMood(mood) {
        switch (mood) {
            case 'calm':
            case 'soft':
                return 0.0; // Slow Drift
            case 'uplifting':
            case 'bright':
                return 1.0; // Sparkle/Fast
            case 'warm':
                return 2.0; // Ember/Flow
            case 'cosmic':
            case 'mystical': // Group mystical with cosmic for particles
                return 3.0; // Nebulous/Slow Swirl
            default:
                return 0.0;
        }
    }

    /**
     * Changes the particle system to reflect a new mood.
     * @param {string} newMood - The new mood string.
     * @param {object} newSettings - The mood-specific settings object from data.js.
     * @param {number} transitionTime - Time in seconds for the transition.
     * @param {object} moodConfig - The mood-specific volume/occurrence/intensity config.
     */
    changeMood(newMood, newSettings, transitionTime, moodConfig) {
        if (!this.particles || !this.material || !newSettings || !newMood) {
            console.error(`${this.MODULE_ID}: Missing parameters or not initialized for changeMood.`);
            return;
        }
        
        console.log(`${this.MODULE_ID}: Changing mood to '${newMood}'... Config:`, moodConfig);
        
        // Store new base settings and mood config
        this.baseSettings = { ...newSettings };
        this.moodConfig = { ...this.moodConfig, ...moodConfig }; // Merge new config
        
        try {
            // Apply new mood config with transition
            this._applyMoodConfig(transitionTime);
            
            // Check if we need to recreate particles due to occurrence change
            const oldParticleCount = this.geometry ? this.geometry.attributes.position.count : 0;
            const newParticleCount = this.targetParticleCount;
            
            // If particle count changed significantly or mood type is very different
            // (which might need different particle behaviors), reinitialize
            const oldMoodType = this.material.uniforms.uMoodType.value;
            const newMoodType = this._getParticleTypeForMood(newMood);
            const countDifferenceRatio = oldParticleCount > 0 ? Math.abs(newParticleCount - oldParticleCount) / oldParticleCount : 1;
            
            if (countDifferenceRatio > 0.25 || Math.abs(oldMoodType - newMoodType) >= 1.0) {
                console.log(`${this.MODULE_ID}: Significant changes detected, reinitializing particles.`);
                if (this.scene) {
                    this.init(this.scene, newSettings, newMood, this.moodConfig);
                } else {
                    console.error(`${this.MODULE_ID}: Cannot reinitialize - scene reference missing`);
                }
                return;
            }
            
            // Update current mood state
            this.currentMood = newMood;
            
            // Otherwise, just update the material for the transition
            // Update mood type
            this.material.uniforms.uMoodType.value = newMoodType;
            
            // Update fog parameters if needed
            if (newSettings.fogColor) {
                this.material.uniforms.uFogColor.value.set(newSettings.fogColor);
            }
            if (newSettings.cameraDistance) {
                this.material.uniforms.uFogNear.value = newSettings.cameraDistance + 20;
                this.material.uniforms.uFogFar.value = newSettings.cameraDistance + this.SPAWN_VOLUME_RADIUS * 1.8;
            }
            
            console.log(`${this.MODULE_ID}: Mood updated to '${newMood}'.`);
            
        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during mood change to '${newMood}':`, error);
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', `Particle system failed to update: ${error.message}`);
            }
        }
    }

    /**
     * Updates the particle system uniforms based on time and visual parameters.
     * @param {number} time - The current time elapsed.
     * @param {object} visualParams - The visual parameters object from AudioVisualConnector.
     * @param {number} deltaTime - The time delta since the last frame.
     */
    update(time, visualParams, deltaTime) {
        if (!this.particles || !this.material || !visualParams) return;

        try {
            // --- Smooth visual parameters ---
            const smoothFactor = Math.min(1.0, deltaTime * 4.0); // Adjust smoothing rate
            this.smoothedParams.movementSpeed = THREE.MathUtils.lerp(this.smoothedParams.movementSpeed, visualParams.movementSpeed || 1.0, smoothFactor);
            this.smoothedParams.fluidity = THREE.MathUtils.lerp(this.smoothedParams.fluidity, visualParams.fluidity || 0.5, smoothFactor);
            this.smoothedParams.dreaminess = THREE.MathUtils.lerp(this.smoothedParams.dreaminess, visualParams.dreaminess || 0.5, smoothFactor);
            this.smoothedParams.peakImpact = THREE.MathUtils.lerp(this.smoothedParams.peakImpact, visualParams.peakImpact || 0.0, smoothFactor * 1.5); // Faster impact
            this.smoothedParams.rawBass = THREE.MathUtils.lerp(this.smoothedParams.rawBass, visualParams.rawBass || 0.0, smoothFactor);
            this.smoothedParams.rawMid = THREE.MathUtils.lerp(this.smoothedParams.rawMid, visualParams.rawMid || 0.0, smoothFactor);
            this.smoothedParams.rawTreble = THREE.MathUtils.lerp(this.smoothedParams.rawTreble, visualParams.rawTreble || 0.0, smoothFactor);
            this.smoothedParams.globalIntensity = THREE.MathUtils.lerp(this.smoothedParams.globalIntensity, visualParams.globalIntensity || 1.0, smoothFactor);
            this.smoothedParams.isBeat = visualParams.isBeat || false; // Beat is usually instant

            // --- Update Shader Uniforms ---
            const uniforms = this.material.uniforms;
            uniforms.time.value = time;
            uniforms.uNoiseTime.value = this.noiseTime + time * 0.01; // Slowly evolve base noise pattern
            // Pass smoothed audio/visual params
            uniforms.uGlobalIntensity.value = this.smoothedParams.globalIntensity;
            uniforms.uMovementSpeed.value = this.smoothedParams.movementSpeed;
            uniforms.uFluidity.value = this.smoothedParams.fluidity;
            uniforms.uDreaminess.value = this.smoothedParams.dreaminess;
            uniforms.uPeakImpact.value = this.smoothedParams.peakImpact;
            uniforms.uRawBass.value = this.smoothedParams.rawBass;
            uniforms.uRawMid.value = this.smoothedParams.rawMid;
            uniforms.uRawTreble.value = this.smoothedParams.rawTreble;

            // Optional: Update fog uniforms if camera moves significantly or fog settings change dynamically
            // uniforms.uFogNear.value = ...
            // uniforms.uFogFar.value = ...

        } catch (error) {
            console.error("VCParticles: Error during update:", error);
            if (typeof ToastSystem !== 'undefined') ToastSystem.notify('error', 'Particle system update error.');
            // Consider disabling module on repeated errors
        }
    }

    /**
     * Removes all objects created by this module from the scene and disposes of their resources.
     * @param {THREE.Scene} scene - The main Three.js scene.
     */
    dispose(scene) {
        console.log("VCParticles: Disposing objects...");
        let disposedCount = 0;
        this.objects.forEach(obj => {
            try {
                if (obj) {
                    if (scene && obj.parent === scene) {
                        scene.remove(obj);
                    }
                    if (obj.geometry && typeof obj.geometry.dispose === 'function') {
                        obj.geometry.dispose();
                        disposedCount++;
                    }
                    if (obj.material && typeof obj.material.dispose === 'function') {
                        // Dispose shader textures if any (currently none used in uniforms directly)
                        obj.material.dispose();
                        disposedCount++;
                    }
                    // If obj is the Points object itself, its geometry/material are handled above
                }
            } catch (e) {
                console.error("VCParticles: Error disposing object:", obj, e);
            }
        });
        console.log(`VCParticles: Disposed ${disposedCount} resources.`);

        // Clear internal state
        this.objects = [];
        this.particles = null;
        this.geometry = null;
        this.material = null;
    }
}

// Make globally accessible if required by the project structure
window.VCParticles = VCParticles;