// ae_padWarmAnalog.js - Audio Module for Warm Analog-Style Pads
// Part of the Harmonic Visions project by FatStinkyPanda
// Copyright (c) 2025 FatStinkyPanda - All rights reserved.
// Version: 1.1.0 (Enhanced Error Handling, Cleanup, Uniqueness)

/**
 * @class AEPadWarmAnalog
 * @description Generates warm, evolving analog-style pad sounds using filtered
 *              sawtooth/triangle waves, detuning, and slow LFO modulation.
 *              Implements the standard AudioEngine module interface.
 */
class AEPadWarmAnalog {
    constructor() {
        this.MODULE_ID = 'AEPadWarmAnalog'; // For logging and identification
        this.audioContext = null;
        this.masterOutput = null; // Connects to AudioEngine's masterInputGain
        this.settings = null;
        this.currentMood = null;
        this.isEnabled = false;
        this.isPlaying = false;

        // --- Core Audio Nodes ---
        this.outputGain = null;         // Master gain for this module (volume, main envelope)
        this.filterNode = null;         // Primary filter (Lowpass) to shape the sound
        this.notesData = [];            // Array to store { freq, oscillators: [], noteGain } for each chord note
        this.lfoNodes = {};             // Stores LFOs and their gains { filterLFO, filterLFOGain, pitchLFO, pitchLFOGain }

        // --- Default Settings Tailored for Warm Analog Pads ---
        this.defaultPadSettings = {
            padVolume: 0.35,
            padWaveform: 'sawtooth',    // Sawtooth filtered low often sounds warmest
            detuneAmount: 6,            // Subtle detuning in cents for thickness
            numDetunedOscs: 2,          // Number of detuned oscillators per note (e.g., 1 sharp, 1 flat)
            subOscGain: 0.45,           // Generous sub-oscillator (sine) for warmth
            filterType: 'lowpass',
            filterFreq: 750,            // Lower starting cutoff for warmth (Hz)
            filterQ: 1.4,               // Subtle resonance, avoids harshness
            filterLFORate: 0.08,        // Very slow filter sweep (Hz)
            filterLFODepth: 300,        // Moderate sweep depth (Hz)
            pitchLFORate: 0.11,         // Slow pitch drift/chorus (Hz)
            pitchLFODepth: 2.0,         // Very subtle pitch modulation depth (cents)
            attackTime: 3.0,            // Slow, smooth attack (seconds)
            releaseTime: 4.5,           // Long, gradual release (seconds)
            // Harmonic content settings (passed from AudioEngine based on data.js)
            scale: 'major',             // Default scale if not provided
            baseFreq: 110,              // Lower base frequency (A2) often suits pads
            chordNotes: [0, 7, 16],     // Example: Root, Fifth, Major Third (spread voicing)
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
            this.audioContext = audioContext;
            this.masterOutput = masterOutputNode;
            // Merge initial settings with specific defaults for this pad type
            this.settings = { ...this.defaultPadSettings, ...initialSettings };
            this.currentMood = initialMood;

            // --- Create Core Nodes ---
            // 1. Master Output Gain (starts silent)
            this.outputGain = this.audioContext.createGain();
            this.outputGain.gain.setValueAtTime(0.0001, this.audioContext.currentTime);

            // 2. Master Filter
            this.filterNode = this.audioContext.createBiquadFilter();
            this.filterNode.type = this.settings.filterType || 'lowpass';
            this.filterNode.frequency.setValueAtTime(this.settings.filterFreq, this.audioContext.currentTime);
            this.filterNode.Q.setValueAtTime(this.settings.filterQ, this.audioContext.currentTime);

            // 3. Create Oscillators, Note Gains, and LFOs
            this._createSoundStructure(this.settings); // Builds the core sound generation part

            // 4. Connect Audio Graph: Note Gains -> Filter -> Output Gain -> Master Output
            this.notesData.forEach(note => {
                if (note && note.noteGain) {
                    try {
                        note.noteGain.connect(this.filterNode);
                    } catch (connectError) {
                        console.error(`${this.MODULE_ID}: Error connecting noteGain for freq ${note.freq}:`, connectError);
                    }
                }
            });
            this.filterNode.connect(this.outputGain);
            this.outputGain.connect(this.masterOutput);

            // 5. Connect LFOs to their targets
            this._connectLFOs();

            this.isEnabled = true;
            console.log(`${this.MODULE_ID}: Initialization complete.`);

        } catch (error) {
            console.error(`${this.MODULE_ID}: Initialization failed:`, error);
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', `Warm Pad init failed: ${error.message}`);
            }
            this.dispose(); // Cleanup partial initialization
            this.isEnabled = false; // Ensure state is correct
            // Allow AudioEngine to handle module failure, don't re-throw typically
        }
    }

    /**
     * Update loop hook. Kept minimal for performance.
     * @param {number} time - Current elapsed time (from AudioEngine clock).
     * @param {string} mood - Current mood key.
     * @param {object} visualParams - Parameters from the visual system.
     * @param {object} audioParams - Parameters derived from mood settings.
     * @param {number} deltaTime - Time since last frame.
     */
    update(time, mood, visualParams, audioParams, deltaTime) {
        if (!this.isEnabled || !this.isPlaying || !this.audioContext) return;

        // Optional: Subtle modulation based on external params (use sparingly)
        // Example: Slightly adjust filter LFO rate based on global intensity
        // try {
        //     if (this.lfoNodes.filterLFO && visualParams?.globalIntensity !== undefined) {
        //         const baseRate = this.settings.filterLFORate || 0.08;
        //         const targetRate = baseRate * (0.9 + visualParams.globalIntensity * 0.2);
        //         this.lfoNodes.filterLFO.frequency.setTargetAtTime(
        //             Math.max(0.01, Math.min(targetRate, 0.5)), // Clamp rate
        //             this.audioContext.currentTime,
        //             0.8 // Slow transition
        //         );
        //     }
        // } catch (error) {
        //     console.error(`${this.MODULE_ID}: Error during update:`, error);
        // }
    }

    /**
     * Start playing the pad sound.
     * @param {number} startTime - AudioContext time when playback should start.
     */
    play(startTime) {
        if (!this.isEnabled || this.isPlaying) return;
        if (!this.audioContext || !this.outputGain) {
             console.error(`${this.MODULE_ID}: Cannot play - AudioContext or outputGain missing.`);
             return;
        }
        console.log(`${this.MODULE_ID}: Starting playback at ${startTime.toFixed(3)}`);

        try {
            // --- Ensure sound structure exists ---
            // If stop() was called, oscillators might be stopped and need recreation.
            // The safest approach is to recreate if notesData is empty or oscillators are likely stopped.
            if (this.notesData.length === 0 || !this._areOscillatorsPotentiallyRunning()) {
                 console.warn(`${this.MODULE_ID}: Sound structure potentially invalid or stopped, recreating before play.`);
                 this._createSoundStructure(this.settings);
                 // Reconnect graph after recreation
                 this.notesData.forEach(note => { if (note && note.noteGain) note.noteGain.connect(this.filterNode); });
                 this._connectLFOs();
                 // If recreation failed, notesData might still be empty
                 if(this.notesData.length === 0) {
                      throw new Error("Sound structure recreation failed.");
                 }
            }

            const now = this.audioContext.currentTime;
            const targetStartTime = Math.max(now, startTime); // Ensure start time is not in the past

            // 1. Start all Oscillators and LFOs
            this.notesData.forEach(note => {
                if (note && note.oscillators) {
                    note.oscillators.forEach(osc => {
                        if (osc && osc.start) {
                            try {
                                osc.start(targetStartTime);
                            } catch (e) {
                                if (e.name !== 'InvalidStateError') { // Ignore if already started
                                    console.warn(`${this.MODULE_ID}: Error starting oscillator for freq ${note.freq}:`, e);
                                }
                            }
                        }
                    });
                }
            });
            Object.values(this.lfoNodes).forEach(node => {
                 if (node && node.frequency && node.start) { // Check if it's an oscillator node
                     try { node.start(targetStartTime); } catch (e) { /* ignore if already started */ }
                 }
            });

            // 2. Apply Attack Envelope via Output Gain
            const attackTime = this.settings.attackTime || this.defaultPadSettings.attackTime;
            const targetVolume = this.settings.padVolume || this.defaultPadSettings.padVolume;

            this.outputGain.gain.cancelScheduledValues(targetStartTime);
            this.outputGain.gain.setValueAtTime(0.0001, targetStartTime); // Start from near silence
            this.outputGain.gain.linearRampToValueAtTime(targetVolume, targetStartTime + attackTime);

            this.isPlaying = true;

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during play():`, error);
            this.isPlaying = false; // Ensure state is correct on error
             if (typeof ToastSystem !== 'undefined') {
                 ToastSystem.notify('error', `Warm Pad play failed: ${error.message}`);
             }
        }
    }

     /**
      * Checks if oscillators are likely running (basic check).
      * A more robust check would involve tracking oscillator state explicitly.
      * @private
      */
     _areOscillatorsPotentiallyRunning() {
         if (this.notesData.length === 0) return false;
         // Check the first oscillator of the first note as a sample
         const firstNote = this.notesData[0];
         if (!firstNote || !firstNote.oscillators || firstNote.oscillators.length === 0) return false;
         const firstOsc = firstNote.oscillators[0];
         // This is tricky. If stop() was scheduled, the oscillator might still appear "active"
         // until the scheduled stop time. A simple check is insufficient.
         // We rely on play() catching InvalidStateError if start() is called again.
         // The check in play() for notesData.length === 0 is the primary safety.
         return true; // Assume potentially running if structure exists
     }


    /**
     * Stop playing the pad sound.
     * @param {number} stopTime - AudioContext time when playback should stop.
     * @param {number} [fadeDuration=0.5] - Suggested duration (overridden by releaseTime).
     */
    stop(stopTime, fadeDuration = 0.5) {
        if (!this.isEnabled || !this.isPlaying) return;
        if (!this.audioContext || !this.outputGain) {
             console.error(`${this.MODULE_ID}: Cannot stop - AudioContext or outputGain missing.`);
             return;
        }
        console.log(`${this.MODULE_ID}: Stopping playback at ${stopTime.toFixed(3)}`);

        try {
            const now = this.audioContext.currentTime;
            const targetStopTime = Math.max(now, stopTime); // Ensure stop time is not in the past

            // 1. Apply Release Envelope via Output Gain
            const releaseTime = this.settings.releaseTime || this.defaultPadSettings.releaseTime;
            const timeConstant = releaseTime / 3.0; // Exponential decay time constant

            this.outputGain.gain.cancelScheduledValues(targetStopTime);
            const currentGain = this.outputGain.gain.value;
            this.outputGain.gain.setValueAtTime(currentGain, targetStopTime); // Start release from current gain
            this.outputGain.gain.setTargetAtTime(0.0001, targetStopTime, timeConstant);

            // 2. Schedule Oscillator/LFO Stop *after* the release envelope completes
            const scheduleNodeStopTime = targetStopTime + releaseTime + 0.3; // Add buffer

            this.notesData.forEach(note => {
                if (note && note.oscillators) {
                    note.oscillators.forEach(osc => {
                        if (osc && osc.stop) {
                            try { osc.stop(scheduleNodeStopTime); } catch (e) { /* Ignore errors */ }
                        }
                    });
                }
            });
            Object.values(this.lfoNodes).forEach(node => {
                 if (node && node.frequency && node.stop) {
                     try { node.stop(scheduleNodeStopTime); } catch (e) { /* ignore */ }
                 }
             });

            // 3. Set isPlaying to false immediately
            this.isPlaying = false;

            // Note: Oscillators are now marked as stopped (implicitly by the scheduled stop).
            // The play() method will handle recreation if called again.

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during stop():`, error);
            this.isPlaying = false; // Ensure state reset
             if (typeof ToastSystem !== 'undefined') {
                 ToastSystem.notify('error', `Warm Pad stop failed: ${error.message}`);
             }
        }
    }

    /**
     * Smoothly transition parameters to match a new mood.
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
            // Merge new settings with specific defaults for this pad type
            this.settings = { ...this.defaultPadSettings, ...newSettings };
            this.currentMood = newMood;

            const now = this.audioContext.currentTime;
            const rampTime = transitionTime * 0.7; // Use a significant portion for smooth ramps

            // --- Update Master Volume ---
            if (this.outputGain) {
                const targetVolume = this.isPlaying ? this.settings.padVolume : 0.0001;
                this.outputGain.gain.cancelScheduledValues(now);
                this.outputGain.gain.setTargetAtTime(targetVolume, now, rampTime / 3);
            }

            // --- Update Filter Parameters ---
            if (this.filterNode) {
                const newFilterType = this.settings.filterType || 'lowpass';
                if (this.filterNode.type !== newFilterType) {
                    console.warn(`${this.MODULE_ID}: Filter type changed (${this.filterNode.type} -> ${newFilterType}). Changing immediately.`);
                    this.filterNode.type = newFilterType;
                }
                this.filterNode.frequency.setTargetAtTime(this.settings.filterFreq, now, rampTime);
                this.filterNode.Q.setTargetAtTime(this.settings.filterQ, now, rampTime);
            }

            // --- Update LFO Parameters ---
            if (this.lfoNodes.filterLFO && this.lfoNodes.filterLFOGain) {
                this.lfoNodes.filterLFO.frequency.setTargetAtTime(this.settings.filterLFORate, now, rampTime);
                this.lfoNodes.filterLFOGain.gain.setTargetAtTime(this.settings.filterLFODepth, now, rampTime);
            }
            if (this.lfoNodes.pitchLFO && this.lfoNodes.pitchLFOGain) {
                this.lfoNodes.pitchLFO.frequency.setTargetAtTime(this.settings.pitchLFORate, now, rampTime);
                this.lfoNodes.pitchLFOGain.gain.setTargetAtTime(this.settings.pitchLFODepth, now, rampTime);
            }

            // --- Update Oscillator Parameters ---
            const newChordFreqs = this._getChordFrequencies(this.settings);
            const newWaveform = this.settings.padWaveform || 'sawtooth';
            const newDetune = this.settings.detuneAmount || 6;

            // --- Strategy: Recreate if chord structure changes, else ramp existing ---
            if (newChordFreqs.length !== this.notesData.length) {
                 console.warn(`${this.MODULE_ID}: Chord note count changed (${this.notesData.length} -> ${newChordFreqs.length}). Recreating sound structure.`);
                 const quickStopTime = now + 0.1;
                 this.notesData.forEach(note => {
                     if (note && note.oscillators) {
                         note.oscillators.forEach(osc => { if (osc && osc.stop) try { osc.stop(quickStopTime); } catch(e){} });
                     }
                 });
                 // Recreate sound structure (clears old notesData/LFOs)
                 this._createSoundStructure(this.settings);
                 // Reconnect graph
                 this.notesData.forEach(note => { if (note && note.noteGain) note.noteGain.connect(this.filterNode); });
                 this._connectLFOs();
                 // Restart oscillators/LFOs if currently playing
                 if (this.isPlaying) {
                      const restartTime = quickStopTime + 0.05;
                      this.notesData.forEach(note => {
                          if (note && note.oscillators) {
                              note.oscillators.forEach(osc => { if (osc && osc.start) try { osc.start(restartTime); } catch(e){} });
                          }
                      });
                      Object.values(this.lfoNodes).forEach(node => { if (node && node.start && node.frequency) try { node.start(restartTime); } catch(e){} });
                 }
            } else {
                 // Chord structure is the same, ramp existing oscillators
                 console.log(`${this.MODULE_ID}: Adjusting frequencies and parameters for ${newChordFreqs.length} notes.`);
                 this.notesData.forEach((noteData, index) => {
                     if (!noteData || !noteData.oscillators) return;

                     const newFreq = newChordFreqs[index];
                     noteData.freq = newFreq; // Update stored frequency

                     noteData.oscillators.forEach(osc => {
                         if (osc) {
                             // Waveform change (immediate)
                             if (osc.type !== newWaveform && !osc.isSubOsc) {
                                 osc.type = newWaveform;
                             }

                             // Calculate target frequency and detune
                             let targetOscFreq = newFreq;
                             let targetDetuneValue = 0;

                             if (osc.isSubOsc) {
                                 targetOscFreq *= 0.5;
                             } else if (osc.isDetunedPos) {
                                 targetOscFreq = this._detuneFreq(newFreq, newDetune); // Ramp frequency directly
                                 targetDetuneValue = newDetune; // Target for base detune param
                             } else if (osc.isDetunedNeg) {
                                 targetOscFreq = this._detuneFreq(newFreq, -newDetune); // Ramp frequency directly
                                 targetDetuneValue = -newDetune; // Target for base detune param
                             }

                             // Ramp frequency
                             osc.frequency.setTargetAtTime(targetOscFreq, now, rampTime);

                             // Ramp base detune value (for pitch LFO modulation center)
                             if (osc.detune && !osc.isSubOsc) {
                                 osc.detune.setTargetAtTime(targetDetuneValue, now, rampTime * 0.6); // Slightly faster detune ramp
                             }
                         }
                     });
                 });
            }

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during changeMood():`, error);
             if (typeof ToastSystem !== 'undefined') {
                 ToastSystem.notify('error', `Warm Pad mood change failed: ${error.message}`);
             }
        }
    }

    /**
     * Clean up all audio resources created by this module.
     */
    dispose() {
        console.log(`${this.MODULE_ID}: Disposing...`);
        if (!this.isEnabled && this.notesData.length === 0 && !this.outputGain) {
             console.log(`${this.MODULE_ID}: Already disposed or not initialized.`);
             return;
        }
        this.isEnabled = false;
        this.isPlaying = false;

        try {
            // 1. Stop and disconnect all oscillators and note gains
            this.notesData.forEach(note => {
                if (note && note.oscillators) {
                    note.oscillators.forEach(osc => {
                        if (osc) try { if(osc.stop) osc.stop(0); osc.disconnect(); } catch(e){}
                    });
                }
                if (note && note.noteGain) try { note.noteGain.disconnect(); } catch(e){}
            });

            // 2. Stop and disconnect LFOs and their gains
            Object.values(this.lfoNodes).forEach(node => {
                 if (node) try { if(node.stop) node.stop(0); node.disconnect(); } catch(e){}
            });

            // 3. Disconnect filter and output gain
            if (this.filterNode) try { this.filterNode.disconnect(); } catch(e){}
            if (this.outputGain) try { this.outputGain.disconnect(); } catch(e){}

        } catch (error) {
             console.error(`${this.MODULE_ID}: Error during node disconnection phase:`, error);
        } finally {
            // 4. Nullify all references
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
     * Creates the core sound structure: oscillators, note gains, and LFOs.
     * Clears previous structures before building new ones.
     * @param {object} settings - The current mood audio settings.
     * @private
     */
    _createSoundStructure(settings) {
        if (!this.audioContext || !this.filterNode) {
            console.error(`${this.MODULE_ID}: Cannot create sound structure - context or filter missing.`);
            return;
        }
        console.debug(`${this.MODULE_ID}: Creating sound structure...`);

        // --- Clear Previous Sound Structure ---
        try {
            this.notesData.forEach(note => { if (note && note.noteGain) try { note.noteGain.disconnect(); } catch(e){} });
            this.notesData.forEach(note => {
                 if (note && note.oscillators) {
                     note.oscillators.forEach(osc => { if(osc) try { if(osc.stop) osc.stop(0); osc.disconnect(); } catch(e){} });
                 }
            });
            this.notesData = [];
            Object.values(this.lfoNodes).forEach(node => { if(node) try { if(node.stop) node.stop(0); node.disconnect(); } catch(e){} });
            this.lfoNodes = {};
        } catch (cleanupError) {
             console.error(`${this.MODULE_ID}: Error during cleanup in _createSoundStructure:`, cleanupError);
        }

        // --- Get Chord Frequencies ---
        const chordFrequencies = this._getChordFrequencies(settings);
        if (!chordFrequencies || chordFrequencies.length === 0) {
             console.warn(`${this.MODULE_ID}: No valid chord frequencies generated for mood '${this.currentMood}'. Pad will be silent.`);
             return;
        }

        // --- Create Nodes for Each Chord Note ---
        const numNotes = chordFrequencies.length;
        chordFrequencies.forEach(freq => {
            if (freq <= 0) return;

            const noteOscillators = [];
            const noteGain = this.audioContext.createGain();
            noteGain.gain.setValueAtTime(1.0 / Math.max(1, Math.sqrt(numNotes)), this.audioContext.currentTime); // Normalize gain

            const waveform = settings.padWaveform || this.defaultPadSettings.padWaveform;
            const detune = settings.detuneAmount || this.defaultPadSettings.detuneAmount;
            const subGainValue = settings.subOscGain !== undefined ? settings.subOscGain : this.defaultPadSettings.subOscGain;
            const numDetuned = settings.numDetunedOscs !== undefined ? settings.numDetunedOscs : this.defaultPadSettings.numDetunedOscs;

            try {
                // 1. Fundamental Oscillator
                const fundamentalOsc = this.audioContext.createOscillator();
                fundamentalOsc.type = waveform;
                fundamentalOsc.frequency.setValueAtTime(freq, this.audioContext.currentTime);
                fundamentalOsc.connect(noteGain);
                noteOscillators.push(fundamentalOsc);

                // 2. Detuned Oscillators
                for (let i = 0; i < numDetuned; i++) {
                    const detuneOsc = this.audioContext.createOscillator();
                    detuneOsc.type = waveform;
                    detuneOsc.frequency.setValueAtTime(freq, this.audioContext.currentTime);
                    const detuneDirection = (i % 2 === 0) ? 1 : -1;
                    const detuneAmount = detune * (1.0 + Math.random() * 0.1);
                    detuneOsc.detune.setValueAtTime(detuneDirection * detuneAmount, this.audioContext.currentTime);
                    detuneOsc.connect(noteGain);
                    detuneOsc.isDetunedPos = detuneDirection > 0;
                    detuneOsc.isDetunedNeg = detuneDirection < 0;
                    noteOscillators.push(detuneOsc);
                }

                // 3. Sub Oscillator (Optional)
                if (subGainValue > 0.01) {
                    const subOsc = this.audioContext.createOscillator();
                    subOsc.type = 'sine';
                    subOsc.frequency.setValueAtTime(freq * 0.5, this.audioContext.currentTime);
                    const subOscGainNode = this.audioContext.createGain();
                    subOscGainNode.gain.setValueAtTime(subGainValue, this.audioContext.currentTime);
                    subOsc.connect(subOscGainNode);
                    subOscGainNode.connect(noteGain);
                    subOsc.isSubOsc = true;
                    noteOscillators.push(subOsc);
                }

                this.notesData.push({ freq, oscillators: noteOscillators, noteGain });

            } catch (oscError) {
                 console.error(`${this.MODULE_ID}: Error creating oscillators/gain for freq ${freq}:`, oscError);
                 noteOscillators.forEach(osc => { if(osc) try { osc.disconnect(); } catch(e){} });
                 if(noteGain) try { noteGain.disconnect(); } catch(e){}
            }
        });

        // --- Create LFOs ---
        try {
            // Filter LFO
            this.lfoNodes.filterLFO = this.audioContext.createOscillator();
            this.lfoNodes.filterLFO.type = 'sine';
            this.lfoNodes.filterLFO.frequency.setValueAtTime(settings.filterLFORate || 0.08, this.audioContext.currentTime);
            this.lfoNodes.filterLFOGain = this.audioContext.createGain();
            this.lfoNodes.filterLFOGain.gain.setValueAtTime(settings.filterLFODepth || 300, this.audioContext.currentTime);
            this.lfoNodes.filterLFO.connect(this.lfoNodes.filterLFOGain);

            // Pitch LFO
            this.lfoNodes.pitchLFO = this.audioContext.createOscillator();
            this.lfoNodes.pitchLFO.type = 'sine';
            this.lfoNodes.pitchLFO.frequency.setValueAtTime(settings.pitchLFORate || 0.11, this.audioContext.currentTime);
            this.lfoNodes.pitchLFO.phase = Math.random() * Math.PI * 2; // Random phase for uniqueness
            this.lfoNodes.pitchLFOGain = this.audioContext.createGain();
            this.lfoNodes.pitchLFOGain.gain.setValueAtTime(settings.pitchLFODepth || 2.0, this.audioContext.currentTime);
            this.lfoNodes.pitchLFO.connect(this.lfoNodes.pitchLFOGain);
        } catch (lfoError) {
            console.error(`${this.MODULE_ID}: Error creating LFOs:`, lfoError);
            Object.values(this.lfoNodes).forEach(node => { if(node) try { node.disconnect(); } catch(e){} });
            this.lfoNodes = {};
        }

        console.debug(`${this.MODULE_ID}: Created ${this.notesData.length} notes with layers.`);
    }

    /**
     * Connects the LFO modulation outputs to their target AudioParams.
     * @private
     */
     _connectLFOs() {
         if (!this.audioContext || !this.filterNode) {
             console.warn(`${this.MODULE_ID}: Cannot connect LFOs - context or filter node missing.`);
             return;
         }
         try {
             // Connect Filter LFO Gain -> Filter Frequency Param
             if (this.lfoNodes.filterLFOGain && this.filterNode.frequency) {
                 this.lfoNodes.filterLFOGain.connect(this.filterNode.frequency);
             } else {
                  console.warn(`${this.MODULE_ID}: Filter LFO Gain or Filter Frequency target missing.`);
             }

             // Connect Pitch LFO Gain -> Oscillator Detune Param for non-sub oscillators
             if (this.lfoNodes.pitchLFOGain) {
                 this.notesData.forEach(note => {
                     if (note && note.oscillators) {
                         note.oscillators.forEach(osc => {
                             if (osc && osc.detune && !osc.isSubOsc) {
                                 try {
                                     this.lfoNodes.pitchLFOGain.connect(osc.detune);
                                 } catch (connectError) {
                                     console.error(`${this.MODULE_ID}: Error connecting pitch LFO to oscillator detune for freq ${note.freq}:`, connectError);
                                 }
                             }
                         });
                     }
                 });
             } else {
                  console.warn(`${this.MODULE_ID}: Pitch LFO Gain missing.`);
             }
         } catch (error) {
              console.error(`${this.MODULE_ID}: General error connecting LFOs:`, error);
         }
     }

    /**
     * Calculates the frequencies for the pad chord based on settings.
     * @param {object} settings - The mood audio settings.
     * @returns {number[]} An array of frequencies, or empty array on error.
     * @private
     */
    _getChordFrequencies(settings) {
        try {
            const baseFreq = settings.baseFreq || this.defaultPadSettings.baseFreq;
            const chordIntervals = settings.chordNotes || this.defaultPadSettings.chordNotes;

            if (!baseFreq || baseFreq <= 0) throw new Error(`Invalid baseFreq: ${baseFreq}`);
            if (!Array.isArray(chordIntervals) || chordIntervals.length === 0) {
                 console.warn(`${this.MODULE_ID}: chordNotes array invalid/empty. Using base frequency.`);
                 return [baseFreq];
            }

            const frequencies = chordIntervals.map(interval => {
                if (typeof interval !== 'number') {
                    console.warn(`${this.MODULE_ID}: Invalid interval ${interval}. Skipping.`);
                    return 0;
                }
                return baseFreq * Math.pow(2, interval / 12);
            });
            return frequencies.filter(freq => freq > 0);

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error calculating chord frequencies:`, error);
            return [];
        }
    }

     /**
      * Calculates a detuned frequency.
      * @param {number} baseFreq - The base frequency in Hz.
      * @param {number} cents - The detuning amount in cents (+/-).
      * @returns {number} The detuned frequency in Hz.
      * @private
      */
     _detuneFreq(baseFreq, cents) {
         if (typeof baseFreq !== 'number' || baseFreq <= 0 || typeof cents !== 'number') {
             console.warn(`${this.MODULE_ID}: Invalid input to _detuneFreq. Base: ${baseFreq}, Cents: ${cents}`);
             return baseFreq;
         }
         try {
            return baseFreq * Math.pow(2, cents / 1200);
         } catch (error) {
              console.error(`${this.MODULE_ID}: Error calculating detuned frequency:`, error);
              return baseFreq;
         }
     }

} // End class AEPadWarmAnalog

// Make globally accessible for the AudioEngine
window.AEPadWarmAnalog = AEPadWarmAnalog;

console.log("ae_padWarmAnalog.js loaded and AEPadWarmAnalog class defined.");