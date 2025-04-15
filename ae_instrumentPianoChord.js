// ae_instrumentPianoChord.js - Audio Module for Soft, Sustained Piano Chords
// Part of the Harmonic Visions project by FatStinkyPanda
// Copyright (c) 2025 FatStinkyPanda - All rights reserved.
// Version: 1.0.2 (Added volume/occurrence/intensity configuration system)

/**
 * @class AEInstrumentPianoChord
 * @description Generates soft, sustained, synthesized piano-like chords based on mood harmony and rhythm.
 *              Features layered oscillators, filtering, envelopes, and subtle effects for an atmospheric sound.
 *              Implements the standard AudioEngine module interface with high quality and robustness.
 */
class AEInstrumentPianoChord {
    constructor() {
        this.MODULE_ID = 'AEInstrumentPianoChord'; // For logging and identification
        this.audioContext = null;
        this.masterOutput = null; // Connects to AudioEngine's masterInputGain
        this.settings = null;
        this.baseSettings = {}; // Store original settings from data.js
        this.currentMood = null;
        this.isEnabled = false;
        this.isPlaying = false;
        
        // Default mood configuration (0-100 scale)
        this.moodConfig = { volume: 100, occurrence: 100, intensity: 50 };

        // --- Core Audio Nodes (Module Level) ---
        this.moduleOutputGain = null; // Master gain for this module (volume and overall fades)
        this.moduleFilter = null;     // Gentle low-pass filter for overall softness/warmth
        this.delayNode = null;        // Subtle delay effect for space
        this.feedbackGain = null;
        this.delayWetGain = null;

        // --- Sequencing State ---
        this.sequenceTimeoutId = null; // Timeout ID for scheduling the next chord check
        this.currentChordPattern = []; // e.g., [{chordIndex: 0, duration: 4}, {isRest: true, duration: 4}]
        this.currentPatternIndex = 0;  // Position within the current pattern
        this.beatDuration = 0.75;      // Duration of one beat in seconds (derived from tempo)
        this.nextChordTime = 0;        // AudioContext time for the next chord's attack

        // --- Active Chord/Note Tracking ---
        // Map<chordId, { notes: Map<noteId, { oscNodes: OscillatorNode[], envGain: GainNode }>, panner: StereoPannerNode, chordFilter: BiquadFilterNode, cleanupTimeoutId: number, isStopping: boolean }>
        this.activeChords = new Map();
        this.chordIdCounter = 0;
        this.noteIdCounter = 0; // Separate counter for notes within chords

        // --- Default Settings Tailored for Piano Chords ---
        this.defaultChordSettings = {
            chordVolume: 0.38,          // Base volume (adjust in master mix)
            // Sound Properties
            oscillatorType: 'triangle', // Smoother base than sawtooth for piano-like tone
            harmonicOscType: 'sine',    // Cleaner harmonics
            harmonicGains: [0.6, 0.3, 0.15], // Relative gain for 1st, 2nd, 3rd harmonic oscillators (can be tuned)
            detuneAmount: 3,            // Cents, subtle detuning between layers for richness
            filterCutoffBase: 1200,     // Hz, base cutoff frequency
            filterCutoffRange: 400,     // Hz, random variation per chord
            filterQBase: 1.2,
            filterQRange: 0.5,
            filterEnvAmount: 800,       // How much the filter cutoff drops during decay
            filterEnvAttack: 0.02,      // Filter envelope attack
            filterEnvDecay: 0.4,        // Filter envelope decay
            // Envelope (ADSR)
            attackTime: 0.01,           // Fast, slightly soft attack
            decayTime: 0.25,            // Decay after initial attack
            sustainLevel: 0.25,         // Low sustain for a more percussive feel, but non-zero for sustain
            releaseTime: 1.8,           // Fairly long release for sustained chords
            // Effects
            delayTime: 0.45,
            delayFeedback: 0.3,
            delayWetMix: 0.35,
            // Harmony & Voicing
            scale: 'major',
            baseFreq: 220,              // A3 (typical piano mid-range)
            chordNotes: [0, 4, 7],      // Default: Major triad intervals (semitones from scale root)
            chordOctaveOffset: 0,       // Base octave for the chord relative to baseFreq's octave
            voicingVariation: 0.4,      // Probability (0-1) of applying a voicing variation (inversion, omission)
            // Sequencing
            tempo: 75,                  // Default BPM
            chordRhythmPattern: [       // Example: Play chord, rest, play chord, rest...
                { play: true, duration: 4 }, // Play chord for 4 beats
                { play: false, duration: 4 }, // Rest for 4 beats
            ],
            humanizeTiming: 0.020,      // Max random timing offset (seconds)
            velocityRange: 0.25,        // +/- range for random velocity variation (0-1)
            // Module Envelope
            attackTimeModule: 1.0,      // Module fade-in time (s)
            releaseTimeModule: 2.5,     // Module fade-out time (s)
            
            // --- Additional settings for intensity mapping ranges ---
            filterQMin: 0.8,            // Min Q for intensity=0
            filterQMax: 4.0,            // Max Q for intensity=100
            delayWetMixMin: 0.15,       // Min wet mix for intensity=0
            delayWetMixMax: 0.6,        // Max wet mix for intensity=100
            delayFeedbackMin: 0.1,      // Min feedback for intensity=0
            delayFeedbackMax: 0.5,      // Max feedback for intensity=100
            detuneAmountMin: 1,         // Min detune for intensity=0
            detuneAmountMax: 6,         // Max detune for intensity=100
        };

        console.log(`${this.MODULE_ID}: Instance created.`);
    }

    // --- Core Module Methods (AudioEngine Interface) ---

    /**
     * Initialize audio nodes based on initial mood settings.
     */
    init(audioContext, masterOutputNode, initialSettings, initialMood, moodConfig) {
        if (this.isEnabled) {
            console.warn(`${this.MODULE_ID}: Already initialized.`);
            return;
        }
        console.log(`${this.MODULE_ID}: Initializing for mood '${initialMood}'... Config:`, moodConfig);

        try {
            if (!audioContext || !masterOutputNode) throw new Error("AudioContext or masterOutputNode is missing.");
            if (audioContext.state === 'closed') throw new Error("AudioContext is closed.");
            this.audioContext = audioContext;
            this.masterOutput = masterOutputNode;
            
            // Store original base settings and mood config
            this.baseSettings = { ...this.defaultChordSettings, ...initialSettings };
            this.settings = { ...this.baseSettings }; // Working copy
            this.moodConfig = { ...this.moodConfig, ...moodConfig }; // Merge incoming config
            this.currentMood = initialMood;
            
            this.currentChordPattern = this.settings.chordRhythmPattern || this.defaultChordSettings.chordRhythmPattern;
            this._updateBeatDuration(); // Calculate initial beat duration

            // --- Create Core Module Nodes ---
            this.moduleOutputGain = this.audioContext.createGain();
            this.moduleOutputGain.gain.setValueAtTime(0.0001, this.audioContext.currentTime); // Start silent

            this.moduleFilter = this.audioContext.createBiquadFilter();
            this.moduleFilter.type = 'lowpass';
            // Initial filter settings will be applied per chord for variation

            this.delayNode = this.audioContext.createDelay(1.5); // Max delay time 1.5s
            this.feedbackGain = this.audioContext.createGain();
            this.delayWetGain = this.audioContext.createGain();
            this._updateDelayParameters(this.settings); // Set initial delay params

            // --- Apply Initial Mood Config ---
            this._applyMoodConfig(0); // Apply immediately (no transition time)

            // --- Connect Audio Graph ---
            // Chord outputs connect to moduleFilter
            this.moduleFilter.connect(this.moduleOutputGain);
            // Dry Path: Module Output -> Master Output
            this.moduleOutputGain.connect(this.masterOutput);
            // Wet Path (Delay): Module Output -> Delay -> Delay Wet Gain -> Master Output
            this.moduleOutputGain.connect(this.delayNode);
            this.delayNode.connect(this.feedbackGain);
            this.feedbackGain.connect(this.delayNode); // Feedback loop
            this.delayNode.connect(this.delayWetGain);
            this.delayWetGain.connect(this.masterOutput);

            this.isEnabled = true;
            console.log(`${this.MODULE_ID}: Initialization complete.`);

        } catch (error) {
            console.error(`${this.MODULE_ID}: Initialization failed:`, error);
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', `Piano Chord init failed: ${error.message}`);
            }
            this.dispose();
            this.isEnabled = false;
        }
    }

    /** Update loop hook (minimal use for this module). */
    update(time, mood, visualParams, audioParams, deltaTime) {
        if (!this.isEnabled || !this.isPlaying) return;
        // Could potentially add very subtle LFO modulation to the module filter cutoff or delay time
        // based on visualParams.dreaminess, but keep minimal for performance.
    }

    /** Start the chord sequence scheduling. */
    play(startTime) {
        if (!this.isEnabled || this.isPlaying) return;
        if (!this.audioContext || !this.moduleOutputGain) { console.error(`${this.MODULE_ID}: Cannot play - critical nodes missing.`); return; }
        if (this.audioContext.state === 'closed') { console.error(`${this.MODULE_ID}: Cannot play - AudioContext closed.`); return; }
        if (this.audioContext.state === 'suspended') {
             console.warn(`${this.MODULE_ID}: AudioContext suspended. Attempting resume.`);
             this.audioContext.resume().catch(err => console.error(`${this.MODULE_ID}: Error resuming context on play:`, err));
        }

        console.log(`${this.MODULE_ID}: Starting playback sequence at ${startTime.toFixed(3)}`);
        try {
            this.isPlaying = true;
            this.currentPatternIndex = 0; // Reset pattern position
            this.chordIdCounter = 0;      // Reset ID counter
            this.noteIdCounter = 0;
            this.nextChordTime = Math.max(this.audioContext.currentTime, startTime); // Ensure start time is valid

            // Apply module attack envelope
            const attackTime = this.settings.attackTimeModule || this.defaultChordSettings.attackTimeModule;
            const targetVolume = this.settings.chordVolume || this.defaultChordSettings.chordVolume;
            const gainParam = this.moduleOutputGain.gain;

            if (typeof gainParam.cancelAndHoldAtTime === 'function') gainParam.cancelAndHoldAtTime(this.nextChordTime);
            else gainParam.cancelScheduledValues(this.nextChordTime);
            gainParam.setValueAtTime(0.0001, this.nextChordTime);
            gainParam.linearRampToValueAtTime(targetVolume, this.nextChordTime + attackTime);

            if (this.sequenceTimeoutId) clearTimeout(this.sequenceTimeoutId);
            this._scheduleNextChord(); // Start the sequence

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during play():`, error);
            this.isPlaying = false;
            if (this.sequenceTimeoutId) clearTimeout(this.sequenceTimeoutId); this.sequenceTimeoutId = null;
            if (typeof ToastSystem !== 'undefined') ToastSystem.notify('error', `Piano Chord play failed: ${error.message}`);
        }
    }

    /** Stop the chord sequence and fade out the module/active notes. */
    stop(stopTime, fadeDuration = 0.5) { // fadeDuration used for module fade
        if (!this.isEnabled || !this.isPlaying) return;
        if (!this.audioContext || !this.moduleOutputGain) { console.error(`${this.MODULE_ID}: Cannot stop - critical nodes missing.`); return; }
        if (this.audioContext.state === 'closed') { console.error(`${this.MODULE_ID}: Cannot stop - AudioContext closed.`); return; }

        console.log(`${this.MODULE_ID}: Stopping playback sequence at ${stopTime.toFixed(3)}`);
        try {
            this.isPlaying = false; // Stop scheduling new chords

            if (this.sequenceTimeoutId) { clearTimeout(this.sequenceTimeoutId); this.sequenceTimeoutId = null; }

            const now = this.audioContext.currentTime;
            const targetStopTime = Math.max(now, stopTime);

            // Apply module release envelope
            const releaseTime = this.settings.releaseTimeModule || this.defaultChordSettings.releaseTimeModule;
            const timeConstant = releaseTime / 3.0;
            const gainParam = this.moduleOutputGain.gain;

            if (typeof gainParam.cancelAndHoldAtTime === 'function') gainParam.cancelAndHoldAtTime(targetStopTime);
            else gainParam.cancelScheduledValues(targetStopTime);
            const currentGain = gainParam.value;
            gainParam.setValueAtTime(currentGain, targetStopTime);
            gainParam.setTargetAtTime(0.0001, targetStopTime, timeConstant);

            // Trigger release for all active notes within active chords
            this.activeChords.forEach((chordData, chordId) => {
                 if (chordData && chordData.notes && !chordData.isStopping) {
                     chordData.isStopping = true;
                     console.debug(`${this.MODULE_ID}: Triggering release for active chord ${chordId}`);
                     chordData.notes.forEach((noteData, noteId) => {
                         if (noteData && noteData.envGain) {
                              const noteReleaseTime = this.settings.releaseTime || 1.8;
                              noteData.envGain.gain.cancelScheduledValues(targetStopTime);
                              noteData.envGain.gain.setTargetAtTime(0.0001, targetStopTime, noteReleaseTime / 3.0);

                              // Schedule oscillator stops after the *note's* release
                              const noteStopTime = targetStopTime + noteReleaseTime + 0.1;
                              noteData.oscNodes.forEach(osc => {
                                   if (osc && osc.stop) try { osc.stop(noteStopTime); } catch(e) {}
                              });
                         }
                     });
                     // Reschedule chord cleanup based on the longest note release
                     if (chordData.cleanupTimeoutId) clearTimeout(chordData.cleanupTimeoutId);
                     const noteReleaseTime = this.settings.releaseTime || 1.8;
                     const cleanupTime = targetStopTime + noteReleaseTime + 0.2; // Time after release finishes
                     const cleanupDelay = (cleanupTime - this.audioContext.currentTime + 0.1) * 1000; // Delay from *now*
                     chordData.cleanupTimeoutId = setTimeout(() => this._cleanupChord(chordId), Math.max(100, cleanupDelay));
                 }
            });

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during stop():`, error);
            this.activeChords.forEach((chordData, chordId) => { if (chordData?.cleanupTimeoutId) clearTimeout(chordData.cleanupTimeoutId); });
            this.activeChords.clear();
            if (typeof ToastSystem !== 'undefined') ToastSystem.notify('error', `Piano Chord stop failed: ${error.message}`);
        }
    }

    /** Adapt chord generation to the new mood's settings. */
    changeMood(newMood, newSettings, transitionTime, moodConfig) {
        if (!this.isEnabled) return;
        if (!this.audioContext) { console.error(`${this.MODULE_ID}: Cannot change mood - AudioContext missing.`); return; }
        if (this.audioContext.state === 'closed') { console.error(`${this.MODULE_ID}: Cannot change mood - AudioContext closed.`); return; }

        console.log(`${this.MODULE_ID}: Changing mood to '${newMood}' over ${transitionTime.toFixed(2)}s... Config:`, moodConfig);
        const wasPlaying = this.isPlaying;

        try {
            // Stop current sequence cleanly before changing settings
            this.stop(this.audioContext.currentTime, 0.2); // Quick stop

            // Update base settings and mood config
            this.baseSettings = { ...this.defaultChordSettings, ...newSettings };
            this.settings = { ...this.baseSettings }; // Working copy
            this.moodConfig = { ...this.moodConfig, ...moodConfig }; // Merge new config
            this.currentMood = newMood;

            const now = this.audioContext.currentTime;
            const rampTime = transitionTime * 0.6;

            // Apply Mood Config with transition time
            this._applyMoodConfig(transitionTime);

            // Update Module Parameters
            if (this.moduleOutputGain) { // Volume ramps up during play() if restarting
                // Set target volume for next play, but keep it low for now
                const targetVolume = this.settings.chordVolume || this.defaultChordSettings.chordVolume;
                // If it wasn't playing, ensure gain stays low. If it was, it's fading out from stop().
            }
            if (this.moduleFilter) {
                // Filter settings are applied per chord, no need to ramp module filter here
            }
            this._updateDelayParameters(this.settings, rampTime); // Update delay smoothly

            // Update Sequencing Parameters
            this.currentChordPattern = this.settings.chordRhythmPattern || this.defaultChordSettings.chordRhythmPattern;
            this._updateBeatDuration();
            this.currentPatternIndex = 0; // Reset pattern

            console.log(`${this.MODULE_ID}: Chord parameters updated for mood '${newMood}'.`);

            // Restart playback if it was active
            if (wasPlaying) {
                console.log(`${this.MODULE_ID}: Restarting sequence for new mood.`);
                const restartTime = now + 0.3; // Allow stop fades to progress slightly
                this.play(restartTime);
            }

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during changeMood():`, error);
            this.isPlaying = false; // Ensure stopped state on error
            if (this.sequenceTimeoutId) clearTimeout(this.sequenceTimeoutId); this.sequenceTimeoutId = null;
            if (typeof ToastSystem !== 'undefined') ToastSystem.notify('error', `Piano Chord mood change failed: ${error.message}`);
        }
    }

    /** Clean up all audio resources and timers. */
    dispose() {
        console.log(`${this.MODULE_ID}: Disposing...`);
        if (!this.isEnabled && !this.moduleOutputGain) {
             console.log(`${this.MODULE_ID}: Already disposed or not initialized.`);
             return;
        }
        this.isEnabled = false;
        this.isPlaying = false;

        try {
            if (this.sequenceTimeoutId) clearTimeout(this.sequenceTimeoutId);
            this.activeChords.forEach((chordData, chordId) => this._forceCleanupChord(chordId));
            this.activeChords.clear();

            if (this.delayNode) try { this.delayNode.disconnect(); } catch (e) {}
            if (this.feedbackGain) try { this.feedbackGain.disconnect(); } catch (e) {}
            if (this.delayWetGain) try { this.delayWetGain.disconnect(); } catch (e) {}
            if (this.moduleFilter) try { this.moduleFilter.disconnect(); } catch (e) {}
            if (this.moduleOutputGain) try { this.moduleOutputGain.disconnect(); } catch (e) {}

        } catch (error) {
             console.error(`${this.MODULE_ID}: Error during node disconnection phase:`, error);
        } finally {
            this.moduleOutputGain = null;
            this.moduleFilter = null;
            this.delayNode = null;
            this.feedbackGain = null;
            this.delayWetGain = null;
            this.audioContext = null;
            this.masterOutput = null;
            this.settings = null;
            this.baseSettings = null;
            this.currentChordPattern = [];
            this.activeChords.clear();
            console.log(`${this.MODULE_ID}: Disposal complete.`);
        }
    }

    // --- Mood Config Methods (New) ---
    
    /**
     * Maps a value from 0-100 scale to a target range
     * @param {number} value0to100 - Input value (0-100)
     * @param {number} minTarget - Minimum target value
     * @param {number} maxTarget - Maximum target value
     * @returns {number} - Mapped value
     */
    _mapValue(value0to100, minTarget, maxTarget) {
        const clampedValue = Math.max(0, Math.min(100, value0to100 ?? 100)); // Default to 100 if undefined
        return minTarget + (maxTarget - minTarget) * (clampedValue / 100.0);
    }
    
    /**
     * Applies the mood configuration (volume/occurrence/intensity) to module parameters
     * @param {number} transitionTime - Time in seconds for parameter transitions
     */
    _applyMoodConfig(transitionTime = 0) {
        if (!this.moodConfig || !this.audioContext || !this.isEnabled) return;
        
        const now = this.audioContext.currentTime;
        const rampTime = transitionTime > 0 ? transitionTime * 0.6 : 0;
        const timeConstant = rampTime / 3.0;
        
        // --- Apply Volume ---
        if (this.moduleOutputGain && this.moodConfig.volume !== undefined) {
            const baseVolume = this.baseSettings.chordVolume || this.defaultChordSettings.chordVolume;
            const targetVolume = this._mapValue(this.moodConfig.volume, 0.0, baseVolume);
            
            console.log(`${this.MODULE_ID}: Applying Volume ${this.moodConfig.volume}/100 -> ${targetVolume.toFixed(3)}`);
            
            // Store the calculated volume for use in play()
            this.settings.chordVolume = targetVolume;
            
            // Only apply immediately if already playing, otherwise play() will handle it
            if (this.isPlaying) {
                if (rampTime > 0.01) {
                    this.moduleOutputGain.gain.setTargetAtTime(targetVolume, now, timeConstant);
                } else {
                    this.moduleOutputGain.gain.setValueAtTime(targetVolume, now);
                }
            }
        }
        
        // --- Apply Occurrence ---
        if (this.moodConfig.occurrence !== undefined) {
            console.log(`${this.MODULE_ID}: Applying Occurrence ${this.moodConfig.occurrence}/100`);
            
            // For piano chords, occurrence affects the rhythm pattern - adding more rests at lower occurrence
            // We'll modify the current chord pattern based on occurrence
            const basePattern = this.baseSettings.chordRhythmPattern || this.defaultChordSettings.chordRhythmPattern;
            
            if (this.moodConfig.occurrence >= 90) {
                // At high occurrence, use the original pattern
                this.currentChordPattern = [...basePattern];
                this.settings.chordRhythmPattern = [...basePattern];
            } else if (this.moodConfig.occurrence >= 60) {
                // At medium occurrence, add some additional rests
                const modifiedPattern = [];
                basePattern.forEach(item => {
                    modifiedPattern.push({...item}); // Add original item
                    // If this was a played chord, add a short rest after it ~30% of the time
                    if (item.play === true && Math.random() < 0.3) {
                        modifiedPattern.push({play: false, duration: 1});
                    }
                });
                this.currentChordPattern = modifiedPattern;
                this.settings.chordRhythmPattern = modifiedPattern;
            } else {
                // At low occurrence, make the pattern sparser with longer rests
                const modifiedPattern = [];
                basePattern.forEach(item => {
                    if (item.play === true) {
                        // 50% chance to play or rest based on occurrence
                        const shouldPlay = Math.random() < (this.moodConfig.occurrence / 100);
                        modifiedPattern.push({
                            play: shouldPlay,
                            duration: item.duration
                        });
                        
                        // Add an additional rest ~40% of the time
                        if (Math.random() < 0.4) {
                            modifiedPattern.push({
                                play: false,
                                duration: Math.ceil(Math.random() * 3)
                            });
                        }
                    } else {
                        // Keep existing rests, potentially extend them
                        modifiedPattern.push({
                            play: false,
                            duration: item.duration * (Math.random() < 0.3 ? 2 : 1)
                        });
                    }
                });
                this.currentChordPattern = modifiedPattern;
                this.settings.chordRhythmPattern = modifiedPattern;
            }
            
            // Reset pattern position on significant occurrence changes
            this.currentPatternIndex = 0;
        }
        
        // --- Apply Intensity ---
        if (this.moodConfig.intensity !== undefined) {
            console.log(`${this.MODULE_ID}: Applying Intensity ${this.moodConfig.intensity}/100`);
            
            // 1. Filter Q (Resonance)
            const filterQMin = this.baseSettings.filterQMin || this.defaultChordSettings.filterQMin;
            const filterQMax = this.baseSettings.filterQMax || this.defaultChordSettings.filterQMax;
            const targetQ = this._mapValue(this.moodConfig.intensity, filterQMin, filterQMax);
            this.settings.filterQBase = targetQ;
            console.log(`  -> Filter Q Base: ${targetQ.toFixed(2)}`);
            
            // 2. Delay Wet Mix
            const delayWetMixMin = this.baseSettings.delayWetMixMin || this.defaultChordSettings.delayWetMixMin;
            const delayWetMixMax = this.baseSettings.delayWetMixMax || this.defaultChordSettings.delayWetMixMax;
            const targetWetMix = this._mapValue(this.moodConfig.intensity, delayWetMixMin, delayWetMixMax);
            this.settings.delayWetMix = targetWetMix;
            console.log(`  -> Delay Wet Mix: ${targetWetMix.toFixed(2)}`);
            
            // 3. Delay Feedback
            const delayFeedbackMin = this.baseSettings.delayFeedbackMin || this.defaultChordSettings.delayFeedbackMin;
            const delayFeedbackMax = this.baseSettings.delayFeedbackMax || this.defaultChordSettings.delayFeedbackMax;
            const targetFeedback = this._mapValue(this.moodConfig.intensity, delayFeedbackMin, delayFeedbackMax);
            this.settings.delayFeedback = targetFeedback;
            console.log(`  -> Delay Feedback: ${targetFeedback.toFixed(2)}`);
            
            // 4. Detune Amount
            const detuneAmountMin = this.baseSettings.detuneAmountMin || this.defaultChordSettings.detuneAmountMin;
            const detuneAmountMax = this.baseSettings.detuneAmountMax || this.defaultChordSettings.detuneAmountMax;
            const targetDetune = this._mapValue(this.moodConfig.intensity, detuneAmountMin, detuneAmountMax);
            this.settings.detuneAmount = targetDetune;
            console.log(`  -> Detune Amount: ${targetDetune.toFixed(2)}`);
            
            // Apply delay parameters immediately
            if (this.delayNode && this.delayWetGain && this.feedbackGain) {
                this._updateDelayParameters(this.settings, rampTime);
            }
        }
    }

    // --- Internal Sequencing and Chord Generation ---

    /** Updates the beat duration based on the current tempo setting. */
    _updateBeatDuration() {
        const tempo = this.settings?.tempo || this.defaultChordSettings.tempo;
        if (tempo <= 0) {
            console.warn(`${this.MODULE_ID}: Invalid tempo (${tempo}), using default.`);
            this.beatDuration = 60.0 / this.defaultChordSettings.tempo;
        } else {
            this.beatDuration = 60.0 / tempo;
        }
    }

    /** Schedules the next check/trigger for chord playback. */
    _scheduleNextChord() {
        if (!this.isPlaying || !this.audioContext) return;
        const currentTime = this.audioContext.currentTime;
        const delaySeconds = Math.max(0, this.nextChordTime - currentTime);
        const delayMilliseconds = delaySeconds * 1000;
        if (this.sequenceTimeoutId) clearTimeout(this.sequenceTimeoutId);
        this.sequenceTimeoutId = setTimeout(() => {
            if (!this.isPlaying) return;
            try { this._playNextChordInSequence(); }
            catch (e) {
                console.error(`${this.MODULE_ID}: Error in _playNextChordInSequence:`, e);
                this.stop(this.audioContext.currentTime);
            }
        }, delayMilliseconds);
    }

    /** Plays the current chord/rest in the sequence and schedules the next check. */
    _playNextChordInSequence() {
        if (!this.isPlaying || !this.audioContext || this.currentChordPattern.length === 0) {
            this.isPlaying = false; return;
        }
        const patternItem = this.currentChordPattern[this.currentPatternIndex];
        const itemDurationBeats = patternItem.duration || 1.0;
        const itemDurationSeconds = itemDurationBeats * this.beatDuration;
        const playChord = patternItem.play !== false; // Default to playing if 'play' is not explicitly false
        const chordStartTime = this.nextChordTime; // Intended grid start time
        let timingOffset = (this.settings.humanizeTiming || 0) * (Math.random() - 0.5) * 2.0;
        const intendedPlayTime = chordStartTime + timingOffset; // Humanized intended start time

        if (playChord) {
            const baseVelocity = 1.0; // Base velocity before randomization
            const randomVelocityMod = 1.0 + (Math.random() - 0.5) * 2.0 * (this.settings.velocityRange || 0.25);
            const velocity = Math.max(0.1, Math.min(1.0, baseVelocity * randomVelocityMod));
             // Pass intended time, _createChord handles lookahead
            this._createChord(intendedPlayTime, velocity, itemDurationSeconds);
        } else {
            // console.debug(`${this.MODULE_ID}: Rest for ${itemDurationSeconds.toFixed(2)}s`);
        }

        // Calculate next grid start time based on UN-humanized time
        this.nextChordTime = chordStartTime + itemDurationSeconds;
        this.currentPatternIndex = (this.currentPatternIndex + 1) % this.currentChordPattern.length; // Loop pattern
        this._scheduleNextChord(); // Schedule the next step
    }

    /** Creates and plays a single chord instance using lookahead timing. */
    _createChord(playTime, velocity, durationSeconds) {
        // --- Calculate Effective Play Time ---
        const now = this.audioContext.currentTime;
        const lookahead = 0.05; // 50ms lookahead
        const effectivePlayTime = now + lookahead;

        // --- Add Robust Node Checks ---
        if (!this.audioContext || !this.moduleFilter) {
            console.warn(`${this.MODULE_ID}: Skipping chord creation - missing essential nodes (context or moduleFilter).`);
            return;
        }
        // --- End Node Checks ---

        const frequencies = this._calculateChordFrequencies(); // Calculate frequencies early
        if (!frequencies || frequencies.length === 0) {
            console.warn(`${this.MODULE_ID}: No valid frequencies calculated for chord. Skipping.`);
            return;
        }

        const chordId = `chord-${this.chordIdCounter++}`;
        const activeNotesMap = new Map();
        let panner = null;
        let chordFilter = null; // Filter per chord instance for envelope

        try {
            // --- Create Panner for this Chord ---
            panner = this.audioContext.createStereoPanner();
            const panAmount = (Math.random() - 0.5) * 1.4; // Slightly wider pan range
            panner.pan.setValueAtTime(panAmount, effectivePlayTime); // Schedule at effective time

            // --- Create Filter for this Chord (for filter envelope) ---
            chordFilter = this.audioContext.createBiquadFilter();
            chordFilter.type = 'lowpass';
            const filterCutoff = this.settings.filterCutoffBase + (Math.random() - 0.5) * 2.0 * this.settings.filterCutoffRange;
            const filterQ = this.settings.filterQBase + (Math.random() - 0.5) * 2.0 * this.settings.filterQRange;
            chordFilter.frequency.setValueAtTime(filterCutoff, effectivePlayTime); // Schedule at effective time
            chordFilter.Q.setValueAtTime(filterQ, effectivePlayTime); // Schedule at effective time

            // Apply filter envelope
            const filterEnvAmount = this.settings.filterEnvAmount || 800;
            const filterEnvAttack = this.settings.filterEnvAttack || 0.02;
            const filterEnvDecay = this.settings.filterEnvDecay || 0.4;
            const filterSustainFreq = Math.max(50, filterCutoff - filterEnvAmount); // Target freq after decay
            chordFilter.frequency.linearRampToValueAtTime(filterCutoff + filterEnvAmount, effectivePlayTime + filterEnvAttack); // Quick rise
            chordFilter.frequency.setTargetAtTime(filterSustainFreq, effectivePlayTime + filterEnvAttack, filterEnvDecay / 3.0); // Decay

            // Connect filter to panner, panner to module filter
            chordFilter.connect(panner);
            panner.connect(this.moduleFilter);

            // --- Create Notes within the Chord ---
            frequencies.forEach(freq => {
                if (freq <= 0) return;
                const noteId = `note-${this.noteIdCounter++}`;
                const oscNodes = [];
                const envGain = this.audioContext.createGain();
                envGain.gain.setValueAtTime(0.0001, effectivePlayTime); // Start silent *at* effectivePlayTime
                envGain.connect(chordFilter); // Connect note envelope to the chord's filter

                // Create oscillator layers (fundamental + harmonics)
                const oscType = this.settings.oscillatorType || 'triangle';
                const harmonicOscType = this.settings.harmonicOscType || 'sine';
                const harmonicGains = this.settings.harmonicGains || [0.6, 0.3, 0.15];
                const detune = this.settings.detuneAmount || 3;

                // Fundamental
                const fundOsc = this.audioContext.createOscillator();
                fundOsc.type = oscType;
                fundOsc.frequency.setValueAtTime(freq, Math.max(now, effectivePlayTime - 0.001)); // Set slightly before
                fundOsc.detune.setValueAtTime((Math.random() - 0.5) * detune, Math.max(now, effectivePlayTime - 0.001)); // Set slightly before
                fundOsc.connect(envGain);
                oscNodes.push(fundOsc);

                // Harmonics
                for(let h = 0; h < harmonicGains.length; h++) {
                    const harmonicOsc = this.audioContext.createOscillator();
                    harmonicOsc.type = harmonicOscType;
                    harmonicOsc.frequency.setValueAtTime(freq * (h + 2), Math.max(now, effectivePlayTime - 0.001)); // Set slightly before
                    harmonicOsc.detune.setValueAtTime((Math.random() - 0.5) * detune * (h+1), Math.max(now, effectivePlayTime - 0.001)); // Set slightly before
                    const harmonicGainNode = this.audioContext.createGain();
                    harmonicGainNode.gain.setValueAtTime(harmonicGains[h], effectivePlayTime); // Set gain at effective time
                    harmonicOsc.connect(harmonicGainNode);
                    harmonicGainNode.connect(envGain);
                    oscNodes.push(harmonicOsc);
                }

                // Apply ADSR Envelope to envGain
                const { attackTime, decayTime, sustainLevel, releaseTime } = this.settings;
                const peakGain = velocity; // Use randomized velocity passed to function
                envGain.gain.linearRampToValueAtTime(peakGain, effectivePlayTime + attackTime);
                envGain.gain.setTargetAtTime(peakGain * sustainLevel, effectivePlayTime + attackTime, decayTime / 3.0);

                // Schedule release start (based on original intended time)
                const intendedReleaseStartTime = playTime + durationSeconds;
                // Ensure release starts after effective attack+decay
                const releaseStartTime = Math.max(effectivePlayTime + attackTime + decayTime, intendedReleaseStartTime);
                envGain.gain.setTargetAtTime(0.0001, releaseStartTime, releaseTime / 3.0);

                // Schedule oscillator stops
                const stopTime = releaseStartTime + releaseTime + 0.1; // Stop after release
                oscNodes.forEach(osc => osc.start(effectivePlayTime)); // Start all oscillators
                oscNodes.forEach(osc => {
                    try { osc.stop(stopTime); } catch (e) { if(e.name !== 'InvalidStateError') console.warn(`${this.MODULE_ID}: Error scheduling oscillator stop for note ${noteId}:`, e); }
                });

                activeNotesMap.set(noteId, { oscNodes, envGain });
            });

            // --- Schedule Chord Cleanup ---
            const chordReleaseTime = this.settings.releaseTime || 1.8;
            // Cleanup time needs to be relative to the *latest* possible stop time of any note in the chord
            // Use the intended start time for duration calculation
            const latestStopTime = (playTime + durationSeconds) + chordReleaseTime + 0.1;
            const cleanupTime = latestStopTime + 0.2; // Add buffer after the latest possible stop
            const cleanupDelay = (cleanupTime - this.audioContext.currentTime + 0.1) * 1000; // Delay from *now*
            const cleanupTimeoutId = setTimeout(() => this._cleanupChord(chordId), Math.max(50, cleanupDelay));

            // --- Store Active Chord ---
            this.activeChords.set(chordId, { notes: activeNotesMap, panner, chordFilter, cleanupTimeoutId, isStopping: false });

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error creating chord ${chordId}:`, error);
            // Attempt cleanup of partially created chord nodes
             this._cleanupPartialChord({ panner, chordFilter, activeNotesMap }); // Call helper
            if (this.activeChords.has(chordId)) {
                 const chordData = this.activeChords.get(chordId);
                 if (chordData.cleanupTimeoutId) clearTimeout(chordData.cleanupTimeoutId);
                 this.activeChords.delete(chordId);
            }
             if (typeof ToastSystem !== 'undefined') {
                 ToastSystem.notify('warning', `Failed to create piano chord sound: ${error.message}`);
             }
        }
    }


    /** Cleans up resources associated with a finished or stopped chord. */
    _cleanupChord(chordId) {
        if (!this.activeChords.has(chordId)) return;
        const chordData = this.activeChords.get(chordId);
        // console.debug(`${this.MODULE_ID}: Cleaning up chord ${chordId}`);
        try {
             // Disconnect notes first
             chordData.notes.forEach((noteData, noteId) => {
                 if (noteData.envGain) try { noteData.envGain.disconnect(); } catch (e) {}
                 // Oscillators are already disconnected by their own stop schedule usually, but double-check
                 noteData.oscNodes.forEach(osc => { if (osc) try { osc.disconnect(); } catch(e) {} });
             });
             // Disconnect chord-level nodes
             if (chordData.panner) try { chordData.panner.disconnect(); } catch (e) {}
             if (chordData.chordFilter) try { chordData.chordFilter.disconnect(); } catch (e) {}
        } catch (e) {
             console.warn(`${this.MODULE_ID}: Error disconnecting nodes for chord ${chordId}:`, e);
        } finally {
             if (chordData.cleanupTimeoutId) clearTimeout(chordData.cleanupTimeoutId);
             this.activeChords.delete(chordId);
        }
    }

     /** Forcefully stops and cleans up a chord immediately (used in dispose). */
     _forceCleanupChord(chordId) {
         if (!this.activeChords.has(chordId)) return;
         const chordData = this.activeChords.get(chordId);
         if (chordData.cleanupTimeoutId) clearTimeout(chordData.cleanupTimeoutId);
         try {
             chordData.notes.forEach((noteData, noteId) => {
                 if (noteData.oscNodes) {
                     noteData.oscNodes.forEach(osc => {
                          if (osc) try { if(osc.stop) osc.stop(0); osc.disconnect(); } catch(e){}
                     });
                 }
                 if (noteData.envGain) try { noteData.envGain.disconnect(); } catch(e){}
             });
             if (chordData.panner) try { chordData.panner.disconnect(); } catch(e){}
             if (chordData.chordFilter) try { chordData.chordFilter.disconnect(); } catch(e){}
         } catch (e) {
             console.error(`${this.MODULE_ID}: Error during force cleanup for chord ${chordId}:`, e);
         } finally {
              this.activeChords.delete(chordId);
         }
     }

    /** Cleans up partially created nodes if chord creation fails mid-way. */
    _cleanupPartialChord(nodes) {
        console.warn(`${this.MODULE_ID}: Cleaning up partially created chord nodes.`);
        const { panner, chordFilter, activeNotesMap } = nodes;
        if (panner) try { panner.disconnect(); } catch(e) {}
        if (chordFilter) try { chordFilter.disconnect(); } catch(e) {}
        if (activeNotesMap) {
             activeNotesMap.forEach(noteData => {
                if (noteData.envGain) try { noteData.envGain.disconnect(); } catch(e) {}
                if (noteData.oscNodes) {
                     noteData.oscNodes.forEach(osc => { if (osc) try { osc.disconnect(); } catch(e) {} });
                }
             });
        }
    }

    /** Calculates chord frequencies with optional voicing variation. */
    _calculateChordFrequencies() {
        try {
            const { baseFreq, scale: scaleName, chordNotes, chordOctaveOffset, voicingVariation } = { ...this.defaultChordSettings, ...this.settings };
            const scaleMap = typeof musicalScales !== 'undefined' ? musicalScales : null;
            let currentScaleName = scaleName; // Use mutable variable for potential fallback
            if (!scaleMap || !scaleMap[currentScaleName]) {
                console.warn(`${this.MODULE_ID}: Scale '${currentScaleName}' not found. Using major.`);
                currentScaleName = 'major';
                if (!scaleMap || !scaleMap[currentScaleName]) throw new Error("Fallback scale 'major' not found.");
            }
            const scale = scaleMap[currentScaleName];
            if (!scale || scale.length === 0) throw new Error(`Scale '${currentScaleName}' is empty.`);
            if (!Array.isArray(chordNotes) || chordNotes.length === 0) throw new Error("chordNotes array is invalid or empty.");

            let currentChordNotes = [...chordNotes]; // Copy base intervals

            // Apply Voicing Variation (optional)
            if (Math.random() < voicingVariation) {
                const variationType = Math.random();
                if (variationType < 0.4 && currentChordNotes.length > 2) { // Inversion (shift root up)
                    const rootInterval = currentChordNotes.shift();
                    currentChordNotes.push(rootInterval + 12); // Add root an octave higher
                     // console.debug(`${this.MODULE_ID}: Applied chord inversion.`);
                } else if (variationType < 0.7 && currentChordNotes.length > 2) { // Omit 3rd (if exists)
                     // Find the index of the third (usually interval 3 or 4)
                     const thirdIndex = currentChordNotes.findIndex(interval => interval === 3 || interval === 4);
                     if (thirdIndex > 0) { // Don't remove root
                          currentChordNotes.splice(thirdIndex, 1);
                          // console.debug(`${this.MODULE_ID}: Omitted chord third.`);
                     }
                } else if (currentChordNotes.length > 2) { // Omit 5th (if exists)
                     const fifthIndex = currentChordNotes.findIndex(interval => interval === 7);
                     if (fifthIndex > 0) {
                          currentChordNotes.splice(fifthIndex, 1);
                          // console.debug(`${this.MODULE_ID}: Omitted chord fifth.`);
                     }
                }
                // Add more variations: spread voicing, add 7th/9th etc. based on complexity setting
            }

            // Calculate frequencies
            const frequencies = currentChordNotes.map(interval => {
                if (typeof interval !== 'number') throw new Error(`Invalid interval: ${interval}`);
                // Calculate scale degree and octave offset from the interval itself
                const degree = interval % 12;
                const intervalOctave = Math.floor(interval / 12);
                // Find the closest scale degree (less precise but works for non-scale tones)
                // A better approach uses exact scale degrees if chordNotes are scale indices
                // Assuming chordNotes ARE semitone intervals from root for now
                const semitoneOffset = interval; // Use interval directly as semitone offset
                const totalOctave = (chordOctaveOffset || 0) + intervalOctave; // Ensure chordOctaveOffset is number
                const freq = baseFreq * Math.pow(2, (semitoneOffset + totalOctave * 12) / 12);
                if (isNaN(freq) || freq <= 0) throw new Error(`Invalid frequency calculated: ${freq}`);
                return freq;
            });

            // Filter out any potential invalid frequencies again just in case
            return frequencies.filter(f => f > 0 && isFinite(f)); // Add check for finite

        } catch (error) {
             console.error(`${this.MODULE_ID}: Error calculating chord frequencies:`, error);
             return []; // Return empty array on error
        }
    }


    /** Updates delay node parameters based on settings, optionally with ramping. */
    _updateDelayParameters(settings, rampTime = 0) {
        if (!this.delayNode || !this.feedbackGain || !this.delayWetGain || !this.audioContext) return;
        try {
             const now = this.audioContext.currentTime;
             const timeConstant = rampTime / 3.0;
             const targetDelay = settings.delayTime || this.defaultChordSettings.delayTime;
             const targetFeedback = settings.delayFeedback || this.defaultChordSettings.delayFeedback;
             const targetWet = settings.delayWetMix || this.defaultChordSettings.delayWetMix;

             if (rampTime > 0.01) {
                 this.delayNode.delayTime.setTargetAtTime(targetDelay, now, timeConstant);
                 this.feedbackGain.gain.setTargetAtTime(targetFeedback, now, timeConstant);
                 this.delayWetGain.gain.setTargetAtTime(targetWet, now, timeConstant);
             } else {
                 this.delayNode.delayTime.setValueAtTime(targetDelay, now);
                 this.feedbackGain.gain.setValueAtTime(targetFeedback, now);
                 this.delayWetGain.gain.setValueAtTime(targetWet, now);
             }
        } catch (error) {
             console.error(`${this.MODULE_ID}: Error updating delay parameters:`, error);
        }
    }

} // End class AEInstrumentPianoChord

// Make globally accessible for the AudioEngine
window.AEInstrumentPianoChord = AEInstrumentPianoChord;

console.log("ae_instrumentPianoChord.js loaded and AEInstrumentPianoChord class defined.");