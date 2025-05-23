// ae_ambientInsectsNight.js - Audio Module for Night Insect Ambience
// Part of the Harmonic Visions project by FatStinkyPanda
// Copyright (c) 2025 FatStinkyPanda - All rights reserved.
// Version: 1.0.3 (Added Volume/Occurrence/Intensity control system)

/**
 * @class AEAmbientInsectsNight
 * @description Generates a dynamic and evolving soundscape of night insects (crickets, etc.)
 *              using synthesized chirps with randomized timing, pitch, volume, and panning.
 *              Implements the standard AudioEngine module interface with robust error handling
 *              and optimization considerations for various devices.
 */
class AEAmbientInsectsNight {
    constructor() {
        this.MODULE_ID = 'AEAmbientInsectsNight'; // For logging and identification
        this.audioContext = null;
        this.masterOutput = null; // Connects to AudioEngine's masterInputGain
        this.settings = null;
        this.baseSettings = null; // Store base settings from data.js
        this.currentMood = null;
        this.isEnabled = false;
        this.isPlaying = false;
        // Added mood configuration with default values
        this.moodConfig = { volume: 100, occurrence: 100, intensity: 50 };

        // --- Core Audio Nodes ---
        this.outputGain = null;     // Master gain for this module (volume and overall fades)
        // No persistent oscillators; chirps are transient

        // --- Sequencing State ---
        this.sequenceTimeoutId = null; // Timeout ID for scheduling the next chirp cluster check
        this.nextChirpTime = 0;     // AudioContext time for the next potential chirp cluster

        // --- Active Chirp Tracking ---
        // Map<chirpId, { osc: OscillatorNode, gain: GainNode, panner: StereoPannerNode, cleanupTimeoutId: number, isStopping: boolean }>
        this.activeChirps = new Map();
        this.chirpIdCounter = 0;

        // --- Default Settings Tailored for Night Insects ---
        this.defaultInsectSettings = {
            ambientVolume: 0.18,      // Subtle background volume
            // Chirp Timing
            chirpIntervalMin: 0.25,   // Minimum seconds between chirp clusters
            chirpIntervalMax: 1.3,    // Maximum seconds between chirp clusters
            chirpsPerClusterMin: 1,   // Minimum chirps triggered nearly simultaneously
            chirpsPerClusterMax: 4,   // Maximum chirps triggered nearly simultaneously
            clusterSpread: 0.06,      // Max time difference (s) between chirps in a cluster
            // Chirp Sound Properties
            chirpWaveform: 'sine',    // 'sine' or 'triangle' usually work well
            chirpFrequencyMin: 2800,  // Base frequency minimum (Hz)
            chirpFrequencyMax: 4800,  // Base frequency maximum (Hz)
            chirpDurationMin: 0.03,   // Minimum length of the chirp tone (s) - Less critical now envelope defines sound length
            chirpDurationMax: 0.09,   // Maximum length of the chirp tone (s) - Less critical now envelope defines sound length
            chirpAttackTime: 0.005,   // Very fast attack (s)
            chirpReleaseTime: 0.04,   // Quick but slightly resonant release (s)
            chirpVolumeMin: 0.6,      // Minimum relative volume (0-1)
            chirpVolumeMax: 1.0,      // Maximum relative volume (0-1)
            // Spatialization
            panSpread: 0.7,           // Max L/R pan offset (-1 to 1)
            // Envelope (Master Module)
            attackTime: 1.5,          // Module fade-in time (s)
            releaseTime: 2.0,         // Module fade-out time (s)
            // Mood Variation Hint (can be used in update/changeMood)
            densityFactor: 1.0,       // Multiplier for chirp rate (can be adjusted by mood)
            pitchFactor: 1.0,         // Multiplier for frequency range (can be adjusted by mood)
            // Base/Max values for intensity mapping
            densityFactorBase: 1.0,   // Base density factor (for 50% intensity)
            densityFactorMax: 2.5,    // Maximum density factor (for 100% intensity)
            pitchFactorBase: 0.8,     // Base pitch factor (for 50% intensity)
            pitchFactorMax: 1.5,      // Maximum pitch factor (for 100% intensity)
            panSpreadBase: 0.5,       // Base pan spread (for 50% intensity)
            panSpreadMax: 1.0,        // Maximum pan spread (for 100% intensity)
        };

        console.log(`${this.MODULE_ID}: Instance created.`);
    }

    /**
     * Maps a value from 0-100 range to a target range
     * @param {number} value0to100 - Input value between 0 and 100
     * @param {number} minTarget - Minimum value in target range
     * @param {number} maxTarget - Maximum value in target range
     * @returns {number} - Mapped value in target range
     */
    _mapValue(value0to100, minTarget, maxTarget) {
        const clampedValue = Math.max(0, Math.min(100, value0to100 ?? 100)); // Default to 100 if undefined
        return minTarget + (maxTarget - minTarget) * (clampedValue / 100.0);
    }

    /**
     * Applies the 0-100 mood configuration to audio parameters
     * @param {number} transitionTime - Time in seconds for parameter transitions
     */
    _applyMoodConfig(transitionTime = 0) {
        if (!this.moodConfig || !this.audioContext || !this.baseSettings) return;

        const now = this.audioContext.currentTime;
        const rampTime = transitionTime > 0 ? transitionTime * 0.5 : 0; // Shorter ramp for config changes
        const timeConstant = rampTime / 3.0;

        // --- Apply Volume ---
        if (this.outputGain && this.moodConfig.volume !== undefined) {
            // Map 0-100 volume to 0-baseVolume
            const baseVolume = this.baseSettings.ambientVolume || this.defaultInsectSettings.ambientVolume;
            const targetVolume = this._mapValue(this.moodConfig.volume, 0.0001, baseVolume);
            console.log(`${this.MODULE_ID}: Applying Volume ${this.moodConfig.volume}/100 -> ${targetVolume.toFixed(3)}`);
            
            if (rampTime > 0.01 && this.isPlaying) {
                this.outputGain.gain.setTargetAtTime(targetVolume, now, timeConstant);
            } else {
                this.outputGain.gain.setValueAtTime(targetVolume, now);
            }
        }

        // --- Apply Occurrence (Density of Chirps) ---
        if (this.moodConfig.occurrence !== undefined) {
            const baseDensity = this.baseSettings.densityFactorBase || this.defaultInsectSettings.densityFactorBase;
            const maxDensity = this.baseSettings.densityFactorMax || this.defaultInsectSettings.densityFactorMax;
            
            // Map 0-100 occurrence to a density factor range
            // 0 = very sparse, 100 = very dense
            this.settings.densityFactor = this._mapValue(this.moodConfig.occurrence, 0.1, maxDensity);
            console.log(`${this.MODULE_ID}: Applying Occurrence ${this.moodConfig.occurrence}/100 -> densityFactor ${this.settings.densityFactor.toFixed(2)}`);
            
            // Note: Density affects the timing between chirp clusters which will 
            // be applied in the next scheduled chirp cycle
        }

        // --- Apply Intensity (Pitch Range and Pan Spread) ---
        if (this.moodConfig.intensity !== undefined) {
            console.log(`${this.MODULE_ID}: Applying Intensity ${this.moodConfig.intensity}/100`);
            
            // 1. Pitch Factor - affects the frequency range of chirps
            const basePitch = this.baseSettings.pitchFactorBase || this.defaultInsectSettings.pitchFactorBase;
            const maxPitch = this.baseSettings.pitchFactorMax || this.defaultInsectSettings.pitchFactorMax;
            this.settings.pitchFactor = this._mapValue(this.moodConfig.intensity, basePitch, maxPitch);
            console.log(`  -> Pitch Factor: ${this.settings.pitchFactor.toFixed(2)}`);
            
            // 2. Pan Spread - affects the stereo width/spatialization of chirps
            const basePanSpread = this.baseSettings.panSpreadBase || this.defaultInsectSettings.panSpreadBase;
            const maxPanSpread = this.baseSettings.panSpreadMax || this.defaultInsectSettings.panSpreadMax;
            this.settings.panSpread = this._mapValue(this.moodConfig.intensity, basePanSpread, maxPanSpread);
            console.log(`  -> Pan Spread: ${this.settings.panSpread.toFixed(2)}`);
            
            // Note: These will affect new chirps as they are created
        }
    }

    // --- Core Module Methods (AudioEngine Interface) ---

    /**
     * Initialize audio nodes based on initial mood settings.
     * @param {AudioContext} audioContext - The Web Audio context
     * @param {AudioNode} masterOutputNode - The destination node to connect to
     * @param {Object} initialSettings - Initial audio settings
     * @param {string} initialMood - Name of the initial mood
     * @param {Object} moodConfig - 0-100 configuration for volume/occurrence/intensity
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
            
            // Store base settings from data.js
            this.baseSettings = { ...this.defaultInsectSettings, ...initialSettings };
            // Store the current settings (will be modified by _applyMoodConfig)
            this.settings = { ...this.baseSettings };
            // Store the mood configuration
            this.moodConfig = { ...this.moodConfig, ...moodConfig };
            this.currentMood = initialMood;

            // --- Create Core Nodes ---
            this.outputGain = this.audioContext.createGain();
            this.outputGain.gain.setValueAtTime(0.0001, this.audioContext.currentTime); // Start silent

            // --- Connect Audio Graph ---
            // Individual chirps will connect directly to this outputGain
            this.outputGain.connect(this.masterOutput);

            // --- Apply Initial Mood Config ---
            this._applyMoodConfig(0); // Apply immediately (no transition)

            this.isEnabled = true;
            console.log(`${this.MODULE_ID}: Initialization complete.`);

        } catch (error) {
            console.error(`${this.MODULE_ID}: Initialization failed:`, error);
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', `Night Insects init failed: ${error.message}`);
            }
            this.dispose(); // Cleanup partial initialization
            this.isEnabled = false; // Ensure state is correct
        }
    }

    /** Update loop hook (minimal use for this module). */
    update(time, mood, visualParams, audioParams, deltaTime) {
        if (!this.isEnabled || !this.isPlaying) return;
        // Potential subtle drift:
        // Could slightly modulate the base densityFactor or pitchFactor over long periods
        // based on 'time' or 'dreaminess' from visualParams for extra variation.
    }

    /** Start the insect chirp sequence. */
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
            console.warn(`${this.MODULE_ID}: AudioContext suspended. Attempting resume. Playback may be delayed.`);
            this.audioContext.resume().catch(err => console.error(`${this.MODULE_ID}: Error resuming context on play:`, err));
            // Proceed, but sound won't start until context resumes.
        }

        console.log(`${this.MODULE_ID}: Starting playback sequence at ${startTime.toFixed(3)}`);
        try {
            this.isPlaying = true;
            this.chirpIdCounter = 0; // Reset chirp ID counter
            // Ensure next chirp time isn't in the past relative to context time
            this.nextChirpTime = Math.max(this.audioContext.currentTime, startTime);

            // Apply module attack envelope
            const attackTime = this.settings.attackTime || this.defaultInsectSettings.attackTime;
            // Use volume from moodConfig
            const baseVolume = this.baseSettings.ambientVolume || this.defaultInsectSettings.ambientVolume;
            const targetVolume = this._mapValue(this.moodConfig.volume, 0.0001, baseVolume);
            
            this.outputGain.gain.cancelScheduledValues(this.nextChirpTime);
            this.outputGain.gain.setValueAtTime(0.0001, this.nextChirpTime); // Start from silence
            this.outputGain.gain.linearRampToValueAtTime(targetVolume, this.nextChirpTime + attackTime);

            // Clear any previous scheduling timeout
            if (this.sequenceTimeoutId) {
                clearTimeout(this.sequenceTimeoutId);
                this.sequenceTimeoutId = null;
            }

            // Schedule the first chirp check
            this._scheduleNextChirp();

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during play():`, error);
            this.isPlaying = false; // Ensure state is correct on error
            if (this.sequenceTimeoutId) clearTimeout(this.sequenceTimeoutId);
            this.sequenceTimeoutId = null;
            if (typeof ToastSystem !== 'undefined') ToastSystem.notify('error', `Night Insects play failed: ${error.message}`);
        }
    }

    /** Stop the insect chirp sequence and fade out the module. */
    stop(stopTime, fadeDuration = 0.5) { // fadeDuration overridden by releaseTime
        if (!this.isEnabled || !this.isPlaying) return;
        if (!this.audioContext || !this.outputGain) {
            console.error(`${this.MODULE_ID}: Cannot stop - AudioContext or outputGain missing.`);
            return;
        }
        if (this.audioContext.state === 'closed') {
            console.error(`${this.MODULE_ID}: Cannot stop - AudioContext is closed.`);
            return;
        }

        console.log(`${this.MODULE_ID}: Stopping playback sequence at ${stopTime.toFixed(3)}`);
        try {
            this.isPlaying = false; // Stop scheduling new chirps immediately

            // Clear the pending next chirp check timeout
            if (this.sequenceTimeoutId) {
                clearTimeout(this.sequenceTimeoutId);
                this.sequenceTimeoutId = null;
            }

            const now = this.audioContext.currentTime;
            const targetStopTime = Math.max(now, stopTime); // Ensure stop time is not in the past

            // Apply module release envelope
            const releaseTime = this.settings.releaseTime || this.defaultInsectSettings.releaseTime;
            const timeConstant = releaseTime / 3.0; // Exponential decay

            this.outputGain.gain.cancelScheduledValues(targetStopTime);
            const currentGain = this.outputGain.gain.value;
            this.outputGain.gain.setValueAtTime(currentGain, targetStopTime); // Start release from current level
            this.outputGain.gain.setTargetAtTime(0.0001, targetStopTime, timeConstant);

            // Trigger release for any currently sounding chirps
            // (Their scheduled stop will handle node cleanup later)
            this.activeChirps.forEach((chirpData, chirpId) => {
                if (chirpData && chirpData.gain && !chirpData.isStopping) {
                    chirpData.isStopping = true;
                    // Chirps have their own short release, let it play out naturally.
                    // We don't need to force a faster fade here unless desired.
                    // Their scheduled stop/cleanup will proceed as planned.
                    console.debug(`${this.MODULE_ID}: Letting active chirp ${chirpId} finish its natural release.`);
                }
            });

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during stop():`, error);
            // Attempt to clear active chirps map as a fallback, though nodes might leak
            this.activeChirps.forEach((chirpData, chirpId) => { if (chirpData?.cleanupTimeoutId) clearTimeout(chirpData.cleanupTimeoutId); });
            this.activeChirps.clear();
            if (typeof ToastSystem !== 'undefined') ToastSystem.notify('error', `Night Insects stop failed: ${error.message}`);
        }
    }

    /**
     * Adapt chirp generation parameters to the new mood's settings.
     * @param {string} newMood - The name of the new mood
     * @param {Object} newSettings - Audio settings for the new mood
     * @param {number} transitionTime - Time in seconds for the transition
     * @param {Object} moodConfig - 0-100 configuration for volume/occurrence/intensity
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
            // Store the base settings from data.js
            this.baseSettings = { ...this.defaultInsectSettings, ...newSettings };
            // Update settings (will be modified by _applyMoodConfig)
            this.settings = { ...this.baseSettings };
            // Store the new mood configuration
            this.moodConfig = { ...this.moodConfig, ...moodConfig };
            this.currentMood = newMood;

            // Apply the new mood configuration with transition time
            this._applyMoodConfig(transitionTime);

            console.log(`${this.MODULE_ID}: Chirp parameters updated for mood '${newMood}'.`);

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during changeMood():`, error);
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', `Night Insects mood change failed: ${error.message}`);
            }
        }
    }

    /** Clean up all audio resources and timers. */
    dispose() {
        console.log(`${this.MODULE_ID}: Disposing...`);
        if (!this.isEnabled && !this.outputGain) {
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

            // 2. Stop and clean up any active chirps immediately
            this.activeChirps.forEach((chirpData, chirpId) => {
                this._forceCleanupChirp(chirpId); // Use forceful cleanup
            });
            this.activeChirps.clear();

            // 3. Disconnect master output gain
            if (this.outputGain) {
                try { this.outputGain.disconnect(); } catch (e) {}
            }

        } catch (error) {
             console.error(`${this.MODULE_ID}: Error during node disconnection phase:`, error);
        } finally {
            // 4. Nullify all references
            this.outputGain = null;
            this.audioContext = null;
            this.masterOutput = null;
            this.settings = null;
            this.baseSettings = null;
            this.activeChirps.clear(); // Ensure map is cleared
            console.log(`${this.MODULE_ID}: Disposal complete.`);
        }
    }

    // --- Internal Sequencing and Chirp Generation ---

    /** Schedules the next check/trigger for a chirp cluster using setTimeout. */
    _scheduleNextChirp() {
        if (!this.isPlaying || !this.audioContext) return;

        // Calculate random delay until the next cluster
        const minInterval = this.settings.chirpIntervalMin || 0.25;
        const maxInterval = this.settings.chirpIntervalMax || 1.3;
        const density = this.settings.densityFactor || 1.0; // Apply density factor from moodConfig
        const interval = (minInterval + Math.random() * (maxInterval - minInterval)) / Math.max(0.1, density); // Inverse relationship with density
        const scheduledTime = this.nextChirpTime + interval;

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
                // Get the *intended* start time for this cluster
                const intendedClusterStartTime = scheduledTime;
                // Update nextChirpTime for the *next* scheduling cycle based on when this one *should* have started
                this.nextChirpTime = intendedClusterStartTime;
                this._triggerChirpCluster(intendedClusterStartTime); // Pass intended time
            } catch (e) {
                console.error(`${this.MODULE_ID}: Error in _triggerChirpCluster:`, e);
                this.stop(this.audioContext.currentTime); // Stop sequence on error
            }
        }, delayMilliseconds);
    }

    /** Triggers a cluster of 1 or more chirps with slight timing variations. */
    _triggerChirpCluster(clusterStartTime) { // Accept intended start time
        if (!this.isPlaying || !this.audioContext) return;

        const clusterMin = this.settings.chirpsPerClusterMin || 1;
        const clusterMax = this.settings.chirpsPerClusterMax || 4;
        const numChirps = Math.floor(clusterMin + Math.random() * (clusterMax - clusterMin + 1));
        const clusterSpread = this.settings.clusterSpread || 0.06;
        // clusterStartTime is the intended start time for the cluster

        // console.debug(`${this.MODULE_ID}: Triggering cluster of ${numChirps} chirps around ${clusterStartTime.toFixed(3)}s`);

        for (let i = 0; i < numChirps; i++) {
            // Calculate parameters for this specific chirp
            const freqMin = this.settings.chirpFrequencyMin || 2800;
            const freqMax = this.settings.chirpFrequencyMax || 4800;
            const pitchFactor = this.settings.pitchFactor || 1.0; // Apply pitch factor from moodConfig
            const frequency = (freqMin + Math.random() * (freqMax - freqMin)) * pitchFactor;

            // Note: chirpDuration is less relevant now, envelope defines sound length
            // const durationMin = this.settings.chirpDurationMin || 0.03;
            // const durationMax = this.settings.chirpDurationMax || 0.09;
            // const duration = durationMin + Math.random() * (durationMax - durationMin);

            const volMin = this.settings.chirpVolumeMin || 0.6;
            const volMax = this.settings.chirpVolumeMax || 1.0;
            const volume = volMin + Math.random() * (volMax - volMin);

            // Use panSpread from moodConfig for wider/narrower stereo image
            const pan = (Math.random() - 0.5) * 2.0 * (this.settings.panSpread || 0.7);

            // Calculate slightly offset intended start time within the cluster spread
            const intendedChirpStartTime = clusterStartTime + Math.random() * clusterSpread;

            // Pass duration for potential future use, but envelope controls perceived length
            const chirpParams = { frequency, /*duration,*/ volume, pan };
            // Pass the *intended* start time for this chirp
            this._createSingleChirp(chirpParams, intendedChirpStartTime);
        }

        // Schedule the *next* cluster check based on the updated nextChirpTime
        this._scheduleNextChirp();
    }


    /** Creates and plays a single synthesized insect chirp using lookahead timing. */
    _createSingleChirp(params, playTime) { // playTime is the *intended* start time
        // --- Calculate Effective Play Time using Lookahead ---
        const now = this.audioContext.currentTime;
        const lookahead = 0.05; // 50ms lookahead
        const effectivePlayTime = now + lookahead;

        // --- Add Robust Node Checks ---
        if (!this.audioContext || !this.outputGain) {
             console.warn(`${this.MODULE_ID}: Skipping chirp creation - missing essential nodes (context or outputGain).`);
             return;
        }
        // --- End Node Checks ---

        let osc = null;
        let gain = null;
        let panner = null; // Panner per chirp for distinct spatialization
        const chirpId = `insect-${this.chirpIdCounter++}`;

        try {
            // --- Create Nodes ---
            osc = this.audioContext.createOscillator();
            osc.type = this.settings.chirpWaveform || 'sine';
            // Set frequency slightly before effectivePlayTime
            osc.frequency.setValueAtTime(params.frequency, Math.max(now, effectivePlayTime - 0.001));

            gain = this.audioContext.createGain();
            gain.gain.setValueAtTime(0.0001, effectivePlayTime); // Start silent *at* effectivePlayTime

            panner = this.audioContext.createStereoPanner();
            panner.pan.setValueAtTime(params.pan, effectivePlayTime); // Schedule pan at effective time

            // Connect nodes: Osc -> Gain -> Panner -> Module Output Gain
            osc.connect(gain);
            gain.connect(panner);
            panner.connect(this.outputGain);

            // --- Start the oscillator PRECISELY at effectivePlayTime ---
            osc.start(effectivePlayTime);

            // --- Apply Envelope (Fast ADSR-like for chirp) ---
            const attack = this.settings.chirpAttackTime || 0.005;
            const release = this.settings.chirpReleaseTime || 0.04;
            const peakVolume = params.volume; // Use randomized volume
            const gainParam = gain.gain;

            // Attack Phase (Linear ramp to peak)
            gainParam.linearRampToValueAtTime(peakVolume, effectivePlayTime + attack);

            // Release Phase (Exponential decay starting slightly after attack peak)
            const releaseStartTime = effectivePlayTime + attack;
            gainParam.setTargetAtTime(0.0001, releaseStartTime, release / 3.0); // Time constant for release

            // --- Schedule Node Stop ---
            // Stop time is after the attack AND the release phase completes (relative to effective start)
            // The original 'duration' parameter is less relevant now.
            const stopTime = releaseStartTime + release + 0.05; // Add buffer after release finishes
             try {
                 osc.stop(stopTime); // Schedule stop
             } catch (e) { if(e.name !== 'InvalidStateError') console.warn(`${this.MODULE_ID}: Error scheduling oscillator stop for chirp ${chirpId}:`, e); }


            // --- Schedule Cleanup ---
            const cleanupDelay = (stopTime - this.audioContext.currentTime + 0.1) * 1000; // Delay from *now*
            const cleanupTimeoutId = setTimeout(() => {
                this._cleanupChirp(chirpId);
            }, Math.max(50, cleanupDelay)); // Ensure minimum delay

            // --- Store Active Chirp ---
            this.activeChirps.set(chirpId, { osc, gain, panner, cleanupTimeoutId, isStopping: false });

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error creating chirp ${chirpId}:`, error);
            // Attempt cleanup of partially created nodes
             this._cleanupPartialChirp({ osc, gain, panner }); // Call helper
            if (this.activeChirps.has(chirpId)) {
                 const chirpData = this.activeChirps.get(chirpId);
                 if (chirpData.cleanupTimeoutId) clearTimeout(chirpData.cleanupTimeoutId);
                 this.activeChirps.delete(chirpId);
            }
             if (typeof ToastSystem !== 'undefined') {
                 ToastSystem.notify('warning', `Failed to create insect sound: ${error.message}`);
             }
        }
    }

    /** Cleans up resources associated with a finished or stopped chirp. */
    _cleanupChirp(chirpId) {
        if (!this.activeChirps.has(chirpId)) return; // Already cleaned up

        const chirpData = this.activeChirps.get(chirpId);
        // console.debug(`${this.MODULE_ID}: Cleaning up chirp ${chirpId}`);

        try {
             // Disconnect nodes in reverse order of connection
             if (chirpData.panner) chirpData.panner.disconnect();
             if (chirpData.gain) chirpData.gain.disconnect();
             if (chirpData.osc) chirpData.osc.disconnect();
        } catch (e) {
             console.warn(`${this.MODULE_ID}: Error disconnecting nodes for chirp ${chirpId}:`, e);
        } finally {
             // Clear the reference to the cleanup timeout itself from the object
             if (chirpData.cleanupTimeoutId) {
                 // The timeout function itself has already run, so no need to clearTimeout here.
             }
             // Remove from the active chirps map
             this.activeChirps.delete(chirpId);
        }
    }

     /** Forcefully stops and cleans up a chirp immediately (used in dispose). */
     _forceCleanupChirp(chirpId) {
         if (!this.activeChirps.has(chirpId)) return;
         const chirpData = this.activeChirps.get(chirpId);

         // Clear any pending cleanup timeout
         if (chirpData.cleanupTimeoutId) {
             clearTimeout(chirpData.cleanupTimeoutId);
         }

         try {
             if (chirpData.osc) {
                 try { if(chirpData.osc.stop) chirpData.osc.stop(0); } catch(e){} // Stop immediately
                 try { chirpData.osc.disconnect(); } catch(e){}
             }
             if (chirpData.gain) {
                 try { chirpData.gain.disconnect(); } catch(e){}
             }
             if (chirpData.panner) {
                 try { chirpData.panner.disconnect(); } catch(e){}
             }
         } catch (e) {
             console.error(`${this.MODULE_ID}: Error during force cleanup for chirp ${chirpId}:`, e);
         } finally {
              this.activeChirps.delete(chirpId); // Ensure removal from map
         }
     }

     /** Cleans up partially created nodes if chirp creation fails mid-way. */
     _cleanupPartialChirp(nodes) {
          console.warn(`${this.MODULE_ID}: Cleaning up partially created chirp nodes.`);
          const { osc, gain, panner } = nodes;
          if (panner) try { panner.disconnect(); } catch(e){}
          if (gain) try { gain.disconnect(); } catch(e){}
          if (osc) try { osc.disconnect(); } catch(e){}
     }

} // End class AEAmbientInsectsNight

// Make globally accessible for the AudioEngine
window.AEAmbientInsectsNight = AEAmbientInsectsNight;

console.log("ae_ambientInsectsNight.js loaded and AEAmbientInsectsNight class defined.");