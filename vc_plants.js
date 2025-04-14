// vc_plants.js - Visual Canvas Module for Dynamic Plant Life
// Part of the Harmonic Visions project by FatStinkyPanda
// Copyright (c) 2025 FatStinkyPanda - All rights reserved.

/**
 * @class VCPlants
 * @description Manages the creation, animation, and disposal of dynamic,
 *              audio-reactive plant-like elements in the scene. Adapts density,
 *              appearance, and behavior based on the current mood and audio input.
 *              Utilizes InstancedMesh for performance.
 */
class VCPlants {
    constructor() {
        // --- Configuration ---
        this.MODULE_ID = 'VCPlants';
        this.BASE_INSTANCE_COUNT = 100; // Start lower for plants
        this.MAX_INSTANCE_COUNT = 800;  // Max instances, balance between density and performance
        this.SPAWN_RADIUS_FACTOR = 0.6; // Relative to landscape size (assuming landscape is ~100 units wide)
        this.SPAWN_AREA_WIDTH = 100 * this.SPAWN_RADIUS_FACTOR; // Match landscape size assumption
        this.SPAWN_AREA_DEPTH = 100 * this.SPAWN_RADIUS_FACTOR;
        this.BASE_PLANT_HEIGHT = 1.5;
        this.HEIGHT_VARIATION = 2.5;
        this.BASE_PLANT_WIDTH = 0.1;
        this.WIDTH_VARIATION = 0.15;
        this.SWAY_SPEED_BASE = 0.3;
        this.SWAY_INTENSITY_BASE = 0.05;

        // --- State ---
        this.plants = null;             // THREE.InstancedMesh
        this.geometry = null;           // THREE.BufferGeometry (base shape)
        this.material = null;           // THREE.ShaderMaterial
        this.objects = [];              // Tracks THREE objects for disposal (mesh, geom, material)
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
            globalIntensity: 1.0,
        };
        this.noiseTime = Math.random() * 500; // Unique noise offset

        console.log(`${this.MODULE_ID} module created`);
    }

    /**
     * Initializes the plant system for the current mood.
     * @param {THREE.Scene} scene - The main Three.js scene.
     * @param {object} settings - The mood-specific settings object from data.js.
     * @param {string} mood - The current mood string.
     */
    init(scene, settings, mood) {
        // --- Pre-checks ---
        if (!scene || !settings || !settings.colors || !THREE) {
            console.error(`${this.MODULE_ID}: Scene, settings, settings.colors, or THREE library missing for initialization.`);
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', 'Plant system initialization failed: Missing dependencies.');
            }
            return;
        }
        this.currentMood = mood || 'calm';
        const complexity = settings.complexity || 0.5;

        // --- Cleanup ---
        this.dispose(scene); // Dispose previous instances first
        console.log(`${this.MODULE_ID}: Initializing for mood '${this.currentMood}'...`);

        try {
            // --- Determine Instance Count ---
            const instanceCount = Math.floor(
                this.BASE_INSTANCE_COUNT + (this.MAX_INSTANCE_COUNT - this.BASE_INSTANCE_COUNT) * complexity
            );
            console.log(`${this.MODULE_ID}: Instance count: ${instanceCount}`);
            if (instanceCount <= 0) {
                console.warn(`${this.MODULE_ID}: Instance count is zero or less, skipping initialization.`);
                this.isEnabled = false;
                return;
            }

            // --- Geometry (Simple Blade/Stem) ---
            this._createBaseGeometry();
            if (!this.geometry) throw new Error("Failed to create base plant geometry.");
            this.objects.push(this.geometry);

            // --- Material ---
            this._createPlantMaterial(settings);
            if (!this.material) throw new Error("Failed to create plant material.");
            this.objects.push(this.material);

            // --- Instanced Mesh ---
            this.plants = new THREE.InstancedMesh(this.geometry, this.material, instanceCount);
            this.plants.instanceMatrix.setUsage(THREE.DynamicDrawUsage); // Essential for updates if needed, though shader handles most

            // --- Generate Instance Attributes ---
            this._generateInstanceAttributes(instanceCount, settings);

            this.plants.userData = { module: this.MODULE_ID };
            this.plants.castShadow = true; // Plants can cast subtle shadows
            this.plants.receiveShadow = true;
            this.plants.frustumCulled = true; // Enable culling for performance

            scene.add(this.plants);
            this.objects.push(this.plants);
            this.isEnabled = true; // Mark as enabled after successful init

            console.log(`${this.MODULE_ID}: Initialized successfully for mood '${this.currentMood}'.`);

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during initialization for mood '${this.currentMood}':`, error);
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', `Plant system failed to initialize: ${error.message}`);
            }
            this.dispose(scene); // Cleanup on error
            this.isEnabled = false;
        }
    }

    /**
     * Creates the base BufferGeometry for a single plant instance (e.g., a blade of grass).
     * @private
     */
    _createBaseGeometry() {
        this.geometry = new THREE.BufferGeometry();
        const segments = 4; // Number of vertical segments for the blade
        const vertices = [];
        const uvs = [];
        const heightFactors = []; // Store factor (0 to 1) along the height for shader manipulation

        for (let i = 0; i <= segments; i++) {
            const y = i / segments; // Normalized height (0 to 1)
            const widthFactor = Math.sin(y * Math.PI); // Wider at the middle, thin at ends

            // Left vertex
            vertices.push(-0.5 * widthFactor, y, 0);
            uvs.push(0, y);
            heightFactors.push(y);

            // Right vertex
            vertices.push(0.5 * widthFactor, y, 0);
            uvs.push(1, y);
            heightFactors.push(y);
        }

        const indices = [];
        for (let i = 0; i < segments; i++) {
            const i2 = i * 2;
            // Triangle 1
            indices.push(i2, i2 + 1, i2 + 2);
            // Triangle 2
            indices.push(i2 + 1, i2 + 3, i2 + 2);
        }

        this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        this.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        this.geometry.setAttribute('heightFactor', new THREE.Float32BufferAttribute(heightFactors, 1)); // For shader use
        this.geometry.setIndex(indices);
        this.geometry.computeVertexNormals(); // Compute basic normals
    }

    /**
     * Creates the ShaderMaterial for the plant instances.
     * @param {object} settings - Mood settings.
     * @private
     */
    _createPlantMaterial(settings) {
        const moodColors = settings.colors.map(c => new THREE.Color(c));

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0.0 },
                uMoodColors: { value: moodColors },
                uNoiseTime: { value: this.noiseTime },
                uSwaySpeedBase: { value: this.SWAY_SPEED_BASE },
                uSwayIntensityBase: { value: this.SWAY_INTENSITY_BASE },
                // Audio/Visual Params
                uGlobalIntensity: { value: 1.0 },
                uMovementSpeed: { value: 1.0 },
                uFluidity: { value: 0.5 },
                uDreaminess: { value: 0.5 },
                uPeakImpact: { value: 0.0 },
                uRawBass: { value: 0.0 },
                // Fog Params
                uFogColor: { value: new THREE.Color(settings.fogColor || '#000000') },
                uFogNear: { value: settings.cameraDistance ? settings.cameraDistance : 10 },
                uFogFar: { value: settings.cameraDistance ? settings.cameraDistance + this.SPAWN_AREA_WIDTH * 1.2 : 80 },
                // Lighting (Simple)
                uLightDirection: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
                uAmbientLight: { value: 0.3 },
            },
            vertexShader: `
                attribute vec3 colorTint; // Receive color tint per instance
                attribute vec4 randomFactor; // x: swaySpeedMod, y: swayPhase, z: heightScale, w: widthScale
                attribute float heightFactor; // Normalized height along the blade (0=base, 1=tip)

                uniform highp float time;
                uniform float uNoiseTime;
                uniform float uSwaySpeedBase;
                uniform float uSwayIntensityBase;
                // Audio/Visual Params
                uniform float uMovementSpeed;
                uniform float uFluidity; // Affects sway randomness/intensity
                uniform float uPeakImpact; // Affects temporary scale/bend
                uniform float uRawBass;    // Affects subtle scale pulsing

                varying vec3 vColor;
                varying vec3 vNormal;
                varying float vWorldHeightFactor; // Pass height factor adjusted by instance scale

                // Simple noise function
                float noise(vec2 p) {
                    return fract(sin(dot(p.xy, vec2(12.9898 + uNoiseTime, 78.233))) * 43758.5453);
                }

                // Rotation matrix function
                mat3 rotationMatrix(vec3 axis, float angle) {
                    axis = normalize(axis); float s = sin(angle); float c = cos(angle); float oc = 1.0 - c;
                    return mat3(oc*axis.x*axis.x+c, oc*axis.x*axis.y-axis.z*s, oc*axis.z*axis.x+axis.y*s,
                                oc*axis.x*axis.y+axis.z*s, oc*axis.y*axis.y+c, oc*axis.y*axis.z-axis.x*s,
                                oc*axis.z*axis.x-axis.y*s, oc*axis.y*axis.z+axis.x*s, oc*axis.z*axis.z+c);
                }

                void main() {
                    vColor = colorTint; // Pass instance color tint
                    float swaySpeedMod = randomFactor.x;
                    float swayPhase = randomFactor.y;
                    float heightScale = randomFactor.z;
                    float widthScale = randomFactor.w;
                    vWorldHeightFactor = heightFactor * heightScale; // Store world-scaled height factor

                    // --- Calculate Sway ---
                    float timeScaled = time * uMovementSpeed;
                    float swaySpeed = uSwaySpeedBase * swaySpeedMod;
                    float swayIntensity = uSwayIntensityBase * (1.0 + uFluidity * 2.0); // Fluidity increases sway intensity

                    // Sway amount increases towards the tip (using heightFactor)
                    float swayAngleX = sin(timeScaled * swaySpeed + swayPhase) * swayIntensity * heightFactor;
                    float swayAngleZ = cos(timeScaled * swaySpeed * 0.7 + swayPhase + 1.57) * swayIntensity * 0.7 * heightFactor; // Slightly different phase/speed for Z

                    // Random subtle turbulence based on fluidity and position
                    float turbulenceFactor = uFluidity * heightFactor * 0.3;
                    swayAngleX += (noise(position.xz * 0.5 + timeScaled * 0.1) - 0.5) * turbulenceFactor;
                    swayAngleZ += (noise(position.yx * 0.5 + timeScaled * 0.1 + 5.0) - 0.5) * turbulenceFactor;

                    // --- Calculate Scale ---
                    // Base scale from attributes
                    vec3 scaledPosition = position;
                    scaledPosition.y *= heightScale; // Apply height scale
                    scaledPosition.x *= widthScale;  // Apply width scale

                    // Audio reactivity: subtle pulsing with bass, stronger bend/scale on peak impact
                    float bassPulse = 1.0 + uRawBass * 0.05 * heightFactor; // Subtle base pulse stronger at tip
                    float impactScale = 1.0 + uPeakImpact * 0.3 * heightFactor; // Scale up more at tip on impact
                    float impactBend = uPeakImpact * 0.2 * heightFactor; // Bend more at tip on impact
                    swayAngleX += impactBend; // Add impact bend

                    scaledPosition *= bassPulse * impactScale;

                    // --- Apply Transformations ---
                    // Apply sway rotation (around the base of the vertex, effectively)
                    mat3 swayRotation = rotationMatrix(vec3(0.0, 0.0, 1.0), swayAngleX) * rotationMatrix(vec3(1.0, 0.0, 0.0), swayAngleZ);
                    vec3 transformedPosition = swayRotation * scaledPosition;

                    // --- Final Position and Normal ---
                    vec4 worldPosition = instanceMatrix * vec4(transformedPosition, 1.0);
                    vec4 mvPosition = modelViewMatrix * worldPosition;

                    // Transform normal: Apply instance rotation + sway rotation
                    mat3 normalMatrix = transpose(inverse(mat3(modelViewMatrix * instanceMatrix * swayRotation)));
                    vNormal = normalize(normalMatrix * normal); // Pass world normal to fragment

                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                precision highp float;
                uniform vec3 uMoodColors[5];
                uniform float uGlobalIntensity;
                uniform float uDreaminess;
                // Fog
                uniform vec3 uFogColor;
                uniform float uFogNear;
                uniform float uFogFar;
                // Lighting
                uniform vec3 uLightDirection;
                uniform float uAmbientLight;

                varying vec3 vColor; // Instance color tint
                varying vec3 vNormal;
                varying float vWorldHeightFactor; // Height factor from base (0) to tip (scaled height)

                void main() {
                    // --- Calculate Base Color ---
                    // Use instance tint, maybe slightly modify based on height
                    vec3 baseColor = vColor;
                    // Example: slightly darker/desaturated near the base
                    baseColor = mix(baseColor * 0.8, baseColor, smoothstep(0.0, 0.3, vWorldHeightFactor));

                    // --- Apply Dreaminess ---
                    // Fade color towards a lighter shade or desaturate
                    vec3 dreamColor = mix(baseColor, vec3(1.0), uDreaminess * 0.15);
                    dreamColor = mix(dreamColor, vec3(dot(dreamColor, vec3(0.299, 0.587, 0.114))), uDreaminess * 0.2); // Desaturate

                    // --- Simple Lighting ---
                    float diffuse = max(dot(normalize(vNormal), uLightDirection), 0.0);
                    vec3 lighting = vec3(uAmbientLight) + vec3(diffuse * (0.6 + uGlobalIntensity * 0.4));
                    lighting = clamp(lighting, 0.0, 1.0);

                    // --- Final Color ---
                    vec3 finalColor = dreamColor * lighting * uGlobalIntensity;

                    // // --- Apply Fog ---
                    // float depth = gl_FragCoord.z / gl_FragCoord.w;
                    // float fogFactor = smoothstep(uFogNear, uFogFar, depth);

                    // gl_FragColor = vec4(mix(finalColor, uFogColor, fogFactor), 1.0); // Opaque plants

                    // --- New Final Output ---
                    gl_FragColor = vec4(finalColor, 1.0); // Output color, Three.js adds fog

                }
            `,
            side: THREE.DoubleSide, // Render both sides of the blade
            transparent: false,
            depthWrite: true,
            fog: false // Enable fog uniforms
        });
    }

    /**
     * Generates and sets the instance attributes for the plants.
     * @param {number} count - The number of instances.
     * @param {object} settings - Mood settings.
     * @private
     */
    _generateInstanceAttributes(count, settings) {
        if (!this.plants || !this.geometry) return;

        const basePositions = new Float32Array(count * 3);
        const colorTints = new Float32Array(count * 3);
        const randomFactors = new Float32Array(count * 4); // x: swaySpeedMod, y: swayPhase, z: heightScale, w: widthScale

        const moodColors = settings.colors.map(c => new THREE.Color(c));
        const dummyMatrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion(); // Base rotation
        const scale = new THREE.Vector3(1, 1, 1); // Scale handled in shader via attributes now

        for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            const i4 = i * 4;

            // --- Position ---
            // Scatter within the defined area, slightly offset Y to sit on terrain (adjust base Y as needed)
            position.set(
                (Math.random() - 0.5) * this.SPAWN_AREA_WIDTH,
                -7.5, // Adjust this based on landscape height, assuming landscape is around y=-8
                (Math.random() - 0.5) * this.SPAWN_AREA_DEPTH
            );

            // --- Color Tint ---
            // Select a base color from the mood and add slight variation
            const baseColorIndex = Math.floor(Math.random() * moodColors.length);
            const tintColor = moodColors[baseColorIndex].clone();
            tintColor.offsetHSL( (Math.random() - 0.5) * 0.05, // Hue variation
                                 (Math.random() - 0.5) * 0.1,  // Saturation variation
                                 (Math.random() - 0.5) * 0.1); // Lightness variation
            colorTints[i3 + 0] = tintColor.r;
            colorTints[i3 + 1] = tintColor.g;
            colorTints[i3 + 2] = tintColor.b;

            // --- Random Factors ---
            const heightScale = this.BASE_PLANT_HEIGHT + Math.random() * this.HEIGHT_VARIATION;
            const widthScale = this.BASE_PLANT_WIDTH + Math.random() * this.WIDTH_VARIATION;
            randomFactors[i4 + 0] = 0.7 + Math.random() * 0.6;      // Sway speed modifier (0.7 - 1.3)
            randomFactors[i4 + 1] = Math.random() * Math.PI * 2;      // Sway phase offset
            randomFactors[i4 + 2] = heightScale;                     // Store height scale
            randomFactors[i4 + 3] = widthScale;                      // Store width scale

            // --- Instance Matrix (Position and Base Rotation) ---
            // Random base rotation around Y axis
            quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
            dummyMatrix.compose(position, quaternion, scale); // Use scale=1 here, actual scale done in shader
            this.plants.setMatrixAt(i, dummyMatrix);
        }

        // Set geometry attributes
        this.geometry.setAttribute('basePosition', new THREE.InstancedBufferAttribute(basePositions, 3)); // Might not be needed if matrix holds position
        this.geometry.setAttribute('colorTint', new THREE.InstancedBufferAttribute(colorTints, 3));
        this.geometry.setAttribute('randomFactor', new THREE.InstancedBufferAttribute(randomFactors, 4));

        this.plants.instanceMatrix.needsUpdate = true;
        // Mark attribute buffers as needing update
        // this.geometry.attributes.basePosition.needsUpdate = true; // If used
        this.geometry.attributes.colorTint.needsUpdate = true;
        this.geometry.attributes.randomFactor.needsUpdate = true;
    }


    /**
     * Updates the plant system uniforms based on time and visual parameters.
     * @param {number} time - The current time elapsed.
     * @param {object} visualParams - The visual parameters object from AudioVisualConnector.
     * @param {number} deltaTime - The time delta since the last frame.
     */
    update(time, visualParams, deltaTime) {
        if (!this.isEnabled || !this.plants || !this.material || !visualParams) return;

        try {
            // --- Smooth visual parameters ---
            const smoothFactor = Math.min(1.0, deltaTime * 4.0); // Adjust smoothing rate
            this.smoothedParams.movementSpeed = THREE.MathUtils.lerp(this.smoothedParams.movementSpeed, visualParams.movementSpeed || 1.0, smoothFactor);
            this.smoothedParams.fluidity = THREE.MathUtils.lerp(this.smoothedParams.fluidity, visualParams.fluidity || 0.5, smoothFactor);
            this.smoothedParams.dreaminess = THREE.MathUtils.lerp(this.smoothedParams.dreaminess, visualParams.dreaminess || 0.5, smoothFactor);
            this.smoothedParams.peakImpact = THREE.MathUtils.lerp(this.smoothedParams.peakImpact, visualParams.peakImpact || 0.0, smoothFactor * 1.5); // Faster impact
            this.smoothedParams.rawBass = THREE.MathUtils.lerp(this.smoothedParams.rawBass, visualParams.rawBass || 0.0, smoothFactor);
            this.smoothedParams.globalIntensity = THREE.MathUtils.lerp(this.smoothedParams.globalIntensity, visualParams.globalIntensity || 1.0, smoothFactor);

            // --- Update Shader Uniforms ---
            const uniforms = this.material.uniforms;
            uniforms.time.value = time;
            uniforms.uNoiseTime.value = this.noiseTime + time * 0.02; // Slowly evolve base noise pattern
            // Pass smoothed audio/visual params
            uniforms.uGlobalIntensity.value = this.smoothedParams.globalIntensity;
            uniforms.uMovementSpeed.value = this.smoothedParams.movementSpeed;
            uniforms.uFluidity.value = this.smoothedParams.fluidity;
            uniforms.uDreaminess.value = this.smoothedParams.dreaminess;
            uniforms.uPeakImpact.value = this.smoothedParams.peakImpact;
            uniforms.uRawBass.value = this.smoothedParams.rawBass;

            // Update light direction if necessary (e.g., if main light moves)
            // uniforms.uLightDirection.value.copy(...);

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during update:`, error);
            if (typeof ToastSystem !== 'undefined') ToastSystem.notify('error', 'Plant system update error.');
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
                        // Dispose shader textures if any (currently none used)
                        obj.material.dispose();
                        disposedCount++;
                    }
                    // If obj is the InstancedMesh itself, its geometry/material are handled above
                }
            } catch (e) {
                console.error(`${this.MODULE_ID}: Error disposing object:`, obj, e);
            }
        });
        console.log(`${this.MODULE_ID}: Disposed ${disposedCount} resources.`);

        // Clear internal state
        this.objects = [];
        this.plants = null;
        this.geometry = null;
        this.material = null;
    }
}

// Make globally accessible if required by the project structure
window.VCPlants = VCPlants;