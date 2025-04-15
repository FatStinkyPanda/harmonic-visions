// ae_bassSubSine.js - Audio Module for Deep Sub Sine Bass
// Part of the Harmonic Visions project by FatStinkyPanda
// Copyright (c) 2025 FatStinkyPanda - All rights reserved.
// Version: 1.1.1 (Added Volume/Occurrence/Intensity Controls)

/**
 * @class AEBassSubSine
 * @description Generates a pure, deep sine wave bass tone to provide a foundational low end.
 *              Implements the standard AudioEngine module interface with enhanced stability.
 */
class AEBassSubSine {
    constructor() {
        this.MODULE_ID = 'AEBassSubSine'; // For logging and identification
        this.audioContext = null;
        this.masterOutput = null; // Connects to AudioEngine's masterInputGain
        this.settings = null;
        this.baseSettings = null; // Store original settings from data.js
        this.currentMood = null;
        this.isEnabled = false;
        this.isPlaying = false;
        
        // Add standard mood configuration properties
        this.moodConfig = { volume: 100, occurrence: 100, intensity: 50 }; // Default config

        // --- Core Audio Nodes ---
        this.outputGain = null; // Master gain for envelope and volume control
        this.oscillator = null; // The single sine wave oscillator

        // --- Default Settings Tailored for Sub Bass ---
        this.defaultBassSettings = {
            bassVolume: 0.5,     // Sub can be relatively loud but adjust based on mix
            subOctaveShift: -2,  // Default to two octaves below baseFreq
            attackTime: 1.8,     // Slow attack for smooth foundation
            releaseTime: 3.0,    // Slow release for sustain
            minFrequency: 20,    // Hz - lowest audible/sensible frequency
            maxFrequency: 85,    // Hz - upper limit for sub range (slightly extended)
            baseFreq: 110,       // Fallback base frequency (A2) if not provided
            // Note: 'scale' and 'chordNotes' are typically ignored by a sub following baseFreq.
            
            // Add min/max values for intensity mapping
            attackTimeMin: 0.3,  // Faster attack at high intensity
            attackTimeMax: 2.5,  // Slower attack at low intensity
            releaseTimeMin: 1.0, // Faster release at high intensity
            releaseTimeMax: 4.0, // Slower release at low intensity
        };

        console.log(`${this.MODULE_ID}: Instance created.`);
    }

    // --- Helper Methods for Mood Configuration ---
    
    /**
     * Maps a value from 0-100 range to a target range
     * @param {number} value0to100 - Value between 0-100
     * @param {number} minTarget - Minimum output value
     * @param {number} maxTarget - Maximum output value
     * @returns {number} The mapped value
     * @private
     */
    _mapValue(value0to100, minTarget, maxTarget) {
        const clampedValue = Math.max(0, Math.min(100, value0to100 ?? 100)); // Default to 100 if undefined
        return minTarget + (maxTarget - minTarget) * (clampedValue / 100.0);
    }
    
    /**
     * Applies the mood configuration values to the module parameters
     * @param {number} transitionTime - Time for parameter transitions
     * @private
     */
    _applyMoodConfig(transitionTime = 0) {
        if (!this.moodConfig || !this.audioContext || !this.baseSettings) return;
        
        const now = this.audioContext.currentTime;
        const rampTime = transitionTime > 0 ? transitionTime * 0.5 : 0;
        const timeConstant = rampTime / 3.0;
        
        // --- Apply Volume ---
        if (this.outputGain && this.moodConfig.volume !== undefined) {
            // Use bassVolume from baseSettings as the 100% target
            const baseVolume = this.baseSettings.bassVolume ?? this.defaultBassSettings.bassVolume;
            const targetVolume = this._mapValue(this.moodConfig.volume, 0.0, baseVolume);
            console.log(`${this.MODULE_ID}: Applying Volume ${this.moodConfig.volume}/100 -> ${targetVolume.toFixed(3)}`);
            
            // Only apply gain change if playing, otherwise just store for next play
            if (this.isPlaying) {
                if (rampTime > 0.01) {
                    this.outputGain.gain.setTargetAtTime(targetVolume, now, timeConstant);
                } else {
                    this.outputGain.gain.setValueAtTime(targetVolume, now);
                }
            } else {
                // Store in settings for next play()
                this.settings.bassVolume = targetVolume;
            }
        }
        
        // --- Apply Occurrence ---
        // For sub bass, occurrence primarily determines if it plays at all
        // Handled by the AudioEngine coordinator's enable/disable logic
        
        // --- Apply Intensity ---
        if (this.moodConfig.intensity !== undefined) {
            console.log(`${this.MODULE_ID}: Applying Intensity ${this.moodConfig.intensity}/100`);
            
            // Map intensity inversely to attack time (higher intensity = faster attack)
            const attackMin = this.baseSettings.attackTimeMin ?? this.defaultBassSettings.attackTimeMin;
            const attackMax = this.baseSettings.attackTimeMax ?? this.defaultBassSettings.attackTimeMax;
            const targetAttack = this._mapValue(100 - this.moodConfig.intensity, attackMin, attackMax);
            this.settings.attackTime = targetAttack;
            console.log(`  -> Attack Time: ${targetAttack.toFixed(2)}s`);
            
            // Map intensity inversely to release time (higher intensity = faster release)
            const releaseMin = this.baseSettings.releaseTimeMin ?? this.defaultBassSettings.releaseTimeMin;
            const releaseMax = this.baseSettings.releaseTimeMax ?? this.defaultBassSettings.releaseTimeMax;
            const targetRelease = this._mapValue(100 - this.moodConfig.intensity, releaseMin, releaseMax);
            this.settings.releaseTime = targetRelease;
            console.log(`  -> Release Time: ${targetRelease.toFixed(2)}s`);
            
            // Note: Envelope changes will apply on next play/stop cycle
        }
    }

    // --- Core Module Methods (AudioEngine Interface) ---

    /**
     * Initialize audio nodes based on initial mood settings.
     * @param {AudioContext} audioContext - The shared AudioContext.
     * @param {AudioNode} masterOutputNode - The node to connect the module's output to.
     * @param {object} initialSettings - The moodAudioSettings for the initial mood.
     * @param {string} initialMood - The initial mood key.
     * @param {object} moodConfig - Volume/occurrence/intensity configuration (0-100 values)
     */
    init(audioContext, masterOutputNode, initialSettings, initialMood, moodConfig) {
        if (this.isEnabled) {
            console.warn(`${this.MODULE_ID}: Already initialized.`);
            return;
        }
        console.log(`${this.MODULE_ID}: Initializing for mood '${initialMood}'... Config:`, moodConfig);

        try {
            if (!audioContext || !masterOutputNode) {
                throw new Error("AudioContext or masterOutputNode is missing.");
            }
            if (audioContext.state === 'closed') {
                throw new Error("AudioContext is closed.");
            }

            this.audioContext = audioContext;
            this.masterOutput = masterOutputNode;
            
            // Store original settings as baseSettings
            this.baseSettings = { ...this.defaultBassSettings, ...initialSettings };
            // Merge initial settings with specific defaults for this module
            this.settings = { ...this.defaultBassSettings, ...initialSettings };
            // Store the mood configuration
            this.moodConfig = { ...this.moodConfig, ...moodConfig };
            
            this.currentMood = initialMood;

            // --- Create Core Nodes ---
            // 1. Output Gain (controls envelope and overall module volume)
            this.outputGain = this.audioContext.createGain();
            this.outputGain.gain.setValueAtTime(0.0001, this.audioContext.currentTime); // Start silent

            // Apply initial mood configuration to set parameters based on volume/intensity
            this._applyMoodConfig(0); // Apply immediately (no transition)

            // 2. Oscillator (will be created here or in play/changeMood)
            // We create it here so frequency can be set immediately, reducing potential clicks on first play
            this._recreateOscillator(this.settings);
            if (!this.oscillator) {
                 // _recreateOscillator logs errors, but we throw here to halt init if critical
                 throw new Error("Failed to create initial oscillator.");
            }

            // --- Connect Audio Graph ---
            // Connection happens within _recreateOscillator
            this.outputGain.connect(this.masterOutput);

            this.isEnabled = true;
            console.log(`${this.MODULE_ID}: Initialization complete. Initial Freq: ${this.oscillator?.frequency.value.toFixed(2)} Hz`);

        } catch (error) {
            console.error(`${this.MODULE_ID}: Initialization failed:`, error);
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', `Sub Bass init failed: ${error.message}`);
            }
            this.dispose(); // Cleanup partial initialization
            this.isEnabled = false; // Ensure state is correct
            // Allow AudioEngine to handle module failure
        }
    }

    /**
     * Update loop hook. Minimal use for pure sub-bass.
     * @param {number} time - Current elapsed time.
     * @param {string} mood - Current mood key.
     * @param {object} visualParams - Parameters from the visual system.
     * @param {object} audioParams - Parameters derived from mood settings.
     * @param {number} deltaTime - Time since last frame.
     */
    update(time, mood, visualParams, audioParams, deltaTime) {
        if (!this.isEnabled || !this.isPlaying) return;
        // No typical updates needed for a pure sub.
        // Avoid adding LFOs here to maintain clean fundamental.
    }

    /**
     * Start the sub bass oscillator and apply attack envelope.
     * @param {number} startTime - AudioContext time when playback should start.
     */
    play(startTime) {
        if (!this.isEnabled || this.isPlaying) return;
        if (!this.audioContext || !this.outputGain) {
            console.error(`${this.MODULE_ID}: Cannot play - AudioContext or outputGain missing.`);
            return;
        }
         if (this.audioContext.state === 'closed') {
            console.error(`${this.MODULE_ID}: Cannot play - AudioContext is closed.`);
            return;
        }
        if (this.audioContext.state === 'suspended') {
             console.warn(`${this.MODULE_ID}: AudioContext is suspended. Attempting resume, playback may be delayed.`);
             this.audioContext.resume().catch(err => console.error(`${this.MODULE_ID}: Error resuming context on play:`, err));
             // Playback logic will proceed, but sound won't start until context resumes.
        }

        console.log(`${this.MODULE_ID}: Starting playback at ${startTime.toFixed(3)}`);

        try {
            // Recreate oscillator if it was stopped and nulled previously
            if (!this.oscillator) {
                console.log(`${this.MODULE_ID}: Oscillator needs recreation.`);
                this._recreateOscillator(this.settings);
                if (!this.oscillator) { // Check if recreation failed
                     throw new Error("Failed to recreate oscillator for playback.");
                }
            }

            const now = this.audioContext.currentTime;
            const targetStartTime = Math.max(now, startTime); // Ensure start time is not in the past

            // Start the oscillator (safe to call multiple times if context handles it, but catch errors)
            try {
                this.oscillator.start(targetStartTime);
            } catch (e) {
                if (e.name === 'InvalidStateError') {
                    // console.warn(`${this.MODULE_ID}: Oscillator likely already started.`); // Common, can be noisy
                } else {
                    console.error(`${this.MODULE_ID}: Error starting oscillator:`, e);
                    throw e; // Re-throw other errors
                }
            }

            // Apply Attack Envelope
            const attackTime = this.settings.attackTime || this.defaultBassSettings.attackTime;
            const targetVolume = this.settings.bassVolume || this.defaultBassSettings.bassVolume;

            // Use cancelAndHoldAtTime for safer transitions if available
            if (typeof this.outputGain.gain.cancelAndHoldAtTime === 'function') {
                this.outputGain.gain.cancelAndHoldAtTime(targetStartTime);
            } else {
                this.outputGain.gain.cancelScheduledValues(targetStartTime);
            }
            this.outputGain.gain.setValueAtTime(0.0001, targetStartTime); // Start from near silence
            this.outputGain.gain.linearRampToValueAtTime(targetVolume, targetStartTime + attackTime);

            this.isPlaying = true;

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during play():`, error);
            this.isPlaying = false; // Ensure state is correct on error
             if (typeof ToastSystem !== 'undefined') {
                 ToastSystem.notify('error', `Sub Bass play failed: ${error.message}`);
             }
        }
    }

    /**
     * Stop the sub bass oscillator and apply release envelope.
     * @param {number} stopTime - AudioContext time when playback should stop.
     * @param {number} [fadeDuration=0.5] - Suggested duration (overridden by releaseTime).
     */
    stop(stopTime, fadeDuration = 0.5) { // fadeDuration is less relevant here, use releaseTime
        if (!this.isEnabled || !this.isPlaying) return;
        // Check essential nodes *before* proceeding
        if (!this.audioContext || !this.oscillator || !this.outputGain) {
            console.error(`${this.MODULE_ID}: Cannot stop - essential nodes or context missing.`);
            // Even if nodes are missing, ensure state is correct
            this.isPlaying = false;
            return;
        }
         if (this.audioContext.state === 'closed') {
            console.error(`${this.MODULE_ID}: Cannot stop - AudioContext is closed.`);
            this.isPlaying = false;
            return;
        }

        console.log(`${this.MODULE_ID}: Stopping playback at ${stopTime.toFixed(3)}`);

        try {
            const now = this.audioContext.currentTime;
            const targetStopTime = Math.max(now, stopTime); // Ensure stop time is not in the past

            // Apply Release Envelope
            const releaseTime = this.settings.releaseTime || this.defaultBassSettings.releaseTime;
            const timeConstant = releaseTime / 3.0; // Exponential decay time constant

            // Use cancelAndHoldAtTime for safer transitions if available
            if (typeof this.outputGain.gain.cancelAndHoldAtTime === 'function') {
                this.outputGain.gain.cancelAndHoldAtTime(targetStopTime);
            } else {
                this.outputGain.gain.cancelScheduledValues(targetStopTime);
            }
            // Set value at stopTime to current value to prevent jumps if stopped during attack
            const currentGain = this.outputGain.gain.value;
            this.outputGain.gain.setValueAtTime(currentGain, targetStopTime);
            // Exponential decay to silence
            this.outputGain.gain.setTargetAtTime(0.0001, targetStopTime, timeConstant);

            // Schedule Oscillator Stop - well after the release envelope finishes
            // stop() is final, so oscillator must be recreated later.
            const scheduleNodeStopTime = targetStopTime + releaseTime + 0.5; // Stop significantly after fade

            // Check if oscillator still exists and has a stop method before scheduling
            if (this.oscillator && this.oscillator.stop) {
                 try {
                      this.oscillator.stop(scheduleNodeStopTime);
                 } catch (e) {
                      if (e.name === 'InvalidStateError') {
                           // console.warn(`${this.MODULE_ID}: Oscillator likely already stopped.`);
                      } else {
                           console.error(`${this.MODULE_ID}: Error scheduling oscillator stop:`, e);
                           // Don't throw, but log the error
                      }
                 }
                 // Mark oscillator for recreation AFTER scheduling stop
                 this.oscillator = null;
            } else {
                 console.warn(`${this.MODULE_ID}: Oscillator missing or stop method unavailable during stop().`);
                 this.oscillator = null; // Assume it needs recreation
            }

            this.isPlaying = false; // Set state immediately

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during stop():`, error);
            this.isPlaying = false; // Ensure state is reset
            this.oscillator = null; // Assume oscillator needs recreation if stop errored
             if (typeof ToastSystem !== 'undefined') {
                 ToastSystem.notify('error', `Sub Bass stop failed: ${error.message}`);
             }
        }
    }

    /**
     * Smoothly transition parameters (frequency, volume) to match a new mood.
     * @param {string} newMood - The key of the new mood.
     * @param {object} newSettings - The moodAudioSettings for the new mood.
     * @param {number} transitionTime - Duration for the transition in seconds.
     * @param {object} moodConfig - Volume/occurrence/intensity configuration (0-100 values)
     */
    changeMood(newMood, newSettings, transitionTime, moodConfig) {
        if (!this.isEnabled) return;
        if (!this.audioContext) {
            console.error(`${this.MODULE_ID}: Cannot change mood, AudioContext is missing.`);
            return;
        }
         if (this.audioContext.state === 'closed') {
            console.error(`${this.MODULE_ID}: Cannot change mood, AudioContext is closed.`);
            return;
        }
        console.log(`${this.MODULE_ID}: Changing mood to '${newMood}' over ${transitionTime.toFixed(2)}s... Config:`, moodConfig);

        try {
            // Store original settings as baseSettings
            this.baseSettings = { ...this.defaultBassSettings, ...newSettings };
            // Merge new settings with defaults
            this.settings = { ...this.defaultBassSettings, ...newSettings };
            // Store the mood configuration
            this.moodConfig = { ...this.moodConfig, ...moodConfig };
            
            this.currentMood = newMood;

            // Apply mood configuration (handles volume, attack/release times)
            this._applyMoodConfig(transitionTime);
            
            const now = this.audioContext.currentTime;
            const rampTime = transitionTime * 0.7; // Use a good portion for smooth bass freq change

            // Frequency (baseFreq/octaveShift changes need to be applied separately from _applyMoodConfig)
            const targetFrequency = this._calculateFrequency(this.settings); // Calculate safely

            if (this.oscillator && this.oscillator.frequency) {
                 // Use cancelAndHoldAtTime for safer transitions if available
                 if (typeof this.oscillator.frequency.cancelAndHoldAtTime === 'function') {
                     this.oscillator.frequency.cancelAndHoldAtTime(now);
                 } else {
                     this.oscillator.frequency.cancelScheduledValues(now);
                 }
                 this.oscillator.frequency.setTargetAtTime(targetFrequency, now, rampTime); // Smooth frequency ramp
                 console.log(`${this.MODULE_ID}: Ramping frequency to ${targetFrequency.toFixed(2)} Hz`);
            } else if (this.isPlaying) {
                 // If playing but oscillator was stopped/nulled (e.g., after stop()), recreate it
                 console.warn(`${this.MODULE_ID}: Oscillator missing during mood change while playing. Recreating.`);
                 this._recreateOscillator(this.settings); // Handles setting the new frequency
                 if (this.oscillator) {
                     try { this.oscillator.start(now); } // Start immediately if recreated
                     catch(e) { if(e.name !== 'InvalidStateError') console.error(`${this.MODULE_ID}: Error starting recreated oscillator:`, e); }
                 } else {
                      console.error(`${this.MODULE_ID}: Failed to recreate oscillator during mood change.`);
                 }
            } else {
                 // If not playing and oscillator is null, recreate it silently so it's ready for next play
                 if (!this.oscillator) {
                      console.log(`${this.MODULE_ID}: Recreating oscillator during mood change (while stopped).`);
                      this._recreateOscillator(this.settings);
                 } else {
                      // If not playing but oscillator exists, just update its frequency for next play
                      this.oscillator.frequency.cancelScheduledValues(now);
                      this.oscillator.frequency.setValueAtTime(targetFrequency, now);
                 }
            }

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during changeMood():`, error);
             if (typeof ToastSystem !== 'undefined') {
                 ToastSystem.notify('error', `Sub Bass mood change failed: ${error.message}`);
             }
        }
    }

    /**
     * Clean up all audio resources created by this module.
     */
    dispose() {
        console.log(`${this.MODULE_ID}: Disposing...`);
        if (!this.isEnabled && !this.oscillator && !this.outputGain) {
             console.log(`${this.MODULE_ID}: Already disposed or not initialized.`);
             return; // Avoid redundant disposal
        }
        this.isEnabled = false;
        this.isPlaying = false;

        try {
            // --- Stop and disconnect oscillator ---
            if (this.oscillator) {
                try {
                     // Attempt to stop immediately if it has a stop method
                     if (this.oscillator.stop) {
                          this.oscillator.stop(0);
                     }
                } catch (e) {
                     // Ignore errors like InvalidStateError if already stopped
                     if (e.name !== 'InvalidStateError') {
                          console.warn(`${this.MODULE_ID}: Error stopping oscillator during dispose:`, e);
                     }
                }
                try {
                    this.oscillator.disconnect();
                } catch (e) {
                     console.warn(`${this.MODULE_ID}: Error disconnecting oscillator during dispose:`, e);
                }
            }

            // --- Disconnect output gain ---
            if (this.outputGain) {
                try {
                    this.outputGain.disconnect();
                } catch (e) {
                    console.warn(`${this.MODULE_ID}: Error disconnecting outputGain during dispose:`, e);
                }
            }
        } catch (error) {
            // Catch any unexpected errors during the disconnection phase
            console.error(`${this.MODULE_ID}: Unexpected error during node disconnection:`, error);
        } finally {
            // --- Nullify all references, regardless of disconnection success ---
            this.oscillator = null;
            this.outputGain = null;
            this.audioContext = null;
            this.masterOutput = null;
            this.settings = null;
            this.baseSettings = null;
            console.log(`${this.MODULE_ID}: Disposal complete.`);
        }
    }

    // --- Internal Helper Methods ---

    /**
     * Calculates the target sub frequency based on settings, clamped to min/max.
     * @param {object} settings - The current settings object.
     * @returns {number} The calculated frequency in Hz. Returns a safe default (minFrequency) on error.
     * @private
     */
    _calculateFrequency(settings) {
        const minFreq = settings?.minFrequency || this.defaultBassSettings.minFrequency;
        const maxFreq = settings?.maxFrequency || this.defaultBassSettings.maxFrequency;
        const defaultFreq = minFreq; // Safe fallback

        try {
            const baseFreq = settings?.baseFreq;
            if (typeof baseFreq !== 'number' || baseFreq <= 0) {
                console.warn(`${this.MODULE_ID}: Invalid or missing baseFreq (${baseFreq}) in settings. Using default: ${defaultFreq} Hz.`);
                return defaultFreq;
            }

            const octaveShift = settings?.subOctaveShift ?? this.defaultBassSettings.subOctaveShift; // Use nullish coalescing
            if (typeof octaveShift !== 'number') {
                 console.warn(`${this.MODULE_ID}: Invalid octaveShift (${octaveShift}). Using default: ${this.defaultBassSettings.subOctaveShift}`);
                 octaveShift = this.defaultBassSettings.subOctaveShift;
            }

            let targetFreq = baseFreq * Math.pow(2, octaveShift);

            // Clamp frequency to the defined sub range
            if (isNaN(targetFreq)) {
                 throw new Error("Calculated frequency is NaN");
            }
            targetFreq = Math.max(minFreq, Math.min(targetFreq, maxFreq));

            return targetFreq;

        } catch (error) {
             console.error(`${this.MODULE_ID}: Error calculating frequency:`, error, "Settings:", settings);
             return defaultFreq; // Return safe default on any calculation error
        }
    }

    /**
     * Recreates the oscillator node, sets its frequency, and connects it.
     * Used during init, play (if stopped), and changeMood (if needed).
     * @param {object} settings - The current settings object.
     * @private
     */
     _recreateOscillator(settings) {
          if (!this.audioContext || !this.outputGain) {
               console.error(`${this.MODULE_ID}: Cannot recreate oscillator - context or outputGain missing.`);
               this.oscillator = null; // Ensure it's null
               return;
          }
          // --- Dispose previous oscillator safely before creating new one ---
          if (this.oscillator) {
               try {
                   if (this.oscillator.stop) this.oscillator.stop(0);
               } catch(e) { if(e.name !== 'InvalidStateError') console.warn(`${this.MODULE_ID}: Error stopping previous oscillator during recreate:`, e); }
               try {
                   this.oscillator.disconnect();
               } catch(e) { console.warn(`${this.MODULE_ID}: Error disconnecting previous oscillator during recreate:`, e); }
               this.oscillator = null; // Nullify reference
          }

          try {
              this.oscillator = this.audioContext.createOscillator();
              this.oscillator.type = 'sine'; // Pure sine wave

              const targetFrequency = this._calculateFrequency(settings); // Calculate safely
              this.oscillator.frequency.setValueAtTime(targetFrequency, this.audioContext.currentTime);

              this.oscillator.connect(this.outputGain); // Connect to the module's gain node

              console.log(`${this.MODULE_ID}: Oscillator recreated. Target Freq: ${targetFrequency.toFixed(2)} Hz`);

          } catch (error) {
               console.error(`${this.MODULE_ID}: Failed to recreate oscillator:`, error);
               // Attempt cleanup of potentially partially created oscillator
               if (this.oscillator) {
                    try { this.oscillator.disconnect(); } catch (e) {}
               }
               this.oscillator = null; // Ensure it's null on failure
          }
     }

} // End class AEBassSubSine

// Make globally accessible for the AudioEngine
window.AEBassSubSine = AEBassSubSine;

console.log("ae_bassSubSine.js loaded and AEBassSubSine class defined.");