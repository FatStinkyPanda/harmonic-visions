// ae_melodySine.js - Audio Module for Simple Sine Wave Melodies
// Part of the Harmonic Visions project by FatStinkyPanda
// Copyright (c) 2025 FatStinkyPanda - All rights reserved.
// Version: 1.0.0 (Initial Implementation)

/**
 * @class AEMelodySine
 * @description Generates melodic sequences using pure sine waves with envelopes and subtle effects.
 *              Implements the standard AudioEngine module interface.
 */
class AEMelodySine {
    constructor() {
        this.MODULE_ID = 'AEMelodySine'; // For logging
        this.audioContext = null;
        this.masterOutput = null; // Connects to AudioEngine's masterInputGain
        this.settings = null;
        this.currentMood = null;
        this.isEnabled = false;
        this.isPlaying = false;

        // Core Nodes
        this.moduleOutputGain = null; // Master gain for this module (controls overall melody volume)
        this.vibratoLFO = null;       // LFO for subtle pitch modulation
        this.vibratoGain = null;      // Controls vibrato depth
        this.delayNode = null;        // Simple delay effect node
        this.feedbackGain = null;     // Delay feedback control
        this.delayWetGain = null;     // Delay mix control

        // Sequencing State
        this.sequenceTimeoutId = null; // Stores the ID of the next scheduled note timeout
        this.currentPattern = [];      // The melodic pattern currently being played
        this.currentPatternIndex = 0;  // Position within the current pattern
        this.currentOctaveOffset = 0;  // Current octave shift from baseFreq defined in settings
        this.lastNoteEndTime = 0;      // AudioContext time when the last note finished its envelope

        // Tracking active notes for cleanup
        this.activeNotes = new Map(); // Map<noteId, { osc, gain, cleanupTimeout }>

        // Default settings for sine melody
        this.defaultMelodySettings = {
            melodyVolume: 0.25,
            melodyOctaveRange: [-1, 0, 0, 1], // Possible octave offsets, weighted towards 0
            noteVelocity: 0.8,      // Base velocity (amplitude)
            attackTime: 0.01,       // Quick attack
            decayTime: 0.2,         // How long the note takes to fade after attack
            sustainLevel: 0.0,      // No sustain for plucky sounds
            releaseTime: 0.1,       // Short release after note duration ends
            vibratoRate: 4.0,       // Hz
            vibratoDepth: 1.5,      // Cents
            delayTime: 0.3,         // Seconds
            delayFeedback: 0.25,    // 0 to < 1
            delayWetMix: 0.3,       // 0 to 1
            tempo: 80,              // BPM (fallback)
            scale: 'pentatonic',    // Fallback scale
            baseFreq: 440,          // A4 (fallback)
            // Example pattern structure (should ideally come from moodAudioSettings)
            melodyPatterns: [
                [ // Pattern 1
                    { scaleIndex: 0, duration: 0.5, velocity: 0.8 }, // duration in beats
                    { scaleIndex: 2, duration: 0.5, velocity: 0.7 },
                    { scaleIndex: 4, duration: 1.0, velocity: 0.9 },
                    { isRest: true, duration: 0.5 },
                    { scaleIndex: 2, duration: 0.5, velocity: 0.7 },
                    { scaleIndex: 0, duration: 1.0, velocity: 0.8 },
                ]
            ]
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
            this.settings = { ...this.defaultMelodySettings, ...initialSettings };
            this.currentMood = initialMood;
            this.currentPattern = this._selectMelodyPattern(this.settings); // Select initial pattern

            // --- Create Core Nodes ---
            // 1. Master Output Gain
            this.moduleOutputGain = this.audioContext.createGain();
            this.moduleOutputGain.gain.value = this.settings.melodyVolume;

            // 2. Vibrato LFO
            this.vibratoLFO = this.audioContext.createOscillator();
            this.vibratoLFO.type = 'sine';
            this.vibratoLFO.frequency.setValueAtTime(this.settings.vibratoRate, this.audioContext.currentTime);
            this.vibratoLFO.phase = Math.random() * Math.PI * 2; // Random start phase
            this.vibratoGain = this.audioContext.createGain();
            this.vibratoGain.gain.setValueAtTime(this.settings.vibratoDepth, this.audioContext.currentTime);
            this.vibratoLFO.connect(this.vibratoGain);
            // Vibrato Gain connects to individual oscillator detune params later

            // 3. Simple Delay Effect (Optional, adds space)
            this.delayNode = this.audioContext.createDelay(1.0); // Max delay 1 second
            this.delayNode.delayTime.setValueAtTime(this.settings.delayTime, this.audioContext.currentTime);
            this.feedbackGain = this.audioContext.createGain();
            this.feedbackGain.gain.setValueAtTime(this.settings.delayFeedback, this.audioContext.currentTime);
            this.delayWetGain = this.audioContext.createGain();
            this.delayWetGain.gain.setValueAtTime(this.settings.delayWetMix, this.audioContext.currentTime);

            // --- Connect Audio Graph ---
            // Module Output -> Master Output (Dry Path)
            this.moduleOutputGain.connect(this.masterOutput);

            // Module Output -> Delay Input -> Delay Wet Gain -> Master Output (Wet Path)
            this.moduleOutputGain.connect(this.delayNode);
            this.delayNode.connect(this.feedbackGain);
            this.feedbackGain.connect(this.delayNode); // Feedback loop
            this.delayNode.connect(this.delayWetGain);
            this.delayWetGain.connect(this.masterOutput);

            // Start Vibrato LFO (it runs constantly but only affects playing notes)
            try { this.vibratoLFO.start(); } catch(e) { console.warn(`${this.MODULE_ID}: Vibrato LFO likely already started.`); }

            this.isEnabled = true;
            console.log(`${this.MODULE_ID}: Initialization complete.`);

        } catch (error) {
            console.error(`${this.MODULE_ID}: Initialization failed:`, error);
            this.dispose(); // Cleanup partial initialization
            throw error; // Propagate error
        }
    }

    /**
     * Main update loop connection point (currently unused for this module).
     * Sequencing is handled by internal setTimeout loop.
     */
    update(time, mood, visualParams, audioParams, deltaTime) {
        if (!this.isEnabled || !this.isPlaying) return;
        // Potential use: Modulate delay time or vibrato based on visualParams?
        // Keep minimal for performance.
    }

    /**
     * Start the melody sequence.
     */
    play(startTime) {
        if (!this.isEnabled || this.isPlaying) return;
        if (!this.audioContext) {
            console.error(`${this.MODULE_ID}: Cannot play, AudioContext is missing.`);
            return;
        }
        console.log(`${this.MODULE_ID}: Starting playback sequence at ${startTime.toFixed(3)}`);

        try {
            this.isPlaying = true;
            this.currentPatternIndex = 0; // Reset pattern position
            this.lastNoteEndTime = this.audioContext.currentTime; // Reset last note time

            // Ensure LFO is running if it was stopped/re-initialized
             if (this.vibratoLFO) {
                try { this.vibratoLFO.start(startTime); } catch (e) { /* ignore if already started */ }
             }

            // Schedule the first note
            this._scheduleNextNote();

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during play():`, error);
            this.isPlaying = false; // Ensure state is correct on error
            if(this.sequenceTimeoutId) clearTimeout(this.sequenceTimeoutId);
            this.sequenceTimeoutId = null;
        }
    }

    /**
     * Stop the melody sequence and fade out any active notes.
     */
    stop(stopTime, fadeDuration = 0.1) { // Short default fade for melody notes
        if (!this.isEnabled || !this.isPlaying) return;
        if (!this.audioContext) {
            console.error(`${this.MODULE_ID}: Cannot stop, AudioContext is missing.`);
            return;
        }
        console.log(`${this.MODULE_ID}: Stopping playback sequence at ${stopTime.toFixed(3)}`);

        try {
            this.isPlaying = false;

            // Clear the pending next note schedule
            if (this.sequenceTimeoutId) {
                clearTimeout(this.sequenceTimeoutId);
                this.sequenceTimeoutId = null;
            }

            // Stop any currently playing notes gracefully (apply release)
            const now = this.audioContext.currentTime;
            this.activeNotes.forEach((noteData, noteId) => {
                 if (noteData.osc && noteData.gain) {
                     const release = this.settings.releaseTime || 0.1;
                     // Cancel any pending ramps, start release from current value
                     noteData.gain.gain.cancelScheduledValues(now);
                     noteData.gain.gain.setTargetAtTime(0.0001, now, release / 3.0); // Faster release on stop
                     // Schedule oscillator stop after release
                      if (noteData.osc.stop) {
                           noteData.osc.stop(now + release + 0.1);
                      }
                      // Clear the automatic cleanup timeout, as we are stopping now
                      if (noteData.cleanupTimeout) {
                           clearTimeout(noteData.cleanupTimeout);
                      }
                      // Schedule immediate cleanup after stop+release
                      setTimeout(() => this._cleanupNote(noteId), (release + 0.2) * 1000);
                 }
            });
            // Note: We don't fade the main moduleOutputGain here, as individual notes handle their release.

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during stop():`, error);
            // Attempt to clear active notes anyway
            this.activeNotes.forEach((noteData, noteId) => this._cleanupNote(noteId));
            this.activeNotes.clear();
        }
    }

    /**
     * Adapt melody generation to the new mood's settings.
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
            this.settings = { ...this.defaultMelodySettings, ...newSettings };
            this.currentMood = newMood;

            const now = this.audioContext.currentTime;
            const rampTime = transitionTime * 0.5; // Use part of transition for ramps

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

            // 4. Sequencer Reset (Tempo, Pattern, Octave)
            // Clear existing sequence schedule
            if (this.sequenceTimeoutId) {
                clearTimeout(this.sequenceTimeoutId);
                this.sequenceTimeoutId = null;
            }
            // Select new pattern and reset index/octave
            this.currentPattern = this._selectMelodyPattern(this.settings);
            this.currentPatternIndex = 0;
            this.currentOctaveOffset = this._selectOctaveOffset(this.settings);
            this.lastNoteEndTime = this.audioContext.currentTime; // Reset timing

            // If playing, schedule the *first* note of the new sequence immediately
            if (this.isPlaying) {
                this._scheduleNextNote();
            }

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error during changeMood():`, error);
            if(typeof ToastSystem !== 'undefined') ToastSystem.notify('error', 'Error changing sine melody mood.');
        }
    }

    /**
     * Clean up all audio resources and timers.
     */
    dispose() {
        console.log(`${this.MODULE_ID}: Disposing...`);
        if (!this.isEnabled && !this.moduleOutputGain) {
             return; // Already clean/uninitialized
        }
        this.isEnabled = false;
        this.isPlaying = false;

        try {
            // Clear sequence timeout
            if (this.sequenceTimeoutId) {
                clearTimeout(this.sequenceTimeoutId);
                this.sequenceTimeoutId = null;
            }

            // Stop and clean up any active notes immediately
            this.activeNotes.forEach((noteData, noteId) => {
                if (noteData.osc) try { if(noteData.osc.stop) noteData.osc.stop(0); noteData.osc.disconnect(); } catch(e){}
                if (noteData.gain) try { noteData.gain.disconnect(); } catch(e){}
                if (noteData.cleanupTimeout) clearTimeout(noteData.cleanupTimeout);
            });
            this.activeNotes.clear();

            // Stop and disconnect LFO
            if (this.vibratoLFO) try { if(this.vibratoLFO.stop) this.vibratoLFO.stop(0); this.vibratoLFO.disconnect(); } catch(e){}
            if (this.vibratoGain) try { this.vibratoGain.disconnect(); } catch(e){}

            // Disconnect Delay nodes
            if (this.moduleOutputGain) try { this.moduleOutputGain.disconnect(); } catch(e){} // Disconnects from master AND delay input
            if (this.delayNode) try { this.delayNode.disconnect(); } catch(e){} // Disconnects from feedback and wet gain
            if (this.feedbackGain) try { this.feedbackGain.disconnect(); } catch(e){}
            if (this.delayWetGain) try { this.delayWetGain.disconnect(); } catch(e){}

        } catch (error) {
             console.error(`${this.MODULE_ID}: Error during node disconnection:`, error);
        } finally {
            // Clear state
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
            console.log(`${this.MODULE_ID}: Disposal complete.`);
        }
    }

    // --- Internal Sequencing and Note Generation ---

    /**
     * Schedules the next note in the sequence using setTimeout.
     * @private
     */
    _scheduleNextNote() {
        if (!this.isPlaying || !this.audioContext || this.currentPattern.length === 0) {
            this.isPlaying = false; // Stop if pattern is empty or not playing
            return;
        }

        const patternItem = this.currentPattern[this.currentPatternIndex];
        const tempo = this.settings.tempo || this.defaultMelodySettings.tempo;
        const beatDuration = 60.0 / tempo; // Duration of one beat in seconds

        const noteDurationInSeconds = (patternItem.duration || 1.0) * beatDuration; // Default to 1 beat if duration missing
        const isRest = patternItem.isRest || false;

        // Calculate time until this note should START
        // Schedule based on when the *previous* note finished its envelope
        const timeToStart = Math.max(0, this.lastNoteEndTime - this.audioContext.currentTime);
        const delayMilliseconds = timeToStart * 1000;

        // Schedule the note creation/rest handling
        this.sequenceTimeoutId = setTimeout(() => {
            if (!this.isPlaying) return; // Check again in case stop was called

            const scheduledPlayTime = this.audioContext.currentTime; // Time when this note actually starts

            if (!isRest) {
                this._createNote(patternItem, noteDurationInSeconds, scheduledPlayTime);
            } else {
                 console.debug(`${this.MODULE_ID}: Rest for ${noteDurationInSeconds.toFixed(2)}s`);
            }

            // Update the end time for the *next* note's scheduling reference
            // This is the time when the *current* note/rest interval finishes
            this.lastNoteEndTime = scheduledPlayTime + noteDurationInSeconds;

            // Move to the next step in the pattern
            this.currentPatternIndex++;
            if (this.currentPatternIndex >= this.currentPattern.length) {
                this.currentPatternIndex = 0; // Loop pattern
                // Optionally change octave or pattern here for variation
                this.currentOctaveOffset = this._selectOctaveOffset(this.settings);
                this.currentPattern = this._selectMelodyPattern(this.settings); // Re-select pattern
                console.debug(`${this.MODULE_ID}: Looped pattern. New octave offset: ${this.currentOctaveOffset}`);
            }

            // Schedule the *following* note
            this._scheduleNextNote();

        }, delayMilliseconds);
    }

    /**
     * Creates and plays a single sine wave note with envelope and effects.
     * @param {object} noteInfo - Object containing note details { scaleIndex, velocity, octave }
     * @param {number} durationSeconds - The total duration the note should sound (including release).
     * @param {number} playTime - The AudioContext time when the note should start playing.
     * @private
     */
    _createNote(noteInfo, durationSeconds, playTime) {
        if (!this.audioContext || !this.moduleOutputGain) return;

        try {
            const frequency = this._calculateFrequency(noteInfo.scaleIndex, noteInfo.octave);
            if (frequency <= 0) return; // Invalid frequency

            const noteId = `${playTime}-${frequency.toFixed(2)}`; // Unique ID for tracking

            // --- Create Nodes ---
            const osc = this.audioContext.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(frequency, playTime);

            const gain = this.audioContext.createGain();
            gain.gain.setValueAtTime(0.0001, playTime); // Start silent

            // Connect nodes: Osc -> Gain -> Module Output Gain
            osc.connect(gain);
            gain.connect(this.moduleOutputGain);

            // Connect Vibrato LFO Gain to Oscillator's detune parameter
            if (this.vibratoGain && osc.detune) {
                this.vibratoGain.connect(osc.detune);
            }

            // --- Apply Envelope ---
            const velocity = noteInfo.velocity || this.settings.noteVelocity;
            const attack = this.settings.attackTime;
            const decay = this.settings.decayTime;
            // Sustain and Release are implicitly handled by scheduling stop
            const targetVolume = velocity;

            // Attack phase
            gain.gain.linearRampToValueAtTime(targetVolume, playTime + attack);
            // Decay phase (if sustain is less than 1) - simplified to just hold then release
            // gain.gain.setTargetAtTime(targetVolume * sustainLevel, playTime + attack, decay / 3.0); // Decay if sustain < 1
            // For sine pluck, just schedule the stop based on duration

             // Schedule stop
             const stopTime = playTime + durationSeconds;
             if (osc.stop) {
                 osc.stop(stopTime);
             } else {
                 console.warn(`${this.MODULE_ID}: Oscillator node missing stop method?`);
             }

            // --- Schedule Cleanup ---
            const cleanupDelay = (durationSeconds + 0.5) * 1000; // Cleanup slightly after stop
            const cleanupTimeoutId = setTimeout(() => {
                this._cleanupNote(noteId);
            }, cleanupDelay);

            // --- Store Active Note ---
            this.activeNotes.set(noteId, { osc, gain, cleanupTimeout: cleanupTimeoutId });

            // Start the oscillator
            osc.start(playTime);

        } catch (error) {
            console.error(`${this.MODULE_ID}: Error creating note:`, error);
        }
    }

    /**
     * Cleans up resources associated with a finished note.
     * @param {string} noteId - The unique ID of the note to clean up.
     * @private
     */
    _cleanupNote(noteId) {
        if (this.activeNotes.has(noteId)) {
            const { osc, gain, cleanupTimeout } = this.activeNotes.get(noteId);
            // console.debug(`${this.MODULE_ID}: Cleaning up note ${noteId}`);
            try {
                if (this.vibratoGain && osc.detune) {
                    // Check if vibratoGain is still connected before disconnecting
                    // This check is complex without tracking connections explicitly.
                    // A simple try/catch is often sufficient here.
                    try { this.vibratoGain.disconnect(osc.detune); } catch(e) { /* ignore */ }
                }
                if (osc) osc.disconnect();
                if (gain) gain.disconnect();
            } catch (e) {
                console.error(`${this.MODULE_ID}: Error disconnecting note nodes for ${noteId}:`, e);
            }
            if (cleanupTimeout) clearTimeout(cleanupTimeout); // Clear potentially lingering timeout
            this.activeNotes.delete(noteId);
        }
    }

    /**
     * Selects a melodic pattern based on settings (can be randomized).
     * @param {object} settings
     * @returns {Array} The selected pattern array.
     * @private
     */
    _selectMelodyPattern(settings) {
        const patterns = settings.melodyPatterns || this.defaultMelodySettings.melodyPatterns;
        if (!Array.isArray(patterns) || patterns.length === 0) {
            console.warn(`${this.MODULE_ID}: No valid melody patterns found, using empty.`);
            return [];
        }
        // Select a random pattern from the available ones
        const patternIndex = Math.floor(Math.random() * patterns.length);
        return patterns[patternIndex] || []; // Return selected or empty array
    }

    /**
    * Selects an octave offset based on settings (can be randomized).
    * @param {object} settings
    * @returns {number} The selected octave offset.
    * @private
    */
     _selectOctaveOffset(settings) {
        const range = settings.melodyOctaveRange || this.defaultMelodySettings.melodyOctaveRange;
        if (!Array.isArray(range) || range.length === 0) {
            return 0; // Default to 0 if range is invalid
        }
        // Select a random offset from the provided array (allows weighting)
        const index = Math.floor(Math.random() * range.length);
        return range[index] || 0;
     }


    /**
     * Calculates the frequency for a note based on scale index and octave offset.
     * @param {number} scaleIndex - The index within the scale (0-based).
     * @param {number} [noteOctaveOffset=0] - Additional octave shift for this specific note from pattern.
     * @returns {number} The calculated frequency in Hz, or 0 if invalid.
     * @private
     */
    _calculateFrequency(scaleIndex, noteOctaveOffset = 0) {
        try {
            const baseFreq = this.settings.baseFreq || this.defaultMelodySettings.baseFreq;
            const scaleName = this.settings.scale || this.defaultMelodySettings.scale;
            const scaleMap = typeof musicalScales !== 'undefined' ? musicalScales : { pentatonic: [0, 2, 4, 7, 9, 12] }; // Simple fallback
            const scale = scaleMap[scaleName] || scaleMap.pentatonic;

            if (scaleIndex < 0 || scaleIndex >= scale.length * 3) { // Allow index to wrap a few octaves within scale
                 console.warn(`${this.MODULE_ID}: Scale index ${scaleIndex} out of reasonable range for scale ${scaleName}.`);
                 // Optionally clamp or return 0
                 scaleIndex = Math.max(0, scaleIndex) % scale.length; // Simple wrap to base octave
            }


            const scaleDegree = scaleIndex % scale.length;
            const intervalOctaveOffset = Math.floor(scaleIndex / scale.length); // Octave shift based on index wrapping
            const totalOctaveOffset = this.currentOctaveOffset + intervalOctaveOffset + noteOctaveOffset; // Combine global, interval, and note offsets

            const semitones = scale[scaleDegree];
            const finalSemitoneOffset = semitones + totalOctaveOffset * 12;

            return baseFreq * Math.pow(2, finalSemitoneOffset / 12);
        } catch (error) {
             console.error(`${this.MODULE_ID}: Error calculating frequency:`, error);
             return 0; // Return 0 on error
        }
    }

} // End class AEMelodySine

// Make globally accessible for the AudioEngine
window.AEMelodySine = AEMelodySine;