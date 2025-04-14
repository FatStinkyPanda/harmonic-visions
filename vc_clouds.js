// vc_clouds.js - Visual Canvas Module for Dynamic Volumetric Clouds
// Part of the Harmonic Visions project by FatStinkyPanda
// Copyright (c) 2025 FatStinkyPanda - All rights reserved.

/**
 * @class VCClouds
 * @description Manages dynamic, audio-reactive volumetric cloud formations using InstancedMesh.
 *              Creates a unique cloudscape for each initialization and mood.
 */
class VCClouds {
    constructor() {
        // --- Configuration ---
        this.BASE_INSTANCE_COUNT = 150; // Base number of cloud particles/instances
        this.MAX_INSTANCE_COUNT = 500;  // Maximum instances for high complexity/performance
        this.CLOUD_VOLUME_RADIUS = 50;  // Radius of the area where clouds spawn
        this.CLOUD_VOLUME_HEIGHT = 20;  // Vertical spread of clouds
        this.BASE_PARTICLE_SIZE = 3.0;  // Base size of individual cloud particles
        this.SIZE_VARIATION = 4.0;      // Random variation in particle size
        this.DRIFT_SPEED_FACTOR = 0.05; // Controls base drift speed
        this.SWIRL_INTENSITY = 0.8;     // Controls the intensity of swirling motion
        this.OPACITY_BASE = 0.1;        // Minimum opacity
        this.OPACITY_RANGE = 0.3;       // Max additional opacity based on noise/audio

        // --- State ---
        this.cloudInstances = null;     // THREE.InstancedMesh object
        this.instanceMaterial = null;   // THREE.ShaderMaterial reference
        this.instanceGeometry = null;   // THREE.BufferGeometry reference (e.g., BoxGeometry)
        this.objects = [];              // Tracks all THREE objects created by this module (mesh, geometry, material)
        this.currentMood = 'calm';      // Track the current mood

        // --- Internal Animation/Reactivity State ---
        this.smoothedParams = {         // Store smoothed visual parameters locally
            movementSpeed: 1.0,
            fluidity: 0.5,
            dreaminess: 0.5,
            rawMid: 0.0,
            peakImpact: 0.0,
            globalIntensity: 1.0
        };
        this.noiseOffset = new THREE.Vector3(Math.random() * 100, Math.random() * 100, Math.random() * 100); // Random offset for noise uniqueness

        console.log("VCClouds module created");
    }

    /**
     * Initializes the cloud system based on the current mood settings.
     * @param {THREE.Scene} scene - The main Three.js scene.
     * @param {object} settings - The mood-specific settings object from data.js.
     * @param {string} mood - The current mood string (used for settings lookup if needed).
     */
    init(scene, settings, mood) {
        // --- Pre-checks ---
        if (!scene || !settings || !settings.colors || !THREE) {
            console.error("VCClouds: Scene, settings, settings.colors, or THREE library missing for initialization.");
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', 'Cloud system initialization failed: Missing dependencies.');
            }
            return;
        }
        if (!settings.complexity || !settings.speed) {
             console.warn("VCClouds: Settings object missing complexity or speed properties. Using defaults.");
             settings = { ...settings, complexity: 0.5, speed: 0.6 }; // Provide defaults
        }
        this.currentMood = mood || 'calm';

        // --- Cleanup ---
        this.dispose(scene);
        console.log(`VCClouds: Initializing for mood '${this.currentMood}'...`);

        try {
            // --- Determine Instance Count ---
            const instanceCount = Math.floor(
                THREE.MathUtils.lerp(
                    this.BASE_INSTANCE_COUNT,
                    this.MAX_INSTANCE_COUNT,
                    settings.complexity // Use mood complexity
                )
            );
            console.log(`VCClouds: Instance count: ${instanceCount}`);

            // --- Geometry & Material ---
            // Use simple BoxGeometry for instances - very cheap
            this.instanceGeometry = new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
            this.objects.push(this.instanceGeometry); // Track for disposal

            this._createInstanceMaterial(settings); // Create the ShaderMaterial
            if (!this.instanceMaterial) {
                throw new Error("Failed to create instance material."); // Critical failure
            }
            this.objects.push(this.instanceMaterial); // Track material

            // --- Instanced Mesh ---
            this.cloudInstances = new THREE.InstancedMesh(this.instanceGeometry, this.instanceMaterial, instanceCount);
            this.cloudInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage); // Important for potential updates

            // --- Generate Instance Data ---
            const basePositions = new Float32Array(instanceCount * 3); // Store initial spawn position
            const randomFactors = new Float32Array(instanceCount * 3); // Store random factors for animation offsets (x, y, z)
            const scales = new Float32Array(instanceCount);            // Store base scales

            const dummyMatrix = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const rotation = new THREE.Euler();
            const quaternion = new THREE.Quaternion();
            const scale = new THREE.Vector3();

            for (let i = 0; i < instanceCount; i++) {
                // Position within a flattened spherical volume
                const radius = Math.random() * this.CLOUD_VOLUME_RADIUS;
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos(2 * Math.random() - 1); // Uniform spherical angle

                position.set(
                    radius * Math.sin(phi) * Math.cos(theta),
                    (Math.random() - 0.5) * this.CLOUD_VOLUME_HEIGHT + 10, // Centered slightly higher
                    radius * Math.sin(phi) * Math.sin(theta)
                );

                // Random rotation
                rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
                quaternion.setFromEuler(rotation);

                // Random base scale
                const baseScale = this.BASE_PARTICLE_SIZE + Math.random() * this.SIZE_VARIATION;
                scale.set(baseScale, baseScale, baseScale);

                // Compose matrix (will be updated primarily in shader)
                dummyMatrix.compose(position, quaternion, scale);
                this.cloudInstances.setMatrixAt(i, dummyMatrix);

                // Store data for shaders/updates if needed (though we aim for shader animation)
                basePositions[i * 3 + 0] = position.x;
                basePositions[i * 3 + 1] = position.y;
                basePositions[i * 3 + 2] = position.z;

                randomFactors[i * 3 + 0] = Math.random() * 2.0 - 1.0; // -1 to 1
                randomFactors[i * 3 + 1] = Math.random() * 2.0 - 1.0;
                randomFactors[i * 3 + 2] = Math.random(); // 0 to 1 (e.g., for phase offset)

                scales[i] = baseScale;
            }

            // Add attributes to geometry (can be read in vertex shader)
            this.instanceGeometry.setAttribute('basePosition', new THREE.InstancedBufferAttribute(basePositions, 3));
            this.instanceGeometry.setAttribute('randomFactor', new THREE.InstancedBufferAttribute(randomFactors, 3));
            this.instanceGeometry.setAttribute('baseScale', new THREE.InstancedBufferAttribute(scales, 1));


            this.cloudInstances.instanceMatrix.needsUpdate = true;
            this.cloudInstances.userData = { module: 'VCClouds' };
            this.cloudInstances.frustumCulled = false; // Prevent culling issues with large spread/shader animation

            scene.add(this.cloudInstances);
            this.objects.push(this.cloudInstances); // Track mesh

            console.log(`VCClouds: Initialized successfully for mood '${this.currentMood}'.`);

        } catch (error) {
            console.error(`VCClouds: Error during initialization for mood '${this.currentMood}':`, error);
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', `Cloud system failed to initialize: ${error.message}`);
            }
            // Attempt cleanup in case of partial initialization
            this.dispose(scene);
        }
    }

    /**
     * Creates the ShaderMaterial for the cloud instances.
     * @param {object} settings - The mood-specific settings object.
     * @private
     */
    _createInstanceMaterial(settings) {
        const moodColors = settings.colors.map(c => new THREE.Color(c));

        this.instanceMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0.0 },
                uMoodColors: { value: moodColors },
                uFogColor: { value: new THREE.Color(settings.fogColor || '#000000') },
                uFogNear: { value: settings.cameraDistance ? settings.cameraDistance + 10 : 40 },
                uFogFar: { value: settings.cameraDistance ? settings.cameraDistance + this.CLOUD_VOLUME_RADIUS * 2 : 150 },
                uNoiseOffset: { value: this.noiseOffset },
                uGlobalIntensity: { value: 1.0 },
                uMovementSpeed: { value: 1.0 },
                uFluidity: { value: 0.5 },
                uDreaminess: { value: 0.5 },
                uPeakImpact: { value: 0.0 },
                uRawMid: { value: 0.0 },
                uOpacityBase: { value: this.OPACITY_BASE },
                uOpacityRange: { value: this.OPACITY_RANGE },
                uSwirlIntensity: { value: this.SWIRL_INTENSITY },
                uDriftSpeedFactor: { value: this.DRIFT_SPEED_FACTOR }
            },
            vertexShader: `
                uniform highp float time;
                uniform vec3 uNoiseOffset;
                uniform float uMovementSpeed;
                uniform float uFluidity; // Controls randomness/swirl of movement
                uniform float uPeakImpact; // Reactivity
                uniform float uSwirlIntensity;
                uniform float uDriftSpeedFactor;

                // Instance Attributes
                attribute vec3 basePosition;
                attribute vec3 randomFactor; // x, y for swirl offset, z for phase/speed mod
                attribute float baseScale;

                varying vec3 vWorldPosition;
                varying float vNoiseInput; // Value to feed into fragment noise based on position/time
                varying float vScaleFactor; // Pass scale modification for alpha calculation

                // Simple pseudo-random function (different from fragment)
                float rand(vec2 co){
                    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
                }

                // Rotation matrix function
                mat3 rotationMatrix(vec3 axis, float angle) {
                    axis = normalize(axis);
                    float s = sin(angle);
                    float c = cos(angle);
                    float oc = 1.0 - c;

                    return mat3(oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,
                                oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,
                                oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c);
                }

                void main() {
                    vUv = uv;

                    // --- Calculate Animated Instance Position ---
                    float timeScaled = time * uMovementSpeed * uDriftSpeedFactor;
                    float phaseOffset = randomFactor.z * 2.0 * 3.14159; // Use randomFactor.z for phase
                    float speedMod = 0.8 + randomFactor.z * 0.4; // Use randomFactor.z for speed variation

                    // Base drift (slow horizontal movement)
                    vec3 driftOffset = vec3(timeScaled * speedMod, 0.0, 0.0);

                    // Swirling motion (more complex, based on fluidity)
                    float swirlAngle = timeScaled * speedMod * 0.5 + phaseOffset;
                    float swirlRadius = uSwirlIntensity * (1.0 + uFluidity * 2.0) * (1.0 + sin(swirlAngle * 0.5 + randomFactor.x * 3.0) * 0.5); // Dynamic radius
                    vec3 swirlOffset = vec3(
                        cos(swirlAngle + randomFactor.x * 3.14) * swirlRadius,
                        sin(timeScaled * speedMod * 0.3 + phaseOffset) * uSwirlIntensity * 2.0 * uFluidity, // Vertical oscillation
                        sin(swirlAngle + randomFactor.y * 3.14) * swirlRadius
                    );

                    // Combine base position, drift, and swirl
                    vec3 animatedPosition = basePosition + driftOffset + swirlOffset * (0.5 + uFluidity * 0.5); // Fluidity affects swirl amount

                    // --- Calculate Animated Instance Scale ---
                    // Puff up slightly on peak impact
                    float scalePulse = 1.0 + uPeakImpact * 0.3;
                    float finalScale = baseScale * scalePulse;
                    vScaleFactor = scalePulse; // Pass to fragment

                    // --- Calculate Animated Instance Rotation (Subtle) ---
                    // Rotate based on time and random factors for subtle tumbling
                    float rotAngleX = timeScaled * 0.1 * speedMod + randomFactor.x * 3.14;
                    float rotAngleY = timeScaled * 0.08 * speedMod + randomFactor.y * 3.14;
                    mat3 instanceRotation = rotationMatrix(normalize(vec3(randomFactor.x, 1.0, randomFactor.y)), rotAngleY) *
                                            rotationMatrix(normalize(vec3(1.0, randomFactor.y, randomFactor.x)), rotAngleX);

                    // --- Apply transformations ---
                    vec3 transformedVertex = instanceRotation * (position * finalScale); // Rotate and scale the vertex
                    transformedVertex += animatedPosition; // Add the final position

                    // --- Calculate Varyings ---
                    vec4 worldPos4 = modelMatrix * vec4(transformedVertex, 1.0); // Use modelMatrix (InstancedMesh world matrix)
                    vWorldPosition = worldPos4.xyz;
                    // Noise input based on world pos and time, slightly perturbed by random factor
                    vNoiseInput = length(vWorldPosition.xz * 0.05 + uNoiseOffset.xz + randomFactor.xy * 0.1);

                    // --- Final Position ---
                    gl_Position = projectionMatrix * viewMatrix * worldPos4; // Use viewMatrix directly
                }
            `,
            fragmentShader: `
                precision highp float;
                uniform highp float time;
                uniform vec3 uMoodColors[5];
                uniform vec3 uFogColor;
                uniform float uFogNear;
                uniform float uFogFar;
                uniform vec3 uNoiseOffset;
                uniform float uGlobalIntensity;
                uniform float uDreaminess; // Controls color saturation/mix
                uniform float uRawMid;     // Audio reactivity
                uniform float uOpacityBase;
                uniform float uOpacityRange;

                varying vec3 vWorldPosition;
                varying float vNoiseInput; // Base noise input from vertex shader
                varying float vScaleFactor; // Scale factor passed from vertex
                varying vec2 vUv;

                // Fractional Brownian Motion (FBM) - 3D Noise function (Simplex or Perlin ideally, fallback to pseudo-random)
                // Using a simpler pseudo-random pattern for performance / no external libs needed
                float rand(vec3 co){
                    return fract(sin(dot(co.xyz ,vec3(12.9898,78.233, 54.321))) * 43758.5453);
                }

                float noise(vec3 p) {
                    vec3 i = floor(p);
                    vec3 f = fract(p);
                    f = f*f*(3.0-2.0*f); // Smoothstep interpolation factor

                    float v1 = rand(i + vec3(0,0,0));
                    float v2 = rand(i + vec3(1,0,0));
                    float v3 = rand(i + vec3(0,1,0));
                    float v4 = rand(i + vec3(1,1,0));
                    float v5 = rand(i + vec3(0,0,1));
                    float v6 = rand(i + vec3(1,0,1));
                    float v7 = rand(i + vec3(0,1,1));
                    float v8 = rand(i + vec3(1,1,1));

                    // Interpolate bottom face
                    float b1 = mix(v1, v2, f.x);
                    float b2 = mix(v3, v4, f.x);
                    float bottom = mix(b1, b2, f.y);

                    // Interpolate top face
                    float t1 = mix(v5, v6, f.x);
                    float t2 = mix(v7, v8, f.y);
                    float top = mix(t1, t2, f.y);

                    // Interpolate between faces
                    return mix(bottom, top, f.z);
                }


                float fbm(vec3 p) {
                    float value = 0.0;
                    float amplitude = 0.5;
                    float frequency = 1.0;
                    for (int i = 0; i < 4; ++i) { // 4 Octaves
                        value += amplitude * noise(p * frequency + uNoiseOffset);
                        frequency *= 2.0; // Lacunarity
                        amplitude *= 0.5; // Gain
                    }
                    return value;
                }


                void main() {
                    // --- Calculate Cloud Density ---
                    // Use world position combined with vertex noise input for 3D noise lookup
                    vec3 noisePos = vWorldPosition * 0.08 + vec3(0.0, 0.0, time * 0.02); // Scale and add time evolution
                    float density = fbm(noisePos + vNoiseInput * 0.1); // Combine world pos noise with vertex-driven input
                    density = smoothstep(0.3, 0.7, density); // Adjust noise range to create clearer shapes

                    // --- Calculate Base Color ---
                    // Mix between mood colors based on noise/density or world position Y
                    float colorMixFactor = clamp(vWorldPosition.y * 0.05 + 0.5 + (density - 0.5) * 0.3, 0.0, 1.0);
                    int index1 = int(floor(colorMixFactor * 4.0));
                    int index2 = min(index1 + 1, 4);
                    vec3 baseColor = mix(uMoodColors[index1], uMoodColors[index2], fract(colorMixFactor * 4.0));

                    // Add subtle color variation based on noise
                    baseColor = mix(baseColor, uMoodColors[int(mod(float(index1) + 2.0, 5.0))], noise(vWorldPosition * 0.2) * 0.1);

                    // Desaturate/brighten based on dreaminess
                    float dreamFactor = clamp(uDreaminess, 0.0, 1.0);
                    vec3 dreamColor = mix(baseColor, vec3(dot(baseColor, vec3(0.299, 0.587, 0.114))), dreamFactor * 0.5); // Desaturate
                    dreamColor = mix(dreamColor, vec3(1.0), dreamFactor * 0.2); // Add white

                    // --- Calculate Alpha ---
                    float audioOpacityFactor = uOpacityBase + uOpacityRange * (0.5 + uRawMid * 0.5); // Mid freqs affect opacity
                    float finalAlpha = density * audioOpacityFactor * uGlobalIntensity;

                    // Fade out near edges of the instance (using UVs - assumes box geometry UVs)
                    vec2 edgeFadeUV = abs(vUv - 0.5) * 2.0; // Map UVs to 0-1 range from center to edge
                    float edgeFade = 1.0 - smoothstep(0.7, 1.0, max(edgeFadeUV.x, edgeFadeUV.y)); // Fade near edges
                    finalAlpha *= edgeFade;

                    // Fade based on scale factor (smaller when pulsed = slightly less dense)
                    finalAlpha *= clamp(1.0 / vScaleFactor, 0.5, 1.0);

                    finalAlpha = clamp(finalAlpha, 0.0, 0.8); // Clamp max alpha

                    // // --- Apply Fog ---
                    // float depth = gl_FragCoord.z / gl_FragCoord.w;
                    // float fogFactor = smoothstep(uFogNear, uFogFar, depth);

                    // // --- Final Color ---
                    // vec3 finalColor = mix(dreamColor, uFogColor, fogFactor);

                    // gl_FragColor = vec4(finalColor, finalAlpha);

                    // --- New Final Output ---
                    gl_FragColor = vec4(dreamColor, finalAlpha); // Output color/alpha, Three.js adds fog

                    // Discard fully transparent fragments
                    if (gl_FragColor.a < 0.01) discard;
                }
            `,
            transparent: true,
            depthWrite: false, // Clouds generally shouldn't write to depth buffer
            blending: THREE.NormalBlending, // Normal blending usually looks best for clouds
            side: THREE.DoubleSide, // Render back faces for better volume illusion with simple geometry
            fog: false // Enable fog in the material
        });
    }

    /**
     * Updates the cloud system's appearance and reactivity.
     * @param {number} time - The current time elapsed (usually from clock.getElapsedTime()).
     * @param {object} visualParams - The visual parameters object from AudioVisualConnector.
     * @param {number} deltaTime - The time delta since the last frame.
     */
    update(time, visualParams, deltaTime) {
        if (!this.cloudInstances || !this.instanceMaterial || !visualParams) return;

        try {
            // --- Smooth visual parameters ---
            const smoothFactor = Math.min(1.0, deltaTime * 4.0); // Adjust smoothing rate
            this.smoothedParams.movementSpeed = THREE.MathUtils.lerp(this.smoothedParams.movementSpeed, visualParams.movementSpeed || 1.0, smoothFactor);
            this.smoothedParams.fluidity = THREE.MathUtils.lerp(this.smoothedParams.fluidity, visualParams.fluidity || 0.5, smoothFactor);
            this.smoothedParams.dreaminess = THREE.MathUtils.lerp(this.smoothedParams.dreaminess, visualParams.dreaminess || 0.5, smoothFactor);
            this.smoothedParams.rawMid = THREE.MathUtils.lerp(this.smoothedParams.rawMid, visualParams.rawMid || 0.0, smoothFactor);
            this.smoothedParams.peakImpact = THREE.MathUtils.lerp(this.smoothedParams.peakImpact, visualParams.peakImpact || 0.0, smoothFactor * 1.5); // Faster impact smoothing
            this.smoothedParams.globalIntensity = THREE.MathUtils.lerp(this.smoothedParams.globalIntensity, visualParams.globalIntensity || 1.0, smoothFactor);

            // --- Update Shader Uniforms ---
            const uniforms = this.instanceMaterial.uniforms;
            uniforms.time.value = time;
            uniforms.uGlobalIntensity.value = this.smoothedParams.globalIntensity;
            uniforms.uMovementSpeed.value = this.smoothedParams.movementSpeed;
            uniforms.uFluidity.value = this.smoothedParams.fluidity;
            uniforms.uDreaminess.value = this.smoothedParams.dreaminess;
            uniforms.uPeakImpact.value = this.smoothedParams.peakImpact;
            uniforms.uRawMid.value = this.smoothedParams.rawMid;

            // --- Update InstancedMesh Position/Rotation (Optional Overall Drift) ---
            // this.cloudInstances.rotation.y += deltaTime * 0.005 * this.smoothedParams.movementSpeed;

            // Note: Most animation is handled within the shader for performance.
            // If you needed complex per-instance logic not feasible in shaders,
            // you would update the instanceMatrix here using setMatrixAt and needsUpdate=true.
            // Example:
            // const tempMatrix = new THREE.Matrix4();
            // for (let i = 0; i < this.cloudInstances.count; i++) {
            //     this.cloudInstances.getMatrixAt(i, tempMatrix);
            //     // ... modify tempMatrix based on complex logic ...
            //     this.cloudInstances.setMatrixAt(i, tempMatrix);
            // }
            // this.cloudInstances.instanceMatrix.needsUpdate = true;

        } catch (error) {
            console.error("VCClouds: Error during update:", error);
            // Optionally disable module after repeated errors
             if(typeof ToastSystem !== 'undefined') {
                 ToastSystem.notify('error', 'Cloud system update error. Effect might be disabled.');
             }
             // Consider disabling the module here if errors persist
             // this.dispose(scene); // Or just stop updating?
        }
    }

    /**
     * Removes all objects created by this module from the scene and disposes of their resources.
     * @param {THREE.Scene} scene - The main Three.js scene.
     */
    dispose(scene) {
        console.log("VCClouds: Disposing objects...");
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
                        // Dispose shader textures if any were used in uniforms (none in this example yet)
                        if (obj.material.uniforms) {
                            Object.values(obj.material.uniforms).forEach(uniform => {
                                if (uniform && uniform.value && uniform.value.isTexture) {
                                    uniform.value.dispose();
                                    disposedCount++;
                                }
                            });
                        }
                        obj.material.dispose();
                        disposedCount++;
                    }
                    // If obj is the InstancedMesh itself, its geometry/material are handled above
                }
            } catch (e) {
                console.error("VCClouds: Error disposing object:", obj, e);
            }
        });
        console.log(`VCClouds: Disposed ${disposedCount} resources.`);

        // Clear internal state
        this.objects = [];
        this.cloudInstances = null;
        this.instanceMaterial = null;
        this.instanceGeometry = null;
    }
}

// Make globally accessible if required by the project structure
window.VCClouds = VCClouds;