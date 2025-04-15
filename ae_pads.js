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

        // Mood Config (0-100 scales for volume, occurrence, intensity)
        this.moodConfig = { volume: 100, occurrence: 100, intensity: 50 }; // Default config
        this.baseSettings = {}; // Store base settings from data.js

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
            // Added base/max values for intensity scaling
            filterQBase: 0.8,
            filterQMax: 4.0,
            filterLFODepthBase: 50,
            filterLFODepthMax: 800,
            pitchLFODepthBase: 0.5,
            pitchLFODepthMax: 8.0,
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
     * @param {object} moodConfig - Volume, occurrence, intensity config (0-100 scale).
     */
    init(audioContext, masterOutputNode, initialSettings, initialMood, moodConfig) {
        if (this.isEnabled) {
            console.warn(`${this.MODULE_ID}: Already initialized.`);
            return;
        }
        console.log(`${this.MODULE_ID}: Initializing for mood '${initialMood}'... Config:`, moodConfig);

        try {
            this.audioContext = audioContext;
            this.masterOutput = masterOutputNode;
            // Store base settings from data.js AND defaultPadSettings for fallback
            this.baseSettings = { ...this.defaultPadSettings, ...initialSettings };
            // Store the specific 0-100 configuration for this mood
            this.moodConfig = { ...this.moodConfig, ...moodConfig };
            this.currentMood = initialMood;

            // Merge initial settings with defaults to ensure all properties exist
            this.settings = { ...this.defaultPadSettings, ...initialSettings };

            // 1. Create Master Output Gain (starts silent)
            this.outputGain = this.audioContext.createGain();
            this.outputGain.gain.value = 0.0001; // Start near zero

            // 2. Create Master Filter
            this.filterNode = this.audioContext.createBiquadFilter();
            this.filterNode.type = this.settings.filterType || 'lowpass';
            this.filterNode.frequency.setValueAtTime(this.settings.filterFreq || 800, this.audioContext.currentTime);
            this.filterNode.Q.setValueAtTime(this.settings.filterQ || 1.5, this.audioContext.currentTime);

            // Apply Initial Mood Config (sets volume gain, initial LFO depths, Q based on 0-100)
            this._applyMoodConfig(0); // Apply immediately

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
            // Subtle continuous modulation could be implemented here
            // For now using intensity via the config system instead

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
            // Use the volume-adjusted value from moodConfig instead of directly using settings.padVolume
            const baseVolume = this.settings.padVolume || this.defaultPadSettings.padVolume;
            const targetVolume = this._mapValue(this.moodConfig.volume, 0.0, baseVolume);

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
     * @param {object} moodConfig - Volume, occurrence, intensity config (0-100 scale).
     */
    changeMood(newMood, newSettings, transitionTime, moodConfig) {
        if (!this.isEnabled) return;
        if (!this.audioContext) {
             console.error(`${this.MODULE_ID}: Cannot change mood, AudioContext is missing.`);
             return;
        }
        console.log(`${this.MODULE_ID}: Changing mood to '${newMood}' over ${transitionTime.toFixed(2)}s... Config:`, moodConfig);

        try {
            const oldSettings = this.settings;
            const oldBaseSettings = this.baseSettings;
            
            // Update base settings and mood config
            this.baseSettings = { ...this.defaultPadSettings, ...newSettings };
            this.moodConfig = { ...this.moodConfig, ...moodConfig };
            this.currentMood = newMood;
            
            // Update current settings (will be modified by _applyMoodConfig)
            this.settings = { ...this.defaultPadSettings, ...newSettings };

            // Apply new mood config with transition - this will update parameters based on intensity
            this._applyMoodConfig(transitionTime);

            const now = this.audioContext.currentTime;
            const rampTime = transitionTime / 2; // Use half transition time for ramps for faster response

            // --- Transition Parameters Not Handled by _applyMoodConfig ---

            // Update filter type if changed (cannot be ramped)
            if (this.filterNode) {
                const newFilterType = this.settings.filterType || 'lowpass';
                if (this.filterNode.type !== newFilterType) {
                    console.warn(`${this.MODULE_ID}: Filter type change (${this.filterNode.type} -> ${newFilterType}) cannot be smoothly transitioned. Changing immediately.`);
                    this.filterNode.type = newFilterType;
                }

                // Base filter frequency is ramped here (not affected by intensity)
                this.filterNode.frequency.setTargetAtTime(this.settings.filterFreq || 800, now, rampTime);
            }

            // Base LFO rates (not affected by intensity)
            if (this.lfoNodes.filterLFO) {
                this.lfoNodes.filterLFO.frequency.setTargetAtTime(this.settings.filterLFORate || 0.1, now, rampTime);
            }
            if (this.lfoNodes.pitchLFO) {
                this.lfoNodes.pitchLFO.frequency.setTargetAtTime(this.settings.pitchLFORate || 0.15, now, rampTime);
            }

            // --- Handle Chord Structure Changes ---
            const newChordFreqs = this._getChordFrequencies(this.settings);
            const newWaveform = this.settings.padWaveform || 'triangle';

            // Check if we need to recreate the entire sound structure
            if (newChordFreqs.length !== this.notesData.length || 
                (oldSettings && oldSettings.padWaveform !== newWaveform)) {
                
                console.warn(`${this.MODULE_ID}: Chord note count or waveform changed. Recreating pad sound.`);
                
                // Stop existing oscillators quickly before recreating
                const quickStopTime = now + 0.1;
                this.notesData.forEach(note => {
                    if (!note || !note.oscillators) return;
                    note.oscillators.forEach(osc => {
                        if (osc && osc.stop) {
                            try { osc.stop(quickStopTime); } catch(e){}
                        }
                    });
                });
                
                // Recreate sound structure (will clear old notesData)
                this._createPadSound(this.settings);
                
                // Reconnect graph
                this.notesData.forEach(note => { 
                    if (note.noteGain) note.noteGain.connect(this.filterNode); 
                });
                this._connectLFOs();
                
                // Restart oscillators if currently playing
                if (this.isPlaying) {
                    const restartTime = quickStopTime + 0.05; // Start slightly after stop
                    this.notesData.forEach(note => {
                        if (!note || !note.oscillators) return;
                        note.oscillators.forEach(osc => { 
                            if (osc && osc.start) {
                                try { osc.start(restartTime); } catch(e){} 
                            }
                        });
                    });
                    
                    Object.values(this.lfoNodes).forEach(node => { 
                        if (node && node.start && node.frequency) {
                            try { node.start(restartTime); } catch(e){} 
                        }
                    });
                }
            } else {
                // Just update frequencies of existing oscillators
                console.log(`${this.MODULE_ID}: Adjusting frequencies for ${newChordFreqs.length} notes.`);
                this.notesData.forEach((noteData, index) => {
                    if (!noteData || index >= newChordFreqs.length) return;
                    
                    const newFreq = newChordFreqs[index];
                    noteData.freq = newFreq; // Update stored frequency
                    
                    if (!noteData.oscillators) return;
                    noteData.oscillators.forEach(osc => {
                        if (!osc) return;
                        
                        // Calculate target frequency considering sub/detune
                        let targetOscFreq = newFreq;
                        if (osc.isSubOsc) targetOscFreq *= 0.5;
                        if (osc.isDetunedPos) targetOscFreq = this._detuneFreq(newFreq, this.settings.detuneAmount || 5);
                        if (osc.isDetunedNeg) targetOscFreq = this._detuneFreq(newFreq, -(this.settings.detuneAmount || 5));

                        osc.frequency.setTargetAtTime(targetOscFreq, now, rampTime);

                        // Waveform change (cannot be ramped, change immediately - might click)
                        const newWaveform = this.settings.padWaveform || 'triangle';
                        if(osc.type !== newWaveform && !osc.isSubOsc) { // Don't change sub's type usually
                            osc.type = newWaveform;
                        }
                    });
                });
            }

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during changeMood():`, error);
            // Attempt to recover or log error prominently
            if(typeof ToastSystem !== 'undefined') ToastSystem.notify('error', 'Error changing pad sound mood.');
        }
    }

    /**
     * Maps a value from 0-100 scale to a target range.
     * @param {number} value0to100 - The value on a 0 to 100 scale
     * @param {number} minTarget - The minimum target value
     * @param {number} maxTarget - The maximum target value
     * @returns {number} The mapped value
     * @private
     */
    _mapValue(value0to100, minTarget, maxTarget) {
        const clampedValue = Math.max(0, Math.min(100, value0to100 ?? 100)); // Default to 100 if undefined
        return minTarget + (maxTarget - minTarget) * (clampedValue / 100.0);
    }

    /**
     * Applies the 0-100 mood configuration to parameters.
     * @param {number} transitionTime - Duration for the transition in seconds.
     * @private
     */
    _applyMoodConfig(transitionTime = 0) {
        if (!this.moodConfig || !this.audioContext || !this.isEnabled) return;

        const now = this.audioContext.currentTime;
        const rampTime = transitionTime > 0 ? transitionTime * 0.6 : 0; // Use a portion for ramps
        const timeConstant = rampTime / 3.0;

        // --- Apply Volume ---
        if (this.outputGain && this.moodConfig.volume !== undefined) {
            // Use padVolume from baseSettings as the 100% target
            const baseVolume = this.baseSettings.padVolume ?? this.defaultPadSettings.padVolume;
            const targetVolume = this._mapValue(this.moodConfig.volume, 0.0, baseVolume);
            console.log(`${this.MODULE_ID}: Applying Volume ${this.moodConfig.volume}/100 -> ${targetVolume.toFixed(3)}`);
            
            // Apply envelope only if playing, otherwise just set value for next play
            if (this.isPlaying) {
                this.outputGain.gain.cancelScheduledValues(now);
                if (rampTime > 0.01) {
                    this.outputGain.gain.setTargetAtTime(targetVolume, now, timeConstant);
                } else {
                    this.outputGain.gain.setValueAtTime(targetVolume, now);
                }
            }
        }

        // --- Apply Occurrence ---
        // For pads, occurrence=100 typically means it's fully on, <100 might reduce voice count
        // or be handled by the coordinator not initializing/disposing the module if occurrence is 0
        if (this.moodConfig.occurrence !== undefined) {
            console.log(`${this.MODULE_ID}: Applying Occurrence ${this.moodConfig.occurrence}/100`);
            // Could implement custom logic here like:
            // - Reduce number of active notes based on occurrence
            // - Reduce sub oscillator volume as occurrence decreases
        }

        // --- Apply Intensity ---
        if (this.moodConfig.intensity !== undefined && this.filterNode) {
            console.log(`${this.MODULE_ID}: Applying Intensity ${this.moodConfig.intensity}/100`);

            // Filter Q (Resonance) - higher intensity = more resonance
            const baseQ = this.baseSettings.filterQBase ?? this.defaultPadSettings.filterQBase;
            const maxQ = this.baseSettings.filterQMax ?? this.defaultPadSettings.filterQMax;
            const targetQ = this._mapValue(this.moodConfig.intensity, baseQ, maxQ);
            console.log(`  -> Filter Q: ${targetQ.toFixed(2)}`);
            if (rampTime > 0.01) {
                this.filterNode.Q.setTargetAtTime(targetQ, now, timeConstant);
            } else {
                this.filterNode.Q.setValueAtTime(targetQ, now);
            }

            // Filter LFO Depth - higher intensity = stronger filter sweeps
            if (this.lfoNodes.filterLFOGain) {
                const baseDepth = this.baseSettings.filterLFODepthBase ?? this.defaultPadSettings.filterLFODepthBase;
                const maxDepth = this.baseSettings.filterLFODepthMax ?? this.defaultPadSettings.filterLFODepthMax;
                const targetDepth = this._mapValue(this.moodConfig.intensity, baseDepth, maxDepth);
                console.log(`  -> Filter LFO Depth: ${targetDepth.toFixed(2)}`);
                if (rampTime > 0.01) {
                    this.lfoNodes.filterLFOGain.gain.setTargetAtTime(targetDepth, now, timeConstant);
                } else {
                    this.lfoNodes.filterLFOGain.gain.setValueAtTime(targetDepth, now);
                }
            }

            // Pitch LFO Depth (Vibrato/Chorus) - higher intensity = more vibrato
            if (this.lfoNodes.pitchLFOGain) {
                const baseDepth = this.baseSettings.pitchLFODepthBase ?? this.defaultPadSettings.pitchLFODepthBase;
                const maxDepth = this.baseSettings.pitchLFODepthMax ?? this.defaultPadSettings.pitchLFODepthMax;
                const targetDepth = this._mapValue(this.moodConfig.intensity, baseDepth, maxDepth);
                console.log(`  -> Pitch LFO Depth: ${targetDepth.toFixed(2)}`);
                if (rampTime > 0.01) {
                    this.lfoNodes.pitchLFOGain.gain.setTargetAtTime(targetDepth, now, timeConstant);
                } else {
                    this.lfoNodes.pitchLFOGain.gain.setValueAtTime(targetDepth, now);
                }
            }
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
            this.baseSettings = null;
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
        
        // Use intensity-modified LFO depth value if available
        const intensityModifiedFilterLFODepth = this.moodConfig && this.moodConfig.intensity !== undefined
            ? this._mapValue(
                this.moodConfig.intensity,
                this.baseSettings.filterLFODepthBase ?? this.defaultPadSettings.filterLFODepthBase,
                this.baseSettings.filterLFODepthMax ?? this.defaultPadSettings.filterLFODepthMax
              )
            : (settings.filterLFODepth || 300);
            
        this.lfoNodes.filterLFOGain.gain.setValueAtTime(intensityModifiedFilterLFODepth, this.audioContext.currentTime);
        this.lfoNodes.filterLFO.connect(this.lfoNodes.filterLFOGain);

        // Pitch LFO (Vibrato/Chorus)
        this.lfoNodes.pitchLFO = this.audioContext.createOscillator();
        this.lfoNodes.pitchLFO.type = 'sine';
        // Add slight random offset to phase for uniqueness
        this.lfoNodes.pitchLFO.phase = Math.random() * Math.PI * 2;
        this.lfoNodes.pitchLFO.frequency.setValueAtTime(settings.pitchLFORate || 0.15, this.audioContext.currentTime);
        this.lfoNodes.pitchLFOGain = this.audioContext.createGain();
        
        // Use intensity-modified pitch LFO depth value if available
        const intensityModifiedPitchLFODepth = this.moodConfig && this.moodConfig.intensity !== undefined
            ? this._mapValue(
                this.moodConfig.intensity,
                this.baseSettings.pitchLFODepthBase ?? this.defaultPadSettings.pitchLFODepthBase,
                this.baseSettings.pitchLFODepthMax ?? this.defaultPadSettings.pitchLFODepthMax
              )
            : (settings.pitchLFODepth || 2.5);
            
        this.lfoNodes.pitchLFOGain.gain.setValueAtTime(intensityModifiedPitchLFODepth, this.audioContext.currentTime);
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