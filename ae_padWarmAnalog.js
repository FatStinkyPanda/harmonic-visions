// ae_padWarmAnalog.js - Audio Module for Warm Analog-Style Pads
// Part of the Harmonic Visions project by FatStinkyPanda
// Copyright (c) 2025 FatStinkyPanda - All rights reserved.
// Version: 1.0.0 (Initial Implementation)

/**
 * @class AEPadWarmAnalog
 * @description Generates warm, evolving analog-style pad sounds.
 *              Uses filtered sawtooth/triangle waves, detuning, and slow LFO modulation.
 *              Implements the standard AudioEngine module interface.
 */
class AEPadWarmAnalog {
    constructor() {
        this.MODULE_ID = 'AEPadWarmAnalog'; // For logging
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
        this.notesData = []; // Array to store { freq, oscillators: [], noteGain } for each note
        this.lfoNodes = {}; // Stores LFOs { filterLFO, filterLFOGain, pitchLFO, pitchLFOGain }

        // Default settings specifically for a warm analog pad sound
        this.defaultPadSettings = {
            padVolume: 0.35,
            padWaveform: 'sawtooth', // Sawtooth filtered low often sounds warmest
            detuneAmount: 6,        // Subtle detuning in cents
            subOscGain: 0.5,        // Generous sub for warmth
            filterType: 'lowpass',
            filterFreq: 700,        // Lower cutoff for warmth
            filterQ: 1.2,           // Subtle resonance
            filterLFORate: 0.08,    // Very slow filter sweep
            filterLFODepth: 250,    // Moderate sweep depth
            pitchLFORate: 0.12,     // Slow pitch drift/chorus
            pitchLFODepth: 1.8,     // Very subtle pitch modulation depth (cents)
            attackTime: 2.5,        // Slow attack
            releaseTime: 4.0,       // Long release
            scale: 'major',         // Default scale if not provided
            baseFreq: 110,          // Lower base frequency (A2)
            chordNotes: [0, 7, 16], // Example: Root, Fifth, Major Third (spread voicing)
        };

        console.log(`${this.MODULE_ID}: Instance created.`);
    }

    // --- Core Module Methods (Following AudioEngine Interface) ---

    /**
     * Initialize audio nodes based on initial mood settings.
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
            // Merge initial settings with specific defaults for this pad type
            this.settings = { ...this.defaultPadSettings, ...initialSettings };
            this.currentMood = initialMood;

            // --- Create Core Nodes ---
            this.outputGain = this.audioContext.createGain();
            this.outputGain.gain.value = 0.0001; // Start silent

            this.filterNode = this.audioContext.createBiquadFilter();
            this.filterNode.type = this.settings.filterType || 'lowpass';
            this.filterNode.frequency.setValueAtTime(this.settings.filterFreq, this.audioContext.currentTime);
            this.filterNode.Q.setValueAtTime(this.settings.filterQ, this.audioContext.currentTime);

            // --- Create Oscillators and LFOs ---
            this._createSoundStructure(this.settings);

            // --- Connect Audio Graph ---
            // Note Gains -> Filter -> Output Gain -> Master Output
            this.notesData.forEach(note => {
                if (note.noteGain) note.noteGain.connect(this.filterNode);
            });
            this.filterNode.connect(this.outputGain);
            this.outputGain.connect(this.masterOutput);

            // --- Connect LFOs ---
            this._connectLFOs();

            this.isEnabled = true;
            console.log(`${this.MODULE_ID}: Initialization complete.`);

        } catch (error) {
            console.error(`${this.MODULE_ID}: Initialization failed:`, error);
            this.dispose(); // Cleanup partial initialization
            throw error; // Propagate error
        }
    }

    /**
     * Update LFOs or other parameters based on external inputs (optional).
     */
    update(time, mood, visualParams, audioParams, deltaTime) {
        if (!this.isEnabled || !this.isPlaying || !this.audioContext) return;

        // Keep updates minimal for performance unless specific reactivity is needed.
        // Example: Slightly modulate LFO rates based on global intensity
        // try {
        //     if (this.lfoNodes.filterLFO && visualParams?.globalIntensity) {
        //         const baseRate = this.settings.filterLFORate || 0.08;
        //         const targetRate = baseRate * (0.8 + visualParams.globalIntensity * 0.4);
        //         this.lfoNodes.filterLFO.frequency.setTargetAtTime(
        //             targetRate,
        //             this.audioContext.currentTime,
        //             0.8 // Slow transition time constant
        //         );
        //     }
        //      if (this.lfoNodes.pitchLFO && visualParams?.globalIntensity) {
        //         const baseRate = this.settings.pitchLFORate || 0.12;
        //         const targetRate = baseRate * (0.9 + visualParams.globalIntensity * 0.2);
        //         this.lfoNodes.pitchLFO.frequency.setTargetAtTime(
        //             targetRate,
        //             this.audioContext.currentTime,
        //             0.8 // Slow transition time constant
        //         );
        //     }
        // } catch (error) {
        //     console.error(`${this.MODULE_ID}: Error during update:`, error);
        // }
    }

    /**
     * Start playback and apply attack envelope.
     */
    play(startTime) {
        if (!this.isEnabled || this.isPlaying) return;
        if (!this.audioContext) {
             console.error(`${this.MODULE_ID}: Cannot play, AudioContext is missing.`);
             return;
        }
        console.log(`${this.MODULE_ID}: Starting playback at ${startTime.toFixed(3)}`);

        try {
            // Ensure nodes are created if play is called after potential disposal/re-init
            if (this.notesData.length === 0) {
                 console.warn(`${this.MODULE_ID}: No sound structure exists, recreating before play.`);
                 this._createSoundStructure(this.settings);
                 this.notesData.forEach(note => { if (note.noteGain) note.noteGain.connect(this.filterNode); });
                 this._connectLFOs();
            }

            // Start Oscillators and LFOs
            this.notesData.forEach(note => {
                note.oscillators.forEach(osc => {
                    if (osc && osc.start) {
                        try { osc.start(startTime); } catch (e) { /* Likely already started */ }
                    }
                });
            });
            Object.values(this.lfoNodes).forEach(node => {
                 if (node && node.frequency && node.start) { // Check if it's an oscillator
                     try { node.start(startTime); } catch (e) { /* Likely already started */ }
                 }
            });

            // Apply Attack Envelope
            const attackTime = this.settings.attackTime || this.defaultPadSettings.attackTime;
            const targetVolume = this.settings.padVolume || this.defaultPadSettings.padVolume;

            this.outputGain.gain.cancelScheduledValues(startTime);
            this.outputGain.gain.setValueAtTime(0.0001, startTime);
            this.outputGain.gain.linearRampToValueAtTime(targetVolume, startTime + attackTime);

            this.isPlaying = true;

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during play():`, error);
            this.isPlaying = false;
        }
    }

    /**
     * Stop playback and apply release envelope.
     */
    stop(stopTime, fadeDuration = 0.5) {
        if (!this.isEnabled || !this.isPlaying) return;
        if (!this.audioContext) {
             console.error(`${this.MODULE_ID}: Cannot stop, AudioContext is missing.`);
             return;
        }
        console.log(`${this.MODULE_ID}: Stopping playback at ${stopTime.toFixed(3)}`);

        try {
            // Apply Release Envelope
            const releaseTime = this.settings.releaseTime || this.defaultPadSettings.releaseTime;
            const timeConstant = releaseTime / 3.0; // Exponential decay time constant

            this.outputGain.gain.cancelScheduledValues(stopTime);
            // Ensure gain doesn't jump if stopped during attack
            const currentGain = this.outputGain.gain.value;
            this.outputGain.gain.setValueAtTime(currentGain, stopTime);
            this.outputGain.gain.setTargetAtTime(0.0001, stopTime, timeConstant);

            // Schedule Oscillator/LFO Stop
            const scheduleStopTime = stopTime + releaseTime + 0.3; // Stop well after fade
            this.notesData.forEach(note => {
                note.oscillators.forEach(osc => {
                    if (osc && osc.stop) try { osc.stop(scheduleStopTime); } catch (e) { /* ignore */ }
                });
            });
             Object.values(this.lfoNodes).forEach(node => {
                 if (node && node.frequency && node.stop) { // Check if it's an oscillator
                     try { node.stop(scheduleStopTime); } catch (e) { /* ignore */ }
                 }
             });

            this.isPlaying = false;

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during stop():`, error);
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
            // Merge new settings with specific defaults for this pad type
            this.settings = { ...this.defaultPadSettings, ...newSettings };
            this.currentMood = newMood;

            const now = this.audioContext.currentTime;
            const rampTime = transitionTime * 0.6; // Use a portion of transition time for ramps

            // --- Smoothly Transition Parameters ---

            // 1. Output Volume
            if (this.outputGain) {
                const targetVolume = this.isPlaying ? this.settings.padVolume : 0.0001;
                this.outputGain.gain.cancelScheduledValues(now);
                this.outputGain.gain.setTargetAtTime(targetVolume, now, rampTime / 3); // Faster volume ramp
            }

            // 2. Filter Parameters
            if (this.filterNode) {
                // Filter type change (immediate)
                const newFilterType = this.settings.filterType || 'lowpass';
                if (this.filterNode.type !== newFilterType) {
                    this.filterNode.type = newFilterType;
                }
                this.filterNode.frequency.setTargetAtTime(this.settings.filterFreq, now, rampTime);
                this.filterNode.Q.setTargetAtTime(this.settings.filterQ, now, rampTime);
            }

            // 3. LFO Parameters
            if (this.lfoNodes.filterLFO && this.lfoNodes.filterLFOGain) {
                this.lfoNodes.filterLFO.frequency.setTargetAtTime(this.settings.filterLFORate, now, rampTime);
                this.lfoNodes.filterLFOGain.gain.setTargetAtTime(this.settings.filterLFODepth, now, rampTime);
            }
            if (this.lfoNodes.pitchLFO && this.lfoNodes.pitchLFOGain) {
                this.lfoNodes.pitchLFO.frequency.setTargetAtTime(this.settings.pitchLFORate, now, rampTime);
                this.lfoNodes.pitchLFOGain.gain.setTargetAtTime(this.settings.pitchLFODepth, now, rampTime);
            }

            // 4. Oscillator Parameters (Frequencies & Waveform)
            const newChordFreqs = this._getChordFrequencies(this.settings);
            const newWaveform = this.settings.padWaveform || 'sawtooth'; // Default specific to this module

            // Strategy: Recreate sound structure if chord notes change, otherwise adjust existing.
            if (newChordFreqs.length !== this.notesData.length) {
                console.warn(`${this.MODULE_ID}: Chord note count changed. Recreating sound structure.`);
                const quickStopTime = now + 0.1;
                this.notesData.forEach(note => note.oscillators.forEach(osc => { if(osc && osc.stop) try { osc.stop(quickStopTime); } catch(e){} }));
                this._createSoundStructure(this.settings); // Rebuild oscillators/LFOs
                this.notesData.forEach(note => { if (note.noteGain) note.noteGain.connect(this.filterNode); }); // Reconnect notes
                this._connectLFOs(); // Reconnect LFOs
                if (this.isPlaying) { // Restart if playing
                    const restartTime = quickStopTime + 0.05;
                    this.notesData.forEach(note => note.oscillators.forEach(osc => { if(osc && osc.start) try { osc.start(restartTime); } catch(e){} }));
                    Object.values(this.lfoNodes).forEach(node => { if (node && node.start && node.frequency) try { node.start(restartTime); } catch(e){} });
                }
            } else {
                // Adjust existing oscillators
                this.notesData.forEach((noteData, index) => {
                    const newFreq = newChordFreqs[index];
                    noteData.freq = newFreq; // Update stored freq
                    noteData.oscillators.forEach(osc => {
                        if (osc) {
                            // Calculate target frequency considering sub/detune
                            let targetOscFreq = newFreq;
                            const detuneAmount = this.settings.detuneAmount;
                            if (osc.isSubOsc) targetOscFreq *= 0.5;
                            // Re-apply detune based on new frequency and settings
                            if (osc.isDetunedPos && osc.detune) osc.detune.setTargetAtTime(detuneAmount, now, rampTime / 2);
                            else if (osc.isDetunedNeg && osc.detune) osc.detune.setTargetAtTime(-detuneAmount, now, rampTime / 2);

                            // Ramp base frequency (don't ramp detune param itself, ramp frequency for detuned oscs)
                            if(!osc.isDetunedPos && !osc.isDetunedNeg) {
                                osc.frequency.setTargetAtTime(targetOscFreq, now, rampTime);
                            } else {
                                // For detuned oscillators, calculate target freq including detune and ramp *that*
                                let detunedTargetFreq = newFreq;
                                if(osc.isDetunedPos) detunedTargetFreq = this._detuneFreq(newFreq, detuneAmount);
                                if(osc.isDetunedNeg) detunedTargetFreq = this._detuneFreq(newFreq, -detuneAmount);
                                osc.frequency.setTargetAtTime(detunedTargetFreq, now, rampTime);
                            }


                            // Waveform change (immediate)
                            if (osc.type !== newWaveform && !osc.isSubOsc) {
                                osc.type = newWaveform;
                            }
                        }
                    });
                });
            }

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during changeMood():`, error);
             if(typeof ToastSystem !== 'undefined') ToastSystem.notify('error', 'Error changing warm pad mood.');
        }
    }

    /**
     * Clean up all audio resources.
     */
    dispose() {
        console.log(`${this.MODULE_ID}: Disposing...`);
        if (!this.isEnabled && this.notesData.length === 0 && !this.outputGain) {
             return; // Already clean/uninitialized
        }
        this.isEnabled = false;
        this.isPlaying = false;

        try {
            // Stop and disconnect oscillators/gains
            this.notesData.forEach(note => {
                note.oscillators.forEach(osc => { if(osc) try { if(osc.stop) osc.stop(0); osc.disconnect(); } catch(e){} });
                if(note.noteGain) try { note.noteGain.disconnect(); } catch(e){}
            });
            // Stop and disconnect LFOs
            Object.values(this.lfoNodes).forEach(node => { if(node) try { if(node.stop) node.stop(0); node.disconnect(); } catch(e){} });
            // Disconnect filter and output
            if(this.filterNode) try { this.filterNode.disconnect(); } catch(e){}
            if(this.outputGain) try { this.outputGain.disconnect(); } catch(e){}
        } catch (error) {
             console.error(`${this.MODULE_ID}: Error during node disconnection:`, error);
        } finally {
            // Clear state regardless of disconnection errors
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
     * Creates the oscillators, LFOs, and gain structure for the pad sound.
     * @param {object} settings - The current settings object.
     * @private
     */
    _createSoundStructure(settings) {
        if (!this.audioContext) return;
        console.log(`${this.MODULE_ID}: Creating sound structure...`);

        // Clear previous structures safely
        this.notesData.forEach(note => {
             note.oscillators.forEach(osc => { if(osc) try { if(osc.stop) osc.stop(0); osc.disconnect(); } catch(e){} });
             if(note.noteGain) try { note.noteGain.disconnect(); } catch(e){}
        });
        this.notesData = [];
        Object.values(this.lfoNodes).forEach(node => { if(node) try { if(node.stop) node.stop(0); node.disconnect(); } catch(e){} });
        this.lfoNodes = {};

        const chordFrequencies = this._getChordFrequencies(settings);
        if (!chordFrequencies || chordFrequencies.length === 0) {
             console.warn(`${this.MODULE_ID}: No chord frequencies generated for mood '${this.currentMood}'.`);
             return;
        }

        // Create nodes per note
        chordFrequencies.forEach(freq => {
            if (freq <= 0) return;
            const noteOscillators = [];
            const noteGain = this.audioContext.createGain();
            noteGain.gain.value = 1.0 / Math.max(1, chordFrequencies.length); // Normalize volume

            const waveform = settings.padWaveform;
            const detune = settings.detuneAmount;
            const subGainValue = settings.subOscGain;

            // Fundamental
            const fundamentalOsc = this.audioContext.createOscillator();
            fundamentalOsc.type = waveform;
            fundamentalOsc.frequency.setValueAtTime(freq, this.audioContext.currentTime);
            fundamentalOsc.connect(noteGain);
            noteOscillators.push(fundamentalOsc);

            // Detuned +
            const detunedOscPos = this.audioContext.createOscillator();
            detunedOscPos.type = waveform;
            detunedOscPos.frequency.setValueAtTime(this._detuneFreq(freq, detune), this.audioContext.currentTime); // Set detuned freq directly
            detunedOscPos.connect(noteGain);
            detunedOscPos.isDetunedPos = true;
            noteOscillators.push(detunedOscPos);

            // Detuned -
            const detunedOscNeg = this.audioContext.createOscillator();
            detunedOscNeg.type = waveform;
            detunedOscNeg.frequency.setValueAtTime(this._detuneFreq(freq, -detune), this.audioContext.currentTime); // Set detuned freq directly
            detunedOscNeg.connect(noteGain);
            detunedOscNeg.isDetunedNeg = true;
            noteOscillators.push(detunedOscNeg);

            // Sub Oscillator
            if (subGainValue > 0.01) {
                const subOsc = this.audioContext.createOscillator();
                subOsc.type = 'sine';
                subOsc.frequency.setValueAtTime(freq * 0.5, this.audioContext.currentTime);
                const subOscGainNode = this.audioContext.createGain();
                subOscGainNode.gain.value = subGainValue;
                subOsc.connect(subOscGainNode);
                subOscGainNode.connect(noteGain);
                subOsc.isSubOsc = true;
                noteOscillators.push(subOsc);
            }

            this.notesData.push({ freq, oscillators: noteOscillators, noteGain });
        });

        // Create LFOs
        this.lfoNodes.filterLFO = this.audioContext.createOscillator();
        this.lfoNodes.filterLFO.type = 'sine';
        this.lfoNodes.filterLFO.frequency.setValueAtTime(settings.filterLFORate, this.audioContext.currentTime);
        this.lfoNodes.filterLFOGain = this.audioContext.createGain();
        this.lfoNodes.filterLFOGain.gain.setValueAtTime(settings.filterLFODepth, this.audioContext.currentTime);
        this.lfoNodes.filterLFO.connect(this.lfoNodes.filterLFOGain);

        this.lfoNodes.pitchLFO = this.audioContext.createOscillator();
        this.lfoNodes.pitchLFO.type = 'sine';
        this.lfoNodes.pitchLFO.frequency.setValueAtTime(settings.pitchLFORate, this.audioContext.currentTime);
        // Add random phase offset for uniqueness
        this.lfoNodes.pitchLFO.phase = Math.random() * Math.PI * 2;
        this.lfoNodes.pitchLFOGain = this.audioContext.createGain();
        this.lfoNodes.pitchLFOGain.gain.setValueAtTime(settings.pitchLFODepth, this.audioContext.currentTime);
        this.lfoNodes.pitchLFO.connect(this.lfoNodes.pitchLFOGain);
    }

    /**
     * Connects LFOs to their modulation targets.
     * @private
     */
    _connectLFOs() {
        if (!this.audioContext || !this.filterNode) return;
        try {
            // Filter LFO -> Filter Frequency
            if (this.lfoNodes.filterLFOGain) {
                this.lfoNodes.filterLFOGain.connect(this.filterNode.frequency);
            }

            // Pitch LFO -> Oscillator Detune (connect to *detune* param, not frequency)
            if (this.lfoNodes.pitchLFOGain) {
                this.notesData.forEach(note => {
                    note.oscillators.forEach(osc => {
                        // Apply pitch LFO to fundamental and *explicitly* detuned oscillators
                        // Avoid modulating the sub-oscillator's pitch typically
                        if (osc && osc.detune && !osc.isSubOsc) {
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
     * Calculates chord frequencies based on settings.
     * @param {object} settings
     * @returns {number[]} Array of frequencies.
     * @private
     */
    _getChordFrequencies(settings) {
        const baseFreq = settings.baseFreq;
        const intervals = settings.chordNotes; // Using direct intervals is best for pads

        if (!intervals || !Array.isArray(intervals) || intervals.length === 0) {
            console.warn(`${this.MODULE_ID}: No valid chordNotes found in settings. Using default [0].`);
            return [baseFreq]; // Default to just the base frequency
        }

        return intervals.map(interval => {
            try {
                return baseFreq * Math.pow(2, interval / 12);
            } catch (e) {
                console.error(`${this.MODULE_ID}: Error calculating frequency for interval ${interval}`, e);
                return 0;
            }
        }).filter(freq => freq > 0);
    }

    /**
     * Calculates detuned frequency.
     * @param {number} baseFreq
     * @param {number} cents
     * @returns {number} Detuned frequency.
     * @private
     */
    _detuneFreq(baseFreq, cents) {
        return baseFreq * Math.pow(2, cents / 1200);
    }

} // End class AEPadWarmAnalog

// Make globally accessible for AudioEngine
window.AEPadWarmAnalog = AEPadWarmAnalog;