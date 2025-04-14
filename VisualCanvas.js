// VisualCanvas.js - Handles 3D visualization coordination and module management
// Part of the Harmonic Visions project by FatStinkyPanda
// Copyright (c) 2025 FatStinkyPanda - All rights reserved.
// Version: 3.0.0 (Modular Refactor)

class VisualCanvas {
    /**
     * @param {HTMLCanvasElement} canvasElement - The canvas element to render to.
     * @param {string} initialMood - The starting mood key (e.g., 'calm').
     */
    constructor(canvasElement, initialMood) {
        console.log("VisualCanvas: Initializing...");

        this.canvas = canvasElement;
        this.initialMood = initialMood || 'calm';

        // --- Dependencies ---
        // Get the singleton instance of the connector
        try {
            this.audioVisualConnector = AudioVisualConnector.getInstance();
            if (!this.audioVisualConnector) {
                throw new Error("AudioVisualConnector singleton instance is null or undefined.");
            }
        } catch (error) {
             console.error("VisualCanvas: CRITICAL - Failed to get AudioVisualConnector instance!", error);
             if (typeof ToastSystem !== 'undefined') {
                 ToastSystem.notify('error', `Visual init failed: Connector missing. Refresh required.`);
             }
             // Prevent further initialization if the connector is missing
             throw new Error("VisualCanvas cannot function without AudioVisualConnector.");
        }


        // --- Core Three.js ---
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.composer = null;
        this.controls = null;
        this.clock = new THREE.Clock();
        this.frameId = null;
        this.currentMood = this.initialMood;
        this.isPlaying = false;
        this.isInitialized = false;

        // --- Module Management ---
        this.visualModules = {}; // Stores instances { key: instance }
        this.loadedModules = {}; // Stores classes { key: class }
        // Define which modules to load and enable by default
        // Assumes EmotionVisualModules is loaded globally before this runs
        this.moduleConfig = this._createModuleConfig();


        // --- Performance ---
        this.performance = {
            lastFrameTime: 0,
            frameRates: [], // Could implement FPS counter later
            qualityAdjustTime: 0,
            adaptiveQuality: true, // Keep adaptive quality logic if desired
            pixelRatioLimit: 1.5, // Default limit, detectPerformance may override
            lastVisualParams: null // Store last valid params as fallback
        };

        // --- Initialization ---
        if (!this.canvas) {
            console.error("VisualCanvas: Canvas element is required!");
            throw new Error("VisualCanvas requires a valid canvas element."); // Stop initialization
        }

        try {
            this.detectPerformance(); // Detect performance before full init
            this.initThree();         // Initialize core Three.js components
            this.loadModules();       // Load visual effect module classes
            this.changeMood(this.initialMood, true); // Create the initial scene based on mood (true = initial setup)
            this.setupResizeListener();
            this.isInitialized = true;
            console.log("VisualCanvas initialized successfully.");
            // Start animation loop immediately, but it will check isPlaying internally
            this.animate(false); // Start loop but paused initially

        } catch (initError) {
             console.error("VisualCanvas: CRITICAL - Initialization failed during setup:", initError);
             this.dispose(); // Attempt cleanup
             throw initError; // Re-throw
        }
    }

     /**
      * Creates the initial module configuration based on available classes.
      * @private
      */
     _createModuleConfig() {
         // Define all potential modules and their class names
         const allPossibleModules = {
             lighting: { class: 'VCLighting' },
             stars: { class: 'VCStars' }, // vc_stars handles stars and nebulae now
             landscape: { class: 'VCLandscape' },
             water: { class: 'VCWater' },
             celestial: { class: 'VCCelestial' },
             plants: { class: 'VCPlants' },
             particles: { class: 'VCParticles' },
             clouds: { class: 'VCClouds' },
             dreamEffects: { class: 'VCDreamEffects' }
             // Add other potential vc_*.js class names here
         };

         const config = {};
         for (const key in allPossibleModules) {
             const className = allPossibleModules[key].class;
             // Check if the class actually exists (was loaded)
             if (typeof window[className] === 'function') {
                 config[key] = {
                     enabled: false, // Start disabled, changeMood will enable based on EmotionVisualList
                     class: className
                 };
             } else {
                  console.warn(`VisualCanvas: Visual module class ${className} not found. Module '${key}' cannot be used.`);
             }
         }
         return config;
     }

    // --- Core Three.js Initialization ---
    detectPerformance() {
        try {
            const testCanvas = document.createElement('canvas');
            // Attempt to get WebGL2 context first for better performance indicators
            let gl = testCanvas.getContext('webgl2');
            let highPerf = false;
            if (gl) {
                 console.log("VisualCanvas: WebGL2 context obtained.");
                 // Check for features common in higher-end GPUs with WebGL2
                 highPerf = gl.getParameter(gl.MAX_TEXTURE_SIZE) >= 8192 &&
                            gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS) >= 32;
            } else {
                 // Fallback to WebGL1
                 gl = testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl');
                 console.log("VisualCanvas: WebGL1 context obtained.");
                 if (gl) {
                      highPerf = gl.getParameter(gl.MAX_TEXTURE_SIZE) >= 4096 &&
                                 (gl.getExtension('WEBGL_depth_texture') != null);
                 }
            }

            this.performance.pixelRatioLimit = highPerf ? 2.0 : 1.5; // Higher limit for better GPUs
            console.log(`VisualCanvas: Performance check - High Performance: ${highPerf}, Pixel Ratio Limit set to: ${this.performance.pixelRatioLimit}`);
        } catch(e) {
             console.warn("VisualCanvas: Could not perform detailed performance check.", e);
             this.performance.pixelRatioLimit = 1.5; // Default to safer limit on error
        }
    }


    initThree() {
        console.log("VisualCanvas: Initializing Three.js core...");
        try {
            const width = window.innerWidth;
            const height = window.innerHeight;

            // Scene
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color('#000000'); // Default, mood can override via lighting module

            // Camera
            this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
            this.camera.position.set(0, 5, 30); // Default position
            this.camera.lookAt(0, 0, 0);

            // Renderer
            this.renderer = new THREE.WebGLRenderer({
                canvas: this.canvas,
                // Enable antialias conditionally based on performance check
                antialias: this.performance.pixelRatioLimit > 1.0,
                preserveDrawingBuffer: true, // Needed for VideoExporter
                powerPreference: "high-performance",
                alpha: true // Keep alpha for potential background effects or compositing
            });
            this.renderer.setSize(width, height);
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.performance.pixelRatioLimit));
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            this.renderer.toneMappingExposure = 1.1; // Adjusted exposure

            // Controls
            this.controls = new THREE.OrbitControls(this.camera, this.canvas);
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.05;
            this.controls.rotateSpeed = 0.4; // Slightly slower rotation
            this.controls.enableZoom = true; // Allow zoom for user preference
            this.controls.minDistance = 5;
            this.controls.maxDistance = 100;
            this.controls.enablePan = false; // Disable panning
            this.controls.autoRotate = true;
            this.controls.autoRotateSpeed = 0.1; // Default speed, will be updated by mood/params

             // Post-processing Composer
             this.composer = new THREE.EffectComposer(this.renderer);
             const renderPass = new THREE.RenderPass(this.scene, this.camera);
             this.composer.addPass(renderPass);

             // Unreal Bloom Pass (parameters can be adjusted by mood/lighting module)
             const bloomPass = new THREE.UnrealBloomPass(
                 new THREE.Vector2(width, height),
                 0.7, // strength
                 0.4, // radius
                 0.85 // threshold
             );
             this.composer.addPass(bloomPass);
             this.bloomPass = bloomPass; // Keep reference

             // FXAA Pass for anti-aliasing (especially if native AA is off)
             const fxaaPass = new THREE.ShaderPass(THREE.FXAAShader);
             const pixelRatio = this.renderer.getPixelRatio();
             fxaaPass.material.uniforms['resolution'].value.set(1 / (width * pixelRatio), 1 / (height * pixelRatio));
             this.composer.addPass(fxaaPass);
             this.fxaaPass = fxaaPass; // Keep reference

            console.log("VisualCanvas: Three.js core initialized.");

        } catch (error) {
            console.error("VisualCanvas: Error during Three.js initialization:", error);
            throw error; // Re-throw to indicate failure
        }
    }

    // --- Module Management ---
    loadModules() {
        console.log("VisualCanvas: Loading visual modules classes...");
        this.loadedModules = {}; // Reset loaded classes map

        for (const key in this.moduleConfig) {
            const config = this.moduleConfig[key];
            const className = config.class;

            // Check if the class constructor exists in the global scope
            if (typeof window[className] === 'function') {
                 this.loadedModules[key] = window[className]; // Store the class constructor
                 console.log(`VisualCanvas: Module class '${className}' found for key '${key}'.`);
            } else {
                // Class not found, ensure it's marked as disabled in the config
                console.warn(`VisualCanvas: Module class '${className}' for key '${key}' not found. Module disabled.`);
                config.enabled = false; // Update config directly
            }
        }
        console.log("VisualCanvas: Module class loading complete.");
    }

    // --- Scene Creation and Updates ---
    /**
     * Creates or updates the scene content based on the specified mood.
     * Disposes old module content and initializes newly enabled modules.
     * @param {string} mood - The target mood key.
     * @param {boolean} [isInitialSetup=false] - If true, skips disposal step.
     */
    createScene(mood, isInitialSetup = false) {
        console.log(`VisualCanvas: ${isInitialSetup ? 'Creating initial' : 'Updating'} scene for mood '${mood}'...`);
        if (!this.scene) {
            console.error("VisualCanvas: Scene not initialized, cannot create scene content.");
            return;
        }
        // Safely get mood settings and emotion module list
        const settings = (typeof moodSettings !== 'undefined' && moodSettings[mood])
            ? moodSettings[mood]
            : (typeof moodSettings !== 'undefined' ? moodSettings.calm : {}); // Fallback
        const enabledModuleKeys = (typeof EmotionVisualModules !== 'undefined' && EmotionVisualModules[mood])
            ? EmotionVisualModules[mood]
            : (typeof EmotionVisualModules !== 'undefined' ? EmotionVisualModules.default : []); // Fallback

        // --- Update Module Enablement based on EmotionVisualList ---
        const newlyEnabledModules = [];
        const modulesToDispose = [];

        for (const key in this.moduleConfig) {
            const shouldBeEnabled = enabledModuleKeys.includes(key);
            const isCurrentlyEnabled = this.moduleConfig[key].enabled;
            const instanceExists = !!this.visualModules[key];

            if (shouldBeEnabled && !isCurrentlyEnabled) {
                // Module should be enabled, but isn't currently
                this.moduleConfig[key].enabled = true;
                newlyEnabledModules.push(key);
                console.log(`VisualCanvas: Module '${key}' ENABLED for mood '${mood}'.`);
            } else if (!shouldBeEnabled && isCurrentlyEnabled) {
                // Module should be disabled, but is currently enabled
                this.moduleConfig[key].enabled = false;
                if (instanceExists) {
                    modulesToDispose.push(key); // Mark for disposal
                }
                console.log(`VisualCanvas: Module '${key}' DISABLED for mood '${mood}'.`);
            }
        }


        // --- Dispose Modules No Longer Enabled ---
        if (!isInitialSetup && modulesToDispose.length > 0) {
            console.log(`VisualCanvas: Disposing modules: ${modulesToDispose.join(', ')}`);
            modulesToDispose.forEach(key => {
                const moduleInstance = this.visualModules[key];
                if (moduleInstance && typeof moduleInstance.dispose === 'function') {
                    try {
                        moduleInstance.dispose(this.scene); // Pass scene for removal
                    } catch (error) {
                        console.error(`VisualCanvas: Error disposing module '${key}':`, error);
                    }
                }
                delete this.visualModules[key]; // Remove instance
            });
        }

        // --- Initialize Newly Enabled Modules ---
        if (newlyEnabledModules.length > 0) {
            console.log(`VisualCanvas: Initializing newly enabled modules: ${newlyEnabledModules.join(', ')}`);
            newlyEnabledModules.forEach(key => {
                const ModuleClass = this.loadedModules[key];
                 // Double check class exists and module should be enabled
                if (ModuleClass && this.moduleConfig[key].enabled) {
                    try {
                        console.log(`VisualCanvas: Instantiating/Initializing module '${key}'...`);
                        const moduleInstance = new ModuleClass();
                        moduleInstance.init(this.scene, settings, mood); // Pass mood to init
                        this.visualModules[key] = moduleInstance; // Store instance
                    } catch (error) {
                        console.error(`VisualCanvas: Error initializing newly enabled module '${key}':`, error);
                        this.moduleConfig[key].enabled = false; // Disable if init fails
                        if (typeof ToastSystem !== 'undefined') {
                            ToastSystem.notify('error', `Visual module '${key}' failed during init.`);
                        }
                    }
                } else {
                    console.warn(`VisualCanvas: Cannot initialize module '${key}', class not loaded or module disabled.`);
                    this.moduleConfig[key].enabled = false; // Ensure it's marked disabled
                }
            });
        }
        console.log(`VisualCanvas: Scene ${isInitialSetup ? 'created' : 'updated'} for mood:`, mood);
    }

    /**
     * Changes the active mood, updating settings and recreating scene elements.
     * @param {string} mood - The new mood key.
     * @param {boolean} [isInitialSetup=false] - Indicates if this is the first setup.
     */
    changeMood(mood, isInitialSetup = false) {
        // Basic validation
        if (!mood || (typeof moodSettings === 'undefined') || !moodSettings[mood]) {
            console.warn(`VisualCanvas: Invalid or unknown mood '${mood}'. Using previous: '${this.currentMood}'.`);
            if (typeof ToastSystem !== 'undefined') ToastSystem.notify('warning', `Invalid mood: ${mood}`);
            return;
        }
        // Prevent unnecessary changes unless it's the initial setup call
        if (mood === this.currentMood && !isInitialSetup) {
             console.log(`VisualCanvas: Mood '${mood}' is already active.`);
             return;
        }

        console.log(`VisualCanvas: Changing mood from '${this.currentMood}' to '${mood}' ${isInitialSetup ? '(Initial Setup)' : ''}`);
        this.currentMood = mood;

        // Update connector mood (even if visual canvas mood doesn't change, connector might need update)
        if (this.audioVisualConnector) {
             this.audioVisualConnector.setMood(mood);
        } else {
             console.error("VisualCanvas: Cannot set mood on connector - instance missing.");
        }


        // Update core components based on new mood settings
        const settings = moodSettings[this.currentMood]; // Get settings for the *new* mood

        // Update fog and background (handled by lighting module now, but set defaults)
        if (this.scene) {
             this.scene.fog = null; // Let lighting module handle fog creation/update
             this.scene.background = new THREE.Color(settings.fogColor || '#000000').multiplyScalar(0.8); // Default background
        }

        // Update controls based on base speed setting for the new mood
        if (this.controls) {
            this.controls.autoRotateSpeed = (settings.speed || 0.6) * 0.1; // Apply base speed immediately
        }
        // Update camera distance based on new mood settings
         if (this.camera) {
             // TODO: Add smooth camera transition later if desired
             this.camera.position.z = settings.cameraDistance || 30;
             this.camera.lookAt(0,0,0); // Ensure camera looks at origin after position change
         }
         // Update base bloom strength (lighting module might override this in its update)
         if (this.bloomPass) {
              const baseBloom = settings.bloom || 0.7;
              this.bloomPass.strength = baseBloom * (this.performance.pixelRatioLimit > 1.5 ? 1.2 : 1.0); // Base bloom slightly higher on better GPUs
         }

        // Recreate/update scene content using modules based on EmotionVisualList
        this.createScene(mood, isInitialSetup);
    }

    // --- Animation Loop ---
    /**
     * Starts or stops the main animation loop based on the isPlaying state.
     * @param {boolean} isPlaying - Whether the experience should be animating.
     */
    animate(isPlaying) {
        this.isPlaying = isPlaying;

        if (this.isPlaying && this.frameId === null && this.isInitialized) {
            // Start the loop if playing, not already running, and initialized
            console.log("VisualCanvas: Starting animation loop.");
            this.performance.lastFrameTime = performance.now(); // Reset timer
            this.clock.start(); // Ensure clock is running
            this.frameId = requestAnimationFrame(this._animationLoop);
        } else if (!this.isPlaying && this.frameId !== null) {
            // Stop the loop if not playing and it's running
            console.log("VisualCanvas: Stopping animation loop.");
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
            this.clock.stop(); // Stop the clock when paused
        }
        // If state matches loop status, or not initialized, do nothing
    }

    // Private animation loop function (bound via arrow function)
    _animationLoop = (timestamp) => {
        // --- Loop Stop Conditions ---
        if (!this.isPlaying || !this.scene || !this.isInitialized) {
            this.frameId = null; // Ensure loop stops if state changes
            this.clock.stop();
            console.log("VisualCanvas: Animation loop stopped (state changed or not initialized).");
            return;
        }

        // --- Calculate Delta Time ---
        const now = performance.now();
        // Clamp deltaTime to prevent large jumps if tab was inactive
        const rawDeltaTime = (now - this.performance.lastFrameTime) / 1000.0;
        const deltaTime = Math.min(rawDeltaTime, 1 / 30); // Clamp delta to max 30fps equivalent step
        this.performance.lastFrameTime = now;
        const elapsedTime = this.clock.getElapsedTime(); // Get elapsed time from clock

        // --- Get Visual Parameters from Connector ---
        let visualParams = this.performance.lastVisualParams; // Start with last known good params
        if (this.audioVisualConnector) {
            try {
                const newParams = this.audioVisualConnector.getVisualParams();
                if (newParams) { // Only update if connector returned valid params
                    visualParams = newParams;
                    this.performance.lastVisualParams = visualParams; // Store the new valid params
                } else {
                     console.warn("VisualCanvas: getVisualParams returned null/undefined, using last known params.");
                }
            } catch (connectorError) {
                console.error("VisualCanvas: Error getting visual params from connector:", connectorError);
                // Keep using last known params on error
                if (!visualParams) { // If there are no last known params, create a default fallback
                     visualParams = { /* minimal default structure */
                        globalIntensity: 1.0, movementSpeed: 1.0, dreaminess: 0.5, fluidity: 0.5,
                        cameraShake: 0.0, cameraAutoRotateSpeed: 0.1, particleSize: 1.0, particleSpeed: 1.0,
                        particleOpacity: 0.8, particleColorIntensity: 1.0, landscapeElevation: 1.0,
                        landscapeMorphSpeed: 0.3, landscapePulseStrength: 0.0, waterWaveHeight: 1.0,
                        waterRippleStrength: 0.0, mainLightIntensity: 1.0, ambientLightIntensity: 0.3,
                        fxGlow: 0.7, isBeat: false, peakImpact: 0.0, rawBass: 0.0, rawMid: 0.0,
                        rawTreble: 0.0, rawOverall: 0.0, rawFreqBands: new Array(24).fill(0)
                     };
                     this.performance.lastVisualParams = visualParams; // Store default as last known
                     console.warn("VisualCanvas: Using default visualParams due to connector error and no previous params.");
                }
            }
        } else {
             console.error("VisualCanvas: AudioVisualConnector instance missing in animation loop!");
             // Handle missing connector - maybe stop loop or use static defaults?
             // Using lastVisualParams or the default fallback created above.
              if (!visualParams) { // Create default if connector was missing from the start
                   visualParams = { /* minimal default structure */
                      globalIntensity: 1.0, movementSpeed: 1.0, dreaminess: 0.5, fluidity: 0.5,
                      cameraShake: 0.0, cameraAutoRotateSpeed: 0.1, particleSize: 1.0, particleSpeed: 1.0,
                      particleOpacity: 0.8, particleColorIntensity: 1.0, landscapeElevation: 1.0,
                      landscapeMorphSpeed: 0.3, landscapePulseStrength: 0.0, waterWaveHeight: 1.0,
                      waterRippleStrength: 0.0, mainLightIntensity: 1.0, ambientLightIntensity: 0.3,
                      fxGlow: 0.7, isBeat: false, peakImpact: 0.0, rawBass: 0.0, rawMid: 0.0,
                      rawTreble: 0.0, rawOverall: 0.0, rawFreqBands: new Array(24).fill(0)
                   };
                   this.performance.lastVisualParams = visualParams;
              }
        }


        // --- Update Modules ---
        // Pass necessary context: time, params, delta, camera, composer
        for (const key in this.moduleConfig) {
            if (this.moduleConfig[key].enabled && this.visualModules[key]) {
                const moduleInstance = this.visualModules[key];
                if (typeof moduleInstance.update === 'function') {
                    try {
                        moduleInstance.update(elapsedTime, visualParams, deltaTime, this.camera, this.composer);
                    } catch (error) {
                        console.error(`VisualCanvas: Error updating module '${key}':`, error);
                        // Optional: Disable module after repeated errors
                        // this.moduleConfig[key].enabled = false;
                        // if(typeof ToastSystem !== 'undefined') ToastSystem.notify('error', `Visual module '${key}' error. Effect disabled.`);
                    }
                }
            }
        }

        // --- Update Controls ---
        if (this.controls) {
            // Update auto-rotate speed based on visual params
            this.controls.autoRotateSpeed = visualParams.cameraAutoRotateSpeed || 0.1;
            this.controls.update(deltaTime); // Pass delta for damping
        }

        // --- Apply Camera Shake ---
        if (visualParams.cameraShake > 0.01) {
            const shakeAmount = visualParams.cameraShake * 0.1; // Scale down shake effect
            this.camera.position.x += (Math.random() - 0.5) * shakeAmount;
            this.camera.position.y += (Math.random() - 0.5) * shakeAmount;
            // Apply shake to lookAt target as well? Or just position? Position is simpler.
        }


        // --- Render Scene ---
        // Use composer if available, otherwise direct render
        if (this.composer) {
            try {
                this.composer.render(deltaTime);
            } catch (renderError) {
                 console.error("VisualCanvas: Error during composer render:", renderError);
                 this.isPlaying = false; // Stop playing on render error
            }
        } else if (this.renderer) {
            try {
                this.renderer.render(this.scene, this.camera); // Fallback
            } catch (renderError) {
                 console.error("VisualCanvas: Error during direct render:", renderError);
                 this.isPlaying = false; // Stop playing
            }
        }


        // --- Request Next Frame ---
        this.frameId = requestAnimationFrame(this._animationLoop);
    }


    // --- Event Handlers ---
    setupResizeListener() {
        // Use a bound version of handleResize to ensure `this` context
        this.boundHandleResize = this.handleResize.bind(this);
        window.addEventListener('resize', this.boundHandleResize);
    }

    handleResize() {
        if (!this.renderer || !this.camera || !this.composer) {
             console.warn("VisualCanvas: Resize handler called but renderer/camera/composer not ready.");
             return;
        }

        const width = window.innerWidth;
        const height = window.innerHeight;
        const pixelRatio = Math.min(window.devicePixelRatio, this.performance.pixelRatioLimit);

        // Update Camera
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        // Update Renderer and Composer
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(pixelRatio);
        this.composer.setSize(width, height);
        this.composer.setPixelRatio(pixelRatio); // Ensure composer pixel ratio is updated too

        // Update FXAA pass resolution uniform
         if (this.fxaaPass) {
            this.fxaaPass.material.uniforms['resolution'].value.set(1 / (width * pixelRatio), 1 / (height * pixelRatio));
         }
         // Update any other resolution-dependent passes or uniforms here
         console.log(`VisualCanvas: Resized to ${width}x${height} with pixelRatio ${pixelRatio.toFixed(2)}`);
    }

    // --- Cleanup ---
    dispose() {
        console.log("VisualCanvas: Disposing...");
        this.isInitialized = false; // Mark as not initialized
        this.isPlaying = false; // Ensure animation loop condition is false

        // Stop animation loop safely
        if (this.frameId) {
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
        }
        if(this.clock?.running) {
             this.clock.stop();
        }

        // Remove event listeners
        window.removeEventListener('resize', this.boundHandleResize);

        // Dispose controls
        if (this.controls) {
            this.controls.dispose();
            this.controls = null;
        }

        // Dispose modules first (they might remove objects from scene)
        console.log("VisualCanvas: Disposing visual modules...");
        for (const key in this.visualModules) {
            const moduleInstance = this.visualModules[key];
            if (moduleInstance && typeof moduleInstance.dispose === 'function') {
                try {
                    moduleInstance.dispose(this.scene); // Pass scene for object removal
                } catch (error) {
                    console.error(`VisualCanvas: Error disposing module '${key}':`, error);
                }
            }
        }
        this.visualModules = {};
        this.loadedModules = {};
        this.moduleConfig = {}; // Clear config

        // Dispose Three.js core objects
        if (this.composer) {
             // Dispose passes if they have dispose methods
             this.composer.passes.forEach(pass => {
                 if (typeof pass.dispose === 'function') {
                     pass.dispose();
                 }
             });
            this.composer = null;
        }
         this.bloomPass = null; // Clear refs
         this.fxaaPass = null;

        // Attempt to clean scene children thoroughly
        if (this.scene) {
            while(this.scene.children.length > 0){
                const object = this.scene.children[0];
                this.scene.remove(object);
                // Attempt to dispose geometry and material if present
                if (object.geometry && typeof object.geometry.dispose === 'function') {
                    object.geometry.dispose();
                }
                if (object.material) {
                     if (Array.isArray(object.material)) {
                         object.material.forEach(material => {
                              if(material && typeof material.dispose === 'function') material.dispose();
                         });
                     } else if (typeof object.material.dispose === 'function') {
                          object.material.dispose();
                     }
                }
            }
            this.scene = null;
        }


        if (this.renderer) {
            try {
                this.renderer.dispose();
                this.renderer.forceContextLoss(); // Try to release GPU resources
                 console.log("VisualCanvas: Renderer context loss forced.");
            } catch (e) {
                 console.error("VisualCanvas: Error during renderer cleanup:", e);
            }
            this.renderer.domElement = null; // Remove reference
            this.renderer = null;
        }

        // Release connector reference (don't dispose the singleton)
        this.audioVisualConnector = null;

        this.camera = null;
        this.clock = null;
        this.performance.lastVisualParams = null; // Clear last params

        console.log("VisualCanvas disposed.");
    }
}

window.VisualCanvas = VisualCanvas;