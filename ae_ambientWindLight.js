// ae_ambientWindLight.js - Audio Module for Light Breeze Ambience
// Part of the Harmonic Visions project by FatStinkyPanda
// Copyright (c) 2025 FatStinkyPanda - All rights reserved.
// Version: 1.0.0 (Initial High-Quality Implementation)

/**
 * @class AEAmbientWindLight
 * @description Generates a continuous, high-quality, and subtly evolving light breeze sound
 *              using filtered noise synthesis, multiple LFO modulations for natural variation,
 *              and stereo panning. Implements the standard AudioEngine module interface
 *              with comprehensive error handling and optimization.
 */
class AEAmbientWindLight {
    constructor() {
        this.MODULE_ID = 'AEAmbientWindLight'; // For logging and identification
        this.audioContext = null;
        this.masterOutput = null; // Connects to AudioEngine's masterInputGain
        this.settings = null;
        this.currentMood = null;
        this.isEnabled = false;
        this.isPlaying = false;

        // --- Core Audio Nodes ---
        this.outputGain = null;     // Master gain for this module (volume and fades)
        this.noiseSource = null;    // BufferSourceNode playing the generated noise loop
        this.noiseBuffer = null;    // AudioBuffer holding the generated pink noise
        this.mainFilter = null;     // Primary filter shaping the main hiss (likely bandpass or highpass)
        this.resonantFilters = [];  // Array of { filter: BiquadFilterNode, gain: GainNode } for subtle resonances
        this.pannerNode = null;     // StereoPannerNode for spatialization

        // --- LFOs for Modulation ---
        this.lfoNodes = []; // Array storing { lfo: OscillatorNode, gain: GainNode, target: AudioParam | AudioNode, description: string }

        // --- Default Settings Tailored for a Light Breeze ---
        this.defaultWindSettings = {
            ambientVolume: 0.18,    // Very subtle base volume
            noiseBufferSizeSeconds: 18, // Longer buffer for less noticeable looping
            noiseType: 'pink',      // Pink noise sounds more natural for wind
            // Main Filter (Hiss)
            mainFilterType: 'bandpass', // Bandpass often works well for focused hiss
            mainFilterFreq: 3200,   // Hz, higher frequency focus for light breeze hiss
            mainFilterQ: 0.75,      // Lower Q for a broader hiss sound
            mainFilterLFORate: 0.06, // Hz, very slow modulation of the main hiss character
            mainFilterLFODepth: 500, // Hz, subtle frequency shift range
            // Resonant Filters (Subtle Whistles/Leaf Sounds)
            numResonantFilters: 2,  // Keep low for performance and subtlety
            resonantFilterType: 'bandpass',
            resonantFreqBase: 1500, // Hz, lower base for resonant tones
            resonantFreqRange: 1000,// Hz, range for resonant frequencies
            resonantQBase: 2.5,     // Higher Q for more distinct resonance
            resonantQRange: 2.0,
            resonantGainBase: 0.05, // Very low gain for subtlety
            resonantGainRange: 0.08,
            resonantLFORateBase: 0.04,// Hz, very slow LFOs for resonance gain/freq
            resonantLFORateRange: 0.1,
            resonantGainLFODepthFactor: 0.9, // Modulate gain almost fully (0 to baseGain*factor)
            resonantFreqLFODepth: 150, // Hz, subtle frequency modulation for resonance
            // Panning LFO
            panLFORate: 0.02,       // Hz, extremely slow panning
            panLFODepth: 0.55,      // Max pan excursion (-0.55 to 0.55), fairly wide but slow movement
            // Envelope
            attackTime: 6.0,        // Very slow fade-in
            releaseTime: 7.0,       // Very slow fade-out
            // Uniqueness/Variation Parameters
            filterFreqRandomness: 0.1, // +/- 10% random variation on filter freqs at init/mood change
            lfoRateRandomness: 0.2,    // +/- 20% random variation on LFO rates at init/mood change
            lfoPhaseRandomness: true,  // Randomize LFO start phases
        };

        console.log(`${this.MODULE_ID}: Instance created.`);
    }

    // --- Core Module Methods (AudioEngine Interface) ---

    /**
     * Initialize audio nodes, generate noise buffer, and set up the audio graph.
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
            this.settings = { ...this.defaultWindSettings, ...initialSettings };
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
            this._createFilterChain(this.settings); // Creates main and resonant filters/gains

            // --- Create LFOs ---
            this._createLFOs(this.settings); // Creates LFO oscillators and gains for modulation

            // --- Connect Audio Graph ---
            // Noise Source (created in play) -> Main Filter -> Panner (Main Hiss Path)
            //                                 -> Resonant Filter Gains -> Resonant Filters -> Panner (Resonance Paths)
            // Panner -> Output Gain -> Master Output
            // Connections involving noiseSource happen in _recreateNoiseSource()

            if (this.mainFilter && this.pannerNode) {
                this.mainFilter.connect(this.pannerNode); // Connect main hiss path
            } else {
                 // If no main filter (unlikely for wind), log warning but continue if resonant filters exist
                 if(!this.mainFilter) console.warn(`${this.MODULE_ID}: Main filter node missing. Noise will connect directly to resonant filters if they exist.`);
                 if(!this.pannerNode) throw new Error("Panner node is essential and missing.");
            }

            // Connect resonant filter paths
            this.resonantFilters.forEach(resData => {
                if (resData.inputGain && resData.filter && this.pannerNode) {
                    // Noise source connects to inputGain later
                    resData.filter.connect(this.pannerNode); // Connect filter output to panner
                } else {
                    console.warn(`${this.MODULE_ID}: Invalid resonant filter data encountered during connection.`);
                }
            });

            this.pannerNode.connect(this.outputGain);
            this.outputGain.connect(this.masterOutput);

            // --- Connect LFOs ---
            this._connectLFOs(); // Connects LFO gain outputs to their targets

            this.isEnabled = true;
            console.log(`${this.MODULE_ID}: Initialization complete. Ready for playback.`);

        } catch (error) {
            console.error(`${this.MODULE_ID}: Initialization failed:`, error);
            if(typeof ToastSystem !== 'undefined') {
                 ToastSystem.notify('error', `Light Breeze init failed: ${error.message}`);
            }
            this.dispose(); // Cleanup partial initialization
            this.isEnabled = false; // Ensure state is correct
            // Allow AudioEngine to handle the failure
        }
    }

    /**
     * Update loop hook. Used for very subtle, slow parameter drifts (optional).
     * @param {number} time - Current elapsed time (from AudioEngine clock).
     * @param {string} mood - Current mood key.
     * @param {object} visualParams - Parameters from the visual system.
     * @param {object} audioParams - Parameters derived from mood settings.
     * @param {number} deltaTime - Time since last frame.
     */
    update(time, mood, visualParams, audioParams, deltaTime) {
        if (!this.isEnabled || !this.isPlaying || !this.audioContext || !this.mainFilter) return;

        // Example: Very subtle drift in main filter Q over long periods for changing texture
        // try {
        //     const baseQ = this.settings.mainFilterQ || 0.75;
        //     const driftFactor = 0.2; // Max Q drift
        //     const driftSpeed = 0.004; // Very slow
        //     // Unique offset based on buffer size to make drift different per instance/session
        //     const driftOffset = (this.settings.noiseBufferSizeSeconds || 18) * 0.05;
        //     const drift = Math.sin(time * driftSpeed + driftOffset) * driftFactor;
        //     const targetQ = baseQ + drift;
        //     // Use setTargetAtTime for smooth, gradual changes
        //     this.mainFilter.Q.setTargetAtTime(Math.max(0.01, targetQ), this.audioContext.currentTime, 1.5); // Slow time constant, clamp Q > 0
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
             this._recreateNoiseSource(); // Handles creation and connection to filters
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
                        // console.warn(`${this.MODULE_ID}: Noise source likely already started.`); // Common, can be ignored
                    } else {
                        console.error(`${this.MODULE_ID}: Error starting noise source:`, e);
                        throw e; // Re-throw critical error
                    }
                }
             } else {
                 throw new Error("Noise source node is invalid or missing start method.");
             }

            // --- Apply Attack Envelope ---
            const attackTime = this.settings.attackTime || this.defaultWindSettings.attackTime;
            const targetVolume = this.settings.ambientVolume || this.defaultWindSettings.ambientVolume;
            const timeConstant = attackTime / 3.0; // Time constant for exponential ramp

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
                 ToastSystem.notify('error', `Light Breeze play failed: ${error.message}`);
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
            const releaseTime = this.settings.releaseTime || this.defaultWindSettings.releaseTime;
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
                 ToastSystem.notify('error', `Light Breeze stop failed: ${error.message}`);
             }
        }
    }

    /**
     * Smoothly transition parameters to match a new mood's settings.
     * Handles structural changes (number of filters) by recreating the filter chain & LFOs.
     * @param {string} newMood - The key of the new mood.
     * @param {object} newSettings - The moodAudioSettings for the new mood.
     * @param {number} transitionTime - Duration for the transition in seconds.
     */
    changeMood(newMood, newSettings, transitionTime) {
        if (!this.isEnabled) return;
        if (!this.audioContext) {
            console.error(`${this.MODULE_ID}: Cannot change mood, AudioContext is missing.`);
            return;
        }
        if (this.audioContext.state === 'closed') {
           console.error(`${this.MODULE_ID}: Cannot change mood, AudioContext is closed.`);
           return;
        }
        console.log(`${this.MODULE_ID}: Changing mood to '${newMood}' over ${transitionTime.toFixed(2)}s`);

        try {
            // Merge new settings with defaults
            const oldSettings = this.settings;
            this.settings = { ...this.defaultWindSettings, ...newSettings };
            this.currentMood = newMood;

            const now = this.audioContext.currentTime;
            // Use a significant portion of transition time for smooth ramps
            const rampTime = Math.max(0.1, transitionTime * 0.7);
            const shortRampTime = rampTime / 2.0; // Faster ramp for volume/gain levels

            // --- Update Master Volume ---
            if (this.outputGain) {
                const targetVolume = this.isPlaying ? this.settings.ambientVolume : 0.0001;
                this.outputGain.gain.cancelScheduledValues(now);
                this.outputGain.gain.setTargetAtTime(targetVolume, now, shortRampTime);
            }

            // --- Check for Structural Changes ---
            const numResonantFiltersChanged = (this.settings.numResonantFilters || 0) !== (oldSettings.numResonantFilters || 0);
            const mainFilterTypeChanged = this.settings.mainFilterType !== oldSettings.mainFilterType;
            const resonantFilterTypeChanged = this.settings.resonantFilterType !== oldSettings.resonantFilterType;

            if (numResonantFiltersChanged || mainFilterTypeChanged || resonantFilterTypeChanged) {
                // --- Structure Changed: Recreate Filters and LFOs ---
                console.warn(`${this.MODULE_ID}: Filter structure changed. Recreating filter chain and LFOs.`);

                // a. Disconnect old filters and LFOs
                this._disconnectAndClearFilters(); // Disconnects main and resonant filters
                this._disconnectAndClearLFOs(); // Disconnects all LFOs

                // b. Create new filters and LFOs based on new settings
                this._createFilterChain(this.settings); // Creates new filters/gains
                this._createLFOs(this.settings); // Creates all new LFOs

                // c. Reconnect the new filters and LFOs to the audio graph
                if (this.mainFilter && this.pannerNode) this.mainFilter.connect(this.pannerNode);
                this.resonantFilters.forEach(resData => {
                    if (resData.inputGain && resData.filter && this.pannerNode) {
                        resData.filter.connect(this.pannerNode);
                    }
                });
                this._connectLFOs(); // Connect LFOs to their targets

                // d. Reconnect noise source (needs to happen after filters are ready)
                // The source might be running, disconnect it from old targets first
                 if (this.noiseSource) {
                     try { this.noiseSource.disconnect(); } catch(e){} // Disconnect from potentially defunct old filters
                     this._connectNoiseSourceToFilters(); // Reconnect to new filters
                 }

                // e. Restart LFOs if playing
                 if (this.isPlaying) {
                     this.lfoNodes.forEach(lfoData => {
                          if (lfoData.lfo && lfoData.lfo.start) {
                              try { lfoData.lfo.start(now); } catch(e){ /* ignore if already started */ }
                          }
                     });
                 }

            } else {
                // --- Structure Same: Ramp Existing Parameters ---
                console.debug(`${this.MODULE_ID}: Ramping parameters for existing structure.`);
                const freqRand = 1.0 + (Math.random() - 0.5) * 2.0 * (this.settings.filterFreqRandomness || 0);
                const rateRand = 1.0 + (Math.random() - 0.5) * 2.0 * (this.settings.lfoRateRandomness || 0);

                // Ramp Main Filter
                if (this.mainFilter) {
                    this.mainFilter.frequency.setTargetAtTime(this.settings.mainFilterFreq * freqRand, now, rampTime);
                    this.mainFilter.Q.setTargetAtTime(this.settings.mainFilterQ, now, rampTime);
                }

                // Ramp Resonant Filters
                this.resonantFilters.forEach((resData, i) => {
                    if (resData.filter) {
                        const freq = this.settings.resonantFreqBase + Math.random() * this.settings.resonantFreqRange;
                        const q = this.settings.resonantQBase + Math.random() * this.settings.resonantQRange;
                        resData.filter.frequency.setTargetAtTime(freq * freqRand, now, rampTime);
                        resData.filter.Q.setTargetAtTime(q, now, rampTime);
                    }
                    if (resData.inputGain) {
                         const gain = this.settings.resonantGainBase + Math.random() * this.settings.resonantGainRange;
                         resData.inputGain.gain.setTargetAtTime(gain, now, shortRampTime);
                    }
                });

                // Ramp LFOs
                this.lfoNodes.forEach(lfoData => {
                    if (!lfoData || !lfoData.lfo || !lfoData.gain) return;
                    let targetRate = 0, targetDepth = 0;

                    switch(lfoData.description) {
                        case 'mainFilterFreq':
                            targetRate = this.settings.mainFilterLFORate * rateRand;
                            targetDepth = this.settings.mainFilterLFODepth;
                            break;
                        case 'resonantGain':
                            targetRate = (this.settings.resonantLFORateBase + Math.random() * this.settings.resonantLFORateRange) * rateRand;
                            // Find the base gain for the filter this LFO controls
                            const targetFilterIndexGain = this.resonantFilters.findIndex(rf => rf.inputGain?.gain === lfoData.target);
                            if(targetFilterIndexGain !== -1) {
                                const baseGain = this.settings.resonantGainBase + Math.random() * this.settings.resonantGainRange; // Target base gain
                                targetDepth = baseGain * (this.settings.resonantGainLFODepthFactor || 0.9); // Modulate relative to target base gain
                            } else { targetDepth = 0; } // Safety
                            break;
                        case 'resonantFreq':
                             targetRate = (this.settings.resonantLFORateBase + Math.random() * this.settings.resonantLFORateRange) * rateRand;
                             targetDepth = this.settings.resonantFreqLFODepth;
                             break;
                        case 'pan':
                            targetRate = this.settings.panLFORate * rateRand;
                            targetDepth = this.settings.panLFODepth;
                            break;
                    }

                    if (targetRate > 0) lfoData.lfo.frequency.setTargetAtTime(Math.max(0.001, targetRate), now, rampTime); // Ensure > 0
                    if (lfoData.target) lfoData.gain.gain.setTargetAtTime(targetDepth, now, rampTime);
                });
            }

            // Envelope times (attack/release) are updated in settings for next play/stop.

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during changeMood():`, error);
             if (typeof ToastSystem !== 'undefined') {
                 ToastSystem.notify('error', `Light Breeze mood change failed: ${error.message}`);
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
            this.mainFilter = null;
            this.resonantFilters = [];
            this.pannerNode = null;
            this.lfoNodes = [];
            this.audioContext = null;
            this.masterOutput = null;
            this.settings = null;
            console.log(`${this.MODULE_ID}: Disposal complete.`);
        }
    }

    // --- Internal Helper Methods ---

    /**
     * Creates the filter chain (main filter, parallel resonant filters with input gains).
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

        // --- Main Filter ---
        try {
            this.mainFilter = this.audioContext.createBiquadFilter();
            this.mainFilter.type = settings.mainFilterType || 'bandpass';
            this.mainFilter.frequency.setValueAtTime(settings.mainFilterFreq * freqRandFactor, this.audioContext.currentTime);
            this.mainFilter.Q.setValueAtTime(settings.mainFilterQ, this.audioContext.currentTime);
        } catch (error) {
            console.error(`${this.MODULE_ID}: Failed to create main filter:`, error);
            this.mainFilter = null; // Ensure null on failure
        }

        // --- Resonant Filters ---
        this.resonantFilters = []; // Clear previous
        const numResonant = settings.numResonantFilters || 0;
        for (let i = 0; i < numResonant; i++) {
            try {
                const resFilter = this.audioContext.createBiquadFilter();
                resFilter.type = settings.resonantFilterType || 'bandpass';
                const freq = (settings.resonantFreqBase + Math.random() * settings.resonantFreqRange) * freqRandFactor;
                const q = settings.resonantQBase + Math.random() * settings.resonantQRange;
                resFilter.frequency.setValueAtTime(Math.max(20, freq), this.audioContext.currentTime); // Clamp freq > 0
                resFilter.Q.setValueAtTime(Math.max(0.01, q), this.audioContext.currentTime); // Clamp Q > 0

                // Create an input gain node for this parallel resonant path
                const inputGain = this.audioContext.createGain();
                const gainVal = settings.resonantGainBase + Math.random() * settings.resonantGainRange;
                inputGain.gain.setValueAtTime(gainVal, this.audioContext.currentTime);

                // Connect input gain to the filter
                inputGain.connect(resFilter);

                this.resonantFilters.push({ filter: resFilter, inputGain: inputGain });
            } catch (error) {
                 console.error(`${this.MODULE_ID}: Failed to create resonant filter #${i}:`, error);
                 // Continue creating others if possible
            }
        }
        console.debug(`${this.MODULE_ID}: Created filter chain with main filter and ${this.resonantFilters.length} resonant filters.`);
    }

     /**
     * Creates LFO nodes (Oscillator + Gain) for modulating filters and panning.
     * Adds new LFOs to the existing this.lfoNodes array.
     * @param {object} settings - The current module settings.
     * @private
     */
     _createLFOs(settings) {
         if (!this.audioContext) {
              console.error(`${this.MODULE_ID}: AudioContext missing, cannot create LFOs.`);
              return;
         }
         console.debug(`${this.MODULE_ID}: Creating LFOs...`);
         this.lfoNodes = []; // Clear previous LFOs before creating new ones
         const rateRandFactor = 1.0 + (Math.random() - 0.5) * 2.0 * (settings.lfoRateRandomness || 0);
         const usePhaseRand = settings.lfoPhaseRandomness === true;

         try {
             // --- LFO for Main Filter Frequency ---
             if (this.mainFilter && this.mainFilter.frequency) {
                 const lfo = this.audioContext.createOscillator();
                 lfo.type = 'sine';
                 lfo.frequency.setValueAtTime(Math.max(0.01, settings.mainFilterLFORate * rateRandFactor), this.audioContext.currentTime);
                 if (usePhaseRand) lfo.phase = Math.random() * Math.PI * 2;
                 const gain = this.audioContext.createGain();
                 gain.gain.setValueAtTime(settings.mainFilterLFODepth, this.audioContext.currentTime);
                 this.lfoNodes.push({ lfo, gain, target: this.mainFilter.frequency, description: 'mainFilterFreq' });
             }

             // --- LFOs for Resonant Filters (Gain and Frequency) ---
             this.resonantFilters.forEach((resData, i) => {
                 if (resData.inputGain && resData.inputGain.gain) {
                     // LFO for Resonant Gain
                     const gainLFO = this.audioContext.createOscillator();
                     gainLFO.type = 'sine';
                     const gainRate = (settings.resonantLFORateBase + Math.random() * settings.resonantLFORateRange) * rateRandFactor;
                     gainLFO.frequency.setValueAtTime(Math.max(0.01, gainRate), this.audioContext.currentTime);
                     if (usePhaseRand) gainLFO.phase = Math.random() * Math.PI * 2;
                     const gainDepthNode = this.audioContext.createGain();
                     const baseGain = settings.resonantGainBase + Math.random() * settings.resonantGainRange;
                     const gainDepth = baseGain * (settings.resonantGainLFODepthFactor || 0.9);
                     gainDepthNode.gain.setValueAtTime(gainDepth, this.audioContext.currentTime);
                     this.lfoNodes.push({ lfo: gainLFO, gain: gainDepthNode, target: resData.inputGain.gain, description: `resonantGain_${i}` });
                 }
                 if (resData.filter && resData.filter.frequency) {
                      // LFO for Resonant Frequency
                      const freqLFO = this.audioContext.createOscillator();
                      freqLFO.type = 'sine';
                      const freqRate = (settings.resonantLFORateBase + Math.random() * settings.resonantLFORateRange) * rateRandFactor;
                      freqLFO.frequency.setValueAtTime(Math.max(0.01, freqRate), this.audioContext.currentTime);
                      if (usePhaseRand) freqLFO.phase = Math.random() * Math.PI * 2; // Different phase from gain LFO
                      const freqDepthNode = this.audioContext.createGain();
                      freqDepthNode.gain.setValueAtTime(settings.resonantFreqLFODepth, this.audioContext.currentTime);
                      this.lfoNodes.push({ lfo: freqLFO, gain: freqDepthNode, target: resData.filter.frequency, description: `resonantFreq_${i}` });
                 }
             });

             // --- LFO for Panning ---
             if (this.pannerNode && this.pannerNode.pan) {
                 const panLFO = this.audioContext.createOscillator();
                 panLFO.type = 'sine';
                 panLFO.frequency.setValueAtTime(Math.max(0.005, settings.panLFORate * rateRandFactor), this.audioContext.currentTime); // Ensure > 0
                 if (usePhaseRand) panLFO.phase = Math.random() * Math.PI * 2;
                 const panDepth = this.audioContext.createGain();
                 panDepth.gain.setValueAtTime(settings.panLFODepth, this.audioContext.currentTime);
                 this.lfoNodes.push({ lfo: panLFO, gain: panDepth, target: this.pannerNode.pan, description: 'pan' });
             }

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
          if (!this.audioContext) return;
          console.debug(`${this.MODULE_ID}: Connecting ${this.lfoNodes.length} LFOs...`);
          this.lfoNodes.forEach((lfoData, index) => {
              if (lfoData.lfo && lfoData.gain && lfoData.target) {
                  try {
                       lfoData.lfo.connect(lfoData.gain);
                       lfoData.gain.connect(lfoData.target);
                       // console.debug(` - LFO ${index} (${lfoData.description}) connected.`);
                  } catch (error) {
                       console.error(`${this.MODULE_ID}: Error connecting LFO #${index} (${lfoData.description}) to target: `, lfoData.target, error);
                       try { lfoData.lfo.disconnect(); } catch(e){}
                       try { lfoData.gain.disconnect(); } catch(e){}
                  }
              } else {
                   console.warn(`${this.MODULE_ID}: Skipping connection for incomplete LFO data at index ${index}. Target:`, lfoData.target);
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
           console.debug(`${this.MODULE_ID}: Disconnecting and clearing filters.`);
           try {
                if (this.mainFilter) this.mainFilter.disconnect();
                this.resonantFilters.forEach((resData, index) => {
                     try {
                          if (resData.inputGain) resData.inputGain.disconnect(); // Disconnect gain from source & filter
                          if (resData.filter) resData.filter.disconnect(); // Disconnect filter from panner
                     } catch (e) {
                          console.warn(`${this.MODULE_ID}: Error disconnecting resonant filter #${index}:`, e);
                     }
                });
           } catch (e) {
                console.warn(`${this.MODULE_ID}: Error during filter disconnection:`, e);
           }
           this.mainFilter = null;
           this.resonantFilters = [];
      }

      /**
       * Stops, disconnects, and clears all LFO nodes.
       * @private
       */
      _disconnectAndClearLFOs() {
           console.debug(`${this.MODULE_ID}: Disconnecting and clearing ${this.lfoNodes.length} LFOs.`);
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

             this._connectNoiseSourceToFilters(); // Connect to current filter setup
             console.debug(`${this.MODULE_ID}: Noise source recreated and connected.`);

         } catch (error) {
              console.error(`${this.MODULE_ID}: Failed to recreate or connect noise source node:`, error);
              this.noiseSource = null; // Ensure it's null on failure
              if (typeof ToastSystem !== 'undefined') {
                   ToastSystem.notify('error', `Light Breeze source error: ${error.message}`);
              }
         }
     }

     /**
      * Connects the current noiseSource node to the appropriate filter inputs.
      * Separated to be callable after filter recreation during mood change.
      * @private
      */
     _connectNoiseSourceToFilters() {
         if (!this.noiseSource) {
              console.warn(`${this.MODULE_ID}: Cannot connect noise source - node is missing.`);
              return;
         }
         let connectedToSomething = false;
         // Connect source to main filter input if it exists
         if (this.mainFilter) {
             try {
                 this.noiseSource.connect(this.mainFilter);
                 connectedToSomething = true;
                 // console.debug(`${this.MODULE_ID}: Noise source connected to main filter.`);
             } catch (e) {
                 console.error(`${this.MODULE_ID}: Error connecting noise source to main filter:`, e);
             }
         }
         // Connect source to each resonant filter's input gain
         this.resonantFilters.forEach((resData, i) => {
             if (resData.inputGain) {
                 try {
                     this.noiseSource.connect(resData.inputGain);
                     connectedToSomething = true;
                      // console.debug(`${this.MODULE_ID}: Noise source connected to resonant filter gain #${i}.`);
                 } catch (e) {
                      console.error(`${this.MODULE_ID}: Error connecting noise source to resonant filter gain #${i}:`, e);
                 }
             }
         });

         if (!connectedToSomething) {
              console.error(`${this.MODULE_ID}: Noise source created but could not connect to any filter inputs! Sound may be absent.`);
              // As a fallback, connect directly to panner? Less ideal.
              if (this.pannerNode) {
                   console.warn(`${this.MODULE_ID}: Connecting noise source directly to panner as fallback.`);
                   try { this.noiseSource.connect(this.pannerNode); } catch(e){}
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
                    // Pink Noise Generation (Voss-McCartney approximation - slightly improved)
                    let b0=0, b1=0, b2=0, b3=0, b4=0, b5=0, b6=0;
                    for (let i = 0; i < frameCount; i++) {
                        const white = Math.random() * 2 - 1;
                        b0 = 0.99886 * b0 + white * 0.0555179;
                        b1 = 0.99332 * b1 + white * 0.0750759;
                        b2 = 0.96900 * b2 + white * 0.1538520;
                        b3 = 0.86650 * b3 + white * 0.3104856;
                        b4 = 0.55000 * b4 + white * 0.5329522;
                        b5 = -0.7616 * b5 - white * 0.0168980; // Corrected signs slightly based on Paul Kellett's implementation
                        channelData[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
                        b6 = white * 0.115926;
                        channelData[i] *= 0.11; // Scale down during generation
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
                     const scaleFactor = 0.9 / maxVal; // Target peak 0.9 (leave headroom)
                     for (let i = 0; i < frameCount; i++) channelData[i] *= scaleFactor;
                } else { console.warn(`${this.MODULE_ID}: Channel ${c} noise buffer resulted in near silence.`); }
            }
            console.log(`${this.MODULE_ID}: Noise buffer generated successfully.`);
        } catch (error) {
             console.error(`${this.MODULE_ID}: Error generating ${noiseType} noise buffer:`, error);
             if (typeof ToastSystem !== 'undefined') {
                  ToastSystem.notify('error', `Failed to generate breeze noise: ${error.message}`);
             }
             return null;
        }
        return buffer;
    }

} // End class AEAmbientWindLight

// Make globally accessible for the AudioEngine
window.AEAmbientWindLight = AEAmbientWindLight;

console.log("ae_ambientWindLight.js loaded and AEAmbientWindLight class defined.");