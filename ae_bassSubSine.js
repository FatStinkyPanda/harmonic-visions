// ae_bassSubSine.js - Audio Module for Deep Sub Sine Bass
// Part of the Harmonic Visions project by FatStinkyPanda
// Copyright (c) 2025 FatStinkyPanda - All rights reserved.
// Version: 1.0.0 (Initial Implementation)

/**
 * @class AEBassSubSine
 * @description Generates a pure, deep sine wave bass tone to provide a foundational low end.
 *              Implements the standard AudioEngine module interface.
 */
class AEBassSubSine {
    constructor() {
        this.MODULE_ID = 'AEBassSubSine'; // For logging
        this.audioContext = null;
        this.masterOutput = null; // Connects to AudioEngine's masterInputGain
        this.settings = null;
        this.currentMood = null;
        this.isEnabled = false;
        this.isPlaying = false;

        // Core Nodes
        this.outputGain = null; // Master gain for envelope and volume
        this.oscillator = null; // The single sine wave oscillator

        // Default settings tailored for a sub bass sound
        this.defaultBassSettings = {
            bassVolume: 0.5,     // Sub can be relatively loud but adjust based on mix
            subOctaveShift: -2,  // Default to two octaves below baseFreq
            attackTime: 1.5,     // Slow attack for smooth foundation
            releaseTime: 2.5,    // Slow release for sustain
            minFrequency: 20,    // Hz - lowest audible/sensible frequency
            maxFrequency: 80,    // Hz - upper limit for sub range
            baseFreq: 110,       // Fallback base frequency (A2)
            // Note: 'scale' and 'chordNotes' are not typically used by a sub
            // that just follows the root baseFreq.
        };

        console.log(`${this.MODULE_ID}: Instance created.`);
    }

    // --- Core Module Methods (Following AudioEngine Interface) ---

    /**
     * Initialize audio nodes based on initial mood settings.
     */
    init(audioContext, masterOutputNode, initialSettings, initialMood) {
        if (this.isEnabled) {
            console.warn(`${this.MODULE_ID}: Already initialized.`);
            return;
        }
        console.log(`${this.MODULE_ID}: Initializing for mood '${initialMood}'...`);

        try {
            this.audioContext = audioContext;
            this.masterOutput = masterOutputNode;
            // Merge initial settings with specific defaults
            this.settings = { ...this.defaultBassSettings, ...initialSettings };
            this.currentMood = initialMood;

            // --- Create Core Nodes ---
            // 1. Output Gain (controls envelope and overall module volume)
            this.outputGain = this.audioContext.createGain();
            this.outputGain.gain.value = 0.0001; // Start silent

            // 2. Oscillator
            this.oscillator = this.audioContext.createOscillator();
            this.oscillator.type = 'sine'; // Pure sine wave

            // Calculate and set initial frequency
            const initialFrequency = this._calculateFrequency(this.settings);
            if (initialFrequency > 0) {
                this.oscillator.frequency.setValueAtTime(initialFrequency, this.audioContext.currentTime);
            } else {
                console.warn(`${this.MODULE_ID}: Initial frequency calculation resulted in 0 or less. Oscillator might not produce sound.`);
                // Optionally set a default safe frequency
                this.oscillator.frequency.setValueAtTime(40, this.audioContext.currentTime);
            }

            // --- Connect Audio Graph ---
            this.oscillator.connect(this.outputGain);
            this.outputGain.connect(this.masterOutput);

            this.isEnabled = true;
            console.log(`${this.MODULE_ID}: Initialization complete. Initial Freq: ${initialFrequency.toFixed(2)} Hz`);

        } catch (error) {
            console.error(`${this.MODULE_ID}: Initialization failed:`, error);
            this.dispose(); // Cleanup partial initialization
            throw error; // Propagate error
        }
    }

    /**
     * Update loop hook (minimal use for pure sub).
     */
    update(time, mood, visualParams, audioParams, deltaTime) {
        if (!this.isEnabled || !this.isPlaying) return;
        // No typical updates needed for a pure sub.
        // Could add *extremely* slow, subtle LFO to frequency/detune for drift if desired,
        // but generally avoided to maintain purity.
    }

    /**
     * Start the sub bass oscillator and apply attack envelope.
     */
    play(startTime) {
        if (!this.isEnabled || this.isPlaying) return;
        if (!this.audioContext || !this.oscillator || !this.outputGain) {
            console.error(`${this.MODULE_ID}: Cannot play, essential nodes or context missing.`);
            return;
        }
        console.log(`${this.MODULE_ID}: Starting playback at ${startTime.toFixed(3)}`);

        try {
            // Start the oscillator (safe to call multiple times if context handles it)
            try {
                this.oscillator.start(startTime);
            } catch (e) {
                if (e.name === 'InvalidStateError') {
                    // console.warn(`${this.MODULE_ID}: Oscillator likely already started.`);
                } else {
                    throw e; // Re-throw other errors
                }
            }

            // Apply Attack Envelope
            const attackTime = this.settings.attackTime || this.defaultBassSettings.attackTime;
            const targetVolume = this.settings.bassVolume || this.defaultBassSettings.bassVolume;

            this.outputGain.gain.cancelScheduledValues(startTime);
            this.outputGain.gain.setValueAtTime(0.0001, startTime); // Start from near silence
            this.outputGain.gain.linearRampToValueAtTime(targetVolume, startTime + attackTime);

            this.isPlaying = true;

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during play():`, error);
            this.isPlaying = false; // Ensure state is correct on error
        }
    }

    /**
     * Stop the sub bass oscillator and apply release envelope.
     */
    stop(stopTime, fadeDuration = 0.5) { // fadeDuration is less relevant here, use releaseTime
        if (!this.isEnabled || !this.isPlaying) return;
        if (!this.audioContext || !this.oscillator || !this.outputGain) {
            console.error(`${this.MODULE_ID}: Cannot stop, essential nodes or context missing.`);
            return;
        }
        console.log(`${this.MODULE_ID}: Stopping playback at ${stopTime.toFixed(3)}`);

        try {
            // Apply Release Envelope
            const releaseTime = this.settings.releaseTime || this.defaultBassSettings.releaseTime;
            const timeConstant = releaseTime / 3.0; // Exponential decay time constant

            this.outputGain.gain.cancelScheduledValues(stopTime);
            // Set value at stopTime to current value to prevent jumps if stopped during attack
            const currentGain = this.outputGain.gain.value;
            this.outputGain.gain.setValueAtTime(currentGain, stopTime);
            // Exponential decay to silence
            this.outputGain.gain.setTargetAtTime(0.0001, stopTime, timeConstant);

            // Schedule Oscillator Stop - well after the release envelope finishes
            // We don't actually need to stop/restart a continuous sub oscillator
            // unless we want silence between mood changes or during pauses.
            // For continuous foundation, we might let it run and just control gain.
            // Let's keep the stop for proper cleanup during dispose/long pauses.
            const scheduleStopTime = stopTime + releaseTime + 0.5; // Stop significantly after fade
            if (this.oscillator.stop) {
                 // Schedule the stop call
                 this.oscillator.stop(scheduleStopTime);
                 // Recreate the oscillator when play is called again, as stop() is final
                 this.oscillator = null; // Mark oscillator as stopped/needs recreation
            } else {
                 console.warn(`${this.MODULE_ID}: Oscillator stop method not available?`);
            }


            this.isPlaying = false;

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during stop():`, error);
            // Ensure state is reset
            this.isPlaying = false;
            this.oscillator = null; // Assume oscillator needs recreation if stop errored
        }
    }

    /**
     * Smoothly transition parameters (frequency, volume) to match a new mood.
     */
    changeMood(newMood, newSettings, transitionTime) {
        if (!this.isEnabled) return;
        if (!this.audioContext) {
            console.error(`${this.MODULE_ID}: Cannot change mood, AudioContext is missing.`);
            return;
        }
        console.log(`${this.MODULE_ID}: Changing mood to '${newMood}' over ${transitionTime.toFixed(2)}s`);

        try {
            // Merge new settings with defaults
            this.settings = { ...this.defaultBassSettings, ...newSettings };
            this.currentMood = newMood;

            const now = this.audioContext.currentTime;
            const rampTime = transitionTime * 0.7; // Use a good portion of transition for smooth bass freq change

            // --- Update Parameters ---

            // 1. Volume
            if (this.outputGain) {
                const targetVolume = this.isPlaying ? this.settings.bassVolume : 0.0001;
                this.outputGain.gain.cancelScheduledValues(now);
                this.outputGain.gain.setTargetAtTime(targetVolume, now, rampTime / 3); // Faster volume adjustment
            }

            // 2. Frequency
            if (this.oscillator && this.oscillator.frequency) {
                 const targetFrequency = this._calculateFrequency(this.settings);
                 if (targetFrequency > 0) {
                     this.oscillator.frequency.cancelScheduledValues(now);
                     this.oscillator.frequency.setTargetAtTime(targetFrequency, now, rampTime); // Smooth frequency ramp
                      console.log(`${this.MODULE_ID}: Ramping frequency to ${targetFrequency.toFixed(2)} Hz`);
                 } else {
                      console.warn(`${this.MODULE_ID}: Target frequency is 0 or less during mood change. Bass might become silent.`);
                      // Optionally ramp to a safe low frequency instead of 0
                       this.oscillator.frequency.setTargetAtTime(this.defaultBassSettings.minFrequency, now, rampTime);
                 }
            } else if (this.isPlaying) {
                 // If playing but oscillator was stopped/nulled (e.g., after stop()), recreate it
                 console.warn(`${this.MODULE_ID}: Oscillator missing during mood change while playing. Recreating.`);
                 this._recreateOscillator(this.settings);
                 if (this.oscillator) {
                     try { this.oscillator.start(now); } catch(e){} // Start immediately
                 }
            }

            // Envelope times (attack/release) are updated in settings and will apply on next play/stop.

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during changeMood():`, error);
             if(typeof ToastSystem !== 'undefined') ToastSystem.notify('error', 'Error changing sub bass mood.');
        }
    }

    /**
     * Clean up all audio resources.
     */
    dispose() {
        console.log(`${this.MODULE_ID}: Disposing...`);
        if (!this.isEnabled && !this.oscillator && !this.outputGain) {
             return; // Already clean/uninitialized
        }
        this.isEnabled = false;
        this.isPlaying = false;

        try {
            // Stop oscillator if it exists and has a stop method
            if (this.oscillator && this.oscillator.stop) {
                try {
                     this.oscillator.stop(0); // Stop immediately
                } catch(e) { /* ignore if already stopped */ }
            }
            // Disconnect nodes
            if (this.oscillator) {
                try { this.oscillator.disconnect(); } catch (e) {/* ignore */ }
            }
            if (this.outputGain) {
                try { this.outputGain.disconnect(); } catch (e) {/* ignore */ }
            }
        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during node disconnection:`, error);
        } finally {
            // Clear state regardless of disconnection errors
            this.oscillator = null;
            this.outputGain = null;
            this.audioContext = null;
            this.masterOutput = null;
            this.settings = null;
            console.log(`${this.MODULE_ID}: Disposal complete.`);
        }
    }

    // --- Internal Helper Methods ---

    /**
     * Calculates the target sub frequency based on settings.
     * @param {object} settings - The current settings object.
     * @returns {number} The calculated frequency in Hz, clamped to min/max. Returns 0 if baseFreq is invalid.
     * @private
     */
    _calculateFrequency(settings) {
        const baseFreq = settings.baseFreq;
        if (!baseFreq || baseFreq <= 0) {
            console.error(`${this.MODULE_ID}: Invalid baseFreq (${baseFreq}) in settings.`);
            return 0; // Indicate error
        }
        const octaveShift = settings.subOctaveShift || this.defaultBassSettings.subOctaveShift;
        const minFreq = settings.minFrequency || this.defaultBassSettings.minFrequency;
        const maxFreq = settings.maxFrequency || this.defaultBassSettings.maxFrequency;

        try {
            let targetFreq = baseFreq * Math.pow(2, octaveShift);
            // Clamp frequency to the defined sub range
            targetFreq = Math.max(minFreq, Math.min(targetFreq, maxFreq));
            return targetFreq;
        } catch (error) {
             console.error(`${this.MODULE_ID}: Error calculating frequency:`, error);
             return 0; // Return 0 on calculation error
        }
    }

    /**
     * Recreates the oscillator node. Used if stop() was called previously.
     * @param {object} settings - The current settings object.
     * @private
     */
     _recreateOscillator(settings) {
          if (!this.audioContext || !this.outputGain) {
               console.error(`${this.MODULE_ID}: Cannot recreate oscillator, context or output gain missing.`);
               return;
          }
          // Dispose previous if it somehow still exists
          if (this.oscillator) {
               try {
                   if(this.oscillator.stop) this.oscillator.stop(0);
                   this.oscillator.disconnect();
               } catch(e){}
          }

          try {
              this.oscillator = this.audioContext.createOscillator();
              this.oscillator.type = 'sine';
              const targetFrequency = this._calculateFrequency(settings);
              if (targetFrequency > 0) {
                  this.oscillator.frequency.setValueAtTime(targetFrequency, this.audioContext.currentTime);
              } else {
                   this.oscillator.frequency.setValueAtTime(40, this.audioContext.currentTime); // Safe fallback
              }
              this.oscillator.connect(this.outputGain);
              console.log(`${this.MODULE_ID}: Oscillator recreated. Target Freq: ${targetFrequency.toFixed(2)} Hz`);
          } catch (error) {
               console.error(`${this.MODULE_ID}: Failed to recreate oscillator:`, error);
               this.oscillator = null; // Ensure it's null on failure
          }
     }

} // End class AEBassSubSine

// Make globally accessible for the AudioEngine
window.AEBassSubSine = AEBassSubSine;