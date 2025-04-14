// AudioEngine.js - Modular Audio Engine Coordinator
// Part of the Harmonic Visions project by FatStinkyPanda
// Copyright (c) 2025 FatStinkyPanda - All rights reserved.
// Version: 3.0.0 (Modular Refactor)

/**
 * @class AudioEngine
 * @description Coordinates audio playback, manages audio modules,
 *              and handles the master audio processing chain.
 */
class AudioEngine {
  constructor(initialIsPlaying = false, initialVolume = 0.7, initialMood = 'calm') {
      console.log("AudioEngine: Initializing...");

      // --- Core State ---
      this.isPlaying = initialIsPlaying;
      this.volume = initialVolume;
      this.currentMood = initialMood;
      this.audioContext = null;
      this.isInitialized = false;
      this.frameId = null; // For the internal update loop
      this.clock = new THREE.Clock(); // Use THREE.Clock for consistency if available, otherwise performance.now()

      // --- Master Processing Nodes ---
      this.masterInputGain = null; // Modules connect here
      this.masterOutputGain = null; // Final volume control
      this.masterLimiter = null;
      this.masterAnalyser = null;
      this.masterReverb = null;
      this.masterCompressor = null;
      this.masterEQ = null; // Placeholder for potential EQ structure
      this.masterEnhancer = null; // Placeholder for stereo enhancer

      // --- Module Management ---
      this.audioModules = {}; // Stores active module instances { key: instance }
      this.loadedModuleClasses = {}; // Stores loaded class constructors { key: class }
      this.moduleConfig = {
          // Define modules, their class names, and if they are enabled by default.
          // Class names must match the global class names defined in ae_*.js files.
          pads: { enabled: true, class: 'AEPads' },
          melody: { enabled: true, class: 'AEMelody' },
          bass: { enabled: true, class: 'AEBass' },
          ambient: { enabled: true, class: 'AEAmbient' },
          percussion: { enabled: true, class: 'AEPercussion' },
          shimmer: { enabled: true, class: 'AEShimmer' },
          // Add more modules here as they are created (e.g., AEEffects, AEModulation)
      };

      // --- Audio Data for Visualization ---
      this.audioData = null; // Uint8Array, initialized later

      // --- Initialization ---
      try {
          this.initAudioCore();
          this.loadModules();
          this.changeMood(this.currentMood, true); // Initial setup without transition
          this.isInitialized = true;
          this._startUpdateLoop(); // Start the internal update loop
          console.log("AudioEngine: Initialization complete.");
      } catch (error) {
          console.error("AudioEngine: CRITICAL - Initialization failed!", error);
          this.isInitialized = false;
          if (typeof ToastSystem !== 'undefined') {
              ToastSystem.notify('error', `Audio Engine failed to initialize: ${error.message}. Audio disabled.`);
          }
          // Attempt cleanup
          this.dispose();
      }
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
          this.audioContext = new AudioContext({
              latencyHint: 'interactive',
              sampleRate: 48000 // Higher sample rate for potentially better quality
          });

          // Handle suspended state (common before user interaction)
          if (this.audioContext.state === 'suspended') {
              console.warn("AudioEngine: AudioContext is suspended. Waiting for user interaction to resume.");
              const resumeContext = async () => {
                  try {
                      await this.audioContext.resume();
                      console.log("AudioEngine: AudioContext resumed successfully.");
                      if (this.isPlaying && this.isInitialized) {
                           this._syncModulesPlayState(this.isPlaying); // Ensure modules start if needed
                      }
                  } catch (resumeError) {
                      console.error("AudioEngine: Failed to resume AudioContext:", resumeError);
                       if (typeof ToastSystem !== 'undefined') {
                           ToastSystem.notify('error', 'Could not activate audio. Please click or tap the screen.');
                       }
                  } finally {
                       // Clean up listeners carefully
                       document.removeEventListener('click', resumeContext);
                       document.removeEventListener('keydown', resumeContext);
                       document.removeEventListener('touchstart', resumeContext);
                  }
              };
               // Add multiple event listeners to maximize chances of resuming
               document.addEventListener('click', resumeContext, { once: true });
               document.addEventListener('keydown', resumeContext, { once: true });
               document.addEventListener('touchstart', resumeContext, { once: true });
          }

          // --- Create Master Processing Chain ---
          // Modules output here -> Master Effects -> Analyser -> Output Volume -> Destination

          // 1. Master Input Gain (Modules connect here)
          this.masterInputGain = this.audioContext.createGain();
          this.masterInputGain.gain.value = 1.0; // Start at full gain, modules control their own level

          // 2. Master EQ (Placeholder - implement specific EQ bands if needed)
          // Example: Simple High-pass to cut rumble
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
          // Using Convolver for potential high quality, but needs impulse response loading/generation
          this.masterReverb = this.audioContext.createConvolver();
          // TODO: Load or generate impulse response based on mood in changeMood()
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
          this.audioData = new Uint8Array(this.masterAnalyser.frequencyBinCount);

          // --- Connect Master Chain ---
          // Input -> EQ -> Compressor -> Reverb -> Output Gain -> Limiter -> Analyser -> Destination
          this.masterInputGain.connect(this.masterEQ);
          this.masterEQ.connect(this.masterCompressor);
          this.masterCompressor.connect(this.masterReverb);
          this.masterReverb.connect(this.masterOutputGain); // Reverb feeds into volume control
          // Optional Dry Path (Bypass Reverb):
          // const dryGain = this.audioContext.createGain(); dryGain.gain.value = 0.7; // Adjust dry/wet
          // this.masterCompressor.connect(dryGain);
          // dryGain.connect(this.masterOutputGain);
          this.masterOutputGain.connect(this.masterLimiter);
          this.masterLimiter.connect(this.masterAnalyser);
          this.masterAnalyser.connect(this.audioContext.destination);

          console.log("AudioEngine: Master processing chain created.");

      } catch (error) {
          console.error("AudioEngine: Error initializing Web Audio API:", error);
          this.audioContext = null; // Ensure context is null on failure
          throw error; // Re-throw to signal failure
      }
  }

  /**
   * Loads and stores the constructors for available audio modules.
   * @private
   */
  loadModules() {
      console.log("AudioEngine: Loading audio module classes...");
      this.loadedModuleClasses = {}; // Reset

      for (const key in this.moduleConfig) {
          const config = this.moduleConfig[key];
          const className = config.class;

          if (typeof window[className] === 'function') {
              this.loadedModuleClasses[key] = window[className];
              console.log(`AudioEngine: Module class '${className}' loaded for key '${key}'.`);
          } else {
              console.warn(`AudioEngine: Module class '${className}' for key '${key}' not found. Module disabled.`);
              this.moduleConfig[key].enabled = false; // Disable if class doesn't exist
          }
      }
      console.log("AudioEngine: Module class loading complete.");
  }

  /**
   * Instantiates and initializes enabled audio modules for the current mood.
   * @param {string} mood - The target mood.
   * @param {object} settings - The audio settings for the target mood.
   * @private
   */
  _initModulesForMood(mood, settings) {
      console.log(`AudioEngine: Initializing modules for mood '${mood}'...`);
      if (!this.audioContext || !this.masterInputGain) {
          console.error("AudioEngine: Cannot initialize modules - AudioContext or master input node missing.");
          return;
      }

      // Dispose existing instances before creating new ones
      this._disposeModuleInstances();

      for (const key in this.moduleConfig) {
          if (this.moduleConfig[key].enabled && this.loadedModuleClasses[key]) {
              const ModuleClass = this.loadedModuleClasses[key];
              try {
                  console.log(`AudioEngine: Instantiating module '${key}'...`);
                  const moduleInstance = new ModuleClass();
                  console.log(`AudioEngine: Initializing module '${key}' instance...`);
                  // Pass context, the master input node, settings, and mood
                  moduleInstance.init(this.audioContext, this.masterInputGain, settings, mood);
                  this.audioModules[key] = moduleInstance;
                  console.log(`AudioEngine: Module '${key}' initialized successfully.`);
              } catch (error) {
                  console.error(`AudioEngine: Failed to initialize module '${key}' for mood '${mood}':`, error);
                  this.moduleConfig[key].enabled = false; // Disable on error
                  if (typeof ToastSystem !== 'undefined') {
                      ToastSystem.notify('error', `Audio module '${key}' failed to load.`);
                  }
              }
          } else if (this.moduleConfig[key].enabled) {
               console.warn(`AudioEngine: Module '${key}' is enabled but its class was not loaded.`);
          }
      }
  }

  /**
   * Disposes of all current audio module instances.
   * @private
   */
  _disposeModuleInstances() {
      console.log("AudioEngine: Disposing existing module instances...");
      for (const key in this.audioModules) {
          try {
              if (this.audioModules[key] && typeof this.audioModules[key].dispose === 'function') {
                  this.audioModules[key].dispose();
              }
          } catch (error) {
              console.error(`AudioEngine: Error disposing module '${key}':`, error);
          }
      }
      this.audioModules = {}; // Clear the instances object
  }

  /**
   * Starts the internal update loop using requestAnimationFrame.
   * @private
   */
  _startUpdateLoop() {
      if (this.frameId !== null) return; // Already running
      console.log("AudioEngine: Starting internal update loop.");

      const loop = (timestamp) => {
          if (!this.isInitialized) { // Stop if engine is disposed
               this.frameId = null;
               console.log("AudioEngine: Update loop stopped (engine disposed).");
               return;
          }

          const deltaTime = this.clock.getDelta();
          const elapsedTime = this.clock.elapsedTime;

          try {
              this._updateModules(elapsedTime, deltaTime);
              this._updateAnalyser();
          } catch(error) {
               console.error("AudioEngine: Error in update loop:", error);
               // Consider stopping the loop or specific modules if errors persist
          }

          this.frameId = requestAnimationFrame(loop);
      };
      this.frameId = requestAnimationFrame(loop);
  }

  /**
   * Stops the internal update loop.
   * @private
   */
  _stopUpdateLoop() {
      if (this.frameId !== null) {
          cancelAnimationFrame(this.frameId);
          this.frameId = null;
          console.log("AudioEngine: Stopped internal update loop.");
      }
  }

  /**
   * Calls the update method on all active modules.
   * @param {number} time - The current elapsed time.
   * @param {number} deltaTime - The delta time since the last frame.
   * @private
   */
  _updateModules(time, deltaTime) {
      if (!this.isInitialized) return;

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
      const visualParams = (typeof AudioVisualConnector !== 'undefined')
           ? AudioVisualConnector.getInstance().getVisualParams()
           : {};

      for (const key in this.audioModules) {
          try {
              const moduleInstance = this.audioModules[key];
              if (moduleInstance && typeof moduleInstance.update === 'function') {
                  // Pass time, current mood, visual params, and derived audio params
                  moduleInstance.update(time, this.currentMood, visualParams, audioParams, deltaTime);
              }
          } catch (error) {
              console.error(`AudioEngine: Error updating module '${key}':`, error);
              // Optionally disable the module after repeated errors
              // this.moduleConfig[key].enabled = false;
              // delete this.audioModules[key];
          }
      }
  }

  /**
   * Updates the analyser data.
   * @private
   */
  _updateAnalyser() {
      if (this.masterAnalyser && this.audioData) {
          try {
              this.masterAnalyser.getByteFrequencyData(this.audioData);
          } catch (error) {
              console.error("AudioEngine: Error getting analyser data:", error);
              // Handle error, maybe nullify audioData or stop trying
          }
      }
  }

   /**
    * Updates the master reverb effect based on mood.
    * TODO: Implement actual impulse response loading/generation.
    * @param {string} mood - The target mood.
    * @private
    */
   _updateMasterReverb(mood) {
       if (!this.audioContext || !this.masterReverb) return;
       console.log(`AudioEngine: Updating master reverb for mood '${mood}'...`);

       const settings = (typeof moodAudioSettings !== 'undefined' && moodAudioSettings[mood])
           ? moodAudioSettings[mood]
           : moodAudioSettings.calm; // Default to calm settings

       // Placeholder: In a real implementation, you would load or generate
       // an impulse response buffer based on settings.reverbTime, settings.reverbDamping, etc.
       // For now, we'll just log it. Replace this with actual IR generation/loading.

       // Example using a simple generated noise impulse (replace with proper convolution)
       const duration = settings.reverbTime || 2.0;
       const decay = settings.reverbDamping || 0.5;
       const sampleRate = this.audioContext.sampleRate;
       const length = sampleRate * duration;
       const impulse = this.audioContext.createBuffer(2, length, sampleRate);
       const left = impulse.getChannelData(0);
       const right = impulse.getChannelData(1);

       for (let i = 0; i < length; i++) {
           const envelope = Math.pow(1 - i / length, decay * 5.0); // Simple exponential decay
           left[i] = (Math.random() * 2 - 1) * envelope;
           right[i] = (Math.random() * 2 - 1) * envelope;
       }
       try {
            this.masterReverb.buffer = impulse;
            console.log(`AudioEngine: Applied generated reverb impulse (duration: ${duration.toFixed(1)}s, decay: ${decay.toFixed(1)}).`);
       } catch (e) {
            console.error("AudioEngine: Error setting reverb buffer:", e);
             if (typeof ToastSystem !== 'undefined') {
                 ToastSystem.notify('warning', 'Could not update reverb effect.');
             }
       }
   }


  /**
   * Synchronizes the play state of all active modules.
   * @param {boolean} shouldPlay - Whether the modules should be playing.
   * @private
   */
  _syncModulesPlayState(shouldPlay) {
      if (!this.isInitialized) return;
      const now = this.audioContext.currentTime;
      const fadeDuration = 0.5; // Default fade for start/stop

      console.log(`AudioEngine: Syncing module play state to ${shouldPlay ? 'PLAYING' : 'STOPPED'}`);

      for (const key in this.audioModules) {
          try {
              const moduleInstance = this.audioModules[key];
              if (moduleInstance) {
                  if (shouldPlay && typeof moduleInstance.play === 'function') {
                      moduleInstance.play(now); // Start immediately
                  } else if (!shouldPlay && typeof moduleInstance.stop === 'function') {
                      moduleInstance.stop(now, fadeDuration); // Stop with fade
                  }
              }
          } catch (error) {
              console.error(`AudioEngine: Error syncing play state for module '${key}':`, error);
          }
      }
  }

  // --- Public API Methods ---

  /**
   * Sets the playback state (playing or paused).
   * @param {boolean} playing - True to play, false to pause.
   * @param {string} [newMood] - Optional: If changing mood simultaneously.
   */
  setPlaying(playing, newMood) {
      if (!this.isInitialized || this.isPlaying === playing) return;

      console.log(`AudioEngine: Setting playback state to ${playing}`);
      this.isPlaying = playing;

      if (this.audioContext.state === 'suspended') {
          console.warn("AudioEngine: Cannot change play state while context is suspended. Resume first.");
           if (typeof ToastSystem !== 'undefined') {
               ToastSystem.notify('warning', 'Click/Tap screen to enable audio first.');
           }
          this.isPlaying = false; // Force state back to stopped
          return;
      }

      // If a mood change is also happening, handle it first
      if (newMood && newMood !== this.currentMood) {
          this.changeMood(newMood); // changeMood will handle module sync internally if playing starts
      } else {
           // Sync modules to the new play state immediately
           this._syncModulesPlayState(this.isPlaying);
      }

       // Start/stop internal update loop if needed (though it runs continuously now)
       // if (this.isPlaying) this._startUpdateLoop(); else this._stopUpdateLoop();
  }

  /**
   * Changes the current mood and updates audio modules accordingly.
   * @param {string} newMood - The key of the new mood (e.g., 'calm', 'cosmic').
   * @param {boolean} [isInitialSetup=false] - Flag to skip transitions during initial load.
   */
  changeMood(newMood, isInitialSetup = false) {
      if (!this.isInitialized) return;
      if (!newMood || typeof moodAudioSettings === 'undefined' || !moodAudioSettings[newMood]) {
          console.warn(`AudioEngine: Invalid or unknown mood requested: '${newMood}'. Mood not changed.`);
          return;
      }
      if (newMood === this.currentMood && !isInitialSetup) {
           console.log(`AudioEngine: Mood '${newMood}' is already active.`);
           return; // No change needed unless it's the initial setup call
      }


      console.log(`AudioEngine: Changing mood from '${this.currentMood}' to '${newMood}'...`);
      const oldMood = this.currentMood;
      this.currentMood = newMood;
      const newSettings = moodAudioSettings[this.currentMood];
      const transitionTime = isInitialSetup ? 0 : 1.5; // Transition time in seconds (0 for setup)

      // 1. Update Master Processing Chain (e.g., Reverb)
      try {
          this._updateMasterReverb(this.currentMood);
      } catch (error) {
          console.error("AudioEngine: Error updating master reverb during mood change:", error);
      }

      // 2. Re-initialize modules if it's the initial setup
      if (isInitialSetup) {
          this._initModulesForMood(this.currentMood, newSettings);
          // If initial state is playing, start the modules
          if (this.isPlaying) {
              this._syncModulesPlayState(true);
          }
          return; // Skip transition logic for initial setup
      }

      // 3. Notify Modules of Mood Change (Handles transitions internally)
      console.log(`AudioEngine: Notifying modules of mood change with transition time: ${transitionTime}s`);
      for (const key in this.audioModules) {
          try {
              const moduleInstance = this.audioModules[key];
              if (moduleInstance && typeof moduleInstance.changeMood === 'function') {
                  moduleInstance.changeMood(this.currentMood, newSettings, transitionTime);
              } else if (moduleInstance) {
                   // If module doesn't support transition, stop and restart it if playing
                   console.warn(`AudioEngine: Module '${key}' does not have changeMood. Performing stop/start.`);
                    if (typeof moduleInstance.stop === 'function') moduleInstance.stop(this.audioContext.currentTime, 0.1); // Quick stop
                    // Re-init and play might be needed here depending on module complexity
                    // For simplicity now, assume modules adapt or are simple enough not to need full re-init
                    if (this.isPlaying && typeof moduleInstance.play === 'function') {
                        // Delay start slightly to allow stop to complete
                        const startTime = this.audioContext.currentTime + 0.2;
                        moduleInstance.play(startTime);
                    }
              }
          } catch (error) {
              console.error(`AudioEngine: Error during changeMood for module '${key}':`, error);
          }
      }

       // 4. Handle Modules Enabled/Disabled Between Moods (Example - needs config per mood)
       // This requires a more complex config structure associating modules with moods.
       // Example placeholder logic:
       /*
       const oldMoodModules = getModulesForMood(oldMood); // Hypothetical function
       const newMoodModules = getModulesForMood(newMood); // Hypothetical function

       for (const key in this.loadedModuleClasses) {
           const wasEnabled = oldMoodModules.includes(key);
           const isEnabled = newMoodModules.includes(key);

           if (!wasEnabled && isEnabled) { // Module added
               // Instantiate, init, and play if needed
           } else if (wasEnabled && !isEnabled) { // Module removed
               // Stop and dispose instance
           }
       }
       */

      console.log(`AudioEngine: Mood change to '${this.currentMood}' initiated.`);
  }

  /**
   * Sets the master output volume.
   * @param {number} volume - The new volume level (0.0 to 1.0).
   */
  setVolume(volume) {
      if (!this.isInitialized || !this.masterOutputGain || !this.audioContext) return;
      const newVolume = Math.max(0.0, Math.min(1.0, volume)); // Clamp volume
      if (this.volume === newVolume) return;

      this.volume = newVolume;
      const rampTime = 0.05; // 50ms ramp to prevent clicks
      this.masterOutputGain.gain.setTargetAtTime(
          this.volume,
          this.audioContext.currentTime,
          rampTime / 3 // Time constant for setTargetAtTime
      );
      // console.debug(`AudioEngine: Volume set to ${this.volume.toFixed(2)}`);
  }

  /**
   * Gets the latest frequency data from the analyser.
   * @returns {Uint8Array | null} The frequency data array, or null if not available.
   */
  getAudioData() {
      // Data is updated in the internal loop, just return the latest
      return this.audioData;
  }

  /**
   * Cleans up all audio resources and stops the engine.
   */
  dispose() {
      console.log("AudioEngine: Disposing...");
      this.isInitialized = false; // Signal to stop loops/updates
      this._stopUpdateLoop();

      // Dispose module instances
      this._disposeModuleInstances();

      // Disconnect and nullify master nodes (reverse order of connection)
      try {
          if (this.masterAnalyser) this.masterAnalyser.disconnect();
          if (this.masterLimiter) this.masterLimiter.disconnect();
          if (this.masterOutputGain) this.masterOutputGain.disconnect();
          if (this.masterReverb) this.masterReverb.disconnect();
          if (this.masterCompressor) this.masterCompressor.disconnect();
          if (this.masterEQ) this.masterEQ.disconnect();
          if (this.masterInputGain) this.masterInputGain.disconnect();
      } catch(e) {
           console.error("AudioEngine: Error disconnecting master nodes:", e);
      }

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
              .catch(e => console.error("AudioEngine: Error closing AudioContext:", e));
      }
      this.audioContext = null;
      this.isPlaying = false;

      console.log("AudioEngine: Disposal complete.");
  }
}


window.AudioEngine = AudioEngine;