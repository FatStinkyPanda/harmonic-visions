// ae_effectHeartbeat.js - Audio Module for Rhythmic Heartbeat Pulse
// Part of the Harmonic Visions project by FatStinkyPanda
// Copyright (c) 2025 FatStinkyPanda - All rights reserved.
// Version: 1.0.1 (Fixed InvalidStateError on osc.stop)

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
        this.currentMood = null;
        this.isEnabled = false;
        this.isPlaying = false;

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
            this.settings = { ...this.defaultHeartbeatSettings, ...initialSettings };
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
        // Example:
        // if (this.filterNode && visualParams?.dreaminess) {
        //     const baseFreq = this.settings.filterCutoff || 200;
        //     const drift = Math.sin(time * 0.04 + this.beatIdCounter * 0.05) * 30 * visualParams.dreaminess;
        //     this.filterNode.frequency.setTargetAtTime(baseFreq + drift, this.audioContext.currentTime, 0.6);
        // }
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

    /** Adapt heartbeat parameters to the new mood's settings. */
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
            this.settings = { ...this.defaultHeartbeatSettings, ...newSettings };
            this.currentMood = newMood;

            const now = this.audioContext.currentTime;
            const rampTime = transitionTime * 0.6; // Use part of transition for smooth ramps

            // --- Update Module Parameters ---
            // 1. Overall Volume
            if (this.moduleOutputGain) {
                const targetVolume = this.isPlaying ? this.settings.heartbeatVolume : 0.0001;
                const gainParam = this.moduleOutputGain.gain;
                 if (typeof gainParam.cancelAndHoldAtTime === 'function') gainParam.cancelAndHoldAtTime(now);
                 else gainParam.cancelScheduledValues(now);
                gainParam.setTargetAtTime(targetVolume, now, rampTime / 2); // Faster volume ramp
            }

            // 2. Filter Parameters (if filter exists)
            if (this.filterNode) {
                this.filterNode.frequency.setTargetAtTime(this.settings.filterCutoff, now, rampTime);
                this.filterNode.Q.setTargetAtTime(this.settings.filterQ, now, rampTime);
            }

            // 3. Update Sequencing Parameters
            this._updateBeatDuration(); // Recalculate beat duration based on new tempo/rateFactor
            // Heartbeat sound parameters (freq, decay etc.) are updated in settings
            // and will affect the *next* beat generated.

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

        const beatStartTime = this.nextBeatTime;

        // Apply timing humanization
        let timingOffset = 0;
        if (this.settings.beatTimingVariation > 0) {
             timingOffset = (Math.random() - 0.5) * 2.0 * this.settings.beatTimingVariation;
        }
        const actualBeatStartTime = beatStartTime + timingOffset;

        // Trigger the "lub-dub" pair
        this._createSingleBeatPair(actualBeatStartTime);

        // Calculate the start time for the *next* beat sequence
        this.nextBeatTime = beatStartTime + this.beatDuration;

        // Schedule the next beat check
        this._scheduleNextBeat();
    }

    /** Creates the "lub" and "dub" sounds for a single heartbeat. */
    _createSingleBeatPair(startTime) {
        if (!this.audioContext || !this._beatConnectionPoint || startTime < this.audioContext.currentTime) {
            console.warn(`${this.MODULE_ID}: Skipping beat creation - invalid time or missing nodes.`);
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
                decayTime: this.settings.lubDecayTime + randomDecayMod,
                attackTime: this.settings.attackTime,
                velocity: this.settings.lubVelocity * randomVelocityMod
            };
            this._createOscillatorEvent(lubParams, startTime, 'lub');

            // --- Create "Dub" ---
            const dubStartTime = startTime + this.settings.lubDubSeparation;
            // Use slightly different random mods for variation between lub and dub
            const randomDubPitchMod = (Math.random() - 0.5) * 2.0 * this.settings.pitchVariation;
            const randomDubDecayMod = (Math.random() - 0.5) * 2.0 * this.settings.decayVariation;

            const dubParams = {
                startFreq: this.settings.dubFreqStart + randomDubPitchMod,
                endFreq: this.settings.dubFreqEnd + randomDubPitchMod,
                pitchDropTime: this.settings.dubPitchDropTime,
                decayTime: this.settings.dubDecayTime + randomDubDecayMod,
                attackTime: this.settings.attackTime,
                velocity: this.settings.dubVelocity * randomVelocityMod // Apply same velocity mod for consistency? Or separate? Let's use same for now.
            };
             // Ensure dub start time is valid
             if (dubStartTime >= this.audioContext.currentTime) {
                  this._createOscillatorEvent(dubParams, dubStartTime, 'dub');
             } else {
                  console.warn(`${this.MODULE_ID}: Dub start time (${dubStartTime.toFixed(3)}) is in the past. Skipping dub.`);
             }


        } catch (error) {
            console.error(`${this.MODULE_ID}: Error creating beat pair at ${startTime.toFixed(3)}s:`, error);
        }
    }

    /** Creates a single oscillator event (one part of the lub-dub). */
    _createOscillatorEvent(params, playTime, noteIdPrefix) {
        let osc = null;
        let envGain = null;
        const beatPartId = `${noteIdPrefix}-${this.beatIdCounter++}`;

        try {
            osc = this.audioContext.createOscillator();
            osc.type = 'sine'; // Pure tone for deep pulse

            envGain = this.audioContext.createGain();
            envGain.gain.setValueAtTime(0.0001, playTime);

            osc.connect(envGain);
            envGain.connect(this._beatConnectionPoint);

            // --- Start the oscillator PRECISELY at playTime ---
            // Moved this *before* scheduling stop and envelopes
            osc.start(playTime);
            // --- End Move ---

            // Apply Pitch Envelope
            this._applyPitchEnvelope(osc, params.startFreq, params.endFreq, params.pitchDropTime, playTime);

            // Apply Amplitude Envelope
            this._applyAmplitudeEnvelope(envGain, params.attackTime, params.decayTime, params.velocity, playTime);

            // Schedule Oscillator Stop
            const stopTime = playTime + params.attackTime + params.decayTime + 0.15; // Stop well after decay
            osc.stop(stopTime); // Now safe to schedule stop

            // Schedule Cleanup
            const cleanupDelay = (stopTime - this.audioContext.currentTime + 0.1) * 1000;
            const cleanupTimeoutId = setTimeout(() => this._cleanupBeatSound(beatPartId), Math.max(50, cleanupDelay));

            this.activeBeats.set(beatPartId, { osc, envGain, cleanupTimeoutId, isStopping: false });

            // --- MOVED: osc.start(playTime); --- was here

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

        try {
             // Use cancelAndHoldAtTime if available for robustness against overlapping calls
             if (typeof freqParam.cancelAndHoldAtTime === 'function') {
                 freqParam.cancelAndHoldAtTime(startTime);
             } else {
                 freqParam.cancelScheduledValues(startTime);
             }
            freqParam.setValueAtTime(clampedStartFreq, startTime);
            freqParam.exponentialRampToValueAtTime(clampedEndFreq, startTime + dropTime);
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

        try {
             // Use cancelAndHoldAtTime if available
             if (typeof gainParam.cancelAndHoldAtTime === 'function') {
                 gainParam.cancelAndHoldAtTime(startTime);
             } else {
                 gainParam.cancelScheduledValues(startTime);
             }
            gainParam.setValueAtTime(0.0001, startTime);
            gainParam.linearRampToValueAtTime(clampedVelocity, startTime + attack);
            // Exponential decay starts immediately after attack peak
            gainParam.setTargetAtTime(0.0001, startTime + attack, decay / 3.0); // Decay time constant
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