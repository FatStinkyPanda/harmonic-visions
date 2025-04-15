// vc_landscape.js - Visual Canvas Module for Dynamic Terrain Generation
// Part of the Harmonic Visions project by FatStinkyPanda
// Copyright (c) 2025 FatStinkyPanda - All rights reserved.

/**
 * @class VCLandscape
 * @description Manages a dynamic, audio-reactive procedural landscape using
 *              vertex displacement and custom shaders on a PlaneGeometry.
 */
class VCLandscape {
    constructor() {
        // --- Configuration ---
        this.MODULE_ID = 'VCLandscape';
        this.PLANE_SIZE = 120;          // Size of the terrain plane (world units)
        this.PLANE_SEGMENTS_BASE = 96;  // Base segments (adjust based on performance target)
        this.PLANE_SEGMENTS_MAX = 160; // Max segments for higher quality
        this.BASE_ELEVATION_SCALE = 8.0; // Base multiplier for overall terrain height
        this.DETAIL_ELEVATION_SCALE = 3.0; // Multiplier for finer details
        this.PULSE_MAGNITUDE = 2.5;     // How strongly peak impact affects elevation momentarily
        this.MORPH_SPEED_FACTOR = 0.05; // Base speed multiplier for terrain evolution

        // --- Default configuration for volume/occurrence/intensity ---
        this.moodConfig = { volume: 100, occurrence: 100, intensity: 50 }; // Default config
        this.baseSettings = {}; // Store base settings from data.js
        
        // --- Default module settings as fallback ---
        this.defaultLandscapeSettings = {
            complexity: 0.5,
            morphSpeed: 0.3,
            dreaminess: 0.5,
            // Add base/max values used in mapping
            baseElevationMin: this.BASE_ELEVATION_SCALE * 0.5,
            baseElevationMax: this.BASE_ELEVATION_SCALE * 1.5,
            detailElevationMin: this.DETAIL_ELEVATION_SCALE * 0.3,
            detailElevationMax: this.DETAIL_ELEVATION_SCALE * 1.8,
            pulseMagnitudeMin: this.PULSE_MAGNITUDE * 0.5,
            pulseMagnitudeMax: this.PULSE_MAGNITUDE * 2.0,
            segmentsMin: this.PLANE_SEGMENTS_BASE,
            segmentsMax: this.PLANE_SEGMENTS_MAX
        };

        // --- State ---
        this.terrainMesh = null;        // THREE.Mesh object for the terrain
        this.geometry = null;           // THREE.BufferGeometry
        this.material = null;           // THREE.ShaderMaterial
        this.objects = [];              // Tracks all THREE objects for disposal
        this.currentMood = 'calm';      // Track the current mood
        this.isEnabled = false;         // Track if the module is currently active

        // --- Internal Animation/Reactivity State ---
        this.smoothedParams = {         // Local smoothed parameters for smoother visual transitions
            landscapeElevation: 1.0,
            landscapeMorphSpeed: 0.3,
            dreaminess: 0.5,
            peakImpact: 0.0,
            rawBass: 0.0,
            globalIntensity: 1.0,
        };
        this.noiseTime = Math.random() * 1000; // Unique offset for noise evolution each session
        this.pulseStartTime = -1.0; // Time the last pulse started, for decay calculation

        console.log(`${this.MODULE_ID} module created`);
    }

    /**
     * Maps a value from 0-100 scale to a target range
     * @param {number} value0to100 - Input value in 0-100 range
     * @param {number} minTarget - Minimum target output value
     * @param {number} maxTarget - Maximum target output value
     * @returns {number} - Mapped value in target range
     * @private
     */
    _mapValue(value0to100, minTarget, maxTarget) {
        const clampedValue = Math.max(0, Math.min(100, value0to100 ?? 100)); // Default to 100 if undefined
        return minTarget + (maxTarget - minTarget) * (clampedValue / 100.0);
    }

    /**
     * Applies the 0-100 mood configuration to the landscape parameters
     * @param {number} transitionTime - Transition time in seconds
     * @private
     */
    _applyMoodConfig(transitionTime = 0) {
        if (!this.moodConfig || !this.isEnabled) return;

        console.log(`${this.MODULE_ID}: Applying mood config:`, this.moodConfig);
        
        // --- Apply Volume (Visual Visibility/Opacity) ---
        // In a visual context, "volume" could control overall visibility or opacity
        if (this.moodConfig.volume !== undefined && this.terrainMesh) {
            // For landscape, we could interpret volume as overall visibility/opacity
            // Here we just ensure it's enabled when >0, disabled when 0
            if (this.moodConfig.volume <= 0) {
                if (this.terrainMesh.visible) {
                    console.log(`${this.MODULE_ID}: Setting landscape invisible (volume=0)`);
                    this.terrainMesh.visible = false;
                }
            } else if (!this.terrainMesh.visible) {
                console.log(`${this.MODULE_ID}: Setting landscape visible (volume>0)`);
                this.terrainMesh.visible = true;
            }
            
            // We could also adjust opacity if using transparent materials
            // if (this.material && this.material.transparent) {
            //    const opacity = this._mapValue(this.moodConfig.volume, 0.0, 1.0);
            //    this.material.opacity = opacity;
            //    console.log(`${this.MODULE_ID}: Setting opacity to ${opacity.toFixed(2)}`);
            // }
        }

        // --- Apply Occurrence (Detail Level) ---
        // For landscape, "occurrence" can map to detail level (segment count)
        if (this.moodConfig.occurrence !== undefined) {
            const baseSegments = this.baseSettings.segmentsMin || this.defaultLandscapeSettings.segmentsMin;
            const maxSegments = this.baseSettings.segmentsMax || this.defaultLandscapeSettings.segmentsMax;
            const targetSegments = Math.floor(this._mapValue(this.moodConfig.occurrence, baseSegments, maxSegments));
            
            // Store for next geometry creation/update
            this.currentSegmentCount = targetSegments;
            console.log(`${this.MODULE_ID}: Applying Occurrence ${this.moodConfig.occurrence}/100 -> segments ${targetSegments}`);
            
            // Note: Actually changing segment count requires recreating the geometry
            // This is typically done in init or would require a special reconstruction method
            // We don't apply this change immediately as it's expensive - it will apply on next init/changeMood
        }

        // --- Apply Intensity (Elevation, Detail, Pulse) ---
        if (this.moodConfig.intensity !== undefined && this.material) {
            const intensity = this.moodConfig.intensity;
            console.log(`${this.MODULE_ID}: Applying Intensity ${intensity}/100`);
            
            // 1. Base Elevation Scale
            const baseElevMin = this.baseSettings.baseElevationMin || this.defaultLandscapeSettings.baseElevationMin;
            const baseElevMax = this.baseSettings.baseElevationMax || this.defaultLandscapeSettings.baseElevationMax;
            const targetBaseElev = this._mapValue(intensity, baseElevMin, baseElevMax);
            
            // 2. Detail Elevation Scale
            const detailElevMin = this.baseSettings.detailElevationMin || this.defaultLandscapeSettings.detailElevationMin;
            const detailElevMax = this.baseSettings.detailElevationMax || this.defaultLandscapeSettings.detailElevationMax;
            const targetDetailElev = this._mapValue(intensity, detailElevMin, detailElevMax);
            
            // 3. Pulse Magnitude
            const pulseMin = this.baseSettings.pulseMagnitudeMin || this.defaultLandscapeSettings.pulseMagnitudeMin;
            const pulseMax = this.baseSettings.pulseMagnitudeMax || this.defaultLandscapeSettings.pulseMagnitudeMax;
            const targetPulse = this._mapValue(intensity, pulseMin, pulseMax);
            
            // Apply changes to shader uniforms
            if (this.material.uniforms) {
                this.material.uniforms.uBaseElevationScale.value = targetBaseElev;
                this.material.uniforms.uDetailElevationScale.value = targetDetailElev;
                this.material.uniforms.uPulseMagnitude.value = targetPulse;
                
                console.log(`${this.MODULE_ID}: Set elevation scales - Base: ${targetBaseElev.toFixed(2)}, Detail: ${targetDetailElev.toFixed(2)}, Pulse: ${targetPulse.toFixed(2)}`);
            }
        }
    }

    /**
     * Initializes the landscape system for the current mood.
     * @param {THREE.Scene} scene - The main Three.js scene.
     * @param {object} settings - The mood-specific settings object from data.js.
     * @param {string} mood - The current mood string.
     * @param {object} moodConfig - The volume/occurrence/intensity config for this mood.
     */
    init(scene, settings, mood, moodConfig) {
        // --- Pre-checks ---
        if (!scene || !settings || !settings.colors || !THREE) {
            console.error(`${this.MODULE_ID}: Scene, settings, settings.colors, or THREE library missing for initialization.`);
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', 'Landscape initialization failed: Missing dependencies.');
            }
            this.isEnabled = false;
            return;
        }
        this.currentMood = mood || 'calm';
        
        // Store base settings and mood config
        this.baseSettings = { ...this.defaultLandscapeSettings, ...settings };
        this.moodConfig = { ...this.moodConfig, ...moodConfig }; // Merge with defaults
        
        console.log(`${this.MODULE_ID}: Initializing for mood '${this.currentMood}'... Config:`, this.moodConfig);
        
        // --- Cleanup ---
        this.dispose(scene); // Dispose previous instances first

        try {
            // --- Determine Segment Count ---
            // Use occurrence from moodConfig to determine segment count
            let segments = this.PLANE_SEGMENTS_BASE;
            if (this.moodConfig.occurrence !== undefined) {
                const baseSegments = this.baseSettings.segmentsMin || this.PLANE_SEGMENTS_BASE;
                const maxSegments = this.baseSettings.segmentsMax || this.PLANE_SEGMENTS_MAX;
                segments = Math.floor(this._mapValue(this.moodConfig.occurrence, baseSegments, maxSegments));
                this.currentSegmentCount = segments;
            } else {
                // Fall back to complexity-based calculation if occurrence not specified
                const complexity = settings.complexity || 0.5;
                segments = Math.floor(
                    THREE.MathUtils.lerp(
                        this.PLANE_SEGMENTS_BASE,
                        this.PLANE_SEGMENTS_MAX,
                        complexity * 0.7 // Scale complexity influence
                    )
                );
            }
            console.log(`${this.MODULE_ID}: Plane segments: ${segments}`);

            // --- Geometry ---
            this.geometry = new THREE.PlaneGeometry(this.PLANE_SIZE, this.PLANE_SIZE, segments, segments);
            this.objects.push(this.geometry);

            // --- Material ---
            this._createLandscapeMaterial(settings);
            if (!this.material) {
                throw new Error("Failed to create landscape material.");
            }
            this.objects.push(this.material);

            // --- Mesh ---
            this.terrainMesh = new THREE.Mesh(this.geometry, this.material);
            this.terrainMesh.rotation.x = -Math.PI / 2; // Rotate plane to be horizontal
            this.terrainMesh.position.y = -8.0; // Adjust base level as needed
            this.terrainMesh.receiveShadow = true; // Terrain receives shadows
            this.terrainMesh.castShadow = false; // Terrain casting shadows can be expensive, disable for now
            this.terrainMesh.userData = { module: this.MODULE_ID };

            // Apply volume from moodConfig (visibility)
            if (this.moodConfig.volume !== undefined && this.moodConfig.volume <= 0) {
                this.terrainMesh.visible = false;
                console.log(`${this.MODULE_ID}: Setting landscape invisible (volume=0)`);
            }

            scene.add(this.terrainMesh);
            this.objects.push(this.terrainMesh);
            this.isEnabled = true; // Mark as enabled after successful init

            // Apply mood config after everything is set up
            this._applyMoodConfig(0); // Apply immediately

            console.log(`${this.MODULE_ID}: Initialized successfully for mood '${this.currentMood}'.`);

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during initialization for mood '${this.currentMood}':`, error);
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', `Landscape failed to initialize: ${error.message}`);
            }
            this.dispose(scene); // Cleanup on error
            this.isEnabled = false;
        }
    }

    /**
     * Changes the landscape configuration for a new mood
     * @param {string} newMood - The new mood to transition to
     * @param {object} newSettings - The new mood settings
     * @param {number} transitionTime - Transition time in seconds
     * @param {object} moodConfig - The volume/occurrence/intensity config for the new mood
     */
    changeMood(newMood, newSettings, transitionTime, moodConfig) {
        if (!this.isEnabled || !this.material) return;
        
        console.log(`${this.MODULE_ID}: Changing mood to '${newMood}'... Config:`, moodConfig);
        
        try {
            // Store new base settings and mood config
            this.baseSettings = { ...this.defaultLandscapeSettings, ...newSettings };
            this.moodConfig = { ...this.moodConfig, ...moodConfig }; // Merge with existing
            this.currentMood = newMood;
            
            // Apply new mood config with transition
            this._applyMoodConfig(transitionTime);
            
            // Update material colors and other mood-specific settings
            if (this.material && this.material.uniforms) {
                const moodColors = newSettings.colors.map(c => new THREE.Color(c));
                const rockColor = new THREE.Color(0x555560).lerp(moodColors[0], 0.2);
                const detailColor = moodColors[moodColors.length - 1].clone().lerp(new THREE.Color(0xffffff), 0.3);
                
                // Update uniform values
                this.material.uniforms.uMoodColors.value = moodColors;
                this.material.uniforms.uRockColor.value = rockColor;
                this.material.uniforms.uDetailColor.value = detailColor;
                this.material.uniforms.uFogColor.value = new THREE.Color(newSettings.fogColor || '#000000');
                this.material.uniforms.uFogNear.value = newSettings.cameraDistance ? newSettings.cameraDistance - 10 : 10;
                this.material.uniforms.uFogFar.value = newSettings.cameraDistance ? newSettings.cameraDistance + this.PLANE_SIZE * 1.5 : 150;
                this.material.uniforms.uComplexity.value = newSettings.complexity || 0.5;
                this.material.uniforms.uDreaminess.value = newSettings.dreaminess || 0.5;
                
                console.log(`${this.MODULE_ID}: Updated material colors and fog for mood '${newMood}'`);
            }
            
            // Check if segment count needs to be changed significantly
            // Note: Changing geometry requires recreation, which is expensive
            // Only do this for large changes in occurrence/detail level
            if (this.moodConfig.occurrence !== undefined) {
                const baseSegments = this.baseSettings.segmentsMin || this.PLANE_SEGMENTS_BASE;
                const maxSegments = this.baseSettings.segmentsMax || this.PLANE_SEGMENTS_MAX;
                const targetSegments = Math.floor(this._mapValue(this.moodConfig.occurrence, baseSegments, maxSegments));
                
                // Store for next update
                this.currentSegmentCount = targetSegments;
                
                // Only recreate geometry if segment count change is significant (e.g., >20% difference)
                // This is optional and depends on performance considerations
                const currentSegments = this.geometry ? this.geometry.parameters.widthSegments : 0;
                const segmentDiff = Math.abs(targetSegments - currentSegments) / currentSegments;
                
                if (segmentDiff > 0.2) { // >20% difference
                    console.log(`${this.MODULE_ID}: Segment count change significant (${currentSegments} -> ${targetSegments}). Consider reinitializing.`);
                    // Optionally trigger a full reconstruction via a coordinator/manager
                    // or expose a method to request reconstruction
                }
            }
            
            console.log(`${this.MODULE_ID}: Mood parameters updated for '${newMood}'.`);
            
        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during mood change:`, error);
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', `Landscape mood change error: ${error.message}`);
            }
        }
    }

    /**
     * Creates the ShaderMaterial for the landscape surface.
     * @param {object} settings - Mood settings.
     * @private
     */
    _createLandscapeMaterial(settings) {
        const moodColors = settings.colors.map(c => new THREE.Color(c));
        // Define rock/detail colors (can be adjusted per mood later if needed)
        const rockColor = new THREE.Color(0x555560).lerp(moodColors[0], 0.2); // Greyish, tinted by base mood color
        const detailColor = moodColors[moodColors.length - 1].clone().lerp(new THREE.Color(0xffffff), 0.3); // Lighter detail/highlight color

        // Apply intensity to initial elevation scales if moodConfig is available
        let baseElevScale = this.BASE_ELEVATION_SCALE;
        let detailElevScale = this.DETAIL_ELEVATION_SCALE;
        let pulseMagnitude = this.PULSE_MAGNITUDE;
        
        if (this.moodConfig && this.moodConfig.intensity !== undefined) {
            const intensity = this.moodConfig.intensity;
            const baseSettings = this.baseSettings || this.defaultLandscapeSettings;
            
            const baseElevMin = baseSettings.baseElevationMin || this.BASE_ELEVATION_SCALE * 0.5;
            const baseElevMax = baseSettings.baseElevationMax || this.BASE_ELEVATION_SCALE * 1.5;
            baseElevScale = this._mapValue(intensity, baseElevMin, baseElevMax);
            
            const detailElevMin = baseSettings.detailElevationMin || this.DETAIL_ELEVATION_SCALE * 0.3;
            const detailElevMax = baseSettings.detailElevationMax || this.DETAIL_ELEVATION_SCALE * 1.8;
            detailElevScale = this._mapValue(intensity, detailElevMin, detailElevMax);
            
            const pulseMin = baseSettings.pulseMagnitudeMin || this.PULSE_MAGNITUDE * 0.5;
            const pulseMax = baseSettings.pulseMagnitudeMax || this.PULSE_MAGNITUDE * 2.0;
            pulseMagnitude = this._mapValue(intensity, pulseMin, pulseMax);
        }

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                // Time & Noise
                time: { value: 0.0 },
                uNoiseTime: { value: this.noiseTime },
                uMorphSpeedFactor: { value: this.MORPH_SPEED_FACTOR },
                // Elevation & Shape
                uBaseElevationScale: { value: baseElevScale },
                uDetailElevationScale: { value: detailElevScale },
                uComplexity: { value: settings.complexity || 0.5 },
                // Audio/Visual Params
                uLandscapeElevation: { value: 1.0 }, // Overall multiplier from connector
                uLandscapeMorphSpeed: { value: settings.morphSpeed || 0.3 }, // Base speed from connector
                uDreaminess: { value: settings.dreaminess || 0.5 },
                uPeakImpact: { value: 0.0 }, // For pulsing
                uPulseStartTime: { value: -1.0 },
                uPulseMagnitude: { value: pulseMagnitude },
                uRawBass: { value: 0.0 }, // Subtle height modulation
                uGlobalIntensity: { value: 1.0 },
                // Colors & Lighting
                uMoodColors: { value: moodColors },
                uRockColor: { value: rockColor },
                uDetailColor: { value: detailColor },
                uFogColor: { value: new THREE.Color(settings.fogColor || '#000000') },
                uFogNear: { value: settings.cameraDistance ? settings.cameraDistance - 10 : 10 },
                uFogFar: { value: settings.cameraDistance ? settings.cameraDistance + this.PLANE_SIZE * 1.5 : 150 },
                uLightDirection: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
                uAmbientLight: { value: 0.2 },
            },
            vertexShader: `
                // attribute vec2 uv;

                uniform highp float time;
                uniform float uNoiseTime;
                uniform float uMorphSpeedFactor;
                // Elevation & Shape
                uniform float uBaseElevationScale;
                uniform float uDetailElevationScale;
                uniform float uComplexity;
                // Audio/Visual Params
                uniform float uLandscapeElevation;
                uniform float uLandscapeMorphSpeed;
                uniform float uPeakImpact;
                uniform float uPulseStartTime;
                uniform float uPulseMagnitude;
                uniform float uRawBass;

                varying vec3 vWorldPosition;
                varying vec3 vNormal;
                varying float vElevation; // Pass raw elevation value
                varying float vSlope;     // Pass slope factor
                varying vec2 vUv;

                // Simplex/Perlin Noise (implementation needed or use hash based)
                // Using a hash-based noise for simplicity and performance here
                 vec2 hash( vec2 p ) {
                    p = vec2( dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)) );
                    return -1.0 + 2.0 * fract(sin(p)*43758.5453123);
                }

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

                // Fractional Brownian Motion (FBM)
                float fbm(vec2 p, float timeOffset) {
                    float value = 0.0;
                    float amplitude = 0.5;
                    float frequency = 1.0;
                    p += uNoiseTime * 0.1 + timeOffset; // Incorporate global noise offset

                    for (int i = 0; i < 5; ++i) { // 5 octaves for terrain detail
                        value += amplitude * noise(p * frequency);
                        frequency *= 2.0; // Lacunarity
                        amplitude *= 0.5; // Gain
                    }
                    return value;
                }

                // Function to calculate elevation at a given point
                float calculateElevation(vec2 pos, float morphTime) {
                    // Base large-scale features
                    float baseElevation = fbm(pos * 0.015, morphTime * 0.2) * uBaseElevationScale;
                    // Medium details influenced by complexity
                    float midDetails = fbm(pos * 0.06, morphTime * 0.5) * uDetailElevationScale * (0.5 + uComplexity * 0.7);
                    // Fine details
                    float fineDetails = fbm(pos * 0.25, morphTime * 1.0) * uDetailElevationScale * 0.3 * uComplexity;

                    float totalElevation = baseElevation + midDetails + fineDetails;

                    // Subtle modulation by bass frequency
                    totalElevation *= (1.0 + uRawBass * 0.05);

                    // Apply overall landscape elevation scale from connector
                    totalElevation *= uLandscapeElevation;

                     // Add peak impact pulse (decaying effect)
                     if (uPulseStartTime > 0.0) {
                         float timeSincePulse = time - uPulseStartTime;
                         if (timeSincePulse < 1.5) { // Duration of pulse effect
                             // Calculate distance from center (or a random point) for ripple effect
                             float distFromCenter = length(pos * 0.01); // Scale down position for larger ripple
                             float pulseDecay = exp(-timeSincePulse * 3.0); // Exponential decay
                             float pulseShape = sin(distFromCenter * 5.0 - timeSincePulse * 10.0 + 1.57); // Outward ripple
                             float pulse = uPeakImpact * uPulseMagnitude * pulseDecay * pulseShape * (1.0 - smoothstep(0.0, 0.8, distFromCenter)); // Fade out ripple
                             totalElevation += pulse;
                         }
                     }


                    return totalElevation;
                }


                void main() {
                    vUv = uv;
                    vec3 pos = position;
                    float morphTime = time * uMorphSpeedFactor * uLandscapeMorphSpeed; // Use connector speed

                    // Calculate elevation for the current vertex
                    float elevation = calculateElevation(pos.xz, morphTime);
                    pos.y = elevation;
                    vElevation = elevation; // Pass raw elevation

                    // Calculate Normal dynamically using finite differences
                    float delta = 0.5; // Adjust delta based on plane size and desired detail
                    float elevationX = calculateElevation(pos.xz + vec2(delta, 0.0), morphTime);
                    float elevationZ = calculateElevation(pos.xz + vec2(0.0, delta), morphTime);

                    vec3 tangentX = normalize(vec3(delta, elevationX - elevation, 0.0));
                    vec3 tangentZ = normalize(vec3(0.0, elevationZ - elevation, delta));
                    vec3 calculatedNormal = normalize(cross(tangentZ, tangentX));
                    vNormal = calculatedNormal;

                    // Calculate slope (dot product with up vector)
                    vSlope = 1.0 - clamp(dot(calculatedNormal, vec3(0.0, 1.0, 0.0)), 0.0, 1.0); // 0 = flat, 1 = vertical

                    // Final world position
                    vec4 worldPos4 = modelMatrix * vec4(pos, 1.0);
                    vWorldPosition = worldPos4.xyz;

                    gl_Position = projectionMatrix * viewMatrix * worldPos4;
                }
            `,
            fragmentShader: `
                precision highp float; // Optimization for mobile

                uniform vec3 uMoodColors[5];
                uniform vec3 uRockColor;
                uniform vec3 uDetailColor; // Highlight/accent color
                uniform float uDreaminess;
                uniform float uGlobalIntensity;
                uniform highp float time;
                // Fog
                uniform vec3 uFogColor;
                uniform float uFogNear;
                uniform float uFogFar;
                // Lighting
                uniform vec3 uLightDirection;
                uniform float uAmbientLight;

                varying vec3 vWorldPosition;
                varying vec3 vNormal;
                varying float vElevation;
                varying float vSlope; // 0 (flat) to 1 (vertical)
                varying vec2 vUv;

                // Hash function definition MOVED HERE
                vec2 hash( vec2 p ) { p = vec2( dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)) ); return -1.0 + 2.0 * fract(sin(p)*43758.5453123); }

                 // Noise function (can be the same as vertex or different)
                 float noise( in vec2 p ) {
                    const float K1 = 0.366025404; const float K2 = 0.211324865;
                    vec2 i = floor( p + (p.x+p.y)*K1 ); vec2 a = p - i + (i.x+i.y)*K2;
                    vec2 o = (a.x>a.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);
                    vec2 b = a - o + K2; vec2 c = a - 1.0 + 2.0*K2;
                    vec3 h = max( 0.5-vec3(dot(a,a), dot(b,b), dot(c,c)), 0.0 );
                    vec3 n = h*h*h*h*vec3( dot(a,hash(i+0.0)), dot(b,hash(i+o)), dot(c,hash(i+vec2(1.0))) );
                    return dot( n, vec3(70.0) );
                }
                 float fbm(vec2 p, float timeOffset) {
                    float value = 0.0; float amplitude = 0.5; float frequency = 1.0;
                    p += vec2(timeOffset); // Use a different time offset maybe
                    for (int i = 0; i < 3; ++i) { // 3 octaves for fragment performance
                        value += amplitude * noise(p * frequency);
                        frequency *= 2.0; amplitude *= 0.5;
                    }
                    return value;
                }

                void main() {
                    vec3 normal = normalize(vNormal);

                    // --- Determine Color based on Elevation and Slope ---
                    // Normalize elevation roughly (needs adjustment based on actual elevation range)
                    float normalizedElevation = clamp(vElevation / 15.0, -0.5, 1.5); // Adjust divisor based on expected max height
                    float elevationColorFactor = smoothstep(-0.2, 1.2, normalizedElevation); // Map elevation to 0-1 range for color mixing

                    // Blend between mood colors based on elevation
                    int index1 = int(floor(elevationColorFactor * 4.0));
                    int index2 = min(index1 + 1, 4);
                    float elevationMix = fract(elevationColorFactor * 4.0);
                    vec3 elevationColor = mix(uMoodColors[index1], uMoodColors[index2], elevationMix);

                    // Blend towards rock color based on slope
                    float rockFactor = smoothstep(0.3, 0.7, vSlope); // More rock on steeper slopes
                    vec3 baseColor = mix(elevationColor, uRockColor, rockFactor);

                    // Add subtle detail color based on noise (e.g., highlights on ridges)
                    float detailNoise = fbm(vWorldPosition.xz * 0.1, time * 0.1); // Noise based on world position
                    float detailFactor = smoothstep(0.5, 0.7, detailNoise) * (1.0 - rockFactor); // More detail on flatter areas
                    baseColor = mix(baseColor, uDetailColor, detailFactor * 0.3);

                    // --- Apply Dreaminess ---
                    // Desaturate and slightly brighten based on dreaminess
                    float dreamDesat = uDreaminess * 0.4;
                    float dreamBright = uDreaminess * 0.1;
                    vec3 dreamColor = mix(baseColor, vec3(dot(baseColor, vec3(0.299, 0.587, 0.114))), dreamDesat);
                    dreamColor += dreamBright;

                    // --- Simple Lighting ---
                    float diffuse = max(dot(normal, uLightDirection), 0.0);
                    // Add subtle rim lighting based on normal and view direction (optional)
                    // vec3 viewDir = normalize(uCameraPos - vWorldPosition);
                    // float rim = pow(1.0 - max(dot(viewDir, normal), 0.0), 2.0);

                    vec3 lighting = vec3(uAmbientLight) + vec3(diffuse * (0.7 + uGlobalIntensity * 0.5));
                    // lighting += vec3(rim * 0.2 * uGlobalIntensity); // Add rim light contribution
                    lighting = clamp(lighting, 0.0, 1.2); // Allow slight overbright

                    // --- Final Color ---
                    vec3 finalColor = dreamColor * lighting;

                    // // --- Apply Fog ---
                    // float depth = gl_FragCoord.z / gl_FragCoord.w;
                    // float fogFactor = smoothstep(uFogNear, uFogFar, depth);

                    // gl_FragColor = vec4(mix(finalColor, uFogColor, fogFactor), 1.0); // Opaque terrain

                    // --- New Final Output (Let Three.js handle fog) ---
                    gl_FragColor = vec4(finalColor, 1.0); // Output color, Three.js will add fog
                }
            `,
            side: THREE.FrontSide, // Only front side usually needed for terrain plane
            transparent: false,
            depthWrite: true,
            fog: false // Enable fog uniforms
        });
    }

    /**
     * Updates the landscape uniforms based on time and visual parameters.
     * @param {number} time - The current time elapsed.
     * @param {object} visualParams - The visual parameters object from AudioVisualConnector.
     * @param {number} deltaTime - The time delta since the last frame.
     */
    update(time, visualParams, deltaTime) {
        if (!this.isEnabled || !this.terrainMesh || !this.material || !visualParams) return;

        try {
            // --- Smooth visual parameters ---
            const smoothFactor = Math.min(1.0, deltaTime * 3.0); // Smoothing rate
            this.smoothedParams.landscapeElevation = THREE.MathUtils.lerp(this.smoothedParams.landscapeElevation, visualParams.landscapeElevation || 1.0, smoothFactor);
            this.smoothedParams.landscapeMorphSpeed = THREE.MathUtils.lerp(this.smoothedParams.landscapeMorphSpeed, visualParams.landscapeMorphSpeed || 0.3, smoothFactor);
            this.smoothedParams.dreaminess = THREE.MathUtils.lerp(this.smoothedParams.dreaminess, visualParams.dreaminess || 0.5, smoothFactor);
            this.smoothedParams.peakImpact = THREE.MathUtils.lerp(this.smoothedParams.peakImpact, visualParams.peakImpact || 0.0, smoothFactor * 2.0); // Faster impact smoothing
            this.smoothedParams.rawBass = THREE.MathUtils.lerp(this.smoothedParams.rawBass, visualParams.rawBass || 0.0, smoothFactor);
            this.smoothedParams.globalIntensity = THREE.MathUtils.lerp(this.smoothedParams.globalIntensity, visualParams.globalIntensity || 1.0, smoothFactor);

             // Update pulse start time only when a new peak occurs
             if (visualParams.peakImpact > 0.1 && this.smoothedParams.peakImpact < 0.05) { // Detect rising edge of smoothed impact
                 this.pulseStartTime = time;
             }


            // --- Update Shader Uniforms ---
            const uniforms = this.material.uniforms;
            uniforms.time.value = time;
            uniforms.uNoiseTime.value = this.noiseTime; // Use internal offset + time in shader
            // Pass smoothed audio/visual params
            uniforms.uLandscapeElevation.value = this.smoothedParams.landscapeElevation;
            uniforms.uLandscapeMorphSpeed.value = this.smoothedParams.landscapeMorphSpeed;
            uniforms.uDreaminess.value = this.smoothedParams.dreaminess;
            uniforms.uPeakImpact.value = this.smoothedParams.peakImpact; // Pass smoothed impact
            uniforms.uPulseStartTime.value = this.pulseStartTime;
            uniforms.uRawBass.value = this.smoothedParams.rawBass;
            uniforms.uGlobalIntensity.value = this.smoothedParams.globalIntensity;

            // Update light direction if necessary (e.g., if main light moves)
            // uniforms.uLightDirection.value.copy(...);

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during update:`, error);
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', 'Landscape update error.');
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
                        // Dispose shader textures if any (currently none used directly)
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
        this.terrainMesh = null;
        this.geometry = null;
        this.material = null;
    }
}

// Make globally accessible if required by the project structure
window.VCLandscape = VCLandscape;