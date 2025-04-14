// ae_ambientStreamGentle.js - Audio Module for Gentle Stream Ambience
// Part of the Harmonic Visions project by FatStinkyPanda
// Copyright (c) 2025 FatStinkyPanda - All rights reserved.
// Version: 1.0.0 (Initial Implementation)

/**
 * @class AEAmbientStreamGentle
 * @description Generates a continuous, gentle flowing stream sound using filtered noise synthesis.
 *              Implements the standard AudioEngine module interface.
 */
class AEAmbientStreamGentle {
    constructor() {
        this.MODULE_ID = 'AEAmbientStreamGentle'; // For logging
        this.audioContext = null;
        this.masterOutput = null; // Connects to AudioEngine's masterInputGain
        this.settings = null;
        this.currentMood = null;
        this.isEnabled = false;
        this.isPlaying = false;

        // Core Nodes
        this.outputGain = null;     // Master gain for this module (controls volume and fades)
        this.noiseSource = null;    // BufferSourceNode playing pink noise
        this.noiseBuffer = null;    // AudioBuffer holding the generated pink noise
        this.mainFilter = null;     // Main Low-Pass filter shaping the overall sound
        this.bandPassFilters = [];  // Array of BiquadFilterNodes for resonances
        this.pannerNode = null;     // StereoPannerNode for spatialization

        // LFOs for Modulation
        this.lfoNodes = []; // Array storing { lfo, gain } objects for modulating filters

        // Default settings for a gentle stream
        this.defaultStreamSettings = {
            ambientVolume: 0.15,    // Relatively quiet background sound
            noiseBufferSizeSeconds: 10, // Duration of the generated noise loop
            mainFilterFreq: 1200,   // Base cutoff for the main body
            mainFilterQ: 0.7,
            numBandPassFilters: 3, // Number of resonant filters
            bandPassFreqBase: 800,  // Hz, starting frequency for bandpass filters
            bandPassFreqRange: 600, // Hz, range over which bandpass center frequencies spread
            bandPassQBase: 3.0,
            bandPassQRange: 2.0,
            lfoRateBase: 0.05,      // Hz, very slow base rate for modulation
            lfoRateRange: 0.15,     // Hz, range for LFO rate variation
            lfoDepthBase: 100,      // Hz, base modulation depth for bandpass frequencies
            lfoDepthRange: 150,     // Hz, range for modulation depth variation
            panLFORate: 0.03,       // Hz, very slow panning LFO
            panLFODepth: 0.3,       // Max pan excursion (-0.3 to 0.3)
            attackTime: 3.0,        // Slow fade-in
            releaseTime: 3.0,       // Slow fade-out
        };

        console.log(`${this.MODULE_ID}: Instance created.`);
    }

    // --- Core Module Methods (Following AudioEngine Interface) ---

    /**
     * Initialize audio nodes, generate noise buffer.
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
            this.settings = { ...this.defaultStreamSettings, ...initialSettings };
            this.currentMood = initialMood;

            // --- Create Core Nodes ---
            this.outputGain = this.audioContext.createGain();
            this.outputGain.gain.value = 0.0001; // Start silent

            this.pannerNode = this.audioContext.createStereoPanner();
            this.pannerNode.pan.value = 0; // Start centered

            // --- Generate Pink Noise Buffer ---
            this.noiseBuffer = this._createPinkNoiseBuffer(
                this.settings.noiseBufferSizeSeconds || 10
            );
            if (!this.noiseBuffer) {
                throw new Error("Failed to generate pink noise buffer.");
            }

             // --- Create Noise Source ---
             // Source node will be created in play() or _recreateNoiseSource()
             // this.noiseSource = null; // Initialize as null

            // --- Create Filter Chain ---
            this._createFilterChain(this.settings);

            // --- Create LFOs ---
            this._createLFOs(this.settings);

            // --- Connect Audio Graph ---
            // Noise Source -> Main Filter -> Parallel BandPass Filters -> Panner -> Output Gain -> Master Output
            // Connection of noiseSource happens in play() / _recreateNoiseSource()
            if (this.mainFilter) {
                this.bandPassFilters.forEach(bp => {
                    if (bp.inputGain) { // Connect main filter to the input gain of each parallel bandpass path
                         this.mainFilter.connect(bp.inputGain);
                         bp.filter.connect(this.pannerNode); // Connect filter output to panner
                    }
                });
                // Also connect main filter output directly for the base sound layer
                 this.mainFilter.connect(this.pannerNode);
            } else {
                 // If no main filter, connect noise directly (less ideal)
                 // This connection will be made when noiseSource is created
            }
            this.pannerNode.connect(this.outputGain);
            this.outputGain.connect(this.masterOutput);

            // --- Connect LFOs ---
            this._connectLFOs();

            this.isEnabled = true;
            console.log(`${this.MODULE_ID}: Initialization complete.`);

        } catch (error) {
            console.error(`${this.MODULE_ID}: Initialization failed:`, error);
            if(typeof ToastSystem !== 'undefined') ToastSystem.notify('error', `Stream sound init failed: ${error.message}`);
            this.dispose(); // Cleanup partial initialization
            throw error; // Propagate error
        }
    }

    /**
     * Update loop hook (minimal use for ambient stream).
     */
    update(time, mood, visualParams, audioParams, deltaTime) {
        if (!this.isEnabled || !this.isPlaying) return;
        // Most variation comes from LFOs. Can add subtle parameter drift here if needed.
        // Example: Slowly drift main filter frequency slightly based on time/dreaminess
        // if (this.mainFilter && this.audioContext) {
        //     const baseFreq = this.settings.mainFilterFreq || 1200;
        //     const drift = Math.sin(time * 0.01 + this.settings.noiseBufferSizeSeconds) * 50 * (visualParams?.dreaminess || 0.5);
        //     this.mainFilter.frequency.setTargetAtTime(baseFreq + drift, this.audioContext.currentTime, 0.5);
        // }
    }

    /**
     * Start the noise source and LFOs, apply attack envelope.
     */
    play(startTime) {
        if (!this.isEnabled || this.isPlaying) return;
        if (!this.audioContext || !this.noiseBuffer) {
            console.error(`${this.MODULE_ID}: Cannot play, context or noise buffer missing.`);
            return;
        }
        console.log(`${this.MODULE_ID}: Starting playback at ${startTime.toFixed(3)}`);

        try {
             // --- Create or Recreate Noise Source ---
             // BufferSourceNodes cannot be re-started, so create a new one each time play is called
             this._recreateNoiseSource();
             if (!this.noiseSource) throw new Error("Failed to create noise source.");


            // Start LFOs
            this.lfoNodes.forEach(lfoData => {
                if (lfoData.lfo && lfoData.lfo.start) {
                    try { lfoData.lfo.start(startTime); } catch (e) { /* ignore if already started */ }
                }
            });

            // Start Noise Source
            this.noiseSource.start(startTime);

            // Apply Attack Envelope
            const attackTime = this.settings.attackTime || this.defaultStreamSettings.attackTime;
            const targetVolume = this.settings.ambientVolume || this.defaultStreamSettings.ambientVolume;

            this.outputGain.gain.cancelScheduledValues(startTime);
            this.outputGain.gain.setValueAtTime(0.0001, startTime);
            this.outputGain.gain.linearRampToValueAtTime(targetVolume, startTime + attackTime);

            this.isPlaying = true;

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during play():`, error);
            this.isPlaying = false;
            this._stopAndClearNoiseSource(); // Attempt cleanup
        }
    }

    /**
     * Stop playback, apply release envelope. Keep source node running if possible.
     */
    stop(stopTime, fadeDuration = 0.5) {
        if (!this.isEnabled || !this.isPlaying) return;
        if (!this.audioContext || !this.outputGain) {
            console.error(`${this.MODULE_ID}: Cannot stop, context or output gain missing.`);
            return;
        }
        console.log(`${this.MODULE_ID}: Stopping playback at ${stopTime.toFixed(3)}`);

        try {
            // Apply Release Envelope
            const releaseTime = this.settings.releaseTime || this.defaultStreamSettings.releaseTime;
            const timeConstant = releaseTime / 3.0; // Exponential decay

            this.outputGain.gain.cancelScheduledValues(stopTime);
            const currentGain = this.outputGain.gain.value; // Get current gain for smooth start of release
            this.outputGain.gain.setValueAtTime(currentGain, stopTime);
            this.outputGain.gain.setTargetAtTime(0.0001, stopTime, timeConstant);

            // Don't stop the looped noise source here, just fade the gain.
            // It will be stopped and cleaned up in dispose() or when play() creates a new one.
            // Stop LFOs after fade out to prevent modulation after silence
            const scheduleLFOStopTime = stopTime + releaseTime + 0.2;
             this.lfoNodes.forEach(lfoData => {
                 if (lfoData.lfo && lfoData.lfo.stop) {
                     try { lfoData.lfo.stop(scheduleLFOStopTime); } catch (e) { /* ignore */ }
                 }
             });

            this.isPlaying = false;

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during stop():`, error);
            // Ensure state is reset
            this.isPlaying = false;
        }
    }

    /**
     * Smoothly transition parameters to match a new mood.
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
            this.settings = { ...this.defaultStreamSettings, ...newSettings };
            this.currentMood = newMood;

            const now = this.audioContext.currentTime;
            const rampTime = transitionTime * 0.7; // Use most of transition for smooth ramps

            // --- Update Module Parameters ---

            // 1. Overall Volume
            if (this.outputGain) {
                const targetVolume = this.isPlaying ? this.settings.ambientVolume : 0.0001;
                this.outputGain.gain.cancelScheduledValues(now);
                this.outputGain.gain.setTargetAtTime(targetVolume, now, rampTime / 3);
            }

            // 2. Main Filter
            if (this.mainFilter) {
                this.mainFilter.frequency.setTargetAtTime(this.settings.mainFilterFreq, now, rampTime);
                this.mainFilter.Q.setTargetAtTime(this.settings.mainFilterQ, now, rampTime);
            }

            // 3. BandPass Filters & LFOs - Recreate if number changes, else ramp params
            const numBPs = this.settings.numBandPassFilters || 0;
            if (numBPs !== this.bandPassFilters.length) {
                console.warn(`${this.MODULE_ID}: Number of bandpass filters changed. Recreating filter chain and LFOs.`);
                // Disconnect old BPs and LFOs
                this._disconnectAndClearBandpassFilters();
                this._disconnectAndClearLFOs();
                // Create new ones
                this._createFilterChain(this.settings); // This only creates the filters part
                this._createLFOs(this.settings); // This creates LFOs
                // Reconnect graph - assumes mainFilter exists and is connected to panner
                 if(this.mainFilter && this.pannerNode) {
                     this.bandPassFilters.forEach(bp => {
                         if (bp.inputGain) {
                              this.mainFilter.connect(bp.inputGain);
                              bp.filter.connect(this.pannerNode);
                         }
                     });
                 }
                this._connectLFOs(); // Connect new LFOs
                // Restart LFOs if playing
                 if (this.isPlaying) {
                     this.lfoNodes.forEach(lfoData => { if (lfoData.lfo && lfoData.lfo.start) try { lfoData.lfo.start(now); } catch(e){} });
                 }

            } else {
                // Ramp existing BandPass and LFO parameters
                this.bandPassFilters.forEach((bpData, i) => {
                    const freq = this.settings.bandPassFreqBase + Math.random() * this.settings.bandPassFreqRange;
                    const q = this.settings.bandPassQBase + Math.random() * this.settings.bandPassQRange;
                    if (bpData.filter) {
                        bpData.filter.frequency.setTargetAtTime(freq, now, rampTime);
                        bpData.filter.Q.setTargetAtTime(q, now, rampTime);
                    }
                });
                this.lfoNodes.forEach((lfoData, i) => {
                    // Adjust rate and depth based on new settings and index/randomness
                    if (lfoData.lfo && lfoData.gain) {
                        const rate = this.settings.lfoRateBase + Math.random() * this.settings.lfoRateRange;
                        const depth = this.settings.lfoDepthBase + Math.random() * this.settings.lfoDepthRange;
                        lfoData.lfo.frequency.setTargetAtTime(rate, now, rampTime);
                        lfoData.gain.gain.setTargetAtTime(depth, now, rampTime);
                    }
                    // Update Panning LFO
                    if (lfoData.isPanLFO && lfoData.lfo && lfoData.gain) {
                         lfoData.lfo.frequency.setTargetAtTime(this.settings.panLFORate, now, rampTime);
                         lfoData.gain.gain.setTargetAtTime(this.settings.panLFODepth, now, rampTime);
                    }
                });
            }

            // Envelope times are updated in settings for next play/stop.

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during changeMood():`, error);
            if(typeof ToastSystem !== 'undefined') ToastSystem.notify('error', 'Error changing stream sound mood.');
        }
    }

    /**
     * Clean up all audio resources.
     */
    dispose() {
        console.log(`${this.MODULE_ID}: Disposing...`);
        if (!this.isEnabled && !this.outputGain) {
             return; // Already clean/uninitialized
        }
        this.isEnabled = false;
        this.isPlaying = false;

        try {
            // Stop and disconnect noise source
            this._stopAndClearNoiseSource();

            // Disconnect and clear LFOs
            this._disconnectAndClearLFOs();

            // Disconnect and clear Filters
            this._disconnectAndClearBandpassFilters();
            if (this.mainFilter) try { this.mainFilter.disconnect(); } catch(e){}

            // Disconnect Panner and Output Gain
            if (this.pannerNode) try { this.pannerNode.disconnect(); } catch(e){}
            if (this.outputGain) try { this.outputGain.disconnect(); } catch(e){}

        } catch (error) {
             console.error(`${this.MODULE_ID}: Error during node disconnection:`, error);
        } finally {
            // Clear state
            this.outputGain = null;
            this.noiseSource = null;
            this.noiseBuffer = null; // Allow GC to collect buffer
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
     * Creates the filter chain (main lowpass, parallel bandpass).
     * @param {object} settings
     * @private
     */
    _createFilterChain(settings) {
        if (!this.audioContext) return;

        // 1. Main Low-Pass Filter
        this.mainFilter = this.audioContext.createBiquadFilter();
        this.mainFilter.type = 'lowpass';
        this.mainFilter.frequency.setValueAtTime(settings.mainFilterFreq, this.audioContext.currentTime);
        this.mainFilter.Q.setValueAtTime(settings.mainFilterQ, this.audioContext.currentTime);

        // 2. Parallel Band-Pass Filters
        this.bandPassFilters = [];
        const numBPs = settings.numBandPassFilters || 0;
        for (let i = 0; i < numBPs; i++) {
            const bpFilter = this.audioContext.createBiquadFilter();
            bpFilter.type = 'bandpass';
            // Distribute frequencies, add randomness
            const freq = settings.bandPassFreqBase + Math.random() * settings.bandPassFreqRange;
            const q = settings.bandPassQBase + Math.random() * settings.bandPassQRange;
            bpFilter.frequency.setValueAtTime(freq, this.audioContext.currentTime);
            bpFilter.Q.setValueAtTime(q, this.audioContext.currentTime);

            // Use an input gain for each parallel path to control mix (optional, could be equal mix)
             const inputGain = this.audioContext.createGain();
             inputGain.gain.value = 1.0 / Math.max(1, numBPs); // Equal mix initially

            this.bandPassFilters.push({ filter: bpFilter, inputGain: inputGain });
        }
    }

     /**
     * Creates LFO nodes for modulating filters and panning.
     * @param {object} settings
     * @private
     */
     _createLFOs(settings) {
         if (!this.audioContext) return;
         this.lfoNodes = []; // Clear existing

         // LFOs for BandPass Filters
         this.bandPassFilters.forEach((bpData, i) => {
             const lfo = this.audioContext.createOscillator();
             lfo.type = 'sine';
             const rate = settings.lfoRateBase + Math.random() * settings.lfoRateRange;
             lfo.frequency.setValueAtTime(rate, this.audioContext.currentTime);
             lfo.phase = Math.random() * Math.PI * 2; // Random start phase

             const gain = this.audioContext.createGain();
             const depth = settings.lfoDepthBase + Math.random() * settings.lfoDepthRange;
             gain.gain.setValueAtTime(depth, this.audioContext.currentTime);

             lfo.connect(gain);
             this.lfoNodes.push({ lfo, gain, target: bpData.filter.frequency, isPanLFO: false }); // Store target param
         });

         // LFO for Panning
         const panLFO = this.audioContext.createOscillator();
         panLFO.type = 'sine';
         panLFO.frequency.setValueAtTime(settings.panLFORate, this.audioContext.currentTime);
         panLFO.phase = Math.random() * Math.PI * 2;

         const panGain = this.audioContext.createGain();
         panGain.gain.setValueAtTime(settings.panLFODepth, this.audioContext.currentTime);

         panLFO.connect(panGain);
         this.lfoNodes.push({ lfo: panLFO, gain: panGain, target: this.pannerNode?.pan, isPanLFO: true }); // Target panner node's pan param
     }

     /**
      * Connects LFO gain outputs to their target AudioParams.
      * @private
      */
      _connectLFOs() {
          this.lfoNodes.forEach(lfoData => {
              if (lfoData.gain && lfoData.target) {
                  try {
                       lfoData.gain.connect(lfoData.target);
                  } catch (error) {
                       console.error(`${this.MODULE_ID}: Error connecting LFO to target: `, lfoData.target, error);
                  }
              }
          });
      }

      /** Stops and disconnects the current noise source node */
      _stopAndClearNoiseSource() {
           if (this.noiseSource) {
                try {
                     this.noiseSource.stop(0);
                     this.noiseSource.disconnect();
                } catch (e) { /* ignore if already stopped or disconnected */ }
                this.noiseSource = null;
           }
      }

       /** Disconnects and clears bandpass filters */
      _disconnectAndClearBandpassFilters() {
           this.bandPassFilters.forEach(bp => {
                if (bp.inputGain) try { bp.inputGain.disconnect(); } catch(e){}
                if (bp.filter) try { bp.filter.disconnect(); } catch(e){}
           });
           this.bandPassFilters = [];
      }

      /** Disconnects and clears LFOs */
      _disconnectAndClearLFOs() {
           this.lfoNodes.forEach(lfoData => {
                if (lfoData.lfo) try { if(lfoData.lfo.stop) lfoData.lfo.stop(0); lfoData.lfo.disconnect(); } catch(e){}
                if (lfoData.gain) try { lfoData.gain.disconnect(); } catch(e){}
           });
           this.lfoNodes = [];
      }


    /**
     * Creates or recreates the BufferSourceNode for the noise loop.
     * @private
     */
     _recreateNoiseSource() {
         if (!this.audioContext || !this.noiseBuffer) return;

         this._stopAndClearNoiseSource(); // Ensure previous one is stopped and cleared

         try {
             this.noiseSource = this.audioContext.createBufferSource();
             this.noiseSource.buffer = this.noiseBuffer;
             this.noiseSource.loop = true;

             // Connect source to the appropriate starting point of the filter chain
             const connectionTarget = this.mainFilter || this.pannerNode || this.outputGain; // Connect to first available node
             if (connectionTarget) {
                 this.noiseSource.connect(connectionTarget);
                  // If connecting directly to panner/output AND bandpass filters exist, connect to their inputs too
                  if (connectionTarget !== this.mainFilter && this.bandPassFilters.length > 0) {
                       this.bandPassFilters.forEach(bp => {
                            if(bp.inputGain) this.noiseSource.connect(bp.inputGain);
                       });
                  }
             } else {
                  console.error(`${this.MODULE_ID}: No valid node to connect noise source to.`);
             }
         } catch (error) {
              console.error(`${this.MODULE_ID}: Failed to recreate noise source node:`, error);
              this.noiseSource = null;
         }
     }


    /**
     * Generates a stereo AudioBuffer containing pink noise.
     * Uses a simplified Voss-McCartney algorithm approximation.
     * @param {number} durationSeconds - The desired buffer duration.
     * @returns {AudioBuffer | null} The generated buffer or null on error.
     * @private
     */
    _createPinkNoiseBuffer(durationSeconds) {
        if (!this.audioContext) return null;
        const sampleRate = this.audioContext.sampleRate;
        const frameCount = sampleRate * durationSeconds;
        const channels = 2; // Stereo buffer
        let buffer = null;

        try {
            buffer = this.audioContext.createBuffer(channels, frameCount, sampleRate);

            for (let c = 0; c < channels; c++) {
                const channelData = buffer.getChannelData(c);
                let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0; // Voss-McCartney state variables per channel

                for (let i = 0; i < frameCount; i++) {
                    // Generate white noise
                    const white = Math.random() * 2 - 1;

                    // Apply Voss-McCartney approximation filter stages
                    b0 = 0.99886 * b0 + white * 0.0555179;
                    b1 = 0.99332 * b1 + white * 0.0750759;
                    b2 = 0.96900 * b2 + white * 0.1538520;
                    b3 = 0.86650 * b3 + white * 0.3104856;
                    b4 = 0.55000 * b4 + white * 0.5329522;
                    b5 = -0.7616 * b5 - white * 0.0168980;

                    // Sum the stages
                    let pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
                    // Store the current white noise value for the next iteration's b6
                    b6 = white * 0.115926;

                    // Scale to prevent clipping (adjust multiplier empirically)
                    channelData[i] = pink * 0.11;
                }

                // Basic normalization (find max absolute value and scale) - Optional but good practice
                let maxVal = 0;
                for (let i = 0; i < frameCount; i++) {
                     maxVal = Math.max(maxVal, Math.abs(channelData[i]));
                }
                if (maxVal > 0) {
                     const scaleFactor = 0.95 / maxVal; // Scale to just below 1.0
                     for (let i = 0; i < frameCount; i++) {
                          channelData[i] *= scaleFactor;
                     }
                }
            }
            console.log(`${this.MODULE_ID}: Generated ${durationSeconds}s stereo pink noise buffer.`);
        } catch (error) {
             console.error(`${this.MODULE_ID}: Error generating pink noise buffer:`, error);
             return null;
        }
        return buffer;
    }

} // End class AEAmbientStreamGentle

// Make globally accessible for the AudioEngine
window.AEAmbientStreamGentle = AEAmbientStreamGentle;