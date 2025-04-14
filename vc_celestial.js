// vc_celestial.js - Visual Canvas Module for Celestial Bodies
// Part of the Harmonic Visions project by FatStinkyPanda
// Copyright (c) 2025 FatStinkyPanda - All rights reserved.

/**
 * @class VCCelestial
 * @description Manages celestial objects (sun, moon, planets) in the scene,
 *              reacting to mood settings and audio-visual parameters.
 */
class VCCelestial {
    constructor() {
        // --- Configuration ---
        this.PLANET_ORBIT_RADIUS_MIN = 35;
        this.PLANET_ORBIT_RADIUS_RANGE = 40;
        this.PLANET_BASE_SIZE = 0.8;
        this.PLANET_SIZE_RANGE = 1.2;
        this.PRIMARY_BODY_DISTANCE = 60; // Distance from origin for sun/moon

        // --- State ---
        this.primaryBody = null;        // The main sun or moon (Mesh)
        this.primaryLight = null;       // Light source associated with the primary body (PointLight)
        this.planets = [];              // Array of secondary celestial bodies (Meshes)
        this.objects = [];              // Tracks all THREE objects created by this module
        this.materials = [];            // Store materials for disposal
        this.textures = {};             // Store textures for disposal { key: texture }
        this.currentMood = 'calm';      // Track the current mood for updates

        // --- Internal Animation/Reactivity State ---
        this.lastBeatTime = 0;
        this.peakImpactSmoothed = 0;
        this.globalIntensitySmoothed = 0.8;

        console.log("VCCelestial module created");
    }

    /**
     * Initializes celestial bodies based on the current mood settings.
     * @param {THREE.Scene} scene - The main Three.js scene.
     * @param {object} settings - The mood-specific settings object from data.js.
     * @param {string} mood - The current mood string.
     */
    init(scene, settings, mood) {
        if (!scene || !settings || !settings.colors || !THREE) {
            console.error("VCCelestial: Scene, settings, settings.colors, or THREE library missing for initialization.");
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', 'Celestial bodies initialization failed: Missing dependencies.');
            }
            return;
        }
        this.currentMood = mood || 'calm'; // Store the current mood

        // Dispose of any existing objects first
        this.dispose(scene);
        console.log(`VCCelestial: Initializing for mood '${this.currentMood}'...`);

        try {
            // --- Create Primary Body (Sun/Moon) ---
            this._createPrimaryBody(scene, settings);

            // --- Create Secondary Bodies (Planets) ---
            this._createPlanets(scene, settings);

            console.log(`VCCelestial: Initialized successfully for mood '${this.currentMood}'.`);

        } catch (error) {
            console.error(`VCCelestial: Error during initialization for mood '${this.currentMood}':`, error);
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', `Celestial bodies failed to initialize: ${error.message}`);
            }
            // Attempt cleanup in case of partial initialization
            this.dispose(scene);
        }
    }

    /**
     * Creates the primary celestial body (sun or moon) and its light.
     * @param {THREE.Scene} scene - The main Three.js scene.
     * @param {object} settings - The mood-specific settings object.
     * @private
     */
    _createPrimaryBody(scene, settings) {
        const isSunLike = ['uplifting', 'warm', 'bright'].includes(this.currentMood);
        const isCosmic = this.currentMood === 'cosmic';
        const size = isCosmic ? 15 : (isSunLike ? 12 : 8);
        const color = isCosmic ? new THREE.Color(settings.colors[2]).lerp(new THREE.Color(0xffffff), 0.3) :
                      isSunLike ? new THREE.Color(settings.colors[1]).lerp(new THREE.Color(0xffffff), 0.5) :
                      new THREE.Color(settings.colors[3]).lerp(new THREE.Color(0xffffff), 0.2);

        // --- Geometry ---
        // Use slightly higher detail for the main object, but keep it reasonable
        const geometry = new THREE.SphereGeometry(size, 32, 24);
        this.objects.push(geometry); // Track geometry for disposal

        // --- Material ---
        // Using MeshBasicMaterial for self-illumination, less performance cost than lit materials
        const material = new THREE.MeshBasicMaterial({
            color: color,
            fog: false, // Celestial bodies shouldn't be affected by fog in the same way
            // map: this._getPrimaryTexture(settings), // Optional: Add texture later
        });
        this.materials.push(material); // Track material for disposal

        // --- Mesh ---
        this.primaryBody = new THREE.Mesh(geometry, material);
        this.primaryBody.position.set(
            this.PRIMARY_BODY_DISTANCE * Math.cos(1.0), // Start position (can be animated)
            size + 10, // Position slightly above the horizon
            this.PRIMARY_BODY_DISTANCE * Math.sin(1.0)
        );
        this.primaryBody.userData = { module: 'VCCelestial', type: 'primary' };
        scene.add(this.primaryBody);
        this.objects.push(this.primaryBody); // Track mesh for disposal

        // --- Light Source ---
        const lightIntensity = isCosmic ? 1.5 : (isSunLike ? 2.0 : 0.8);
        const lightColor = color.clone().multiplyScalar(1.1); // Slightly brighter/whiter light
        const lightDistance = this.PRIMARY_BODY_DISTANCE * 3; // Affects a larger area
        this.primaryLight = new THREE.PointLight(lightColor, lightIntensity, lightDistance, 1.5); // Added decay factor
        this.primaryLight.castShadow = isSunLike; // Only sun-like objects cast strong shadows
        this.primaryLight.shadow.mapSize.width = 1024; // Optimize shadow map size
        this.primaryLight.shadow.mapSize.height = 1024;
        this.primaryLight.shadow.camera.near = 1;
        this.primaryLight.shadow.camera.far = lightDistance;
        // Parent light to the mesh so it moves with it
        this.primaryBody.add(this.primaryLight);
        // NOTE: PointLight is added to the primaryBody, so it's automatically added to the scene.
        // No need to track this.primaryLight separately in this.objects unless we detach it later.

        console.log(`VCCelestial: Created primary body (size: ${size}, color: #${color.getHexString()})`);
    }


    /**
     * Creates secondary celestial bodies (planets).
     * @param {THREE.Scene} scene - The main Three.js scene.
     * @param {object} settings - The mood-specific settings object.
     * @private
     */
    _createPlanets(scene, settings) {
        this.planets = []; // Clear previous planets
        const planetCount = Math.floor(1 + settings.complexity * (this.currentMood === 'cosmic' ? 5 : 3)); // More planets in cosmic

        for (let i = 0; i < planetCount; i++) {
            try {
                const size = this.PLANET_BASE_SIZE + Math.random() * this.PLANET_SIZE_RANGE;
                // Use lower segments for distant planets - Optimization
                const segments = Math.max(8, Math.floor(16 - size * 2));
                const geometry = new THREE.SphereGeometry(size, segments, segments);
                this.objects.push(geometry); // Track geometry

                const colorIndex = Math.floor(Math.random() * settings.colors.length);
                const baseColor = new THREE.Color(settings.colors[colorIndex]);
                const emissiveIntensity = Math.random() * 0.1; // Subtle glow for some planets

                // Use MeshStandardMaterial to receive light from the primary body
                const material = new THREE.MeshStandardMaterial({
                    color: baseColor,
                    metalness: 0.1 + Math.random() * 0.3, // Slight metallic variation
                    roughness: 0.6 + Math.random() * 0.3, // Varied roughness
                    emissive: baseColor, // Emit a bit of its own color
                    emissiveIntensity: emissiveIntensity,
                    fog: true // Allow planets to be affected by fog
                });
                this.materials.push(material); // Track material

                const planet = new THREE.Mesh(geometry, material);

                // Position planets in varied orbits
                const orbitRadius = this.PLANET_ORBIT_RADIUS_MIN + Math.random() * this.PLANET_ORBIT_RADIUS_RANGE;
                const angle = Math.random() * Math.PI * 2;
                const yOffset = (Math.random() - 0.5) * 20; // Vertical variation

                planet.position.set(
                    orbitRadius * Math.cos(angle),
                    yOffset,
                    orbitRadius * Math.sin(angle)
                );

                // Store orbital parameters for animation
                planet.userData = {
                    module: 'VCCelestial',
                    type: 'planet',
                    orbitRadius: orbitRadius,
                    orbitSpeed: (0.01 + Math.random() * 0.03) * settings.speed, // Speed depends on mood base speed
                    angleOffset: angle,
                    yOffset: yOffset,
                    baseScale: size, // Store base size for pulsing
                    baseEmissiveIntensity: emissiveIntensity
                };

                planet.castShadow = false; // Planets generally don't need to cast shadows - Optimization
                planet.receiveShadow = true;

                scene.add(planet);
                this.planets.push(planet);
                this.objects.push(planet); // Track mesh

            } catch (planetError) {
                console.error(`VCCelestial: Error creating planet ${i + 1}:`, planetError);
                // Continue creating other planets
            }
        }
        console.log(`VCCelestial: Created ${this.planets.length} planets.`);
    }

     /**
     * Optional: Generates or retrieves a texture for the primary body.
     * @param {object} settings - The mood-specific settings object.
     * @returns {THREE.Texture | null} - The texture or null.
     * @private
     */
     _getPrimaryTexture(settings) {
         // Placeholder: In a real implementation, you might load a moon texture
         // or generate a procedural sun texture here using a CanvasTexture.
         // Remember to manage texture disposal in the dispose method.
         // Example: Generate simple noise texture
         const textureKey = `primary_${this.currentMood}`;
         if (this.textures[textureKey]) return this.textures[textureKey];

         const size = 256;
         const canvas = document.createElement('canvas');
         canvas.width = size;
         canvas.height = size;
         const context = canvas.getContext('2d');
         const imageData = context.createImageData(size, size);
         const data = imageData.data;
         const color = new THREE.Color(settings.colors[0]); // Use a base color

         for (let i = 0; i < data.length; i += 4) {
             const noise = Math.random() * 0.3 + 0.7; // Simple brightness noise
             data[i] = color.r * 255 * noise;
             data[i + 1] = color.g * 255 * noise;
             data[i + 2] = color.b * 255 * noise;
             data[i + 3] = 255;
         }
         context.putImageData(imageData, 0, 0);

         const texture = new THREE.CanvasTexture(canvas);
         texture.needsUpdate = true;
         this.textures[textureKey] = texture; // Store for disposal
         this.objects.push(texture); // Track texture for disposal (alternative way)
         return texture;
     }

    /**
     * Updates celestial bodies' positions, appearance, and reactivity.
     * @param {number} time - The current time elapsed (usually from clock.getElapsedTime()).
     * @param {object} visualParams - The visual parameters object from AudioVisualConnector.
     * @param {number} deltaTime - The time delta since the last frame.
     */
    update(time, visualParams, deltaTime) {
        if (!visualParams) return; // Need parameters to update

        // Smooth reactivity values for smoother transitions
        const smoothFactor = Math.min(1.0, deltaTime * 3.0); // Adjust smoothing speed
        this.peakImpactSmoothed = THREE.MathUtils.lerp(this.peakImpactSmoothed, visualParams.peakImpact || 0, smoothFactor * 2.0); // Faster smoothing for impact
        this.globalIntensitySmoothed = THREE.MathUtils.lerp(this.globalIntensitySmoothed, visualParams.globalIntensity || 0.8, smoothFactor);

        // --- Update Primary Body ---
        if (this.primaryBody) {
            try {
                // Gentle rotation
                this.primaryBody.rotation.y = time * 0.02 * visualParams.movementSpeed;

                // Optional: Slow orbit around the scene center
                const orbitSpeed = 0.03 * visualParams.movementSpeed;
                this.primaryBody.position.x = this.PRIMARY_BODY_DISTANCE * Math.cos(time * orbitSpeed + 1.0);
                this.primaryBody.position.z = this.PRIMARY_BODY_DISTANCE * Math.sin(time * orbitSpeed + 1.0);

                // Reactivity: Brightness/Emissive based on overall intensity
                if (this.primaryBody.material.isMeshBasicMaterial) {
                    // MeshBasicMaterial doesn't have emissiveIntensity, modulate color brightness
                    const baseColor = this.primaryBody.material.color.clone(); // Get the original color
                    const intensityFactor = 0.8 + this.globalIntensitySmoothed * 0.4;
                    this.primaryBody.material.color.copy(baseColor).multiplyScalar(intensityFactor);
                }
                // If using MeshStandardMaterial:
                // this.primaryBody.material.emissiveIntensity = 0.5 + this.globalIntensitySmoothed * 0.8;

                // Update associated light
                if (this.primaryLight) {
                    this.primaryLight.intensity = (this.currentMood === 'cosmic' ? 1.5 : (['uplifting', 'warm', 'bright'].includes(this.currentMood) ? 2.0 : 0.8)) * (0.7 + this.globalIntensitySmoothed * 0.6);
                    // Optional: Light color tint based on treble?
                    // const lightColor = this.primaryLight.color.clone();
                    // lightColor.lerp(new THREE.Color(0.8, 0.8, 1.0), visualParams.rawTreble * 0.2);
                    // this.primaryLight.color.copy(lightColor);
                }
            } catch (error) {
                console.error("VCCelestial: Error updating primary body:", error);
            }
        }

        // --- Update Planets ---
        this.planets.forEach(planet => {
            try {
                const userData = planet.userData;
                if (!userData) return;

                // Orbit animation
                const currentAngle = time * userData.orbitSpeed * visualParams.movementSpeed + userData.angleOffset;
                planet.position.x = userData.orbitRadius * Math.cos(currentAngle);
                planet.position.z = userData.orbitRadius * Math.sin(currentAngle);
                // Gentle bobbing on y-axis
                planet.position.y = userData.yOffset + Math.sin(time * 0.1 + userData.angleOffset) * 2;

                // Slow self-rotation
                planet.rotation.y += (0.05 + Math.random() * 0.05) * deltaTime * visualParams.movementSpeed;
                planet.rotation.x += (0.01 + Math.random() * 0.02) * deltaTime * visualParams.movementSpeed;

                // Reactivity: Pulse on beat/peak
                let scalePulse = 1.0;
                let emissivePulse = 0.0;
                if (visualParams.isBeat && (time - this.lastBeatTime > 0.3)) { // Pulse on beat with cooldown
                    scalePulse = 1.0 + (visualParams.rawBass || 0) * 0.4 + 0.1; // More subtle pulse
                    emissivePulse = (visualParams.rawBass || 0) * 0.5 + 0.1;
                    this.lastBeatTime = time; // Update last beat time for cooldown
                } else if (this.peakImpactSmoothed > 0.1) { // Pulse on smoothed peak impact
                    scalePulse = 1.0 + this.peakImpactSmoothed * 0.3;
                    emissivePulse = this.peakImpactSmoothed * 0.4;
                }

                 // Smoothly return scale and emissive to base values
                 const targetScale = userData.baseScale * scalePulse;
                 const targetEmissive = userData.baseEmissiveIntensity + emissivePulse;

                 planet.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), smoothFactor * 2.0); // Faster lerp for pulse return

                 if (planet.material.isMeshStandardMaterial) {
                      planet.material.emissiveIntensity = THREE.MathUtils.lerp(
                          planet.material.emissiveIntensity,
                          targetEmissive,
                          smoothFactor * 2.0 // Faster lerp for pulse return
                      );
                 }


            } catch (error) {
                console.error("VCCelestial: Error updating planet:", planet, error);
            }
        });
    }

    /**
     * Removes all objects created by this module from the scene and disposes of their resources.
     * @param {THREE.Scene} scene - The main Three.js scene.
     */
    dispose(scene) {
        console.log("VCCelestial: Disposing objects...");
        let disposedCount = 0;

        // Dispose objects tracked by the module
        this.objects.forEach(obj => {
            try {
                if (!obj) return;
                if (scene && obj.parent === scene) {
                    scene.remove(obj);
                }
                // Special handling for lights parented to meshes
                if (obj.isLight && obj.parent && obj.parent !== scene) {
                    obj.parent.remove(obj);
                }
                // Dispose geometry/material/texture if they exist
                if (obj.geometry && typeof obj.geometry.dispose === 'function') {
                    obj.geometry.dispose();
                }
                // Materials are tracked separately
                // Textures are tracked separately
                if (obj.dispose && typeof obj.dispose === 'function' && !obj.isMaterial && !obj.isGeometry) {
                    // Handle other disposable types like textures stored directly in objects array
                     obj.dispose();
                }
                disposedCount++;
            } catch (e) {
                console.error("VCCelestial: Error disposing object:", obj, e);
            }
        });

         // Dispose materials
         this.materials.forEach(material => {
             try {
                 if (material && typeof material.dispose === 'function') {
                     material.dispose();
                     disposedCount++;
                 }
             } catch(e) {
                 console.error("VCCelestial: Error disposing material:", material, e);
             }
         });

         // Dispose textures
         Object.values(this.textures).forEach(texture => {
             try {
                 if (texture && typeof texture.dispose === 'function') {
                     texture.dispose();
                     disposedCount++;
                 }
             } catch(e) {
                 console.error("VCCelestial: Error disposing texture:", texture, e);
             }
         });


        console.log(`VCCelestial: Disposed ${disposedCount} resources.`);

        // Clear internal state
        this.objects = [];
        this.planets = [];
        this.materials = [];
        this.textures = {};
        this.primaryBody = null;
        this.primaryLight = null; // Light is removed when parent (primaryBody) is removed
    }
}

// Make globally accessible if required by the project structure
window.VCCelestial = VCCelestial;