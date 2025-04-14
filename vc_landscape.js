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
     * Initializes the landscape system for the current mood.
     * @param {THREE.Scene} scene - The main Three.js scene.
     * @param {object} settings - The mood-specific settings object from data.js.
     * @param {string} mood - The current mood string.
     */
    init(scene, settings, mood) {
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
        const complexity = settings.complexity || 0.5;

        // --- Cleanup ---
        this.dispose(scene); // Dispose previous instances first
        console.log(`${this.MODULE_ID}: Initializing for mood '${this.currentMood}'...`);

        try {
            // --- Determine Segment Count ---
            // More complex moods can justify slightly higher detail if performance allows
            const segments = Math.floor(
                THREE.MathUtils.lerp(
                    this.PLANE_SEGMENTS_BASE,
                    this.PLANE_SEGMENTS_MAX,
                    complexity * 0.7 // Scale complexity influence
                )
            );
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

            scene.add(this.terrainMesh);
            this.objects.push(this.terrainMesh);
            this.isEnabled = true; // Mark as enabled after successful init

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
     * Creates the ShaderMaterial for the landscape surface.
     * @param {object} settings - Mood settings.
     * @private
     */
    _createLandscapeMaterial(settings) {
        const moodColors = settings.colors.map(c => new THREE.Color(c));
        // Define rock/detail colors (can be adjusted per mood later if needed)
        const rockColor = new THREE.Color(0x555560).lerp(moodColors[0], 0.2); // Greyish, tinted by base mood color
        const detailColor = moodColors[moodColors.length - 1].clone().lerp(new THREE.Color(0xffffff), 0.3); // Lighter detail/highlight color

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                // Time & Noise
                time: { value: 0.0 },
                uNoiseTime: { value: this.noiseTime },
                uMorphSpeedFactor: { value: this.MORPH_SPEED_FACTOR },
                // Elevation & Shape
                uBaseElevationScale: { value: this.BASE_ELEVATION_SCALE },
                uDetailElevationScale: { value: this.DETAIL_ELEVATION_SCALE },
                uComplexity: { value: settings.complexity || 0.5 },
                // Audio/Visual Params
                uLandscapeElevation: { value: 1.0 }, // Overall multiplier from connector
                uLandscapeMorphSpeed: { value: settings.morphSpeed || 0.3 }, // Base speed from connector
                uDreaminess: { value: settings.dreaminess || 0.5 },
                uPeakImpact: { value: 0.0 }, // For pulsing
                uPulseStartTime: { value: -1.0 },
                uPulseMagnitude: { value: this.PULSE_MAGNITUDE },
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