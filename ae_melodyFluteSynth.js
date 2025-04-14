// ae_melodyFluteSynth.js - Audio Module for Gentle Flute-like Synth Melodies
// Part of the Harmonic Visions project by FatStinkyPanda
// Copyright (c) 2025 FatStinkyPanda - All rights reserved.
// Version: 1.1.2 (Fixed timing issues with lookahead scheduling)

/**
 * @class AEMelodyFluteSynth
 * @description Generates gentle, breathy flute-like synth melodies using oscillators,
 *              filtered noise, envelopes, and effects. Implements the standard
 *              AudioEngine module interface with high quality and robustness.
 */
class AEMelodyFluteSynth {
    constructor() {
        this.MODULE_ID = 'AEMelodyFluteSynth'; // For logging and identification
        this.audioContext = null;
        this.masterOutput = null; // Connects to AudioEngine's masterInputGain
        this.settings = null;
        this.currentMood = null;
        this.isEnabled = false;
        this.isPlaying = false;

        // --- Core Audio Nodes ---
        this.moduleOutputGain = null; // Master gain for this module
        this.moduleFilter = null;     // Gentle low-pass filter for overall softness
        this.vibratoLFO = null;       // Shared LFO for pitch vibrato
        this.vibratoGain = null;      // Controls vibrato depth
        this.delayNode = null;        // Optional delay effect
        this.feedbackGain = null;
        this.delayWetGain = null;
        this.noiseBuffer = null;      // Pre-generated buffer for breath noise

        // --- Sequencing State ---
        this.sequenceTimeoutId = null; // Timeout ID for scheduling the next note check
        this.currentPattern = [];
        this.currentPatternIndex = 0;
        this.currentOctaveOffset = 0;
        this.nextNoteStartTime = 0;    // AudioContext time for the next note's attack

        // --- Active Note Tracking ---
        // Map<noteId, { toneOsc, noiseSource, breathFilter, toneGain, breathGain, cleanupTimeoutId, isStopping }>
        this.activeNotes = new Map();
        this.noteIdCounter = 0;

        // --- Default Settings for Flute Synth ---
        this.defaultFluteSettings = {
            melodyVolume: 0.35,
            melodyOctaveRange: [-1, 0, 0, 1], // Possible octave offsets
            toneWaveform: 'triangle',   // Triangle wave provides a good base for filtering
            breathNoiseVolume: 0.15,    // Relative volume of the breath noise component
            breathFilterType: 'bandpass',
            breathFilterFreqBase: 1800, // Hz, base frequency for breath noise filter
            breathFilterFreqRange: 800, // Hz, random variation range
            breathFilterQBase: 1.5,
            breathFilterQRange: 1.0,
            moduleFilterFreq: 3500,     // Hz, master low-pass cutoff
            moduleFilterQ: 0.8,
            noteVelocityBase: 0.7,
            noteVelocityRange: 0.2,
            attackTime: 0.08,           // Relatively soft attack
            decayTime: 0.2,
            sustainLevel: 0.6,          // Moderate sustain level
            releaseTime: 0.4,           // Natural release
            breathAttackTime: 0.12,     // Slightly slower attack for breath
            breathDecayTime: 0.3,
            breathSustainLevel: 0.4,
            breathReleaseTime: 0.5,
            vibratoRate: 5.5,           // Hz
            vibratoDepth: 3.0,          // Cents (subtle but present)
            delayTime: 0.4,
            delayFeedback: 0.25,
            delayWetMix: 0.3,
            tempo: 80,
            scale: 'pentatonic',
            baseFreq: 523.25,           // C5 - Flute range often higher
            melodyPatterns: [           // Example pattern
                [
                    { scaleIndex: 0, duration: 0.75 }, { scaleIndex: 2, duration: 0.5 },
                    { scaleIndex: 4, duration: 1.25 }, { isRest: true, duration: 0.5 },
                    { scaleIndex: 3, duration: 0.75 }, { scaleIndex: 1, duration: 1.0 },
                    { isRest: true, duration: 0.75 },
                ]
            ],
            humanizeTiming: 0.015,      // Optional timing variation
            noiseBufferSizeSeconds: 2, // Duration of the looping noise buffer
        };

        console.log(`${this.MODULE_ID}: Instance created.`);
    }

    // --- Core Module Methods (AudioEngine Interface) ---

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
            if (!audioContext || !masterOutputNode) throw new Error("AudioContext or masterOutputNode is missing.");
            if (audioContext.state === 'closed') throw new Error("AudioContext is closed.");
            this.audioContext = audioContext;
            this.masterOutput = masterOutputNode;
            this.settings = { ...this.defaultFluteSettings, ...initialSettings };
            this.currentMood = initialMood;
            this.currentPattern = this._selectMelodyPattern(this.settings);
            this.currentOctaveOffset = this._selectOctaveOffset(this.settings);

            // --- Generate Noise Buffer ---
            this.noiseBuffer = this._createNoiseBuffer(this.settings.noiseBufferSizeSeconds);
            if (!this.noiseBuffer) throw new Error("Failed to generate noise buffer.");

            // --- Create Core Nodes ---
            this.moduleOutputGain = this.audioContext.createGain();
            this.moduleOutputGain.gain.setValueAtTime(this.settings.melodyVolume, this.audioContext.currentTime);

            this.moduleFilter = this.audioContext.createBiquadFilter();
            this.moduleFilter.type = 'lowpass';
            this.moduleFilter.frequency.setValueAtTime(this.settings.moduleFilterFreq, this.audioContext.currentTime);
            this.moduleFilter.Q.setValueAtTime(this.settings.moduleFilterQ, this.audioContext.currentTime);

            // Vibrato LFO & Gain
            this.vibratoLFO = this.audioContext.createOscillator();
            this.vibratoLFO.type = 'sine';
            this.vibratoLFO.frequency.setValueAtTime(this.settings.vibratoRate, this.audioContext.currentTime);
            this.vibratoLFO.phase = Math.random() * Math.PI * 2; // Uniqueness
            this.vibratoGain = this.audioContext.createGain();
            this.vibratoGain.gain.setValueAtTime(this.settings.vibratoDepth, this.audioContext.currentTime);
            this.vibratoLFO.connect(this.vibratoGain);

            // Delay Effect
            this.delayNode = this.audioContext.createDelay(1.0);
            this.delayNode.delayTime.setValueAtTime(this.settings.delayTime, this.audioContext.currentTime);
            this.feedbackGain = this.audioContext.createGain();
            this.feedbackGain.gain.setValueAtTime(this.settings.delayFeedback, this.audioContext.currentTime);
            this.delayWetGain = this.audioContext.createGain();
            this.delayWetGain.gain.setValueAtTime(this.settings.delayWetMix, this.audioContext.currentTime);

            // --- Connect Audio Graph ---
            // Note outputs connect to moduleFilter
            this.moduleFilter.connect(this.moduleOutputGain);
            // Dry Path: Module Output -> Master Output
            this.moduleOutputGain.connect(this.masterOutput);
            // Wet Path: Module Filter -> Delay -> Delay Wet Gain -> Master Output
            // Taking input *after* the main filter for a darker delay sound
            this.moduleFilter.connect(this.delayNode);
            this.delayNode.connect(this.feedbackGain);
            this.feedbackGain.connect(this.delayNode); // Feedback
            this.delayNode.connect(this.delayWetGain);
            this.delayWetGain.connect(this.masterOutput);

            // Start Vibrato LFO
            try { this.vibratoLFO.start(); }
            catch(e) { if(e.name !== 'InvalidStateError') console.warn(`${this.MODULE_ID}: Error starting Vibrato LFO:`, e); }

            this.isEnabled = true;
            console.log(`${this.MODULE_ID}: Initialization complete.`);

        } catch (error) {
            console.error(`${this.MODULE_ID}: Initialization failed:`, error);
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', `Flute Synth init failed: ${error.message}`);
            }
            this.dispose(); // Pass scene if available, though not strictly needed here
            this.isEnabled = false;
        }
    }

    /** Update loop hook (minimal use). */
    update(time, mood, visualParams, audioParams, deltaTime) {
        if (!this.isEnabled || !this.isPlaying) return;
        // Can add subtle modulation to filter or delay based on params if desired
    }

    /** Start the melody sequence. */
    play(startTime) {
        if (!this.isEnabled || this.isPlaying) return;
        if (!this.audioContext) { console.error(`${this.MODULE_ID}: Cannot play - AudioContext missing.`); return; }
        if (this.audioContext.state === 'closed') { console.error(`${this.MODULE_ID}: Cannot play - AudioContext closed.`); return; }
        if (this.audioContext.state === 'suspended') {
             console.warn(`${this.MODULE_ID}: AudioContext suspended. Attempting resume.`);
             this.audioContext.resume().catch(err => console.error(`${this.MODULE_ID}: Error resuming context on play:`, err));
        }

        console.log(`${this.MODULE_ID}: Starting playback sequence at ${startTime.toFixed(3)}`);
        try {
            this.isPlaying = true;
            this.currentPatternIndex = 0;
            this.noteIdCounter = 0;
            this.nextNoteStartTime = Math.max(this.audioContext.currentTime, startTime);

            // Ensure LFO is running
             if (this.vibratoLFO) {
                try { this.vibratoLFO.start(this.nextNoteStartTime); }
                catch (e) { if(e.name !== 'InvalidStateError') console.warn(`${this.MODULE_ID}: Error restarting Vibrato LFO:`, e); }
             }

            if (this.sequenceTimeoutId) clearTimeout(this.sequenceTimeoutId);
            this._scheduleNextNoteCheck(); // Start the sequence

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during play():`, error);
            this.isPlaying = false;
            if (this.sequenceTimeoutId) clearTimeout(this.sequenceTimeoutId);
            this.sequenceTimeoutId = null;
            if (typeof ToastSystem !== 'undefined') ToastSystem.notify('error', `Flute Synth play failed: ${error.message}`);
        }
    }

    /** Stop the melody sequence and fade out active notes. */
    stop(stopTime, fadeDuration = 0.1) {
        if (!this.isEnabled || !this.isPlaying) return;
        if (!this.audioContext) { console.error(`${this.MODULE_ID}: Cannot stop - AudioContext missing.`); return; }
        if (this.audioContext.state === 'closed') { console.error(`${this.MODULE_ID}: Cannot stop - AudioContext closed.`); return; }

        console.log(`${this.MODULE_ID}: Stopping playback sequence at ${stopTime.toFixed(3)}`);
        try {
            this.isPlaying = false; // Stop scheduling new notes

            if (this.sequenceTimeoutId) {
                clearTimeout(this.sequenceTimeoutId);
                this.sequenceTimeoutId = null;
            }

            const now = this.audioContext.currentTime;
            const targetStopTime = Math.max(now, stopTime);

            // Trigger release for all active notes
            this.activeNotes.forEach((noteData, noteId) => {
                 if (noteData && !noteData.isStopping) {
                     noteData.isStopping = true;
                     console.debug(`${this.MODULE_ID}: Triggering release for active note ${noteId}`);
                     const release = this.settings.releaseTime || 0.4;
                     const breathRelease = this.settings.breathReleaseTime || 0.5;

                     // --- Trigger Release Envelope for Tone ---
                     if (noteData.toneGain && noteData.toneGain.gain) {
                         noteData.toneGain.gain.cancelScheduledValues(targetStopTime);
                         noteData.toneGain.gain.setTargetAtTime(0.0001, targetStopTime, release / 3.0);
                     }
                     // --- Trigger Release Envelope for Breath ---
                     if (noteData.breathGain && noteData.breathGain.gain) {
                         noteData.breathGain.gain.cancelScheduledValues(targetStopTime);
                         noteData.breathGain.gain.setTargetAtTime(0.0001, targetStopTime, breathRelease / 3.0);
                     }

                     // --- Schedule Node Stops ---
                     const latestRelease = Math.max(release, breathRelease);
                     const nodeStopTime = targetStopTime + latestRelease + 0.1; // Stop after longest release

                     if (noteData.toneOsc && noteData.toneOsc.stop) {
                         try { noteData.toneOsc.stop(nodeStopTime); } catch (e) { /* Ignore InvalidStateError */ }
                     }
                     if (noteData.noiseSource && noteData.noiseSource.stop) {
                         try { noteData.noiseSource.stop(nodeStopTime); } catch (e) { /* Ignore InvalidStateError */ }
                     }

                     // --- Reschedule Cleanup ---
                     if (noteData.cleanupTimeoutId) clearTimeout(noteData.cleanupTimeoutId);
                     const cleanupDelay = (nodeStopTime - this.audioContext.currentTime + 0.1) * 1000; // Delay from *now*
                     noteData.cleanupTimeoutId = setTimeout(() => {
                          this._cleanupNote(noteId);
                     }, Math.max(100, cleanupDelay)); // Ensure minimum delay
                 }
            });

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during stop():`, error);
            this.activeNotes.forEach((noteData, noteId) => { if (noteData?.cleanupTimeoutId) clearTimeout(noteData.cleanupTimeoutId); });
            this.activeNotes.clear();
            if (typeof ToastSystem !== 'undefined') ToastSystem.notify('error', `Flute Synth stop failed: ${error.message}`);
        }
    }

    /** Adapt melody generation to the new mood's settings. */
    changeMood(newMood, newSettings, transitionTime) {
        if (!this.isEnabled) return;
        if (!this.audioContext) { console.error(`${this.MODULE_ID}: Cannot change mood - AudioContext missing.`); return; }
        if (this.audioContext.state === 'closed') { console.error(`${this.MODULE_ID}: Cannot change mood - AudioContext closed.`); return; }

        console.log(`${this.MODULE_ID}: Changing mood to '${newMood}' over ${transitionTime.toFixed(2)}s`);
        const wasPlaying = this.isPlaying;

        try {
            this.stop(this.audioContext.currentTime, 0.1); // Stop current sequence

            this.settings = { ...this.defaultFluteSettings, ...newSettings };
            this.currentMood = newMood;

            const now = this.audioContext.currentTime;
            const rampTime = transitionTime * 0.6;

            // --- Update Module Parameters ---
            if (this.moduleOutputGain) this.moduleOutputGain.gain.setTargetAtTime(this.settings.melodyVolume, now, rampTime / 2);
            if (this.moduleFilter) {
                this.moduleFilter.frequency.setTargetAtTime(this.settings.moduleFilterFreq, now, rampTime);
                this.moduleFilter.Q.setTargetAtTime(this.settings.moduleFilterQ, now, rampTime);
            }
            if (this.vibratoLFO && this.vibratoGain) {
                this.vibratoLFO.frequency.setTargetAtTime(this.settings.vibratoRate, now, rampTime);
                this.vibratoGain.gain.setTargetAtTime(this.settings.vibratoDepth, now, rampTime);
            }
            if (this.delayNode && this.feedbackGain && this.delayWetGain) {
                this.delayNode.delayTime.setTargetAtTime(this.settings.delayTime, now, rampTime);
                this.feedbackGain.gain.setTargetAtTime(this.settings.delayFeedback, now, rampTime);
                this.delayWetGain.gain.setTargetAtTime(this.settings.delayWetMix, now, rampTime);
            }

            // --- Reset Sequencer State ---
            this.currentPattern = this._selectMelodyPattern(this.settings);
            this.currentPatternIndex = 0;
            this.currentOctaveOffset = this._selectOctaveOffset(this.settings);

            // --- Restart Playback if it was active ---
            if (wasPlaying) {
                console.log(`${this.MODULE_ID}: Restarting sequence for new mood.`);
                const restartTime = now + rampTime * 0.1;
                this.play(restartTime);
            }

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during changeMood():`, error);
            this.isPlaying = false;
            if (this.sequenceTimeoutId) clearTimeout(this.sequenceTimeoutId);
            this.sequenceTimeoutId = null;
            if (typeof ToastSystem !== 'undefined') ToastSystem.notify('error', `Flute Synth mood change failed: ${error.message}`);
        }
    }

    /** Clean up all audio resources and timers. */
    dispose(scene = null) { // Added optional scene parameter for consistency, though not used here
        console.log(`${this.MODULE_ID}: Disposing...`);
        if (!this.isEnabled && !this.moduleOutputGain) {
             console.log(`${this.MODULE_ID}: Already disposed or not initialized.`);
             return;
        }
        this.isEnabled = false;
        this.isPlaying = false;

        try {
            if (this.sequenceTimeoutId) clearTimeout(this.sequenceTimeoutId);
            this.activeNotes.forEach((noteData, noteId) => this._forceCleanupNote(noteId));
            this.activeNotes.clear();

            if (this.vibratoLFO) try { if(this.vibratoLFO.stop) this.vibratoLFO.stop(0); this.vibratoLFO.disconnect(); } catch(e){}
            if (this.vibratoGain) try { this.vibratoGain.disconnect(); } catch(e){}
            if (this.moduleFilter) try { this.moduleFilter.disconnect(); } catch(e){}
            if (this.moduleOutputGain) try { this.moduleOutputGain.disconnect(); } catch(e){}
            if (this.delayNode) try { this.delayNode.disconnect(); } catch(e){}
            if (this.feedbackGain) try { this.feedbackGain.disconnect(); } catch(e){}
            if (this.delayWetGain) try { this.delayWetGain.disconnect(); } catch(e){}

        } catch (error) {
             console.error(`${this.MODULE_ID}: Error during node disconnection phase:`, error);
        } finally {
            // Nullify all references
            this.moduleOutputGain = null;
            this.moduleFilter = null;
            this.vibratoLFO = null;
            this.vibratoGain = null;
            this.delayNode = null;
            this.feedbackGain = null;
            this.delayWetGain = null;
            this.noiseBuffer = null; // Allow GC
            this.audioContext = null;
            this.masterOutput = null;
            this.settings = null;
            this.currentPattern = [];
            this.activeNotes.clear();
            console.log(`${this.MODULE_ID}: Disposal complete.`);
        }
    }

    // --- Internal Sequencing and Note Generation ---

    /** Schedules the next check/trigger for note playback. */
    _scheduleNextNoteCheck() {
        if (!this.isPlaying || !this.audioContext) return;
        const currentTime = this.audioContext.currentTime;
        const delaySeconds = Math.max(0, this.nextNoteStartTime - currentTime);
        const delayMilliseconds = delaySeconds * 1000;
        if (this.sequenceTimeoutId) clearTimeout(this.sequenceTimeoutId);
        this.sequenceTimeoutId = setTimeout(() => {
            if (!this.isPlaying) return;
            try { this._playNextNoteInSequence(); }
            catch (e) {
                console.error(`${this.MODULE_ID}: Error in _playNextNoteInSequence:`, e);
                this.stop(this.audioContext.currentTime);
            }
        }, delayMilliseconds);
    }

    /** Plays the current note/rest and schedules the next check. */
    _playNextNoteInSequence() {
        if (!this.isPlaying || !this.audioContext || this.currentPattern.length === 0) {
            this.isPlaying = false; return;
        }
        const patternItem = this.currentPattern[this.currentPatternIndex];
        const tempo = this.settings.tempo || this.defaultFluteSettings.tempo;
        const beatDuration = 60.0 / tempo;
        const noteDurationSeconds = (patternItem.duration || 1.0) * beatDuration;
        const isRest = patternItem.isRest || false;
        const noteStartTime = this.nextNoteStartTime; // Intended start time
        let timingOffset = (this.settings.humanizeTiming || 0) * (Math.random() - 0.5) * 2.0;
        const intendedPlayTime = noteStartTime + timingOffset; // Humanized intended start time

        if (!isRest) {
             // Pass the intended time, _createNote handles lookahead
            this._createNote(patternItem, intendedPlayTime, noteDurationSeconds);
        }
        // Calculate next grid time based on UN-humanized start time
        this.nextNoteStartTime = noteStartTime + noteDurationSeconds;
        this.currentPatternIndex++;
        if (this.currentPatternIndex >= this.currentPattern.length) {
            this.currentPatternIndex = 0;
            this.currentOctaveOffset = this._selectOctaveOffset(this.settings);
            this.currentPattern = this._selectMelodyPattern(this.settings);
            console.debug(`${this.MODULE_ID}: Looped pattern. New octave: ${this.currentOctaveOffset}`);
        }
        this._scheduleNextNoteCheck();
    }

    /** Creates and plays a single flute synth note using lookahead timing. */
    _createNote(noteInfo, playTime, durationSeconds) {
        // --- Calculate Effective Play Time using Lookahead ---
        const now = this.audioContext.currentTime;
        const lookahead = 0.05; // 50ms lookahead
        const effectivePlayTime = now + lookahead;

        // --- Add Robust Node Checks ---
        if (!this.audioContext || !this.moduleFilter || !this.noiseBuffer || !this.vibratoGain) {
            console.warn(`${this.MODULE_ID}: Skipping note creation - missing essential nodes/buffer (context, filter, noiseBuffer, or vibratoGain).`);
            return;
        }
        // --- End Node Checks ---

        let toneOsc = null, noiseSource = null, breathFilter = null, toneGain = null, breathGain = null;
        const noteId = `flute-${this.noteIdCounter++}`;

        try {
            const frequency = this._calculateFrequency(noteInfo.scaleIndex, noteInfo.octave);
            if (frequency <= 0) {
                console.warn(`${this.MODULE_ID}: Skipping note with invalid frequency (${frequency}) for scaleIndex ${noteInfo.scaleIndex}`);
                return;
            }

            // --- Create Tone Oscillator ---
            toneOsc = this.audioContext.createOscillator();
            toneOsc.type = this.settings.toneWaveform || 'triangle';
            toneOsc.frequency.setValueAtTime(frequency, Math.max(now, effectivePlayTime - 0.001)); // Set slightly before
            if (this.vibratoGain && toneOsc.detune) {
                try { this.vibratoGain.connect(toneOsc.detune); } catch (e) {}
            }
            toneGain = this.audioContext.createGain();
            toneGain.gain.setValueAtTime(0.0001, effectivePlayTime); // Start silent *at* effectivePlayTime
            toneOsc.connect(toneGain);
            toneGain.connect(this.moduleFilter); // Connect to module filter

            // --- Create Breath Noise ---
            noiseSource = this.audioContext.createBufferSource();
            noiseSource.buffer = this.noiseBuffer;
            noiseSource.loop = true;
            breathFilter = this.audioContext.createBiquadFilter();
            breathFilter.type = this.settings.breathFilterType || 'bandpass';
            const bfFreq = (this.settings.breathFilterFreqBase || 1800) + (Math.random() - 0.5) * (this.settings.breathFilterFreqRange || 800);
            const bfQ = (this.settings.breathFilterQBase || 1.5) + (Math.random() - 0.5) * (this.settings.breathFilterQRange || 1.0);
            breathFilter.frequency.setValueAtTime(Math.max(100, bfFreq), Math.max(now, effectivePlayTime - 0.001)); // Set slightly before
            breathFilter.Q.setValueAtTime(Math.max(0.1, bfQ), Math.max(now, effectivePlayTime - 0.001)); // Set slightly before
            breathGain = this.audioContext.createGain();
            breathGain.gain.setValueAtTime(0.0001, effectivePlayTime); // Start silent *at* effectivePlayTime
            noiseSource.connect(breathFilter);
            breathFilter.connect(breathGain);
            breathGain.connect(this.moduleFilter); // Connect to module filter

            // --- Start Nodes PRECISELY at effectivePlayTime ---
            toneOsc.start(effectivePlayTime);
            noiseSource.start(effectivePlayTime);

            // --- Apply Envelopes ---
            const velocity = Math.max(0.1, Math.min(1.0, (noteInfo.velocity || this.settings.noteVelocityBase) * (1.0 + (Math.random() - 0.5) * 2.0 * this.settings.noteVelocityRange)));
            const { attackTime, decayTime, sustainLevel, releaseTime } = this.settings;
            const { breathAttackTime, breathDecayTime, breathSustainLevel, breathReleaseTime, breathNoiseVolume } = this.settings;

            // Tone Envelope
            toneGain.gain.linearRampToValueAtTime(velocity, effectivePlayTime + attackTime);
            toneGain.gain.setTargetAtTime(velocity * sustainLevel, effectivePlayTime + attackTime, decayTime / 3.0);
            // Breath Envelope
            breathGain.gain.linearRampToValueAtTime(velocity * breathNoiseVolume, effectivePlayTime + breathAttackTime);
            breathGain.gain.setTargetAtTime(velocity * breathNoiseVolume * breathSustainLevel, effectivePlayTime + breathAttackTime, breathDecayTime / 3.0);

            // --- Schedule Release and Stop ---
            const intendedReleaseStartTime = playTime + durationSeconds; // Base release on original intended time
            // Ensure release starts after the effective attack+decay phases
            const releaseStartTime = Math.max(effectivePlayTime + Math.max(attackTime + decayTime, breathAttackTime + breathDecayTime), intendedReleaseStartTime);

            toneGain.gain.setTargetAtTime(0.0001, releaseStartTime, releaseTime / 3.0);
            breathGain.gain.setTargetAtTime(0.0001, releaseStartTime, breathReleaseTime / 3.0);

            const toneStopTime = releaseStartTime + releaseTime + 0.1;
            const breathStopTime = releaseStartTime + breathReleaseTime + 0.1;
            const latestStopTime = Math.max(toneStopTime, breathStopTime);

            try { toneOsc.stop(toneStopTime); } catch (e) { if(e.name !== 'InvalidStateError') console.warn(`${this.MODULE_ID}: Error stopping toneOsc ${noteId}:`, e); }
            try { noiseSource.stop(breathStopTime); } catch (e) { if(e.name !== 'InvalidStateError') console.warn(`${this.MODULE_ID}: Error stopping noiseSource ${noteId}:`, e); }

            // --- Schedule Cleanup ---
            const cleanupDelay = (latestStopTime - this.audioContext.currentTime + 0.1) * 1000; // Delay from *now*
            const cleanupTimeoutId = setTimeout(() => this._cleanupNote(noteId), Math.max(50, cleanupDelay));

            // --- Store Active Note ---
            this.activeNotes.set(noteId, { toneOsc, noiseSource, breathFilter, toneGain, breathGain, cleanupTimeoutId, isStopping: false });

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error creating note ${noteId}:`, error);
            this._cleanupPartialNote({ toneOsc, noiseSource, breathFilter, toneGain, breathGain }); // Cleanup partial nodes
            if (this.activeNotes.has(noteId)) {
                 const noteData = this.activeNotes.get(noteId);
                 if (noteData.cleanupTimeoutId) clearTimeout(noteData.cleanupTimeoutId);
                 this.activeNotes.delete(noteId);
            }
        }
    }


    /** Cleans up resources associated with a finished or stopped note. */
    _cleanupNote(noteId) {
        if (!this.activeNotes.has(noteId)) return;
        const noteData = this.activeNotes.get(noteId);
        // console.debug(`${this.MODULE_ID}: Cleaning up note ${noteId}`);
        try {
             if (this.vibratoGain && noteData.toneOsc && noteData.toneOsc.detune) {
                 try { this.vibratoGain.disconnect(noteData.toneOsc.detune); } catch(e) {}
             }
             if (noteData.toneOsc) try { noteData.toneOsc.disconnect(); } catch (e) {}
             if (noteData.noiseSource) try { noteData.noiseSource.disconnect(); } catch (e) {}
             if (noteData.breathFilter) try { noteData.breathFilter.disconnect(); } catch (e) {}
             if (noteData.toneGain) try { noteData.toneGain.disconnect(); } catch (e) {}
             if (noteData.breathGain) try { noteData.breathGain.disconnect(); } catch (e) {}
        } catch (e) {
             console.warn(`${this.MODULE_ID}: Error disconnecting nodes for note ${noteId}:`, e);
        } finally {
             if (noteData.cleanupTimeoutId) clearTimeout(noteData.cleanupTimeoutId); // Clear timeout just in case
             this.activeNotes.delete(noteId);
        }
    }

    /** Forcefully stops and cleans up a note immediately (used in dispose). */
     _forceCleanupNote(noteId) {
         if (!this.activeNotes.has(noteId)) return;
         const noteData = this.activeNotes.get(noteId);
         if (noteData.cleanupTimeoutId) clearTimeout(noteData.cleanupTimeoutId);
         try {
             if (noteData.toneOsc) try { if(noteData.toneOsc.stop) noteData.toneOsc.stop(0); noteData.toneOsc.disconnect(); } catch(e){}
             if (noteData.noiseSource) try { if(noteData.noiseSource.stop) noteData.noiseSource.stop(0); noteData.noiseSource.disconnect(); } catch(e){}
             if (noteData.breathFilter) try { noteData.breathFilter.disconnect(); } catch(e){}
             if (noteData.toneGain) try { noteData.toneGain.disconnect(); } catch(e){}
             if (noteData.breathGain) try { noteData.breathGain.disconnect(); } catch(e){}
             // Disconnect vibrato as well
             if (this.vibratoGain && noteData.toneOsc && noteData.toneOsc.detune) {
                 try { this.vibratoGain.disconnect(noteData.toneOsc.detune); } catch(e) {}
             }
         } catch (e) {
             console.error(`${this.MODULE_ID}: Error during force cleanup for note ${noteId}:`, e);
         } finally {
              this.activeNotes.delete(noteId);
         }
     }

     /** Cleans up partially created nodes if note creation fails mid-way. */
     _cleanupPartialNote(nodes) {
          console.warn(`${this.MODULE_ID}: Cleaning up partially created note nodes.`);
          const { toneOsc, noiseSource, breathFilter, toneGain, breathGain } = nodes;
          // Disconnect vibrato if it might have been connected
          if (this.vibratoGain && toneOsc && toneOsc.detune) {
              try { this.vibratoGain.disconnect(toneOsc.detune); } catch(e) {}
          }
          if (toneOsc) try { toneOsc.disconnect(); } catch(e){}
          if (noiseSource) try { noiseSource.disconnect(); } catch(e){}
          if (breathFilter) try { breathFilter.disconnect(); } catch(e){}
          if (toneGain) try { toneGain.disconnect(); } catch(e){}
          if (breathGain) try { breathGain.disconnect(); } catch(e){}
     }


    /** Selects a melodic pattern based on settings. */
    _selectMelodyPattern(settings) {
        try {
            const patterns = settings?.melodyPatterns || this.defaultFluteSettings.melodyPatterns;
            if (!Array.isArray(patterns) || patterns.length === 0) {
                console.warn(`${this.MODULE_ID}: No valid melody patterns found. Melody silent.`); return [];
            }
            const patternIndex = Math.floor(Math.random() * patterns.length);
            const selectedPattern = patterns[patternIndex];
            if (!Array.isArray(selectedPattern)) {
                 console.warn(`${this.MODULE_ID}: Selected pattern index ${patternIndex} is not array. Using empty.`); return [];
            }
            return selectedPattern;
        } catch (error) { console.error(`${this.MODULE_ID}: Error selecting melody pattern:`, error); return []; }
    }

    /** Selects an octave offset based on settings. */
     _selectOctaveOffset(settings) {
        try {
            const range = settings?.melodyOctaveRange || this.defaultFluteSettings.melodyOctaveRange;
            if (!Array.isArray(range) || range.length === 0) {
                console.warn(`${this.MODULE_ID}: Invalid melodyOctaveRange. Defaulting to 0.`); return 0;
            }
            const index = Math.floor(Math.random() * range.length);
            const offset = range[index];
            if (typeof offset !== 'number') {
                 console.warn(`${this.MODULE_ID}: Selected octave offset index ${index} not number (${offset}). Defaulting to 0.`); return 0;
            }
            return offset;
        } catch (error) { console.error(`${this.MODULE_ID}: Error selecting octave offset:`, error); return 0; }
     }


    /** Calculates the frequency for a note based on scale index and octave offset. */
    _calculateFrequency(scaleIndex, noteOctaveOffset = 0) {
        try {
            if (typeof scaleIndex !== 'number' || !Number.isInteger(scaleIndex)) throw new Error(`Invalid scaleIndex: ${scaleIndex}`);
            if (typeof noteOctaveOffset !== 'number') noteOctaveOffset = 0;

            const baseFreq = this.settings?.baseFreq || this.defaultFluteSettings.baseFreq;
            let scaleName = this.settings?.scale || this.defaultFluteSettings.scale;
            const scaleMap = typeof musicalScales !== 'undefined' ? musicalScales : null;
            if (!scaleMap) throw new Error("musicalScales data missing.");
            if (!scaleMap[scaleName]) { console.warn(`Scale '${scaleName}' not found. Using pentatonic.`); scaleName = 'pentatonic'; }
            const scale = scaleMap[scaleName];
            if (!scale || scale.length === 0) throw new Error(`Scale '${scaleName}' is empty or invalid.`);

            const scaleLength = scale.length;
            const scaleDegree = ((scaleIndex % scaleLength) + scaleLength) % scaleLength;
            const intervalOctaveOffset = Math.floor(scaleIndex / scaleLength);
            const totalOctaveOffset = this.currentOctaveOffset + intervalOctaveOffset + noteOctaveOffset;
            const semitones = scale[scaleDegree];
            if (typeof semitones !== 'number') throw new Error(`Invalid semitone value at index ${scaleDegree} in scale ${scaleName}`);

            const finalSemitoneOffset = semitones + totalOctaveOffset * 12;
            const frequency = baseFreq * Math.pow(2, finalSemitoneOffset / 12);
            if (isNaN(frequency) || frequency <= 0) throw new Error(`Calculated frequency is invalid: ${frequency}`);
            return frequency;

        } catch (error) {
             console.error(`${this.MODULE_ID}: Error calculating frequency:`, error);
             return 0; // Return 0 on error
        }
    }

    /**
     * Generates a buffer of pink noise.
     * @param {number} durationSeconds - The desired buffer duration.
     * @returns {AudioBuffer | null} The generated buffer or null on error.
     * @private
     */
    _createNoiseBuffer(durationSeconds) {
        if (!this.audioContext) return null;
        const sampleRate = this.audioContext.sampleRate;
        const frameCount = Math.max(1, Math.floor(sampleRate * durationSeconds)); // Ensure at least 1 frame
        const channels = 1; // Mono noise is sufficient for breath

        try {
            const buffer = this.audioContext.createBuffer(channels, frameCount, sampleRate);
            const channelData = buffer.getChannelData(0);

            // Simple pink noise generation (Voss-McCartney approximation)
            let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
            for (let i = 0; i < frameCount; i++) {
                const white = Math.random() * 2 - 1;
                b0 = 0.99886 * b0 + white * 0.0555179;
                b1 = 0.99332 * b1 + white * 0.0750759;
                b2 = 0.96900 * b2 + white * 0.1538520;
                b3 = 0.86650 * b3 + white * 0.3104856;
                b4 = 0.55000 * b4 + white * 0.5329522;
                b5 = -0.7616 * b5 - white * 0.0168980;
                let pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
                b6 = white * 0.115926;
                channelData[i] = pink * 0.11; // Scale down to prevent clipping
            }

             // Normalize buffer slightly below 1.0 to avoid clipping issues post-filtering/gain
             let maxVal = 0;
             for (let i = 0; i < frameCount; i++) maxVal = Math.max(maxVal, Math.abs(channelData[i]));
             if (maxVal > 0) {
                  const scaleFactor = 0.95 / maxVal;
                  for (let i = 0; i < frameCount; i++) channelData[i] *= scaleFactor;
             }

            console.log(`${this.MODULE_ID}: Generated ${durationSeconds}s noise buffer.`);
            return buffer;
        } catch (error) {
             console.error(`${this.MODULE_ID}: Error generating noise buffer:`, error);
             return null;
        }
    }

} // End class AEMelodyFluteSynth

// Make globally accessible for the AudioEngine
window.AEMelodyFluteSynth = AEMelodyFluteSynth;

console.log("ae_melodyFluteSynth.js loaded and AEMelodyFluteSynth class defined.");