// ae_padSoftString.js - Audio Module for Soft, Evolving String Pads
// Part of the Harmonic Visions project by FatStinkyPanda
// Copyright (c) 2025 FatStinkyPanda - All rights reserved.
// Version: 1.2.0 (Enhanced with Volume/Occurrence/Intensity configuration)

/**
 * @class AEPadSoftString
 * @description Generates a soft, evolving string-like pad sound using multiple
 *              filtered oscillators, detuning, and LFO modulation. Implements
 *              the standard AudioEngine module interface.
 */
class AEPadSoftString {
    constructor() {
        this.MODULE_ID = 'AEPadSoftString'; // For logging and identification
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
        
        // --- Mood Configuration ---
        this.moodConfig = { volume: 100, occurrence: 100, intensity: 50 }; // Default config
        this.baseSettings = {};         // Store base settings from data.js

        // --- Default Settings for Soft Strings ---
        this.defaultPadSettings = {
            padVolume: 0.3,             // Moderate volume, adjust in mix
            padWaveform: 'sawtooth',    // Sawtooth provides rich harmonics to filter
            detuneAmount: 8,            // Cents - subtle detuning for chorus effect
            numDetunedOscs: 2,          // Typically one sharp, one flat
            subOscGain: 0.15,           // Very subtle sine sub-oscillator for grounding
            filterType: 'lowpass',
            filterFreq: 950,            // Starting cutoff frequency (Hz) - relatively low for softness
            filterQ: 1.6,               // Moderate resonance for character without harshness
            filterLFORate: 0.07,        // Very slow filter modulation (Hz)
            filterLFODepth: 450,        // Modulation range for filter cutoff (Hz)
            pitchLFORate: 0.12,         // Slow pitch drift/vibrato (Hz)
            pitchLFODepth: 3.5,         // Subtle pitch modulation depth (cents)
            attackTime: 3.5,            // Slow, smooth attack (seconds)
            releaseTime: 5.0,           // Long, gradual release (seconds)
            // Harmonic content settings (passed from AudioEngine based on data.js)
            scale: 'major',
            baseFreq: 110,              // A2 - Lower base often suits pads
            chordNotes: [0, 7, 16],     // Default: Root, Fifth, Major Third (spread voicing example)
            // --- Parameter range settings for intensity mapping ---
            filterQBase: 0.9,           // Base filter Q value (minimum, when intensity = 0)
            filterQMax: 5.0,            // Maximum filter Q value (when intensity = 100)
            filterLFODepthBase: 150,    // Base filter LFO depth (minimum)
            filterLFODepthMax: 900,     // Maximum filter LFO depth
            pitchLFODepthBase: 1.0,     // Base pitch LFO depth (minimum)
            pitchLFODepthMax: 8.0,      // Maximum pitch LFO depth
            detuneAmountBase: 4,        // Base detune amount (minimum)
            detuneAmountMax: 14,        // Maximum detune amount
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
     * @param {object} moodConfig - The volume/occurrence/intensity configuration (0-100 values).
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
            this.audioContext = audioContext;
            this.masterOutput = masterOutputNode;
            
            // Store base settings for mixin with defaults
            this.baseSettings = { ...this.defaultPadSettings, ...initialSettings };
            // Store specific 0-100 mood configuration
            this.moodConfig = { ...this.moodConfig, ...moodConfig };
            // Merge settings for actual use (will be modified by _applyMoodConfig)
            this.settings = { ...this.baseSettings };
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

            // Apply mood configuration before creating oscillators (so intensity affects creation params)
            this._applyMoodConfig(0); // Apply immediately (no transition)

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
                ToastSystem.notify('error', `Soft String Pad init failed: ${error.message}`);
            }
            this.dispose(); // Cleanup partial initialization
            this.isEnabled = false; // Ensure state is correct
            // Do not re-throw typically, allow AudioEngine to handle module failure gracefully
        }
    }

    /**
     * Update loop hook. Called frequently by AudioEngine.
     * Keep minimal for performance. Can add subtle parameter drift.
     * @param {number} time - Current elapsed time (from AudioEngine clock).
     * @param {string} mood - Current mood key.
     * @param {object} visualParams - Parameters from the visual system.
     * @param {object} audioParams - Parameters derived from mood settings (tempo, scale, etc.).
     * @param {number} deltaTime - Time since last frame.
     */
    update(time, mood, visualParams, audioParams, deltaTime) {
        if (!this.isEnabled || !this.isPlaying || !this.audioContext) return;

        // Example: Slightly modulate filter Q based on dreaminess for more/less resonance
        // try {
        //     if (this.filterNode && visualParams?.dreaminess !== undefined) {
        //         const baseQ = this.settings.filterQ || 1.6;
        //         // Increase Q slightly when less dreamy, decrease when more dreamy
        //         const targetQ = baseQ * (1.0 + (0.5 - visualParams.dreaminess) * 0.3);
        //         this.filterNode.Q.setTargetAtTime(
        //             Math.max(0.5, Math.min(targetQ, 4.0)), // Clamp Q value
        //             this.audioContext.currentTime,
        //             0.5 // Slow transition time constant
        //         );
        //     }
        // } catch (error) {
        //     console.error(`${this.MODULE_ID}: Error during update:`, error);
        //     // Potentially disable module if update errors persist frequently
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
            // Ensure sound structure exists (might have been disposed after stop)
             if (this.notesData.length === 0) {
                 console.warn(`${this.MODULE_ID}: Sound structure missing, recreating before play.`);
                 this._createSoundStructure(this.settings);
                 this.notesData.forEach(note => { if (note && note.noteGain) note.noteGain.connect(this.filterNode); });
                 this._connectLFOs();
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
                     try {
                         node.start(targetStartTime);
                     } catch (e) { /* ignore if already started */ }
                 }
            });

            // 2. Apply Attack Envelope via Output Gain
            const attackTime = this.settings.attackTime || this.defaultPadSettings.attackTime;
            // Use the volume-adjusted padVolume from settings (modified by _applyMoodConfig)
            const targetVolume = this.settings.padVolume;

            this.outputGain.gain.cancelScheduledValues(targetStartTime);
            this.outputGain.gain.setValueAtTime(0.0001, targetStartTime); // Start from near silence
            this.outputGain.gain.linearRampToValueAtTime(targetVolume, targetStartTime + attackTime);

            this.isPlaying = true;

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during play():`, error);
            this.isPlaying = false; // Ensure state is correct on error
             if (typeof ToastSystem !== 'undefined') {
                 ToastSystem.notify('error', `String Pad play failed: ${error.message}`);
             }
        }
    }

    /**
     * Stop playing the pad sound.
     * @param {number} stopTime - AudioContext time when playback should stop.
     * @param {number} [fadeDuration=0.5] - Suggested duration for fade-out (overridden by releaseTime).
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
            const timeConstant = releaseTime / 3.0; // Time constant for exponential decay

            this.outputGain.gain.cancelScheduledValues(targetStopTime);
            // Get current gain for smooth start of release, important if stopped during attack
            const currentGain = this.outputGain.gain.value;
            this.outputGain.gain.setValueAtTime(currentGain, targetStopTime);
            this.outputGain.gain.setTargetAtTime(0.0001, targetStopTime, timeConstant);

            // 2. Schedule Oscillator/LFO Stop - *after* the release envelope completes
            // This prevents abrupt sound cutoff and allows the release tail to finish naturally.
            const scheduleNodeStopTime = targetStopTime + releaseTime + 0.3; // Add buffer

            this.notesData.forEach(note => {
                if (note && note.oscillators) {
                    note.oscillators.forEach(osc => {
                        if (osc && osc.stop) {
                            try {
                                osc.stop(scheduleNodeStopTime);
                            } catch (e) { /* Ignore errors on stop, might already be stopped */ }
                        }
                    });
                }
            });
            Object.values(this.lfoNodes).forEach(node => {
                 if (node && node.frequency && node.stop) { // Check if it's an oscillator node
                     try {
                         node.stop(scheduleNodeStopTime);
                     } catch (e) { /* ignore */ }
                 }
             });

            // Crucially, set isPlaying to false *now*, even though nodes stop later.
            this.isPlaying = false;

             // Optimization: Mark oscillators for recreation on next play call, as stop() is final.
             // We will handle this recreation logic within the play() method itself.
             // Setting this.notesData = [] here would be too early if a mood change happens during release.

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during stop():`, error);
            // Attempt to force state even on error
            this.isPlaying = false;
             if (typeof ToastSystem !== 'undefined') {
                 ToastSystem.notify('error', `String Pad stop failed: ${error.message}`);
             }
        }
    }

    /**
     * Smoothly transition parameters to match a new mood.
     * @param {string} newMood - The key of the new mood.
     * @param {object} newSettings - The moodAudioSettings for the new mood.
     * @param {number} transitionTime - Duration for the transition in seconds.
     * @param {object} moodConfig - The volume/occurrence/intensity configuration (0-100 values).
     */
    changeMood(newMood, newSettings, transitionTime, moodConfig) {
        if (!this.isEnabled) return;
        if (!this.audioContext) {
             console.error(`${this.MODULE_ID}: Cannot change mood, AudioContext is missing.`);
             return;
        }
        console.log(`${this.MODULE_ID}: Changing mood to '${newMood}' over ${transitionTime.toFixed(2)}s. Config:`, moodConfig);

        try {
            // Store the original base settings before any mood config is applied
            this.baseSettings = { ...this.defaultPadSettings, ...newSettings };
            // Update mood configuration
            this.moodConfig = { ...this.moodConfig, ...moodConfig };
            this.currentMood = newMood;
            
            // Apply new mood config with transition (will update volume, filter settings, LFO depths)
            this._applyMoodConfig(transitionTime);
            
            const now = this.audioContext.currentTime;
            const rampTime = transitionTime * 0.7; // Use a good portion for smooth parameter ramps

            // --- Update Filter Type ---
            if (this.filterNode) {
                // Filter type change (immediate, cannot be ramped)
                const newFilterType = this.settings.filterType || 'lowpass';
                if (this.filterNode.type !== newFilterType) {
                    console.warn(`${this.MODULE_ID}: Filter type changed (${this.filterNode.type} -> ${newFilterType}). Changing immediately.`);
                    this.filterNode.type = newFilterType;
                }
                // Filter frequency is updated by _applyMoodConfig
            }

            // --- Update LFO Rates (not part of intensity) ---
            if (this.lfoNodes.filterLFO) {
                this.lfoNodes.filterLFO.frequency.setTargetAtTime(
                    this.settings.filterLFORate, 
                    now, 
                    rampTime
                );
            }
            if (this.lfoNodes.pitchLFO) {
                this.lfoNodes.pitchLFO.frequency.setTargetAtTime(
                    this.settings.pitchLFORate, 
                    now, 
                    rampTime
                );
            }

            // --- Update Oscillator Parameters (Frequencies, Waveform, Detune) ---
            const newChordFreqs = this._getChordFrequencies(this.settings);
            const newWaveform = this.settings.padWaveform || 'sawtooth';
            // Detune is adjusted by _applyMoodConfig based on intensity
            const newDetune = this.settings.detuneAmount;

            // --- Strategy: Recreate if chord structure changes, otherwise ramp existing ---
            if (newChordFreqs.length !== this.notesData.length) {
                 console.warn(`${this.MODULE_ID}: Chord note count changed (${this.notesData.length} -> ${newChordFreqs.length}). Recreating sound structure.`);
                 // Stop existing oscillators quickly before recreating
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
                      const restartTime = quickStopTime + 0.05; // Start slightly after stop
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
                     if (!noteData || !noteData.oscillators) return; // Safety check

                     const newFreq = newChordFreqs[index];
                     noteData.freq = newFreq; // Update stored frequency

                     noteData.oscillators.forEach(osc => {
                         if (osc) {
                             // Waveform change (immediate)
                             if (osc.type !== newWaveform && !osc.isSubOsc) { // Don't change sub type usually
                                 osc.type = newWaveform;
                             }

                             // Calculate target frequency considering sub/detune
                             let targetOscFreq = newFreq;
                             let targetDetuneValue = 0; // For pitch LFO target

                             if (osc.isSubOsc) {
                                 targetOscFreq *= 0.5;
                             } else if (osc.isDetunedPos) {
                                 // For explicitly detuned oscillators, ramp the *frequency* directly
                                 targetOscFreq = this._detuneFreq(newFreq, newDetune);
                                 targetDetuneValue = newDetune; // Base detune for LFO
                             } else if (osc.isDetunedNeg) {
                                 targetOscFreq = this._detuneFreq(newFreq, -newDetune);
                                 targetDetuneValue = -newDetune; // Base detune for LFO
                             }

                             // Ramp frequency
                             osc.frequency.setTargetAtTime(targetOscFreq, now, rampTime);

                             // Re-apply base detune value if oscillator has detune param (for LFO modulation base)
                             if (osc.detune && !osc.isSubOsc) {
                                 // Smoothly ramp the base detune value itself
                                 // The pitch LFO adds modulation on top of this base value.
                                 osc.detune.setTargetAtTime(targetDetuneValue, now, rampTime * 0.5); // Faster ramp for detune base
                             }
                         }
                     });
                 });
            }

            // Envelope times (attack/release) are updated in settings for next play/stop.

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during changeMood():`, error);
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', `String Pad mood change failed: ${error.message}`);
            }
            // Attempt to maintain stability, might involve partial state or reverting
        }
    }

    /**
     * Clean up all audio resources created by this module.
     */
    dispose() {
        console.log(`${this.MODULE_ID}: Disposing...`);
        if (!this.isEnabled && this.notesData.length === 0 && !this.outputGain) {
             console.log(`${this.MODULE_ID}: Already disposed or not initialized.`);
             return; // Avoid redundant disposal
        }
        this.isEnabled = false;
        this.isPlaying = false;

        try {
            // 1. Stop and disconnect all oscillators and note gains
            this.notesData.forEach(note => {
                if (note && note.oscillators) {
                    note.oscillators.forEach(osc => {
                        if (osc) {
                            try {
                                if (osc.stop) osc.stop(0); // Stop immediately
                                osc.disconnect();
                            } catch (e) {/* ignore errors during cleanup */ }
                        }
                    });
                }
                if (note && note.noteGain) {
                    try { note.noteGain.disconnect(); } catch (e) {/* ignore */ }
                }
            });

            // 2. Stop and disconnect LFOs and their gains
            Object.values(this.lfoNodes).forEach(node => {
                 if (node) {
                     try {
                         if (node.stop) node.stop(0); // If it's an oscillator
                         node.disconnect();
                     } catch (e) {/* ignore */ }
                 }
            });

            // 3. Disconnect filter and output gain
            if (this.filterNode) {
                try { this.filterNode.disconnect(); } catch (e) {/* ignore */ }
            }
            if (this.outputGain) {
                try { this.outputGain.disconnect(); } catch (e) {/* ignore */ }
            }

        } catch (error) {
             // Log any unexpected error during the disconnection phase
             console.error(`${this.MODULE_ID}: Error during node disconnection phase:`, error);
        } finally {
            // 4. Nullify all references, regardless of disconnection success
            this.notesData = [];
            this.lfoNodes = {};
            this.outputGain = null;
            this.filterNode = null;
            this.audioContext = null;
            this.masterOutput = null;
            this.settings = null;
            this.baseSettings = {};
            console.log(`${this.MODULE_ID}: Disposal complete.`);
        }
    }

    // --- Configuration Helper Methods ---

    /**
     * Maps a value from 0-100 scale to target min/max range.
     * @param {number} value0to100 - Value between 0-100 to map.
     * @param {number} minTarget - Target range minimum.
     * @param {number} maxTarget - Target range maximum.
     * @returns {number} Mapped value between minTarget and maxTarget.
     * @private
     */
    _mapValue(value0to100, minTarget, maxTarget) {
        const clampedValue = Math.max(0, Math.min(100, value0to100 ?? 100)); // Default to 100 if undefined
        return minTarget + (maxTarget - minTarget) * (clampedValue / 100.0);
    }

    /**
     * Applies the mood configuration (volume, occurrence, intensity) to module parameters.
     * @param {number} transitionTime - Duration for transition in seconds.
     * @private
     */
    _applyMoodConfig(transitionTime = 0) {
        if (!this.moodConfig || !this.audioContext || !this.baseSettings) return;

        console.log(`${this.MODULE_ID}: Applying mood configuration - volume: ${this.moodConfig.volume}, occurrence: ${this.moodConfig.occurrence}, intensity: ${this.moodConfig.intensity}`);

        const now = this.audioContext.currentTime;
        const rampTime = transitionTime > 0 ? transitionTime * 0.6 : 0; // Use a portion for ramps
        const timeConstant = rampTime / 3.0;

        // Create working copy of settings by merging base settings (stored from initialSettings/newSettings)
        this.settings = { ...this.baseSettings };

        // --- Apply Volume ---
        if (this.outputGain && this.moodConfig.volume !== undefined) {
            // Map volume 0-100 to 0-baseVolume (from baseSettings)
            const baseVolume = this.baseSettings.padVolume || this.defaultPadSettings.padVolume;
            const targetVolume = this._mapValue(this.moodConfig.volume, 0.0, baseVolume);
            console.log(`${this.MODULE_ID}: Applying Volume ${this.moodConfig.volume}/100 -> ${targetVolume.toFixed(3)}`);
            
            // Store calculated value in settings for play() to use
            this.settings.padVolume = targetVolume;
            
            // If already playing, apply volume transition
            if (this.isPlaying && rampTime > 0.01) {
                this.outputGain.gain.setTargetAtTime(targetVolume, now, timeConstant);
            } else if (this.isPlaying) {
                this.outputGain.gain.setValueAtTime(targetVolume, now);
            }
            // If not playing, the play() method will use settings.padVolume when started
        }

        // --- Apply Occurrence ---
        // For this pad, occurrence mainly affects the number of layers/voices
        if (this.moodConfig.occurrence !== undefined) {
            // Map occurrence to number of detuned oscillators (0-100 to 0-3)
            const maxDetuned = 3; // Maximum number of detuned oscillators
            const targetDetunedCount = Math.floor(this._mapValue(this.moodConfig.occurrence, 0, maxDetuned));
            console.log(`${this.MODULE_ID}: Applying Occurrence ${this.moodConfig.occurrence}/100 -> ${targetDetunedCount} detuned oscillators`);
            
            // Update settings for next sound creation
            this.settings.numDetunedOscs = targetDetunedCount;
            
            // Note: This requires recreating the oscillator structure if it changes drastically
            // We'll handle the recreation in changeMood() if needed
        }

        // --- Apply Intensity ---
        if (this.moodConfig.intensity !== undefined) {
            console.log(`${this.MODULE_ID}: Applying Intensity ${this.moodConfig.intensity}/100`);

            // 1. Filter Q (Resonance)
            const baseQ = this.baseSettings.filterQBase || this.defaultPadSettings.filterQBase;
            const maxQ = this.baseSettings.filterQMax || this.defaultPadSettings.filterQMax;
            const targetQ = this._mapValue(this.moodConfig.intensity, baseQ, maxQ);
            
            // Update setting for future reference
            this.settings.filterQ = targetQ;
            
            // Apply to node if it exists
            if (this.filterNode) {
                console.log(`  -> Filter Q: ${targetQ.toFixed(2)}`);
                if (rampTime > 0.01) {
                    this.filterNode.Q.setTargetAtTime(targetQ, now, timeConstant);
                } else {
                    this.filterNode.Q.setValueAtTime(targetQ, now);
                }
            }

            // 2. Filter LFO Depth
            const baseLFODepth = this.baseSettings.filterLFODepthBase || this.defaultPadSettings.filterLFODepthBase;
            const maxLFODepth = this.baseSettings.filterLFODepthMax || this.defaultPadSettings.filterLFODepthMax;
            const targetLFODepth = this._mapValue(this.moodConfig.intensity, baseLFODepth, maxLFODepth);
            
            // Update setting for future reference
            this.settings.filterLFODepth = targetLFODepth;
            
            // Apply to node if it exists
            if (this.lfoNodes.filterLFOGain) {
                console.log(`  -> Filter LFO Depth: ${targetLFODepth.toFixed(2)} Hz`);
                if (rampTime > 0.01) {
                    this.lfoNodes.filterLFOGain.gain.setTargetAtTime(targetLFODepth, now, timeConstant);
                } else {
                    this.lfoNodes.filterLFOGain.gain.setValueAtTime(targetLFODepth, now);
                }
            }

            // 3. Pitch LFO Depth (Vibrato/Chorus effect)
            const basePitchLFODepth = this.baseSettings.pitchLFODepthBase || this.defaultPadSettings.pitchLFODepthBase;
            const maxPitchLFODepth = this.baseSettings.pitchLFODepthMax || this.defaultPadSettings.pitchLFODepthMax;
            const targetPitchLFODepth = this._mapValue(this.moodConfig.intensity, basePitchLFODepth, maxPitchLFODepth);
            
            // Update setting for future reference
            this.settings.pitchLFODepth = targetPitchLFODepth;
            
            // Apply to node if it exists
            if (this.lfoNodes.pitchLFOGain) {
                console.log(`  -> Pitch LFO Depth: ${targetPitchLFODepth.toFixed(2)} cents`);
                if (rampTime > 0.01) {
                    this.lfoNodes.pitchLFOGain.gain.setTargetAtTime(targetPitchLFODepth, now, timeConstant);
                } else {
                    this.lfoNodes.pitchLFOGain.gain.setValueAtTime(targetPitchLFODepth, now);
                }
            }

            // 4. Detune Amount
            const baseDetune = this.baseSettings.detuneAmountBase || this.defaultPadSettings.detuneAmountBase;
            const maxDetune = this.baseSettings.detuneAmountMax || this.defaultPadSettings.detuneAmountMax;
            const targetDetune = this._mapValue(this.moodConfig.intensity, baseDetune, maxDetune);
            
            // Update setting for oscillator creation/adjustment
            this.settings.detuneAmount = targetDetune;
            console.log(`  -> Detune Amount: ${targetDetune.toFixed(2)} cents`);
            
            // For existing oscillators, we'll handle detune updates in changeMood
            // as it requires identifying the correct oscillators and their detune values
        }
    }

    // --- Internal Helper Methods ---

    /**
     * Creates the core sound structure: oscillators, note gains, and LFOs.
     * This method clears previous structures before building new ones.
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
            // Disconnect notes from filter first
            this.notesData.forEach(note => { if (note && note.noteGain) try { note.noteGain.disconnect(); } catch(e){} });
            // Stop and disconnect old oscillators
            this.notesData.forEach(note => {
                 if (note && note.oscillators) {
                     note.oscillators.forEach(osc => { if(osc) try { if(osc.stop) osc.stop(0); osc.disconnect(); } catch(e){} });
                 }
            });
            this.notesData = []; // Clear the array

            // Stop and disconnect old LFOs
            Object.values(this.lfoNodes).forEach(node => { if(node) try { if(node.stop) node.stop(0); node.disconnect(); } catch(e){} });
            this.lfoNodes = {};
        } catch (cleanupError) {
             console.error(`${this.MODULE_ID}: Error during cleanup in _createSoundStructure:`, cleanupError);
        }

        // --- Get Chord Frequencies ---
        const chordFrequencies = this._getChordFrequencies(settings);
        if (!chordFrequencies || chordFrequencies.length === 0) {
             console.warn(`${this.MODULE_ID}: No chord frequencies generated for mood '${this.currentMood}'. Pad will be silent.`);
             return;
        }

        // --- Create Nodes for Each Chord Note ---
        const numNotes = chordFrequencies.length;
        chordFrequencies.forEach(freq => {
            if (freq <= 0) return; // Skip invalid frequencies

            const noteOscillators = [];
            // Create a gain node for this specific note within the chord
            const noteGain = this.audioContext.createGain();
            // Normalize gain based on number of notes to prevent clipping when summing
            noteGain.gain.setValueAtTime(1.0 / Math.max(1, Math.sqrt(numNotes)), this.audioContext.currentTime);

            const waveform = settings.padWaveform || this.defaultPadSettings.padWaveform;
            const detune = settings.detuneAmount || this.defaultPadSettings.detuneAmount;
            const subGainValue = settings.subOscGain !== undefined ? settings.subOscGain : this.defaultPadSettings.subOscGain;

            try {
                // 1. Fundamental Oscillator
                const fundamentalOsc = this.audioContext.createOscillator();
                fundamentalOsc.type = waveform;
                fundamentalOsc.frequency.setValueAtTime(freq, this.audioContext.currentTime);
                fundamentalOsc.connect(noteGain);
                noteOscillators.push(fundamentalOsc);

                // 2. Detuned Oscillators (e.g., one sharp, one flat)
                const numDetuned = settings.numDetunedOscs !== undefined ? settings.numDetunedOscs : this.defaultPadSettings.numDetunedOscs;
                for (let i = 0; i < numDetuned; i++) {
                    const detuneOsc = this.audioContext.createOscillator();
                    detuneOsc.type = waveform;
                    detuneOsc.frequency.setValueAtTime(freq, this.audioContext.currentTime); // Base freq
                    // Alternate detune direction
                    const detuneDirection = (i % 2 === 0) ? 1 : -1;
                    const detuneAmount = detune * (1.0 + Math.random() * 0.1); // Slight random variation in detune
                    detuneOsc.detune.setValueAtTime(detuneDirection * detuneAmount, this.audioContext.currentTime);
                    detuneOsc.connect(noteGain);
                    detuneOsc.isDetunedPos = detuneDirection > 0; // Mark for identification
                    detuneOsc.isDetunedNeg = detuneDirection < 0;
                    noteOscillators.push(detuneOsc);
                }

                // 3. Sub Oscillator (Optional)
                if (subGainValue > 0.01) {
                    const subOsc = this.audioContext.createOscillator();
                    subOsc.type = 'sine'; // Typically sine for clean sub-bass
                    subOsc.frequency.setValueAtTime(freq * 0.5, this.audioContext.currentTime); // One octave lower
                    // Use a separate gain node for the sub to control its level independently
                    const subOscGainNode = this.audioContext.createGain();
                    subOscGainNode.gain.setValueAtTime(subGainValue, this.audioContext.currentTime);
                    subOsc.connect(subOscGainNode);
                    subOscGainNode.connect(noteGain); // Connect sub's gain to the main note gain
                    subOsc.isSubOsc = true; // Mark for identification
                    noteOscillators.push(subOsc); // Add to the list for start/stop/dispose
                }

                // Store note data
                this.notesData.push({
                    freq: freq,
                    oscillators: noteOscillators,
                    noteGain: noteGain
                });

            } catch (oscError) {
                 console.error(`${this.MODULE_ID}: Error creating oscillators/gain for freq ${freq}:`, oscError);
                 // Attempt to clean up partially created nodes for this note
                 noteOscillators.forEach(osc => { if(osc) try { osc.disconnect(); } catch(e){} });
                 if(noteGain) try { noteGain.disconnect(); } catch(e){}
                 // Continue to next note
            }
        });

        // --- Create LFOs ---
        try {
            // Filter LFO
            this.lfoNodes.filterLFO = this.audioContext.createOscillator();
            this.lfoNodes.filterLFO.type = 'sine';
            this.lfoNodes.filterLFO.frequency.setValueAtTime(settings.filterLFORate || 0.07, this.audioContext.currentTime);
            this.lfoNodes.filterLFOGain = this.audioContext.createGain();
            this.lfoNodes.filterLFOGain.gain.setValueAtTime(settings.filterLFODepth || 450, this.audioContext.currentTime);
            this.lfoNodes.filterLFO.connect(this.lfoNodes.filterLFOGain);

            // Pitch LFO (Vibrato/Chorus)
            this.lfoNodes.pitchLFO = this.audioContext.createOscillator();
            this.lfoNodes.pitchLFO.type = 'sine';
            this.lfoNodes.pitchLFO.frequency.setValueAtTime(settings.pitchLFORate || 0.12, this.audioContext.currentTime);
            // Add random phase offset for uniqueness between instances/sessions
            this.lfoNodes.pitchLFO.phase = Math.random() * Math.PI * 2;
            this.lfoNodes.pitchLFOGain = this.audioContext.createGain();
            this.lfoNodes.pitchLFOGain.gain.setValueAtTime(settings.pitchLFODepth || 3.5, this.audioContext.currentTime);
            this.lfoNodes.pitchLFO.connect(this.lfoNodes.pitchLFOGain);
        } catch (lfoError) {
            console.error(`${this.MODULE_ID}: Error creating LFOs:`, lfoError);
            // Clean up any partially created LFO nodes
            Object.values(this.lfoNodes).forEach(node => { if(node) try { node.disconnect(); } catch(e){} });
            this.lfoNodes = {}; // Reset LFO state
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

             // Connect Pitch LFO Gain -> Oscillator Detune Param for *each* non-sub oscillator
             if (this.lfoNodes.pitchLFOGain) {
                 this.notesData.forEach(note => {
                     if (note && note.oscillators) {
                         note.oscillators.forEach(osc => {
                             // Apply pitch modulation only to main and detuned oscillators, not the sub
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
     * Uses `chordNotes` which are intervals in semitones relative to `baseFreq`.
     * @param {object} settings - The mood audio settings.
     * @returns {number[]} An array of frequencies, or empty array on error.
     * @private
     */
    _getChordFrequencies(settings) {
        try {
            const baseFreq = settings.baseFreq || this.defaultPadSettings.baseFreq;
            const chordIntervals = settings.chordNotes || this.defaultPadSettings.chordNotes;

            if (!baseFreq || baseFreq <= 0) {
                throw new Error(`Invalid baseFreq: ${baseFreq}`);
            }
            if (!Array.isArray(chordIntervals) || chordIntervals.length === 0) {
                 console.warn(`${this.MODULE_ID}: chordNotes array is invalid or empty. Using only base frequency.`);
                 return [baseFreq];
            }

            const frequencies = chordIntervals.map(interval => {
                if (typeof interval !== 'number') {
                    console.warn(`${this.MODULE_ID}: Invalid interval found in chordNotes: ${interval}. Skipping.`);
                    return 0; // Indicate invalid interval
                }
                return baseFreq * Math.pow(2, interval / 12);
            });

            // Filter out any zero frequencies resulting from invalid intervals
            return frequencies.filter(freq => freq > 0);

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error calculating chord frequencies:`, error);
            return []; // Return empty array on error
        }
    }

     /**
      * Calculates a detuned frequency based on a base frequency and a detune amount in cents.
      * @param {number} baseFreq - The base frequency in Hz.
      * @param {number} cents - The detuning amount in cents (+/-).
      * @returns {number} The detuned frequency in Hz.
      * @private
      */
     _detuneFreq(baseFreq, cents) {
         if (typeof baseFreq !== 'number' || baseFreq <= 0 || typeof cents !== 'number') {
             console.warn(`${this.MODULE_ID}: Invalid input to _detuneFreq. Base: ${baseFreq}, Cents: ${cents}`);
             return baseFreq; // Return base frequency if inputs are invalid
         }
         try {
            return baseFreq * Math.pow(2, cents / 1200);
         } catch (error) {
              console.error(`${this.MODULE_ID}: Error calculating detuned frequency:`, error);
              return baseFreq; // Fallback to base frequency on calculation error
         }
     }

} // End class AEPadSoftString

// Make globally accessible for the AudioEngine
window.AEPadSoftString = AEPadSoftString;

console.log("ae_padSoftString.js loaded and AEPadSoftString class defined.");