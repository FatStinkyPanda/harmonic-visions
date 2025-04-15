// vc_water.js - Visual Canvas Module for Dynamic Water Surface
// Part of the Harmonic Visions project by FatStinkyPanda
// Copyright (c) 2025 FatStinkyPanda - All rights reserved.

/**
 * @class VCWater
 * @description Manages a dynamic, audio-reactive water surface using a custom shader.
 *              Adapts appearance and behavior based on mood and audio input.
 */
class VCWater {
    constructor() {
        // --- Configuration ---
        this.MODULE_ID = 'VCWater';
        this.PLANE_SIZE = 150;          // Size of the water plane
        this.PLANE_SEGMENTS = 96;       // Detail level (balance performance/visuals)
        this.BASE_WAVE_HEIGHT = 0.1;    // Minimum wave height influence
        this.MAX_WAVE_HEIGHT_MULT = 5.0; // Max multiplier from audio bass/impact
        this.BASE_CHOPPINESS = 0.3;      // Controls the sharpness/frequency of small waves
        this.REFLECTION_DISTORTION = 0.03; // How much reflections are distorted by waves
        this.WATER_DEPTH_COLOR_FACTOR = 0.8; // How much the base color darkens with simulated depth

        // --- State ---
        this.waterMesh = null;          // THREE.Mesh object for the water plane
        this.geometry = null;           // THREE.BufferGeometry
        this.material = null;           // THREE.ShaderMaterial
        this.objects = [];              // Tracks all THREE objects for disposal
        this.currentMood = 'calm';      // Track the current mood
        this.isEnabled = false;         // Track if the module is currently active

        // --- Internal Animation/Reactivity State ---
        this.smoothedParams = {         // Local smoothed parameters
            movementSpeed: 1.0,
            fluidity: 0.5,
            dreaminess: 0.5,
            peakImpact: 0.0,
            rawBass: 0.0,
            rawMid: 0.0,
            rawTreble: 0.0,
            globalIntensity: 1.0,
            waterWaveHeight: 1.0,       // From connector (base multiplier)
            waterRippleStrength: 0.0,   // From connector
        };
        this.noiseTime = Math.random() * 100; // Unique noise offset per session

        // --- Volume/Occurrence/Intensity Config ---
        this.moodConfig = { volume: 100, occurrence: 100, intensity: 50 }; // Default config
        this.baseSettings = {}; // Store base settings from data.js

        console.log(`${this.MODULE_ID} module created`);
    }

    /**
     * Maps a value from 0-100 range to a target range
     * @param {number} value0to100 - Input value in 0-100 range
     * @param {number} minTarget - Minimum target value
     * @param {number} maxTarget - Maximum target value
     * @returns {number} - Mapped value in target range
     * @private
     */
    _mapValue(value0to100, minTarget, maxTarget) {
        const clampedValue = Math.max(0, Math.min(100, value0to100 ?? 100)); // Default to 100 if undefined
        return minTarget + (maxTarget - minTarget) * (clampedValue / 100.0);
    }

    /**
     * Applies the mood configuration parameters (volume/occurrence/intensity)
     * @param {number} transitionTime - Time to transition in seconds (if applicable)
     * @private
     */
    _applyMoodConfig(transitionTime = 0) {
        if (!this.moodConfig) return; // Check if config exists

        console.log(`${this.MODULE_ID}: Applying mood config:`, this.moodConfig);

        // --- Volume: Not applicable for visual modules ---

        // --- Apply Occurrence ---
        if (this.moodConfig.occurrence !== undefined) {
            // For water, occurrence controls plane visibility
            if (this.waterMesh) {
                // Hide water if occurrence is very low
                const shouldBeVisible = this.moodConfig.occurrence > 15;
                if (this.waterMesh.visible !== shouldBeVisible) {
                    this.waterMesh.visible = shouldBeVisible;
                    console.log(`${this.MODULE_ID}: Water visibility set to ${shouldBeVisible}`);
                }
            }
            
            // Could also scale the size based on occurrence, but would require recreating geometry
            // const baseSize = this.baseSettings.PLANE_SIZE || this.PLANE_SIZE;
            // this.PLANE_SIZE = this._mapValue(this.moodConfig.occurrence, baseSize * 0.6, baseSize);
        }

        // --- Apply Intensity ---
        if (this.moodConfig.intensity !== undefined) {
            console.log(`${this.MODULE_ID}: Applying Intensity ${this.moodConfig.intensity}/100`);
            
            // Wave height - affects how tall waves can get
            const baseWaveHeight = this.baseSettings.BASE_WAVE_HEIGHT || this.BASE_WAVE_HEIGHT;
            this.BASE_WAVE_HEIGHT = this._mapValue(this.moodConfig.intensity, baseWaveHeight * 0.5, baseWaveHeight * 2.0);
            
            // Max wave height multiplier - affects audio reactivity
            const baseHeightMult = this.baseSettings.MAX_WAVE_HEIGHT_MULT || this.MAX_WAVE_HEIGHT_MULT;
            this.MAX_WAVE_HEIGHT_MULT = this._mapValue(this.moodConfig.intensity, baseHeightMult * 0.5, baseHeightMult * 1.5);
            
            // Choppiness - affects wave frequency and sharpness
            const baseChoppiness = this.baseSettings.BASE_CHOPPINESS || this.BASE_CHOPPINESS;
            this.BASE_CHOPPINESS = this._mapValue(this.moodConfig.intensity, baseChoppiness * 0.7, baseChoppiness * 2.0);
            
            // Reflection distortion - affects how much reflections are distorted
            const baseDistortion = this.baseSettings.REFLECTION_DISTORTION || this.REFLECTION_DISTORTION;
            this.REFLECTION_DISTORTION = this._mapValue(this.moodConfig.intensity, baseDistortion * 0.5, baseDistortion * 2.5);
            
            // Update material uniforms if available
            if (this.material && this.material.uniforms) {
                // Apply to uniforms so they take effect immediately
                this.material.uniforms.uBaseWaveHeight.value = this.BASE_WAVE_HEIGHT;
                this.material.uniforms.uMaxWaveHeightMult.value = this.MAX_WAVE_HEIGHT_MULT;
                this.material.uniforms.uBaseChoppiness.value = this.BASE_CHOPPINESS;
                this.material.uniforms.uReflectionDistortion.value = this.REFLECTION_DISTORTION;
            }
        }
    }

    /**
     * Initializes the water system for the current mood.
     * @param {THREE.Scene} scene - The main Three.js scene.
     * @param {object} settings - The mood-specific settings object from data.js.
     * @param {string} mood - The current mood string.
     * @param {object} moodConfig - Optional mood config with volume/occurrence/intensity values.
     */
    init(scene, settings, mood, moodConfig) {
        // --- Pre-checks ---
        if (!scene || !settings || !settings.colors || !THREE) {
            console.error(`${this.MODULE_ID}: Scene, settings, settings.colors, or THREE library missing for initialization.`);
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', 'Water system initialization failed: Missing dependencies.');
            }
            this.isEnabled = false;
            return;
        }
        this.currentMood = mood || 'calm';

        // --- Cleanup ---
        this.dispose(scene); // Dispose previous instances first
        console.log(`${this.MODULE_ID}: Initializing for mood '${this.currentMood}'... Config:`, moodConfig);

        try {
            // Store base settings and mood config
            this.baseSettings = { ...settings, 
                PLANE_SIZE: this.PLANE_SIZE,
                PLANE_SEGMENTS: this.PLANE_SEGMENTS,
                BASE_WAVE_HEIGHT: this.BASE_WAVE_HEIGHT,
                MAX_WAVE_HEIGHT_MULT: this.MAX_WAVE_HEIGHT_MULT,
                BASE_CHOPPINESS: this.BASE_CHOPPINESS,
                REFLECTION_DISTORTION: this.REFLECTION_DISTORTION,
                WATER_DEPTH_COLOR_FACTOR: this.WATER_DEPTH_COLOR_FACTOR
            };
            this.moodConfig = { ...this.moodConfig, ...moodConfig }; // Merge incoming config
            
            // Apply mood config before creating any geometry
            this._applyMoodConfig(0); // Apply immediately (no transition)

            // --- Geometry ---
            // Use decent segments for smooth waves, but adjustable based on performance needs
            const segments = Math.max(32, Math.min(128, this.PLANE_SEGMENTS)); // Clamp segments
            this.geometry = new THREE.PlaneGeometry(this.PLANE_SIZE, this.PLANE_SIZE, segments, segments);
            this.objects.push(this.geometry);

            // --- Material ---
            this._createWaterMaterial(settings);
            if (!this.material) throw new Error("Failed to create water material.");
            this.objects.push(this.material);

            // --- Mesh ---
            this.waterMesh = new THREE.Mesh(this.geometry, this.material);
            this.waterMesh.rotation.x = -Math.PI / 2; // Rotate plane to be horizontal
            this.waterMesh.position.y = -7.8; // Position slightly below origin (adjust based on landscape)
            this.waterMesh.receiveShadow = true; // Water can receive shadows
            this.waterMesh.userData = { module: this.MODULE_ID };

            // Apply visibility based on occurrence (happens in _applyMoodConfig, but ensure it's set initially)
            if (this.moodConfig.occurrence < 15) {
                this.waterMesh.visible = false;
                console.log(`${this.MODULE_ID}: Water hidden due to low occurrence value (${this.moodConfig.occurrence}/100)`);
            }

            scene.add(this.waterMesh);
            this.objects.push(this.waterMesh);
            this.isEnabled = true; // Mark as enabled after successful init

            console.log(`${this.MODULE_ID}: Initialized successfully for mood '${this.currentMood}'.`);

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during initialization for mood '${this.currentMood}':`, error);
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', `Water system failed to initialize: ${error.message}`);
            }
            this.dispose(scene); // Cleanup on error
            this.isEnabled = false;
        }
    }

    /**
     * Creates the ShaderMaterial for the water surface.
     * @param {object} settings - Mood settings.
     * @private
     */
    _createWaterMaterial(settings) {
        const moodColors = settings.colors.map(c => new THREE.Color(c));
        // Determine primary water color and sky color for reflections based on mood
        let waterBaseColor = moodColors[0] || new THREE.Color(0x1a5276);
        let skyColor = moodColors[moodColors.length - 1] || new THREE.Color(0xd6eaf8);
        // Adjust colors for specific moods if needed
        if (this.currentMood === 'cosmic') {
            waterBaseColor = moodColors[1] || new THREE.Color(0x8e44ad);
            skyColor = moodColors[3] || new THREE.Color(0xbb8fce);
        } else if (this.currentMood === 'warm') {
            waterBaseColor = moodColors[2] || new THREE.Color(0xf1948a);
            skyColor = moodColors[0] || new THREE.Color(0xe74c3c);
        }

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0.0 },
                uWaterBaseColor: { value: waterBaseColor },
                uSkyColor: { value: skyColor }, // For simple reflections
                uNoiseTime: { value: this.noiseTime },
                uBaseWaveHeight: { value: this.BASE_WAVE_HEIGHT },
                uMaxWaveHeightMult: { value: this.MAX_WAVE_HEIGHT_MULT },
                uBaseChoppiness: { value: this.BASE_CHOPPINESS },
                uReflectionDistortion: { value: this.REFLECTION_DISTORTION },
                uWaterDepthColorFactor: { value: this.WATER_DEPTH_COLOR_FACTOR },
                // Audio/Visual Params (will be updated in `update`)
                uGlobalIntensity: { value: 1.0 },
                uMovementSpeed: { value: 1.0 },
                uFluidity: { value: 0.5 },
                uDreaminess: { value: 0.5 },
                uPeakImpact: { value: 0.0 },
                uRawBass: { value: 0.0 },
                uRawMid: { value: 0.0 }, // For ripples
                uWaterWaveHeightParam: { value: 1.0 }, // From visualParams
                uWaterRippleStrengthParam: { value: 0.0 }, // From visualParams
                // Fog Params
                uFogColor: { value: new THREE.Color(settings.fogColor || '#000000') },
                uFogNear: { value: settings.cameraDistance ? settings.cameraDistance - 5 : 5 }, // Fog starts closer to camera for water
                uFogFar: { value: settings.cameraDistance ? settings.cameraDistance + this.PLANE_SIZE * 0.8 : 120 },
                // Lighting (Simple)
                uLightDirection: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
                uAmbientLight: { value: 0.25 },
                // Camera Position (needed for Fresnel/Reflections)
                uCameraPos: { value: new THREE.Vector3() },
            },
            vertexShader: `
                // Add default precision specifiers at the top
                precision highp float;
                precision highp int;

                // Uniforms with explicit precision
                uniform highp float time; // Ensure highp
                uniform highp float uNoiseTime; // Ensure highp
                uniform float uBaseWaveHeight;
                uniform float uMaxWaveHeightMult;
                uniform float uBaseChoppiness;
                // Audio/Visual Params
                uniform float uMovementSpeed;
                uniform float uFluidity; // Controls wave complexity/speed variation
                uniform float uPeakImpact; // Big wave splash
                uniform float uRawBass;    // General wave height
                uniform float uWaterWaveHeightParam; // Base multiplier from connector

                varying vec3 vWorldPosition;
                varying vec3 vNormal;
                varying vec2 vUv;
                varying float vWaveHeightInfo; // Pass info about wave height/crest

                // Hash function
                vec2 hash( vec2 p ) {
                    p = vec2( dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)) );
                    return -1.0 + 2.0 * fract(sin(p + uNoiseTime * 0.1)*43758.5453123);
                }

                // Noise function
                float noise( in vec2 p ) {
                    const float K1 = 0.366025404; // (sqrt(3)-1)/2;
                    const float K2 = 0.211324865; // (3-sqrt(3))/6;
                    vec2 i = floor( p + (p.x+p.y)*K1 );
                    vec2 a = p - i + (i.x+i.y)*K2;
                    vec2 o = (a.x>a.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);
                    vec2 b = a - o + K2;
                    vec2 c = a - 1.0 + 2.0*K2;
                    vec3 h = max( 0.5-vec3(dot(a,a), dot(b,b), dot(c,c)), 0.0 );
                    vec3 n = h*h*h*h*vec3( dot(a,hash(i+0.0)), dot(b,hash(i+o)), dot(c,hash(i+1.0)) );
                    return dot( n, vec3(70.0) );
                }

                // FBM function
                float fbm(vec2 p, float timeOffset) {
                    float value = 0.0;
                    float amplitude = 0.5;
                    float frequency = uBaseChoppiness + uFluidity * 0.5; // Fluidity affects choppiness
                    p += vec2(uNoiseTime * 0.01 + timeOffset);

                    for (int i = 0; i < 4; ++i) { // 4 octaves
                        value += amplitude * noise(p * frequency);
                        frequency *= 1.8;
                        amplitude *= 0.55;
                    }
                    return value;
                }

                void main() {
                    vUv = uv;
                    vec3 pos = position;
                    float timeScaled = time * uMovementSpeed * 0.3;

                    float waveHeight = fbm(pos.xz * 0.05, timeScaled * 0.5);
                    waveHeight += fbm(pos.xz * 0.15, timeScaled * 0.8) * 0.4;

                    float audioHeightFactor = uBaseWaveHeight + (uRawBass * 0.8 + uPeakImpact * 1.5) * uMaxWaveHeightMult;
                    audioHeightFactor *= uWaterWaveHeightParam;

                    pos.y = waveHeight * audioHeightFactor;
                    vWaveHeightInfo = clamp(waveHeight * audioHeightFactor, -1.0, 1.0);

                    float delta = 0.1;
                    float heightX = fbm((pos.xz + vec2(delta, 0.0)) * 0.05, timeScaled * 0.5) + fbm((pos.xz + vec2(delta, 0.0)) * 0.15, timeScaled * 0.8) * 0.4;
                    float heightZ = fbm((pos.xz + vec2(0.0, delta)) * 0.05, timeScaled * 0.5) + fbm((pos.xz + vec2(0.0, delta)) * 0.15, timeScaled * 0.8) * 0.4;

                    vec3 tangentX = normalize(vec3(delta, (heightX - waveHeight) * audioHeightFactor, 0.0));
                    vec3 tangentZ = normalize(vec3(0.0, (heightZ - waveHeight) * audioHeightFactor, delta));
                    vNormal = normalize(cross(tangentZ, tangentX));

                    vec4 worldPos4 = modelMatrix * vec4(pos, 1.0);
                    vWorldPosition = worldPos4.xyz;

                    gl_Position = projectionMatrix * viewMatrix * worldPos4;
                }
            `,
            fragmentShader: `
                // Add default precision specifiers at the top
                precision highp float;
                precision highp int;

                // Uniforms with explicit precision
                uniform vec3 uWaterBaseColor;
                uniform vec3 uSkyColor;
                uniform highp float uNoiseTime; // Ensure highp
                uniform float uReflectionDistortion;
                uniform float uWaterDepthColorFactor;
                // Audio/Visual Params
                uniform float uGlobalIntensity;
                uniform float uDreaminess;
                uniform float uRawMid;
                uniform float uWaterRippleStrengthParam;
                // Fog
                uniform vec3 uFogColor;
                uniform float uFogNear;
                uniform float uFogFar;
                // Lighting
                uniform vec3 uLightDirection;
                uniform float uAmbientLight;
                // Camera
                uniform vec3 uCameraPos;

                uniform highp float time; // Ensure highp
                uniform float uFluidity;

                varying vec3 vWorldPosition;
                varying vec3 vNormal;
                varying vec2 vUv;
                varying float vWaveHeightInfo;

                // Hash function
                vec2 hash( vec2 p ) {
                    p = vec2( dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)) );
                    return -1.0 + 2.0 * fract(sin(p + uNoiseTime * 0.1)*43758.5453123);
                }

                 // Noise function
                 float noise( in vec2 p ) {
                    const float K1 = 0.366025404; const float K2 = 0.211324865;
                    vec2 i = floor( p + (p.x+p.y)*K1 ); vec2 a = p - i + (i.x+i.y)*K2;
                    vec2 o = (a.x>a.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);
                    vec2 b = a - o + K2; vec2 c = a - 1.0 + 2.0*K2;
                    vec3 h = max( 0.5-vec3(dot(a,a), dot(b,b), dot(c,c)), 0.0 );
                    vec3 n = h*h*h*h*vec3( dot(a,hash(i+vec2(0.0))), dot(b,hash(i+o)), dot(c,hash(i+vec2(1.0))) );
                    return dot( n, vec3(70.0) );
                }
                 // FBM function
                 float fbm(vec2 p, float timeOffset) {
                    float value = 0.0; float amplitude = 0.5; float frequency = 1.0;
                    p += vec2(uNoiseTime * 0.01 + timeOffset);
                    for (int i = 0; i < 3; ++i) {
                        value += amplitude * noise(p * frequency);
                        frequency *= 1.9; amplitude *= 0.5;
                    }
                    return value;
                }


                void main() {
                    vec3 normal = normalize(vNormal);
                    vec3 viewDir = normalize(uCameraPos - vWorldPosition);

                    // Fresnel
                    float fresnelBias = 0.02;
                    float fresnelScale = 1.0 - fresnelBias;
                    float fresnelFactor = fresnelBias + fresnelScale * pow(max(0.0, 1.0 - dot(viewDir, normal)), 5.0);
                    fresnelFactor *= (1.0 - uDreaminess * 0.5);

                    // Reflection
                    float rippleIntensity = uWaterRippleStrengthParam * 0.5 + uRawMid * 0.3;
                    vec2 rippleNoise = vec2(fbm(vUv * 15.0, time * 0.5), fbm(vUv * 15.0 + 5.0, time * 0.5)) * rippleIntensity;
                    vec3 distortedNormal = normalize(normal + vec3(rippleNoise.x, 0.0, rippleNoise.y) * uReflectionDistortion);
                    vec3 reflectDir = reflect(-viewDir, distortedNormal);
                    vec3 reflectionColor = uSkyColor * (0.8 + uGlobalIntensity * 0.2);
                    reflectionColor = mix(reflectionColor, uWaterBaseColor, uDreaminess * 0.3);

                    // Refraction / Water Color
                    float depthFactor = 1.0 - clamp(abs(vWaveHeightInfo), 0.0, 1.0) * uWaterDepthColorFactor;
                    vec3 waterColor = uWaterBaseColor * depthFactor;
                    waterColor.rgb *= (0.9 + fbm(vUv * 5.0, time * 0.1) * 0.2);

                    // Lighting
                    float diffuse = max(dot(normal, uLightDirection), 0.0);
                    vec3 halfVec = normalize(uLightDirection + viewDir);
                    float specAngle = max(dot(normal, halfVec), 0.0);
                    float shininess = 32.0 + uGlobalIntensity * 64.0 * (1.0 - uDreaminess * 0.8);
                    float specular = pow(specAngle, shininess) * (0.5 + uGlobalIntensity * 0.5);
                    vec3 lighting = vec3(uAmbientLight) + vec3(diffuse * 0.6) + vec3(specular * 0.8);
                    lighting = clamp(lighting, 0.0, 1.5);

                    // Combine Colors
                    vec3 surfaceColor = mix(waterColor, reflectionColor, fresnelFactor);
                    vec3 finalColor = surfaceColor * lighting;

                    // Foam
                    float foamThreshold = 0.6 + (1.0 - uFluidity) * 0.3;
                    float foamFactor = smoothstep(foamThreshold, foamThreshold + 0.2, vWaveHeightInfo);
                    foamFactor *= smoothstep(0.3, 0.6, rippleIntensity);
                    foamFactor *= (0.5 + uGlobalIntensity * 0.5);
                    vec3 foamColor = vec3(0.9);
                    finalColor = mix(finalColor, foamColor, foamFactor * 0.8);

                    // Transparency
                    float baseAlpha = 0.6 + (1.0 - fresnelFactor) * 0.3;
                    float finalAlpha = baseAlpha + uDreaminess * 0.2;
                    finalAlpha = clamp(finalAlpha * uGlobalIntensity, 0.3, 0.95);

                    // Final Output (Let Three.js handle fog)
                    gl_FragColor = vec4(finalColor, finalAlpha);

                    // Optional discard
                    // if (gl_FragColor.a < 0.01) discard;
                }
            `,
            transparent: true,
            depthWrite: false, // Typically false for transparent water to see things below
            side: THREE.FrontSide, // Only front side needed for a plane
            fog: false // Enable fog uniforms
        });
    }

    /**
     * Changes the water system for a new mood.
     * @param {string} newMood - The new mood string.
     * @param {object} newSettings - The new mood-specific settings.
     * @param {number} transitionTime - The transition time in seconds.
     * @param {object} moodConfig - The new mood configuration with volume/occurrence/intensity.
     */
    changeMood(newMood, newSettings, transitionTime, moodConfig) {
        if (!this.isEnabled || !this.material) return;
        console.log(`${this.MODULE_ID}: Changing mood to '${newMood}'... Config:`, moodConfig);

        try {
            // Store new settings and config
            this.baseSettings = { 
                ...newSettings,
                PLANE_SIZE: this.PLANE_SIZE,
                PLANE_SEGMENTS: this.PLANE_SEGMENTS,
                BASE_WAVE_HEIGHT: this.BASE_WAVE_HEIGHT,
                MAX_WAVE_HEIGHT_MULT: this.MAX_WAVE_HEIGHT_MULT,
                BASE_CHOPPINESS: this.BASE_CHOPPINESS,
                REFLECTION_DISTORTION: this.REFLECTION_DISTORTION,
                WATER_DEPTH_COLOR_FACTOR: this.WATER_DEPTH_COLOR_FACTOR
            };
            this.moodConfig = { ...this.moodConfig, ...moodConfig }; // Merge new config
            this.currentMood = newMood;

            // Apply new mood config with transition
            this._applyMoodConfig(transitionTime);

            // --- Update Colors for New Mood ---
            const moodColors = newSettings.colors.map(c => new THREE.Color(c));
            let waterBaseColor = moodColors[0] || new THREE.Color(0x1a5276);
            let skyColor = moodColors[moodColors.length - 1] || new THREE.Color(0xd6eaf8);

            // Adjust colors for specific moods if needed
            if (this.currentMood === 'cosmic') {
                waterBaseColor = moodColors[1] || new THREE.Color(0x8e44ad);
                skyColor = moodColors[3] || new THREE.Color(0xbb8fce);
            } else if (this.currentMood === 'warm') {
                waterBaseColor = moodColors[2] || new THREE.Color(0xf1948a);
                skyColor = moodColors[0] || new THREE.Color(0xe74c3c);
            }

            // Update material uniforms with new colors
            const uniforms = this.material.uniforms;
            uniforms.uWaterBaseColor.value.copy(waterBaseColor);
            uniforms.uSkyColor.value.copy(skyColor);

            // Update fog color if it changed
            if (newSettings.fogColor) {
                uniforms.uFogColor.value.set(newSettings.fogColor);
            }

            console.log(`${this.MODULE_ID}: Mood parameters updated for '${newMood}'.`);

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during mood change:`, error);
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', `Water system failed to change mood: ${error.message}`);
            }
        }
    }

    /**
     * Updates the water system uniforms based on time and visual parameters.
     * @param {number} time - The current time elapsed.
     * @param {object} visualParams - The visual parameters object from AudioVisualConnector.
     * @param {number} deltaTime - The time delta since the last frame.
     * @param {THREE.Camera} camera - The scene camera.
     */
    update(time, visualParams, deltaTime, camera) {
        if (!this.isEnabled || !this.waterMesh || !this.material || !visualParams || !camera) return;

        try {
            // --- Smooth visual parameters ---
            const smoothFactor = Math.min(1.0, deltaTime * 3.5); // Water can react a bit faster
            this.smoothedParams.movementSpeed = THREE.MathUtils.lerp(this.smoothedParams.movementSpeed, visualParams.movementSpeed || 1.0, smoothFactor);
            this.smoothedParams.fluidity = THREE.MathUtils.lerp(this.smoothedParams.fluidity, visualParams.fluidity || 0.5, smoothFactor);
            this.smoothedParams.dreaminess = THREE.MathUtils.lerp(this.smoothedParams.dreaminess, visualParams.dreaminess || 0.5, smoothFactor);
            this.smoothedParams.peakImpact = THREE.MathUtils.lerp(this.smoothedParams.peakImpact, visualParams.peakImpact || 0.0, smoothFactor * 1.8); // Faster impact
            this.smoothedParams.rawBass = THREE.MathUtils.lerp(this.smoothedParams.rawBass, visualParams.rawBass || 0.0, smoothFactor);
            this.smoothedParams.rawMid = THREE.MathUtils.lerp(this.smoothedParams.rawMid, visualParams.rawMid || 0.0, smoothFactor);
            this.smoothedParams.globalIntensity = THREE.MathUtils.lerp(this.smoothedParams.globalIntensity, visualParams.globalIntensity || 1.0, smoothFactor);
            // Get water-specific params directly
            this.smoothedParams.waterWaveHeight = THREE.MathUtils.lerp(this.smoothedParams.waterWaveHeight, visualParams.waterWaveHeight || 1.0, smoothFactor);
            this.smoothedParams.waterRippleStrength = THREE.MathUtils.lerp(this.smoothedParams.waterRippleStrength, visualParams.waterRippleStrength || 0.0, smoothFactor);

            // --- Apply mood config intensity to wave height ---
            // Scale waterWaveHeight based on intensity
            let waveHeightScaled = this.smoothedParams.waterWaveHeight;
            if (this.moodConfig.intensity !== undefined) {
                // Intensity affects wave height scaling (higher intensity = more dramatic waves)
                const intensityFactor = this._mapValue(this.moodConfig.intensity, 0.7, 1.3);
                waveHeightScaled *= intensityFactor;
            }

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
            uniforms.uWaterWaveHeightParam.value = waveHeightScaled; // Use the intensity-scaled value
            uniforms.uWaterRippleStrengthParam.value = this.smoothedParams.waterRippleStrength;

            // Update camera position
            uniforms.uCameraPos.value.copy(camera.position);

            // Update light direction if necessary (e.g., if main light moves)
            // uniforms.uLightDirection.value.copy(...);

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during update:`, error);
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', 'Water system update error.');
            }
            // Consider disabling the module on repeated errors
            // this.isEnabled = false;
        }
    }

    /**
     * Removes all objects created by this module from the scene and disposes of their resources.
     * @param {THREE.Scene} scene - The main Three.js scene.
     */
    dispose(scene) {
        console.log(`${this.MODULE_ID}: Disposing objects...`);
        let disposedCount = 0;
        this.isEnabled = false; // Mark as disabled

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
                        // Dispose shader textures if any (currently none used directly in uniforms)
                        obj.material.dispose();
                        disposedCount++;
                    }
                    // If obj is the Mesh itself, its geometry/material are handled above
                }
            } catch (e) {
                console.error(`${this.MODULE_ID}: Error disposing object:`, obj, e);
            }
        });
        console.log(`${this.MODULE_ID}: Disposed ${disposedCount} resources.`);

        // Clear internal state
        this.objects = [];
        this.waterMesh = null;
        this.geometry = null;
        this.material = null;
    }
}

// Make globally accessible if required by the project structure
window.VCWater = VCWater;