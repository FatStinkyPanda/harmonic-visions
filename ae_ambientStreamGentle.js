// ae_ambientStreamGentle.js - Audio Module for Gentle Stream Ambience
// Part of the Harmonic Visions project by FatStinkyPanda
// Copyright (c) 2025 FatStinkyPanda - All rights reserved.
// Version: 2.0.0 (Enhanced Quality, Robustness, Optimization)

/**
 * @class AEAmbientStreamGentle
 * @description Generates a continuous, high-quality, and evolving gentle flowing stream sound
 *              using filtered noise synthesis, LFO modulation, and dynamic parameters.
 *              Implements the standard AudioEngine module interface with comprehensive
 *              error handling and optimization for various devices.
 */
class AEAmbientStreamGentle {
    constructor() {
        this.MODULE_ID = 'AEAmbientStreamGentle'; // For logging and identification
        this.audioContext = null;
        this.masterOutput = null; // Connects to AudioEngine's masterInputGain
        this.settings = null;
        this.currentMood = null;
        this.isEnabled = false;
        this.isPlaying = false;

        // --- Core Audio Nodes ---
        this.outputGain = null;     // Master gain for this module (controls volume and fades)
        this.noiseSource = null;    // BufferSourceNode playing the generated noise loop
        this.noiseBuffer = null;    // AudioBuffer holding the generated pink noise
        this.mainFilter = null;     // Main Low-Pass filter shaping the overall sound
        this.bandPassFilters = [];  // Array of { filter: BiquadFilterNode, inputGain: GainNode } for resonances
        this.pannerNode = null;     // StereoPannerNode for spatialization

        // --- LFOs for Modulation ---
        this.lfoNodes = []; // Array storing { lfo: OscillatorNode, gain: GainNode, target: AudioParam, isPanLFO: boolean }

        // --- Default Settings Tailored for a Gentle Stream ---
        this.defaultStreamSettings = {
            ambientVolume: 0.18,    // Slightly increased default volume, adjust in master mix
            noiseBufferSizeSeconds: 12, // Longer buffer for less noticeable looping
            noiseType: 'pink',      // 'pink' generally sounds more natural for streams than 'white'
            mainFilterFreq: 1350,   // Base cutoff frequency (Hz) for the main water body sound
            mainFilterQ: 0.85,      // Q factor for the main filter
            numBandPassFilters: 4,  // More filters for richer texture
            bandPassFreqBase: 750,  // Hz, starting frequency for bandpass filters
            bandPassFreqRange: 700, // Hz, range over which bandpass center frequencies spread
            bandPassQBase: 3.5,     // Higher Q for more distinct resonances
            bandPassQRange: 2.5,    // Wider range for Q variation
            bandPassGainFactor: 0.6,// Gain multiplier for bandpass filters relative to main path
            lfoRateBase: 0.04,      // Hz, very slow base rate for modulation
            lfoRateRange: 0.12,     // Hz, range for LFO rate variation
            lfoDepthBase: 80,       // Hz, base modulation depth for bandpass frequencies
            lfoDepthRange: 120,     // Hz, range for modulation depth variation
            panLFORate: 0.025,      // Hz, even slower panning LFO for subtle movement
            panLFODepth: 0.35,      // Max pan excursion (-0.35 to 0.35)
            attackTime: 4.0,        // Slower fade-in for smooth introduction
            releaseTime: 4.5,       // Slower fade-out for natural decay
            // Added for subtle variation over time
            filterDriftFactor: 30,  // Max Hz drift for main filter over long periods
            filterDriftSpeed: 0.008,// Speed of the slow filter drift
        };

        console.log(`${this.MODULE_ID}: Instance created.`);
    }

    // --- Core Module Methods (Following AudioEngine Interface) ---

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
            this.settings = { ...this.defaultStreamSettings, ...initialSettings };
            this.currentMood = initialMood;

            // --- Generate Noise Buffer ---
            this.noiseBuffer = this._createNoiseBuffer(
                this.settings.noiseBufferSizeSeconds || 12,
                this.settings.noiseType || 'pink'
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
            this._createFilterChain(this.settings); // Creates main and bandpass filters

            // --- Create LFOs ---
            this._createLFOs(this.settings); // Creates LFO oscillators and gains

             // --- Connect Audio Graph ---
             // Noise Source (created in play) -> Main Filter -> Panner (Dry Path)
             //                              -> BandPass Input Gains -> BandPass Filters -> Panner (Wet Paths)
             // Panner -> Output Gain -> Master Output

             // Connections involving noiseSource happen in _recreateNoiseSource()
             if (this.mainFilter && this.pannerNode) {
                 // Connect main filter directly to panner (base sound)
                 this.mainFilter.connect(this.pannerNode);

                 // Connect main filter output to the input gain of each parallel bandpass path
                 this.bandPassFilters.forEach(bpData => {
                     if (bpData.inputGain && bpData.filter) {
                         this.mainFilter.connect(bpData.inputGain);
                         bpData.filter.connect(this.pannerNode); // Connect filter output to panner
                     } else {
                          console.warn(`${this.MODULE_ID}: Invalid bandpass filter data encountered during connection.`);
                     }
                 });
             } else if (this.pannerNode) {
                  // If no main filter, connect directly (less ideal, noiseSource connects later)
                  console.warn(`${this.MODULE_ID}: Main filter node missing. Noise will connect directly to panner/bandpass inputs.`);
             } else {
                  throw new Error("Cannot connect audio graph: Panner node is missing.");
             }

             this.pannerNode.connect(this.outputGain);
             this.outputGain.connect(this.masterOutput);

             // --- Connect LFOs ---
             this._connectLFOs(); // Connects LFO gain outputs to their targets

            this.isEnabled = true;
            console.log(`${this.MODULE_ID}: Initialization complete. Ready for playback.`);

        } catch (error) {
            console.error(`${this.MODULE_ID}: Initialization failed:`, error);
            if(typeof ToastSystem !== 'undefined') {
                 ToastSystem.notify('error', `Stream sound init failed: ${error.message}`);
            }
            this.dispose(); // Cleanup partial initialization
            this.isEnabled = false; // Ensure state is correct
            // Allow AudioEngine to handle the failure
        }
    }

    /**
     * Update loop hook. Used for subtle, slow parameter drifts.
     * @param {number} time - Current elapsed time (from AudioEngine clock).
     * @param {string} mood - Current mood key.
     * @param {object} visualParams - Parameters from the visual system (e.g., dreaminess).
     * @param {object} audioParams - Parameters derived from mood settings (tempo, scale, etc.).
     * @param {number} deltaTime - Time since last frame.
     */
    update(time, mood, visualParams, audioParams, deltaTime) {
        if (!this.isEnabled || !this.isPlaying || !this.audioContext || !this.mainFilter) return;

        try {
            // --- Subtle Main Filter Frequency Drift ---
            // Use a very slow sine wave based on elapsed time to subtly shift the main filter cutoff
            const baseFreq = this.settings.mainFilterFreq || 1350;
            const driftFactor = this.settings.filterDriftFactor || 30;
            const driftSpeed = this.settings.filterDriftSpeed || 0.008;
            // Add a unique offset based on buffer size to make drift different per instance/session
            const driftOffset = (this.settings.noiseBufferSizeSeconds || 12) * 0.1;
            const drift = Math.sin(time * driftSpeed + driftOffset) * driftFactor;

            const targetFreq = baseFreq + drift;
            // Use setTargetAtTime for smooth, gradual changes
            this.mainFilter.frequency.setTargetAtTime(targetFreq, this.audioContext.currentTime, 0.8); // Slow time constant

        } catch (error) {
             console.error(`${this.MODULE_ID}: Error during update loop:`, error);
             // Avoid spamming logs - maybe disable updates after a few errors?
        }
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
             // Proceed, but sound won't start until context resumes.
        }

        console.log(`${this.MODULE_ID}: Starting playback at ${startTime.toFixed(3)}`);

        try {
             // --- Create or Recreate Noise Source ---
             // BufferSourceNodes cannot be re-started, so create a new one each time play is called after stop.
             this._recreateNoiseSource(); // This handles creation and connection
             if (!this.noiseSource) {
                 throw new Error("Failed to create or connect noise source node.");
             }

            const now = this.audioContext.currentTime;
            const targetStartTime = Math.max(now, startTime); // Ensure start time is not in the past

            // --- Start LFOs ---
            this.lfoNodes.forEach(lfoData => {
                if (lfoData.lfo && lfoData.lfo.start) {
                    try {
                        // Attempt to start. If already started, it might throw InvalidStateError.
                        lfoData.lfo.start(targetStartTime);
                    } catch (e) {
                        if (e.name !== 'InvalidStateError') {
                            console.warn(`${this.MODULE_ID}: Error starting LFO:`, e);
                        }
                        // else: Already started, which is fine.
                    }
                }
            });

            // --- Start Noise Source ---
            // Ensure it hasn't been stopped prematurely elsewhere
             if (this.noiseSource && this.noiseSource.start) {
                try {
                    this.noiseSource.start(targetStartTime);
                } catch (e) {
                    if (e.name === 'InvalidStateError') {
                        console.warn(`${this.MODULE_ID}: Noise source likely already started.`);
                    } else {
                        console.error(`${this.MODULE_ID}: Error starting noise source:`, e);
                        throw e; // Re-throw critical error
                    }
                }
             } else {
                 throw new Error("Noise source node is invalid or missing start method.");
             }


            // --- Apply Attack Envelope ---
            const attackTime = this.settings.attackTime || this.defaultStreamSettings.attackTime;
            const targetVolume = this.settings.ambientVolume || this.defaultStreamSettings.ambientVolume;

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
            this._stopAndClearNoiseSource(); // Attempt cleanup of the noise source
            if (typeof ToastSystem !== 'undefined') {
                 ToastSystem.notify('error', `Stream sound play failed: ${error.message}`);
            }
        }
    }

    /**
     * Stop playback by applying a release envelope to the output gain.
     * Does NOT stop the underlying noise source node immediately.
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
            const releaseTime = this.settings.releaseTime || this.defaultStreamSettings.releaseTime;
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

            // --- Schedule LFO Stop ---
            // Stop LFOs slightly after the release envelope finishes to avoid abrupt modulation cutoff.
            const scheduleLFOStopTime = targetStopTime + releaseTime + 0.2; // Add buffer
             this.lfoNodes.forEach(lfoData => {
                 if (lfoData.lfo && lfoData.lfo.stop) {
                     try {
                         lfoData.lfo.stop(scheduleLFOStopTime);
                     } catch (e) { /* Ignore InvalidStateError if already stopped */ }
                 }
             });

            // --- Crucially, do NOT stop the noiseSource here ---
            // It will be stopped and recreated by the next call to play().
            // This allows for seamless restarts without gaps or clicks.

            this.isPlaying = false; // Set state immediately

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during stop():`, error);
            // Ensure state is reset even on error
            this.isPlaying = false;
             if (typeof ToastSystem !== 'undefined') {
                 ToastSystem.notify('error', `Stream sound stop failed: ${error.message}`);
             }
        }
    }

    /**
     * Smoothly transition parameters to match a new mood's settings.
     * Handles structural changes (number of filters) by recreating the filter chain.
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
            this.settings = { ...this.defaultStreamSettings, ...newSettings };
            this.currentMood = newMood;

            const now = this.audioContext.currentTime;
            // Use a significant portion of transition time for smooth ramps
            const rampTime = Math.max(0.1, transitionTime * 0.7);
            const shortRampTime = rampTime / 3.0; // Faster ramp for volume

            // --- Update Module Parameters ---

            // 1. Overall Volume
            if (this.outputGain) {
                const targetVolume = this.isPlaying ? this.settings.ambientVolume : 0.0001;
                this.outputGain.gain.cancelScheduledValues(now);
                this.outputGain.gain.setTargetAtTime(targetVolume, now, shortRampTime);
            }

            // 2. Main Filter
            if (this.mainFilter) {
                this.mainFilter.frequency.setTargetAtTime(this.settings.mainFilterFreq, now, rampTime);
                this.mainFilter.Q.setTargetAtTime(this.settings.mainFilterQ, now, rampTime);
            }

            // 3. Panning LFO
            const panLFOData = this.lfoNodes.find(l => l.isPanLFO);
            if (panLFOData && panLFOData.lfo && panLFOData.gain) {
                 panLFOData.lfo.frequency.setTargetAtTime(this.settings.panLFORate, now, rampTime);
                 panLFOData.gain.gain.setTargetAtTime(this.settings.panLFODepth, now, rampTime);
            }

            // 4. BandPass Filters & Associated LFOs
            const numBPs = this.settings.numBandPassFilters || 0;
            if (numBPs !== this.bandPassFilters.length) {
                // --- Structure Changed: Recreate Filters and LFOs ---
                console.warn(`${this.MODULE_ID}: Number of bandpass filters changed (${this.bandPassFilters.length} -> ${numBPs}). Recreating filter chain and LFOs.`);

                // a. Disconnect old BPs and their LFOs
                this._disconnectAndClearBandpassFilters(); // Disconnects filters from panner/mainFilter
                // Find and disconnect only the LFOs targeting the old bandpass filters
                 const bpLFOs = this.lfoNodes.filter(l => !l.isPanLFO);
                 bpLFOs.forEach(lfoData => {
                      if (lfoData.lfo) try { if(lfoData.lfo.stop) lfoData.lfo.stop(0); lfoData.lfo.disconnect(); } catch(e){}
                      if (lfoData.gain) try { lfoData.gain.disconnect(); } catch(e){}
                 });
                 // Remove them from the main LFO array (keep panning LFO)
                 this.lfoNodes = this.lfoNodes.filter(l => l.isPanLFO);

                // b. Create new filters and LFOs based on new settings
                this._createFilterChain(this.settings); // Creates new bandpass filters/gains
                this._createLFOs(this.settings); // Creates only *new* LFOs for the new filters

                // c. Reconnect the new filters and LFOs
                 if (this.mainFilter && this.pannerNode) {
                      this.bandPassFilters.forEach(bpData => {
                          if (bpData.inputGain && bpData.filter) {
                               this.mainFilter.connect(bpData.inputGain);
                               bpData.filter.connect(this.pannerNode);
                          }
                      });
                 }
                this._connectLFOs(); // Connects *all* LFOs currently in the array

                // d. Restart LFOs if playing
                 if (this.isPlaying) {
                     this.lfoNodes.forEach(lfoData => {
                          if (lfoData.lfo && lfoData.lfo.start) {
                              try { lfoData.lfo.start(now); } catch(e){ /* ignore if already started */ }
                          }
                     });
                 }

            } else {
                // --- Structure Same: Ramp Existing Parameters ---
                // Ramp existing BandPass filter parameters
                this.bandPassFilters.forEach((bpData, i) => {
                    if (bpData.filter) {
                        // Recalculate target params with randomness for variety
                        const freq = this.settings.bandPassFreqBase + Math.random() * this.settings.bandPassFreqRange;
                        const q = this.settings.bandPassQBase + Math.random() * this.settings.bandPassQRange;
                        bpData.filter.frequency.setTargetAtTime(freq, now, rampTime);
                        bpData.filter.Q.setTargetAtTime(q, now, rampTime);
                    }
                     // Optionally ramp inputGain if needed
                     // if (bpData.inputGain) {
                     //     const targetGain = (this.settings.bandPassGainFactor || 0.6) / Math.max(1, numBPs);
                     //     bpData.inputGain.gain.setTargetAtTime(targetGain, now, rampTime);
                     // }
                });

                // Ramp existing BandPass LFO parameters (excluding pan LFO)
                this.lfoNodes.forEach((lfoData, i) => {
                    if (!lfoData.isPanLFO && lfoData.lfo && lfoData.gain) {
                        // Recalculate target params with randomness
                        const rate = this.settings.lfoRateBase + Math.random() * this.settings.lfoRateRange;
                        const depth = this.settings.lfoDepthBase + Math.random() * this.settings.lfoDepthRange;
                        lfoData.lfo.frequency.setTargetAtTime(rate, now, rampTime);
                        lfoData.gain.gain.setTargetAtTime(depth, now, rampTime);
                    }
                });
            }

            // Envelope times (attack/release) are updated in settings and will apply on the next play/stop cycle.

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during changeMood():`, error);
             if (typeof ToastSystem !== 'undefined') {
                 ToastSystem.notify('error', `Stream sound mood change failed: ${error.message}`);
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

            // 3. Disconnect and clear Filters
            this._disconnectAndClearBandpassFilters();
            if (this.mainFilter) try { this.mainFilter.disconnect(); } catch(e){}

            // 4. Disconnect Panner and Output Gain
            if (this.pannerNode) try { this.pannerNode.disconnect(); } catch(e){}
            if (this.outputGain) try { this.outputGain.disconnect(); } catch(e){}

        } catch (error) {
             // Log any unexpected error during the disconnection phase
             console.error(`${this.MODULE_ID}: Error during node disconnection phase:`, error);
        } finally {
            // 5. Nullify all references to allow garbage collection
            this.outputGain = null;
            this.noiseSource = null;
            this.noiseBuffer = null; // Allow GC to collect the large buffer
            this.mainFilter = null;
            this.bandPassFilters = [];
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
     * Creates the filter chain (main lowpass, parallel bandpass with input gains).
     * @param {object} settings - The current module settings.
     * @private
     */
    _createFilterChain(settings) {
        if (!this.audioContext) {
             console.error(`${this.MODULE_ID}: AudioContext missing, cannot create filter chain.`);
             return;
        }

        // --- 1. Main Low-Pass Filter ---
        try {
            this.mainFilter = this.audioContext.createBiquadFilter();
            this.mainFilter.type = 'lowpass';
            this.mainFilter.frequency.setValueAtTime(settings.mainFilterFreq, this.audioContext.currentTime);
            this.mainFilter.Q.setValueAtTime(settings.mainFilterQ, this.audioContext.currentTime);
        } catch (error) {
            console.error(`${this.MODULE_ID}: Failed to create main filter:`, error);
            this.mainFilter = null; // Ensure it's null on failure
            return; // Cannot proceed without main filter usually
        }

        // --- 2. Parallel Band-Pass Filters ---
        this.bandPassFilters = []; // Clear previous
        const numBPs = settings.numBandPassFilters || 0;
        const baseGain = (settings.bandPassGainFactor || 0.6) / Math.max(1, numBPs); // Normalize gain

        for (let i = 0; i < numBPs; i++) {
            try {
                const bpFilter = this.audioContext.createBiquadFilter();
                bpFilter.type = 'bandpass';
                // Distribute frequencies and Q with randomness for uniqueness
                const freq = settings.bandPassFreqBase + Math.random() * settings.bandPassFreqRange;
                const q = settings.bandPassQBase + Math.random() * settings.bandPassQRange;
                bpFilter.frequency.setValueAtTime(Math.max(20, freq), this.audioContext.currentTime); // Ensure freq > 0
                bpFilter.Q.setValueAtTime(Math.max(0.0001, q), this.audioContext.currentTime); // Ensure Q > 0

                // Create an input gain node for this parallel path
                const inputGain = this.audioContext.createGain();
                inputGain.gain.setValueAtTime(baseGain, this.audioContext.currentTime);

                this.bandPassFilters.push({ filter: bpFilter, inputGain: inputGain });
            } catch (error) {
                 console.error(`${this.MODULE_ID}: Failed to create bandpass filter #${i}:`, error);
                 // Continue creating others if possible
            }
        }
        console.debug(`${this.MODULE_ID}: Created filter chain with main filter and ${this.bandPassFilters.length} bandpass filters.`);
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
         // Note: This function *adds* LFOs, assuming previous relevant ones might have been cleared.

         try {
             // --- LFOs for BandPass Filters ---
             this.bandPassFilters.forEach((bpData, i) => {
                 if (!bpData.filter || !bpData.filter.frequency) {
                      console.warn(`${this.MODULE_ID}: Skipping LFO creation for invalid bandpass filter data.`);
                      return;
                 }
                 const lfo = this.audioContext.createOscillator();
                 lfo.type = 'sine';
                 const rate = settings.lfoRateBase + Math.random() * settings.lfoRateRange;
                 lfo.frequency.setValueAtTime(Math.max(0.01, rate), this.audioContext.currentTime); // Ensure rate > 0
                 lfo.phase = Math.random() * Math.PI * 2; // Random start phase

                 const gain = this.audioContext.createGain();
                 const depth = settings.lfoDepthBase + Math.random() * settings.lfoDepthRange;
                 gain.gain.setValueAtTime(depth, this.audioContext.currentTime);

                 this.lfoNodes.push({ lfo, gain, target: bpData.filter.frequency, isPanLFO: false });
             });

             // --- LFO for Panning ---
             // Only create if it doesn't exist already (e.g., during init or full recreate)
             if (this.pannerNode?.pan && !this.lfoNodes.some(l => l.isPanLFO)) {
                 const panLFO = this.audioContext.createOscillator();
                 panLFO.type = 'sine';
                 panLFO.frequency.setValueAtTime(settings.panLFORate, this.audioContext.currentTime);
                 panLFO.phase = Math.random() * Math.PI * 2;

                 const panGain = this.audioContext.createGain();
                 panGain.gain.setValueAtTime(settings.panLFODepth, this.audioContext.currentTime);

                 this.lfoNodes.push({ lfo: panLFO, gain: panGain, target: this.pannerNode.pan, isPanLFO: true });
             }
             console.debug(`${this.MODULE_ID}: Created/updated LFO nodes. Total LFOs: ${this.lfoNodes.length}`);

         } catch (error) {
              console.error(`${this.MODULE_ID}: Error creating LFOs:`, error);
              // Attempt cleanup of partially created LFOs? Difficult without tracking specifics here.
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
                       // console.debug(` - LFO ${index} connected to target:`, lfoData.target);
                  } catch (error) {
                       console.error(`${this.MODULE_ID}: Error connecting LFO #${index} to target: `, lfoData.target, error);
                       // Attempt to disconnect partially connected nodes
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
                    // Check if stop method exists before calling
                    if (typeof this.noiseSource.stop === 'function') {
                        this.noiseSource.stop(0); // Stop immediately
                    }
                } catch (e) {
                    // Ignore InvalidStateError if already stopped
                    if (e.name !== 'InvalidStateError') {
                         console.warn(`${this.MODULE_ID}: Error stopping noise source:`, e);
                    }
                }
                try {
                    this.noiseSource.disconnect();
                } catch (e) {
                    console.warn(`${this.MODULE_ID}: Error disconnecting noise source:`, e);
                }
                this.noiseSource = null;
                // console.debug(`${this.MODULE_ID}: Noise source stopped and cleared.`);
           }
      }

       /**
        * Disconnects and clears bandpass filters and their input gains.
        * @private
        */
      _disconnectAndClearBandpassFilters() {
           // console.debug(`${this.MODULE_ID}: Disconnecting and clearing ${this.bandPassFilters.length} bandpass filters.`);
           this.bandPassFilters.forEach((bpData, index) => {
                try {
                     if (bpData.inputGain) bpData.inputGain.disconnect();
                     if (bpData.filter) bpData.filter.disconnect();
                } catch (e) {
                     console.warn(`${this.MODULE_ID}: Error disconnecting bandpass filter #${index}:`, e);
                }
           });
           this.bandPassFilters = []; // Clear the array
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
                    console.warn(`${this.MODULE_ID}: Error disconnecting LFO #${index}:`, e);
               }
           });
           this.lfoNodes = []; // Clear the array
      }


    /**
     * Creates or recreates the BufferSourceNode for the noise loop.
     * Connects the source to the appropriate start of the filter chain.
     * @private
     */
     _recreateNoiseSource() {
         if (!this.audioContext || !this.noiseBuffer) {
              console.error(`${this.MODULE_ID}: Cannot recreate noise source - context or buffer missing.`);
              return;
         }

         this._stopAndClearNoiseSource(); // Ensure previous one is stopped and cleared

         try {
             this.noiseSource = this.audioContext.createBufferSource();
             this.noiseSource.buffer = this.noiseBuffer;
             this.noiseSource.loop = true;

             // Connect source to the main filter if it exists
             if (this.mainFilter) {
                 this.noiseSource.connect(this.mainFilter);
                 console.debug(`${this.MODULE_ID}: Noise source connected to main filter.`);
             }
              // If no main filter, but bandpass filters exist, connect to their input gains
              else if (this.bandPassFilters.length > 0) {
                  console.warn(`${this.MODULE_ID}: Connecting noise source directly to bandpass filter inputs.`);
                  let connected = false;
                  this.bandPassFilters.forEach(bp => {
                       if(bp.inputGain) {
                            try { this.noiseSource.connect(bp.inputGain); connected = true; }
                            catch(e) { console.error(`${this.MODULE_ID}: Error connecting noise to BP gain:`, e); }
                       }
                  });
                  if (!connected) throw new Error("No valid bandpass input gains to connect noise source to.");
              }
              // If no filters at all, connect directly to panner (less ideal)
              else if (this.pannerNode) {
                  console.warn(`${this.MODULE_ID}: Connecting noise source directly to panner node.`);
                  this.noiseSource.connect(this.pannerNode);
              }
             // Final fallback to output gain (least ideal)
             else if (this.outputGain) {
                  console.warn(`${this.MODULE_ID}: Connecting noise source directly to output gain.`);
                  this.noiseSource.connect(this.outputGain);
             } else {
                  throw new Error("No valid node found to connect noise source to.");
             }
             console.debug(`${this.MODULE_ID}: Noise source recreated successfully.`);

         } catch (error) {
              console.error(`${this.MODULE_ID}: Failed to recreate or connect noise source node:`, error);
              this.noiseSource = null; // Ensure it's null on failure
              if (typeof ToastSystem !== 'undefined') {
                   ToastSystem.notify('error', `Stream sound source error: ${error.message}`);
              }
         }
     }


    /**
     * Generates a stereo AudioBuffer containing pink or white noise.
     * Uses a simplified Voss-McCartney algorithm approximation for pink noise.
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
        // Ensure reasonable duration and frame count
        const validDuration = Math.max(1, durationSeconds);
        const frameCount = Math.max(sampleRate, Math.floor(sampleRate * validDuration)); // Min 1 second
        const channels = 2; // Always generate stereo buffer for spatialization

        let buffer = null;
        console.debug(`${this.MODULE_ID}: Generating ${validDuration.toFixed(1)}s stereo ${noiseType} noise buffer (${frameCount} frames)...`);

        try {
            buffer = this.audioContext.createBuffer(channels, frameCount, sampleRate);

            for (let c = 0; c < channels; c++) {
                const channelData = buffer.getChannelData(c);

                if (noiseType === 'pink') {
                    // Pink Noise Generation (Voss-McCartney approximation)
                    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0; // State variables per channel
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
                        // Scale slightly during generation to prevent immediate large values
                        channelData[i] *= 0.11;
                    }
                } else { // White Noise Generation
                    for (let i = 0; i < frameCount; i++) {
                        channelData[i] = Math.random() * 2 - 1;
                    }
                }

                // --- Normalization ---
                // Find max absolute value in the generated channel data
                let maxVal = 0;
                for (let i = 0; i < frameCount; i++) {
                     const absVal = Math.abs(channelData[i]);
                     if (absVal > maxVal) {
                          maxVal = absVal;
                     }
                }
                // Apply scaling if maxVal is significant to avoid silence or clipping
                if (maxVal > 0.001) { // Avoid division by zero or near-zero
                     const scaleFactor = 0.95 / maxVal; // Target peak amplitude of 0.95
                     for (let i = 0; i < frameCount; i++) {
                          channelData[i] *= scaleFactor;
                     }
                } else {
                     console.warn(`${this.MODULE_ID}: Channel ${c} noise buffer resulted in near silence before normalization.`);
                }
            }
            console.log(`${this.MODULE_ID}: Noise buffer generated successfully.`);
        } catch (error) {
             console.error(`${this.MODULE_ID}: Error generating ${noiseType} noise buffer:`, error);
             if (typeof ToastSystem !== 'undefined') {
                  ToastSystem.notify('error', `Failed to generate stream noise: ${error.message}`);
             }
             return null; // Return null on error
        }
        return buffer;
    }

} // End class AEAmbientStreamGentle

// Make globally accessible for the AudioEngine, matching the expected pattern
window.AEAmbientStreamGentle = AEAmbientStreamGentle;

console.log("ae_ambientStreamGentle.js loaded and AEAmbientStreamGentle class defined.");