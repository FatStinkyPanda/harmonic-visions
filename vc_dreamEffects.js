// vc_dreamEffects.js - Visual Canvas Module for Ethereal Dream-like Effects
// Part of the Harmonic Visions project by FatStinkyPanda
// Copyright (c) 2025 FatStinkyPanda - All rights reserved.

/**
 * @class VCDreamEffects
 * @description Manages dream-like visual elements such as glowing orbs and abstract floating geometry,
 *              reacting dynamically to mood and audio-visual parameters.
 */
class VCDreamEffects {
    constructor() {
        // --- Configuration ---
        this.ORB_COUNT_BASE = 30;
        this.ORB_COUNT_COMPLEXITY_FACTOR = 70; // Max additional orbs based on complexity
        this.FLOATER_COUNT_BASE = 10;
        this.FLOATER_COUNT_COMPLEXITY_FACTOR = 25;

        this.ORB_SPAWN_RADIUS = 45;
        this.ORB_SPAWN_HEIGHT = 15;
        this.FLOATER_SPAWN_RADIUS = 35;
        this.FLOATER_SPAWN_HEIGHT = 10;

        this.ORB_BASE_SIZE = 0.8;
        this.ORB_SIZE_VARIATION = 1.5;
        this.FLOATER_BASE_SIZE = 0.5;
        this.FLOATER_SIZE_VARIATION = 1.0;

        this.ORB_DRIFT_SPEED = 0.08;
        this.FLOATER_ROTATION_SPEED = 0.05;

        // --- State ---
        this.glowingOrbs = null;         // InstancedMesh for orbs
        this.floatingGeometry = null;    // InstancedMesh for floaters
        this.orbMaterial = null;
        this.floaterMaterial = null;
        this.orbGeometry = null;
        this.floaterGeometry = null;
        this.objects = [];               // Tracks all THREE objects (meshes, geoms, materials)
        this.currentMood = 'calm';

        // --- Internal Animation/Reactivity State ---
        this.smoothedParams = {
            movementSpeed: 1.0,
            fluidity: 0.5,
            dreaminess: 0.5,
            peakImpact: 0.0,
            rawMid: 0.0,
            globalIntensity: 1.0,
        };
        this.noiseTime = Math.random() * 100; // Unique noise offset per session

        // --- VoI Config ---
        this.moodConfig = { volume: 100, occurrence: 100, intensity: 50 }; // Default config
        this.baseSettings = {}; // Store base settings from data.js
        this.targetOrbCount = 0; // Used for occurrence mapping
        this.targetFloaterCount = 0; // Used for occurrence mapping

        console.log("VCDreamEffects module created");
    }

    /**
     * Maps a value from 0-100 scale to a target range
     * @param {number} value0to100 - The value on a 0-100 scale
     * @param {number} minTarget - The target range minimum
     * @param {number} maxTarget - The target range maximum
     * @returns {number} The mapped value in the target range
     * @private
     */
    _mapValue(value0to100, minTarget, maxTarget) {
        const clampedValue = Math.max(0, Math.min(100, value0to100 ?? 100)); // Default to 100 if undefined
        return minTarget + (maxTarget - minTarget) * (clampedValue / 100.0);
    }

    /**
     * Applies the 0-100 configuration values to the effect parameters
     * @param {number} transitionTime - Time in seconds for parameter transitions
     * @private
     */
    _applyMoodConfig(transitionTime = 0) {
        if (!this.moodConfig) return; // Make sure we have config

        // --- Apply Volume (Visibility) ---
        if (this.moodConfig.volume !== undefined) {
            // Volume affects the global intensity (brightness/opacity)
            const baseGlobalIntensity = this.baseSettings.globalIntensity || 1.0;
            const targetIntensity = this._mapValue(this.moodConfig.volume, 0.0, baseGlobalIntensity);
            console.log(`VCDreamEffects: Applying Volume ${this.moodConfig.volume}/100 -> globalIntensity ${targetIntensity.toFixed(2)}`);
            
            if (this.orbMaterial && this.orbMaterial.uniforms) {
                this.orbMaterial.uniforms.uGlobalIntensity.value = targetIntensity;
            }
            if (this.floaterMaterial && this.floaterMaterial.uniforms) {
                this.floaterMaterial.uniforms.uGlobalIntensity.value = targetIntensity;
            }
        }

        // --- Apply Occurrence (Number of Elements) ---
        if (this.moodConfig.occurrence !== undefined) {
            // Occurrence affects the number of orbs and floaters
            // Note: Changes to count require recreating the instancedMesh, so we store for init/changeMood
            
            // For orb count
            const baseOrbCount = this.ORB_COUNT_BASE;
            const maxOrbCount = baseOrbCount + this.ORB_COUNT_COMPLEXITY_FACTOR;
            this.targetOrbCount = Math.floor(this._mapValue(this.moodConfig.occurrence, 0, maxOrbCount));
            
            // For floater count
            const baseFloaterCount = this.FLOATER_COUNT_BASE;
            const maxFloaterCount = baseFloaterCount + this.FLOATER_COUNT_COMPLEXITY_FACTOR;
            this.targetFloaterCount = Math.floor(this._mapValue(this.moodConfig.occurrence, 0, maxFloaterCount));
            
            console.log(`VCDreamEffects: Applying Occurrence ${this.moodConfig.occurrence}/100 -> targetCounts: ${this.targetOrbCount} orbs, ${this.targetFloaterCount} floaters`);
            
            // Actual count change happens in init or changeMood since it requires structure change
        }

        // --- Apply Intensity (Effect Strength) ---
        if (this.moodConfig.intensity !== undefined) {
            console.log(`VCDreamEffects: Applying Intensity ${this.moodConfig.intensity}/100`);
            
            // Intensity affects dreaminess and fluidity
            
            // Dreaminess parameter - maps intensity to 0.1-1.0 
            const baseDreaminess = this.baseSettings.baseDreaminess || 0.1;
            const maxDreaminess = this.baseSettings.maxDreaminess || 1.0;
            const targetDreaminess = this._mapValue(this.moodConfig.intensity, baseDreaminess, maxDreaminess);
            console.log(`  -> Dreaminess: ${targetDreaminess.toFixed(2)}`);
            
            // Fluidity parameter - maps intensity to 0.1-1.0
            const baseFluidity = this.baseSettings.baseFluidity || 0.1;
            const maxFluidity = this.baseSettings.maxFluidity || 1.0;
            const targetFluidity = this._mapValue(this.moodConfig.intensity, baseFluidity, maxFluidity);
            console.log(`  -> Fluidity: ${targetFluidity.toFixed(2)}`);
            
            // Drift speed - subtle increase with intensity
            const baseDriftSpeed = this.baseSettings.baseDriftSpeed || this.ORB_DRIFT_SPEED;
            const maxDriftSpeed = this.baseSettings.maxDriftSpeed || (this.ORB_DRIFT_SPEED * 2.0);
            const targetDriftSpeed = this._mapValue(this.moodConfig.intensity, baseDriftSpeed, maxDriftSpeed);
            console.log(`  -> Drift Speed: ${targetDriftSpeed.toFixed(3)}`);
            
            // Apply these values to shader uniforms
            if (this.orbMaterial && this.orbMaterial.uniforms) {
                this.orbMaterial.uniforms.uDreaminess.value = targetDreaminess;
                this.orbMaterial.uniforms.uFluidity.value = targetFluidity;
                this.orbMaterial.uniforms.uDriftSpeed.value = targetDriftSpeed;
            }
            
            if (this.floaterMaterial && this.floaterMaterial.uniforms) {
                this.floaterMaterial.uniforms.uDreaminess.value = targetDreaminess;
                
                // For rotation speed (if applicable)
                const baseRotationSpeed = this.baseSettings.baseRotationSpeed || this.FLOATER_ROTATION_SPEED;
                const maxRotationSpeed = this.baseSettings.maxRotationSpeed || (this.FLOATER_ROTATION_SPEED * 2.0);
                const targetRotationSpeed = this._mapValue(this.moodConfig.intensity, baseRotationSpeed, maxRotationSpeed);
                
                if (this.floaterMaterial.uniforms.uRotationSpeed) {
                    this.floaterMaterial.uniforms.uRotationSpeed.value = targetRotationSpeed;
                }
            }
        }
    }

    /**
     * Initializes the dream effects based on the current mood settings.
     * @param {THREE.Scene} scene - The main Three.js scene.
     * @param {object} settings - The mood-specific settings object from data.js.
     * @param {string} mood - The current mood string.
     * @param {object} moodConfig - The 0-100 configuration values for volume, occurrence, intensity.
     */
    init(scene, settings, mood, moodConfig) {
        // --- Pre-checks ---
        if (!scene || !settings || !settings.colors || !THREE) {
            console.error("VCDreamEffects: Scene, settings, settings.colors, or THREE library missing for initialization.");
            if (typeof ToastSystem !== 'undefined') ToastSystem.notify('error', 'Dream Effects initialization failed: Missing dependencies.');
            return;
        }
        this.currentMood = mood || 'calm';

        // --- Cleanup ---
        this.dispose(scene);
        console.log(`VCDreamEffects: Initializing for mood '${this.currentMood}'... Config:`, moodConfig);

        try {
            // Store base settings and config
            this.baseSettings = { ...settings };
            this.moodConfig = { ...this.moodConfig, ...moodConfig }; // Merge incoming config with defaults
            
            // --- Apply Mood Config First ---
            this._applyMoodConfig(0); // Apply immediately (no transition)
            
            // --- Determine Counts Based on Mood Config ---
            const orbCount = this.targetOrbCount || Math.floor(this.ORB_COUNT_BASE + this.ORB_COUNT_COMPLEXITY_FACTOR * (settings.complexity || 0.5));
            const floaterCount = this.targetFloaterCount || Math.floor(this.FLOATER_COUNT_BASE + this.FLOATER_COUNT_COMPLEXITY_FACTOR * (settings.complexity || 0.5));

            // --- Create Glowing Orbs ---
            this._createGlowingOrbs(scene, settings, orbCount);

            // --- Create Floating Geometry ---
            this._createFloatingGeometry(scene, settings, floaterCount);

            console.log(`VCDreamEffects: Initialized successfully for mood '${this.currentMood}' with ${orbCount} orbs and ${floaterCount} floaters.`);

        } catch (error) {
            console.error(`VCDreamEffects: Error during initialization for mood '${this.currentMood}':`, error);
            if (typeof ToastSystem !== 'undefined') ToastSystem.notify('error', `Dream Effects failed to initialize: ${error.message}`);
            this.dispose(scene); // Cleanup partial initialization
        }
    }

    /**
     * Changes the dream effects to match a new mood.
     * @param {THREE.Scene} scene - The main Three.js scene.
     * @param {object} newSettings - The new mood-specific settings object from data.js.
     * @param {string} newMood - The new mood string.
     * @param {number} transitionTime - Time in seconds for the transition.
     * @param {object} moodConfig - The 0-100 configuration values for volume, occurrence, intensity.
     */
    changeMood(scene, newSettings, newMood, transitionTime, moodConfig) {
        if (!scene || !newSettings) {
            console.error("VCDreamEffects: Scene or settings missing for mood change.");
            return;
        }
        
        console.log(`VCDreamEffects: Changing mood to '${newMood}'... Config:`, moodConfig);
        
        try {
            // Store the old count values for comparison
            const oldOrbCount = this.targetOrbCount || (this.glowingOrbs ? this.glowingOrbs.count : 0);
            const oldFloaterCount = this.targetFloaterCount || (this.floatingGeometry ? this.floatingGeometry.count : 0);
            
            // Update settings and config
            this.baseSettings = { ...newSettings };
            this.moodConfig = { ...this.moodConfig, ...moodConfig };
            this.currentMood = newMood;
            
            // Apply new config with transition time
            this._applyMoodConfig(transitionTime);
            
            // Check if count has changed significantly (>10% difference)
            const newOrbCount = this.targetOrbCount;
            const newFloaterCount = this.targetFloaterCount;
            
            const orbCountChanged = Math.abs(newOrbCount - oldOrbCount) > oldOrbCount * 0.1;
            const floaterCountChanged = Math.abs(newFloaterCount - oldFloaterCount) > oldFloaterCount * 0.1;
            
            // If counts changed significantly, recreate the meshes
            if (orbCountChanged || floaterCountChanged) {
                console.log(`VCDreamEffects: Significant count change detected. Recreating instances.`);
                console.log(`  Orbs: ${oldOrbCount} -> ${newOrbCount}, Floaters: ${oldFloaterCount} -> ${newFloaterCount}`);
                
                // Cleanup existing meshes but keep materials
                if (this.glowingOrbs && scene.contains(this.glowingOrbs)) {
                    scene.remove(this.glowingOrbs);
                    this.glowingOrbs.dispose();
                    this.glowingOrbs = null;
                }
                
                if (this.floatingGeometry && scene.contains(this.floatingGeometry)) {
                    scene.remove(this.floatingGeometry);
                    this.floatingGeometry.dispose();
                    this.floatingGeometry = null;
                }
                
                // Recreate with new counts
                this._createGlowingOrbs(scene, newSettings, newOrbCount);
                this._createFloatingGeometry(scene, newSettings, newFloaterCount);
                
            } else {
                console.log(`VCDreamEffects: Using existing instances with new parameters. `);
                
                // Update materials if colors or other visual properties changed
                if (this.orbMaterial) {
                    const moodColors = newSettings.colors.map(c => new THREE.Color(c));
                    this.orbMaterial.uniforms.uMoodColors.value = moodColors;
                    this.orbMaterial.uniforms.uFogColor.value = new THREE.Color(newSettings.fogColor || '#000000');
                }
                
                if (this.floaterMaterial) {
                    const moodColors = newSettings.colors.map(c => new THREE.Color(c));
                    this.floaterMaterial.uniforms.uMoodColors.value = moodColors;
                    this.floaterMaterial.uniforms.uFogColor.value = new THREE.Color(newSettings.fogColor || '#000000');
                }
            }
            
            console.log(`VCDreamEffects: Mood changed to '${newMood}'.`);
            
        } catch (error) {
            console.error(`VCDreamEffects: Error during mood change to '${newMood}':`, error);
            if (typeof ToastSystem !== 'undefined') ToastSystem.notify('error', `Dream Effects mood change failed: ${error.message}`);
        }
    }

    /**
     * Creates the InstancedMesh for glowing orbs.
     * @param {THREE.Scene} scene
     * @param {object} settings
     * @param {number} count
     * @private
     */
    _createGlowingOrbs(scene, settings, count) {
        if (count <= 0) return;

        // Use a low-poly sphere for performance
        this.orbGeometry = new THREE.IcosahedronGeometry(1, 1); // Radius 1, detail level 1
        this.objects.push(this.orbGeometry);

        this._createOrbMaterial(settings);
        if (!this.orbMaterial) throw new Error("Failed to create orb material.");
        this.objects.push(this.orbMaterial);

        this.glowingOrbs = new THREE.InstancedMesh(this.orbGeometry, this.orbMaterial, count);
        this.glowingOrbs.instanceMatrix.setUsage(THREE.DynamicDrawUsage); // We'll animate via shader mostly

        const basePositions = new Float32Array(count * 3);
        const randomFactors = new Float32Array(count * 3); // For animation variation (speed, phase, etc.)
        const baseScales = new Float32Array(count);

        const dummyMatrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion(); // Orbs don't need complex rotation
        const scale = new THREE.Vector3();

        for (let i = 0; i < count; i++) {
            // Random position within a volume
            position.set(
                (Math.random() - 0.5) * 2 * this.ORB_SPAWN_RADIUS,
                (Math.random() - 0.5) * 2 * this.ORB_SPAWN_HEIGHT + 5, // Slightly offset Y
                (Math.random() - 0.5) * 2 * this.ORB_SPAWN_RADIUS
            );

            const baseScale = this.ORB_BASE_SIZE + Math.random() * this.ORB_SIZE_VARIATION;
            scale.set(baseScale, baseScale, baseScale);

            dummyMatrix.compose(position, quaternion, scale);
            this.glowingOrbs.setMatrixAt(i, dummyMatrix);

            // Store data for shader
            basePositions[i * 3 + 0] = position.x;
            basePositions[i * 3 + 1] = position.y;
            basePositions[i * 3 + 2] = position.z;
            randomFactors[i * 3 + 0] = 0.5 + Math.random() * 0.7; // Speed variation
            randomFactors[i * 3 + 1] = Math.random() * Math.PI * 2; // Phase offset
            randomFactors[i * 3 + 2] = Math.random(); // Generic random factor
            baseScales[i] = baseScale;
        }

        // Add attributes for shader access
        this.orbGeometry.setAttribute('basePosition', new THREE.InstancedBufferAttribute(basePositions, 3));
        this.orbGeometry.setAttribute('randomFactor', new THREE.InstancedBufferAttribute(randomFactors, 3));
        this.orbGeometry.setAttribute('baseScale', new THREE.InstancedBufferAttribute(baseScales, 1));

        this.glowingOrbs.instanceMatrix.needsUpdate = true;
        this.glowingOrbs.userData = { module: 'VCDreamEffects', type: 'orb' };
        this.glowingOrbs.frustumCulled = false; // May help if shader animation is large

        scene.add(this.glowingOrbs);
        this.objects.push(this.glowingOrbs);
    }

    /**
     * Creates the InstancedMesh for abstract floating geometry.
     * @param {THREE.Scene} scene
     * @param {object} settings
     * @param {number} count
     * @private
     */
    _createFloatingGeometry(scene, settings, count) {
        if (count <= 0) return;

        // Use simple abstract geometry like Tetrahedron or Octahedron
        this.floaterGeometry = new THREE.TetrahedronGeometry(1, 0); // Radius 1, detail 0
        this.objects.push(this.floaterGeometry);

        this._createFloaterMaterial(settings);
        if (!this.floaterMaterial) throw new Error("Failed to create floater material.");
        this.objects.push(this.floaterMaterial);

        this.floatingGeometry = new THREE.InstancedMesh(this.floaterGeometry, this.floaterMaterial, count);
        this.floatingGeometry.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

        const randomFactors = new Float32Array(count * 4); // x,y,z for rotation axis, w for speed/phase
        const baseScales = new Float32Array(count);

        const dummyMatrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        const rotationAxis = new THREE.Vector3();

        for (let i = 0; i < count; i++) {
            // Position within a slightly smaller volume than orbs
            position.set(
                (Math.random() - 0.5) * 2 * this.FLOATER_SPAWN_RADIUS,
                (Math.random() - 0.5) * 2 * this.FLOATER_SPAWN_HEIGHT + 8,
                (Math.random() - 0.5) * 2 * this.FLOATER_SPAWN_RADIUS
            );

            const baseScale = this.FLOATER_BASE_SIZE + Math.random() * this.FLOATER_SIZE_VARIATION;
            scale.set(baseScale, baseScale, baseScale);

            // Initial random rotation
            quaternion.setFromEuler(new THREE.Euler(
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2
            ));

            dummyMatrix.compose(position, quaternion, scale);
            this.floatingGeometry.setMatrixAt(i, dummyMatrix);

            // Store data for shader animation
            rotationAxis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
            randomFactors[i * 4 + 0] = rotationAxis.x;
            randomFactors[i * 4 + 1] = rotationAxis.y;
            randomFactors[i * 4 + 2] = rotationAxis.z;
            randomFactors[i * 4 + 3] = 0.5 + Math.random(); // Speed / phase factor
            baseScales[i] = baseScale;
        }

        // Add attributes
        this.floaterGeometry.setAttribute('randomFactor', new THREE.InstancedBufferAttribute(randomFactors, 4));
        this.floaterGeometry.setAttribute('baseScale', new THREE.InstancedBufferAttribute(baseScales, 1));

        this.floatingGeometry.instanceMatrix.needsUpdate = true;
        this.floatingGeometry.userData = { module: 'VCDreamEffects', type: 'floater' };
        this.floatingGeometry.castShadow = true; // Allow subtle shadows
        this.floatingGeometry.receiveShadow = true;

        scene.add(this.floatingGeometry);
        this.objects.push(this.floatingGeometry);
    }

    /**
     * Creates the ShaderMaterial for the orbs.
     * @param {object} settings
     * @private
     */
    _createOrbMaterial(settings) {
        const moodColors = settings.colors.map(c => new THREE.Color(c));

        this.orbMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0.0 },
                uMoodColors: { value: moodColors },
                uFogColor: { value: new THREE.Color(settings.fogColor || '#000000') },
                uFogNear: { value: settings.cameraDistance ? settings.cameraDistance + 5 : 20 }, // Fog closer for orbs
                uFogFar: { value: settings.cameraDistance ? settings.cameraDistance + this.ORB_SPAWN_RADIUS * 1.5 : 80 },
                uNoiseTime: { value: this.noiseTime },
                uGlobalIntensity: { value: 1.0 },
                uMovementSpeed: { value: 1.0 },
                uFluidity: { value: 0.5 },
                uDreaminess: { value: 0.5 },
                uPeakImpact: { value: 0.0 },
                uDriftSpeed: { value: this.ORB_DRIFT_SPEED },
                uCameraPos: { value: new THREE.Vector3() } // Pass camera position
            },
            vertexShader: `
                uniform highp float time;
                uniform float uNoiseTime;
                uniform float uMovementSpeed;
                uniform float uFluidity;
                uniform float uPeakImpact;
                uniform float uDriftSpeed;

                attribute vec3 basePosition;
                attribute vec3 randomFactor; // x: speedMod, y: phaseOffset, z: generic random
                attribute float baseScale;

                varying float vIntensity; // Intensity based on noise/audio for fragment
                varying vec3 vWorldPosition; // Pass world position for fragment noise

                // Simple 3D noise function (pseudo-random)
                float noise(vec3 p) {
                    return fract(sin(dot(p.xyz, vec3(12.9898, 78.233, 151.7182))) * 43758.5453 + uNoiseTime);
                }

                // FBM function
                float fbm(vec3 p) {
                    float value = 0.0;
                    float amplitude = 0.5;
                    float frequency = 1.0;
                    for (int i = 0; i < 3; ++i) { // 3 octaves for performance
                        value += amplitude * noise(p * frequency);
                        frequency *= 2.1; // Lacunarity
                        amplitude *= 0.45; // Gain
                    }
                    return value;
                }

                // Rotation matrix function (optional, if needed)
                mat3 rotationMatrix(vec3 axis, float angle) {
                    axis = normalize(axis); float s = sin(angle); float c = cos(angle); float oc = 1.0 - c;
                    return mat3(oc*axis.x*axis.x+c, oc*axis.x*axis.y-axis.z*s, oc*axis.z*axis.x+axis.y*s,
                                oc*axis.x*axis.y+axis.z*s, oc*axis.y*axis.y+c, oc*axis.y*axis.z-axis.x*s,
                                oc*axis.z*axis.x-axis.y*s, oc*axis.y*axis.z+axis.x*s, oc*axis.z*axis.z+c);
                }


                void main() {
                    float speedMod = randomFactor.x;
                    float phaseOffset = randomFactor.y;
                    float timeScaled = time * uMovementSpeed * uDriftSpeed * speedMod + phaseOffset;

                    // --- Calculate Animated Position ---
                    // Combine base drift with noise-based fluid motion
                    vec3 driftOffset = vec3(
                        sin(timeScaled * 0.3) * 0.5,
                        cos(timeScaled * 0.4) * 0.5,
                        sin(timeScaled * 0.25) * 0.5
                    );

                    // Fluid noise offset based on position and time
                    vec3 noiseInputPos = basePosition * 0.1 + vec3(0.0, 0.0, time * uMovementSpeed * 0.02);
                    vec3 fluidOffset = vec3(
                        fbm(noiseInputPos + vec3(1.0, 0.0, 0.0)),
                        fbm(noiseInputPos + vec3(0.0, 1.0, 0.0)),
                        fbm(noiseInputPos + vec3(0.0, 0.0, 1.0))
                    ) * (1.0 + uFluidity * 4.0); // Fluidity controls strength

                    vec3 animatedPosition = basePosition + driftOffset + fluidOffset;

                    // --- Calculate Animated Scale ---
                    float scalePulse = 1.0 + uPeakImpact * 0.4; // Pulse on impact
                    float noiseScaleFactor = 0.8 + fbm(basePosition * 0.2 + time * 0.1) * 0.4; // Gently vary size over time
                    float finalScale = baseScale * scalePulse * noiseScaleFactor;

                    // --- Apply transformations ---
                    // Orbs generally don't need rotation, keep simple
                    vec3 transformedVertex = position * finalScale; // Scale the vertex
                    transformedVertex += animatedPosition; // Add the final position

                    // --- Calculate Varyings ---
                    vec4 worldPos4 = instanceMatrix * vec4(transformedVertex, 1.0); // Apply instance matrix transformations
                    vWorldPosition = worldPos4.xyz;
                    vIntensity = noiseScaleFactor * (0.7 + uPeakImpact * 0.3); // Pass intensity factor

                    gl_Position = projectionMatrix * viewMatrix * worldPos4;
                }
            `,
            fragmentShader: `
                precision highp float;
                uniform vec3 uMoodColors[5];
                uniform vec3 uFogColor;
                uniform float uFogNear;
                uniform float uFogFar;
                uniform float uGlobalIntensity;
                uniform float uDreaminess;
                uniform vec3 uCameraPos; // Camera position

                varying float vIntensity;
                varying vec3 vWorldPosition;

                // Noise function (can be the same as vertex or different)
                float noise(vec3 p) {
                    return fract(sin(dot(p.xyz, vec3(12.9898, 78.233, 151.7182))) * 43758.5453);
                }
                 float fbm(vec3 p) {
                    float value = 0.0; float amplitude = 0.5; float frequency = 1.0;
                    for (int i = 0; i < 3; ++i) { value += amplitude * noise(p * frequency); frequency *= 2.1; amplitude *= 0.45; }
                    return value;
                }

                void main() {
                    // --- Calculate View Vector and Normal ---
                    vec3 viewDir = normalize(uCameraPos - vWorldPosition);
                    // For a sphere, the normal is just the normalized position relative to the center (which is vWorldPosition)
                    // However, since we are rendering points/simple geometry, we simulate a spherical normal based on view
                    vec3 pseudoNormal = viewDir; // Simplification: treat as facing camera

                    // --- Calculate Fresnel ---
                    float fresnel = pow(1.0 - clamp(dot(pseudoNormal, viewDir), 0.0, 1.0), 3.0); // Rim lighting effect

                    // --- Calculate Base Color ---
                    float colorMixFactor = clamp(fbm(vWorldPosition * 0.1) * 1.5, 0.0, 1.0); // Color variation based on noise
                    int index1 = int(floor(colorMixFactor * 4.0));
                    int index2 = min(index1 + 1, 4);
                    vec3 baseColor = mix(uMoodColors[index1], uMoodColors[index2], fract(colorMixFactor * 4.0));

                    // --- Adjust Color based on Dreaminess ---
                    vec3 dreamColor = mix(baseColor, vec3(1.0), uDreaminess * 0.3); // Mix with white for ethereal feel

                    // --- Calculate Final Color ---
                    // Combine base color, fresnel rim light, and global intensity
                    vec3 finalColor = dreamColor * vIntensity * (0.6 + uGlobalIntensity * 0.6); // Base brightness
                    finalColor += vec3(1.0) * fresnel * 0.8 * uGlobalIntensity; // Add white fresnel glow

                    // --- Calculate Alpha ---
                    // Soft falloff based on view direction (center brighter)
                    float centerFade = pow(clamp(dot(pseudoNormal, viewDir), 0.0, 1.0), 1.5); // Brighter center
                    float alpha = centerFade * vIntensity * 0.7 * uGlobalIntensity; // Base alpha
                    alpha += fresnel * 0.3 * uGlobalIntensity; // Additive alpha for rim
                    alpha = clamp(alpha, 0.0, 0.8); // Clamp max alpha

                    // --- New Final Output ---
                    gl_FragColor = vec4(finalColor, alpha); // Output color/alpha, Three.js adds fog

                    if (gl_FragColor.a < 0.01) discard;
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending, // Glowing effect
            side: THREE.FrontSide, // Only need front side for simple geometry like Icosahedron
            fog: false // Enable fog calculations
        });
    }

    /**
     * Creates the ShaderMaterial for the floaters.
     * @param {object} settings
     * @private
     */
    _createFloaterMaterial(settings) {
         const moodColors = settings.colors.map(c => new THREE.Color(c));

         this.floaterMaterial = new THREE.ShaderMaterial({
             uniforms: {
                 time: { value: 0.0 },
                 uMoodColors: { value: moodColors },
                 uFogColor: { value: new THREE.Color(settings.fogColor || '#000000') },
                 uFogNear: { value: settings.cameraDistance ? settings.cameraDistance + 10 : 30 },
                 uFogFar: { value: settings.cameraDistance ? settings.cameraDistance + this.FLOATER_SPAWN_RADIUS * 2 : 100 },
                 uNoiseTime: { value: this.noiseTime },
                 uGlobalIntensity: { value: 1.0 },
                 uMovementSpeed: { value: 1.0 }, // Affects rotation speed
                 uDreaminess: { value: 0.5 },
                 uPeakImpact: { value: 0.0 }, // Could affect scale or emissive
                 uRawMid: { value: 0.0 },     // Could affect emissive
                 uRotationSpeed: { value: this.FLOATER_ROTATION_SPEED },
                 uLightDirection: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() }, // Example light dir
                 uAmbientLight: { value: 0.2 } // Base ambient light
             },
             vertexShader: `
                 uniform highp float time;
                 uniform float uMovementSpeed;
                 uniform float uRotationSpeed;
                 uniform float uPeakImpact;

                 attribute vec4 randomFactor; // x,y,z: axis, w: speed/phase
                 attribute float baseScale;

                 varying vec3 vNormal;
                 varying float vNoiseFactor; // For subtle fragment variations
                 varying vec2 vUv;

                 // Rotation matrix function
                 mat4 rotationMatrix(vec3 axis, float angle) {
                     axis = normalize(axis); float s = sin(angle); float c = cos(angle); float oc = 1.0 - c;
                     return mat4(oc*axis.x*axis.x+c, oc*axis.x*axis.y-axis.z*s, oc*axis.z*axis.x+axis.y*s, 0.0,
                                 oc*axis.x*axis.y+axis.z*s, oc*axis.y*axis.y+c, oc*axis.y*axis.z-axis.x*s, 0.0,
                                 oc*axis.z*axis.x-axis.y*s, oc*axis.y*axis.z+axis.x*s, oc*axis.z*axis.z+c, 0.0,
                                 0.0, 0.0, 0.0, 1.0);
                 }

                 // Noise function
                 float noise(vec3 p) {
                     return fract(sin(dot(p.xyz, vec3(12.9898, 78.233, 151.7182))) * 43758.5453);
                 }

                 void main() {
                     vUv = uv;
                     float speedPhaseMod = randomFactor.w;
                     float timeScaled = time * uMovementSpeed * uRotationSpeed * speedPhaseMod;
                     vec3 rotationAxis = randomFactor.xyz;

                     // --- Calculate Animated Rotation ---
                     mat4 instanceRotation = rotationMatrix(rotationAxis, timeScaled);

                     // --- Calculate Animated Scale ---
                     float scalePulse = 1.0 + uPeakImpact * 0.15; // Subtle pulse
                     float finalScale = baseScale * scalePulse;

                     // --- Apply transformations ---
                     // Apply instance matrix first (position, initial rotation, base scale)
                     vec4 modelPos = instanceMatrix * vec4(position, 1.0);
                     // Apply animated rotation and scale pulse around the instance's origin
                     vec4 rotatedScaledPos = instanceRotation * vec4(position * finalScale, 1.0);

                     // Combine: Get instance position, apply animated rotation/scale to local vertex, then add instance pos
                     vec3 instancePosition = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
                     vec3 finalVertexPos = instancePosition + (instanceRotation * vec4(position * finalScale, 1.0)).xyz;


                     // --- Calculate Varyings ---
                     // Transform normal by combining instance rotation and animated rotation
                     // Note: Transforming normals correctly requires the inverse transpose of the upper 3x3 matrix
                     mat3 normalMatrix = transpose(inverse(mat3(modelViewMatrix * instanceMatrix * instanceRotation)));
                     vNormal = normalize(normalMatrix * normal);

                     vNoiseFactor = noise(modelPos.xyz * 0.1 + time * 0.05); // Noise for fragment

                     gl_Position = projectionMatrix * viewMatrix * vec4(finalVertexPos, 1.0);
                 }
             `,
             fragmentShader: `
                precision highp float;
                 uniform vec3 uMoodColors[5];
                 uniform vec3 uFogColor;
                 uniform float uFogNear;
                 uniform float uFogFar;
                 uniform float uGlobalIntensity;
                 uniform float uDreaminess;
                 uniform float uRawMid; // Affect emissive
                 uniform vec3 uLightDirection;
                 uniform float uAmbientLight;

                 varying vec3 vNormal;
                 varying vec2 vUv;
                 varying float vNoiseFactor; // Receive noise factor

                 void main() {
                     // --- Calculate Base Color ---
                     float colorMixFactor = clamp(vNoiseFactor * 1.5, 0.0, 1.0); // Use noise for color mix
                     int index1 = int(floor(colorMixFactor * 4.0));
                     int index2 = min(index1 + 1, 4);
                     vec3 baseColor = mix(uMoodColors[index1], uMoodColors[index2], fract(colorMixFactor * 4.0));

                     // --- Adjust Color based on Dreaminess ---
                     vec3 dreamColor = mix(baseColor, vec3(dot(baseColor, vec3(0.299, 0.587, 0.114))), uDreaminess * 0.4); // Desaturate slightly
                     dreamColor = mix(dreamColor, vec3(1.0), uDreaminess * 0.1); // Mix with white slightly

                     // --- Basic Lambertian Lighting ---
                     float diffuse = max(dot(normalize(vNormal), uLightDirection), 0.0);
                     vec3 lighting = vec3(uAmbientLight) + vec3(diffuse) * (0.5 + uGlobalIntensity * 0.5); // Modulate diffuse by intensity

                     // --- Calculate Emissive ---
                     float emissiveFactor = clamp(uRawMid * 0.5 + uDreaminess * 0.2, 0.0, 0.5); // Subtle emissive glow based on mid freq and dreaminess
                     vec3 emissive = dreamColor * emissiveFactor;

                     // --- Combine ---
                     vec3 finalColor = dreamColor * lighting + emissive;

                    // --- New Final Output ---
                    gl_FragColor = vec4(finalColor, 1.0); // Output color, Three.js adds fog

                 }
             `,
             transparent: false, // Floaters are solid
             depthWrite: true,
             side: THREE.FrontSide, // Only need front side for solid geometry
             fog: false // Enable fog calculations
         });
     }


    /**
     * Updates the dream effects based on time and visual parameters.
     * @param {number} time - The current time elapsed.
     * @param {object} visualParams - The visual parameters object from AudioVisualConnector.
     * @param {number} deltaTime - The time delta since the last frame.
     * @param {THREE.Camera} camera - The scene camera (needed for some effects).
     */
    update(time, visualParams, deltaTime, camera) {
        if (!visualParams || !camera) return; // Need params and camera

        try {
            // --- Smooth visual parameters ---
            const smoothFactor = Math.min(1.0, deltaTime * 3.0); // Adjust smoothing rate
            this.smoothedParams.movementSpeed = THREE.MathUtils.lerp(this.smoothedParams.movementSpeed, visualParams.movementSpeed || 1.0, smoothFactor);
            this.smoothedParams.fluidity = THREE.MathUtils.lerp(this.smoothedParams.fluidity, visualParams.fluidity || 0.5, smoothFactor);
            this.smoothedParams.dreaminess = THREE.MathUtils.lerp(this.smoothedParams.dreaminess, visualParams.dreaminess || 0.5, smoothFactor);
            this.smoothedParams.peakImpact = THREE.MathUtils.lerp(this.smoothedParams.peakImpact, visualParams.peakImpact || 0.0, smoothFactor * 1.5); // Faster impact
            this.smoothedParams.rawMid = THREE.MathUtils.lerp(this.smoothedParams.rawMid, visualParams.rawMid || 0.0, smoothFactor);
            this.smoothedParams.globalIntensity = THREE.MathUtils.lerp(this.smoothedParams.globalIntensity, visualParams.globalIntensity || 1.0, smoothFactor);

            // --- Update Orb Uniforms ---
            if (this.glowingOrbs && this.orbMaterial) {
                const uniforms = this.orbMaterial.uniforms;
                uniforms.time.value = time;
                uniforms.uNoiseTime.value = this.noiseTime + time * 0.05; // Evolve overall noise pattern slowly
                uniforms.uGlobalIntensity.value = this.smoothedParams.globalIntensity;
                uniforms.uMovementSpeed.value = this.smoothedParams.movementSpeed;
                uniforms.uFluidity.value = this.smoothedParams.fluidity;
                uniforms.uDreaminess.value = this.smoothedParams.dreaminess;
                uniforms.uPeakImpact.value = this.smoothedParams.peakImpact;
                uniforms.uCameraPos.value.copy(camera.position); // Update camera position for shader
            }

            // --- Update Floater Uniforms ---
            if (this.floatingGeometry && this.floaterMaterial) {
                const uniforms = this.floaterMaterial.uniforms;
                uniforms.time.value = time;
                uniforms.uNoiseTime.value = this.noiseTime + time * 0.03;
                uniforms.uGlobalIntensity.value = this.smoothedParams.globalIntensity;
                uniforms.uMovementSpeed.value = this.smoothedParams.movementSpeed;
                uniforms.uDreaminess.value = this.smoothedParams.dreaminess;
                uniforms.uPeakImpact.value = this.smoothedParams.peakImpact;
                uniforms.uRawMid.value = this.smoothedParams.rawMid;
                // Update light direction if needed (e.g., if main light source moves)
                // uniforms.uLightDirection.value.copy(mainLightDirection);
            }

            // Note: Instance matrix updates are generally avoided here for performance.
            // All animation is handled within the shaders using time and attributes.

        } catch (error) {
            console.error("VCDreamEffects: Error during update:", error);
            if (typeof ToastSystem !== 'undefined') ToastSystem.notify('error', 'Dream Effects update error.');
            // Consider disabling module on repeated errors
        }
    }

    /**
     * Removes all objects created by this module from the scene and disposes of their resources.
     * @param {THREE.Scene} scene - The main Three.js scene.
     */
    dispose(scene) {
        console.log("VCDreamEffects: Disposing objects...");
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
                     // If obj is the InstancedMesh itself, its geometry/material are handled above
                     if (obj.isInstancedMesh) {
                         // Already handled via geometry/material checks
                     }
                }
            } catch (e) {
                console.error("VCDreamEffects: Error disposing object:", obj, e);
            }
        });
        console.log(`VCDreamEffects: Disposed ${disposedCount} resources.`);

        // Clear internal state
        this.objects = [];
        this.glowingOrbs = null;
        this.floatingGeometry = null;
        this.orbMaterial = null;
        this.floaterMaterial = null;
        this.orbGeometry = null;
        this.floaterGeometry = null;
    }
}

// Make globally accessible if required by the project structure
window.VCDreamEffects = VCDreamEffects;