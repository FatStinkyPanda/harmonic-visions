// ae_melodySine.js - Audio Module for Simple Sine Wave Melodies
// Part of the Harmonic Visions project by FatStinkyPanda
// Copyright (c) 2025 FatStinkyPanda - All rights reserved.
// Version: 1.1.1 (Fixed InvalidStateError on osc.stop)

/**
 * @class AEMelodySine
 * @description Generates melodic sequences using pure sine waves with precise timing,
 *              envelopes, and subtle effects. Implements the standard AudioEngine
 *              module interface with enhanced robustness and optimization.
 */
class AEMelodySine {
    constructor() {
        this.MODULE_ID = 'AEMelodySine'; // For logging and identification
        this.audioContext = null;
        this.masterOutput = null; // Connects to AudioEngine's masterInputGain
        this.settings = null;
        this.currentMood = null;
        this.isEnabled = false;
        this.isPlaying = false;

        // --- Core Audio Nodes ---
        this.moduleOutputGain = null; // Master gain for this module (controls overall melody volume)
        this.vibratoLFO = null;       // LFO for subtle pitch modulation
        this.vibratoGain = null;      // Controls vibrato depth
        this.delayNode = null;        // Simple delay effect node
        this.feedbackGain = null;     // Delay feedback control
        this.delayWetGain = null;     // Delay mix control

        // --- Sequencing State ---
        this.sequenceTimeoutId = null; // Stores the ID of the next scheduled note *check* timeout
        this.currentPattern = [];      // The melodic pattern currently being played
        this.currentPatternIndex = 0;  // Position within the current pattern
        this.currentOctaveOffset = 0;  // Current octave shift from baseFreq defined in settings
        this.nextNoteStartTime = 0;    // AudioContext time when the *next* note should begin its attack

        // --- Active Note Tracking ---
        // Map<noteId, { osc, gain, cleanupTimeoutId, isStopping }>
        this.activeNotes = new Map();
        this.noteIdCounter = 0; // Simple counter for unique note IDs

        // --- Default Settings for Sine Melody ---
        this.defaultMelodySettings = {
            melodyVolume: 0.28,
            melodyOctaveRange: [-1, 0, 0, 1], // Possible octave offsets, weighted towards 0
            noteVelocityBase: 0.7,    // Base velocity (amplitude)
            noteVelocityRange: 0.2,   // Random velocity variation (+/- this value * base)
            attackTime: 0.01,         // Quick attack
            decayTime: 0.15,          // How long the note takes to decay after attack
            sustainLevel: 0.0,        // Sustain level (0.0 for plucky, >0 for sustained)
            releaseTime: 0.25,        // Release time after note duration ends
            vibratoRate: 4.5,         // Hz
            vibratoDepth: 2.0,        // Cents (subtle)
            delayTime: 0.33,          // Seconds
            delayFeedback: 0.28,      // 0 to < 1
            delayWetMix: 0.35,        // 0 to 1
            tempo: 85,                // BPM (fallback)
            scale: 'pentatonicMinor', // Fallback scale (add to data.js if needed)
            baseFreq: 440,            // A4 (fallback)
            melodyPatterns: [         // Example pattern structure (should come from moodAudioSettings)
                [
                    { scaleIndex: 0, duration: 0.5 }, { scaleIndex: 2, duration: 0.5 },
                    { scaleIndex: 4, duration: 1.0 }, { isRest: true, duration: 0.5 },
                    { scaleIndex: 2, duration: 0.5 }, { scaleIndex: 0, duration: 1.0 },
                    { isRest: true, duration: 1.0 },
                ]
            ],
            humanizeTiming: 0.01,    // Max random timing offset (seconds) for humanization (optional)
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
             if (audioContext.state === 'closed') {
                 throw new Error("AudioContext is closed.");
             }
            this.audioContext = audioContext;
            this.masterOutput = masterOutputNode;
            // Merge initial settings with specific defaults for this module
            this.settings = { ...this.defaultMelodySettings, ...initialSettings };
            this.currentMood = initialMood;
            this.currentPattern = this._selectMelodyPattern(this.settings);
            this.currentOctaveOffset = this._selectOctaveOffset(this.settings);

            // --- Create Core Nodes ---
            // 1. Master Output Gain
            this.moduleOutputGain = this.audioContext.createGain();
            this.moduleOutputGain.gain.setValueAtTime(this.settings.melodyVolume, this.audioContext.currentTime);

            // 2. Vibrato LFO & Gain
            this.vibratoLFO = this.audioContext.createOscillator();
            this.vibratoLFO.type = 'sine';
            this.vibratoLFO.frequency.setValueAtTime(this.settings.vibratoRate, this.audioContext.currentTime);
            this.vibratoLFO.phase = Math.random() * Math.PI * 2; // Random start phase for uniqueness
            this.vibratoGain = this.audioContext.createGain();
            this.vibratoGain.gain.setValueAtTime(this.settings.vibratoDepth, this.audioContext.currentTime);
            this.vibratoLFO.connect(this.vibratoGain);
            // Vibrato Gain connects to individual oscillator detune params later in _createNote

            // 3. Delay Effect
            this.delayNode = this.audioContext.createDelay(1.0); // Max delay 1 second
            this.delayNode.delayTime.setValueAtTime(this.settings.delayTime, this.audioContext.currentTime);
            this.feedbackGain = this.audioContext.createGain();
            this.feedbackGain.gain.setValueAtTime(this.settings.delayFeedback, this.audioContext.currentTime);
            this.delayWetGain = this.audioContext.createGain();
            this.delayWetGain.gain.setValueAtTime(this.settings.delayWetMix, this.audioContext.currentTime);

            // --- Connect Audio Graph ---
            // Dry Path: Module Output -> Master Output
            this.moduleOutputGain.connect(this.masterOutput);
            // Wet Path: Module Output -> Delay -> Delay Wet Gain -> Master Output
            this.moduleOutputGain.connect(this.delayNode);
            this.delayNode.connect(this.feedbackGain);
            this.feedbackGain.connect(this.delayNode); // Feedback loop
            this.delayNode.connect(this.delayWetGain);
            this.delayWetGain.connect(this.masterOutput);

            // Start Vibrato LFO (runs constantly, only affects playing notes)
            try { this.vibratoLFO.start(); }
            catch(e) { if(e.name !== 'InvalidStateError') console.warn(`${this.MODULE_ID}: Error starting Vibrato LFO:`, e); }

            this.isEnabled = true;
            console.log(`${this.MODULE_ID}: Initialization complete.`);

        } catch (error) {
            console.error(`${this.MODULE_ID}: Initialization failed:`, error);
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', `Sine Melody init failed: ${error.message}`);
            }
            this.dispose(); // Cleanup partial initialization
            this.isEnabled = false;
            // Allow AudioEngine to handle module failure
        }
    }

    /**
     * Update loop hook. Minimal use for this module as sequencing is event-driven.
     * @param {number} time - Current elapsed time.
     * @param {string} mood - Current mood key.
     * @param {object} visualParams - Parameters from the visual system.
     * @param {object} audioParams - Parameters derived from mood settings.
     * @param {number} deltaTime - Time since last frame.
     */
    update(time, mood, visualParams, audioParams, deltaTime) {
        if (!this.isEnabled || !this.isPlaying) return;
        // Could potentially modulate delay time or vibrato rate subtly here based on visualParams,
        // but keep minimal for performance. Primary logic is in scheduling.
    }

    /**
     * Start the melody sequence using precise Web Audio timing.
     * @param {number} startTime - AudioContext time when playback should ideally start.
     */
    play(startTime) {
        if (!this.isEnabled || this.isPlaying) return;
        if (!this.audioContext) {
            console.error(`${this.MODULE_ID}: Cannot play - AudioContext is missing.`);
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
             // We'll proceed, but sound won't start until context resumes.
             // The `nextNoteStartTime` will be based on the time when play *was called*.
         }

        console.log(`${this.MODULE_ID}: Starting playback sequence at ${startTime.toFixed(3)}`);

        try {
            this.isPlaying = true;
            this.currentPatternIndex = 0; // Reset pattern position
            this.noteIdCounter = 0; // Reset note ID counter
            // Set the start time for the *very first* note. Use max to avoid scheduling in the past.
            this.nextNoteStartTime = Math.max(this.audioContext.currentTime, startTime);

            // Ensure LFO is running (might have been stopped/re-initialized)
             if (this.vibratoLFO) {
                try { this.vibratoLFO.start(this.nextNoteStartTime); }
                catch (e) { if(e.name !== 'InvalidStateError') console.warn(`${this.MODULE_ID}: Error restarting Vibrato LFO:`, e); }
             }

            // Clear any previous scheduling timeout
            if (this.sequenceTimeoutId) {
                clearTimeout(this.sequenceTimeoutId);
                this.sequenceTimeoutId = null;
            }

            // Schedule the first note check
            this._scheduleNextNoteCheck();

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during play():`, error);
            this.isPlaying = false; // Ensure state is correct on error
            if (this.sequenceTimeoutId) clearTimeout(this.sequenceTimeoutId);
            this.sequenceTimeoutId = null;
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', `Sine Melody play failed: ${error.message}`);
            }
        }
    }

    /**
     * Stop the melody sequence and fade out any active notes gracefully.
     * @param {number} stopTime - AudioContext time when playback should stop.
     * @param {number} [fadeDuration=0.1] - Suggested duration (mostly ignored, uses note release).
     */
    stop(stopTime, fadeDuration = 0.1) { // fadeDuration is less relevant here
        if (!this.isEnabled || !this.isPlaying) return;
        if (!this.audioContext) {
            console.error(`${this.MODULE_ID}: Cannot stop - AudioContext is missing.`);
            return;
        }
         if (this.audioContext.state === 'closed') {
            console.error(`${this.MODULE_ID}: Cannot stop - AudioContext is closed.`);
            return; // No audio operations possible
        }

        console.log(`${this.MODULE_ID}: Stopping playback sequence at ${stopTime.toFixed(3)}`);

        try {
            this.isPlaying = false; // Stop scheduling new notes immediately

            // Clear the pending next note check timeout
            if (this.sequenceTimeoutId) {
                clearTimeout(this.sequenceTimeoutId);
                this.sequenceTimeoutId = null;
            }

            const now = this.audioContext.currentTime;
            const targetStopTime = Math.max(now, stopTime); // Ensure stop time is not in the past

            // Initiate release phase for all currently active (sounding) notes
            this.activeNotes.forEach((noteData, noteId) => {
                 if (noteData && noteData.gain && noteData.osc && !noteData.isStopping) {
                     noteData.isStopping = true; // Mark to prevent duplicate stop actions
                     console.debug(`${this.MODULE_ID}: Triggering release for active note ${noteId}`);
                     const release = this.settings.releaseTime || 0.25;
                     const gainParam = noteData.gain.gain;

                     // Cancel any future ramps and start release from current value
                     gainParam.cancelScheduledValues(targetStopTime);
                     gainParam.setTargetAtTime(0.0001, targetStopTime, release / 3.0); // Exponential release

                     // Schedule oscillator stop *after* release completes
                     const oscStopTime = targetStopTime + release + 0.1; // Add buffer
                      if (noteData.osc.stop) {
                           try {
                                noteData.osc.stop(oscStopTime);
                           } catch (e) { if(e.name !== 'InvalidStateError') console.warn(`${this.MODULE_ID}: Error scheduling stop for note ${noteId}:`, e); }
                      }

                      // Reschedule cleanup based on the new stop time
                      if (noteData.cleanupTimeoutId) {
                          clearTimeout(noteData.cleanupTimeoutId);
                      }
                      const cleanupDelay = (oscStopTime - this.audioContext.currentTime + 0.1) * 1000; // Delay from *now*
                      noteData.cleanupTimeoutId = setTimeout(() => {
                           this._cleanupNote(noteId);
                      }, Math.max(100, cleanupDelay)); // Ensure minimum delay
                 }
            });
            // Note: We don't fade the main moduleOutputGain here; individual notes handle release.

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during stop():`, error);
            // Attempt to clear active notes map as a fallback, though nodes might leak
            this.activeNotes.forEach((noteData, noteId) => { if (noteData?.cleanupTimeoutId) clearTimeout(noteData.cleanupTimeoutId); });
            this.activeNotes.clear();
             if (typeof ToastSystem !== 'undefined') {
                 ToastSystem.notify('error', `Sine Melody stop failed: ${error.message}`);
             }
        }
    }

    /**
     * Adapt melody generation to the new mood's settings. This involves stopping
     * the current sequence, updating parameters, and restarting the sequence
     * with the new settings if playback was active.
     * @param {string} newMood - The key of the new mood.
     * @param {object} newSettings - The moodAudioSettings for the new mood.
     * @param {number} transitionTime - Duration for the transition (used for parameter ramps).
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

        const wasPlaying = this.isPlaying; // Store original playback state

        try {
            // --- Stop Current Sequence ---
            // This also clears pending notes and triggers release for active ones
            this.stop(this.audioContext.currentTime, 0.1); // Quick stop/release trigger

            // --- Update Settings ---
            this.settings = { ...this.defaultMelodySettings, ...newSettings };
            this.currentMood = newMood;

            const now = this.audioContext.currentTime;
            const rampTime = transitionTime * 0.5; // Use part of transition for parameter ramps

            // --- Update Module Parameters ---
            // 1. Overall Volume
            if (this.moduleOutputGain) {
                this.moduleOutputGain.gain.setTargetAtTime(this.settings.melodyVolume, now, rampTime / 2);
            }

            // 2. Vibrato
            if (this.vibratoLFO && this.vibratoGain) {
                this.vibratoLFO.frequency.setTargetAtTime(this.settings.vibratoRate, now, rampTime);
                this.vibratoGain.gain.setTargetAtTime(this.settings.vibratoDepth, now, rampTime);
            }

            // 3. Delay Effect
            if (this.delayNode && this.feedbackGain && this.delayWetGain) {
                this.delayNode.delayTime.setTargetAtTime(this.settings.delayTime, now, rampTime);
                this.feedbackGain.gain.setTargetAtTime(this.settings.delayFeedback, now, rampTime);
                this.delayWetGain.gain.setTargetAtTime(this.settings.delayWetMix, now, rampTime);
            }

            // --- Reset Sequencer State for New Mood ---
            this.currentPattern = this._selectMelodyPattern(this.settings);
            this.currentPatternIndex = 0;
            this.currentOctaveOffset = this._selectOctaveOffset(this.settings);
            // Note: nextNoteStartTime will be set when play is called again if needed

            // --- Restart Playback if it was active ---
            if (wasPlaying) {
                console.log(`${this.MODULE_ID}: Restarting sequence for new mood.`);
                // Schedule the restart slightly after parameter ramps have started
                const restartTime = now + rampTime * 0.1; // Small delay
                this.play(restartTime);
            }

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during changeMood():`, error);
            this.isPlaying = false; // Ensure stopped state on error
            if (this.sequenceTimeoutId) clearTimeout(this.sequenceTimeoutId);
            this.sequenceTimeoutId = null;
            if (typeof ToastSystem !== 'undefined') {
                ToastSystem.notify('error', `Sine Melody mood change failed: ${error.message}`);
            }
        }
    }

    /**
     * Clean up all audio resources and timers.
     */
    dispose() {
        console.log(`${this.MODULE_ID}: Disposing...`);
        if (!this.isEnabled && !this.moduleOutputGain) {
             console.log(`${this.MODULE_ID}: Already disposed or not initialized.`);
             return; // Avoid redundant disposal
        }
        this.isEnabled = false;
        this.isPlaying = false;

        try {
            // 1. Clear sequence timeout
            if (this.sequenceTimeoutId) {
                clearTimeout(this.sequenceTimeoutId);
                this.sequenceTimeoutId = null;
            }

            // 2. Stop and clean up any active notes immediately
            this.activeNotes.forEach((noteData, noteId) => {
                this._forceCleanupNote(noteId); // Use a more forceful cleanup
            });
            this.activeNotes.clear();

            // 3. Stop and disconnect LFO
            if (this.vibratoLFO) try { if(this.vibratoLFO.stop) this.vibratoLFO.stop(0); this.vibratoLFO.disconnect(); } catch(e){}
            if (this.vibratoGain) try { this.vibratoGain.disconnect(); } catch(e){}

            // 4. Disconnect Delay nodes
            // Disconnect main gain from both master and delay input
            if (this.moduleOutputGain) try { this.moduleOutputGain.disconnect(); } catch(e){}
            if (this.delayNode) try { this.delayNode.disconnect(); } catch(e){} // Disconnects from feedback and wet gain
            if (this.feedbackGain) try { this.feedbackGain.disconnect(); } catch(e){}
            if (this.delayWetGain) try { this.delayWetGain.disconnect(); } catch(e){}

        } catch (error) {
             // Log any unexpected error during the disconnection phase
             console.error(`${this.MODULE_ID}: Error during node disconnection phase:`, error);
        } finally {
            // 5. Nullify all references
            this.moduleOutputGain = null;
            this.vibratoLFO = null;
            this.vibratoGain = null;
            this.delayNode = null;
            this.feedbackGain = null;
            this.delayWetGain = null;
            this.audioContext = null;
            this.masterOutput = null;
            this.settings = null;
            this.currentPattern = [];
            this.activeNotes.clear(); // Ensure map is cleared
            console.log(`${this.MODULE_ID}: Disposal complete.`);
        }
    }

    // --- Internal Sequencing and Note Generation ---

    /**
     * Schedules the next check/trigger for note playback using setTimeout.
     * This acts as the "metronome" driving the sequence.
     * @private
     */
    _scheduleNextNoteCheck() {
        if (!this.isPlaying || !this.audioContext) return;

        // Calculate time until the next note *should* start
        const currentTime = this.audioContext.currentTime;
        const delaySeconds = Math.max(0, this.nextNoteStartTime - currentTime);
        const delayMilliseconds = delaySeconds * 1000;

        // Clear previous timeout if any
        if (this.sequenceTimeoutId) {
            clearTimeout(this.sequenceTimeoutId);
        }

        // Schedule the next execution of _playNextNoteInSequence
        this.sequenceTimeoutId = setTimeout(() => {
            if (!this.isPlaying) return; // Double-check state
            try {
                this._playNextNoteInSequence();
            } catch (e) {
                console.error(`${this.MODULE_ID}: Error in _playNextNoteInSequence:`, e);
                this.stop(this.audioContext.currentTime); // Stop sequence on error
            }
        }, delayMilliseconds);
    }

    /**
     * Plays the current note/rest in the sequence and schedules the next check.
     * @private
     */
    _playNextNoteInSequence() {
        if (!this.isPlaying || !this.audioContext || this.currentPattern.length === 0) {
            this.isPlaying = false; // Stop if pattern is empty or state changed
            return;
        }

        const patternItem = this.currentPattern[this.currentPatternIndex];
        const tempo = this.settings.tempo || this.defaultMelodySettings.tempo;
        const beatDuration = 60.0 / tempo;
        const noteDurationBeats = patternItem.duration || 1.0;
        const noteDurationSeconds = noteDurationBeats * beatDuration;
        const isRest = patternItem.isRest || false;

        // Precise start time for this note (should align with nextNoteStartTime)
        const noteStartTime = this.nextNoteStartTime;

        // Add slight timing randomization (humanization) if enabled
        let timingOffset = 0;
        if (this.settings.humanizeTiming && this.settings.humanizeTiming > 0) {
             timingOffset = (Math.random() - 0.5) * 2.0 * this.settings.humanizeTiming;
        }
        const actualNoteStartTime = noteStartTime + timingOffset;


        if (!isRest) {
            // Play the note using precise Web Audio scheduling
            this._createNote(patternItem, actualNoteStartTime, noteDurationSeconds);
        } else {
             // console.debug(`${this.MODULE_ID}: Rest for ${noteDurationSeconds.toFixed(2)}s starting at ${noteStartTime.toFixed(3)}`);
        }

        // Calculate the start time for the *following* note/rest
        this.nextNoteStartTime = noteStartTime + noteDurationSeconds;

        // Move to the next step in the pattern
        this.currentPatternIndex++;
        if (this.currentPatternIndex >= this.currentPattern.length) {
            this.currentPatternIndex = 0; // Loop pattern
            // Optionally change octave or pattern here for variation
            this.currentOctaveOffset = this._selectOctaveOffset(this.settings);
            this.currentPattern = this._selectMelodyPattern(this.settings); // Re-select pattern
            console.debug(`${this.MODULE_ID}: Looped pattern. New octave offset: ${this.currentOctaveOffset}`);
            // Add a small gap when looping? Optional.
            // this.nextNoteStartTime += beatDuration * 0.1;
        }

        // Schedule the *next check* based on the calculated nextNoteStartTime
        this._scheduleNextNoteCheck();
    }


    /**
     * Creates and plays a single sine wave note with envelope and effects.
     * @param {object} noteInfo - Object containing note details { scaleIndex, velocity?, octave? }
     * @param {number} playTime - The precise AudioContext time the note attack should start.
     * @param {number} durationSeconds - The rhythmic duration of the note (before release).
     * @private
     */
    _createNote(noteInfo, playTime, durationSeconds) {
        if (!this.audioContext || !this.moduleOutputGain || playTime < this.audioContext.currentTime) {
             // Avoid scheduling in the past or if essential nodes are missing
             console.warn(`${this.MODULE_ID}: Skipping note creation - invalid time or missing nodes.`);
             return;
        }

        let osc = null;
        let gain = null;
        const noteId = `note-${this.noteIdCounter++}`;

        try {
            const frequency = this._calculateFrequency(noteInfo.scaleIndex, noteInfo.octave);
            if (frequency <= 0) {
                console.warn(`${this.MODULE_ID}: Skipping note with invalid frequency (${frequency}) for scaleIndex ${noteInfo.scaleIndex}`);
                return;
            }

            // --- Create Nodes ---
            osc = this.audioContext.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(frequency, playTime); // Set frequency precisely at playTime

            gain = this.audioContext.createGain();
            gain.gain.setValueAtTime(0.0001, playTime); // Start silent

            // Connect nodes: Osc -> Gain -> Module Output Gain
            osc.connect(gain);
            gain.connect(this.moduleOutputGain);

            // Connect Vibrato LFO Gain to Oscillator's detune parameter (if available)
            if (this.vibratoGain && osc.detune) {
                try {
                     this.vibratoGain.connect(osc.detune);
                } catch (vibratoConnectError) {
                     console.warn(`${this.MODULE_ID}: Failed to connect vibrato to note ${noteId}:`, vibratoConnectError);
                }
            }

            // --- Start the oscillator PRECISELY at playTime ---
            // Moved this *before* scheduling stop and envelopes
            osc.start(playTime);
            // --- End Move ---

            // --- Apply Envelope (ADSR-like) ---
            const baseVelocity = this.settings.noteVelocityBase || 0.7;
            const velocityRange = this.settings.noteVelocityRange || 0.2;
            const randomVelocityMod = 1.0 + (Math.random() - 0.5) * 2.0 * velocityRange; // +/- range
            const velocity = Math.max(0.1, Math.min(1.0, (noteInfo.velocity || baseVelocity) * randomVelocityMod)); // Apply pattern velocity and random mod

            const attack = this.settings.attackTime || 0.01;
            const decay = this.settings.decayTime || 0.15;
            const sustain = Math.max(0.0001, this.settings.sustainLevel || 0.0); // Ensure sustain > 0 for setTargetAtTime
            const release = this.settings.releaseTime || 0.25;
            const gainParam = gain.gain;

            // Attack Phase
            gainParam.linearRampToValueAtTime(velocity, playTime + attack);

            // Decay Phase (to sustain level)
            gainParam.setTargetAtTime(velocity * sustain, playTime + attack, decay / 3.0); // Decay time constant

            // Release Phase (starts at the end of the note's rhythmic duration)
            const releaseStartTime = playTime + durationSeconds;
            gainParam.setTargetAtTime(0.0001, releaseStartTime, release / 3.0); // Release time constant

            // --- Schedule Oscillator Stop ---
            // Stop time is after the note duration AND the release phase
            const stopTime = releaseStartTime + release + 0.1; // Add buffer
            if (osc.stop) {
                osc.stop(stopTime); // Now safe to schedule stop
            } else {
                 console.warn(`${this.MODULE_ID}: Oscillator node missing stop method? Note ${noteId}`);
            }

            // --- Schedule Cleanup ---
            const cleanupDelay = (stopTime - this.audioContext.currentTime + 0.1) * 1000; // Delay from *now*
            const cleanupTimeoutId = setTimeout(() => {
                this._cleanupNote(noteId);
            }, Math.max(50, cleanupDelay)); // Ensure minimum delay

            // --- Store Active Note ---
            this.activeNotes.set(noteId, { osc, gain, cleanupTimeoutId, isStopping: false });

            // --- MOVED: osc.start(playTime); --- was here

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error creating note ${noteId}:`, error);
            // Attempt cleanup of partially created nodes
            if (osc) try { osc.disconnect(); } catch(e) {}
            if (gain) try { gain.disconnect(); } catch(e) {}
            if (this.activeNotes.has(noteId)) {
                 const noteData = this.activeNotes.get(noteId);
                 if (noteData.cleanupTimeoutId) clearTimeout(noteData.cleanupTimeoutId);
                 this.activeNotes.delete(noteId);
            }
        }
    }

    /**
     * Cleans up resources associated with a finished or stopped note.
     * @param {string} noteId - The unique ID of the note to clean up.
     * @private
     */
    _cleanupNote(noteId) {
        if (!this.activeNotes.has(noteId)) return; // Already cleaned up

        const noteData = this.activeNotes.get(noteId);
        // console.debug(`${this.MODULE_ID}: Cleaning up note ${noteId}`);

        try {
             // Disconnect vibrato first if connected
             if (this.vibratoGain && noteData.osc && noteData.osc.detune) {
                 try { this.vibratoGain.disconnect(noteData.osc.detune); } catch(e) { /* ignore if already disconnected */ }
             }
             // Disconnect oscillator and gain
             if (noteData.osc) try { noteData.osc.disconnect(); } catch (e) {}
             if (noteData.gain) try { noteData.gain.disconnect(); } catch (e) {}
        } catch (e) {
             console.error(`${this.MODULE_ID}: Error disconnecting nodes for note ${noteId}:`, e);
        } finally {
             // Clear the cleanup timeout reference just in case
             if (noteData.cleanupTimeoutId) {
                 clearTimeout(noteData.cleanupTimeoutId); // Ensure timeout is cleared
             }
             // Remove from the active notes map
             this.activeNotes.delete(noteId);
        }
    }

     /**
      * Forcefully stops and cleans up a note immediately (used in dispose).
      * @param {string} noteId - The unique ID of the note to clean up.
      * @private
      */
     _forceCleanupNote(noteId) {
         if (!this.activeNotes.has(noteId)) return;
         const noteData = this.activeNotes.get(noteId);

         if (noteData.cleanupTimeoutId) {
             clearTimeout(noteData.cleanupTimeoutId);
         }

         try {
             if (noteData.osc) {
                 try { if(noteData.osc.stop) noteData.osc.stop(0); } catch(e){} // Stop immediately
                 try { noteData.osc.disconnect(); } catch(e){}
             }
             if (noteData.gain) {
                 try { noteData.gain.disconnect(); } catch(e){}
             }
             // No need to disconnect vibrato here as the oscillator is gone
         } catch (e) {
             console.error(`${this.MODULE_ID}: Error during force cleanup for note ${noteId}:`, e);
         } finally {
              this.activeNotes.delete(noteId);
         }
     }


    /**
     * Selects a melodic pattern based on settings (can be randomized).
     * @param {object} settings
     * @returns {Array} The selected pattern array. Returns empty array if none found.
     * @private
     */
    _selectMelodyPattern(settings) {
        try {
            const patterns = settings?.melodyPatterns || this.defaultMelodySettings.melodyPatterns;
            if (!Array.isArray(patterns) || patterns.length === 0) {
                console.warn(`${this.MODULE_ID}: No valid melody patterns found in settings. Melody will be silent.`);
                return [];
            }
            // Select a random pattern from the available ones
            const patternIndex = Math.floor(Math.random() * patterns.length);
            const selectedPattern = patterns[patternIndex];
            if (!Array.isArray(selectedPattern)) {
                 console.warn(`${this.MODULE_ID}: Selected pattern at index ${patternIndex} is not an array. Using empty pattern.`);
                 return [];
            }
            return selectedPattern;
        } catch (error) {
             console.error(`${this.MODULE_ID}: Error selecting melody pattern:`, error);
             return []; // Return empty on error
        }
    }

    /**
    * Selects an octave offset based on settings (can be randomized).
    * @param {object} settings
    * @returns {number} The selected octave offset. Defaults to 0 on error.
    * @private
    */
     _selectOctaveOffset(settings) {
        try {
            const range = settings?.melodyOctaveRange || this.defaultMelodySettings.melodyOctaveRange;
            if (!Array.isArray(range) || range.length === 0) {
                console.warn(`${this.MODULE_ID}: Invalid or empty melodyOctaveRange. Defaulting to 0.`);
                return 0;
            }
            // Select a random offset from the provided array (allows weighting)
            const index = Math.floor(Math.random() * range.length);
            const offset = range[index];
            if (typeof offset !== 'number') {
                 console.warn(`${this.MODULE_ID}: Selected octave offset at index ${index} is not a number (${offset}). Defaulting to 0.`);
                 return 0;
            }
            return offset;
        } catch (error) {
             console.error(`${this.MODULE_ID}: Error selecting octave offset:`, error);
             return 0; // Default to 0 on error
        }
     }


    /**
     * Calculates the frequency for a note based on scale index and octave offset.
     * @param {number} scaleIndex - The index within the scale (0-based).
     * @param {number} [noteOctaveOffset=0] - Additional octave shift for this specific note from pattern.
     * @returns {number} The calculated frequency in Hz. Returns 0 on error or invalid input.
     * @private
     */
    _calculateFrequency(scaleIndex, noteOctaveOffset = 0) {
        try {
            // Validate inputs
            if (typeof scaleIndex !== 'number' || !Number.isInteger(scaleIndex)) {
                 console.warn(`${this.MODULE_ID}: Invalid scaleIndex (${scaleIndex}). Must be an integer.`);
                 return 0;
            }
            if (typeof noteOctaveOffset !== 'number') {
                 console.warn(`${this.MODULE_ID}: Invalid noteOctaveOffset (${noteOctaveOffset}). Defaulting to 0.`);
                 noteOctaveOffset = 0;
            }

            const baseFreq = this.settings?.baseFreq || this.defaultMelodySettings.baseFreq;
            let scaleName = this.settings?.scale || this.defaultMelodySettings.scale;
            const scaleMap = typeof musicalScales !== 'undefined' ? musicalScales : null;

            if (!scaleMap) {
                 console.error(`${this.MODULE_ID}: musicalScales data structure not found.`);
                 return 0;
            }
            if (!scaleMap[scaleName]) {
                 console.warn(`${this.MODULE_ID}: Scale '${scaleName}' not found in musicalScales. Using default pentatonicMinor.`);
                 scaleName = 'pentatonicMinor'; // Fallback scale
                 // Add pentatonicMinor if it doesn't exist in data.js
                 if (!scaleMap[scaleName]) {
                     scaleMap[scaleName] = [0, 3, 5, 7, 10]; // Example pentatonic minor intervals
                     console.warn(`${this.MODULE_ID}: Added fallback scale 'pentatonicMinor'.`);
                 }
                 if (!scaleMap[scaleName]) return 0; // Stop if even fallback is missing
            }

            const scale = scaleMap[scaleName];
            const scaleLength = scale.length;
            if (scaleLength === 0) {
                 console.error(`${this.MODULE_ID}: Scale '${scaleName}' has zero length.`);
                 return 0;
            }

            // Allow scaleIndex to wrap around the scale degrees within a reasonable range (e.g., +/- 2 octaves from base)
            const maxIndex = scaleLength * 3; // Allow up to 3 octaves range via index
            const minIndex = -scaleLength * 2;
            if (scaleIndex < minIndex || scaleIndex >= maxIndex) {
                 console.warn(`${this.MODULE_ID}: Scale index ${scaleIndex} out of reasonable range [${minIndex}, ${maxIndex}). Clamping/Wrapping.`);
                 // Simple wrap to base octave for safety, could be clamped instead
                 scaleIndex = ((scaleIndex % scaleLength) + scaleLength) % scaleLength;
            }

            // Calculate scale degree and octave offset from index
            const scaleDegree = ((scaleIndex % scaleLength) + scaleLength) % scaleLength; // Ensures positive index
            const intervalOctaveOffset = Math.floor(scaleIndex / scaleLength);
            const totalOctaveOffset = this.currentOctaveOffset + intervalOctaveOffset + noteOctaveOffset;

            const semitones = scale[scaleDegree];
            if (typeof semitones !== 'number') {
                 console.error(`${this.MODULE_ID}: Invalid semitone value for scale '${scaleName}', degree ${scaleDegree}.`);
                 return 0;
            }

            const finalSemitoneOffset = semitones + totalOctaveOffset * 12;
            const frequency = baseFreq * Math.pow(2, finalSemitoneOffset / 12);

            if (isNaN(frequency) || frequency <= 0) {
                 console.error(`${this.MODULE_ID}: Calculated frequency is invalid (${frequency}).`);
                 return 0;
            }

            return frequency;

        } catch (error) {
             console.error(`${this.MODULE_ID}: Error calculating frequency:`, error);
             return 0; // Return 0 on any calculation error
        }
    }

} // End class AEMelodySine

// Make globally accessible for the AudioEngine
window.AEMelodySine = AEMelodySine;

console.log("ae_melodySine.js loaded and AEMelodySine class defined.");