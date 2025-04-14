// ae_percKickSoft.js - Audio Module for Soft Kick Drum Percussion
// Part of the Harmonic Visions project by FatStinkyPanda
// Copyright (c) 2025 FatStinkyPanda - All rights reserved.
// Version: 1.0.1 (Fixed InvalidStateError on osc.stop)

/**
 * @class AEPercKickSoft
 * @description Generates soft, deep kick drum sounds, more felt than heard,
 *              using synthesized sine waves with pitch and amplitude envelopes.
 *              Designed for subtle rhythmic grounding. Implements the standard
 *              AudioEngine module interface with robust error handling and optimization.
 */
class AEPercKickSoft {
    constructor() {
        this.MODULE_ID = 'AEPercKickSoft'; // For logging and identification
        this.audioContext = null;
        this.masterOutput = null; // Connects to AudioEngine's masterInputGain
        this.settings = null;
        this.currentMood = null;
        this.isEnabled = false;
        this.isPlaying = false;

        // --- Core Audio Nodes (Module Level) ---
        this.moduleOutputGain = null; // Master gain for this module (volume and overall fades)
        this.filterNode = null;       // Optional subtle low-pass filter for warmth/shaping

        // --- Sequencing State ---
        this.sequenceTimeoutId = null; // Timeout ID for scheduling the next kick check
        this.currentPattern = [];      // Kick pattern (e.g., [1, 0, 0.5, 0] where 1=hit, 0=rest, 0.5=softer hit)
        this.currentPatternIndex = 0;  // Position within the current pattern
        this.beatDuration = 0.75;      // Duration of one beat/step in seconds (derived from tempo)
        this.nextKickTime = 0;         // AudioContext time for the next potential kick

        // --- Active Kick Tracking ---
        // Map<kickId, { osc: OscillatorNode, envGain: GainNode, cleanupTimeoutId: number, isStopping: boolean }>
        this.activeKicks = new Map();
        this.kickIdCounter = 0;

        // --- Default Settings Tailored for Soft Kick ---
        this.defaultKickSettings = {
            kickVolume: 0.65,         // Base volume (adjust in master mix)
            // Kick Sound Properties
            startFrequencyBase: 150,  // Hz, starting pitch of the drop
            startFrequencyRange: 30,  // Hz, random variation for start pitch
            endFrequencyBase: 50,     // Hz, ending pitch of the drop
            endFrequencyRange: 15,    // Hz, random variation for end pitch
            pitchDropTimeBase: 0.04,  // Seconds, duration of the pitch envelope
            pitchDropTimeRange: 0.02, // Seconds, random variation
            attackTime: 0.002,        // Seconds, very fast attack
            decayTimeBase: 0.20,      // Seconds, how long the kick resonates
            decayTimeRange: 0.10,     // Seconds, random variation
            velocityRange: 0.2,       // +/- range for random velocity variation (0-1)
            // Optional Filter
            useFilter: true,          // Whether to use the low-pass filter
            filterCutoff: 350,        // Hz, gentle low-pass to remove clickiness
            filterQ: 0.9,             // Low Q for smooth filtering
            // Sequencing
            tempo: 80,                // Default BPM if not provided by AudioEngine params
            pattern: [1, 0, 0.7, 0, 0.9, 0, 0.6, 0], // Example pattern (1=full, 0=rest, 0<n<1=velocity)
            humanizeTiming: 0.012,    // Max random timing offset (seconds)
            // Module Envelope
            attackTimeModule: 0.5,    // Module fade-in time (s)
            releaseTimeModule: 1.5,   // Module fade-out time (s)
        };

        console.log(`${this.MODULE_ID}: Instance created.`);
    }

    // --- Core Module Methods (AudioEngine Interface) ---

    /**
     * Initialize audio nodes based on initial mood settings.
     * @param {AudioContext} audioContext - The shared AudioContext.
     * @param {AudioNode} masterOutputNode - The node to connect the module's output to.
     * @param {object} initialSettings - The moodAudioSettings for the initial mood.
     * @param {string} initialMood - The initial mood key.
     */
    init(audioContext, masterOutputNode, initialSettings, initialMood) {
        if (this.isEnabled) {
            console.warn(`${this.MODULE_ID}: Already initialized.`);
            return;
        }
        console.log(`${this.MODULE_ID}: Initializing for mood '${initialMood}'...`);

        try {
            if (!audioContext || !masterOutputNode) {
                throw new Error("AudioContext or masterOutputNode is missing.");
            }
            if (audioContext.state === 'closed') {
                throw new Error("AudioContext is closed.");
            }
            this.audioContext = audioContext;
            this.masterOutput = masterOutputNode;
            // Merge initial settings with specific defaults for this module
            this.settings = { ...this.defaultKickSettings, ...initialSettings };
            this.currentMood = initialMood;
            this.currentPattern = this.settings.pattern || this.defaultKickSettings.pattern;
            this._updateBeatDuration(); // Calculate initial beat duration

            // --- Create Core Module Nodes ---
            // 1. Master Output Gain for the entire module
            this.moduleOutputGain = this.audioContext.createGain();
            this.moduleOutputGain.gain.setValueAtTime(0.0001, this.audioContext.currentTime); // Start silent

            // 2. Optional Filter
            let previousNode = this.moduleOutputGain; // Start connection chain from output gain backwards
            if (this.settings.useFilter) {
                this.filterNode = this.audioContext.createBiquadFilter();
                this.filterNode.type = 'lowpass';
                this.filterNode.frequency.setValueAtTime(this.settings.filterCutoff, this.audioContext.currentTime);
                this.filterNode.Q.setValueAtTime(this.settings.filterQ, this.audioContext.currentTime);
                this.filterNode.connect(previousNode); // Filter connects to Output Gain
                previousNode = this.filterNode; // Next connection point is the filter
                console.log(`${this.MODULE_ID}: Filter node created and connected.`);
            } else {
                this.filterNode = null; // Ensure filter node is null if not used
                console.log(`${this.MODULE_ID}: Filter node not used.`);
            }
            // Note: Individual kick sounds will connect to 'previousNode' (either filter or outputGain)

            // Final connection to Master Output
            this.moduleOutputGain.connect(this.masterOutput);

            this.isEnabled = true;
            console.log(`${this.MODULE_ID}: Initialization complete.`);

        } catch (error) {
            console.error(`${this.MODULE_ID}: Initialization failed:`, error);
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', `Soft Kick init failed: ${error.message}`);
            }
            this.dispose(); // Cleanup partial initialization
            this.isEnabled = false; // Ensure state is correct
            // Allow AudioEngine to handle the failure
        }
    }

    /** Update loop hook (minimal use for percussion). */
    update(time, mood, visualParams, audioParams, deltaTime) {
        if (!this.isEnabled || !this.isPlaying) return;
        // Could potentially add subtle filter modulation drift here if filter is active
        // Example:
        // if (this.filterNode) {
        //     const baseFreq = this.settings.filterCutoff || 350;
        //     const drift = Math.sin(time * 0.03 + this.kickIdCounter * 0.1) * 50; // Slow drift
        //     this.filterNode.frequency.setTargetAtTime(baseFreq + drift, this.audioContext.currentTime, 0.5);
        // }
    }

    /** Start the kick drum sequence scheduling. */
    play(startTime) {
        if (!this.isEnabled || this.isPlaying) return;
        if (!this.audioContext || !this.moduleOutputGain) {
            console.error(`${this.MODULE_ID}: Cannot play - AudioContext or moduleOutputGain missing.`);
            return;
        }
        if (this.audioContext.state === 'closed') {
            console.error(`${this.MODULE_ID}: Cannot play - AudioContext is closed.`);
            return;
        }
        if (this.audioContext.state === 'suspended') {
            console.warn(`${this.MODULE_ID}: AudioContext suspended. Attempting resume. Playback may be delayed.`);
            this.audioContext.resume().catch(err => console.error(`${this.MODULE_ID}: Error resuming context on play:`, err));
            // Proceed, but sound won't start until context resumes.
        }

        console.log(`${this.MODULE_ID}: Starting playback sequence at ${startTime.toFixed(3)}`);
        try {
            this.isPlaying = true;
            this.currentPatternIndex = 0; // Reset pattern position
            this.kickIdCounter = 0;       // Reset kick ID counter
            // Ensure next kick time isn't in the past relative to context time
            this.nextKickTime = Math.max(this.audioContext.currentTime, startTime);

            // Apply module attack envelope
            const attackTime = this.settings.attackTimeModule || this.defaultKickSettings.attackTimeModule;
            const targetVolume = this.settings.kickVolume || this.defaultKickSettings.kickVolume;
            const gainParam = this.moduleOutputGain.gain;

            if (typeof gainParam.cancelAndHoldAtTime === 'function') {
                gainParam.cancelAndHoldAtTime(this.nextKickTime);
            } else {
                gainParam.cancelScheduledValues(this.nextKickTime);
            }
            gainParam.setValueAtTime(0.0001, this.nextKickTime); // Start from silence
            gainParam.linearRampToValueAtTime(targetVolume, this.nextKickTime + attackTime);

            // Clear any previous scheduling timeout
            if (this.sequenceTimeoutId) {
                clearTimeout(this.sequenceTimeoutId);
                this.sequenceTimeoutId = null;
            }

            // Schedule the first kick check
            this._scheduleNextKick();

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during play():`, error);
            this.isPlaying = false; // Ensure state is correct on error
            if (this.sequenceTimeoutId) clearTimeout(this.sequenceTimeoutId);
            this.sequenceTimeoutId = null;
            if (typeof ToastSystem !== 'undefined') ToastSystem.notify('error', `Soft Kick play failed: ${error.message}`);
        }
    }

    /** Stop the kick sequence and fade out the module. */
    stop(stopTime, fadeDuration = 0.5) { // fadeDuration overridden by releaseTimeModule
        if (!this.isEnabled || !this.isPlaying) return;
        if (!this.audioContext || !this.moduleOutputGain) {
            console.error(`${this.MODULE_ID}: Cannot stop - AudioContext or moduleOutputGain missing.`);
            return;
        }
        if (this.audioContext.state === 'closed') {
            console.error(`${this.MODULE_ID}: Cannot stop - AudioContext is closed.`);
            return;
        }

        console.log(`${this.MODULE_ID}: Stopping playback sequence at ${stopTime.toFixed(3)}`);
        try {
            this.isPlaying = false; // Stop scheduling new kicks immediately

            // Clear the pending next kick check timeout
            if (this.sequenceTimeoutId) {
                clearTimeout(this.sequenceTimeoutId);
                this.sequenceTimeoutId = null;
            }

            const now = this.audioContext.currentTime;
            const targetStopTime = Math.max(now, stopTime); // Ensure stop time is not in the past

            // Apply module release envelope
            const releaseTime = this.settings.releaseTimeModule || this.defaultKickSettings.releaseTimeModule;
            const timeConstant = releaseTime / 3.0; // Exponential decay
            const gainParam = this.moduleOutputGain.gain;

            if (typeof gainParam.cancelAndHoldAtTime === 'function') {
                gainParam.cancelAndHoldAtTime(targetStopTime);
            } else {
                gainParam.cancelScheduledValues(targetStopTime);
            }
            const currentGain = gainParam.value;
            gainParam.setValueAtTime(currentGain, targetStopTime); // Start release from current level
            gainParam.setTargetAtTime(0.0001, targetStopTime, timeConstant);

            // Trigger release/cleanup for any currently sounding kicks
            // Since kicks are very short, we mostly just need to ensure their cleanup timers run.
            // Their sound will likely finish before the module fade-out completes.
            this.activeKicks.forEach((kickData, kickId) => {
                if (kickData && !kickData.isStopping) {
                    kickData.isStopping = true;
                    // We don't need to force a faster fade on the kick's envGain.
                    // Let its natural decay finish. The scheduled cleanup will handle node removal.
                    console.debug(`${this.MODULE_ID}: Letting active kick ${kickId} finish its natural decay.`);
                    // Re-schedule cleanup slightly earlier if needed, but usually not necessary.
                }
            });

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during stop():`, error);
            // Attempt to clear active kicks map as a fallback, though nodes might leak
            this.activeKicks.forEach((kickData, kickId) => { if (kickData?.cleanupTimeoutId) clearTimeout(kickData.cleanupTimeoutId); });
            this.activeKicks.clear();
            if (typeof ToastSystem !== 'undefined') ToastSystem.notify('error', `Soft Kick stop failed: ${error.message}`);
        }
    }

    /** Adapt kick generation parameters to the new mood's settings. */
    changeMood(newMood, newSettings, transitionTime) {
        if (!this.isEnabled) return;
        if (!this.audioContext) {
            console.error(`${this.MODULE_ID}: Cannot change mood - AudioContext missing.`);
            return;
        }
        if (this.audioContext.state === 'closed') {
            console.error(`${this.MODULE_ID}: Cannot change mood - AudioContext is closed.`);
            return;
        }

        console.log(`${this.MODULE_ID}: Changing mood to '${newMood}' over ${transitionTime.toFixed(2)}s`);
        try {
            // Merge new settings with defaults
            this.settings = { ...this.defaultKickSettings, ...newSettings };
            this.currentMood = newMood;

            const now = this.audioContext.currentTime;
            const rampTime = transitionTime * 0.5; // Use part of transition for smooth ramps

            // --- Update Module Parameters ---
            // 1. Overall Volume
            if (this.moduleOutputGain) {
                const targetVolume = this.isPlaying ? this.settings.kickVolume : 0.0001;
                const gainParam = this.moduleOutputGain.gain;
                 if (typeof gainParam.cancelAndHoldAtTime === 'function') {
                     gainParam.cancelAndHoldAtTime(now);
                 } else {
                     gainParam.cancelScheduledValues(now);
                 }
                gainParam.setTargetAtTime(targetVolume, now, rampTime / 2); // Faster volume ramp
            }

            // 2. Filter Parameters (if filter exists)
            if (this.filterNode) {
                this.filterNode.frequency.setTargetAtTime(this.settings.filterCutoff, now, rampTime);
                this.filterNode.Q.setTargetAtTime(this.settings.filterQ, now, rampTime);
            }

            // 3. Update Sequencing Parameters
            this.currentPattern = this.settings.pattern || this.defaultKickSettings.pattern;
            this._updateBeatDuration(); // Recalculate beat duration based on new tempo
            // Reset pattern index? Optional - could let current pattern finish or reset immediately.
            // Let's reset for a potentially quicker change in rhythm.
            this.currentPatternIndex = 0;

            // Kick sound parameters (frequency, decay etc.) are updated in settings
            // and will affect the *next* kick generated by _createSingleKick.

            console.log(`${this.MODULE_ID}: Kick parameters updated for mood '${newMood}'.`);

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during changeMood():`, error);
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', `Soft Kick mood change failed: ${error.message}`);
            }
        }
    }

    /** Clean up all audio resources and timers. */
    dispose() {
        console.log(`${this.MODULE_ID}: Disposing...`);
        if (!this.isEnabled && !this.moduleOutputGain) {
             console.log(`${this.MODULE_ID}: Already disposed or not initialized.`);
             return; // Avoid redundant disposal
        }
        this.isEnabled = false;
        this.isPlaying = false;

        try {
            // 1. Clear sequence timeout
            if (this.sequenceTimeoutId) {
                clearTimeout(this.sequenceTimeoutId);
                this.sequenceTimeoutId = null;
            }

            // 2. Stop and clean up any active kicks immediately
            this.activeKicks.forEach((kickData, kickId) => {
                this._forceCleanupKick(kickId); // Use forceful cleanup
            });
            this.activeKicks.clear();

            // 3. Disconnect module-level nodes
            if (this.filterNode) try { this.filterNode.disconnect(); } catch (e) {}
            if (this.moduleOutputGain) try { this.moduleOutputGain.disconnect(); } catch (e) {}

        } catch (error) {
             console.error(`${this.MODULE_ID}: Error during node disconnection phase:`, error);
        } finally {
            // 4. Nullify all references
            this.moduleOutputGain = null;
            this.filterNode = null;
            this.audioContext = null;
            this.masterOutput = null;
            this.settings = null;
            this.currentPattern = [];
            this.activeKicks.clear(); // Ensure map is cleared
            console.log(`${this.MODULE_ID}: Disposal complete.`);
        }
    }

    // --- Internal Sequencing and Kick Generation ---

    /** Updates the beat duration based on the current tempo setting. */
    _updateBeatDuration() {
        const tempo = this.settings?.tempo || this.defaultKickSettings.tempo;
        if (tempo <= 0) {
            console.warn(`${this.MODULE_ID}: Invalid tempo (${tempo}), using default.`);
            this.beatDuration = 60.0 / this.defaultKickSettings.tempo;
        } else {
            this.beatDuration = 60.0 / tempo;
        }
         // console.debug(`${this.MODULE_ID}: Beat duration updated to ${this.beatDuration.toFixed(3)}s for tempo ${tempo}`);
    }

    /** Schedules the next check/trigger for a kick using setTimeout. */
    _scheduleNextKick() {
        if (!this.isPlaying || !this.audioContext) return;

        // Calculate time until the next kick *should* start based on pattern timing
        const currentTime = this.audioContext.currentTime;
        const delaySeconds = Math.max(0, this.nextKickTime - currentTime);
        const delayMilliseconds = delaySeconds * 1000;

        // Clear previous timeout if any
        if (this.sequenceTimeoutId) {
            clearTimeout(this.sequenceTimeoutId);
        }

        // Schedule the next execution
        this.sequenceTimeoutId = setTimeout(() => {
            if (!this.isPlaying) return; // Check state again inside timeout
            try {
                this._playNextKickInSequence(); // Trigger the kick sound generation
            } catch (e) {
                console.error(`${this.MODULE_ID}: Error in _playNextKickInSequence:`, e);
                this.stop(this.audioContext.currentTime); // Stop sequence on error
            }
        }, delayMilliseconds);
    }

    /** Plays the current kick/rest in the sequence and schedules the next check. */
    _playNextKickInSequence() {
        if (!this.isPlaying || !this.audioContext || this.currentPattern.length === 0) {
            this.isPlaying = false; // Stop if pattern is empty or state changed
            return;
        }

        const velocity = this.currentPattern[this.currentPatternIndex];
        const noteStartTime = this.nextKickTime; // Use the pre-calculated start time

        // Apply timing humanization
        let timingOffset = 0;
        if (this.settings.humanizeTiming && this.settings.humanizeTiming > 0) {
             timingOffset = (Math.random() - 0.5) * 2.0 * this.settings.humanizeTiming;
        }
        const actualKickPlayTime = noteStartTime + timingOffset;

        // Trigger a kick sound if velocity > 0 (0 indicates a rest)
        if (typeof velocity === 'number' && velocity > 0) {
            // console.debug(`${this.MODULE_ID}: Triggering kick at ${actualKickPlayTime.toFixed(3)}s with velocity ${velocity.toFixed(2)}`);
            this._createSingleKick(actualKickPlayTime, velocity);
        } else {
            // console.debug(`${this.MODULE_ID}: Rest at step ${this.currentPatternIndex}`);
        }

        // Calculate the start time for the *next* beat/step
        this.nextKickTime = noteStartTime + this.beatDuration;

        // Move to the next step in the pattern
        this.currentPatternIndex++;
        if (this.currentPatternIndex >= this.currentPattern.length) {
            this.currentPatternIndex = 0; // Loop pattern
            // console.debug(`${this.MODULE_ID}: Looped pattern.`);
        }

        // Schedule the next check based on the calculated nextKickTime
        this._scheduleNextKick();
    }


    /** Creates and plays a single synthesized soft kick drum sound. */
    _createSingleKick(playTime, velocity) {
        // Determine the connection point based on whether the filter is used
        const connectionPoint = this.filterNode || this.moduleOutputGain;

        if (!this.audioContext || !connectionPoint || playTime < this.audioContext.currentTime) {
             console.warn(`${this.MODULE_ID}: Skipping kick creation - invalid time or missing nodes.`);
             return;
        }

        let osc = null;
        let envGain = null;
        const kickId = `kick-${this.kickIdCounter++}`;

        try {
            // --- Create Nodes ---
            osc = this.audioContext.createOscillator();
            osc.type = 'sine'; // Sine is best for soft fundamental

            envGain = this.audioContext.createGain(); // Controls the ADSR-like envelope
            envGain.gain.setValueAtTime(0.0001, playTime); // Start silent

            // Connect nodes: Osc -> EnvGain -> FilterNode (or ModuleOutputGain)
            osc.connect(envGain);
            envGain.connect(connectionPoint);

            // --- Start the oscillator PRECISELY at playTime ---
            // Moved this *before* scheduling stop and envelopes
            osc.start(playTime);
            // --- End Move ---

            // --- Calculate Randomized Parameters ---
            const freqStart = this.settings.startFrequencyBase + (Math.random() - 0.5) * 2.0 * this.settings.startFrequencyRange;
            const freqEnd = this.settings.endFrequencyBase + (Math.random() - 0.5) * 2.0 * this.settings.endFrequencyRange;
            const pitchDropTime = this.settings.pitchDropTimeBase + (Math.random() - 0.5) * 2.0 * this.settings.pitchDropTimeRange;
            const decayTime = this.settings.decayTimeBase + (Math.random() - 0.5) * 2.0 * this.settings.decayTimeRange;
            const randomVelocityMod = 1.0 + (Math.random() - 0.5) * 2.0 * this.settings.velocityRange;
            const finalVelocity = Math.max(0.01, Math.min(1.0, velocity * randomVelocityMod)); // Apply pattern velocity and random mod

            // --- Apply Pitch Envelope ---
            const freqParam = osc.frequency;
            freqParam.setValueAtTime(freqStart, playTime);
            freqParam.exponentialRampToValueAtTime(Math.max(20, freqEnd), playTime + pitchDropTime); // Ensure end freq > 0

            // --- Apply Volume Envelope (Fast Attack, Quick Exponential Decay) ---
            const attack = this.settings.attackTime || 0.002;
            const gainParam = envGain.gain;
            gainParam.linearRampToValueAtTime(finalVelocity, playTime + attack); // Quick rise to peak velocity
            // Exponential decay starting immediately after attack peak
            const decayStartTime = playTime + attack;
            // Use time constant based on randomized decay time
            gainParam.setTargetAtTime(0.0001, decayStartTime, decayTime / 3.0);

            // --- Schedule Node Stop ---
            // Stop time is after the decay phase completes significantly
            const stopTime = decayStartTime + decayTime + 0.1; // Add buffer
            osc.stop(stopTime); // Now safe to schedule stop

            // --- Schedule Cleanup ---
            const cleanupDelay = (stopTime - this.audioContext.currentTime + 0.1) * 1000; // Delay from *now*
            const cleanupTimeoutId = setTimeout(() => {
                this._cleanupKick(kickId);
            }, Math.max(50, cleanupDelay)); // Ensure minimum delay

            // --- Store Active Kick ---
            this.activeKicks.set(kickId, { osc, envGain, cleanupTimeoutId, isStopping: false });

            // --- MOVED: osc.start(playTime); --- was here

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error creating kick ${kickId}:`, error);
            // Attempt cleanup of partially created nodes
            this._cleanupPartialKick({ osc, envGain });
            // Remove from tracking if it was added
            if (this.activeKicks.has(kickId)) {
                 const kickData = this.activeKicks.get(kickId);
                 if (kickData.cleanupTimeoutId) clearTimeout(kickData.cleanupTimeoutId);
                 this.activeKicks.delete(kickId);
            }
             if (typeof ToastSystem !== 'undefined') {
                 ToastSystem.notify('warning', `Failed to create kick sound: ${error.message}`);
             }
        }
    }

    /** Cleans up resources associated with a finished or stopped kick. */
    _cleanupKick(kickId) {
        if (!this.activeKicks.has(kickId)) return; // Already cleaned up

        const kickData = this.activeKicks.get(kickId);
        // console.debug(`${this.MODULE_ID}: Cleaning up kick ${kickId}`);

        try {
             // Disconnect nodes in reverse order of connection
             if (kickData.envGain) kickData.envGain.disconnect();
             if (kickData.osc) kickData.osc.disconnect();
        } catch (e) {
             console.warn(`${this.MODULE_ID}: Error disconnecting nodes for kick ${kickId}:`, e);
        } finally {
             // Clear the cleanup timeout reference itself from the object
             if (kickData.cleanupTimeoutId) {
                 // The timeout function itself has already run, so no need to clearTimeout here.
             }
             // Remove from the active kicks map
             this.activeKicks.delete(kickId);
        }
    }

     /** Forcefully stops and cleans up a kick immediately (used in dispose). */
     _forceCleanupKick(kickId) {
         if (!this.activeKicks.has(kickId)) return;
         const kickData = this.activeKicks.get(kickId);

         // Clear any pending cleanup timeout
         if (kickData.cleanupTimeoutId) {
             clearTimeout(kickData.cleanupTimeoutId);
         }

         try {
             if (kickData.osc) {
                 try { if(kickData.osc.stop) kickData.osc.stop(0); } catch(e){} // Stop immediately
                 try { kickData.osc.disconnect(); } catch(e){}
             }
             if (kickData.envGain) try { kickData.envGain.disconnect(); } catch(e){}
         } catch (e) {
             console.error(`${this.MODULE_ID}: Error during force cleanup for kick ${kickId}:`, e);
         } finally {
              this.activeKicks.delete(kickId); // Ensure removal from map
         }
     }

      /** Cleans up partially created nodes if kick creation fails mid-way. */
      _cleanupPartialKick(nodes) {
           console.warn(`${this.MODULE_ID}: Cleaning up partially created kick nodes.`);
           const { osc, envGain } = nodes;
           if (envGain) try { envGain.disconnect(); } catch(e){}
           if (osc) try { osc.disconnect(); } catch(e){}
      }

} // End class AEPercKickSoft

// Make globally accessible for the AudioEngine
window.AEPercKickSoft = AEPercKickSoft;

console.log("ae_percKickSoft.js loaded and AEPercKickSoft class defined.");