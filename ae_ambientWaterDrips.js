// ae_ambientWaterDrips.js - Audio Module for Occasional Echoing Water Drips
// Part of the Harmonic Visions project by FatStinkyPanda
// Copyright (c) 2025 FatStinkyPanda - All rights reserved.
// Version: 1.0.2 (Fixed timing issues with lookahead scheduling)

/**
 * @class AEAmbientWaterDrips
 * @description Generates occasional, echoing water drip sounds with randomized
 *              timing, pitch, volume, panning, and echo characteristics.
 *              Designed for ambience in cave/spring-like moods. Implements the
 *              standard AudioEngine module interface with enhanced error handling,
 *              optimization, and uniqueness.
 */
class AEAmbientWaterDrips {
    constructor() {
        this.MODULE_ID = 'AEAmbientWaterDrips'; // For logging and identification
        this.audioContext = null;
        this.masterOutput = null; // Connects to AudioEngine's masterInputGain
        this.settings = null;
        this.currentMood = null;
        this.isEnabled = false;
        this.isPlaying = false;

        // --- Core Audio Nodes (Module Level) ---
        this.moduleOutputGain = null; // Master gain for this module (volume and overall fades)
        this.delayNode = null;        // Delay effect for echo
        this.feedbackGain = null;     // Controls delay feedback (number of echoes)
        this.wetGain = null;          // Controls the volume of the delayed (wet) signal
        this.dryGain = null;          // Controls the volume of the direct (dry) signal feeding moduleOutputGain
        // Note: _beatConnectionPoint naming kept for consistency, but it's the pre-delay split point here.
        this._beatConnectionPoint = null;

        // --- Sequencing State ---
        this.sequenceTimeoutId = null; // Timeout ID for scheduling the next drip check
        this.nextDripTime = 0;         // AudioContext time for the next potential drip

        // --- Active Drip Tracking ---
        // Map<dripId, { osc: OscillatorNode, envGain: GainNode, panner: StereoPannerNode, preDelayGain: GainNode, cleanupTimeoutId: number, isStopping: boolean }>
        this.activeDrips = new Map();
        this.dripIdCounter = 0;

        // --- Default Settings Tailored for Water Drips ---
        this.defaultDripSettings = {
            ambientVolume: 0.28,      // Subtle volume, adjust in master mix
            // Drip Timing
            dripIntervalMin: 1.8,     // Minimum seconds between drips
            dripIntervalMax: 8.5,     // Maximum seconds between drips
            // Drip Sound Properties (Synthesized 'plink')
            dripWaveform: 'sine',     // Sine or triangle often work well
            dripFrequencyMin: 800,    // Base frequency minimum (Hz) - higher pitch range
            dripFrequencyMax: 2600,   // Base frequency maximum (Hz)
            dripDuration: 0.01,       // Very short base duration (attack peak time) - Note: This is less critical now envelope controls duration feel
            dripAttackTime: 0.001,    // Extremely fast attack (almost instant click)
            dripReleaseTimeMin: 0.06, // Fast but slightly resonant release (s)
            dripReleaseTimeMax: 0.22, // Range for release variation
            dripVolumeMin: 0.4,       // Minimum relative volume (0-1)
            dripVolumeMax: 0.9,       // Maximum relative volume (0-1)
            // Spatialization
            panSpread: 0.85,          // Wide L/R pan offset (-1 to 1)
            // Echo Effect
            delayTimeMin: 0.25,       // Minimum delay time (s)
            delayTimeMax: 0.7,        // Maximum delay time (s)
            delayFeedbackMin: 0.3,    // Minimum feedback gain (0-1)
            delayFeedbackMax: 0.65,   // Maximum feedback gain (avoiding runaway feedback)
            wetMix: 0.6,              // Balance between dry and wet signal (0-1) - echo prominent
            // Envelope (Master Module)
            attackTimeModule: 2.5,    // Module fade-in time (s) - Renamed to avoid conflict
            releaseTimeModule: 4.0,   // Module fade-out time (s) - Renamed to avoid conflict
            // Mood Variation Hints
            densityFactor: 1.0,       // Multiplier for drip rate (adjusted by mood)
            pitchFactor: 1.0,         // Multiplier for frequency range (adjusted by mood)
            echoFactor: 1.0,          // Multiplier for delay time/feedback (adjusted by mood)
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
            this.settings = { ...this.defaultDripSettings, ...initialSettings };
            this.currentMood = initialMood;

            // --- Create Core Module Nodes ---
            // 1. Master Output Gain for the entire module
            this.moduleOutputGain = this.audioContext.createGain();
            this.moduleOutputGain.gain.setValueAtTime(0.0001, this.audioContext.currentTime); // Start silent

            // 2. Delay Effect Nodes
            this.delayNode = this.audioContext.createDelay(1.5); // Max delay time 1.5 seconds
            this.feedbackGain = this.audioContext.createGain();
            this.wetGain = this.audioContext.createGain();
            this.dryGain = this.audioContext.createGain(); // Gain for the direct signal path

            // --- Configure Delay Parameters (Initial) ---
            this._updateDelayParameters(this.settings); // Set initial delay based on settings

            // --- Connect Audio Graph ---
            // Individual drips connect to dryGain and delayNode
            // Dry Path: dryGain -> moduleOutputGain
            this.dryGain.connect(this.moduleOutputGain);
            // Wet Path: delayNode -> wetGain -> moduleOutputGain
            this.delayNode.connect(this.wetGain);
            this.wetGain.connect(this.moduleOutputGain);
            // Feedback Loop: delayNode -> feedbackGain -> delayNode
            this.delayNode.connect(this.feedbackGain);
            this.feedbackGain.connect(this.delayNode);
            // Final Output: moduleOutputGain -> AudioEngine Master Output
            this.moduleOutputGain.connect(this.masterOutput);

            // Set the connection point for individual drips (this should be before the delay split)
            // Drips created via _createSingleDrip connect to this node.
            this._beatConnectionPoint = this.dryGain; // Drips connect here before splitting to dry/wet (via preDelayGain)

            this.isEnabled = true;
            console.log(`${this.MODULE_ID}: Initialization complete.`);

        } catch (error) {
            console.error(`${this.MODULE_ID}: Initialization failed:`, error);
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', `Water Drips init failed: ${error.message}`);
            }
            this.dispose(); // Cleanup partial initialization
            this.isEnabled = false; // Ensure state is correct
            // Allow AudioEngine to handle the failure
        }
    }

    /** Update loop hook (minimal use for this module). */
    update(time, mood, visualParams, audioParams, deltaTime) {
        if (!this.isEnabled || !this.isPlaying) return;
        // Potential subtle drift: Could slightly modulate the base densityFactor or echoFactor
        // over very long periods based on 'time' or 'dreaminess' for extra variation.
    }

    /** Start the water drip sequence scheduling. */
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
            this.dripIdCounter = 0; // Reset drip ID counter
            // Ensure next drip time isn't in the past relative to context time
            this.nextDripTime = Math.max(this.audioContext.currentTime, startTime);

            // Apply module attack envelope
            const attackTime = this.settings.attackTimeModule || this.defaultDripSettings.attackTimeModule;
            const targetVolume = this.settings.ambientVolume || this.defaultDripSettings.ambientVolume;
            const gainParam = this.moduleOutputGain.gain;

            if (typeof gainParam.cancelAndHoldAtTime === 'function') {
                gainParam.cancelAndHoldAtTime(this.nextDripTime);
            } else {
                gainParam.cancelScheduledValues(this.nextDripTime);
            }
            gainParam.setValueAtTime(0.0001, this.nextDripTime); // Start from silence
            gainParam.linearRampToValueAtTime(targetVolume, this.nextDripTime + attackTime);

            // Clear any previous scheduling timeout
            if (this.sequenceTimeoutId) {
                clearTimeout(this.sequenceTimeoutId);
                this.sequenceTimeoutId = null;
            }

            // Schedule the first drip check
            this._scheduleNextDrip();

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during play():`, error);
            this.isPlaying = false; // Ensure state is correct on error
            if (this.sequenceTimeoutId) clearTimeout(this.sequenceTimeoutId);
            this.sequenceTimeoutId = null;
            if (typeof ToastSystem !== 'undefined') ToastSystem.notify('error', `Water Drips play failed: ${error.message}`);
        }
    }

    /** Stop the drip sequence and fade out the module. */
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
            this.isPlaying = false; // Stop scheduling new drips immediately

            // Clear the pending next drip check timeout
            if (this.sequenceTimeoutId) {
                clearTimeout(this.sequenceTimeoutId);
                this.sequenceTimeoutId = null;
            }

            const now = this.audioContext.currentTime;
            const targetStopTime = Math.max(now, stopTime); // Ensure stop time is not in the past

            // Apply module release envelope
            const releaseTime = this.settings.releaseTimeModule || this.defaultDripSettings.releaseTimeModule;
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

            // Trigger release for any currently sounding drips
            // Their scheduled stop/cleanup will handle node removal later.
            this.activeDrips.forEach((dripData, dripId) => {
                if (dripData && !dripData.isStopping) {
                    dripData.isStopping = true;
                    // Drips have their own fast release, let it play out naturally.
                    // We don't need to force a faster fade here.
                    // Their scheduled cleanup (_cleanupDrip) will proceed as planned.
                    console.debug(`${this.MODULE_ID}: Letting active drip ${dripId} finish its natural release.`);
                }
            });

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during stop():`, error);
            // Attempt to clear active drips map as a fallback, though nodes might leak
            this.activeDrips.forEach((dripData, dripId) => { if (dripData?.cleanupTimeoutId) clearTimeout(dripData.cleanupTimeoutId); });
            this.activeDrips.clear();
            if (typeof ToastSystem !== 'undefined') ToastSystem.notify('error', `Water Drips stop failed: ${error.message}`);
        }
    }

    /** Adapt drip generation parameters to the new mood's settings. */
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
            this.settings = { ...this.defaultDripSettings, ...newSettings };
            this.currentMood = newMood;

            const now = this.audioContext.currentTime;
            const rampTime = transitionTime * 0.6; // Use part of transition for smooth ramps

            // --- Update Module Parameters ---
            // 1. Overall Volume
            if (this.moduleOutputGain) {
                const targetVolume = this.isPlaying ? this.settings.ambientVolume : 0.0001;
                const gainParam = this.moduleOutputGain.gain;
                 if (typeof gainParam.cancelAndHoldAtTime === 'function') {
                     gainParam.cancelAndHoldAtTime(now);
                 } else {
                     gainParam.cancelScheduledValues(now);
                 }
                gainParam.setTargetAtTime(targetVolume, now, rampTime / 2); // Faster volume ramp
            }

            // 2. Echo Parameters
            this._updateDelayParameters(this.settings, rampTime); // Apply new delay settings smoothly

            // 3. Update internal factors derived from settings
            // These will affect the *next* drip scheduled.
            console.log(`${this.MODULE_ID}: Drip parameters updated for mood '${newMood}'.`);

            // Envelope times (attack/release) for the *module* are updated in settings for next play/stop.

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during changeMood():`, error);
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', `Water Drips mood change failed: ${error.message}`);
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

            // 2. Stop and clean up any active drips immediately
            this.activeDrips.forEach((dripData, dripId) => {
                this._forceCleanupDrip(dripId); // Use forceful cleanup
            });
            this.activeDrips.clear();

            // 3. Disconnect module-level nodes
            if (this.feedbackGain) try { this.feedbackGain.disconnect(); } catch (e) {}
            if (this.delayNode) try { this.delayNode.disconnect(); } catch (e) {}
            if (this.wetGain) try { this.wetGain.disconnect(); } catch (e) {}
            if (this.dryGain) try { this.dryGain.disconnect(); } catch (e) {}
            if (this.moduleOutputGain) try { this.moduleOutputGain.disconnect(); } catch (e) {}

        } catch (error) {
             console.error(`${this.MODULE_ID}: Error during node disconnection phase:`, error);
        } finally {
            // 4. Nullify all references
            this.moduleOutputGain = null;
            this.delayNode = null;
            this.feedbackGain = null;
            this.wetGain = null;
            this.dryGain = null;
            this._beatConnectionPoint = null; // Nullify internal reference too
            this.audioContext = null;
            this.masterOutput = null;
            this.settings = null;
            this.activeDrips.clear(); // Ensure map is cleared
            console.log(`${this.MODULE_ID}: Disposal complete.`);
        }
    }

    // --- Internal Sequencing and Drip Generation ---

    /** Schedules the next check/trigger for a drip using setTimeout. */
    _scheduleNextDrip() {
        if (!this.isPlaying || !this.audioContext) return;

        // Calculate random delay until the next drip
        const minInterval = this.settings.dripIntervalMin || 1.8;
        const maxInterval = this.settings.dripIntervalMax || 8.5;
        const density = this.settings.densityFactor || 1.0; // Apply density factor from mood
        // Inverse relationship: higher density means shorter interval
        const interval = (minInterval + Math.random() * (maxInterval - minInterval)) / Math.max(0.1, density);
        const scheduledTime = this.nextDripTime + interval;

        const currentTime = this.audioContext.currentTime;
        const delaySeconds = Math.max(0, scheduledTime - currentTime); // Ensure non-negative delay
        const delayMilliseconds = delaySeconds * 1000;

        // Clear previous timeout if any
        if (this.sequenceTimeoutId) {
            clearTimeout(this.sequenceTimeoutId);
        }

        // Schedule the next execution
        this.sequenceTimeoutId = setTimeout(() => {
            if (!this.isPlaying) return; // Check state again inside timeout
            try {
                // Get the *intended* start time for this drip (which is the scheduled time)
                const intendedStartTime = scheduledTime;
                // Update nextDripTime for the *next* scheduling cycle based on when this one *should* have started
                this.nextDripTime = intendedStartTime;
                this._triggerDrip(intendedStartTime); // Pass the intended start time
            } catch (e) {
                console.error(`${this.MODULE_ID}: Error in _triggerDrip:`, e);
                this.stop(this.audioContext.currentTime); // Stop sequence on error
            }
        }, delayMilliseconds);
    }

    /** Triggers a single drip sound and schedules the next one. */
    _triggerDrip(intendedStartTime) { // Accept intended start time
        if (!this.isPlaying || !this.audioContext) return;

        // Calculate parameters for this specific drip
        const freqMin = this.settings.dripFrequencyMin || 800;
        const freqMax = this.settings.dripFrequencyMax || 2600;
        const pitchFactor = this.settings.pitchFactor || 1.0; // Apply pitch factor from mood
        const frequency = (freqMin + Math.random() * (freqMax - freqMin)) * pitchFactor;

        const volMin = this.settings.dripVolumeMin || 0.4;
        const volMax = this.settings.dripVolumeMax || 0.9;
        const volume = volMin + Math.random() * (volMax - volMin);

        const pan = (Math.random() - 0.5) * 2.0 * (this.settings.panSpread || 0.85);

        const releaseMin = this.settings.dripReleaseTimeMin || 0.06;
        const releaseMax = this.settings.dripReleaseTimeMax || 0.22;
        const releaseTime = releaseMin + Math.random() * (releaseMax - releaseMin);

        const dripParams = { frequency, volume, pan, releaseTime };
        // Pass the intended start time to the creation function
        this._createSingleDrip(dripParams, intendedStartTime);

        // Schedule the *next* drip check based on the updated nextDripTime
        this._scheduleNextDrip();
    }


    /** Creates and plays a single synthesized water drip sound using lookahead timing. */
    _createSingleDrip(params, playTime) { // playTime is the *intended* start time
        // --- Calculate Effective Play Time using Lookahead ---
        const now = this.audioContext.currentTime;
        const lookahead = 0.05; // 50ms lookahead
        const effectivePlayTime = now + lookahead;

        // --- Add Robust Node Checks ---
        if (!this.audioContext || !this.moduleOutputGain || !this.dryGain || !this.delayNode) {
            console.warn(`${this.MODULE_ID}: Skipping drip creation - missing essential nodes (context, outputGain, dryGain, or delayNode).`);
            return;
        }
        // --- End Node Checks ---

        let osc = null;
        let envGain = null;
        let panner = null;
        let preDelayGain = null; // Gain before splitting to dry/wet paths
        const dripId = `drip-${this.dripIdCounter++}`;

        try {
            // --- Create Nodes ---
            osc = this.audioContext.createOscillator();
            osc.type = this.settings.dripWaveform || 'sine';
            // Set frequency slightly before effectivePlayTime
            osc.frequency.setValueAtTime(params.frequency, Math.max(now, effectivePlayTime - 0.001));

            envGain = this.audioContext.createGain(); // Controls the ADSR envelope
            envGain.gain.setValueAtTime(0.0001, effectivePlayTime); // Start silent *at* effectivePlayTime

            panner = this.audioContext.createStereoPanner();
            panner.pan.setValueAtTime(params.pan, effectivePlayTime); // Schedule pan at effective time

            preDelayGain = this.audioContext.createGain(); // Controls overall level before echo split
            preDelayGain.gain.setValueAtTime(params.volume, effectivePlayTime); // Schedule gain at effective time

            // Connect nodes: Osc -> EnvGain -> Panner -> PreDelayGain
            osc.connect(envGain);
            envGain.connect(panner);
            panner.connect(preDelayGain);

            // Connect PreDelayGain to both Dry and Wet paths
            preDelayGain.connect(this.dryGain);    // Connect to Dry path gain
            preDelayGain.connect(this.delayNode); // Connect to Wet path delay input

            // --- Start the oscillator PRECISELY at effectivePlayTime ---
            osc.start(effectivePlayTime);

            // --- Apply Envelope (Fast Attack, Fast Decay/Release) ---
            const attack = this.settings.dripAttackTime || 0.001;
            const release = Math.max(0.01, params.releaseTime); // Use randomized release time, ensure > 0
            const peakVolume = 1.0; // Envelope gain controls shape, preDelayGain controls level
            const gainParam = envGain.gain;

            // Attack Phase (Very fast linear ramp to peak)
            gainParam.linearRampToValueAtTime(peakVolume, effectivePlayTime + attack);

            // Release Phase (Exponential decay starting immediately after attack peak)
            const releaseStartTime = effectivePlayTime + attack;
            // Use time constant based on the randomized release time
            gainParam.setTargetAtTime(0.0001, releaseStartTime, release / 3.0);

            // --- Schedule Node Stop ---
            // Stop time is after the note's attack AND the release phase completes
            const stopTime = releaseStartTime + release + 0.1; // Add buffer
             try {
                 osc.stop(stopTime); // Schedule stop
             } catch (e) { if(e.name !== 'InvalidStateError') console.warn(`${this.MODULE_ID}: Error scheduling oscillator stop for drip ${dripId}:`, e); }


            // --- Schedule Cleanup ---
            const cleanupDelay = (stopTime - this.audioContext.currentTime + 0.1) * 1000; // Delay from *now*
            const cleanupTimeoutId = setTimeout(() => {
                this._cleanupDrip(dripId);
            }, Math.max(50, cleanupDelay)); // Ensure minimum delay

            // --- Store Active Drip ---
            this.activeDrips.set(dripId, { osc, envGain, panner, preDelayGain, cleanupTimeoutId, isStopping: false });

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error creating drip ${dripId}:`, error);
            // Attempt cleanup of partially created nodes
            this._cleanupPartialDrip({ osc, envGain, panner, preDelayGain });
            // Remove from tracking if it was added
            if (this.activeDrips.has(dripId)) {
                 const dripData = this.activeDrips.get(dripId);
                 if (dripData.cleanupTimeoutId) clearTimeout(dripData.cleanupTimeoutId);
                 this.activeDrips.delete(dripId);
            }
             if (typeof ToastSystem !== 'undefined') {
                 ToastSystem.notify('warning', `Failed to create water drip sound: ${error.message}`);
             }
        }
    }

    /** Updates delay node parameters based on settings, optionally with ramping. */
    _updateDelayParameters(settings, rampTime = 0) {
        if (!this.delayNode || !this.feedbackGain || !this.wetGain || !this.dryGain || !this.audioContext) return;

        try {
             const now = this.audioContext.currentTime;
             const timeConstant = rampTime / 3.0; // For setTargetAtTime

             // Calculate target values with randomization/mood factors
             const echoFactor = settings.echoFactor || 1.0;
             const delayMin = settings.delayTimeMin || 0.25;
             const delayMax = settings.delayTimeMax || 0.7;
             const feedbackMin = settings.delayFeedbackMin || 0.3;
             const feedbackMax = settings.delayFeedbackMax || 0.65;

             const targetDelayTime = (delayMin + Math.random() * (delayMax - delayMin)) * echoFactor;
             const targetFeedback = (feedbackMin + Math.random() * (feedbackMax - feedbackMin)) * echoFactor;
             const targetWetMix = settings.wetMix || 0.6;
             // Ensure wet + dry doesn't exceed 1.0 by too much (simple normalization)
             const targetDryMix = Math.max(0, 1.0 - targetWetMix);

             // Apply parameters
             if (rampTime > 0.01) {
                 // Smooth transition
                 this.delayNode.delayTime.setTargetAtTime(targetDelayTime, now, timeConstant);
                 this.feedbackGain.gain.setTargetAtTime(targetFeedback, now, timeConstant);
                 this.wetGain.gain.setTargetAtTime(targetWetMix, now, timeConstant);
                 this.dryGain.gain.setTargetAtTime(targetDryMix, now, timeConstant);
             } else {
                 // Immediate change
                 this.delayNode.delayTime.setValueAtTime(targetDelayTime, now);
                 this.feedbackGain.gain.setValueAtTime(targetFeedback, now);
                 this.wetGain.gain.setValueAtTime(targetWetMix, now);
                 this.dryGain.gain.setValueAtTime(targetDryMix, now);
             }
             // console.debug(`${this.MODULE_ID}: Updated delay params - Time: ${targetDelayTime.toFixed(2)}, Feedback: ${targetFeedback.toFixed(2)}, Wet: ${targetWetMix.toFixed(2)}`);
        } catch (error) {
             console.error(`${this.MODULE_ID}: Error updating delay parameters:`, error);
        }
    }

    /** Cleans up resources associated with a finished or stopped drip. */
    _cleanupDrip(dripId) {
        if (!this.activeDrips.has(dripId)) return; // Already cleaned up

        const dripData = this.activeDrips.get(dripId);
        // console.debug(`${this.MODULE_ID}: Cleaning up drip ${dripId}`);

        try {
             // Disconnect nodes in reverse order of connection
             if (dripData.preDelayGain) dripData.preDelayGain.disconnect();
             if (dripData.panner) dripData.panner.disconnect();
             if (dripData.envGain) dripData.envGain.disconnect();
             if (dripData.osc) dripData.osc.disconnect();
        } catch (e) {
             console.warn(`${this.MODULE_ID}: Error disconnecting nodes for drip ${dripId}:`, e);
        } finally {
             // Clear the reference to the cleanup timeout itself from the object
             if (dripData.cleanupTimeoutId) {
                 // The timeout function itself has already run, so no need to clearTimeout here.
             }
             // Remove from the active drips map
             this.activeDrips.delete(dripId);
        }
    }

     /** Forcefully stops and cleans up a drip immediately (used in dispose). */
     _forceCleanupDrip(dripId) {
         if (!this.activeDrips.has(dripId)) return;
         const dripData = this.activeDrips.get(dripId);

         // Clear any pending cleanup timeout
         if (dripData.cleanupTimeoutId) {
             clearTimeout(dripData.cleanupTimeoutId);
         }

         try {
             if (dripData.osc) {
                 try { if(dripData.osc.stop) dripData.osc.stop(0); } catch(e){} // Stop immediately
                 try { dripData.osc.disconnect(); } catch(e){}
             }
             if (dripData.envGain) try { dripData.envGain.disconnect(); } catch(e){}
             if (dripData.panner) try { dripData.panner.disconnect(); } catch(e){}
             if (dripData.preDelayGain) try { dripData.preDelayGain.disconnect(); } catch(e){}
         } catch (e) {
             console.error(`${this.MODULE_ID}: Error during force cleanup for drip ${dripId}:`, e);
         } finally {
              this.activeDrips.delete(dripId); // Ensure removal from map
         }
     }

      /** Cleans up partially created nodes if drip creation fails mid-way. */
      _cleanupPartialDrip(nodes) {
           console.warn(`${this.MODULE_ID}: Cleaning up partially created drip nodes.`);
           const { osc, envGain, panner, preDelayGain } = nodes;
           if (preDelayGain) try { preDelayGain.disconnect(); } catch(e){}
           if (panner) try { panner.disconnect(); } catch(e){}
           if (envGain) try { envGain.disconnect(); } catch(e){}
           if (osc) try { osc.disconnect(); } catch(e){}
      }

} // End class AEAmbientWaterDrips

// Make globally accessible for the AudioEngine
window.AEAmbientWaterDrips = AEAmbientWaterDrips;

console.log("ae_ambientWaterDrips.js loaded and AEAmbientWaterDrips class defined.");