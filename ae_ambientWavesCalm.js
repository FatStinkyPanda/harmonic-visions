// ae_ambientWavesCalm.js - Audio Module for Calm Ocean Waves Ambience
// Part of the Harmonic Visions project by FatStinkyPanda
// Copyright (c) 2025 FatStinkyPanda - All rights reserved.
// Version: 1.0.1 (Updated with Vol/Occur/Inten System)

/**
 * @class AEAmbientWavesCalm
 * @description Generates a continuous, evolving soundscape of calm ocean waves
 *              using filtered noise synthesis, LFO modulation for rhythm, and
 *              subtle spatialization. Implements the standard AudioEngine module
 *              interface with extensive error handling and optimization.
 */
class AEAmbientWavesCalm {
    constructor() {
        this.MODULE_ID = 'AEAmbientWavesCalm'; // For logging and identification
        this.audioContext = null;
        this.masterOutput = null; // Connects to AudioEngine's masterInputGain
        this.settings = null;
        this.baseSettings = null; // Store original unmodified settings
        this.currentMood = null;
        this.isEnabled = false;
        this.isPlaying = false;
        
        // Added moodConfig system
        this.moodConfig = { volume: 100, occurrence: 100, intensity: 50 }; // Default config

        // --- Core Audio Nodes ---
        this.outputGain = null;     // Master gain for this module (volume and fades)
        this.noiseSource = null;    // BufferSourceNode playing the generated noise loop
        this.noiseBuffer = null;    // AudioBuffer holding the generated pink noise
        this.pannerNode = null;     // StereoPannerNode for spatialization

        // Wave Layers
        this.baseLayer = {          // Low-frequency rumble/water body
            filter: null,           // Low-pass filter
            gain: null              // Controls base layer volume
        };
        this.washLayer = {          // Higher-frequency hiss/wash
            filter: null,           // Band-pass or High-pass filter
            gain: null              // Gain modulated for rhythm
        };

        // --- LFOs for Modulation ---
        this.lfoNodes = []; // Array storing { lfo: OscillatorNode, gain: GainNode, target: AudioParam, description: string }

        // --- Default Settings Tailored for Calm Waves ---
        this.defaultWaveSettings = {
            ambientVolume: 0.22,    // Moderate volume, adjust in main mix
            noiseBufferSizeSeconds: 15, // Longer buffer for less noticeable looping
            noiseType: 'pink',      // Pink noise often sounds more natural for water
            // Base Layer (Rumble)
            baseFilterFreq: 250,    // Hz, low cutoff for deep rumble
            baseFilterQ: 0.9,
            baseGainLevel: 0.7,     // Relative volume of the base layer
            // Wash Layer (Hiss/Rhythm)
            washFilterType: 'bandpass',// 'bandpass' or 'highpass'
            washFilterFreqBase: 1800, // Hz, base frequency for the wash sound
            washFilterFreqRange: 800, // Hz, random variation range for uniqueness
            washFilterQBase: 1.2,
            washFilterQRange: 0.8,
            washGainLevel: 0.85,    // Relative volume of the wash layer
            // Rhythm LFO (controls wash gain & filter)
            rhythmLFORateBase: 0.08, // Hz, very slow for calm waves (e.g., 1 cycle every ~12s)
            rhythmLFORateRange: 0.04,// Hz, variation in wave speed
            rhythmLFOWashGainDepth: 0.6, // Modulation depth for wash gain (0 to washGainLevel * depth)
            rhythmLFOWashFilterDepth: 400, // Hz, modulation depth for wash filter frequency
            // Panning LFO
            panLFORate: 0.015,       // Hz, extremely slow panning for subtle movement
            panLFODepth: 0.45,       // Max pan excursion (-0.45 to 0.45)
            // Envelope
            attackTime: 5.0,        // Slow fade-in
            releaseTime: 6.0,       // Slow fade-out
            // Uniqueness/Variation Parameters
            filterFreqRandomness: 0.1, // +/- 10% random variation on filter freqs at init/mood change
            lfoRateRandomness: 0.15,   // +/- 15% random variation on LFO rates at init/mood change
            
            // Added base/max value pairs for intensity mapping
            baseFilterQMin: 0.7,    // Min Q for base filter (at intensity 0)
            baseFilterQMax: 1.5,    // Max Q for base filter (at intensity 100)
            washFilterQMin: 0.8,    // Min Q for wash filter (at intensity 0)
            washFilterQMax: 2.5,    // Max Q for wash filter (at intensity 100)
            rhythmLFODepthMin: 0.3, // Min modulation depth (at intensity 0)
            rhythmLFODepthMax: 1.0, // Max modulation depth (at intensity 100)
            washFilterFreqMin: 1200, // Min wash filter frequency (at intensity 0)
            washFilterFreqMax: 2500, // Max wash filter frequency (at intensity 100)
            // Occurrence (wave activity)
            rhythmLFORateMin: 0.04, // Min rhythm rate (at occurrence 0)
            rhythmLFORateMax: 0.14, // Max rhythm rate (at occurrence 100)
        };

        console.log(`${this.MODULE_ID}: Instance created.`);
    }

    // --- Core Module Methods (AudioEngine Interface) ---

    /**
     * Maps a value from 0-100 range to a target range (min-max)
     * @param {number} value0to100 - Input value (0-100)
     * @param {number} minTarget - Target range minimum
     * @param {number} maxTarget - Target range maximum
     * @returns {number} Mapped value in target range
     * @private
     */
    _mapValue(value0to100, minTarget, maxTarget) {
        const clampedValue = Math.max(0, Math.min(100, value0to100 ?? 100)); // Default to 100 if undefined
        return minTarget + (maxTarget - minTarget) * (clampedValue / 100.0);
    }

    /**
     * Applies the volume/occurrence/intensity mood configuration
     * @param {number} transitionTime - Time in seconds for parameter transitions
     * @private
     */
    _applyMoodConfig(transitionTime = 0) {
        if (!this.moodConfig || !this.audioContext || !this.baseSettings) return;

        const now = this.audioContext.currentTime;
        const rampTime = transitionTime > 0 ? transitionTime * 0.7 : 0;
        const timeConstant = rampTime / 3.0;

        // --- Apply Volume ---
        if (this.outputGain && this.moodConfig.volume !== undefined) {
            const baseVolume = this.baseSettings.ambientVolume || this.defaultWaveSettings.ambientVolume;
            const targetVolume = this._mapValue(this.moodConfig.volume, 0.0, baseVolume);
            console.log(`${this.MODULE_ID}: Applying Volume ${this.moodConfig.volume}/100 -> ${targetVolume.toFixed(3)}`);
            
            if (this.isPlaying) {
                // Only use transition if we're playing and transition time is significant
                if (rampTime > 0.01) {
                    this.outputGain.gain.setTargetAtTime(targetVolume, now, timeConstant);
                } else {
                    this.outputGain.gain.setValueAtTime(targetVolume, now);
                }
            } else {
                // Store for next play() but don't change current gain
                this.settings.ambientVolume = targetVolume;
            }
        }

        // --- Apply Occurrence ---
        if (this.moodConfig.occurrence !== undefined) {
            console.log(`${this.MODULE_ID}: Applying Occurrence ${this.moodConfig.occurrence}/100`);
            
            // For waves, occurrence affects rhythm rate (wave frequency/activity)
            const rhythmRateMin = this.baseSettings.rhythmLFORateMin || this.defaultWaveSettings.rhythmLFORateMin;
            const rhythmRateMax = this.baseSettings.rhythmLFORateMax || this.defaultWaveSettings.rhythmLFORateMax;
            const targetRhythmRate = this._mapValue(this.moodConfig.occurrence, rhythmRateMin, rhythmRateMax);
            
            // Apply with randomization factor from settings
            const rateRandFactor = 1.0 + (Math.random() - 0.5) * 2.0 * 
                (this.baseSettings.lfoRateRandomness || this.defaultWaveSettings.lfoRateRandomness);
            const effectiveRhythmRate = targetRhythmRate * rateRandFactor;
            
            console.log(`  -> Rhythm Rate: ${effectiveRhythmRate.toFixed(3)} Hz (${(1/effectiveRhythmRate).toFixed(1)}s cycle)`);
            
            // Update the rhythm LFOs if they exist
            this.lfoNodes.forEach(lfoData => {
                if (lfoData.description && lfoData.description.includes('rhythm') && lfoData.lfo) {
                    if (rampTime > 0.01) {
                        lfoData.lfo.frequency.setTargetAtTime(effectiveRhythmRate, now, timeConstant);
                    } else {
                        lfoData.lfo.frequency.setValueAtTime(effectiveRhythmRate, now);
                    }
                }
            });
            
            // Store in settings for recreation if needed
            this.settings.rhythmLFORateBase = targetRhythmRate;
        }

        // --- Apply Intensity ---
        if (this.moodConfig.intensity !== undefined) {
            console.log(`${this.MODULE_ID}: Applying Intensity ${this.moodConfig.intensity}/100`);
            
            // 1. Filter Q values (resonance)
            if (this.baseLayer.filter) {
                const baseQMin = this.baseSettings.baseFilterQMin || this.defaultWaveSettings.baseFilterQMin;
                const baseQMax = this.baseSettings.baseFilterQMax || this.defaultWaveSettings.baseFilterQMax;
                const targetBaseQ = this._mapValue(this.moodConfig.intensity, baseQMin, baseQMax);
                
                console.log(`  -> Base Filter Q: ${targetBaseQ.toFixed(2)}`);
                if (rampTime > 0.01) {
                    this.baseLayer.filter.Q.setTargetAtTime(targetBaseQ, now, timeConstant);
                } else {
                    this.baseLayer.filter.Q.setValueAtTime(targetBaseQ, now);
                }
            }
            
            if (this.washLayer.filter) {
                const washQMin = this.baseSettings.washFilterQMin || this.defaultWaveSettings.washFilterQMin;
                const washQMax = this.baseSettings.washFilterQMax || this.defaultWaveSettings.washFilterQMax;
                const targetWashQ = this._mapValue(this.moodConfig.intensity, washQMin, washQMax);
                
                console.log(`  -> Wash Filter Q: ${targetWashQ.toFixed(2)}`);
                if (rampTime > 0.01) {
                    this.washLayer.filter.Q.setTargetAtTime(targetWashQ, now, timeConstant);
                } else {
                    this.washLayer.filter.Q.setValueAtTime(targetWashQ, now);
                }
                
                // Also adjust wash filter frequency with intensity
                const washFreqMin = this.baseSettings.washFilterFreqMin || this.defaultWaveSettings.washFilterFreqMin;
                const washFreqMax = this.baseSettings.washFilterFreqMax || this.defaultWaveSettings.washFilterFreqMax;
                const targetWashFreq = this._mapValue(this.moodConfig.intensity, washFreqMin, washFreqMax);
                
                console.log(`  -> Wash Filter Freq: ${targetWashFreq.toFixed(0)} Hz`);
                if (rampTime > 0.01) {
                    this.washLayer.filter.frequency.setTargetAtTime(targetWashFreq, now, timeConstant);
                } else {
                    this.washLayer.filter.frequency.setValueAtTime(targetWashFreq, now);
                }
            }
            
            // 2. LFO modulation depths (wave intensity)
            const depthMin = this.baseSettings.rhythmLFODepthMin || this.defaultWaveSettings.rhythmLFODepthMin;
            const depthMax = this.baseSettings.rhythmLFODepthMax || this.defaultWaveSettings.rhythmLFODepthMax;
            const targetModDepthFactor = this._mapValue(this.moodConfig.intensity, depthMin, depthMax);
            
            console.log(`  -> Modulation Depth Factor: ${targetModDepthFactor.toFixed(2)}`);
            
            // Find and update rhythm LFO gains (modulation depths)
            this.lfoNodes.forEach(lfoData => {
                if (!lfoData.gain) return;
                
                if (lfoData.description && lfoData.description.includes('Wash Gain')) {
                    // Scale gain modulation by the target depth factor and washGainLevel
                    const baseWashGain = this.baseSettings.washGainLevel || this.defaultWaveSettings.washGainLevel;
                    const targetDepth = targetModDepthFactor * baseWashGain;
                    
                    if (rampTime > 0.01) {
                        lfoData.gain.gain.setTargetAtTime(targetDepth, now, timeConstant);
                    } else {
                        lfoData.gain.gain.setValueAtTime(targetDepth, now);
                    }
                }
                else if (lfoData.description && lfoData.description.includes('Wash Filter')) {
                    // Scale filter modulation by the target depth factor
                    const baseFilterDepth = this.baseSettings.rhythmLFOWashFilterDepth || 
                                            this.defaultWaveSettings.rhythmLFOWashFilterDepth;
                    const targetDepth = baseFilterDepth * targetModDepthFactor;
                    
                    if (rampTime > 0.01) {
                        lfoData.gain.gain.setTargetAtTime(targetDepth, now, timeConstant);
                    } else {
                        lfoData.gain.gain.setValueAtTime(targetDepth, now);
                    }
                }
            });
            
            // Store these values for future reference
            this.settings.currentIntensityFactor = targetModDepthFactor;
        }
    }

    /**
     * Initialize audio nodes, generate noise buffer, and set up the audio graph.
     * @param {AudioContext} audioContext - The shared AudioContext.
     * @param {AudioNode} masterOutputNode - The node to connect the module's output to.
     * @param {object} initialSettings - The moodAudioSettings for the initial mood.
     * @param {string} initialMood - The initial mood key.
     * @param {object} moodConfig - Volume/Occurrence/Intensity configuration (0-100 values)
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
            
            // Store the base settings from data.js
            this.baseSettings = { ...this.defaultWaveSettings, ...initialSettings };
            // Store settings that will be modified by moodConfig
            this.settings = { ...this.baseSettings };
            // Store the specific 0-100 configuration for this mood
            this.moodConfig = { ...this.moodConfig, ...moodConfig };
            this.currentMood = initialMood;

            // --- Generate Noise Buffer ---
            this.noiseBuffer = this._createNoiseBuffer(
                this.settings.noiseBufferSizeSeconds,
                this.settings.noiseType
            );
            if (!this.noiseBuffer) {
                throw new Error("Failed to generate noise buffer.");
            }

            // --- Create Core Nodes ---
            this.outputGain = this.audioContext.createGain();
            this.outputGain.gain.setValueAtTime(0.0001, this.audioContext.currentTime); // Start silent
            this.pannerNode = this.audioContext.createStereoPanner();
            this.pannerNode.pan.setValueAtTime(0, this.audioContext.currentTime); // Start centered

            // --- Create Filter Chain ---
            this._createFilterChain(this.settings); // Creates base and wash filters/gains

            // --- Create LFOs ---
            this._createLFOs(this.settings); // Creates rhythm and pan LFOs/gains

            // --- Apply Initial Mood Config ---
            this._applyMoodConfig(0); // Apply immediately (no transition)

            // --- Connect Audio Graph ---
            // Noise Source (created in play) -> Base Filter -> Base Gain -> Panner
            //                                 -> Wash Filter -> Wash Gain -> Panner
            // Panner -> Output Gain -> Master Output
            // Connections involving noiseSource happen in _recreateNoiseSource()

            if (this.baseLayer.gain && this.pannerNode) {
                this.baseLayer.gain.connect(this.pannerNode);
            } else { throw new Error("Base layer gain or panner node missing."); }

            if (this.washLayer.gain && this.pannerNode) {
                this.washLayer.gain.connect(this.pannerNode);
            } else { throw new Error("Wash layer gain or panner node missing."); }

            this.pannerNode.connect(this.outputGain);
            this.outputGain.connect(this.masterOutput);

            // --- Connect LFOs ---
            this._connectLFOs(); // Connects LFO gain outputs to their targets

            this.isEnabled = true;
            console.log(`${this.MODULE_ID}: Initialization complete. Ready for playback.`);

        } catch (error) {
            console.error(`${this.MODULE_ID}: Initialization failed:`, error);
            if(typeof ToastSystem !== 'undefined') {
                 ToastSystem.notify('error', `Waves sound init failed: ${error.message}`);
            }
            this.dispose(); // Cleanup partial initialization
            this.isEnabled = false; // Ensure state is correct
            // Allow AudioEngine to handle the failure
        }
    }

    /**
     * Update loop hook. Minimal use for subtle, slow parameter drifts if desired.
     * @param {number} time - Current elapsed time (from AudioEngine clock).
     * @param {string} mood - Current mood key.
     * @param {object} visualParams - Parameters from the visual system.
     * @param {object} audioParams - Parameters derived from mood settings.
     * @param {number} deltaTime - Time since last frame.
     */
    update(time, mood, visualParams, audioParams, deltaTime) {
        if (!this.isEnabled || !this.isPlaying || !this.audioContext) return;

        // Example: Very subtle drift in base filter frequency over long periods
        // try {
        //     if (this.baseLayer.filter) {
        //         const baseFreq = this.settings.baseFilterFreq || 250;
        //         const driftFactor = 20; // Max Hz drift
        //         const driftSpeed = 0.005; // Very slow
        //         const drift = Math.sin(time * driftSpeed + this.noiseBufferSizeSeconds) * driftFactor; // Unique offset
        //         const targetFreq = baseFreq + drift;
        //         this.baseLayer.filter.frequency.setTargetAtTime(targetFreq, this.audioContext.currentTime, 1.0); // Slow time constant
        //     }
        // } catch (error) {
        //      console.error(`${this.MODULE_ID}: Error during update loop:`, error);
        // }
    }

    /**
     * Start the noise source and LFOs, apply attack envelope.
     * Creates the noise source node if it doesn't exist.
     * @param {number} startTime - AudioContext time when playback should start.
     */
    play(startTime) {
        if (!this.isEnabled || this.isPlaying) return;
        if (!this.audioContext || !this.noiseBuffer || !this.outputGain) {
            console.error(`${this.MODULE_ID}: Cannot play - critical components missing (context, buffer, gain).`);
            return;
        }
        if (this.audioContext.state === 'closed') {
            console.error(`${this.MODULE_ID}: Cannot play - AudioContext is closed.`);
            return;
        }
        // Handle suspended context
        if (this.audioContext.state === 'suspended') {
             console.warn(`${this.MODULE_ID}: AudioContext suspended. Attempting resume. Playback may be delayed.`);
             this.audioContext.resume().catch(err => console.error(`${this.MODULE_ID}: Error resuming context on play:`, err));
        }

        console.log(`${this.MODULE_ID}: Starting playback at ${startTime.toFixed(3)}`);

        try {
             // --- Create or Recreate Noise Source ---
             this._recreateNoiseSource(); // Handles creation and connection
             if (!this.noiseSource) {
                 throw new Error("Failed to create or connect noise source node.");
             }

            const now = this.audioContext.currentTime;
            const targetStartTime = Math.max(now, startTime); // Ensure start time is not in the past

            // --- Start LFOs ---
            this.lfoNodes.forEach(lfoData => {
                if (lfoData.lfo && lfoData.lfo.start) {
                    try {
                        lfoData.lfo.start(targetStartTime);
                    } catch (e) {
                        if (e.name !== 'InvalidStateError') { // Ignore if already started
                            console.warn(`${this.MODULE_ID}: Error starting LFO (${lfoData.description}):`, e);
                        }
                    }
                }
            });

            // --- Start Noise Source ---
             if (this.noiseSource && this.noiseSource.start) {
                try {
                    this.noiseSource.start(targetStartTime);
                } catch (e) {
                    if (e.name === 'InvalidStateError') {
                        // console.warn(`${this.MODULE_ID}: Noise source likely already started.`);
                    } else {
                        console.error(`${this.MODULE_ID}: Error starting noise source:`, e);
                        throw e; // Re-throw critical error
                    }
                }
             } else {
                 throw new Error("Noise source node is invalid or missing start method.");
             }

            // --- Apply Attack Envelope ---
            const attackTime = this.settings.attackTime || this.defaultWaveSettings.attackTime;
            // Get volume from settings (after _applyMoodConfig has potentially modified it)
            const targetVolume = this.settings.ambientVolume || this.defaultWaveSettings.ambientVolume;
            const timeConstant = attackTime / 3.0; // Time constant for smoother exponential ramp-up

            if (typeof this.outputGain.gain.cancelAndHoldAtTime === 'function') {
                this.outputGain.gain.cancelAndHoldAtTime(targetStartTime);
            } else {
                this.outputGain.gain.cancelScheduledValues(targetStartTime);
            }
            this.outputGain.gain.setValueAtTime(0.0001, targetStartTime); // Start from near silence
            // Use setTargetAtTime for a potentially smoother/more natural attack than linear ramp
            this.outputGain.gain.setTargetAtTime(targetVolume, targetStartTime, timeConstant);

            this.isPlaying = true;

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during play():`, error);
            this.isPlaying = false; // Ensure state is correct on error
            this._stopAndClearNoiseSource(); // Attempt cleanup
            if (typeof ToastSystem !== 'undefined') {
                 ToastSystem.notify('error', `Waves sound play failed: ${error.message}`);
            }
        }
    }

    /**
     * Stop playback by applying a release envelope to the output gain.
     * @param {number} stopTime - AudioContext time when the release should start.
     * @param {number} [fadeDuration=0.5] - Suggested duration (overridden by releaseTime).
     */
    stop(stopTime, fadeDuration = 0.5) { // fadeDuration is less relevant here
        if (!this.isEnabled || !this.isPlaying) return;
        if (!this.audioContext || !this.outputGain) {
            console.error(`${this.MODULE_ID}: Cannot stop - context or output gain missing.`);
            return;
        }
        if (this.audioContext.state === 'closed') {
            console.error(`${this.MODULE_ID}: Cannot stop - AudioContext is closed.`);
            return;
        }

        console.log(`${this.MODULE_ID}: Stopping playback at ${stopTime.toFixed(3)}`);

        try {
            const now = this.audioContext.currentTime;
            const targetStopTime = Math.max(now, stopTime); // Ensure stop time is not in the past

            // --- Apply Release Envelope ---
            const releaseTime = this.settings.releaseTime || this.defaultWaveSettings.releaseTime;
            const timeConstant = releaseTime / 3.0; // Exponential decay time constant

            if (typeof this.outputGain.gain.cancelAndHoldAtTime === 'function') {
                this.outputGain.gain.cancelAndHoldAtTime(targetStopTime);
            } else {
                this.outputGain.gain.cancelScheduledValues(targetStopTime);
            }
            // Start decay from current value to prevent jumps
            const currentGain = this.outputGain.gain.value;
            this.outputGain.gain.setValueAtTime(currentGain, targetStopTime);
            // Exponential decay to silence
            this.outputGain.gain.setTargetAtTime(0.0001, targetStopTime, timeConstant);

            // --- Schedule LFO Stop ---
            // Stop LFOs slightly after the release envelope finishes
            const scheduleLFOStopTime = targetStopTime + releaseTime + 0.2;
             this.lfoNodes.forEach(lfoData => {
                 if (lfoData.lfo && lfoData.lfo.stop) {
                     try {
                         lfoData.lfo.stop(scheduleLFOStopTime);
                     } catch (e) { /* Ignore InvalidStateError if already stopped */ }
                 }
             });

            // --- Noise Source ---
            // Do NOT stop the noiseSource here. It will be stopped and recreated by the next play().

            this.isPlaying = false; // Set state immediately

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during stop():`, error);
            this.isPlaying = false; // Ensure state is reset
             if (typeof ToastSystem !== 'undefined') {
                 ToastSystem.notify('error', `Waves sound stop failed: ${error.message}`);
             }
        }
    }

    /**
     * Smoothly transition parameters to match a new mood's settings.
     * @param {string} newMood - The key of the new mood.
     * @param {object} newSettings - The moodAudioSettings for the new mood.
     * @param {number} transitionTime - Duration for the transition in seconds.
     * @param {object} moodConfig - Volume/Occurrence/Intensity configuration (0-100 values)
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
            // Store the base settings from data.js
            this.baseSettings = { ...this.defaultWaveSettings, ...newSettings };
            // Merge new settings with defaults (preserving modified values)
            this.settings = { ...this.defaultWaveSettings, ...newSettings };
            // Store the specific 0-100 configuration for this mood
            this.moodConfig = { ...this.moodConfig, ...moodConfig };
            this.currentMood = newMood;

            // --- Apply New Mood Config with Transition ---
            this._applyMoodConfig(transitionTime);

            const now = this.audioContext.currentTime;
            // Use a significant portion of transition time for smooth ramps
            const rampTime = Math.max(0.1, transitionTime * 0.7);
            const shortRampTime = rampTime / 2.0; // Faster ramp for volume/gain levels

            // --- Update Base Filter Frequency (not handled by _applyMoodConfig) ---
            const freqRand = 1.0 + (Math.random() - 0.5) * 2.0 * (this.settings.filterFreqRandomness || 0);
            if (this.baseLayer.filter) {
                this.baseLayer.filter.frequency.setTargetAtTime(this.settings.baseFilterFreq * freqRand, now, rampTime);
            }

            // --- Update Base Gain Levels (separate from LFO modulation depths) ---
            if (this.baseLayer.gain) {
                this.baseLayer.gain.gain.setTargetAtTime(this.settings.baseGainLevel, now, shortRampTime);
            }
            
            // Base wash gain level (the LFO modulates around this)
            if (this.washLayer.gain && !this.isPlaying) {
                // Only directly set if not playing (otherwise let LFO handle it)
                this.washLayer.gain.gain.setTargetAtTime(this.settings.washGainLevel * 0.1, now, shortRampTime);
            }

            // --- Update Pan LFO Parameters ---
            const lfoRateRand = 1.0 + (Math.random() - 0.5) * 2.0 * (this.settings.lfoRateRandomness || 0);
            this.lfoNodes.forEach(lfoData => {
                if (!lfoData || !lfoData.lfo || !lfoData.gain) return;

                // Update pan LFO separately (not handled by _applyMoodConfig)
                if (lfoData.description === 'pan') {
                    const targetRate = this.settings.panLFORate * lfoRateRand;
                    const targetDepth = this.settings.panLFODepth;
                    
                    lfoData.lfo.frequency.setTargetAtTime(targetRate, now, rampTime);
                    lfoData.gain.gain.setTargetAtTime(targetDepth, now, rampTime);
                }
            });

            // Envelope times (attack/release) are updated in settings for next play/stop.

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during changeMood():`, error);
             if (typeof ToastSystem !== 'undefined') {
                 ToastSystem.notify('error', `Waves sound mood change failed: ${error.message}`);
             }
        }
    }

    /**
     * Clean up all audio resources created by this module.
     */
    dispose() {
        console.log(`${this.MODULE_ID}: Disposing...`);
        if (!this.isEnabled && !this.outputGain) {
             console.log(`${this.MODULE_ID}: Already disposed or not initialized.`);
             return; // Avoid redundant disposal
        }
        this.isEnabled = false;
        this.isPlaying = false;

        try {
            // 1. Stop and disconnect the noise source node
            this._stopAndClearNoiseSource();

            // 2. Disconnect and clear LFOs
            this._disconnectAndClearLFOs();

            // 3. Disconnect and clear Filters and Gains
            this._disconnectAndClearFilters();

            // 4. Disconnect Panner and Output Gain
            if (this.pannerNode) try { this.pannerNode.disconnect(); } catch(e){}
            if (this.outputGain) try { this.outputGain.disconnect(); } catch(e){}

        } catch (error) {
             console.error(`${this.MODULE_ID}: Error during node disconnection phase:`, error);
        } finally {
            // 5. Nullify all references to allow garbage collection
            this.outputGain = null;
            this.noiseSource = null;
            this.noiseBuffer = null; // Allow GC to collect the large buffer
            this.baseLayer = { filter: null, gain: null };
            this.washLayer = { filter: null, gain: null };
            this.pannerNode = null;
            this.lfoNodes = [];
            this.audioContext = null;
            this.masterOutput = null;
            this.settings = null;
            this.baseSettings = null;
            console.log(`${this.MODULE_ID}: Disposal complete.`);
        }
    }

    // --- Internal Helper Methods ---

    /**
     * Creates the filter chain (base lowpass, wash filter) and associated gain nodes.
     * @param {object} settings - The current module settings.
     * @private
     */
    _createFilterChain(settings) {
        if (!this.audioContext) {
             console.error(`${this.MODULE_ID}: AudioContext missing, cannot create filter chain.`);
             return;
        }
        console.debug(`${this.MODULE_ID}: Creating filter chain...`);
        const freqRandFactor = 1.0 + (Math.random() - 0.5) * 2.0 * (settings.filterFreqRandomness || 0);

        // --- Base Layer ---
        try {
            this.baseLayer.filter = this.audioContext.createBiquadFilter();
            this.baseLayer.filter.type = 'lowpass';
            this.baseLayer.filter.frequency.setValueAtTime(settings.baseFilterFreq * freqRandFactor, this.audioContext.currentTime);
            this.baseLayer.filter.Q.setValueAtTime(settings.baseFilterQ, this.audioContext.currentTime);

            this.baseLayer.gain = this.audioContext.createGain();
            this.baseLayer.gain.gain.setValueAtTime(settings.baseGainLevel, this.audioContext.currentTime);

            // Connect filter to gain
            this.baseLayer.filter.connect(this.baseLayer.gain);
        } catch (error) {
            console.error(`${this.MODULE_ID}: Failed to create base layer filter/gain:`, error);
            this.baseLayer = { filter: null, gain: null }; // Reset on error
        }

        // --- Wash Layer ---
        try {
            this.washLayer.filter = this.audioContext.createBiquadFilter();
            this.washLayer.filter.type = settings.washFilterType || 'bandpass';
            const washFreq = (settings.washFilterFreqBase + Math.random() * settings.washFilterFreqRange) * freqRandFactor;
            const washQ = settings.washFilterQBase + Math.random() * settings.washFilterQRange;
            this.washLayer.filter.frequency.setValueAtTime(Math.max(20, washFreq), this.audioContext.currentTime); // Clamp freq > 0
            this.washLayer.filter.Q.setValueAtTime(Math.max(0.0001, washQ), this.audioContext.currentTime); // Clamp Q > 0

            this.washLayer.gain = this.audioContext.createGain();
            // Start wash gain lower, let LFO bring it up rhythmically
            this.washLayer.gain.gain.setValueAtTime(settings.washGainLevel * 0.1, this.audioContext.currentTime);

            // Connect filter to gain
            this.washLayer.filter.connect(this.washLayer.gain);
        } catch (error) {
             console.error(`${this.MODULE_ID}: Failed to create wash layer filter/gain:`, error);
             this.washLayer = { filter: null, gain: null }; // Reset on error
        }
    }

     /**
     * Creates LFO nodes (Oscillator + Gain) for rhythm and panning.
     * Adds new LFOs to the existing this.lfoNodes array.
     * @param {object} settings - The current module settings.
     * @private
     */
     _createLFOs(settings) {
         if (!this.audioContext || !this.washLayer.gain || !this.washLayer.filter || !this.pannerNode) {
              console.error(`${this.MODULE_ID}: Cannot create LFOs - context or target nodes missing.`);
              return;
         }
         console.debug(`${this.MODULE_ID}: Creating LFOs...`);
         this.lfoNodes = []; // Clear previous
         const rateRandFactor = 1.0 + (Math.random() - 0.5) * 2.0 * (settings.lfoRateRandomness || 0);

         try {
             // --- Rhythm LFO (modulates Wash Gain & Filter Freq) ---
             const rhythmRate = (settings.rhythmLFORateBase + Math.random() * settings.rhythmLFORateRange) * rateRandFactor;
             const rhythmPhase = Math.random() * Math.PI * 2;

             // LFO for Wash Gain
             const rhythmGainLFO = this.audioContext.createOscillator();
             rhythmGainLFO.type = 'sine';
             rhythmGainLFO.frequency.setValueAtTime(Math.max(0.01, rhythmRate), this.audioContext.currentTime);
             rhythmGainLFO.phase = rhythmPhase;
             const rhythmGainDepth = this.audioContext.createGain();
             rhythmGainDepth.gain.setValueAtTime(settings.rhythmLFOWashGainDepth * settings.washGainLevel, this.audioContext.currentTime); // Modulate relative to max gain
             this.lfoNodes.push({ lfo: rhythmGainLFO, gain: rhythmGainDepth, target: this.washLayer.gain.gain, description: 'rhythm (Wash Gain)' });

             // LFO for Wash Filter Freq (can use the same oscillator, different gain for depth)
             const rhythmFilterLFO = rhythmGainLFO; // Reuse oscillator
             const rhythmFilterDepth = this.audioContext.createGain();
             rhythmFilterDepth.gain.setValueAtTime(settings.rhythmLFOWashFilterDepth, this.audioContext.currentTime);
             this.lfoNodes.push({ lfo: rhythmFilterLFO, gain: rhythmFilterDepth, target: this.washLayer.filter.frequency, description: 'rhythm (Wash Filter)' });

             // --- Panning LFO ---
             const panRate = settings.panLFORate * rateRandFactor;
             const panPhase = Math.random() * Math.PI * 2;
             const panLFO = this.audioContext.createOscillator();
             panLFO.type = 'sine';
             panLFO.frequency.setValueAtTime(Math.max(0.005, panRate), this.audioContext.currentTime); // Ensure > 0
             panLFO.phase = panPhase;
             const panDepth = this.audioContext.createGain();
             panDepth.gain.setValueAtTime(settings.panLFODepth, this.audioContext.currentTime);
             this.lfoNodes.push({ lfo: panLFO, gain: panDepth, target: this.pannerNode.pan, description: 'pan' });

             console.debug(`${this.MODULE_ID}: Created ${this.lfoNodes.length} LFO circuits.`);

         } catch (error) {
              console.error(`${this.MODULE_ID}: Error creating LFOs:`, error);
              this._disconnectAndClearLFOs(); // Attempt cleanup of partially created LFOs
         }
     }

     /**
      * Connects all LFO gain outputs in the lfoNodes array to their target AudioParams.
      * @private
      */
      _connectLFOs() {
          console.debug(`${this.MODULE_ID}: Connecting ${this.lfoNodes.length} LFOs...`);
          this.lfoNodes.forEach((lfoData, index) => {
              if (lfoData.lfo && lfoData.gain && lfoData.target) {
                  try {
                       lfoData.lfo.connect(lfoData.gain);
                       lfoData.gain.connect(lfoData.target);
                       // console.debug(` - LFO ${index} (${lfoData.description}) connected to target.`);
                  } catch (error) {
                       console.error(`${this.MODULE_ID}: Error connecting LFO #${index} (${lfoData.description}) to target: `, lfoData.target, error);
                       try { lfoData.lfo.disconnect(); } catch(e){}
                       try { lfoData.gain.disconnect(); } catch(e){}
                  }
              } else {
                   console.warn(`${this.MODULE_ID}: Skipping connection for incomplete LFO data at index ${index}.`);
              }
          });
      }

      /**
       * Stops and disconnects the current noise source node safely.
       * @private
       */
      _stopAndClearNoiseSource() {
           if (this.noiseSource) {
                try {
                    if (typeof this.noiseSource.stop === 'function') {
                        this.noiseSource.stop(0); // Stop immediately
                    }
                } catch (e) {
                    if (e.name !== 'InvalidStateError') {
                         console.warn(`${this.MODULE_ID}: Error stopping noise source:`, e);
                    }
                }
                try {
                    this.noiseSource.disconnect();
                } catch (e) {
                    // console.warn(`${this.MODULE_ID}: Error disconnecting noise source (might already be disconnected):`, e);
                }
                this.noiseSource = null;
                // console.debug(`${this.MODULE_ID}: Noise source stopped and cleared.`);
           }
      }

       /**
        * Disconnects and clears filter nodes and their associated gain nodes.
        * @private
        */
      _disconnectAndClearFilters() {
           // console.debug(`${this.MODULE_ID}: Disconnecting and clearing filters and layer gains.`);
           try {
                if (this.baseLayer.gain) this.baseLayer.gain.disconnect();
                if (this.baseLayer.filter) this.baseLayer.filter.disconnect();
                if (this.washLayer.gain) this.washLayer.gain.disconnect();
                if (this.washLayer.filter) this.washLayer.filter.disconnect();
           } catch (e) {
                console.warn(`${this.MODULE_ID}: Error disconnecting filters/gains:`, e);
           }
           this.baseLayer = { filter: null, gain: null };
           this.washLayer = { filter: null, gain: null };
      }

      /**
       * Stops, disconnects, and clears all LFO nodes.
       * @private
       */
      _disconnectAndClearLFOs() {
           // console.debug(`${this.MODULE_ID}: Disconnecting and clearing ${this.lfoNodes.length} LFOs.`);
           this.lfoNodes.forEach((lfoData, index) => {
               try {
                    if (lfoData.lfo) {
                         try { if (lfoData.lfo.stop) lfoData.lfo.stop(0); } catch(e) {}
                         lfoData.lfo.disconnect();
                    }
                    if (lfoData.gain) {
                         lfoData.gain.disconnect();
                    }
               } catch (e) {
                    console.warn(`${this.MODULE_ID}: Error disconnecting LFO #${index} (${lfoData.description}):`, e);
               }
           });
           this.lfoNodes = []; // Clear the array
      }

    /**
     * Creates or recreates the BufferSourceNode for the noise loop.
     * Connects the source to the filter chain inputs.
     * @private
     */
     _recreateNoiseSource() {
         if (!this.audioContext || !this.noiseBuffer) {
              console.error(`${this.MODULE_ID}: Cannot recreate noise source - context or buffer missing.`);
              return;
         }
         // Ensure previous source is stopped and disconnected
         this._stopAndClearNoiseSource();

         try {
             this.noiseSource = this.audioContext.createBufferSource();
             this.noiseSource.buffer = this.noiseBuffer;
             this.noiseSource.loop = true;

             // Connect source to both filter inputs
             let connectedBase = false;
             let connectedWash = false;
             if (this.baseLayer.filter) {
                 try { this.noiseSource.connect(this.baseLayer.filter); connectedBase = true; }
                 catch(e) { console.error(`${this.MODULE_ID}: Error connecting noise to base filter:`, e); }
             }
             if (this.washLayer.filter) {
                 try { this.noiseSource.connect(this.washLayer.filter); connectedWash = true; }
                 catch(e) { console.error(`${this.MODULE_ID}: Error connecting noise to wash filter:`, e); }
             }

             if (!connectedBase && !connectedWash) {
                  throw new Error("No valid filter inputs found to connect noise source to.");
             }
             console.debug(`${this.MODULE_ID}: Noise source recreated and connected (Base: ${connectedBase}, Wash: ${connectedWash}).`);

         } catch (error) {
              console.error(`${this.MODULE_ID}: Failed to recreate or connect noise source node:`, error);
              this.noiseSource = null; // Ensure it's null on failure
              if (typeof ToastSystem !== 'undefined') {
                   ToastSystem.notify('error', `Waves sound source error: ${error.message}`);
              }
         }
     }

    /**
     * Generates a stereo AudioBuffer containing pink or white noise.
     * Includes normalization.
     * @param {number} durationSeconds - The desired buffer duration.
     * @param {'pink' | 'white'} noiseType - The type of noise to generate.
     * @returns {AudioBuffer | null} The generated buffer or null on error.
     * @private
     */
    _createNoiseBuffer(durationSeconds, noiseType = 'pink') {
        if (!this.audioContext) {
             console.error(`${this.MODULE_ID}: AudioContext missing, cannot create noise buffer.`);
             return null;
        }
        const sampleRate = this.audioContext.sampleRate;
        const validDuration = Math.max(1, durationSeconds);
        const frameCount = Math.max(sampleRate, Math.floor(sampleRate * validDuration));
        const channels = 2; // Use stereo for panning later
        let buffer = null;
        console.debug(`${this.MODULE_ID}: Generating ${validDuration.toFixed(1)}s stereo ${noiseType} noise buffer (${frameCount} frames)...`);

        try {
            buffer = this.audioContext.createBuffer(channels, frameCount, sampleRate);
            for (let c = 0; c < channels; c++) {
                const channelData = buffer.getChannelData(c);
                if (noiseType === 'pink') {
                    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
                    for (let i = 0; i < frameCount; i++) {
                        const white = Math.random() * 2 - 1;
                        b0 = 0.99886 * b0 + white * 0.0555179;
                        b1 = 0.99332 * b1 + white * 0.0750759;
                        b2 = 0.96900 * b2 + white * 0.1538520;
                        b3 = 0.86650 * b3 + white * 0.3104856;
                        b4 = 0.55000 * b4 + white * 0.5329522;
                        b5 = -0.7616 * b5 - white * 0.0168980;
                        channelData[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
                        b6 = white * 0.115926;
                        channelData[i] *= 0.11; // Scale down
                    }
                } else { // White Noise
                    for (let i = 0; i < frameCount; i++) {
                        channelData[i] = Math.random() * 2 - 1;
                    }
                }
                // Normalize
                let maxVal = 0;
                for (let i = 0; i < frameCount; i++) maxVal = Math.max(maxVal, Math.abs(channelData[i]));
                if (maxVal > 0.001) {
                     const scaleFactor = 0.95 / maxVal; // Target peak 0.95
                     for (let i = 0; i < frameCount; i++) channelData[i] *= scaleFactor;
                } else { console.warn(`${this.MODULE_ID}: Channel ${c} noise buffer resulted in near silence.`); }
            }
            console.log(`${this.MODULE_ID}: Noise buffer generated successfully.`);
        } catch (error) {
             console.error(`${this.MODULE_ID}: Error generating ${noiseType} noise buffer:`, error);
             if (typeof ToastSystem !== 'undefined') {
                  ToastSystem.notify('error', `Failed to generate wave noise: ${error.message}`);
             }
             return null;
        }
        return buffer;
    }

} // End class AEAmbientWavesCalm

// Make globally accessible for the AudioEngine
window.AEAmbientWavesCalm = AEAmbientWavesCalm;

console.log("ae_ambientWavesCalm.js loaded and AEAmbientWavesCalm class defined.");