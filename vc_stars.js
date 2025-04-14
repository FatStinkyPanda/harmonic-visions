// vc_stars.js - Visual Canvas Module for Stars and Nebulae
// Part of the Harmonic Visions project by FatStinkyPanda
// Copyright (c) 2025 FatStinkyPanda - All rights reserved.

class VCStars {
    constructor() {
        this.stars = null;          // THREE.Points object for stars
        this.nebulae = [];        // Array of THREE.Mesh objects for nebulae
        this.objects = [];        // Tracks all THREE objects created by this module
        this.starMaterial = null;   // Reference to the star material for updates
        this.nebulaMaterials = []; // References to nebula materials

        // Internal state for smooth transitions or effects
        this.lastTreble = 0;
        this.lastMid = 0;

        console.log("VCStars module created");
    }

    /**
     * Initializes the stars and nebulae based on the current mood settings.
     * @param {THREE.Scene} scene - The main Three.js scene.
     * @param {object} settings - The mood-specific settings object from data.js.
     */
    init(scene, settings) {
        if (!scene || !settings || !settings.colors || !THREE) {
            console.error("VCStars: Scene, settings, settings.colors, or THREE library missing for initialization.");
            if(typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', 'Star field initialization failed: Missing dependencies.');
            }
            return; // Prevent initialization without required components
        }

        // Dispose of any existing objects first to prevent duplicates
        this.dispose(scene);
        console.log("VCStars: Initializing...");

        try {
            // --- Stars ---
            this._createStars(scene, settings);

            // --- Nebulae ---
            this._createNebulae(scene, settings);

            console.log(`VCStars: Initialized successfully with ${this.stars ? this.stars.geometry.attributes.position.count : 0} stars and ${this.nebulae.length} nebulae.`);

        } catch (error) {
            console.error("VCStars: Error during initialization:", error);
            if(typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', `Star field failed to initialize: ${error.message}`);
            }
            // Attempt to clean up any partially created objects
            this.dispose(scene);
        }
    }

    /**
     * Creates the star field points object.
     * @param {THREE.Scene} scene - The main Three.js scene.
     * @param {object} settings - The mood-specific settings object.
     * @private
     */
    _createStars(scene, settings) {
        const starCount = 1500 + Math.floor(settings.complexity * 3500); // Adjust count based on complexity
        const starGeometry = new THREE.BufferGeometry();

        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);
        const sizes = new Float32Array(starCount);
        const randomOffsets = new Float32Array(starCount); // For twinkling variation

        const baseColor = new THREE.Color(0xffffff); // Start with white

        for (let i = 0; i < starCount; i++) {
            const i3 = i * 3;

            // Distribute stars spherically
            const radius = 80 + Math.random() * 120; // Increased range for more depth
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1); // Uniform spherical distribution

            positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
            positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta) + (Math.random() - 0.5) * 10; // Add slight vertical spread
            positions[i3 + 2] = radius * Math.cos(phi);

            // Assign slightly varied colors (more realistic star colors)
            const starColor = baseColor.clone();
            const tempVariation = Math.random();
            if (tempVariation > 0.9) { // Hot blue/white stars
                starColor.setHSL(0.6 + Math.random() * 0.1, 0.8 + Math.random() * 0.2, 0.85 + Math.random() * 0.1);
            } else if (tempVariation > 0.7) { // White/Yellow stars
                starColor.setHSL(0.1 + Math.random() * 0.05, 0.5 + Math.random() * 0.4, 0.8 + Math.random() * 0.1);
            } else { // Cooler orange/reddish tints (less frequent/dimmer)
                starColor.setHSL(0.05 + Math.random() * 0.05, 0.8 + Math.random() * 0.2, 0.7 + Math.random() * 0.1);
            }
            colors[i3] = starColor.r;
            colors[i3 + 1] = starColor.g;
            colors[i3 + 2] = starColor.b;

            // Assign varied base sizes
            sizes[i] = 0.5 + Math.random() * 1.8; // Base size multiplier

            // Assign random offset for twinkling phase/speed
            randomOffsets[i] = Math.random() * Math.PI * 2; // Random phase offset
        }

        starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        starGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        starGeometry.setAttribute('sizeAttribute', new THREE.BufferAttribute(sizes, 1));
        starGeometry.setAttribute('randomOffset', new THREE.BufferAttribute(randomOffsets, 1));

        // --- Star Shader Material ---
        this.starMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0.0 },
                baseSize: { value: 0.08 }, // Base size factor
                audioTreble: { value: 0.0 }, // Audio reactivity factor
                globalIntensity: { value: 1.0 }, // Overall brightness control
                fogColor: { value: new THREE.Color(settings.fogColor || '#000000') },
                fogNear: { value: settings.cameraDistance ? settings.cameraDistance + 50 : 80 }, // Fog start distance
                fogFar: { value: settings.cameraDistance ? settings.cameraDistance + 200 : 230 }, // Fog end distance
                pixelRatio: { value: window.devicePixelRatio }, // For size attenuation
            },
            vertexShader: `
                attribute float sizeAttribute;
                attribute float randomOffset; // Receive random offset

                uniform highp float time;
                uniform float baseSize;
                uniform float audioTreble;
                uniform float globalIntensity;
                uniform float pixelRatio;

                varying vec3 vColor;
                varying float vFlutter; // Pass flutter value

                // Simple pseudo-random function
                float rand(vec2 co){
                    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
                }

                void main() {
                    vColor = color;

                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

                    // Twinkling effect using sin wave with random offset and speed
                    float flutterSpeed = 2.0 + rand(position.xy) * 3.0; // Vary speed per star
                    float flutter = 0.7 + 0.3 * sin(time * flutterSpeed + randomOffset); // Base brightness + pulse
                    vFlutter = flutter; // Pass to fragment shader for alpha modulation

                    // Size calculation
                    float audioSizeFactor = 1.0 + audioTreble * 1.5; // Size reacts to treble
                    float finalSize = baseSize * sizeAttribute * audioSizeFactor * globalIntensity;

                    // Point size attenuation
                    gl_PointSize = finalSize * (pixelRatio * 200.0 / -mvPosition.z);
                    // Clamp point size to prevent excessively large points when close
                    gl_PointSize = clamp(gl_PointSize, 1.0, 15.0 * pixelRatio);

                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                precision highp float;
                uniform vec3 fogColor;
                uniform float fogNear;
                uniform float fogFar;

                varying vec3 vColor;
                varying float vFlutter; // Receive flutter value

                void main() {
                    // Create a soft circular point
                    float dist = length(gl_PointCoord - vec2(0.5));
                    // Use smoothstep for a softer edge than discard
                    float alpha = 1.0 - smoothstep(0.45, 0.5, dist);

                    // Modulate alpha by flutter value for twinkling brightness
                    alpha *= vFlutter;

                    // // Apply fog
                    // float depth = gl_FragCoord.z / gl_FragCoord.w;
                    // float fogFactor = smoothstep(fogNear, fogFar, depth);

                    // // Final color calculation
                    // vec3 outgoingColor = vColor;
                    // gl_FragColor = vec4(mix(outgoingColor, fogColor, fogFactor), alpha);

                    // --- New Final Output ---
                    gl_FragColor = vec4(vColor, alpha); // Output color/alpha, Three.js adds fog

                    // Discard fully transparent fragments for potential performance gain
                    if (gl_FragColor.a < 0.01) discard;
                }
            `,
            blending: THREE.AdditiveBlending, // Additive blending for bright stars
            depthWrite: false, // Stars don't obscure each other significantly
            transparent: true,
            vertexColors: true, // Use the 'color' attribute
            fog: false // Enable fog calculations in the shader
        });

        this.stars = new THREE.Points(starGeometry, this.starMaterial);
        this.stars.userData = { module: 'VCStars' }; // Identify object origin
        scene.add(this.stars);
        this.objects.push(this.stars);
    }

    /**
     * Creates the nebula cloud objects.
     * @param {THREE.Scene} scene - The main Three.js scene.
     * @param {object} settings - The mood-specific settings object.
     * @private
     */
    _createNebulae(scene, settings) {
        const nebulaCount = 3 + Math.floor(settings.complexity * 5); // Fewer, more impactful nebulae
        this.nebulaMaterials = []; // Reset materials array

        for (let i = 0; i < nebulaCount; i++) {
            const colorIndex = Math.floor(Math.random() * settings.colors.length);
            const baseColor = new THREE.Color(settings.colors[colorIndex]);

            // Use a plane geometry for sprite-like billboards or a sphere for volume
            // Let's use a Plane for billboard effect facing camera
            const nebulaGeometry = new THREE.PlaneGeometry(1, 1, 1, 1); // Simple plane

            const nebulaMaterial = new THREE.ShaderMaterial({
                uniforms: {
                    time: { value: 0.0 },
                    baseColor: { value: baseColor },
                    opacityFactor: { value: 0.0 }, // Controlled by audio
                    noiseScale: { value: 0.8 + Math.random() * 0.4 }, // Randomize appearance
                    resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
                    fogColor: { value: new THREE.Color(settings.fogColor || '#000000') },
                    fogNear: { value: settings.cameraDistance ? settings.cameraDistance + 50 : 80 },
                    fogFar: { value: settings.cameraDistance ? settings.cameraDistance + 200 : 230 },
                    cameraPos: { value: new THREE.Vector3() } // Pass camera position for fog/billboarding
                },
                vertexShader: `
                    uniform highp float time;
                    varying vec2 vUv;
                    // uniform vec3 cameraPos; // Needed for true billboarding

                    void main() {
                        vUv = uv;
                        // Basic billboard (always face camera origin roughly)
                        // More complex billboarding requires passing camera position and calculating matrix
                        // vec4 mvPosition = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); // Center of object
                        // mvPosition.xyz += position; // Add original plane offset
                        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

                        gl_Position = projectionMatrix * mvPosition;
                    }
                `,
                fragmentShader: `
                    precision highp float;
                    uniform highp float time;
                    uniform vec3 baseColor;
                    uniform float opacityFactor; // Base opacity from audio
                    uniform float noiseScale;
                    uniform vec2 resolution; // Screen resolution for aspect ratio correction

                    uniform vec3 fogColor;
                    uniform float fogNear;
                    uniform float fogFar;

                    varying vec2 vUv;

                    // Pseudo-random number generator
                    float rand(vec2 n) {
                        return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
                    }

                    // Simple Fractional Brownian Motion (FBM) using sin waves (cheaper than noise textures)
                    float fbm(vec2 p) {
                        float value = 0.0;
                        float amplitude = 0.5;
                        vec2 shift = vec2(100.0);
                        // Rotate domain
                        mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
                        for (int i = 0; i < 3; i++) { // 3 octaves
                            value += amplitude * (0.5 + 0.5 * sin(p.x * noiseScale) * sin(p.y * noiseScale)); // Using sin for pattern
                            p = rot * p * 2.0 + shift + time * 0.05 * float(i+1); // Evolve pattern over time
                            amplitude *= 0.5;
                        }
                        return value;
                    }

                    void main() {
                        // Center UVs and correct aspect ratio
                        vec2 centeredUv = (vUv - 0.5) * vec2(resolution.x / resolution.y, 1.0);
                        float dist = length(centeredUv); // Distance from center

                        // Generate noise pattern
                        float noise = fbm(centeredUv * 3.0); // Adjust multiplier for pattern scale

                        // Create a soft, cloud-like density falloff from the center
                        float density = smoothstep(0.6, 0.1, dist); // Soft circular mask

                        // Combine noise and density
                        float finalDensity = density * noise;

                        // Calculate final alpha
                        float alpha = finalDensity * opacityFactor * 1.5; // Modulate by audio, boost slightly
                        alpha = clamp(alpha, 0.0, 0.8); // Clamp max alpha

                        // Calculate final color
                        vec3 color = baseColor * (0.6 + noise * 0.4); // Vary color slightly with noise

                        // // Apply fog
                        // float depth = gl_FragCoord.z / gl_FragCoord.w;
                        // float fogFactor = smoothstep(fogNear, fogFar, depth);

                        // gl_FragColor = vec4(mix(color, fogColor, fogFactor), alpha);

                        // --- New Final Output ---
                        gl_FragColor = vec4(color, alpha); // Output color/alpha, Three.js adds fog

                        if (gl_FragColor.a < 0.01) discard; // Discard transparent fragments

                    }
                `,
                blending: THREE.AdditiveBlending, // Use Additive for glowing effect
                transparent: true,
                depthWrite: false,
                side: THREE.DoubleSide, // Render both sides if using Plane
                fog: false // Enable fog
            });

            const nebula = new THREE.Mesh(nebulaGeometry, nebulaMaterial);

            // Position and scale nebulae more sparsely
            const radius = 90 + Math.random() * 80;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            nebula.position.set(
                radius * Math.sin(phi) * Math.cos(theta),
                radius * Math.sin(phi) * Math.sin(theta),
                radius * Math.cos(phi)
            );

            // Scale nebulae large
            const nebulaScale = 25 + Math.random() * 30 * settings.complexity;
            nebula.scale.set(nebulaScale, nebulaScale, nebulaScale);

            // Random initial rotation
            nebula.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);

            nebula.userData = { module: 'VCStars' }; // Identify object origin
            scene.add(nebula);
            this.nebulae.push(nebula);
            this.nebulaMaterials.push(nebulaMaterial); // Store material reference
            this.objects.push(nebula);
        }
    }

    /**
     * Updates the stars and nebulae based on time and visual parameters.
     * @param {number} time - The current time elapsed (usually from clock.getElapsedTime()).
     * @param {object} visualParams - The visual parameters object from AudioVisualConnector.
     * @param {number} deltaTime - The time delta since the last frame.
     */
    update(time, visualParams, deltaTime) {
        if (!visualParams) return; // Need visual params to update

        try {
            // Smooth audio reactivity values
            const smoothFactor = Math.min(1.0, deltaTime * 5.0); // Adjust smoothing speed
            this.lastTreble = THREE.MathUtils.lerp(this.lastTreble, visualParams.rawTreble || 0, smoothFactor);
            this.lastMid = THREE.MathUtils.lerp(this.lastMid, visualParams.rawMid || 0, smoothFactor);

            // --- Update Stars ---
            if (this.stars && this.starMaterial) {
                // Subtle rotation of the entire star field
                this.stars.rotation.y = time * 0.005 * visualParams.movementSpeed;
                this.stars.rotation.x = time * 0.002 * visualParams.movementSpeed;

                // Update shader uniforms
                this.starMaterial.uniforms.time.value = time;
                this.starMaterial.uniforms.audioTreble.value = this.lastTreble;
                this.starMaterial.uniforms.globalIntensity.value = 0.8 + (visualParams.globalIntensity || 1.0) * 0.4; // Modulate intensity

                // Update fog if necessary (e.g., if camera moves significantly)
                // this.starMaterial.uniforms.fogNear.value = ...
                // this.starMaterial.uniforms.fogFar.value = ...
            }

            // --- Update Nebulae ---
            this.nebulae.forEach((nebula, index) => {
                // Slow, independent rotation for each nebula
                nebula.rotation.x += (0.0001 + index * 0.00001) * visualParams.movementSpeed * deltaTime * 60;
                nebula.rotation.y += (0.0002 + index * 0.00002) * visualParams.movementSpeed * deltaTime * 60;

                // Update nebula shader uniforms
                const material = this.nebulaMaterials[index];
                if (material) {
                    material.uniforms.time.value = time;
                    // Opacity reacts to mid-range audio, clamped for subtlety
                    material.uniforms.opacityFactor.value = THREE.MathUtils.clamp(0.1 + this.lastMid * 0.5, 0.05, 0.4);
                    // material.uniforms.cameraPos.value.copy(camera.position); // Needed for true billboarding/volumetrics
                }
            });

        } catch (error) {
            console.error("VCStars: Error during update:", error);
            // Optionally disable the module after repeated errors
        }
    }

    /**
     * Removes all objects created by this module from the scene and disposes of their resources.
     * @param {THREE.Scene} scene - The main Three.js scene.
     */
    dispose(scene) {
        console.log("VCStars: Disposing objects...");
        let disposedCount = 0;
        this.objects.forEach(obj => {
            try {
                if (scene && obj) {
                    scene.remove(obj);
                }
                if (obj && obj.geometry) {
                    obj.geometry.dispose();
                }
                if (obj && obj.material) {
                    // Dispose textures if the material has them (check uniforms for ShaderMaterial)
                    if (obj.material.uniforms) {
                        Object.values(obj.material.uniforms).forEach(uniform => {
                            if (uniform && uniform.value && uniform.value.isTexture) {
                                uniform.value.dispose();
                            }
                        });
                    }
                    // Dispose standard maps
                    ['map', 'aoMap', 'alphaMap', 'envMap', 'specularMap', 'normalMap', 'bumpMap', 'roughnessMap', 'metalnessMap'].forEach(prop => {
                         if (obj.material[prop] && obj.material[prop].isTexture) {
                              obj.material[prop].dispose();
                         }
                    });
                    obj.material.dispose();
                }
                disposedCount++;
            } catch (e) {
                console.error("VCStars: Error disposing object:", obj, e);
            }
        });
        console.log(`VCStars: Disposed ${disposedCount} objects.`);
        this.objects = []; // Clear the array
        this.stars = null;
        this.nebulae = [];
        this.starMaterial = null; // Clear material reference
        this.nebulaMaterials = [];
    }
}

// Make globally accessible if required by the project structure (standard JS includes)
window.VCStars = VCStars;