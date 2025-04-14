// ae_pads.js - Audio Module for Pads/Drones
// Part of the Harmonic Visions project by FatStinkyPanda
// Copyright (c) 2025 FatStinkyPanda - All rights reserved.
// Version: 2.0.0 (Functional Implementation)

/**
 * @class AEPads
 * @description Generates evolving pad and drone sounds based on mood settings.
 * Features layered oscillators per note, filtering, and LFO modulation.
 */
class AEPads {
    constructor() {
        this.MODULE_ID = 'AEPads'; // For logging
        this.audioContext = null;
        this.masterOutput = null; // Connects to AudioEngine's masterInputGain
        this.settings = null;
        this.currentMood = null;
        this.isEnabled = false;
        this.isPlaying = false;

        // Core Nodes
        this.outputGain = null; // Master gain for this module, handles main envelope
        this.filterNode = null; // Master filter for the pad sound

        // Sound Generation State
        this.notesData = []; // Array to store { freq, oscillators: [], noteGain } for each note in the chord
        this.lfoNodes = {}; // Stores LFOs and their gains { filterLFO, filterLFOGain, pitchLFO, pitchLFOGain }

        // Default settings fallback
        this.defaultPadSettings = {
            padVolume: 0.3,
            padWaveform: 'triangle', // 'sine', 'triangle', 'sawtooth', 'square'
            detuneAmount: 5, // Cents
            subOscGain: 0.4, // Relative gain of sub oscillator
            filterType: 'lowpass',
            filterFreq: 800,
            filterQ: 1.5,
            filterLFORate: 0.1, // Hz
            filterLFODepth: 300, // Modulation range in Hz
            pitchLFORate: 0.15, // Hz
            pitchLFODepth: 2.5, // Modulation range in cents
            attackTime: 2.0, // seconds
            releaseTime: 3.0, // seconds
            scale: 'major',
            baseFreq: 220, // A3
            chordNotes: [0, 4, 7], // Default to major triad intervals (semitones)
        };

        console.log(`${this.MODULE_ID}: Instance created.`);
    }

    // --- Core Module Methods ---

    /**
     * Initialize audio nodes, load resources (if any).
     * @param {AudioContext} audioContext - The shared AudioContext.
     * @param {AudioNode} masterOutputNode - The node to connect the module's output to (AudioEngine's masterInputGain).
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
            this.audioContext = audioContext;
            this.masterOutput = masterOutputNode;
            // Merge initial settings with defaults to ensure all properties exist
            this.settings = { ...this.defaultPadSettings, ...initialSettings };
            this.currentMood = initialMood;

            // 1. Create Master Output Gain (starts silent)
            this.outputGain = this.audioContext.createGain();
            this.outputGain.gain.value = 0.0001; // Start near zero

            // 2. Create Master Filter
            this.filterNode = this.audioContext.createBiquadFilter();
            this.filterNode.type = this.settings.filterType || 'lowpass';
            this.filterNode.frequency.setValueAtTime(this.settings.filterFreq || 800, this.audioContext.currentTime);
            this.filterNode.Q.setValueAtTime(this.settings.filterQ || 1.5, this.audioContext.currentTime);

            // 3. Create Pad Sound Sources (Oscillators, LFOs)
            this._createPadSound(this.settings); // This populates this.notesData and this.lfoNodes

            // 4. Connect Audio Graph:
            // Individual Note Gains -> Filter -> Output Gain -> Master Output
            this.notesData.forEach(note => {
                if (note.noteGain) {
                    note.noteGain.connect(this.filterNode);
                }
            });
            this.filterNode.connect(this.outputGain);
            this.outputGain.connect(this.masterOutput);

            // 5. Connect LFOs
            this._connectLFOs();

            this.isEnabled = true;
            console.log(`${this.MODULE_ID}: Initialization complete.`);

        } catch (error) {
            console.error(`${this.MODULE_ID}: Initialization failed:`, error);
            this.dispose(); // Clean up any partially created nodes
            throw error; // Re-throw
        }
    }

    /**
     * Update internal state, modulation. Called frequently by AudioEngine.
     * @param {number} time - Current elapsed time (from AudioEngine clock).
     * @param {string} mood - Current mood key.
     * @param {object} visualParams - Parameters from the visual system.
     * @param {object} audioParams - Parameters derived from mood settings (tempo, scale, etc.).
     * @param {number} deltaTime - Time since last frame.
     */
    update(time, mood, visualParams, audioParams, deltaTime) {
        if (!this.isEnabled || !this.isPlaying) return;

        try {
            // Subtle, continuous modulation examples:
            // - Slightly adjust LFO rates based on global intensity?
            // - Slowly drift filter cutoff?
            // Keep this minimal for performance unless specific reactive effects are desired.

            // Example: Slightly increase filter LFO rate with global intensity
            // if (this.lfoNodes.filterLFO && visualParams.globalIntensity) {
            //     const baseRate = this.settings.filterLFORate || 0.1;
            //     const targetRate = baseRate * (1.0 + visualParams.globalIntensity * 0.5);
            //     this.lfoNodes.filterLFO.frequency.setTargetAtTime(
            //         targetRate,
            //         this.audioContext.currentTime,
            //         0.5 // Slow transition time constant
            //     );
            // }

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during update:`, error);
            // Consider disabling the module if errors persist here
        }
    }

    /**
     * Start playing the sounds generated by this module.
     * @param {number} startTime - AudioContext time when playback should start.
     */
    play(startTime) {
        if (!this.isEnabled || this.isPlaying) return;
        if (!this.audioContext) {
             console.error(`${this.MODULE_ID}: Cannot play, AudioContext is missing.`);
             return;
        }
        console.log(`${this.MODULE_ID}: Starting playback at ${startTime.toFixed(3)}`);

        try {
            // 1. Start all Oscillators and LFOs
            this.notesData.forEach(note => {
                note.oscillators.forEach(osc => {
                    try {
                        // Check if already started - this is tricky without explicit state tracking per oscillator
                        // We'll rely on the AudioContext throwing an error if start() is called twice.
                         osc.start(startTime);
                    } catch (e) {
                         // console.warn(`${this.MODULE_ID}: Oscillator likely already started.`, osc);
                    }
                });
            });
            Object.values(this.lfoNodes).forEach(node => {
                 if (node && node.frequency) { // Check if it's an oscillator node
                     try { node.start(startTime); } catch (e) { /* ignore if already started */ }
                 }
            });


            // 2. Apply Attack Envelope via Output Gain
            const attackTime = this.settings.attackTime || this.defaultPadSettings.attackTime;
            const targetVolume = this.settings.padVolume || this.defaultPadSettings.padVolume;

            this.outputGain.gain.cancelScheduledValues(startTime); // Clear any previous ramps
            this.outputGain.gain.setValueAtTime(0.0001, startTime); // Start from near silence
            this.outputGain.gain.linearRampToValueAtTime(targetVolume, startTime + attackTime);

            this.isPlaying = true;

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during play():`, error);
            this.isPlaying = false; // Ensure state is correct on error
        }
    }

    /**
     * Stop playing the sounds generated by this module.
     * @param {number} stopTime - AudioContext time when playback should stop.
     * @param {number} fadeDuration - Suggested duration for fade-out (overridden by releaseTime).
     */
    stop(stopTime, fadeDuration = 0.5) {
        if (!this.isEnabled || !this.isPlaying) return;
         if (!this.audioContext) {
             console.error(`${this.MODULE_ID}: Cannot stop, AudioContext is missing.`);
             return;
         }
        console.log(`${this.MODULE_ID}: Stopping playback at ${stopTime.toFixed(3)}`);

        try {
            // 1. Apply Release Envelope via Output Gain
            const releaseTime = this.settings.releaseTime || this.defaultPadSettings.releaseTime;
            // Use the longer of releaseTime or provided fadeDuration for a graceful stop
            const actualFadeDuration = Math.max(releaseTime, fadeDuration);
            const timeConstant = actualFadeDuration / 3.0; // Time constant for setTargetAtTime

            this.outputGain.gain.cancelScheduledValues(stopTime); // Crucial to prevent conflicts
            // Use setTargetAtTime for a smoother exponential decay, more natural for pads
            this.outputGain.gain.setTargetAtTime(0.0001, stopTime, timeConstant);

            // 2. Schedule Oscillator/LFO Stop
            const scheduleStopTime = stopTime + actualFadeDuration + 0.2; // Stop slightly after fade completes
            this.notesData.forEach(note => {
                note.oscillators.forEach(osc => {
                    try {
                        if (osc.stop) osc.stop(scheduleStopTime);
                    } catch (e) { /* Ignore errors on stop */ }
                });
            });
             Object.values(this.lfoNodes).forEach(node => {
                 if (node && node.stop) { // Check if it's an oscillator node
                     try { node.stop(scheduleStopTime); } catch (e) { /* ignore */ }
                 }
             });

            this.isPlaying = false;

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during stop():`, error);
            // We set isPlaying = false earlier, state should be okay.
        }
    }

    /**
     * Handle changes in mood, smoothly transitioning parameters.
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
        console.log(`${this.MODULE_ID}: Changing mood to '${newMood}' over ${transitionTime.toFixed(2)}s`);

        try {
            const oldSettings = this.settings;
            // Merge new settings with defaults
            this.settings = { ...this.defaultPadSettings, ...newSettings };
            this.currentMood = newMood;

            const now = this.audioContext.currentTime;
            const rampTime = transitionTime / 2; // Use half transition time for ramps for faster response

             // --- Smoothly Transition Parameters ---

             // 1. Output Volume
             if (this.outputGain) {
                 const targetVolume = this.isPlaying ? (this.settings.padVolume || this.defaultPadSettings.padVolume) : 0.0001;
                 this.outputGain.gain.cancelScheduledValues(now); // Cancel previous ramps
                 this.outputGain.gain.setTargetAtTime(targetVolume, now, rampTime / 2); // Faster volume ramp
             }

            // 2. Filter Parameters
            if (this.filterNode) {
                // Check if filter TYPE needs to change (cannot be ramped)
                const newFilterType = this.settings.filterType || 'lowpass';
                if (this.filterNode.type !== newFilterType) {
                     console.warn(`${this.MODULE_ID}: Filter type change (${this.filterNode.type} -> ${newFilterType}) cannot be smoothly transitioned. Changing immediately.`);
                     // Recreate filter or change type directly (might cause clicks)
                     // Safest might be a quick crossfade if needed, but for pads, direct change is often acceptable.
                     this.filterNode.type = newFilterType;
                }
                this.filterNode.frequency.setTargetAtTime(this.settings.filterFreq || 800, now, rampTime);
                this.filterNode.Q.setTargetAtTime(this.settings.filterQ || 1.5, now, rampTime);
            }

            // 3. LFO Parameters
            if (this.lfoNodes.filterLFO && this.lfoNodes.filterLFOGain) {
                this.lfoNodes.filterLFO.frequency.setTargetAtTime(this.settings.filterLFORate || 0.1, now, rampTime);
                this.lfoNodes.filterLFOGain.gain.setTargetAtTime(this.settings.filterLFODepth || 300, now, rampTime);
            }
            if (this.lfoNodes.pitchLFO && this.lfoNodes.pitchLFOGain) {
                this.lfoNodes.pitchLFO.frequency.setTargetAtTime(this.settings.pitchLFORate || 0.15, now, rampTime);
                this.lfoNodes.pitchLFOGain.gain.setTargetAtTime(this.settings.pitchLFODepth || 2.5, now, rampTime);
            }

            // 4. Oscillator Parameters (Frequencies, potentially Waveforms)
            // Need to recalculate chord notes for the new mood/settings
            const newChordFreqs = this._getChordFrequencies(this.settings);

            // --- Complex part: Matching old notes to new notes ---
            // This is tricky. For pads, it might be better to just crossfade or even
            // stop the old notes and start new ones if the chord structure changes drastically.
            // Simple approach: Adjust frequencies of existing oscillators if the number of notes is the same.
            // More robust: Recreate the pad sound entirely (similar to init, but maybe with crossfade).

            // Let's try adjusting existing notes if count matches, otherwise recreate.
            if (newChordFreqs.length === this.notesData.length) {
                 console.log(`${this.MODULE_ID}: Adjusting frequencies for ${newChordFreqs.length} notes.`);
                 this.notesData.forEach((noteData, index) => {
                     const newFreq = newChordFreqs[index];
                     noteData.freq = newFreq; // Update stored frequency
                     noteData.oscillators.forEach(osc => {
                         if (osc) {
                            // Calculate target frequency considering sub/detune
                            let targetOscFreq = newFreq;
                            if (osc.isSubOsc) targetOscFreq *= 0.5;
                            if (osc.isDetunedPos) targetOscFreq = this._detuneFreq(newFreq, this.settings.detuneAmount || 5);
                            if (osc.isDetunedNeg) targetOscFreq = this._detuneFreq(newFreq, -(this.settings.detuneAmount || 5));

                            osc.frequency.setTargetAtTime(targetOscFreq, now, rampTime);

                            // Waveform change (cannot be ramped, change immediately - might click)
                            const newWaveform = this.settings.padWaveform || 'triangle';
                             if(osc.type !== newWaveform && !osc.isSubOsc) { // Don't change sub's type usually
                                 // console.log(`${this.MODULE_ID}: Changing waveform for note ${index} osc from ${osc.type} to ${newWaveform}`);
                                 osc.type = newWaveform;
                             }
                         }
                     });
                 });
            } else {
                 console.warn(`${this.MODULE_ID}: Chord note count changed (${this.notesData.length} -> ${newChordFreqs.length}). Recreating pad sound.`);
                 // Stop existing oscillators quickly before recreating
                 const quickStopTime = now + 0.1;
                 this.notesData.forEach(note => note.oscillators.forEach(osc => {
                      if (osc && osc.stop) try { osc.stop(quickStopTime); } catch(e){}
                 }));
                 // Recreate sound structure (will clear old notesData)
                 this._createPadSound(this.settings);
                 // Reconnect graph
                  this.notesData.forEach(note => { if (note.noteGain) note.noteGain.connect(this.filterNode); });
                 this._connectLFOs();
                 // Restart oscillators if currently playing
                 if (this.isPlaying) {
                      const restartTime = quickStopTime + 0.05; // Start slightly after stop
                      this.notesData.forEach(note => note.oscillators.forEach(osc => { if (osc && osc.start) try { osc.start(restartTime); } catch(e){} }));
                      Object.values(this.lfoNodes).forEach(node => { if (node && node.start && node.frequency) try { node.start(restartTime); } catch(e){} });
                 }
            }

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during changeMood():`, error);
            // Attempt to recover or log error prominently
            if(typeof ToastSystem !== 'undefined') ToastSystem.notify('error', 'Error changing pad sound mood.');
        }
    }

    /**
     * Clean up all resources created by this module.
     */
    dispose() {
        console.log(`${this.MODULE_ID}: Disposing...`);
        if (!this.isEnabled && this.notesData.length === 0 && !this.outputGain) {
             console.log(`${this.MODULE_ID}: Already disposed or not initialized.`);
             return; // Already clean or never initialized
        }
        this.isEnabled = false;
        this.isPlaying = false;

        try {
            // Stop and disconnect all oscillators and note gains
            this.notesData.forEach(note => {
                note.oscillators.forEach(osc => {
                    try {
                        if (osc.stop) osc.stop();
                        osc.disconnect();
                    } catch (e) {/* ignore */ }
                });
                if (note.noteGain) {
                    try { note.noteGain.disconnect(); } catch (e) {/* ignore */ }
                }
            });

            // Stop and disconnect LFOs and their gains
            Object.values(this.lfoNodes).forEach(node => {
                 if (node) {
                     try {
                         if (node.stop) node.stop(); // If it's an oscillator
                         node.disconnect();
                     } catch (e) {/* ignore */ }
                 }
            });

            // Disconnect filter and output gain
            if (this.filterNode) {
                try { this.filterNode.disconnect(); } catch (e) {/* ignore */ }
            }
            if (this.outputGain) {
                try { this.outputGain.disconnect(); } catch (e) {/* ignore */ }
            }

        } catch (error) {
             console.error(`${this.MODULE_ID}: Error during node disconnection:`, error);
        } finally {
            // Clear arrays and references even if disconnection failed
            this.notesData = [];
            this.lfoNodes = {};
            this.outputGain = null;
            this.filterNode = null;
            this.audioContext = null;
            this.masterOutput = null;
            this.settings = null;
            console.log(`${this.MODULE_ID}: Disposal complete.`);
        }
    }

    // --- Internal Helper Methods ---

    /**
     * Creates the core oscillator layers, filter, and LFOs for the pad sound.
     * @param {object} settings - The current mood audio settings.
     * @private
     */
    _createPadSound(settings) {
        if (!this.audioContext) return;
        console.log(`${this.MODULE_ID}: Creating sound structure...`);

        // --- Clear previous sound structure ---
        // Disconnect notes from filter first
        this.notesData.forEach(note => { if (note.noteGain) try { note.noteGain.disconnect(); } catch(e){} });
        // Dispose old oscillators/gains
        this.notesData.forEach(note => {
             note.oscillators.forEach(osc => { if(osc) try { if(osc.stop) osc.stop(); osc.disconnect(); } catch(e){} });
             if(note.noteGain) try { note.noteGain.disconnect(); } catch(e){}
        });
        this.notesData = []; // Clear the array

        // Dispose old LFOs
         Object.values(this.lfoNodes).forEach(node => { if(node) try { if(node.stop) node.stop(); node.disconnect(); } catch(e){} });
        this.lfoNodes = {};

        // --- Get Chord Frequencies ---
        const chordFrequencies = this._getChordFrequencies(settings);
        if (!chordFrequencies || chordFrequencies.length === 0) {
             console.warn(`${this.MODULE_ID}: No chord frequencies generated for mood '${this.currentMood}'. Pad will be silent.`);
             return;
        }

        // --- Create Nodes for Each Chord Note ---
        chordFrequencies.forEach(freq => {
            if (freq <= 0) return; // Skip invalid frequencies

            const noteOscillators = [];
            const noteGain = this.audioContext.createGain();
            noteGain.gain.value = 1.0 / Math.sqrt(chordFrequencies.length); // Normalize gain based on number of notes

            const waveform = settings.padWaveform || this.defaultPadSettings.padWaveform;
            const detune = settings.detuneAmount || this.defaultPadSettings.detuneAmount;
            const subGainValue = settings.subOscGain || this.defaultPadSettings.subOscGain;

            // 1. Fundamental Oscillator
            const fundamentalOsc = this.audioContext.createOscillator();
            fundamentalOsc.type = waveform;
            fundamentalOsc.frequency.setValueAtTime(freq, this.audioContext.currentTime);
            fundamentalOsc.connect(noteGain);
            noteOscillators.push(fundamentalOsc);

            // 2. Detuned Oscillators (for richness/chorus)
            const detunedOscPos = this.audioContext.createOscillator();
            detunedOscPos.type = waveform;
            detunedOscPos.frequency.setValueAtTime(freq, this.audioContext.currentTime); // Base freq
            detunedOscPos.detune.setValueAtTime(detune, this.audioContext.currentTime); // Detune up
            detunedOscPos.connect(noteGain);
            detunedOscPos.isDetunedPos = true; // Mark for frequency updates
            noteOscillators.push(detunedOscPos);

            const detunedOscNeg = this.audioContext.createOscillator();
            detunedOscNeg.type = waveform;
            detunedOscNeg.frequency.setValueAtTime(freq, this.audioContext.currentTime); // Base freq
            detunedOscNeg.detune.setValueAtTime(-detune, this.audioContext.currentTime); // Detune down
            detunedOscNeg.connect(noteGain);
            detunedOscNeg.isDetunedNeg = true; // Mark for frequency updates
            noteOscillators.push(detunedOscNeg);

            // 3. Sub Oscillator (adds weight)
            if (subGainValue > 0.01) {
                const subOsc = this.audioContext.createOscillator();
                subOsc.type = 'sine'; // Usually sine for sub
                subOsc.frequency.setValueAtTime(freq * 0.5, this.audioContext.currentTime); // One octave lower
                // Gain node for sub to control its level relative to others
                const subOscGainNode = this.audioContext.createGain();
                subOscGainNode.gain.value = subGainValue;
                subOsc.connect(subOscGainNode);
                subOscGainNode.connect(noteGain); // Connect sub's gain to the main note gain
                subOsc.isSubOsc = true; // Mark for frequency updates
                noteOscillators.push(subOsc);
            }

            // Store note data
            this.notesData.push({
                freq: freq,
                oscillators: noteOscillators,
                noteGain: noteGain
            });
        });

        // --- Create LFOs ---
        // Filter LFO
        this.lfoNodes.filterLFO = this.audioContext.createOscillator();
        this.lfoNodes.filterLFO.type = 'sine';
        this.lfoNodes.filterLFO.frequency.setValueAtTime(settings.filterLFORate || 0.1, this.audioContext.currentTime);
        this.lfoNodes.filterLFOGain = this.audioContext.createGain();
        this.lfoNodes.filterLFOGain.gain.setValueAtTime(settings.filterLFODepth || 300, this.audioContext.currentTime);
        this.lfoNodes.filterLFO.connect(this.lfoNodes.filterLFOGain);

        // Pitch LFO (Vibrato/Chorus)
        this.lfoNodes.pitchLFO = this.audioContext.createOscillator();
        this.lfoNodes.pitchLFO.type = 'sine';
        // Add slight random offset to phase for uniqueness
        this.lfoNodes.pitchLFO.phase = Math.random() * Math.PI * 2;
        this.lfoNodes.pitchLFO.frequency.setValueAtTime(settings.pitchLFORate || 0.15, this.audioContext.currentTime);
        this.lfoNodes.pitchLFOGain = this.audioContext.createGain();
        this.lfoNodes.pitchLFOGain.gain.setValueAtTime(settings.pitchLFODepth || 2.5, this.audioContext.currentTime);
        this.lfoNodes.pitchLFO.connect(this.lfoNodes.pitchLFOGain);

        console.log(`${this.MODULE_ID}: Created ${this.notesData.length} notes with layers.`);
    }

    /**
     * Connects the LFO modulation outputs to their targets.
     * @private
     */
     _connectLFOs() {
         if (!this.audioContext) return;
         try {
             // Connect Filter LFO
             if (this.lfoNodes.filterLFOGain && this.filterNode) {
                 this.lfoNodes.filterLFOGain.connect(this.filterNode.frequency);
             }

             // Connect Pitch LFO to oscillator detune parameters
             if (this.lfoNodes.pitchLFOGain) {
                 this.notesData.forEach(note => {
                     note.oscillators.forEach(osc => {
                         // Avoid modulating sub-oscillator pitch typically
                         if (osc && !osc.isSubOsc && osc.detune) {
                              this.lfoNodes.pitchLFOGain.connect(osc.detune);
                         }
                     });
                 });
             }
         } catch (error) {
              console.error(`${this.MODULE_ID}: Error connecting LFOs:`, error);
         }
     }

    /**
     * Calculates the frequencies for the pad chord based on settings.
     * @param {object} settings - The mood audio settings.
     * @returns {number[]} An array of frequencies.
     * @private
     */
    _getChordFrequencies(settings) {
        const baseFreq = settings.baseFreq || this.defaultPadSettings.baseFreq;
        const scaleName = settings.scale || this.defaultPadSettings.scale;
        const chordIntervals = settings.chordNotes || this.defaultPadSettings.chordNotes; // Expecting [0, 4, 7] etc.

        // Simple fallback if scale data isn't available globally (should be loaded by index.html)
        const scaleMap = typeof musicalScales !== 'undefined' ? musicalScales : {
             major: [0, 2, 4, 5, 7, 9, 11],
             minor: [0, 2, 3, 5, 7, 8, 10],
             pentatonic: [0, 2, 4, 7, 9],
             // Add others if needed
        };
        const scale = scaleMap[scaleName] || scaleMap.major; // Default to major if unknown

        // For pads, directly using intervals relative to baseFreq is common.
        // If chordNotes is defined, use that directly. Otherwise, derive from scale (less common for pads).
        const intervalsToUse = chordIntervals;

        return intervalsToUse.map(interval => {
            try {
                return baseFreq * Math.pow(2, interval / 12);
            } catch (e) {
                 console.error(`${this.MODULE_ID}: Error calculating frequency for interval ${interval}`, e);
                 return 0; // Return 0 for invalid calculation
            }
        }).filter(freq => freq > 0); // Filter out invalid frequencies
    }

     /**
      * Calculates a detuned frequency.
      * @param {number} baseFreq - The base frequency.
      * @param {number} cents - The detuning amount in cents.
      * @returns {number} The detuned frequency.
      * @private
      */
     _detuneFreq(baseFreq, cents) {
         return baseFreq * Math.pow(2, cents / 1200);
     }

} // End class AEPads

// Make globally accessible for the AudioEngine
window.AEPads = AEPads;