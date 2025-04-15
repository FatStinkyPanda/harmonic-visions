// ae_percKickSoft.js - Audio Module for Soft Kick Drum Percussion
// Part of the Harmonic Visions project by FatStinkyPanda
// Copyright (c) 2025 FatStinkyPanda - All rights reserved.
// Version: 1.0.3 (Added Vol/Occur/Inten configuration system)

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
        this.baseSettings = null; // Store base settings from data.js
        this.currentMood = null;
        this.isEnabled = false;
        this.isPlaying = false;
        
        // --- Mood Configuration (0-100 scale) ---
        this.moodConfig = { volume: 100, occurrence: 100, intensity: 50 }; // Default config

        // --- Core Audio Nodes (Module Level) ---
        this.moduleOutputGain = null; // Master gain for this module (volume and overall fades)
        this.filterNode = null;       // Optional subtle low-pass filter for warmth/shaping

        // --- Sequencing State ---
        this.sequenceTimeoutId = null; // Timeout ID for scheduling the next kick check
        this.currentPattern = [];      // Kick pattern (e.g., [1, 0, 0.5, 0] where 1=hit, 0=rest, 0.5=softer hit)
        this.basePattern = [];         // Original pattern before occurrence filtering
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
            
            // --- Intensity Mapping Limits ---
            startFrequencyMin: 120,   // Min start frequency at 0% intensity
            startFrequencyMax: 180,   // Max start frequency at 100% intensity
            pitchDropTimeMin: 0.06,   // Min pitch drop time at 0% intensity (slower = softer)
            pitchDropTimeMax: 0.02,   // Max pitch drop time at 100% intensity (faster = punchier) 
            decayTimeMin: 0.15,       // Min decay time at 0% intensity
            decayTimeMax: 0.35,       // Max decay time at 100% intensity
            filterCutoffMin: 250,     // Min filter cutoff at 0% intensity
            filterCutoffMax: 500,     // Max filter cutoff at 100% intensity
            velocityRangeMin: 0.1,    // Min velocity variation at 0% intensity
            velocityRangeMax: 0.3     // Max velocity variation at 100% intensity
        };

        console.log(`${this.MODULE_ID}: Instance created.`);
    }

    // --- Helper for mapping 0-100 values to parameter ranges ---
    _mapValue(value0to100, minTarget, maxTarget) {
        const clampedValue = Math.max(0, Math.min(100, value0to100 ?? 100)); // Default to 100 if undefined
        return minTarget + (maxTarget - minTarget) * (clampedValue / 100.0);
    }

    // --- Apply mood configuration to parameters ---
    _applyMoodConfig(transitionTime = 0) {
        if (!this.moodConfig || !this.audioContext) return; // Check if config and context exist

        const now = this.audioContext.currentTime;
        const rampTime = transitionTime > 0 ? transitionTime * 0.5 : 0; // Shorter ramp for config changes
        const timeConstant = rampTime / 3.0;

        console.log(`${this.MODULE_ID}: Applying mood config - Volume: ${this.moodConfig.volume}, Occurrence: ${this.moodConfig.occurrence}, Intensity: ${this.moodConfig.intensity}`);

        // --- Apply Volume ---
        if (this.moduleOutputGain && this.moodConfig.volume !== undefined) {
            const baseVolume = this.baseSettings.kickVolume || this.defaultKickSettings.kickVolume;
            const targetVolume = this._mapValue(this.moodConfig.volume, 0.0, baseVolume);
            console.log(`${this.MODULE_ID}: Applying Volume ${this.moodConfig.volume}/100 -> ${targetVolume.toFixed(3)}`);
            
            if (this.isPlaying) {
                if (rampTime > 0.01) {
                    this.moduleOutputGain.gain.setTargetAtTime(targetVolume, now, timeConstant);
                } else {
                    this.moduleOutputGain.gain.setValueAtTime(targetVolume, now);
                }
            } else {
                // Store for when play() is called
                this.settings.kickVolume = targetVolume;
            }
        }

        // --- Apply Occurrence ---
        if (this.moodConfig.occurrence !== undefined) {
            // Occurrence affects the density of the kick pattern
            // We'll filter the original pattern based on the occurrence value
            this._updatePatternBasedOnOccurrence();
            console.log(`${this.MODULE_ID}: Applying Occurrence ${this.moodConfig.occurrence}/100 -> pattern density modified`);
        }

        // --- Apply Intensity ---
        if (this.moodConfig.intensity !== undefined) {
            console.log(`${this.MODULE_ID}: Applying Intensity ${this.moodConfig.intensity}/100`);
            
            // 1. Starting Frequency (affects "attack" character)
            const startFreqMin = this.baseSettings.startFrequencyMin || this.defaultKickSettings.startFrequencyMin;
            const startFreqMax = this.baseSettings.startFrequencyMax || this.defaultKickSettings.startFrequencyMax;
            this.settings.startFrequencyBase = this._mapValue(this.moodConfig.intensity, startFreqMin, startFreqMax);
            console.log(`  -> Start Frequency: ${this.settings.startFrequencyBase.toFixed(2)} Hz`);
            
            // 2. Pitch Drop Time (higher intensity = faster drop = punchier kick)
            const pitchDropMin = this.baseSettings.pitchDropTimeMin || this.defaultKickSettings.pitchDropTimeMin;
            const pitchDropMax = this.baseSettings.pitchDropTimeMax || this.defaultKickSettings.pitchDropTimeMax;
            // Note: We actually want FASTER drops (lower values) at higher intensity
            this.settings.pitchDropTimeBase = this._mapValue(100 - this.moodConfig.intensity, pitchDropMax, pitchDropMin);
            console.log(`  -> Pitch Drop Time: ${this.settings.pitchDropTimeBase.toFixed(3)} s`);
            
            // 3. Decay Time (higher intensity = longer decay)
            const decayTimeMin = this.baseSettings.decayTimeMin || this.defaultKickSettings.decayTimeMin;
            const decayTimeMax = this.baseSettings.decayTimeMax || this.defaultKickSettings.decayTimeMax;
            this.settings.decayTimeBase = this._mapValue(this.moodConfig.intensity, decayTimeMin, decayTimeMax);
            console.log(`  -> Decay Time: ${this.settings.decayTimeBase.toFixed(3)} s`);
            
            // 4. Filter Cutoff (if filter exists)
            if (this.filterNode && this.settings.useFilter) {
                const cutoffMin = this.baseSettings.filterCutoffMin || this.defaultKickSettings.filterCutoffMin;
                const cutoffMax = this.baseSettings.filterCutoffMax || this.defaultKickSettings.filterCutoffMax;
                const targetCutoff = this._mapValue(this.moodConfig.intensity, cutoffMin, cutoffMax);
                console.log(`  -> Filter Cutoff: ${targetCutoff.toFixed(1)} Hz`);
                
                if (rampTime > 0.01) {
                    this.filterNode.frequency.setTargetAtTime(targetCutoff, now, timeConstant);
                } else {
                    this.filterNode.frequency.setValueAtTime(targetCutoff, now);
                }
                this.settings.filterCutoff = targetCutoff;
            }
            
            // 5. Velocity Range (higher intensity = more velocity variation)
            const velRangeMin = this.baseSettings.velocityRangeMin || this.defaultKickSettings.velocityRangeMin;
            const velRangeMax = this.baseSettings.velocityRangeMax || this.defaultKickSettings.velocityRangeMax;
            this.settings.velocityRange = this._mapValue(this.moodConfig.intensity, velRangeMin, velRangeMax);
            console.log(`  -> Velocity Range: ${this.settings.velocityRange.toFixed(2)}`);
        }
    }
    
    // --- Updates the kick pattern based on occurrence setting ---
    _updatePatternBasedOnOccurrence() {
        if (!this.basePattern || this.basePattern.length === 0) {
            // If no base pattern, use the current one as base
            this.basePattern = [...this.settings.pattern];
        }
        
        if (this.moodConfig.occurrence >= 100) {
            // At 100% occurrence, use the full pattern
            this.currentPattern = [...this.basePattern];
            return;
        }
        
        // For lower occurrence values, selectively zero out some hits
        // Higher velocity hits are preserved longer as occurrence decreases
        this.currentPattern = this.basePattern.map(velocity => {
            if (velocity === 0) return 0; // Keep rests as rests
            
            // The higher the velocity and occurrence, the more likely the hit is kept
            // Very high velocity hits need lower occurrence threshold to be removed
            const keepThreshold = (1 - velocity) * 100;
            
            // If occurrence is below the threshold, remove the hit
            return this.moodConfig.occurrence <= keepThreshold ? 0 : velocity;
        });
        
        // Ensure at least one hit always plays if occurrence > 0
        if (this.moodConfig.occurrence > 0 && !this.currentPattern.some(v => v > 0)) {
            // Find the highest velocity hit in the original pattern
            let maxIndex = 0;
            let maxVelocity = 0;
            
            for (let i = 0; i < this.basePattern.length; i++) {
                if (this.basePattern[i] > maxVelocity) {
                    maxVelocity = this.basePattern[i];
                    maxIndex = i;
                }
            }
            
            // Keep at least this one hit
            this.currentPattern[maxIndex] = this.basePattern[maxIndex];
        }
        
        // Update the active pattern
        if (this.isPlaying) {
            console.log(`${this.MODULE_ID}: Updated pattern based on occurrence ${this.moodConfig.occurrence}`);
        }
    }

    // --- Core Module Methods (AudioEngine Interface) ---

    /**
     * Initialize audio nodes based on initial mood settings.
     * @param {AudioContext} audioContext - The shared AudioContext.
     * @param {AudioNode} masterOutputNode - The node to connect the module's output to.
     * @param {object} initialSettings - The moodAudioSettings for the initial mood.
     * @param {string} initialMood - The initial mood key.
     * @param {object} moodConfig - The volume/occurrence/intensity configuration (0-100 values).
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
            
            // Store the base settings from data.js and default settings
            this.baseSettings = { ...this.defaultKickSettings, ...initialSettings };
            // Initialize settings with base settings
            this.settings = { ...this.baseSettings };
            // Store the specific 0-100 configuration for this mood
            this.moodConfig = { ...this.moodConfig, ...moodConfig };
            
            this.currentMood = initialMood;
            this.basePattern = [...(this.baseSettings.pattern || this.defaultKickSettings.pattern)];
            this.currentPattern = [...this.basePattern]; // Start with full pattern
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
            
            // Apply the mood configuration settings (volume, occurrence, intensity)
            this._applyMoodConfig(0); // Apply immediately (no transition)
            
            // Apply pattern changes based on occurrence
            this._updatePatternBasedOnOccurrence();

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
    changeMood(newMood, newSettings, transitionTime, moodConfig) {
        if (!this.isEnabled) return;
        if (!this.audioContext) {
            console.error(`${this.MODULE_ID}: Cannot change mood - AudioContext missing.`);
            return;
        }
        if (this.audioContext.state === 'closed') {
            console.error(`${this.MODULE_ID}: Cannot change mood - AudioContext is closed.`);
            return;
        }

        console.log(`${this.MODULE_ID}: Changing mood to '${newMood}' over ${transitionTime.toFixed(2)}s. Config:`, moodConfig);
        try {
            // Store new base settings and 0-100 config
            this.baseSettings = { ...this.defaultKickSettings, ...newSettings };
            this.settings = { ...this.baseSettings }; // Reset settings to base
            this.moodConfig = { ...this.moodConfig, ...moodConfig }; // Merge new config
            this.currentMood = newMood;
            
            // Store the base pattern from new settings
            this.basePattern = [...(this.baseSettings.pattern || this.defaultKickSettings.pattern)];

            const now = this.audioContext.currentTime;
            const rampTime = transitionTime * 0.5; // Use part of transition for smooth ramps

            // Apply the new mood configuration with transition time
            this._applyMoodConfig(transitionTime);
            
            // Update the beat duration based on new tempo
            this._updateBeatDuration();
            
            // Update pattern based on occurrence
            this._updatePatternBasedOnOccurrence();
            
            // Reset pattern index for a cleaner transition
            if (this.isPlaying) {
                this.currentPatternIndex = 0;
            }

            // Update filter Q if needed (not directly controlled by intensity)
            if (this.filterNode && this.settings.useFilter) {
                this.filterNode.Q.setTargetAtTime(this.settings.filterQ, now, rampTime);
            }

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
            this.baseSettings = null;
            this.currentPattern = [];
            this.basePattern = [];
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
        const noteStartTime = this.nextKickTime; // Use the pre-calculated grid start time

        // Apply timing humanization
        let timingOffset = 0;
        if (this.settings.humanizeTiming && this.settings.humanizeTiming > 0) {
             timingOffset = (Math.random() - 0.5) * 2.0 * this.settings.humanizeTiming;
        }
        const intendedPlayTime = noteStartTime + timingOffset; // Humanized intended start time

        // Trigger a kick sound if velocity > 0 (0 indicates a rest)
        if (typeof velocity === 'number' && velocity > 0) {
            // console.debug(`${this.MODULE_ID}: Triggering kick at ${actualKickPlayTime.toFixed(3)}s with velocity ${velocity.toFixed(2)}`);
            this._createSingleKick(intendedPlayTime, velocity); // Pass intended time
        } else {
            // console.debug(`${this.MODULE_ID}: Rest at step ${this.currentPatternIndex}`);
        }

        // Calculate the start time for the *next* beat/step based on the *un-humanized* grid time
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


    /** Creates and plays a single synthesized soft kick drum sound using lookahead timing. */
    _createSingleKick(playTime, velocity) {
        // --- Calculate Effective Play Time ---
        const now = this.audioContext.currentTime;
        const lookahead = 0.05; // 50ms lookahead
        const effectivePlayTime = now + lookahead;
        const connectionPoint = this.filterNode || this.moduleOutputGain;

        // --- Add Robust Node Checks ---
        if (!this.audioContext || !connectionPoint) {
            console.warn(`${this.MODULE_ID}: Skipping kick creation - missing essential nodes (context or connectionPoint).`);
            return;
        }
        // --- End Node Checks ---

        let osc = null;
        let envGain = null;
        const kickId = `kick-${this.kickIdCounter++}`;

        try {
            // --- Create Nodes ---
            osc = this.audioContext.createOscillator();
            osc.type = 'sine'; // Sine is best for soft fundamental

            envGain = this.audioContext.createGain(); // Controls the ADSR-like envelope
            envGain.gain.setValueAtTime(0.0001, effectivePlayTime); // Start silent *at* effectivePlayTime

            // Connect nodes: Osc -> EnvGain -> FilterNode (or ModuleOutputGain)
            osc.connect(envGain);
            envGain.connect(connectionPoint);

            // --- Start the oscillator PRECISELY at effectivePlayTime ---
            osc.start(effectivePlayTime);

            // --- Calculate Randomized Parameters ---
            const freqStart = this.settings.startFrequencyBase + (Math.random() - 0.5) * 2.0 * this.settings.startFrequencyRange;
            const freqEnd = this.settings.endFrequencyBase + (Math.random() - 0.5) * 2.0 * this.settings.endFrequencyRange;
            const pitchDropTime = Math.max(0.005, this.settings.pitchDropTimeBase + (Math.random() - 0.5) * 2.0 * this.settings.pitchDropTimeRange); // Ensure > 0
            const decayTime = Math.max(0.01, this.settings.decayTimeBase + (Math.random() - 0.5) * 2.0 * this.settings.decayTimeRange); // Ensure > 0
            const randomVelocityMod = 1.0 + (Math.random() - 0.5) * 2.0 * this.settings.velocityRange;
            const finalVelocity = Math.max(0.01, Math.min(1.0, velocity * randomVelocityMod)); // Apply pattern velocity and random mod

            // --- Apply Pitch Envelope ---
            const freqParam = osc.frequency;
            // Set initial frequency slightly before to ensure it's ready
            freqParam.setValueAtTime(freqStart, Math.max(now, effectivePlayTime - 0.001));
            freqParam.exponentialRampToValueAtTime(Math.max(20, freqEnd), effectivePlayTime + pitchDropTime);

            // --- Apply Volume Envelope (Fast Attack, Quick Exponential Decay) ---
            const attack = this.settings.attackTime || 0.002;
            const gainParam = envGain.gain;
            gainParam.linearRampToValueAtTime(finalVelocity, effectivePlayTime + attack); // Quick rise to peak velocity
            // Exponential decay starting immediately after attack peak
            const decayStartTime = effectivePlayTime + attack;
            // Use time constant based on randomized decay time
            gainParam.setTargetAtTime(0.0001, decayStartTime, decayTime / 3.0);

            // --- Schedule Node Stop ---
            // Stop time is after the decay phase completes significantly
            const stopTime = decayStartTime + decayTime + 0.1; // Add buffer
             try {
                 osc.stop(stopTime); // Schedule stop
             } catch (e) { if(e.name !== 'InvalidStateError') console.warn(`${this.MODULE_ID}: Error scheduling oscillator stop for kick ${kickId}:`, e); }


            // --- Schedule Cleanup ---
            const cleanupDelay = (stopTime - this.audioContext.currentTime + 0.1) * 1000; // Delay from *now*
            const cleanupTimeoutId = setTimeout(() => {
                this._cleanupKick(kickId);
            }, Math.max(50, cleanupDelay)); // Ensure minimum delay

            // --- Store Active Kick ---
            this.activeKicks.set(kickId, { osc, envGain, cleanupTimeoutId, isStopping: false });

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