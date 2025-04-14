// AudioEngine.js - Modular Audio Engine Coordinator
// Part of the Harmonic Visions project by FatStinkyPanda
// Copyright (c) 2025 FatStinkyPanda - All rights reserved.
// Version: 3.1.1 (Enhanced Audio Analyzer and Error Handling)

/**
 * @class AudioEngine
 * @description Coordinates audio playback, manages audio modules,
 *              and handles the master audio processing chain.
 */
class AudioEngine {
    constructor(initialIsPlaying = false, initialVolume = 0.7, initialMood = 'calm') {
        console.log("AudioEngine: Initializing...");

        // Initialize error tracking
        this._errorLog = [];
        this._fatalErrors = new Set();
        this._recoveryAttempts = 0;
        this._maxRecoveryAttempts = 3;
        this._lastErrorTime = 0;
        this._errorCount = 0;
        
        // --- Core State ---
        this.isPlaying = initialIsPlaying;
        this.volume = initialVolume;
        this.currentMood = initialMood;
        this.audioContext = null;
        this.isInitialized = false;
        this.frameId = null; // For the internal update loop
        
        // Analyzer diagnostics
        this._analyzerSilentFrames = 0;
        this._maxSilentFrames = 60; // ~ 1 second at 60fps
        this._analyzerDiagnosticRun = false;
        this._lastAnalyzerCheck = 0;
        this._silenceLogged = false;
        
        // Use performance.now() for clock if THREE is not guaranteed globally here
        this.clock = {
            startTime: performance.now(),
            elapsedTime: 0,
            getDelta: function() {
                try {
                    const newTime = performance.now();
                    const diff = (newTime - this.startTime) / 1000 - this.elapsedTime;
                    this.elapsedTime += diff;
                    return diff;
                } catch (error) {
                    console.error("AudioEngine: Clock getDelta error:", error);
                    return 0.016; // Return a default frame time (60fps) on error
                }
            },
            getElapsedTime: function() {
                try {
                    return this.elapsedTime;
                } catch (error) {
                    console.error("AudioEngine: Clock getElapsedTime error:", error);
                    return 0;
                }
            },
            start: function() {
                try {
                    this.startTime = performance.now();
                    this.elapsedTime = 0;
                } catch (error) {
                    console.error("AudioEngine: Clock start error:", error);
                }
            },
            stop: function() {
                 // No explicit stop action needed for performance.now clock
            }
        };


        // --- Master Processing Nodes ---
        this.masterInputGain = null; // Modules connect here
        this.masterOutputGain = null; // Final volume control
        this.masterLimiter = null;
        this.masterAnalyser = null; 
        this.dummyOscillator = null; // For analyzer testing
        this.masterReverb = null;
        this.masterCompressor = null;
        this.masterEQ = null; // Placeholder for potential EQ structure
        this.masterEnhancer = null; // Placeholder for stereo enhancer

        // --- Module Management ---
        this.audioModules = {}; // Stores active module instances { key: instance }
        this.loadedModuleClasses = {}; // Stores loaded class constructors { key: class }
        this._moduleErrorCounts = {}; // Track errors per module
        // Configuration moved to EmotionAudioList.js, but keep a reference placeholder if needed
        // this.moduleConfig = {}; // Config is now primarily driven by EmotionAudioModules

        // --- Audio Data for Visualization ---
        this.audioData = null; // Uint8Array, initialized later
        this._lastNonZeroDataTime = 0; // Track when we last had non-zero data

        // --- Initialization ---
        try {
            this.initAudioCore();
            this.loadModules(); // Load classes based on all ae_*.js files found

            // --- SET INITIALIZED FLAG *BEFORE* INITIAL MOOD SETUP ---
            this.isInitialized = true;
            console.log("AudioEngine: Core initialized, setting initial mood...");

            this.changeMood(this.currentMood, true); // Initial setup without transition

            // --- Start update loop AFTER initialization is complete ---
            this._startUpdateLoop(); // Start the internal update loop
            console.log("AudioEngine: Initialization complete.");
        } catch (error) {
            this._logError('Initialization', 'Failed to initialize audio engine', error, true);
            this.isInitialized = false;
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', `Audio Engine failed to initialize: ${error.message}. Audio disabled.`);
            }
            // Attempt cleanup
            this.dispose();
        }
    }

    /**
     * Enhanced error logging system
     * @private
     * @param {string} source - The source of the error (method or component)
     * @param {string} message - Human-readable error message
     * @param {Error|null} error - The error object if available
     * @param {boolean} fatal - Whether this is a fatal error requiring recovery
     * @returns {Error|null} The original error for optional rethrowing
     */
    _logError(source, message, error, fatal = false) {
        const timestamp = new Date().toISOString();
        const errorDetails = error ? (error.stack || error.toString()) : 'No error object';
        const fullMessage = `[${timestamp}] [AudioEngine] [${fatal ? 'FATAL' : 'ERROR'}] [${source}] ${message}\n${errorDetails}`;
        
        console.error(fullMessage);
        
        // Limit error frequency to prevent flooding
        const now = Date.now();
        if (now - this._lastErrorTime < 1000) { // Within 1 second of last error
            this._errorCount++;
            if (this._errorCount > 10) { // More than 10 errors in a second
                console.warn("AudioEngine: Too many errors occurring too quickly. Suppressing error logging temporarily.");
                this._lastErrorTime = now;
                return error;
            }
        } else {
            this._errorCount = 1;
            this._lastErrorTime = now;
        }
        
        // Track errors for potential analytics or reporting
        if (!this._errorLog) this._errorLog = [];
        this._errorLog.push({
            timestamp,
            source,
            message,
            details: errorDetails,
            fatal
        });
        
        // Keep error log from growing too large
        if (this._errorLog.length > 100) {
            this._errorLog = this._errorLog.slice(-50); // Keep only the 50 most recent errors
        }
        
        // Notify user if we have a toast system
        if (typeof ToastSystem !== 'undefined') {
            const userMessage = fatal 
                ? `Critical audio error: ${message} - Audio may not function correctly.`
                : `Audio warning: ${message}`;
            ToastSystem.notify(fatal ? 'error' : 'warning', userMessage);
        }
        
        // For fatal errors, potentially disable features or trigger recovery
        if (fatal) {
            this._handleFatalError(source);
        }
        
        return error; // Return the original error for rethrowing if needed
    }

    /**
     * Handle fatal errors by disabling features or attempting recovery
     * @private
     * @param {string} source - The source of the fatal error
     */
    _handleFatalError(source) {
        // Track which subsystems have fatal errors
        if (!this._fatalErrors) this._fatalErrors = new Set();
        this._fatalErrors.add(source);
        
        // If audio context failed, try to recreate it
        if (source === 'AudioContext' && this._recoveryAttempts < this._maxRecoveryAttempts) {
            this._recoveryAttempts++;
            this._attemptAudioContextRecovery();
        }
        
        // Disable playing if we have too many fatal errors
        if (this._fatalErrors.size >= 3) {
            console.warn("[AudioEngine] Too many fatal errors, disabling audio playback");
            this.isPlaying = false;
            try {
                this._syncModulesPlayState(false);
            } catch (error) {
                console.error("AudioEngine: Failed to stop playback after fatal errors:", error);
            }
        }
    }

    /**
     * Attempt to recover from AudioContext failures
     * @private
     */
    _attemptAudioContextRecovery() {
        console.log("[AudioEngine] Attempting to recover from AudioContext failure");
        
        // Wait a moment then try to re-initialize
        setTimeout(() => {
            try {
                this.initAudioCore();
                console.log("[AudioEngine] AudioContext recovery successful");
                if (typeof ToastSystem !== 'undefined') {
                    ToastSystem.notify('success', 'Audio system recovered');
                }
            } catch (err) {
                console.error("[AudioEngine] AudioContext recovery failed:", err);
            }
        }, 2000);
    }

    /**
     * Initializes the core AudioContext and master processing chain.
     * @private
     */
    initAudioCore() {
        console.log("AudioEngine: Initializing Web Audio API Core...");
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) {
                throw new Error("Web Audio API is not supported by this browser.");
            }
            
            try {
                this.audioContext = new AudioContext({
                    latencyHint: 'interactive',
                    sampleRate: 48000 // Higher sample rate for potentially better quality
                });
                console.log(`AudioEngine: AudioContext created with sample rate ${this.audioContext.sampleRate}`);
            } catch (contextError) {
                // Try again with default options if custom options failed
                console.warn("AudioEngine: Failed to create AudioContext with custom options, trying defaults");
                this.audioContext = new AudioContext();
                console.log(`AudioEngine: Fallback AudioContext created with sample rate ${this.audioContext.sampleRate}`);
            }

            if (!this.audioContext) {
                throw new Error("Failed to create AudioContext instance");
            }

            // Handle suspended state (common before user interaction)
            this._setupContextResumeHandlers();

            // --- Create Master Processing Chain ---
            this._createMasterProcessingChain();

            // --- ADDED: Final Connection Logging ---
            console.log(`AudioEngine: Analyser connected to destination? ${this.audioContext.destination ? 'Yes' : 'NO!!'}`);
            if (!this.audioContext.destination) {
                throw new Error("AudioContext destination node is missing."); // Prevent further init if this fails
            }
            // --- END LOGGING ---

            console.log("AudioEngine: Master processing chain created.");

        } catch (error) {
            this._logError('AudioContext', 'Error initializing Web Audio API', error, true);
            this.audioContext = null; // Ensure context is null on failure
            throw error; // Re-throw to signal failure
        }
    }

    /**
     * Sets up the handlers for resuming suspended AudioContext
     * @private
     */
    _setupContextResumeHandlers() {
        if (!this.audioContext) return;
        
        if (this.audioContext.state === 'suspended') {
            console.warn("AudioEngine: AudioContext is suspended. Waiting for user interaction to resume.");
            
            const resumeContext = async () => {
                if (this.audioContext && this.audioContext.state === 'suspended') { // Check state again
                    try {
                        await this.audioContext.resume();
                        console.log("AudioEngine: AudioContext resumed successfully by user interaction.");
                        if (typeof ToastSystem !== 'undefined') {
                            ToastSystem.notify('success', 'Audio activated!');
                        }
                        // If the intention was to play, re-trigger the play state logic
                        if (this.isPlaying && this.isInitialized) {
                            this._syncModulesPlayState(true);
                        }
                    } catch (resumeError) {
                        this._logError('AudioContext', 'Failed to resume AudioContext via interaction', resumeError);
                        if (typeof ToastSystem !== 'undefined') {
                            ToastSystem.notify('error', 'Could not activate audio. Please click or tap the screen again.');
                        }
                    } finally {
                        // Clean up listeners carefully
                        document.removeEventListener('click', resumeContext);
                        document.removeEventListener('keydown', resumeContext);
                        document.removeEventListener('touchstart', resumeContext);
                    }
                } else {
                     // Already resumed or closed, remove listeners
                     document.removeEventListener('click', resumeContext);
                     document.removeEventListener('keydown', resumeContext);
                     document.removeEventListener('touchstart', resumeContext);
                }
            };
            
            // Store references to event listeners for proper removal in dispose()
            this._resumeContextHandler = resumeContext;
            
            // Add multiple event listeners to maximize chances of resuming
            document.addEventListener('click', resumeContext, { once: true });
            document.addEventListener('keydown', resumeContext, { once: true });
            document.addEventListener('touchstart', resumeContext, { once: true });
        }
    }

    /**
     * Removes the context resume handlers
     * @private
     */
    _removeContextResumeHandlers() {
        if (this._resumeContextHandler) {
            document.removeEventListener('click', this._resumeContextHandler);
            document.removeEventListener('keydown', this._resumeContextHandler);
            document.removeEventListener('touchstart', this._resumeContextHandler);
            this._resumeContextHandler = null;
        }
    }

    /**
     * Creates the master audio processing chain
     * @private
     */
    _createMasterProcessingChain() {
        try {
            // 1. Master Input Gain (Modules connect here)
            this.masterInputGain = this.audioContext.createGain();
            this.masterInputGain.gain.value = 1.0; // Start at full gain, modules control their own level

            // 2. Master EQ (Placeholder - implement specific EQ bands if needed)
            this.masterEQ = this.audioContext.createBiquadFilter();
            this.masterEQ.type = 'highpass';
            this.masterEQ.frequency.setValueAtTime(30, this.audioContext.currentTime); // Cut sub-bass rumble
            this.masterEQ.Q.setValueAtTime(0.7, this.audioContext.currentTime);

            // 3. Master Compressor
            this.masterCompressor = this.audioContext.createDynamicsCompressor();
            this.masterCompressor.threshold.setValueAtTime(-18.0, this.audioContext.currentTime);
            this.masterCompressor.knee.setValueAtTime(20.0, this.audioContext.currentTime);
            this.masterCompressor.ratio.setValueAtTime(4.0, this.audioContext.currentTime); // Gentle compression
            this.masterCompressor.attack.setValueAtTime(0.01, this.audioContext.currentTime);
            this.masterCompressor.release.setValueAtTime(0.15, this.audioContext.currentTime);

            // 4. Master Reverb (Convolution or Algorithmic)
            this.masterReverb = this.audioContext.createConvolver();
            this._updateMasterReverb('calm'); // Initialize with default calm reverb

            // 5. Master Output Gain (Volume Control)
            this.masterOutputGain = this.audioContext.createGain();
            this.masterOutputGain.gain.setValueAtTime(this.volume, this.audioContext.currentTime);

            // 6. Master Limiter (Brickwall)
            this.masterLimiter = this.audioContext.createDynamicsCompressor();
            this.masterLimiter.threshold.setValueAtTime(-0.5, this.audioContext.currentTime); // Limit just below 0dBFS
            this.masterLimiter.knee.setValueAtTime(0, this.audioContext.currentTime);      // Hard knee
            this.masterLimiter.ratio.setValueAtTime(20.0, this.audioContext.currentTime);   // High ratio
            this.masterLimiter.attack.setValueAtTime(0.001, this.audioContext.currentTime); // Fast attack
            this.masterLimiter.release.setValueAtTime(0.01, this.audioContext.currentTime); // Fast release

            // 7. Master Analyser (For Visualization)
            this.masterAnalyser = this.audioContext.createAnalyser();
            this.masterAnalyser.fftSize = 2048; // Standard size
            this.masterAnalyser.smoothingTimeConstant = 0.8;
            this.masterAnalyser.minDecibels = -90; // Default is -100, raising to -90 helps ignore background noise
            this.masterAnalyser.maxDecibels = -10; // Default is -30, raising for better visualization range
            
            try {
                this.audioData = new Uint8Array(this.masterAnalyser.frequencyBinCount);
            } catch (dataError) {
                this._logError('MasterChain', 'Failed to create audio data array', dataError);
                this.audioData = new Uint8Array(1024); // Fallback size
            }

            // Create a debug oscillator for testing analyzer connection
            this._createDebugOscillator();

            // --- Connect Master Chain ---
            this._connectMasterChain();
            
        } catch (error) {
            this._logError('MasterChain', 'Failed to create master audio processing chain', error, true);
            throw error; // Re-throw to signal critical failure
        }
    }

    /**
     * Creates a debug oscillator for analyzer testing
     * @private
     */
    _createDebugOscillator() {
        try {
            // Create a silent oscillator we can use to test the analyzer
            this.dummyOscillator = this.audioContext.createOscillator();
            this.dummyOscillator.type = 'sine';
            this.dummyOscillator.frequency.value = 440; // A4
            
            // Create a gain node to control its volume (keep it silent by default)
            this.dummyGain = this.audioContext.createGain();
            this.dummyGain.gain.value = 0; // Silent
            
            // Connect oscillator -> gain -> master input
            this.dummyOscillator.connect(this.dummyGain);
            
            // Don't connect to the chain yet - we'll only do this for diagnostics
            
            // Start the oscillator (it's silent due to the gain setting)
            this.dummyOscillator.start();
            console.log("AudioEngine: Debug oscillator created");
        } catch (error) {
            console.warn("AudioEngine: Failed to create debug oscillator:", error);
            // This is non-critical, so we can continue without it
        }
    }

    /**
     * Connects all nodes in the master processing chain
     * @private
     */
    _connectMasterChain() {
        try {
            // Input -> EQ -> Compressor -> Reverb -> Output Gain -> Limiter -> Analyser -> Destination
            this.masterInputGain.connect(this.masterEQ);
            this.masterEQ.connect(this.masterCompressor);
            this.masterCompressor.connect(this.masterReverb);
            this.masterReverb.connect(this.masterOutputGain); // Reverb feeds into volume control
            // Optional Dry Path (Bypass Reverb): If needed, add a dry gain node in parallel
            // this.masterCompressor.connect(dryGain); dryGain.connect(this.masterOutputGain);
            this.masterOutputGain.connect(this.masterLimiter);
            this.masterLimiter.connect(this.masterAnalyser);
            this.masterAnalyser.connect(this.audioContext.destination);
            
            // Add a direct connection from input gain to analyzer to ensure it gets signal
            // This helps diagnose if there's a problem with the effects chain
            this.masterInputGain.connect(this.masterAnalyser);
            
            console.log("AudioEngine: Master chain connected successfully");
        } catch (error) {
            this._logError('MasterChain', 'Failed to connect master chain nodes', error, true);
            throw error; // Connection failure is critical
        }
    }

    /**
     * Runs a diagnostic on the analyzer to check if it's receiving audio
     * @private
     */
    _runAnalyzerDiagnostic() {
        if (!this.audioContext || !this.masterAnalyser || !this.dummyOscillator || this._analyzerDiagnosticRun) {
            return;
        }
        
        console.log("AudioEngine: Running analyzer diagnostic test");
        this._analyzerDiagnosticRun = true;
        
        try {
            // Temporarily connect and boost the test oscillator
            this.dummyGain.gain.setValueAtTime(0.01, this.audioContext.currentTime); // Very quiet but audible
            this.dummyGain.connect(this.masterAnalyser);
            
            // After 500ms, check if we're getting data
            setTimeout(() => {
                try {
                    // Check if we're getting any data
                    const testData = new Uint8Array(this.masterAnalyser.frequencyBinCount);
                    this.masterAnalyser.getByteFrequencyData(testData);
                    
                    // Look for any non-zero values
                    let hasSignal = false;
                    for (let i = 0; i < testData.length; i++) {
                        if (testData[i] > 0) {
                            hasSignal = true;
                            break;
                        }
                    }
                    
                    if (hasSignal) {
                        console.log("AudioEngine: Analyzer diagnostic passed - detected test tone");
                        
                        // If we're not getting real audio but the analyzer works, log a warning
                        if (this._analyzerSilentFrames > this._maxSilentFrames) {
                            console.warn("AudioEngine: Analyzer is working but not receiving audio from modules");
                        }
                    } else {
                        console.error("AudioEngine: Analyzer diagnostic failed - no signal detected");
                        
                        // Try to fix the analyzer connections
                        this._attemptAnalyzerReconnection();
                    }
                } catch (error) {
                    console.error("AudioEngine: Error during analyzer diagnostic:", error);
                } finally {
                    // Always disconnect and silence the test oscillator
                    try {
                        this.dummyGain.gain.setValueAtTime(0, this.audioContext.currentTime);
                        this.dummyGain.disconnect();
                    } catch (cleanupError) {
                        console.warn("AudioEngine: Error cleaning up diagnostic oscillator:", cleanupError);
                    }
                }
            }, 500);
        } catch (error) {
            console.error("AudioEngine: Error setting up analyzer diagnostic:", error);
            this._analyzerDiagnosticRun = false; // Allow retry
        }
    }

    /**
     * Attempts to fix analyzer connections if diagnostic fails
     * @private
     */
    _attemptAnalyzerReconnection() {
        console.log("AudioEngine: Attempting to fix analyzer connections");
        
        try {
            // Disconnect and reconnect the analyzer
            this.masterAnalyser.disconnect();
            
            // Reconnect in the chain
            this.masterLimiter.connect(this.masterAnalyser);
            this.masterAnalyser.connect(this.audioContext.destination);
            
            // Add direct connections to ensure signal path
            this.masterInputGain.connect(this.masterAnalyser);
            this.masterOutputGain.connect(this.masterAnalyser);
            
            console.log("AudioEngine: Analyzer connections rebuilt");
            
            // Create a new audio data buffer to match the analyzer
            try {
                this.audioData = new Uint8Array(this.masterAnalyser.frequencyBinCount);
            } catch (bufferError) {
                console.error("AudioEngine: Failed to recreate audio data buffer:", bufferError);
            }
        } catch (error) {
            console.error("AudioEngine: Failed to fix analyzer connections:", error);
        }
    }

    /**
     * Loads and stores the constructors for available audio modules by checking window scope.
     * @private
     */
    loadModules() {
        console.log("AudioEngine: Loading audio module classes...");
        this.loadedModuleClasses = {}; // Reset
        
        try {
            // Track loaded and failed modules
            const loadedModules = [];
            const failedModules = [];

            // Dynamically find all potential AE module classes
            for (const key in window) {
                try {
                    if (key.startsWith('AE') && typeof window[key] === 'function' && window[key].prototype) {
                        // Basic check: Starts with AE, is a function, has a prototype (likely a class)
                        const moduleKey = key; // Use the full class name as the key for simplicity, or derive a shorter key
                        this.loadedModuleClasses[moduleKey] = window[key];
                        loadedModules.push(moduleKey);
                        console.log(`AudioEngine: Module class '${key}' loaded.`);
                    }
                } catch (moduleError) {
                    failedModules.push(key);
                    this._logError('ModuleLoading', `Failed to load module class '${key}'`, moduleError);
                }
            }

            console.log(`AudioEngine: Module class loading complete. Loaded: ${loadedModules.length}, Failed: ${failedModules.length}`);
            
            if (loadedModules.length === 0) {
                console.warn("AudioEngine: No audio modules were loaded. Audio functionality may be limited.");
            }
        } catch (error) {
            this._logError('ModuleLoading', 'Error during module class loading process', error);
            // Continue execution even if module loading fails - some features will be missing
        }
    }

    /**
     * Instantiates and initializes enabled audio modules for the current mood.
     * Uses EmotionAudioModules to determine which modules to activate.
     * @param {string} mood - The target mood.
     * @param {object} settings - The audio settings for the target mood.
     * @private
     * @returns {boolean} Whether initialization was successful
     */
    _initModulesForMood(mood, settings) {
        console.log(`AudioEngine: Initializing modules for mood '${mood}'...`);
        
        // Validation
        if (!this.audioContext || !this.masterInputGain) {
            this._logError('ModuleInit', 'Cannot initialize modules - AudioContext or master input node missing', null, true);
            return false;
        }
        
        if (typeof EmotionAudioModules === 'undefined') {
             this._logError('ModuleInit', 'EmotionAudioModules configuration is missing. Cannot initialize modules', null, true);
             return false;
        }

        try {
            // Dispose existing instances before creating new ones
            this._disposeModuleInstances();

            const modulesForMood = EmotionAudioModules[mood] || EmotionAudioModules.default || [];
            console.log(`AudioEngine: Modules to activate for mood '${mood}':`, modulesForMood);

            const activatedModules = [];
            const failedModules = [];

            for (const moduleKey of modulesForMood) {
                try {
                    // Example: 'ae_pads' -> 'pads' -> 'Pads' -> 'AEPads'
                    // Example: 'ae_pad_soft_string' -> 'pad_soft_string' -> 'Pad_soft_string' -> 'PadSoftString' -> 'AEPadSoftString'
                    let derivedName = moduleKey.replace(/^ae_/, ''); // 1. Remove prefix -> 'pads' or 'pad_soft_string'
                    if (derivedName) {
                        derivedName = derivedName.charAt(0).toUpperCase() + derivedName.slice(1); // 2. Capitalize first letter -> 'Pads' or 'Pad_soft_string'
                        derivedName = derivedName.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase()); // 3. Handle underscores -> 'Pads' or 'PadSoftString'
                    }
                    const className = 'AE' + derivedName; // 4. Prepend AE -> 'AEPads' or 'AEPadSoftString'
                    
                    const ModuleClass = this.loadedModuleClasses[className];

                    if (ModuleClass) {
                        console.log(`AudioEngine: Instantiating module '${className}'...`);
                        const moduleInstance = new ModuleClass();
                        console.log(`AudioEngine: Initializing module '${className}' instance...`);
                        
                        // Pass context, master input node, mood-specific settings, and mood key
                        moduleInstance.init(this.audioContext, this.masterInputGain, settings, mood);
                        this.audioModules[className] = moduleInstance; // Store instance using class name as key
                        activatedModules.push(className);
                        console.log(`AudioEngine: Module '${className}' initialized successfully.`);
                    } else {
                        failedModules.push(className);
                        this._logError('ModuleInit', `Module class '${className}' not found in loaded classes`, new Error('Module class not found'));
                    }
                } catch (moduleError) {
                    failedModules.push(moduleKey);
                    this._logError('ModuleInit', `Failed to initialize module '${moduleKey}' for mood '${mood}'`, moduleError);
                    
                    if (typeof ToastSystem !== 'undefined') {
                        ToastSystem.notify('error', `Audio module '${moduleKey}' failed to load.`);
                    }
                }
            }

            console.log(`AudioEngine: Module initialization for mood '${mood}' complete. Success: ${activatedModules.length}, Failed: ${failedModules.length}`);
            
            // Reset analyzer diagnostics on mood change
            this._analyzerSilentFrames = 0;
            this._analyzerDiagnosticRun = false;
            this._silenceLogged = false;
            
            return activatedModules.length > 0; // Return true if at least one module was activated
        } catch (error) {
            this._logError('ModuleInit', `Error in module initialization process for mood '${mood}'`, error);
            return false;
        }
    }

    /**
     * Disposes of all current audio module instances.
     * @private
     */
    _disposeModuleInstances() {
        console.log("AudioEngine: Disposing existing module instances...");
        
        try {
            const moduleKeys = Object.keys(this.audioModules);
            const disposedModules = [];
            const failedModules = [];
            
            for (const key of moduleKeys) {
                try {
                    const module = this.audioModules[key];
                    if (module && typeof module.dispose === 'function') {
                        console.log(`AudioEngine: Disposing module instance '${key}'...`);
                        module.dispose();
                        disposedModules.push(key);
                    } else if (module) {
                        console.warn(`AudioEngine: Module '${key}' has no dispose method. Skipping cleanup.`);
                        failedModules.push(key);
                    }
                } catch (moduleError) {
                    failedModules.push(key);
                    this._logError('ModuleDispose', `Error disposing module '${key}'`, moduleError);
                }
            }
            
            this.audioModules = {}; // Clear the instances object
            console.log(`AudioEngine: Module disposal complete. Success: ${disposedModules.length}, Failed: ${failedModules.length}`);
        } catch (error) {
            this._logError('ModuleDispose', 'Error in module disposal process', error);
            this.audioModules = {}; // Still clear instances to prevent memory leaks
        }
    }

    /**
     * Starts the internal update loop using requestAnimationFrame.
     * @private
     */
    _startUpdateLoop() {
        if (this.frameId !== null) return; // Already running
        console.log("AudioEngine: Starting internal update loop.");
        
        try {
            this.clock.start(); // Start the clock when the loop starts
            this._updateErrorCount = 0; // Reset error counter
            
            const loop = (timestamp) => {
                if (!this.isInitialized) { // Stop if engine is disposed
                    this.frameId = null;
                    console.log("AudioEngine: Update loop stopped (engine disposed).");
                    return;
                }

                try {
                    const deltaTime = this.clock.getDelta();
                    const elapsedTime = this.clock.getElapsedTime();

                    // Only proceed with updates if time values are valid
                    if (isNaN(deltaTime) || isNaN(elapsedTime)) {
                        throw new Error(`Invalid time values: deltaTime=${deltaTime}, elapsedTime=${elapsedTime}`);
                    }

                    this._updateModules(elapsedTime, deltaTime);
                    this._updateAnalyser();
                    
                    // Check audio paths periodically (every ~5 seconds)
                    const now = Date.now();
                    if (now - this._lastAnalyzerCheck > 5000) {
                        this._checkAudioPaths();
                        this._lastAnalyzerCheck = now;
                    }
                    
                    // Reset error count on successful frame
                    this._updateErrorCount = 0;
                } catch (updateError) {
                    this._updateErrorCount++;
                    this._logError('UpdateLoop', 'Error in update loop', updateError);
                    
                    // Stop loop after too many consecutive errors
                    if (this._updateErrorCount > 10) {
                        this._logError('UpdateLoop', 'Too many consecutive update errors, stopping loop', updateError, true);
                        this._stopUpdateLoop();
                        return;
                    }
                }

                this.frameId = requestAnimationFrame(loop);
            };
            
            this.frameId = requestAnimationFrame(loop);
        } catch (error) {
            this._logError('UpdateLoop', 'Failed to start update loop', error);
        }
    }

    /**
     * Stops the internal update loop.
     * @private
     */
    _stopUpdateLoop() {
        if (this.frameId !== null) {
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
            this.clock.stop(); // Stop the clock when the loop stops
            console.log("AudioEngine: Stopped internal update loop.");
        }
    }

    /**
     * Check audio signal paths and connectivity
     * @private
     */
    /**
     * Check audio signal paths and connectivity periodically.
     * Runs diagnostics if prolonged silence is detected while playing.
     * This method is called internally by the update loop.
     * @private
     */
    _checkAudioPaths() {
        // Guard clauses: Don't run checks if not initialized, not supposed to be playing,
        // or if the audio context is missing.
        if (!this.isInitialized || !this.isPlaying || !this.audioContext) {
            // console.debug("AudioEngine: Skipping audio path check (not initialized or not playing)."); // Optional debug log
            return;
        }

        // console.debug("AudioEngine: Running periodic audio path check..."); // Optional debug log

        try {
            // Ensure the context is actually running before proceeding with silence checks.
            // If it's suspended, the analyzer won't receive data, but that's expected.
            if (this.audioContext.state !== 'running') {
                console.warn("AudioEngine: Skipping detailed path check - AudioContext not in 'running' state.");
                return;
            }

            // --- Silence Detection and Diagnostics ---
            // Check if we've had continuous silence for too long *while* the engine is set to playing
            // and if we haven't already run the diagnostic for this specific period of silence.
            if (this._analyzerSilentFrames > this._maxSilentFrames && !this._analyzerDiagnosticRun) {
                console.warn(`AudioEngine: No audio data detected via analyzer for ${this._analyzerSilentFrames} frames while playing. Investigating...`);

                // Run a diagnostic to check if the analyzer node itself can receive a signal.
                // This helps differentiate between no sound reaching the analyzer vs. a broken analyzer connection.
                // The diagnostic method internally sets _analyzerDiagnosticRun = true.
                this._runAnalyzerDiagnostic();

                // Check if the currently active modules might be the source of silence
                // (e.g., all muted, failed to start, etc.)
                this._checkModuleOutputs();

                // Log a warning if the master volume is extremely low, as this could cause silence.
                if (this.volume < 0.01) {
                    console.warn(`AudioEngine: Master volume is near zero (${this.volume.toFixed(3)}) during silence check.`);
                }
            }
            // Note: The _analyzerDiagnosticRun flag prevents this block from running repeatedly
            // during the same period of silence. It gets reset when audio data is received again,
            // or when the play state or mood changes.

        } catch (error) {
            // Use the internal error logging system for consistency
            this._logError('_checkAudioPaths', 'Error encountered while checking audio paths', error);
        }
    }

    /**
     * Check if audio modules are actually outputting sound
     * @private
     */
    _checkModuleOutputs() {
        if (!this.isInitialized || Object.keys(this.audioModules).length === 0) return;
        
        try {
            console.log("AudioEngine: Checking module outputs");
            
            // Count active modules
            let activeModules = 0;
            let inactiveModules = [];
            
            for (const key in this.audioModules) {
                const module = this.audioModules[key];
                
                // If the module has a isActive or isPlaying property, check it
                if (module.isActive === false || module.isPlaying === false) {
                    inactiveModules.push(key);
                } else {
                    activeModules++;
                }
                
                // If the module has a diagnostic method, call it
                if (typeof module.runDiagnostic === 'function') {
                    try {
                        module.runDiagnostic();
                    } catch (moduleError) {
                        console.warn(`AudioEngine: Error running diagnostic on module ${key}:`, moduleError);
                    }
                }
            }
            
            // Log the results
            if (activeModules === 0 && inactiveModules.length > 0) {
                console.warn(`AudioEngine: No active modules found. Inactive modules: ${inactiveModules.join(', ')}`);
            } else {
                console.log(`AudioEngine: Found ${activeModules} active modules and ${inactiveModules.length} inactive modules`);
            }
            
            // Check master volume levels
            if (this.volume < 0.01) {
                console.warn("AudioEngine: Master volume is near zero:", this.volume);
            }
            
            // Check if specific modules exist for this mood
            const currentMoodModules = typeof EmotionAudioModules !== 'undefined' && EmotionAudioModules[this.currentMood];
            if (!currentMoodModules || currentMoodModules.length === 0) {
                console.warn(`AudioEngine: No modules configured for current mood '${this.currentMood}'`);
            }
        } catch (error) {
            console.error("AudioEngine: Error checking module outputs:", error);
        }
    }

    /**
     * Calls the update method on all active modules.
     * @param {number} time - The current elapsed time.
     * @param {number} deltaTime - The delta time since the last frame.
     * @private
     */
    _updateModules(time, deltaTime) {
        if (!this.isInitialized || !this.isPlaying) return; // Only update if playing

        try {
            // Prepare parameters to pass to modules
            const currentSettings = (typeof moodAudioSettings !== 'undefined' && moodAudioSettings[this.currentMood])
                ? moodAudioSettings[this.currentMood]
                : {}; // Use empty object if settings not found

            // Derive audio parameters (tempo, scale, etc.) from settings
            const audioParams = {
                tempo: currentSettings.tempo || 80,
                scale: currentSettings.scale || 'major', // Default scale
                baseFreq: currentSettings.baseFreq || 220,
                // Add other relevant parameters derived from settings
            };

            // Get visual parameters (optional, but can be useful for some audio effects)
            let visualParams = {};
            try {
                visualParams = (typeof AudioVisualConnector !== 'undefined' && AudioVisualConnector.getInstance())
                    ? AudioVisualConnector.getInstance().getVisualParams()
                    : {};
            } catch (visualError) {
                this._logError('UpdateModules', 'Failed to get visual parameters', visualError);
                // Continue with empty visual params
            }

            // Track errors per module to potentially disable problematic ones
            if (!this._moduleErrorCounts) this._moduleErrorCounts = {};
            
            for (const key in this.audioModules) {
                try {
                    const moduleInstance = this.audioModules[key];
                    if (moduleInstance && typeof moduleInstance.update === 'function') {
                        // Pass time, current mood, visual params, derived audio params, and deltaTime
                        moduleInstance.update(time, this.currentMood, visualParams, audioParams, deltaTime);
                        
                        // Reset error count on successful update
                        this._moduleErrorCounts[key] = 0;
                    }
                } catch (moduleError) {
                    // Increment error count for this module
                    this._moduleErrorCounts[key] = (this._moduleErrorCounts[key] || 0) + 1;
                    
                    this._logError('UpdateModules', `Error updating module '${key}'`, moduleError);
                    
                    // Disable module after too many errors
                    if (this._moduleErrorCounts[key] > 10) {
                        this._logError('UpdateModules', 
                            `Module '${key}' has failed too many times (${this._moduleErrorCounts[key]}). Disabling.`, 
                            moduleError);
                        
                        try {
                            // Try to dispose the problematic module
                            if (typeof this.audioModules[key].dispose === 'function') {
                                this.audioModules[key].dispose();
                            }
                        } catch (disposeError) {
                            // Just log and continue
                            console.error(`Failed to dispose problematic module '${key}':`, disposeError);
                        }
                        
                        // Remove from active modules
                        delete this.audioModules[key];
                    }
                }
            }
        } catch (error) {
            this._logError('UpdateModules', 'Error in module update process', error);
        }
    }

    /**
     * Updates the analyser data.
     * @private
     */
    _updateAnalyser() {
        if (!this.masterAnalyser || !this.audioData) return;
        
        try {
            // Get frequency data from analyzer
            this.masterAnalyser.getByteFrequencyData(this.audioData);
            
            // Check if we're getting any data
            let hasData = false;
            let totalValue = 0;
            
            // Check every 10th value for efficiency (just need to detect if there's any signal)
            for (let i = 0; i < this.audioData.length; i += 10) {
                totalValue += this.audioData[i];
                if (this.audioData[i] > 0) {
                    hasData = true;
                }
            }
            
            // Calculate average level for debugging
            const avgLevel = totalValue / (this.audioData.length / 10);
            
            // If we're playing but not getting data, increment our silent frame counter
            if (this.isPlaying && this.audioContext && this.audioContext.state === 'running') {
                if (!hasData) {
                    this._analyzerSilentFrames++;
                    
                    // Log a warning if we've had extended silence, but only once per silence period
                    if (this._analyzerSilentFrames >= this._maxSilentFrames && !this._silenceLogged) {
                        console.warn("AudioEngine: Audio analyzer receiving no data while playing");
                        this._silenceLogged = true;
                    }
                } else {
                    // Reset counters when we get data
                    this._analyzerSilentFrames = 0;
                    this._silenceLogged = false;
                    this._lastNonZeroDataTime = Date.now();
                }
            }
        } catch (analyserError) {
            this._logError('Analyser', 'Error getting analyser data', analyserError);
            
            // Try to recreate the analyzer data buffer if it might be invalid
            try {
                if (this.masterAnalyser && this.masterAnalyser.frequencyBinCount > 0) {
                    this.audioData = new Uint8Array(this.masterAnalyser.frequencyBinCount);
                    console.log(`AudioEngine: Recreated analyzer buffer with size ${this.audioData.length}`);
                }
            } catch (bufferError) {
                this._logError('Analyser', 'Failed to recreate analyser buffer', bufferError);
            }
        }
    }

    /**
     * Updates the master reverb effect based on mood.
     * @param {string} mood - The target mood.
     * @private
     */
    _updateMasterReverb(mood) {
        if (!this.audioContext || !this.masterReverb) return;
        console.log(`AudioEngine: Updating master reverb for mood '${mood}'...`);

        try {
            // Safely get settings, fallback to 'calm' if necessary
            const settings = (typeof moodAudioSettings !== 'undefined' && moodAudioSettings[mood])
                ? moodAudioSettings[mood]
                : (typeof moodAudioSettings !== 'undefined' ? moodAudioSettings.calm : {});

            // Placeholder: Using simple generated noise impulse. Replace with proper IR loading/generation.
            const duration = settings.reverbTime || 2.0;
            const decay = settings.reverbDamping || 0.5; // Damping is often inverse (higher value = faster decay)
            const sampleRate = this.audioContext.sampleRate;
            const length = Math.max(1, Math.floor(sampleRate * duration)); // Ensure length is at least 1
            let impulse = null;

            try {
                 impulse = this.audioContext.createBuffer(2, length, sampleRate);
            } catch (bufferError) {
                 this._logError('Reverb', `Error creating reverb buffer (length: ${length}, duration: ${duration}s). Using fallback.`, bufferError);
                 // Fallback to a minimal buffer if creation fails
                 try {
                     // Create a smaller buffer if the original was too large
                     const fallbackLength = Math.min(sampleRate * 0.5, 8192); // 0.5s or 8192 samples, whichever is smaller
                     impulse = this.audioContext.createBuffer(2, fallbackLength, sampleRate); // 100ms buffer
                     console.log(`AudioEngine: Using fallback reverb buffer (length: ${fallbackLength})`);
                 } catch (fallbackError) {
                     this._logError('Reverb', 'Failed to create even fallback reverb buffer', fallbackError, true);
                     if (typeof ToastSystem !== 'undefined') {
                          ToastSystem.notify('error', 'Reverb effect failed to initialize.');
                     }
                     return; // Cannot proceed without a buffer
                 }
            }

            // Validate the buffer before proceeding
            if (!impulse || impulse.length === 0) {
                throw new Error('Invalid reverb buffer created');
            }

            try {
                const left = impulse.getChannelData(0);
                const right = impulse.getChannelData(1);

                if (!left || !right) {
                    throw new Error('Could not get channel data from reverb buffer');
                }

                // Generate the impulse response
                const bufferLength = left.length;
                for (let i = 0; i < bufferLength; i++) {
                    // Ensure decay power is reasonable
                    const decayPower = Math.max(0.1, decay * 5.0); // Prevent zero or negative power
                    const envelope = Math.pow(1 - (i / bufferLength), decayPower); // Exponential decay
                    left[i] = (Math.random() * 2 - 1) * envelope;
                    right[i] = (Math.random() * 2 - 1) * envelope;
                }

                // Apply the buffer to the reverb node
                this.masterReverb.buffer = impulse;
                console.log(`AudioEngine: Applied generated reverb impulse (duration: ${duration.toFixed(1)}s, decay: ${decay.toFixed(1)}).`);
            } catch (error) {
                this._logError('Reverb', 'Error setting up reverb impulse', error);
                
                if (typeof ToastSystem !== 'undefined') {
                    ToastSystem.notify('warning', 'Could not update reverb effect.');
                }
            }
        } catch (error) {
            this._logError('Reverb', 'Error updating master reverb', error);
        }
    }

    /**
     * Synchronizes the play state of all active modules.
     * @param {boolean} shouldPlay - Whether the modules should be playing.
     * @private
     */
    _syncModulesPlayState(shouldPlay) {
        if (!this.isInitialized) {
             console.warn("AudioEngine: Cannot sync module play state - engine not initialized.");
             return;
        }

        try {
            // --- CRITICAL: Check AudioContext state BEFORE proceeding ---
            if (!this.audioContext) {
                throw new Error('AudioContext is not available for syncing play state');
            }
            const contextState = this.audioContext.state;
            if (contextState === 'closed') {
                console.error('AudioEngine: Cannot sync play state, AudioContext is closed.');
                return; // Cannot proceed
            }
            if (shouldPlay && contextState === 'suspended') {
                // This case should ideally be handled by setPlaying before calling sync,
                // but add a warning here as a safeguard.
                console.warn("AudioEngine: _syncModulesPlayState called with shouldPlay=true while context is suspended. Playback may be delayed.");
                // Attempt resume again just in case, but don't rely on it here.
                this.audioContext.resume().catch(err => { /* Log error silently */ });
                // We won't call play() on modules yet, as context isn't ready.
                // The logic in setPlaying should re-trigger sync once resumed.
                return;
            }
            // --- End Context Check ---


            // Reset analyzer diagnostics when play state changes
            this._analyzerSilentFrames = 0;
            this._analyzerDiagnosticRun = false;
            this._silenceLogged = false;

            // Get current time safely
            let now = 0;
            try {
                now = this.audioContext.currentTime;
            } catch (timeError) {
                this._logError('PlayState', 'Error getting currentTime from AudioContext', timeError);
                now = 0; // Use 0 as fallback
            }

            const fadeDuration = 0.5; // Default fade for stop
            console.log(`AudioEngine: Syncing module play state to ${shouldPlay ? 'PLAYING' : 'STOPPED'}`);

            const moduleKeys = Object.keys(this.audioModules);
            const successModules = [];
            const errorModules = [];

            for (const key of moduleKeys) {
                try {
                    const moduleInstance = this.audioModules[key];
                    if (!moduleInstance) continue;

                    // --- Call play/stop only if context is running or stopping ---
                    if (shouldPlay && typeof moduleInstance.play === 'function' && contextState === 'running') {
                        console.log(`AudioEngine: Calling play() on module '${key}' at time ${now.toFixed(3)}`);
                        moduleInstance.play(now); // Start immediately relative to context time
                        successModules.push(`${key}:play`);
                    } else if (!shouldPlay && typeof moduleInstance.stop === 'function') {
                        // Stop can be called even if context is suspended, to schedule fades
                        console.log(`AudioEngine: Calling stop() on module '${key}' at time ${now.toFixed(3)}`);
                        moduleInstance.stop(now, fadeDuration); // Stop with fade
                        successModules.push(`${key}:stop`);
                    }
                } catch (moduleError) {
                    errorModules.push(key);
                    this._logError('PlayState', `Error syncing play state for module '${key}'`, moduleError);
                }
            }

            console.log(`AudioEngine: Module play state sync complete. Success: ${successModules.length}, Failed: ${errorModules.length}`);
        } catch (error) {
            this._logError('PlayState', 'Error synchronizing module play states', error);
        }
    }

    // --- Public API Methods ---

    /**
     * Sets the playback state (playing or paused), handling AudioContext resume.
     * @param {boolean} playing - True to play, false to pause.
     * @param {string} [newMood] - Optional: If changing mood simultaneously.
     * @returns {boolean} Success of the operation
     */
    setPlaying(playing, newMood) {
        if (!this.isInitialized) {
            console.warn("AudioEngine: Cannot set playing state - engine is not initialized");
            return false;
        }

        if (this.isPlaying === playing && (!newMood || newMood === this.currentMood)) {
             // console.log(`AudioEngine: Engine is already ${playing ? 'playing' : 'stopped'} and mood is unchanged.`);
             return true; // Already in requested state
        }

        console.log(`AudioEngine: Setting playback state to ${playing}${newMood ? ` (with mood change to ${newMood})` : ''}`);

        try {
            // --- Handle AudioContext State ---
            if (playing && this.audioContext && this.audioContext.state === 'suspended') {
                console.warn("AudioEngine: AudioContext is suspended. Attempting to resume before playing...");
                // Attempt to resume. The actual playing will happen once resumed (or fail).
                // We don't change this.isPlaying here yet.
                this.audioContext.resume()
                    .then(() => {
                        console.log("AudioEngine: AudioContext resumed successfully by setPlaying.");
                        // Now that it's resumed, set the state and continue
                        this.isPlaying = true;
                        this._continueSetPlaying(true, newMood); // Finish the process
                    })
                    .catch(err => {
                        this._logError('PlayControl', 'Failed to resume AudioContext on play attempt', err);
                        // Remain paused if resume fails
                        this.isPlaying = false;
                        if (typeof ToastSystem !== 'undefined') {
                            ToastSystem.notify('warning', 'Click/Tap the screen to enable audio.');
                        }
                    });
                return true; // Return true as we are handling the async resume
            } else if (playing && this.audioContext && this.audioContext.state === 'closed') {
                this._logError('PlayControl', 'Cannot play, AudioContext is closed.', null, true);
                this.isPlaying = false; // Ensure state is correct
                return false;
            }

            // If context is running, or if we are stopping playback:
            this.isPlaying = playing; // Update internal state
            this._continueSetPlaying(playing, newMood); // Call helper to handle mood change and sync

            return true;
        } catch (error) {
            this._logError('PlayControl', 'Error setting play state', error);
            this.isPlaying = false; // Reset to a safe state on error
            return false;
        }
    }

    /**
     * Helper function to continue the setPlaying logic after context check/resume.
     * @param {boolean} playing - The target play state.
     * @param {string} [newMood] - Optional new mood.
     * @private
     */
    _continueSetPlaying(playing, newMood) {
        try {
            // If a mood change is also happening, handle it first
            if (newMood && newMood !== this.currentMood) {
                this.changeMood(newMood); // changeMood will handle module sync internally if playing starts
            } else {
                // Sync modules to the new play state immediately
                this._syncModulesPlayState(playing); // Use the 'playing' argument passed in
            }
        } catch (error) {
            this._logError('PlayControl', 'Error in continued play state setting', error);
        }
    }

    /**
     * Changes the current mood and updates audio modules accordingly.
     * @param {string} newMood - The key of the new mood (e.g., 'calm', 'cosmic').
     * @param {boolean} [isInitialSetup=false] - Flag to skip transitions during initial load.
     * @returns {boolean} Success of the operation
     */
    changeMood(newMood, isInitialSetup = false) {
        if (!this.isInitialized) {
            console.warn("AudioEngine: Cannot change mood - engine is not initialized");
            return false;
        }
        
        try {
            // Validate mood key and existence of settings
            if (!newMood) {
                throw new Error('No mood specified');
            }
            
            // Check if all required configurations exist
            const hasMoodSettings = typeof moodAudioSettings !== 'undefined' && moodAudioSettings[newMood];
            const hasEmotionModules = typeof EmotionAudioModules !== 'undefined' && EmotionAudioModules[newMood];
            
            if (!hasMoodSettings || !hasEmotionModules) {
                const missingConfigs = [];
                if (!hasMoodSettings) missingConfigs.push('moodAudioSettings');
                if (!hasEmotionModules) missingConfigs.push('EmotionAudioModules');
                
                throw new Error(`Invalid or unknown mood requested: '${newMood}' or missing configs: ${missingConfigs.join(', ')}`);
            }
            
            if (newMood === this.currentMood && !isInitialSetup) {
                console.log(`AudioEngine: Mood '${newMood}' is already active.`);
                return true; // No change needed unless it's the initial setup call
            }

            console.log(`AudioEngine: Changing mood from '${this.currentMood}' to '${newMood}'...`);
            const oldMood = this.currentMood;
            this.currentMood = newMood;
            const newSettings = moodAudioSettings[this.currentMood];
            const transitionTime = isInitialSetup ? 0 : 1.5; // Transition time in seconds (0 for setup)

            // --- Update Master Processing (like Reverb) ---
            try {
                this._updateMasterReverb(this.currentMood);
            } catch (reverbError) {
                this._logError('MoodChange', 'Error updating master reverb during mood change', reverbError);
                // Continue despite reverb error
            }

            // --- Re-initialize or Transition Modules ---
            if (isInitialSetup) {
                // On initial setup, just initialize modules for the new mood
                const success = this._initModulesForMood(this.currentMood, newSettings);
                
                // If initial state is playing, start the modules *after* init
                if (success && this.isPlaying && this.audioContext?.state === 'running') {
                    this._syncModulesPlayState(true);
                }
            } else {
                this._handleMoodTransition(oldMood, newMood, newSettings, transitionTime);
            }

            console.log(`AudioEngine: Mood change to '${this.currentMood}' completed.`);
            return true;
        } catch (error) {
            this._logError('MoodChange', `Failed to change mood to '${newMood}'`, error);
            
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('warning', `Could not change to mood: ${newMood}`);
            }
            
            // Keep the old mood if change failed
            if (this.currentMood !== oldMood) {
                this.currentMood = oldMood || 'calm'; // Fallback to 'calm' if oldMood isn't set
            }
            return false;
        }
    }

    /**
     * Handles the transition between moods, including stopping unneeded modules and starting new ones
     * @param {string} oldMood - The previous mood
     * @param {string} newMood - The new mood
     * @param {object} newSettings - Settings for the new mood
     * @param {number} transitionTime - Transition time in seconds
     * @private
     */
    _handleMoodTransition(oldMood, newMood, newSettings, transitionTime) {
        try {
            // 1. Identify modules active in the *new* mood
            const modulesForNewMood = EmotionAudioModules[newMood] || EmotionAudioModules.default || [];
            const modulesForOldMood = EmotionAudioModules[oldMood] || EmotionAudioModules.default || [];

            // 2. Stop and dispose modules active in *old* mood but NOT in *new* mood
            const modulesToDispose = [];
            
            for (const moduleKey of modulesForOldMood) {
                if (!modulesForNewMood.includes(moduleKey)) {
                    const moduleInstance = this.audioModules[moduleKey];
                    if (moduleInstance) {
                         console.log(`AudioEngine: Stopping & disposing module '${moduleKey}' (not in new mood).`);
                         try {
                             if (typeof moduleInstance.stop === 'function') {
                                 moduleInstance.stop(this.audioContext.currentTime, 0.2); // Quick fade out
                             }
                             
                             // Schedule disposal slightly after stop
                             const timeoutId = setTimeout(() => {
                                 try {
                                     if (this.audioModules[moduleKey] === moduleInstance && typeof moduleInstance.dispose === 'function') {
                                         moduleInstance.dispose();
                                         delete this.audioModules[moduleKey];
                                         console.log(`AudioEngine: Disposed module '${moduleKey}' after transition`);
                                     }
                                 } catch (disposeError) {
                                     this._logError('MoodTransition', `Error disposing module ${moduleKey} after stop`, disposeError);
                                 }
                             }, 300);
                             
                             modulesToDispose.push({
                                 key: moduleKey,
                                 instance: moduleInstance,
                                 timeoutId: timeoutId
                             });
                         } catch (stopError) {
                             this._logError('MoodTransition', `Error stopping module ${moduleKey}`, stopError);
                         }
                    }
                }
            }

            // 3. Initialize modules active in *new* mood but NOT currently running
            const modulesToAdd = [];
            const failedModules = [];
            
            for (const moduleKey of modulesForNewMood) {
                if (!this.audioModules[moduleKey]) {
                    const ModuleClass = this.loadedModuleClasses[moduleKey];
                    if (ModuleClass) {
                         console.log(`AudioEngine: Initializing new module '${moduleKey}' for mood change.`);
                         try {
                             const moduleInstance = new ModuleClass();
                             moduleInstance.init(this.audioContext, this.masterInputGain, newSettings, newMood);
                             this.audioModules[moduleKey] = moduleInstance;
                             modulesToAdd.push(moduleKey);
                             
                             // If playing, start the newly added module
                             if (this.isPlaying && typeof moduleInstance.play === 'function' && this.audioContext?.state === 'running') {
                                  moduleInstance.play(this.audioContext.currentTime + 0.1); // Start slightly delayed
                             }
                         } catch (initError) {
                             failedModules.push(moduleKey);
                             this._logError('MoodTransition', `Error initializing new module ${moduleKey}`, initError);
                         }
                    } else {
                         failedModules.push(moduleKey);
                         console.warn(`AudioEngine: Class for new module ${moduleKey} not found.`);
                    }
                }
            }

            // 4. Call changeMood on modules active in *both* old and new moods
            const modulesUpdated = [];
            const moduleUpdateFailed = [];
            
            for (const moduleKey of modulesForNewMood) {
                if (modulesForOldMood.includes(moduleKey)) {
                    const moduleInstance = this.audioModules[moduleKey];
                    if (moduleInstance && typeof moduleInstance.changeMood === 'function') {
                         console.log(`AudioEngine: Calling changeMood() on module '${moduleKey}'.`);
                         try {
                             moduleInstance.changeMood(newMood, newSettings, transitionTime);
                             modulesUpdated.push(moduleKey);
                         } catch (changeError) {
                             moduleUpdateFailed.push(moduleKey);
                             this._logError('MoodTransition', `Error calling changeMood on module ${moduleKey}`, changeError);
                         }
                    } else if (moduleInstance) {
                         moduleUpdateFailed.push(moduleKey);
                         console.warn(`AudioEngine: Module '${moduleKey}' exists but has no changeMood method.`);
                         // Optional: Could stop/re-init here if needed, but might cause gaps
                    }
                }
            }
            
            console.log(`AudioEngine: Mood transition summary - Removed: ${modulesToDispose.length}, Added: ${modulesToAdd.length}, Updated: ${modulesUpdated.length}, Failed: ${failedModules.length + moduleUpdateFailed.length}`);
            
            // Store timeout IDs for cleanup during disposal
            this._moodTransitionTimeouts = modulesToDispose.map(m => m.timeoutId);
            
            // Reset analyzer diagnostics on mood change
            this._analyzerSilentFrames = 0;
            this._analyzerDiagnosticRun = false;
            this._silenceLogged = false;
        } catch (error) {
            this._logError('MoodTransition', 'Error handling mood transition', error);
        }
    }

    /**
     * Sets the master output volume.
     * @param {number} volume - The new volume level (0.0 to 1.0).
     * @returns {boolean} Success of the operation
     */
    setVolume(volume) {
        if (!this.isInitialized || !this.masterOutputGain || !this.audioContext) {
            console.warn("AudioEngine: Cannot set volume - engine not properly initialized");
            return false;
        }
        
        try {
            // Validate and clamp volume
            if (typeof volume !== 'number' || isNaN(volume)) {
                throw new Error(`Invalid volume value: ${volume}`);
            }
            
            const newVolume = Math.max(0.0, Math.min(1.0, volume)); // Clamp volume
            if (this.volume === newVolume) return true; // No change needed

            this.volume = newVolume;
            const rampTime = 0.05; // 50ms ramp to prevent clicks

            // --- ADDED: Logging ---
            console.log(`AudioEngine: Master volume set to ${this.volume.toFixed(2)}`);
            if (this.volume < 0.01) {
                console.warn("AudioEngine: Master volume is near zero!");
            }
            // --- END LOGGING ---

            try {
                // Use cancelAndHoldAtTime if available (safer)
                if (typeof this.masterOutputGain.gain.cancelAndHoldAtTime === 'function') {
                    this.masterOutputGain.gain.cancelAndHoldAtTime(this.audioContext.currentTime);
                    this.masterOutputGain.gain.linearRampToValueAtTime(
                        this.volume,
                        this.audioContext.currentTime + rampTime
                    );
                } else {
                    // Fallback to setTargetAtTime
                    this.masterOutputGain.gain.setTargetAtTime(
                        this.volume,
                        this.audioContext.currentTime,
                        rampTime / 3 // Time constant for setTargetAtTime
                    );
                }
                return true;
            } catch (rampError) {
                this._logError('Volume', 'Error during volume ramp, trying direct set', rampError);
                
                // Direct set as fallback
                try {
                    this.masterOutputGain.gain.setValueAtTime(this.volume, this.audioContext.currentTime);
                    return true;
                } catch (setError) {
                    this._logError('Volume', 'Failed even direct volume set', setError);
                    return false;
                }
            }
        } catch (error) {
            this._logError('Volume', 'Error setting volume', error);
            return false;
        }
    }

    /**
     * Gets the latest frequency data from the analyser.
     * @returns {Uint8Array | null} The frequency data array, or null if not available.
     */
    getAudioData() {
        if (!this.isInitialized || !this.audioData) {
            // Return zeroed data of a reasonable size if not available
            if (this.masterAnalyser) {
                try {
                    const size = this.masterAnalyser.frequencyBinCount || 1024;
                    return new Uint8Array(size);
                } catch (error) {
                    this._logError('AudioData', 'Error creating fallback audio data', error);
                    return new Uint8Array(1024); // Standard fallback size
                }
            }
            return new Uint8Array(1024); // Standard fallback size
        }
        
        try {
            // Check if audioData is valid before returning
            if (this.audioData.length === 0) {
                throw new Error('Audio data array has zero length');
            }
            
            // We already check in _updateAnalyser if the data is all zeros
            // Here we just return the current data without additional warnings
            // This fixes the frequent console warnings
            
            // Generate fake data if we're playing but have no real data for too long
            // This prevents visualizations from looking broken
            if (this.isPlaying && 
                this.audioContext && 
                this.audioContext.state === 'running' &&
                this._analyzerSilentFrames > this._maxSilentFrames) {
                
                // Check if we had real data within the last 5 seconds
                const timeSinceLastData = Date.now() - this._lastNonZeroDataTime;
                
                // Only generate fake data if we haven't had real data for a while and
                // we've already attempted diagnostics
                if (timeSinceLastData > 5000 && this._analyzerDiagnosticRun) {
                    // Fill with some minimal fake data (only log this once)
                    if (!this._usingFakeData) {
                        console.log("AudioEngine: Using synthetic data for visualization due to lack of real audio data");
                        this._usingFakeData = true;
                    }
                    
                    // Create pulsing synthetic data
                    const fakeLevel = (Math.sin(Date.now() * 0.002) * 0.5 + 0.5) * 40;
                    for (let i = 0; i < this.audioData.length; i++) {
                        // Generate a spectrum-like curve with higher values in lower frequencies
                        const frequencyFactor = 1 - (i / this.audioData.length);
                        this.audioData[i] = Math.max(0, Math.min(255, 
                            Math.floor(fakeLevel * frequencyFactor * frequencyFactor * Math.random())));
                    }
                }
            } else if (this._usingFakeData) {
                // Reset fake data flag when we have real data again
                this._usingFakeData = false;
            }
            
            return this.audioData;
        } catch (error) {
            this._logError('AudioData', 'Error getting audio data', error);
            return new Uint8Array(this.masterAnalyser ? this.masterAnalyser.frequencyBinCount : 1024);
        }
    }

    /**
     * Returns the current state of the audio engine for debugging
     * @returns {Object} The current state including errors and module status
     */
    getDebugState() {
        try {
            const moduleStates = {};
            for (const key in this.audioModules) {
                const module = this.audioModules[key];
                moduleStates[key] = {
                    active: !!module,
                    hasUpdate: module && typeof module.update === 'function',
                    hasDispose: module && typeof module.dispose === 'function',
                    hasPlay: module && typeof module.play === 'function',
                    hasStop: module && typeof module.stop === 'function',
                    hasChangeMood: module && typeof module.changeMood === 'function',
                    errorCount: this._moduleErrorCounts ? (this._moduleErrorCounts[key] || 0) : 0
                };
            }
            
            return {
                version: '3.1.1 (Enhanced Audio Analyzer and Error Handling)',
                initialized: this.isInitialized,
                playing: this.isPlaying,
                mood: this.currentMood,
                volume: this.volume,
                contextState: this.audioContext ? this.audioContext.state : 'none',
                sampleRate: this.audioContext ? this.audioContext.sampleRate : 0,
                moduleCount: Object.keys(this.audioModules).length,
                moduleClassCount: Object.keys(this.loadedModuleClasses).length,
                modules: moduleStates,
                analyzerStats: {
                    silentFrames: this._analyzerSilentFrames,
                    maxSilentFrames: this._maxSilentFrames,
                    usingFakeData: !!this._usingFakeData,
                    diagnosticRun: !!this._analyzerDiagnosticRun,
                    timeSinceLastData: this._lastNonZeroDataTime ? 
                        (Date.now() - this._lastNonZeroDataTime) / 1000 + 's' : 'never'
                },
                errorLog: this._errorLog ? this._errorLog.slice(-10) : [], // Last 10 errors
                fatalErrorCount: this._fatalErrors ? this._fatalErrors.size : 0,
                recoveryAttempts: this._recoveryAttempts
            };
        } catch (error) {
            console.error("AudioEngine: Error getting debug state:", error);
            return {
                error: 'Failed to get debug state',
                message: error.message
            };
        }
    }

    /**
     * Run a manual diagnostic check on the audio system
     * @returns {boolean} Success of the operation
     */
    runDiagnostic() {
        console.log("AudioEngine: Running manual diagnostic");
        
        try {
            // Reset diagnostic state
            this._analyzerDiagnosticRun = false;
            this._silenceLogged = false;
            
            // Check audio context state
            if (!this.audioContext) {
                console.error("AudioEngine: No AudioContext available");
                return false;
            }
            
            console.log(`AudioEngine: AudioContext state is ${this.audioContext.state}`);
            
            // Try to resume if suspended
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume()
                    .then(() => console.log("AudioEngine: Successfully resumed AudioContext"))
                    .catch(err => console.error("AudioEngine: Failed to resume AudioContext:", err));
            }
            
            // Run analyzer diagnostic regardless of current silent frame count
            this._runAnalyzerDiagnostic();
            
            // Check module outputs
            this._checkModuleOutputs();
            
            // Check master volumes
            console.log(`AudioEngine: Master volume is ${this.volume}`);
            
            return true;
        } catch (error) {
            console.error("AudioEngine: Error running diagnostic:", error);
            return false;
        }
    }

    /**
     * Cleans up all audio resources and stops the engine.
     * @returns {boolean} Success of the operation
     */
    dispose() {
        console.log("AudioEngine: Disposing...");
        
        try {
            // Signal stop to any ongoing processes
            this.isInitialized = false;
            
            // Clear any pending timeouts from mood transitions
            if (this._moodTransitionTimeouts) {
                this._moodTransitionTimeouts.forEach(timeoutId => {
                    if (timeoutId) clearTimeout(timeoutId);
                });
                this._moodTransitionTimeouts = [];
            }
            
            // Stop the update loop
            this._stopUpdateLoop();

            // Dispose module instances
            this._disposeModuleInstances();

            // Clean up context resume handlers
            this._removeContextResumeHandlers();

            // Stop the debug oscillator if it exists
            if (this.dummyOscillator) {
                try {
                    this.dummyOscillator.stop();
                    this.dummyOscillator.disconnect();
                } catch (oscError) {
                    console.warn("AudioEngine: Error stopping debug oscillator:", oscError);
                }
                this.dummyOscillator = null;
            }
            
            if (this.dummyGain) {
                try {
                    this.dummyGain.disconnect();
                } catch (gainError) {
                    console.warn("AudioEngine: Error disconnecting dummy gain:", gainError);
                }
                this.dummyGain = null;
            }

            // Disconnect and nullify master nodes (reverse order of connection)
            const nodesToDisconnect = [
                { name: 'masterAnalyser', node: this.masterAnalyser },
                { name: 'masterLimiter', node: this.masterLimiter },
                { name: 'masterOutputGain', node: this.masterOutputGain },
                { name: 'masterReverb', node: this.masterReverb },
                { name: 'masterCompressor', node: this.masterCompressor },
                { name: 'masterEQ', node: this.masterEQ },
                { name: 'masterInputGain', node: this.masterInputGain }
            ];
            
            for (const { name, node } of nodesToDisconnect) {
                try {
                    if (node) {
                        node.disconnect();
                        console.log(`AudioEngine: Disconnected ${name}`);
                    }
                } catch (disconnectError) {
                    console.error(`AudioEngine: Error disconnecting ${name}:`, disconnectError);
                }
            }

            // Nullify references to prevent memory leaks
            this.masterInputGain = null;
            this.masterOutputGain = null;
            this.masterLimiter = null;
            this.masterAnalyser = null;
            this.masterReverb = null;
            this.masterCompressor = null;
            this.masterEQ = null;
            this.masterEnhancer = null;
            this.audioData = null;

            // Close AudioContext
            if (this.audioContext && this.audioContext.state !== 'closed') {
                this.audioContext.close()
                    .then(() => console.log("AudioEngine: AudioContext closed."))
                    .catch(closeError => console.error("AudioEngine: Error closing AudioContext:", closeError));
            }
            this.audioContext = null;
            this.isPlaying = false;

            console.log("AudioEngine: Disposal complete.");
            return true;
        } catch (error) {
            // Use console.error directly since _logError might depend on state we've nullified
            console.error("AudioEngine: Error during disposal:", error);
            
            // Try to force-clear critical references
            this.audioContext = null;
            this.isPlaying = false;
            this.isInitialized = false;
            
            return false;
        }
    }
}

// Make globally accessible if required by the project structure
window.AudioEngine = AudioEngine;