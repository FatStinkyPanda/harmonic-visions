// vc_lighting.js - Visual Canvas Module for Dynamic Scene Lighting
// Part of the Harmonic Visions project by FatStinkyPanda
// Copyright (c) 2025 FatStinkyPanda - All rights reserved.
// Version: 1.0.1 (Added Vol/Occur/Inten mood config system)

/**
 * @class VCLighting
 * @description Manages the scene's lighting environment, including ambient,
 *              hemisphere, and directional lights. It adapts colors, intensities,
 *              and positions based on mood and audio-visual parameters.
 */
class VCLighting {
    constructor() {
        // --- Configuration ---
        this.MODULE_ID = 'VCLighting';
        this.DIRECTIONAL_LIGHT_DISTANCE = 80; // How far away the directional light source is positioned
        this.SHADOW_MAP_SIZE = 2048;          // Quality of shadows (power of 2: 1024, 2048, 4096)
        this.SHADOW_CAMERA_SIZE = 100;        // Area the directional light's shadow covers

        // --- Mood Configuration System ---
        this.moodConfig = { volume: 100, occurrence: 100, intensity: 50 }; // Default config
        this.baseSettings = null; // Store original settings from data.js
        
        // --- State ---
        this.ambientLight = null;       // THREE.AmbientLight
        this.hemisphereLight = null;    // THREE.HemisphereLight
        this.directionalLight = null;   // THREE.DirectionalLight (main sun/moon)
        this.dLightTarget = null;       // Object3D for directional light target
        this.pointLights = [];          // Array for point lights (added based on occurrence)
        this.objects = [];              // Tracks THREE objects for disposal (lights, target)
        this.currentMood = 'calm';      // Track the current mood
        this.isEnabled = false;         // Track if the module is currently active
        
        // --- Default values for mapping ---
        this.defaultParams = {
            // Light intensity defaults and ranges
            ambientIntensityBase: 0.1,
            ambientIntensityMax: 0.5,
            hemiIntensityBase: 0.3,
            hemiIntensityMax: 0.8,
            dirIntensityBase: 0.6,
            dirIntensityMax: 1.2,
            
            // Point light parameters
            maxPointLights: 4,
            pointLightIntensityBase: 0.3,
            pointLightIntensityMax: 0.8,
            pointLightDistanceBase: 20,
            pointLightDistanceMax: 50,
            
            // Color and effect parameters
            colorSaturationBase: 0.3,  // At intensity=0, colors are desaturated
            colorSaturationMax: 1.2,   // At intensity=100, colors are more saturated
            
            // Fog parameters
            fogDensityBase: 0.005,
            fogDensityMax: 0.02,
        };

        // --- Internal Animation/Reactivity State ---
        this.smoothedParams = {         // Local smoothed parameters
            globalIntensity: 1.0,
            dreaminess: 0.5,
            peakImpact: 0.0,
            rawBass: 0.0,
            rawTreble: 0.0,
            movementSpeed: 1.0,
        };
        // Store base colors/intensities to lerp from/to during updates
        this.baseSettings = {
            ambientIntensity: 0.1,
            hemiIntensity: 0.3,
            dirIntensity: 0.8,
            ambientColor: new THREE.Color(0xffffff),
            hemiSkyColor: new THREE.Color(0xffffff),
            hemiGroundColor: new THREE.Color(0x444444),
            dirColor: new THREE.Color(0xffffff),
            fogColor: new THREE.Color(0x000000),
            fogNear: 10,
            fogFar: 100,
        };
        this.lightOrbitAngle = Math.random() * Math.PI * 2; // Unique starting angle
        this.scene = null; // Store reference to the scene

        console.log(`${this.MODULE_ID} module created`);
    }

    /**
     * Maps a value from 0-100 scale to a target range
     * @param {number} value0to100 - Input value (0-100)
     * @param {number} minTarget - Minimum output value
     * @param {number} maxTarget - Maximum output value
     * @returns {number} - Mapped value in target range
     */
    _mapValue(value0to100, minTarget, maxTarget) {
        const clampedValue = Math.max(0, Math.min(100, value0to100 ?? 100)); // Default to 100 if undefined
        return minTarget + (maxTarget - minTarget) * (clampedValue / 100.0);
    }

    /**
     * Applies the 0-100 mood configuration to lighting parameters
     * @param {number} transitionTime - Transition time in seconds (for animation)
     * @private
     */
    _applyMoodConfig(transitionTime = 0) {
        if (!this.moodConfig || !this.isEnabled || !this.scene) return;

        console.log(`${this.MODULE_ID}: Applying mood config:`, this.moodConfig);
        
        // --- Apply Volume (Overall Light Intensity) ---
        if (this.moodConfig.volume !== undefined) {
            const volumeFactor = this._mapValue(this.moodConfig.volume, 0.3, 1.0);
            console.log(`${this.MODULE_ID}: Applying Volume ${this.moodConfig.volume}/100 -> intensity factor ${volumeFactor.toFixed(2)}`);
            
            // Adjust all light intensities based on volume
            if (this.ambientLight) {
                const baseIntensity = this.baseSettings.ambientIntensity;
                this.ambientLight.intensity = baseIntensity * volumeFactor;
            }
            
            if (this.hemisphereLight) {
                const baseIntensity = this.baseSettings.hemiIntensity;
                this.hemisphereLight.intensity = baseIntensity * volumeFactor;
            }
            
            if (this.directionalLight) {
                const baseIntensity = this.baseSettings.dirIntensity;
                this.directionalLight.intensity = baseIntensity * volumeFactor;
            }
            
            // Also adjust point lights if they exist
            this.pointLights.forEach(light => {
                if (light) {
                    const baseIntensity = light.userData.baseIntensity || this.defaultParams.pointLightIntensityBase;
                    light.intensity = baseIntensity * volumeFactor;
                }
            });
        }
        
        // --- Apply Occurrence (Number of Point Lights) ---
        if (this.moodConfig.occurrence !== undefined) {
            const targetLightCount = Math.floor(this._mapValue(
                this.moodConfig.occurrence, 
                0, 
                this.baseSettings.maxPointLights || this.defaultParams.maxPointLights
            ));
            
            console.log(`${this.MODULE_ID}: Applying Occurrence ${this.moodConfig.occurrence}/100 -> point light count ${targetLightCount}`);
            
            // If we need to adjust the point light count
            if (targetLightCount !== this.pointLights.length) {
                // Remove excess lights if we have too many
                while (this.pointLights.length > targetLightCount) {
                    const light = this.pointLights.pop();
                    if (light && this.scene) {
                        this.scene.remove(light);
                        const index = this.objects.indexOf(light);
                        if (index > -1) this.objects.splice(index, 1);
                    }
                }
                
                // Add more lights if needed
                while (this.pointLights.length < targetLightCount) {
                    this._createPointLight();
                }
            }
            
            // Also adjust shadow mapping based on occurrence
            // Higher occurrence = better shadow quality
            if (this.directionalLight && this.directionalLight.shadow) {
                const shadowQuality = Math.pow(2, Math.floor(this._mapValue(this.moodConfig.occurrence, 10, 12)));
                if (shadowQuality !== this.directionalLight.shadow.mapSize.width) {
                    this.directionalLight.shadow.mapSize.width = shadowQuality;
                    this.directionalLight.shadow.mapSize.height = shadowQuality;
                    this.directionalLight.shadow.map?.dispose(); // Force shadow map rebuild
                }
            }
        }
        
        // --- Apply Intensity (Color Saturation, Bloom, Effects) ---
        if (this.moodConfig.intensity !== undefined) {
            console.log(`${this.MODULE_ID}: Applying Intensity ${this.moodConfig.intensity}/100`);
            
            // 1. Color Saturation
            const saturationFactor = this._mapValue(
                this.moodConfig.intensity,
                this.baseSettings.colorSaturationBase || this.defaultParams.colorSaturationBase,
                this.baseSettings.colorSaturationMax || this.defaultParams.colorSaturationMax
            );
            
            console.log(`  -> Color saturation factor: ${saturationFactor.toFixed(2)}`);
            
            // Apply saturation to directional light (as an example)
            if (this.directionalLight) {
                const baseColor = this.baseSettings.dirColor.clone();
                // Extract hue and lightness, adjust saturation
                const hsl = {};
                baseColor.getHSL(hsl);
                const targetSaturation = Math.min(1, hsl.s * saturationFactor);
                baseColor.setHSL(hsl.h, targetSaturation, hsl.l);
                this.directionalLight.color.copy(baseColor);
            }
            
            // 2. Fog Density
            if (this.scene && this.scene.fog instanceof THREE.FogExp2) {
                const baseDensity = this.baseSettings.fogDensityBase || this.defaultParams.fogDensityBase;
                const maxDensity = this.baseSettings.fogDensityMax || this.defaultParams.fogDensityMax;
                const targetDensity = this._mapValue(this.moodConfig.intensity, maxDensity, baseDensity); // Inverse mapping: higher intensity = less fog
                
                console.log(`  -> Fog density: ${targetDensity.toFixed(5)}`);
                this.scene.fog.density = targetDensity;
            }
            
            // 3. Shadow properties
            if (this.directionalLight && this.directionalLight.shadow) {
                // Higher intensity = sharper shadows (lower bias)
                const shadowBias = this._mapValue(this.moodConfig.intensity, -0.0005, -0.002);
                this.directionalLight.shadow.bias = shadowBias;
                
                // Adjust shadow darkness
                const shadowDarkness = this._mapValue(this.moodConfig.intensity, 0.3, 0.7);
                // Note: In Three.js r125+, shadow darkness is controlled via renderer.shadowMap.darkness
                // or material properties, not directly on the shadow itself
            }
        }
    }

    /**
     * Creates a point light and adds it to the scene
     * @private
     */
    _createPointLight() {
        if (!this.scene) return;
        
        const moodColors = this.baseSettings.moodColors || [0xffffff];
        const colorIndex = Math.floor(Math.random() * moodColors.length);
        const color = new THREE.Color(moodColors[colorIndex]);
        
        // Get intensity and range based on intensity setting
        const baseIntensity = this.defaultParams.pointLightIntensityBase;
        const distance = this.defaultParams.pointLightDistanceBase;
        
        // Create the point light
        const pointLight = new THREE.PointLight(color, baseIntensity, distance);
        pointLight.castShadow = true;
        
        // Set position randomly within the scene
        const radius = Math.random() * 30 + 10;
        const angle = Math.random() * Math.PI * 2;
        const height = Math.random() * 20 - 5;
        
        pointLight.position.set(
            Math.cos(angle) * radius,
            height,
            Math.sin(angle) * radius
        );
        
        // Configure shadow properties (smaller resolution for performance)
        pointLight.shadow.mapSize.width = 512;
        pointLight.shadow.mapSize.height = 512;
        pointLight.shadow.camera.near = 0.5;
        pointLight.shadow.camera.far = distance;
        
        // Store base intensity for volume adjustments
        pointLight.userData = {
            module: this.MODULE_ID,
            baseIntensity: baseIntensity,
            originalColor: color.clone()
        };
        
        // Add to scene and tracking arrays
        this.scene.add(pointLight);
        this.pointLights.push(pointLight);
        this.objects.push(pointLight);
        
        console.log(`${this.MODULE_ID}: Created point light at position`, pointLight.position);
        return pointLight;
    }

    /**
     * Updates the baseSettings property based on the provided mood settings.
     * @param {object} settings - Mood settings from data.js.
     * @private
     */
    _updateBaseSettings(settings) {
        const moodColors = settings.colors.map(c => new THREE.Color(c));
        const complexity = settings.complexity || 0.5;
        const dreaminess = settings.dreaminess || 0.5;

        // Store mood colors for point lights
        this.baseSettings.moodColors = settings.colors;
        
        // --- Determine Colors ---
        // Ambient: Generally a darker, less saturated version of a mood color
        this.baseSettings.ambientColor.copy(moodColors[2] || moodColors[0]).multiplyScalar(0.4).lerp(new THREE.Color(0.5, 0.5, 0.5), 0.5);
        // Hemisphere: Sky color from brighter mood colors, Ground from darker/complementary
        this.baseSettings.hemiSkyColor.copy(moodColors[moodColors.length - 1]);
        this.baseSettings.hemiGroundColor.copy(moodColors[0]).multiplyScalar(0.3);
        // Directional: A primary mood color, maybe slightly desaturated or shifted
        this.baseSettings.dirColor.copy(moodColors[1] || moodColors[0]).lerp(new THREE.Color(1, 1, 1), 0.1); // Blend slightly towards white
        // Fog: Use the specified fog color
        this.baseSettings.fogColor.set(settings.fogColor || '#000000');

        // --- Determine Intensities ---
        // Intensity scales based on mood (e.g., bright/uplifting = higher intensity)
        let intensityMultiplier = 1.0;
        switch (this.currentMood) {
            case 'uplifting':
            case 'bright': intensityMultiplier = 1.3; break;
            case 'warm':
            case 'soft': intensityMultiplier = 1.0; break;
            case 'calm': intensityMultiplier = 0.8; break;
            case 'cosmic':
            case 'mystical': intensityMultiplier = 0.6; break;
        }
        // Dreaminess generally softens contrast: lower directional, higher ambient/hemi
        const dreamFactor = (1.0 - dreaminess * 0.5);

        this.baseSettings.ambientIntensity = THREE.MathUtils.lerp(0.1, 0.3, dreaminess) * intensityMultiplier;
        this.baseSettings.hemiIntensity = THREE.MathUtils.lerp(0.2, 0.5, dreaminess) * intensityMultiplier;
        this.baseSettings.dirIntensity = THREE.MathUtils.lerp(0.9, 0.5, dreaminess) * intensityMultiplier * dreamFactor;

        // --- Fog Distance ---
        // Closer fog for dreamy/mystical moods
        const fogNearFactor = (this.currentMood === 'cosmic' || this.currentMood === 'mystical' || dreaminess > 0.7) ? 0.5 : 1.0;
        const fogFarFactor = (this.currentMood === 'cosmic' || this.currentMood === 'mystical' || dreaminess > 0.7) ? 0.8 : 1.0;
        this.baseSettings.fogNear = (settings.cameraDistance || 30) * fogNearFactor * 0.8;
        this.baseSettings.fogFar = this.baseSettings.fogNear + 100 * fogFarFactor;
        
        // --- Store fog density for intensity mapping ---
        this.baseSettings.fogDensityBase = settings.fogDensity || this.defaultParams.fogDensityBase;
        this.baseSettings.fogDensityMax = (settings.fogDensityMax || settings.fogDensity * 2) || this.defaultParams.fogDensityMax;
        
        // --- Set maximum point lights based on complexity ---
        this.baseSettings.maxPointLights = Math.round(this.defaultParams.maxPointLights * complexity) || this.defaultParams.maxPointLights;
        
        // --- Set color saturation range based on mood ---
        this.baseSettings.colorSaturationBase = settings.colorSaturationBase || this.defaultParams.colorSaturationBase;
        this.baseSettings.colorSaturationMax = settings.colorSaturationMax || this.defaultParams.colorSaturationMax;

        console.log(`${this.MODULE_ID}: Updated base settings for mood '${this.currentMood}'.`);
    }


    /**
     * Initializes the lighting system for the current mood.
     * @param {THREE.Scene} scene - The main Three.js scene.
     * @param {object} settings - The mood-specific settings object from data.js.
     * @param {string} mood - The current mood string.
     * @param {object} moodConfig - Optional mood configuration (volume, occurrence, intensity).
     */
    init(scene, settings, mood, moodConfig) {
        // --- Pre-checks ---
        if (!scene || !settings || !settings.colors || !THREE) {
            console.error(`${this.MODULE_ID}: Scene, settings, settings.colors, or THREE library missing for initialization.`);
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', 'Lighting system initialization failed: Missing dependencies.');
            }
            this.isEnabled = false;
            return;
        }
        this.currentMood = mood || 'calm';
        this.scene = scene; // Store reference to the scene

        // --- Cleanup ---
        this.dispose(scene); // Dispose previous instances first
        console.log(`${this.MODULE_ID}: Initializing for mood '${this.currentMood}'... Config:`, moodConfig);

        try {
            // --- Store mood configuration ---
            this.moodConfig = { ...this.moodConfig, ...moodConfig }; // Merge incoming config
            
            // --- Determine Base Colors and Intensities from Mood ---
            this._updateBaseSettings(settings);

            // --- Ambient Light ---
            this.ambientLight = new THREE.AmbientLight(this.baseSettings.ambientColor, this.baseSettings.ambientIntensity);
            this.ambientLight.userData = { module: this.MODULE_ID };
            scene.add(this.ambientLight);
            this.objects.push(this.ambientLight);

            // --- Hemisphere Light ---
            this.hemisphereLight = new THREE.HemisphereLight(
                this.baseSettings.hemiSkyColor,
                this.baseSettings.hemiGroundColor,
                this.baseSettings.hemiIntensity
            );
            this.hemisphereLight.position.set(0, 50, 0); // Position doesn't matter much for hemi light directionality
            this.hemisphereLight.userData = { module: this.MODULE_ID };
            scene.add(this.hemisphereLight);
            this.objects.push(this.hemisphereLight);

            // --- Directional Light (Sun/Moon) ---
            this.directionalLight = new THREE.DirectionalLight(this.baseSettings.dirColor, this.baseSettings.dirIntensity);
            this.directionalLight.userData = { module: this.MODULE_ID };
            this.directionalLight.castShadow = true; // Enable shadows

            // Position high up and slightly angled
            this.directionalLight.position.set(
                Math.cos(this.lightOrbitAngle) * this.DIRECTIONAL_LIGHT_DISTANCE,
                this.DIRECTIONAL_LIGHT_DISTANCE * 0.8, // Height factor
                Math.sin(this.lightOrbitAngle) * this.DIRECTIONAL_LIGHT_DISTANCE
            );

            // Target for the directional light (usually the center of the scene)
            this.dLightTarget = new THREE.Object3D();
            this.dLightTarget.position.set(0, -10, 0); // Aim slightly downwards towards the scene center/landscape
            scene.add(this.dLightTarget); // Target needs to be in the scene
            this.directionalLight.target = this.dLightTarget;
            this.objects.push(this.dLightTarget); // Track target for disposal

            // Shadow configuration (Optimization: Adjust size/bias carefully)
            this.directionalLight.shadow.mapSize.width = this.SHADOW_MAP_SIZE;
            this.directionalLight.shadow.mapSize.height = this.SHADOW_MAP_SIZE;
            this.directionalLight.shadow.camera.near = 10;
            this.directionalLight.shadow.camera.far = this.DIRECTIONAL_LIGHT_DISTANCE * 2.5; // Cover the light's range
            this.directionalLight.shadow.camera.left = -this.SHADOW_CAMERA_SIZE / 2;
            this.directionalLight.shadow.camera.right = this.SHADOW_CAMERA_SIZE / 2;
            this.directionalLight.shadow.camera.top = this.SHADOW_CAMERA_SIZE / 2;
            this.directionalLight.shadow.camera.bottom = -this.SHADOW_CAMERA_SIZE / 2;
            this.directionalLight.shadow.bias = -0.001; // Adjust to prevent shadow acne
            // this.directionalLight.shadow.radius = 1.5; // Soften shadows slightly (PCFSoftShadowMap helps)

            scene.add(this.directionalLight);
            this.objects.push(this.directionalLight);

            // --- Scene Background & Fog ---
            // Use exponential fog for a more natural falloff
            scene.fog = new THREE.FogExp2(this.baseSettings.fogColor, settings.fogDensity || 0.01);
            // scene.background can be set here or managed by a skybox/environment module
            scene.background = this.baseSettings.fogColor.clone().multiplyScalar(0.8); // Darker background than fog

            // --- Apply Initial Mood Config ---
            this.isEnabled = true; // Mark as enabled before applying config
            this._applyMoodConfig(0); // Apply immediately (no transition)

            console.log(`${this.MODULE_ID}: Initialized successfully for mood '${this.currentMood}'.`);

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during initialization for mood '${this.currentMood}':`, error);
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', `Lighting system failed to initialize: ${error.message}`);
            }
            this.dispose(scene); // Cleanup on error
            this.isEnabled = false;
        }
    }

    /**
     * Updates the lighting based on time and visual parameters.
     * @param {number} time - The current time elapsed.
     * @param {object} visualParams - The visual parameters object from AudioVisualConnector.
     * @param {number} deltaTime - The time delta since the last frame.
     * @param {THREE.Camera} camera - The scene camera.
     * @param {THREE.EffectComposer} composer - The post-processing composer.
     */
    update(time, visualParams, deltaTime, camera, composer) {
        if (!this.isEnabled || !visualParams) return;

        try {
            // --- Smooth visual parameters ---
            const smoothFactor = Math.min(1.0, deltaTime * 3.0); // Smoothing rate
            this.smoothedParams.globalIntensity = THREE.MathUtils.lerp(this.smoothedParams.globalIntensity, visualParams.globalIntensity || 1.0, smoothFactor);
            this.smoothedParams.dreaminess = THREE.MathUtils.lerp(this.smoothedParams.dreaminess, visualParams.dreaminess || 0.5, smoothFactor);
            this.smoothedParams.peakImpact = THREE.MathUtils.lerp(this.smoothedParams.peakImpact, visualParams.peakImpact || 0.0, smoothFactor * 2.0); // Faster impact smoothing
            this.smoothedParams.rawBass = THREE.MathUtils.lerp(this.smoothedParams.rawBass, visualParams.rawBass || 0.0, smoothFactor);
            this.smoothedParams.rawTreble = THREE.MathUtils.lerp(this.smoothedParams.rawTreble, visualParams.rawTreble || 0.0, smoothFactor);
            this.smoothedParams.movementSpeed = THREE.MathUtils.lerp(this.smoothedParams.movementSpeed, visualParams.movementSpeed || 1.0, smoothFactor);


            // --- Update Ambient Light ---
            if (this.ambientLight) {
                const intensityFactor = 0.8 + this.smoothedParams.globalIntensity * 0.4;
                this.ambientLight.intensity = this.baseSettings.ambientIntensity * intensityFactor;
                // Optional: Subtle color shift based on dreaminess
                // this.ambientLight.color.lerp(this.baseSettings.ambientColor.clone().multiplyScalar(0.8), this.smoothedParams.dreaminess * 0.1);
            }

            // --- Update Hemisphere Light ---
            if (this.hemisphereLight) {
                const intensityFactor = 0.7 + this.smoothedParams.globalIntensity * 0.6;
                this.hemisphereLight.intensity = this.baseSettings.hemiIntensity * intensityFactor;
                // Optional: Sky color slightly brighter with treble?
                // this.hemisphereLight.color.lerpColors(this.baseSettings.hemiSkyColor, new THREE.Color(1,1,1), this.smoothedParams.rawTreble * 0.05);
            }

            // --- Update Directional Light ---
            if (this.directionalLight) {
                // Intensity: Base + Global Intensity modulation + Peak Impact flash
                const intensityFactor = 0.6 + this.smoothedParams.globalIntensity * 0.7;
                const peakFlash = this.smoothedParams.peakImpact * 0.5; // Additive flash
                this.directionalLight.intensity = this.baseSettings.dirIntensity * intensityFactor + peakFlash;

                // Color: Base + subtle hue shift based on treble/dreaminess
                const targetColor = this.baseSettings.dirColor.clone();
                // Shift hue slightly towards blue/cool with treble, towards warm with bass?
                const hueShift = (this.smoothedParams.rawTreble - this.smoothedParams.rawBass) * 0.05;
                targetColor.offsetHSL(hueShift, 0, 0);
                // Desaturate slightly with dreaminess
                targetColor.lerp(new THREE.Color(1, 1, 1), this.smoothedParams.dreaminess * 0.1);
                this.directionalLight.color.lerp(targetColor, smoothFactor * 2.0); // Faster color lerp

                // Position: Slow orbit around the scene
                const orbitSpeed = 0.015 * this.smoothedParams.movementSpeed;
                this.lightOrbitAngle += orbitSpeed * deltaTime;
                this.directionalLight.position.set(
                    Math.cos(this.lightOrbitAngle) * this.DIRECTIONAL_LIGHT_DISTANCE,
                    this.directionalLight.position.y, // Keep height relatively constant or vary slowly
                    Math.sin(this.lightOrbitAngle) * this.DIRECTIONAL_LIGHT_DISTANCE
                );
                // Ensure the target remains updated (though it's static here)
                this.directionalLight.target.updateMatrixWorld();
            }
            
            // --- Update Point Lights ---
            this.pointLights.forEach((light, index) => {
                if (!light) return;
                
                // Make point lights react to audio
                const bassBump = this.smoothedParams.rawBass * 0.2;
                const trebleSparkle = this.smoothedParams.rawTreble * 0.15;
                
                // Modulate intensity based on audio
                const baseIntensity = light.userData.baseIntensity || this.defaultParams.pointLightIntensityBase;
                light.intensity = baseIntensity * (1.0 + bassBump + trebleSparkle);
                
                // Optional: Slowly move point lights
                const speed = (0.2 + index * 0.05) * this.smoothedParams.movementSpeed;
                light.position.x += Math.sin(time * speed + index) * 0.03;
                light.position.z += Math.cos(time * speed + index * 2) * 0.03;
                
                // Keep lights within reasonable bounds
                const distFromCenter = Math.sqrt(light.position.x * light.position.x + light.position.z * light.position.z);
                if (distFromCenter > 40) {
                    light.position.x *= 0.98;
                    light.position.z *= 0.98;
                }
            });

            // --- Update Post-Processing (Bloom) ---
            if (composer) {
                const bloomPass = composer.passes.find(pass => pass instanceof THREE.UnrealBloomPass);
                if (bloomPass) {
                    const baseBloom = this.baseSettings.baseBloom || 0.7;
                    // Bloom strength increases with global intensity and treble "sparkle"
                    const intensityFactor = 0.5 + this.smoothedParams.globalIntensity * 0.8;
                    const trebleFactor = this.smoothedParams.rawTreble * 0.4;
                    bloomPass.strength = baseBloom * intensityFactor + trebleFactor;
                    // Clamp bloom strength to avoid excessive brightness
                    bloomPass.strength = THREE.MathUtils.clamp(bloomPass.strength, 0.2, 2.5);
                }
            }

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during update:`, error);
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', 'Lighting system update error.');
            }
            // Consider disabling the module on repeated errors
            // this.isEnabled = false;
        }
    }
    
    /** 
     * Change mood with new settings 
     * @param {string} newMood - The new mood key
     * @param {object} newSettings - The new mood settings
     * @param {number} transitionTime - Time to transition between moods
     * @param {object} moodConfig - Optional mood configuration (volume, occurrence, intensity)
     */
    changeMood(newMood, newSettings, transitionTime, moodConfig) {
        if (!this.isEnabled || !this.scene) {
            console.error(`${this.MODULE_ID}: Cannot change mood - module not enabled or scene missing.`);
            return;
        }
        
        console.log(`${this.MODULE_ID}: Changing mood to '${newMood}' over ${transitionTime.toFixed(2)}s. Config:`, moodConfig);
        
        try {
            // Update mood and settings
            this.currentMood = newMood;
            
            // Store previous settings for transitions
            const prevSettings = { ...this.baseSettings };
            
            // Update base settings
            this._updateBaseSettings(newSettings);
            
            // Update mood config
            this.moodConfig = { ...this.moodConfig, ...moodConfig };
            
            // Immediate color transitions
            if (this.directionalLight) {
                this.directionalLight.color.copy(this.baseSettings.dirColor);
            }
            
            if (this.ambientLight) {
                this.ambientLight.color.copy(this.baseSettings.ambientColor);
            }
            
            if (this.hemisphereLight) {
                this.hemisphereLight.color.copy(this.baseSettings.hemiSkyColor);
                this.hemisphereLight.groundColor.copy(this.baseSettings.hemiGroundColor);
            }
            
            // Fog color transition
            if (this.scene.fog instanceof THREE.FogExp2) {
                this.scene.fog.color.copy(this.baseSettings.fogColor);
                // Apply new fog density through mood config
            }
            
            if (this.scene.background instanceof THREE.Color) {
                this.scene.background.copy(this.baseSettings.fogColor).multiplyScalar(0.8);
            }
            
            // Apply mood config (handles intensity transitions)
            this._applyMoodConfig(transitionTime);
            
            console.log(`${this.MODULE_ID}: Mood changed to '${newMood}'.`);
            
        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during mood change:`, error);
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', `Lighting system mood change failed: ${error.message}`);
            }
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
                    // Lights generally don't have geometry/material to dispose,
                    // but check just in case (e.g., if using light helpers later)
                    if (obj.geometry && typeof obj.geometry.dispose === 'function') {
                        obj.geometry.dispose();
                        disposedCount++;
                    }
                    if (obj.material && typeof obj.material.dispose === 'function') {
                        obj.material.dispose();
                        disposedCount++;
                    }
                    // Dispose shadow map textures if they exist (important!)
                    if (obj.shadow && obj.shadow.map && obj.shadow.map.dispose) {
                         obj.shadow.map.dispose();
                         obj.shadow.map = null; // Help GC
                         disposedCount++;
                    }
                    // If obj is the light itself, it's removed from scene.
                    // If it's the target (Object3D), it's also removed.
                }
            } catch (e) {
                console.error(`${this.MODULE_ID}: Error disposing object:`, obj, e);
            }
        });

        // Clear scene fog if this module set it
        // if (scene && scene.fog) {
        //     scene.fog = null;
        // }
        //  // Clear scene background if this module set it
        //  if (scene && scene.background instanceof THREE.Color) {
        //      scene.background = null; // Or set to a default
        //  }


        console.log(`${this.MODULE_ID}: Disposed ${disposedCount} resources.`);

        // Clear internal state
        this.objects = [];
        this.ambientLight = null;
        this.hemisphereLight = null;
        this.directionalLight = null;
        this.dLightTarget = null;
        this.pointLights = [];
        this.scene = null;
    }
}

// Make globally accessible if required by the project structure
window.VCLighting = VCLighting;