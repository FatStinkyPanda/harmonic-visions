// ae_effectHeartbeat.js - Audio Module for Rhythmic Heartbeat Pulse
// Part of the Harmonic Visions project by FatStinkyPanda
// Copyright (c) 2025 FatStinkyPanda - All rights reserved.
// Version: 1.0.3 (Added Vol/Occur/Inten mood config system)

/**
 * @class AEEffectHeartbeat
 * @description Generates a rhythmic, low-frequency pulse mimicking a heartbeat ("lub-dub")
 *              using synthesized tones with pitch and amplitude envelopes. Adapts to tempo
 *              and provides subtle variations for uniqueness. Implements the standard
 *              AudioEngine module interface with robust error handling and optimization.
 */
class AEEffectHeartbeat {
    constructor() {
        this.MODULE_ID = 'AEEffectHeartbeat'; // For logging and identification
        this.audioContext = null;
        this.masterOutput = null; // Connects to AudioEngine's masterInputGain
        this.settings = null;
        this.baseSettings = null; // Store original settings from data.js
        this.currentMood = null;
        this.isEnabled = false;
        this.isPlaying = false;
        
        // --- Mood Configuration System ---
        this.moodConfig = { volume: 100, occurrence: 100, intensity: 50 }; // Default config

        // --- Core Audio Nodes (Module Level) ---
        this.moduleOutputGain = null; // Master gain for this module (volume and overall fades)
        this.filterNode = null;       // Optional low-pass filter for shaping the sound
        this._beatConnectionPoint = null; // Internal reference to where beats connect (filter or outputGain)

        // --- Sequencing State ---
        this.sequenceTimeoutId = null; // Timeout ID for scheduling the next beat check
        this.beatDuration = 0.75;      // Duration of one beat in seconds (derived from tempo)
        this.nextBeatTime = 0;         // AudioContext time for the next beat sequence's start

        // --- Active Beat Tracking ---
        // Map<beatPartId, { osc: OscillatorNode, envGain: GainNode, cleanupTimeoutId: number, isStopping: boolean }>
        // We track individual "lub" and "dub" sounds
        this.activeBeats = new Map();
        this.beatIdCounter = 0;

        // --- Default Settings Tailored for Heartbeat ---
        this.defaultHeartbeatSettings = {
            heartbeatVolume: 0.55,      // Base volume (adjust in master mix)
            heartbeatRateFactor: 1.0,   // Multiplier for tempo (1.0 = sync with tempo)
            // Lub (First, Lower Beat)
            lubFreqStart: 85,           // Hz
            lubFreqEnd: 45,             // Hz
            lubPitchDropTime: 0.045,    // Seconds
            lubDecayTime: 0.22,         // Seconds
            lubVelocity: 0.9,           // Relative velocity (0-1)
            // Dub (Second, Higher Beat)
            dubFreqStart: 105,          // Hz
            dubFreqEnd: 55,             // Hz
            dubPitchDropTime: 0.03,     // Seconds
            dubDecayTime: 0.16,         // Seconds
            dubVelocity: 1.0,           // Relative velocity (0-1)
            // Timing & Variation
            lubDubSeparation: 0.18,     // Seconds between start of lub and start of dub
            beatTimingVariation: 0.015, // Max random offset for beat timing (seconds)
            pitchVariation: 5,          // Max random +/- Hz variation per beat
            decayVariation: 0.05,       // Max random +/- seconds variation for decay
            velocityVariation: 0.15,    // Max random +/- relative velocity variation
            // Sound Shaping
            attackTime: 0.005,          // Seconds, very fast attack for both parts
            useFilter: true,            // Whether to use the low-pass filter
            filterCutoff: 200,          // Hz, low-pass to make it feel deeper
            filterQ: 1.2,               // Subtle resonance
            // Module Envelope
            attackTimeModule: 1.0,      // Module fade-in time (s)
            releaseTimeModule: 2.0,     // Module fade-out time (s)
            // Required by _updateBeatDuration if not passed via settings
            tempo: 80,                  // Default fallback tempo
            
            // --- Base/Max values for mood config mapping ---
            heartbeatRateFactorMin: 0.5, // Min rate factor (for occurrence=0)
            heartbeatRateFactorMax: 2.0, // Max rate factor (for occurrence=100)
            lubVelocityBase: 0.6,       // Base velocity for lub (for intensity=0)
            lubVelocityMax: 1.2,        // Max velocity for lub (for intensity=100)
            dubVelocityBase: 0.7,       // Base velocity for dub (for intensity=0)
            dubVelocityMax: 1.3,        // Max velocity for dub (for intensity=100)
            pitchVariationBase: 2,      // Base pitch variation (for intensity=0)
            pitchVariationMax: 15,      // Max pitch variation (for intensity=100)
            velocityVariationBase: 0.05, // Base velocity variation (for intensity=0)
            velocityVariationMax: 0.3,   // Max velocity variation (for intensity=100)
            filterQBase: 0.8,           // Base filter Q (for intensity=0)
            filterQMax: 2.5,            // Max filter Q (for intensity=100)
        };

        console.log(`${this.MODULE_ID}: Instance created.`);
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
     * Applies the 0-100 mood configuration to module parameters
     * @param {number} transitionTime - Transition time in seconds
     */
    _applyMoodConfig(transitionTime = 0) {
        if (!this.moodConfig || !this.audioContext) return;

        const now = this.audioContext.currentTime;
        const rampTime = transitionTime > 0 ? transitionTime * 0.5 : 0;
        const timeConstant = rampTime / 3.0;

        // --- Apply Volume (heartbeatVolume) ---
        if (this.moduleOutputGain && this.moodConfig.volume !== undefined) {
            const baseVolume = this.baseSettings.heartbeatVolume || this.defaultHeartbeatSettings.heartbeatVolume;
            const targetVolume = this._mapValue(this.moodConfig.volume, 0.0, baseVolume);
            console.log(`${this.MODULE_ID}: Applying Volume ${this.moodConfig.volume}/100 -> ${targetVolume.toFixed(3)}`);
            
            if (this.isPlaying) {
                if (rampTime > 0.01) {
                    // If already playing, ramp to new volume
                    this.moduleOutputGain.gain.setTargetAtTime(targetVolume, now, timeConstant);
                } else {
                    // If no transition needed, set immediately
                    this.moduleOutputGain.gain.setValueAtTime(targetVolume, now);
                }
            } else {
                // If not playing, just store for next play() call
                this.settings.heartbeatVolume = targetVolume;
            }
        }

        // --- Apply Occurrence (heartbeatRateFactor) ---
        if (this.moodConfig.occurrence !== undefined) {
            const rateFactorMin = this.baseSettings.heartbeatRateFactorMin || this.defaultHeartbeatSettings.heartbeatRateFactorMin;
            const rateFactorMax = this.baseSettings.heartbeatRateFactorMax || this.defaultHeartbeatSettings.heartbeatRateFactorMax;
            const targetRateFactor = this._mapValue(this.moodConfig.occurrence, rateFactorMin, rateFactorMax);
            
            console.log(`${this.MODULE_ID}: Applying Occurrence ${this.moodConfig.occurrence}/100 -> heartbeatRateFactor ${targetRateFactor.toFixed(2)}`);
            
            // Update the settings
            this.settings.heartbeatRateFactor = targetRateFactor;
            
            // Recalculate beat duration based on new rate factor
            this._updateBeatDuration();
            
            // No need to schedule immediate change, the next beat will use the new duration
        }

        // --- Apply Intensity (multiple parameters) ---
        if (this.moodConfig.intensity !== undefined) {
            console.log(`${this.MODULE_ID}: Applying Intensity ${this.moodConfig.intensity}/100`);
            
            // 1. LUB/DUB Velocity (how strong the beats are)
            const lubVelocityBase = this.baseSettings.lubVelocityBase || this.defaultHeartbeatSettings.lubVelocityBase;
            const lubVelocityMax = this.baseSettings.lubVelocityMax || this.defaultHeartbeatSettings.lubVelocityMax;
            this.settings.lubVelocity = this._mapValue(this.moodConfig.intensity, lubVelocityBase, lubVelocityMax);
            
            const dubVelocityBase = this.baseSettings.dubVelocityBase || this.defaultHeartbeatSettings.dubVelocityBase;
            const dubVelocityMax = this.baseSettings.dubVelocityMax || this.defaultHeartbeatSettings.dubVelocityMax;
            this.settings.dubVelocity = this._mapValue(this.moodConfig.intensity, dubVelocityBase, dubVelocityMax);
            
            console.log(`  -> Velocities: lub=${this.settings.lubVelocity.toFixed(2)}, dub=${this.settings.dubVelocity.toFixed(2)}`);
            
            // 2. Variations (randomness increases with intensity)
            const pitchVarBase = this.baseSettings.pitchVariationBase || this.defaultHeartbeatSettings.pitchVariationBase;
            const pitchVarMax = this.baseSettings.pitchVariationMax || this.defaultHeartbeatSettings.pitchVariationMax;
            this.settings.pitchVariation = this._mapValue(this.moodConfig.intensity, pitchVarBase, pitchVarMax);
            
            const velocityVarBase = this.baseSettings.velocityVariationBase || this.defaultHeartbeatSettings.velocityVariationBase;
            const velocityVarMax = this.baseSettings.velocityVariationMax || this.defaultHeartbeatSettings.velocityVariationMax;
            this.settings.velocityVariation = this._mapValue(this.moodConfig.intensity, velocityVarBase, velocityVarMax);
            
            console.log(`  -> Variations: pitch=${this.settings.pitchVariation.toFixed(2)}Hz, velocity=${this.settings.velocityVariation.toFixed(2)}`);
            
            // 3. Filter Resonance (Q)
            if (this.filterNode && this.settings.useFilter) {
                const baseQ = this.baseSettings.filterQBase || this.defaultHeartbeatSettings.filterQBase;
                const maxQ = this.baseSettings.filterQMax || this.defaultHeartbeatSettings.filterQMax;
                const targetQ = this._mapValue(this.moodConfig.intensity, baseQ, maxQ);
                
                console.log(`  -> Filter Q: ${targetQ.toFixed(2)}`);
                
                if (rampTime > 0.01) {
                    this.filterNode.Q.setTargetAtTime(targetQ, now, timeConstant);
                } else {
                    this.filterNode.Q.setValueAtTime(targetQ, now);
                }
            }
        }
    }

    // --- Core Module Methods (AudioEngine Interface) ---

    /**
     * Initialize audio nodes based on initial mood settings.
     * @param {AudioContext} audioContext - The shared AudioContext.
     * @param {AudioNode} masterOutputNode - The node to connect the module's output to.
     * @param {object} initialSettings - The moodAudioSettings for the initial mood.
     * @param {string} initialMood - The initial mood key.
     * @param {object} moodConfig - Optional mood configuration (volume, occurrence, intensity).
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
            
            // Store the base settings from data.js AND defaults for fallback
            this.baseSettings = { ...this.defaultHeartbeatSettings, ...initialSettings };
            // Merge initial settings with specific defaults for this module
            this.settings = { ...this.defaultHeartbeatSettings, ...initialSettings };
            // Store the specific 0-100 configuration for this mood
            this.moodConfig = { ...this.moodConfig, ...moodConfig }; // Merge incoming config
            
            this.currentMood = initialMood;
            this._updateBeatDuration(); // Calculate initial beat duration

            // --- Create Core Module Nodes ---
            this.moduleOutputGain = this.audioContext.createGain();
            this.moduleOutputGain.gain.setValueAtTime(0.0001, this.audioContext.currentTime); // Start silent

            // Optional Filter
            let connectionPoint = this.moduleOutputGain; // Default connection point
            if (this.settings.useFilter) {
                this.filterNode = this.audioContext.createBiquadFilter();
                this.filterNode.type = 'lowpass';
                this.filterNode.frequency.setValueAtTime(this.settings.filterCutoff, this.audioContext.currentTime);
                this.filterNode.Q.setValueAtTime(this.settings.filterQ, this.audioContext.currentTime);
                this.filterNode.connect(this.moduleOutputGain); // Filter output goes to main gain
                connectionPoint = this.filterNode; // Individual beats connect to the filter input
                console.log(`${this.MODULE_ID}: Filter node created and connected.`);
            } else {
                this.filterNode = null;
                console.log(`${this.MODULE_ID}: Filter node not used.`);
            }
            // Store the node where individual beats should connect
            this._beatConnectionPoint = connectionPoint;

            // Final connection to Master Output
            this.moduleOutputGain.connect(this.masterOutput);
            
            // Apply initial mood configuration (after nodes are created)
            this._applyMoodConfig(0); // Apply immediately (no transition)

            this.isEnabled = true;
            console.log(`${this.MODULE_ID}: Initialization complete.`);

        } catch (error) {
            console.error(`${this.MODULE_ID}: Initialization failed:`, error);
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', `Heartbeat init failed: ${error.message}`);
            }
            this.dispose(); // Cleanup partial initialization
            this.isEnabled = false; // Ensure state is correct
            // Allow AudioEngine to handle the failure
        }
    }

    /** Update loop hook (minimal use). */
    update(time, mood, visualParams, audioParams, deltaTime) {
        if (!this.isEnabled || !this.isPlaying) return;
        // Could subtly modulate filter cutoff or rateFactor based on dreaminess/intensity
    }

    /** Start the heartbeat rhythm sequence scheduling. */
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
        }

        console.log(`${this.MODULE_ID}: Starting playback sequence at ${startTime.toFixed(3)}`);
        try {
            this.isPlaying = true;
            this.beatIdCounter = 0;       // Reset beat ID counter
            // Ensure next beat time isn't in the past relative to context time
            this.nextBeatTime = Math.max(this.audioContext.currentTime, startTime);

            // Apply module attack envelope
            const attackTime = this.settings.attackTimeModule || this.defaultHeartbeatSettings.attackTimeModule;
            const targetVolume = this.settings.heartbeatVolume || this.defaultHeartbeatSettings.heartbeatVolume;
            const gainParam = this.moduleOutputGain.gain;

            if (typeof gainParam.cancelAndHoldAtTime === 'function') gainParam.cancelAndHoldAtTime(this.nextBeatTime);
            else gainParam.cancelScheduledValues(this.nextBeatTime);
            gainParam.setValueAtTime(0.0001, this.nextBeatTime);
            gainParam.linearRampToValueAtTime(targetVolume, this.nextBeatTime + attackTime);

            if (this.sequenceTimeoutId) clearTimeout(this.sequenceTimeoutId);
            this._scheduleNextBeat(); // Start the sequence

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during play():`, error);
            this.isPlaying = false; // Ensure state is correct on error
            if (this.sequenceTimeoutId) clearTimeout(this.sequenceTimeoutId); this.sequenceTimeoutId = null;
            if (typeof ToastSystem !== 'undefined') ToastSystem.notify('error', `Heartbeat play failed: ${error.message}`);
        }
    }

    /** Stop the heartbeat sequence and fade out the module. */
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
            this.isPlaying = false; // Stop scheduling new beats immediately

            if (this.sequenceTimeoutId) { clearTimeout(this.sequenceTimeoutId); this.sequenceTimeoutId = null; }

            const now = this.audioContext.currentTime;
            const targetStopTime = Math.max(now, stopTime);

            // Apply module release envelope
            const releaseTime = this.settings.releaseTimeModule || this.defaultHeartbeatSettings.releaseTimeModule;
            const timeConstant = releaseTime / 3.0;
            const gainParam = this.moduleOutputGain.gain;

            if (typeof gainParam.cancelAndHoldAtTime === 'function') gainParam.cancelAndHoldAtTime(targetStopTime);
            else gainParam.cancelScheduledValues(targetStopTime);
            const currentGain = gainParam.value;
            gainParam.setValueAtTime(currentGain, targetStopTime);
            gainParam.setTargetAtTime(0.0001, targetStopTime, timeConstant);

            // Let active beats finish their natural decay. Their cleanup timers will handle node removal.
            this.activeBeats.forEach((beatData, beatPartId) => {
                if (beatData && !beatData.isStopping) {
                    beatData.isStopping = true;
                    console.debug(`${this.MODULE_ID}: Letting active beat part ${beatPartId} finish its natural decay.`);
                    // No need to force early stop or cleanup here, let the scheduled cleanup run.
                }
            });

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during stop():`, error);
            this.activeBeats.forEach((beatData, beatPartId) => { if (beatData?.cleanupTimeoutId) clearTimeout(beatData.cleanupTimeoutId); });
            this.activeBeats.clear();
            if (typeof ToastSystem !== 'undefined') ToastSystem.notify('error', `Heartbeat stop failed: ${error.message}`);
        }
    }

    /** 
     * Adapt heartbeat parameters to the new mood's settings. 
     * @param {string} newMood - Name of the new mood
     * @param {object} newSettings - Settings for the new mood from data.js
     * @param {number} transitionTime - Time to transition in seconds
     * @param {object} moodConfig - Optional mood configuration (volume, occurrence, intensity)
     */
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
            // Store the new base settings from data.js
            this.baseSettings = { ...this.defaultHeartbeatSettings, ...newSettings };
            // Merge new settings with defaults
            this.settings = { ...this.defaultHeartbeatSettings, ...newSettings };
            // Update mood configuration
            this.moodConfig = { ...this.moodConfig, ...moodConfig }; // Merge new config
            
            this.currentMood = newMood;

            const now = this.audioContext.currentTime;
            const rampTime = transitionTime * 0.6; // Use part of transition for smooth ramps

            // --- Apply New Mood Config with Transition ---
            this._applyMoodConfig(transitionTime);

            // --- Update Filter Parameters (if filter exists) ---
            if (this.filterNode && this.settings.useFilter) {
                this.filterNode.frequency.setTargetAtTime(this.settings.filterCutoff, now, rampTime);
                // Note: Q is already handled by _applyMoodConfig
            }

            console.log(`${this.MODULE_ID}: Heartbeat parameters updated for mood '${newMood}'.`);

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during changeMood():`, error);
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', `Heartbeat mood change failed: ${error.message}`);
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
            if (this.sequenceTimeoutId) { clearTimeout(this.sequenceTimeoutId); this.sequenceTimeoutId = null; }

            // 2. Stop and clean up any active beat sounds immediately
            this.activeBeats.forEach((beatData, beatPartId) => this._forceCleanupBeatSound(beatPartId));
            this.activeBeats.clear();

            // 3. Disconnect module-level nodes
            if (this.filterNode) try { this.filterNode.disconnect(); } catch (e) {}
            if (this.moduleOutputGain) try { this.moduleOutputGain.disconnect(); } catch (e) {}

        } catch (error) {
             console.error(`${this.MODULE_ID}: Error during node disconnection phase:`, error);
        } finally {
            // 4. Nullify all references
            this.moduleOutputGain = null;
            this.filterNode = null;
            this._beatConnectionPoint = null;
            this.audioContext = null;
            this.masterOutput = null;
            this.settings = null;
            this.baseSettings = null;
            this.activeBeats.clear(); // Ensure map is cleared
            console.log(`${this.MODULE_ID}: Disposal complete.`);
        }
    }

    // --- Internal Sequencing and Sound Generation ---

    /** Updates the beat duration based on the current tempo and rateFactor settings. */
    _updateBeatDuration() {
        const tempo = this.settings?.tempo || this.defaultHeartbeatSettings.tempo;
        const rateFactor = this.settings?.heartbeatRateFactor || this.defaultHeartbeatSettings.heartbeatRateFactor;
        if (tempo <= 0 || rateFactor <= 0) {
            console.warn(`${this.MODULE_ID}: Invalid tempo (${tempo}) or rateFactor (${rateFactor}), using defaults.`);
            this.beatDuration = 60.0 / (this.defaultHeartbeatSettings.tempo * this.defaultHeartbeatSettings.heartbeatRateFactor);
        } else {
            this.beatDuration = 60.0 / (tempo * rateFactor); // Time per full heartbeat cycle
        }
         // console.debug(`${this.MODULE_ID}: Beat duration updated to ${this.beatDuration.toFixed(3)}s`);
    }

    /** Schedules the next check/trigger for a heartbeat sequence using setTimeout. */
    _scheduleNextBeat() {
        if (!this.isPlaying || !this.audioContext) return;
        const currentTime = this.audioContext.currentTime;
        const delaySeconds = Math.max(0, this.nextBeatTime - currentTime);
        const delayMilliseconds = delaySeconds * 1000;
        if (this.sequenceTimeoutId) clearTimeout(this.sequenceTimeoutId);
        this.sequenceTimeoutId = setTimeout(() => {
            if (!this.isPlaying) return;
            try { this._triggerBeatSequence(); }
            catch (e) {
                console.error(`${this.MODULE_ID}: Error in _triggerBeatSequence:`, e);
                this.stop(this.audioContext.currentTime);
            }
        }, delayMilliseconds);
    }

    /** Triggers the "lub-dub" sequence and schedules the next beat. */
    _triggerBeatSequence() {
        if (!this.isPlaying || !this.audioContext) return;

        const beatStartTime = this.nextBeatTime; // Use the scheduled grid time

        // Apply timing humanization
        let timingOffset = 0;
        if (this.settings.beatTimingVariation > 0) {
             timingOffset = (Math.random() - 0.5) * 2.0 * this.settings.beatTimingVariation;
        }
        const intendedBeatStartTime = beatStartTime + timingOffset; // Humanized intended start time

        // Trigger the "lub-dub" pair, passing the intended start time
        this._createSingleBeatPair(intendedBeatStartTime);

        // Calculate the start time for the *next* beat sequence based on the grid time
        this.nextBeatTime = beatStartTime + this.beatDuration;

        // Schedule the next beat check
        this._scheduleNextBeat();
    }

    /** Creates the "lub" and "dub" sounds for a single heartbeat. */
    _createSingleBeatPair(startTime) { // startTime is the intended start time
        // Check nodes *before* proceeding
        if (!this.audioContext || !this._beatConnectionPoint) {
            console.warn(`${this.MODULE_ID}: Skipping beat pair creation - missing essential nodes.`);
            return;
        }

        try {
            const randomVelocityMod = 1.0 + (Math.random() - 0.5) * 2.0 * this.settings.velocityVariation;
            const randomPitchMod = (Math.random() - 0.5) * 2.0 * this.settings.pitchVariation;
            const randomDecayMod = (Math.random() - 0.5) * 2.0 * this.settings.decayVariation;

            // --- Create "Lub" ---
            const lubParams = {
                startFreq: this.settings.lubFreqStart + randomPitchMod,
                endFreq: this.settings.lubFreqEnd + randomPitchMod,
                pitchDropTime: this.settings.lubPitchDropTime,
                decayTime: Math.max(0.01, this.settings.lubDecayTime + randomDecayMod), // Ensure > 0
                attackTime: this.settings.attackTime,
                velocity: Math.max(0.01, this.settings.lubVelocity * randomVelocityMod) // Ensure > 0
            };
            // Pass the intended start time for the "lub"
            this._createOscillatorEvent(lubParams, startTime, 'lub');

            // --- Create "Dub" ---
            const intendedDubStartTime = startTime + this.settings.lubDubSeparation;
            // Use slightly different random mods for variation between lub and dub
            const randomDubPitchMod = (Math.random() - 0.5) * 2.0 * this.settings.pitchVariation;
            const randomDubDecayMod = (Math.random() - 0.5) * 2.0 * this.settings.decayVariation;

            const dubParams = {
                startFreq: this.settings.dubFreqStart + randomDubPitchMod,
                endFreq: this.settings.dubFreqEnd + randomDubPitchMod,
                pitchDropTime: this.settings.dubPitchDropTime,
                decayTime: Math.max(0.01, this.settings.dubDecayTime + randomDubDecayMod), // Ensure > 0
                attackTime: this.settings.attackTime,
                velocity: Math.max(0.01, this.settings.dubVelocity * randomVelocityMod) // Use same velocity mod? Yes. Ensure > 0
            };
            // Pass the intended start time for the "dub"
            this._createOscillatorEvent(dubParams, intendedDubStartTime, 'dub');

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error creating beat pair intended around ${startTime.toFixed(3)}s:`, error);
        }
    }

    /** Creates a single oscillator event (one part of the lub-dub) using lookahead timing. */
    _createOscillatorEvent(params, playTime, noteIdPrefix) { // playTime is the *intended* start time
        // --- Calculate Effective Play Time using Lookahead ---
        const now = this.audioContext.currentTime;
        const lookahead = 0.05; // 50ms lookahead
        const effectivePlayTime = now + lookahead;

        // --- Add Robust Node Checks ---
        if (!this.audioContext || !this._beatConnectionPoint) {
            console.warn(`${this.MODULE_ID}: Skipping beat part creation - missing essential nodes (context or _beatConnectionPoint).`);
            return;
        }
        // --- End Node Checks ---

        let osc = null;
        let envGain = null;
        const beatPartId = `${noteIdPrefix}-${this.beatIdCounter++}`;

        try {
            osc = this.audioContext.createOscillator();
            osc.type = 'sine'; // Pure tone for deep pulse

            envGain = this.audioContext.createGain();
            envGain.gain.setValueAtTime(0.0001, effectivePlayTime); // Start silent *at* effectivePlayTime

            osc.connect(envGain);
            envGain.connect(this._beatConnectionPoint);

            // --- Start the oscillator PRECISELY at effectivePlayTime ---
            osc.start(effectivePlayTime);

            // Apply Pitch Envelope
            this._applyPitchEnvelope(osc, params.startFreq, params.endFreq, params.pitchDropTime, effectivePlayTime);

            // Apply Amplitude Envelope
            this._applyAmplitudeEnvelope(envGain, params.attackTime, params.decayTime, params.velocity, effectivePlayTime);

            // Schedule Oscillator Stop
            const stopTime = effectivePlayTime + params.attackTime + params.decayTime + 0.15; // Stop well after decay
            try {
                osc.stop(stopTime); // Schedule stop
            } catch (e) { if(e.name !== 'InvalidStateError') console.warn(`${this.MODULE_ID}: Error scheduling oscillator stop for ${beatPartId}:`, e); }


            // Schedule Cleanup
            const cleanupDelay = (stopTime - this.audioContext.currentTime + 0.1) * 1000; // Delay from *now*
            const cleanupTimeoutId = setTimeout(() => this._cleanupBeatSound(beatPartId), Math.max(50, cleanupDelay));

            this.activeBeats.set(beatPartId, { osc, envGain, cleanupTimeoutId, isStopping: false });

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error creating beat part ${beatPartId}:`, error);
            this._cleanupPartialBeatSound({ osc, envGain });
            if (this.activeBeats.has(beatPartId)) {
                const beatData = this.activeBeats.get(beatPartId);
                if (beatData.cleanupTimeoutId) clearTimeout(beatData.cleanupTimeoutId);
                this.activeBeats.delete(beatPartId);
            }
        }
    }


    /** Applies pitch envelope to an oscillator. */
    _applyPitchEnvelope(osc, startFreq, endFreq, dropTime, startTime) {
        if (!osc || !osc.frequency) return;
        const freqParam = osc.frequency;
        const clampedEndFreq = Math.max(20, endFreq); // Ensure frequency stays audible/valid
        const clampedStartFreq = Math.max(clampedEndFreq, startFreq); // Ensure start >= end
        const now = this.audioContext.currentTime; // Get current time for immediate set

        try {
             // Use cancelAndHoldAtTime if available for robustness against overlapping calls
             if (typeof freqParam.cancelAndHoldAtTime === 'function') {
                 freqParam.cancelAndHoldAtTime(startTime);
             } else {
                 freqParam.cancelScheduledValues(startTime);
             }
             // Set initial value slightly before start time if possible
            freqParam.setValueAtTime(clampedStartFreq, Math.max(now, startTime - 0.001));
            freqParam.exponentialRampToValueAtTime(clampedEndFreq, startTime + Math.max(0.001, dropTime)); // Ensure duration > 0
        } catch (e) {
             console.error(`${this.MODULE_ID}: Error applying pitch envelope:`, e);
             // Fallback to immediate set if ramp fails?
             try { freqParam.setValueAtTime(clampedEndFreq, startTime); } catch (e2) {}
        }
    }

    /** Applies amplitude envelope to a gain node. */
    _applyAmplitudeEnvelope(gainNode, attack, decay, velocity, startTime) {
        if (!gainNode || !gainNode.gain) return;
        const gainParam = gainNode.gain;
        const clampedVelocity = Math.max(0.001, Math.min(1.0, velocity)); // Clamp velocity 0.001-1.0
        const decayTimeConstant = Math.max(0.001, decay / 3.0); // Ensure time constant > 0
        const attackTime = Math.max(0.001, attack); // Ensure attack time > 0

        try {
             // Use cancelAndHoldAtTime if available
             if (typeof gainParam.cancelAndHoldAtTime === 'function') {
                 gainParam.cancelAndHoldAtTime(startTime);
             } else {
                 gainParam.cancelScheduledValues(startTime);
             }
            gainParam.setValueAtTime(0.0001, startTime);
            gainParam.linearRampToValueAtTime(clampedVelocity, startTime + attackTime);
            // Exponential decay starts immediately after attack peak
            gainParam.setTargetAtTime(0.0001, startTime + attackTime, decayTimeConstant);
        } catch (e) {
             console.error(`${this.MODULE_ID}: Error applying amplitude envelope:`, e);
             // Fallback to setting a value if ramps fail
             try { gainParam.setValueAtTime(0.0001, startTime); } catch (e2) {}
        }
    }

    /** Cleans up resources associated with a finished beat part ("lub" or "dub"). */
    _cleanupBeatSound(beatPartId) {
        if (!this.activeBeats.has(beatPartId)) return;
        const beatData = this.activeBeats.get(beatPartId);
        // console.debug(`${this.MODULE_ID}: Cleaning up beat part ${beatPartId}`);
        try {
             if (beatData.envGain) beatData.envGain.disconnect();
             if (beatData.osc) beatData.osc.disconnect();
        } catch (e) {
             console.warn(`${this.MODULE_ID}: Error disconnecting nodes for beat part ${beatPartId}:`, e);
        } finally {
             if (beatData.cleanupTimeoutId) clearTimeout(beatData.cleanupTimeoutId); // Clear timeout just in case
             this.activeBeats.delete(beatPartId);
        }
    }

    /** Forcefully stops and cleans up a beat part immediately (used in dispose). */
    _forceCleanupBeatSound(beatPartId) {
        if (!this.activeBeats.has(beatPartId)) return;
        const beatData = this.activeBeats.get(beatPartId);
        if (beatData.cleanupTimeoutId) clearTimeout(beatData.cleanupTimeoutId);
        try {
            if (beatData.osc) try { if(beatData.osc.stop) beatData.osc.stop(0); beatData.osc.disconnect(); } catch(e){}
            if (beatData.envGain) try { beatData.envGain.disconnect(); } catch(e){}
        } catch (e) {
            console.error(`${this.MODULE_ID}: Error during force cleanup for beat part ${beatPartId}:`, e);
        } finally {
             this.activeBeats.delete(beatPartId);
        }
    }

    /** Cleans up partially created nodes if beat creation fails mid-way. */
    _cleanupPartialBeatSound(nodes) {
        console.warn(`${this.MODULE_ID}: Cleaning up partially created beat nodes.`);
        const { osc, envGain } = nodes;
        if (envGain) try { envGain.disconnect(); } catch(e){}
        if (osc) try { osc.disconnect(); } catch(e){}
    }

} // End class AEEffectHeartbeat

// Make globally accessible for the AudioEngine
window.AEEffectHeartbeat = AEEffectHeartbeat;

console.log("ae_effectHeartbeat.js loaded and AEEffectHeartbeat class defined.");