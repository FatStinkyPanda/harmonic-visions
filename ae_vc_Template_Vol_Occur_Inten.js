class AEModuleName { // or VCModuleName
    constructor() {
        // ... existing properties ...
        this.moodConfig = { volume: 100, occurrence: 100, intensity: 50 }; // Default config
        this.baseSettings = {}; // Store base settings from data.js
    }

    // Add this mapping helper within the class or use a global one
    _mapValue(value0to100, minTarget, maxTarget) {
        const clampedValue = Math.max(0, Math.min(100, value0to100 ?? 100)); // Default to 100 if undefined
        return minTarget + (maxTarget - minTarget) * (clampedValue / 100.0);
    }

    // New method to apply the 0-100 config
    _applyMoodConfig(transitionTime = 0) {
        if (!this.moodConfig || !this.audioContext) return; // Check if config and context exist

        const now = this.audioContext.currentTime;
        const rampTime = transitionTime > 0 ? transitionTime * 0.5 : 0; // Shorter ramp for config changes
        const timeConstant = rampTime / 3.0;

        // --- Apply Volume (Audio Modules Only) ---
        if (this.moduleOutputGain && this.moodConfig.volume !== undefined) {
            const baseVolume = this.baseSettings.moduleSpecificVolumeKey || 1.0; // Get base vol from stored settings
            const targetVolume = this._mapValue(this.moodConfig.volume, 0.0, baseVolume);
            console.log(`${this.MODULE_ID}: Applying Volume ${this.moodConfig.volume}/100 -> ${targetVolume.toFixed(3)}`);
            if (rampTime > 0.01) {
                 this.moduleOutputGain.gain.setTargetAtTime(targetVolume, now, timeConstant);
            } else {
                 this.moduleOutputGain.gain.setValueAtTime(targetVolume, now);
            }
        }

        // --- Apply Occurrence ---
        if (this.moodConfig.occurrence !== undefined) {
            // Example 1: Density Factor (e.g., Insects, Drips)
            // const baseDensity = this.baseSettings.densityFactorBase || 1.0;
            // this.settings.densityFactor = this._mapValue(this.moodConfig.occurrence, 0.0, baseDensity * 2.0); // Map 0-100 to 0-2x base density
            // console.log(`${this.MODULE_ID}: Applying Occurrence ${this.moodConfig.occurrence}/100 -> densityFactor ${this.settings.densityFactor.toFixed(2)}`);

            // Example 2: Instance Count (e.g., Particles, Plants)
            // if (this.isEnabled && this.instances) { // Check if module is active and has instances
            //     const baseCount = this.BASE_INSTANCE_COUNT;
            //     const maxCount = this.MAX_INSTANCE_COUNT;
            //     const targetCount = Math.floor(this._mapValue(this.moodConfig.occurrence, 0, maxCount));
            //     console.log(`${this.MODULE_ID}: Applying Occurrence ${this.moodConfig.occurrence}/100 -> targetCount ${targetCount}`);
            //     // Logic to adjust instance count (might require recreating InstancedMesh or managing visibility)
            //     // This is complex, often easier to handle in init/changeMood directly rather than _applyMoodConfig
            // }

             // Example 3: Sequencer Probability/Rate (e.g., Melodies, Percussion)
             // const baseProbability = this.baseSettings.noteProbability || 1.0;
             // this.currentPlayProbability = this._mapValue(this.moodConfig.occurrence, 0.0, baseProbability);
             // console.log(`${this.MODULE_ID}: Applying Occurrence ${this.moodConfig.occurrence}/100 -> playProbability ${this.currentPlayProbability.toFixed(2)}`);
             // // Use this.currentPlayProbability in the sequencer logic (_playNextNoteInSequence)
        }

        // --- Apply Intensity ---
        if (this.moodConfig.intensity !== undefined) {
            console.log(`${this.MODULE_ID}: Applying Intensity ${this.moodConfig.intensity}/100`);
            // Example 1: LFO Depth (e.g., Pads, Vibrato)
            // if (this.lfoNodes.someLfoGain) {
            //     const baseDepth = this.baseSettings.someLfoDepthBase || 100;
            //     const maxDepth = this.baseSettings.someLfoDepthMax || 500;
            //     const targetDepth = this._mapValue(this.moodConfig.intensity, baseDepth, maxDepth);
            //     if (rampTime > 0.01) this.lfoNodes.someLfoGain.gain.setTargetAtTime(targetDepth, now, timeConstant);
            //     else this.lfoNodes.someLfoGain.gain.setValueAtTime(targetDepth, now);
            // }

            // Example 2: Filter Q (Resonance)
            // if (this.filterNode) {
            //     const baseQ = this.baseSettings.filterQBase || 1.0;
            //     const maxQ = this.baseSettings.filterQMax || 5.0;
            //     const targetQ = this._mapValue(this.moodConfig.intensity, baseQ, maxQ);
            //     if (rampTime > 0.01) this.filterNode.Q.setTargetAtTime(targetQ, now, timeConstant);
            //     else this.filterNode.Q.setValueAtTime(targetQ, now);
            // }

            // Example 3: Effect Wet Mix (e.g., Delay)
            // if (this.delayWetGain) {
            //     const baseWet = this.baseSettings.delayWetMixBase || 0.1;
            //     const maxWet = this.baseSettings.delayWetMixMax || 0.8;
            //     const targetWet = this._mapValue(this.moodConfig.intensity, baseWet, maxWet);
            //     if (rampTime > 0.01) this.delayWetGain.gain.setTargetAtTime(targetWet, now, timeConstant);
            //     else this.delayWetGain.gain.setValueAtTime(targetWet, now);
            // }

            // Example 4: Visual Parameter Range/Strength (e.g., Bloom, Particle Size Var)
            // this.settings.bloomIntensity = this._mapValue(this.moodConfig.intensity, 0.1, 1.5);
            // this.PARTICLE_SIZE_VARIATION = this._mapValue(this.moodConfig.intensity, 0.5, 5.0);
            // Update relevant uniforms if needed
        }
    }

    // Modify init
    init(audioContext, masterOutputNode, initialSettings, initialMood, moodConfig) { // Added moodConfig
        if (this.isEnabled) { /* ... */ return; }
        console.log(`${this.MODULE_ID}: Initializing for mood '${initialMood}'... Config:`, moodConfig);

        try {
            this.audioContext = audioContext;
            this.masterOutput = masterOutputNode;
            // Store the base settings from data.js
            this.baseSettings = { ...this.defaultModuleSettings, ...initialSettings };
            // Store the specific 0-100 configuration for this mood
            this.moodConfig = { ...this.moodConfig, ...moodConfig }; // Merge incoming config
            this.currentMood = initialMood;

            // --- Create Core Nodes ---
            // (Create nodes like outputGain, filterNode, etc.)
            // Example: Create the main output gain *before* applying config
            this.moduleOutputGain = this.audioContext.createGain();
            this.moduleOutputGain.gain.setValueAtTime(0.0001, this.audioContext.currentTime); // Start silent

            // --- Apply Initial Mood Config ---
            this._applyMoodConfig(0); // Apply immediately (no transition)

            // --- Create Sound Sources / Visual Elements ---
            // (Create oscillators, instances, etc., using values potentially modified by _applyMoodConfig)

            // --- Connect Audio Graph / Add to Scene ---
            // ... connect this.moduleOutputGain to masterOutput (or filter) ...

            this.isEnabled = true;
            console.log(`${this.MODULE_ID}: Initialization complete.`);

        } catch (error) {
            // ... error handling ...
            this.dispose();
            this.isEnabled = false;
        }
    }

    // Modify changeMood
    changeMood(newMood, newSettings, transitionTime, moodConfig) { // Added moodConfig
        if (!this.isEnabled || !this.audioContext) return;
        console.log(`${this.MODULE_ID}: Changing mood to '${newMood}'... Config:`, moodConfig);

        try {
            // Store new base settings and 0-100 config
            this.baseSettings = { ...this.defaultModuleSettings, ...newSettings };
            this.moodConfig = { ...this.moodConfig, ...moodConfig }; // Merge new config
            this.currentMood = newMood;

            // --- Apply New Mood Config with Transition ---
            this._applyMoodConfig(transitionTime);

            // --- Handle Structural Changes if Necessary ---
            // (e.g., if number of oscillators/instances needs to change based on new config)
            // This might involve disposing parts and recreating them based on this.moodConfig.occurrence
            // Example: Check if instance count needs update for particle system
            // if (this.instances && this.moodConfig.occurrence !== undefined) {
            //    const targetCount = Math.floor(this._mapValue(this.moodConfig.occurrence, 0, this.MAX_INSTANCE_COUNT));
            //    if (this.instances.count !== targetCount) {
            //        console.log(`${this.MODULE_ID}: Recreating instances for new occurrence count: ${targetCount}`);
            //        // Dispose existing instances and recreate with targetCount
            //        // This is complex and specific to the module
            //    }
            // }

            console.log(`${this.MODULE_ID}: Mood parameters updated for '${newMood}'.`);

        } catch (error) {
            // ... error handling ...
        }
    }

    // ... rest of the module class ...
}

//Examples
// ae_pads.js - Example Modifications

class AEPads {
    constructor() {
        // ... existing properties ...
        this.moodConfig = { volume: 100, occurrence: 100, intensity: 50 }; // Default config
        this.baseSettings = {}; // Store base settings from data.js
        this.defaultPadSettings = { // Keep defaults for fallback
            padVolume: 0.3, padWaveform: 'triangle', detuneAmount: 5, subOscGain: 0.4,
            filterType: 'lowpass', filterFreq: 800, filterQ: 1.5, filterLFORate: 0.1,
            filterLFODepth: 300, pitchLFORate: 0.15, pitchLFODepth: 2.5, attackTime: 2.0,
            releaseTime: 3.0, scale: 'major', baseFreq: 220, chordNotes: [0, 4, 7],
            // Add base/max values used by intensity mapping
            filterQBase: 0.8, filterQMax: 4.0,
            filterLFODepthBase: 50, filterLFODepthMax: 800,
            pitchLFODepthBase: 0.5, pitchLFODepthMax: 8.0,
        };
    }

    _mapValue(value0to100, minTarget, maxTarget) {
        const clampedValue = Math.max(0, Math.min(100, value0to100 ?? 100));
        return minTarget + (maxTarget - minTarget) * (clampedValue / 100.0);
    }

    _applyMoodConfig(transitionTime = 0) {
        if (!this.moodConfig || !this.audioContext || !this.isEnabled) return; // Check enabled state too

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
                 this.outputGain.gain.setTargetAtTime(targetVolume, now, timeConstant);
            } else {
                 // Set initial value for next play(), respecting the config
                 this.outputGain.gain.setValueAtTime(targetVolume, now);
            }
        }

        // --- Apply Occurrence ---
        // For pads, occurrence=100 usually means 'on', <100 might disable it entirely
        // (Handled by the coordinator not initializing/disposing the module if occurrence is 0)
        // No specific parameter change needed here usually for continuous pads.

        // --- Apply Intensity ---
        if (this.moodConfig.intensity !== undefined) {
            console.log(`${this.MODULE_ID}: Applying Intensity ${this.moodConfig.intensity}/100`);

            // Filter Q (Resonance)
            if (this.filterNode) {
                const baseQ = this.baseSettings.filterQBase ?? this.defaultPadSettings.filterQBase;
                const maxQ = this.baseSettings.filterQMax ?? this.defaultPadSettings.filterQMax;
                const targetQ = this._mapValue(this.moodConfig.intensity, baseQ, maxQ);
                console.log(`  -> Filter Q: ${targetQ.toFixed(2)}`);
                if (rampTime > 0.01) this.filterNode.Q.setTargetAtTime(targetQ, now, timeConstant);
                else this.filterNode.Q.setValueAtTime(targetQ, now);
            }

            // Filter LFO Depth
            if (this.lfoNodes.filterLFOGain) {
                const baseDepth = this.baseSettings.filterLFODepthBase ?? this.defaultPadSettings.filterLFODepthBase;
                const maxDepth = this.baseSettings.filterLFODepthMax ?? this.defaultPadSettings.filterLFODepthMax;
                const targetDepth = this._mapValue(this.moodConfig.intensity, baseDepth, maxDepth);
                 console.log(`  -> Filter LFO Depth: ${targetDepth.toFixed(2)}`);
                if (rampTime > 0.01) this.lfoNodes.filterLFOGain.gain.setTargetAtTime(targetDepth, now, timeConstant);
                else this.lfoNodes.filterLFOGain.gain.setValueAtTime(targetDepth, now);
            }

            // Pitch LFO Depth (Vibrato/Chorus)
            if (this.lfoNodes.pitchLFOGain) {
                const baseDepth = this.baseSettings.pitchLFODepthBase ?? this.defaultPadSettings.pitchLFODepthBase;
                const maxDepth = this.baseSettings.pitchLFODepthMax ?? this.defaultPadSettings.pitchLFODepthMax;
                const targetDepth = this._mapValue(this.moodConfig.intensity, baseDepth, maxDepth);
                console.log(`  -> Pitch LFO Depth: ${targetDepth.toFixed(2)}`);
                if (rampTime > 0.01) this.lfoNodes.pitchLFOGain.gain.setTargetAtTime(targetDepth, now, timeConstant);
                else this.lfoNodes.pitchLFOGain.gain.setValueAtTime(targetDepth, now);
            }

            // Detune Amount (Subtle adjustment based on intensity)
            // const baseDetune = this.baseSettings.detuneAmount ?? this.defaultPadSettings.detuneAmount;
            // const maxDetune = baseDetune * 1.5; // Max detune increases slightly with intensity
            // const targetDetune = this._mapValue(this.moodConfig.intensity, baseDetune * 0.5, maxDetune);
            // this.settings.detuneAmount = targetDetune; // Store for use in _createSoundStructure if needed
            // Need to update detune on existing oscillators if structure doesn't change
            // ... (logic to find detuned oscs and ramp their .detune.value) ...
        }
    }

    // Modify init
    init(audioContext, masterOutputNode, initialSettings, initialMood, moodConfig) { // Added moodConfig
        if (this.isEnabled) { /* ... */ return; }
        console.log(`${this.MODULE_ID}: Initializing for mood '${initialMood}'... Config:`, moodConfig);

        try {
            this.audioContext = audioContext;
            this.masterOutput = masterOutputNode;
            // Store base settings from data.js AND defaultPadSettings for fallback
            this.baseSettings = { ...this.defaultPadSettings, ...initialSettings };
            // Store the specific 0-100 configuration for this mood
            this.moodConfig = { ...this.moodConfig, ...moodConfig };
            this.currentMood = initialMood;

            // Create Master Output Gain FIRST
            this.outputGain = this.audioContext.createGain();
            this.outputGain.gain.setValueAtTime(0.0001, this.audioContext.currentTime);

            // Create Master Filter
            this.filterNode = this.audioContext.createBiquadFilter();
            this.filterNode.type = this.baseSettings.filterType || 'lowpass';
            this.filterNode.frequency.setValueAtTime(this.baseSettings.filterFreq, this.audioContext.currentTime);
            this.filterNode.Q.setValueAtTime(this.baseSettings.filterQ, this.audioContext.currentTime);

             // Apply Initial Mood Config (sets volume gain, initial LFO depths, Q based on 0-100)
             this._applyMoodConfig(0); // Apply immediately

            // Create Oscillators, Note Gains, and LFOs using baseSettings AND potentially modified values
            this._createPadSound(this.baseSettings); // Passes base settings

            // Connect Audio Graph
            this.notesData.forEach(note => { if (note.noteGain) note.noteGain.connect(this.filterNode); });
            this.filterNode.connect(this.outputGain);
            this.outputGain.connect(this.masterOutput);

            // Connect LFOs (using depths set by _applyMoodConfig)
            this._connectLFOs();

            this.isEnabled = true;
            console.log(`${this.MODULE_ID}: Initialization complete.`);

        } catch (error) { /* ... error handling ... */ }
    }

    // Modify changeMood
    changeMood(newMood, newSettings, transitionTime, moodConfig) { // Added moodConfig
        if (!this.isEnabled || !this.audioContext) return;
        console.log(`${this.MODULE_ID}: Changing mood to '${newMood}'... Config:`, moodConfig);

        try {
            const oldBaseSettings = this.baseSettings;
            this.baseSettings = { ...this.defaultPadSettings, ...newSettings };
            this.moodConfig = { ...this.moodConfig, ...moodConfig };
            this.currentMood = newMood;

            const now = this.audioContext.currentTime;

            // --- Apply New Mood Config with Transition ---
            // This will ramp volume, LFO depths, Filter Q etc. based on new 0-100 values
            this._applyMoodConfig(transitionTime);

            // --- Update Base Filter Frequency/Type ---
            // These aren't typically part of 'intensity', so handle separately
            if (this.filterNode) {
                const newFilterType = this.baseSettings.filterType || 'lowpass';
                if (this.filterNode.type !== newFilterType) {
                    this.filterNode.type = newFilterType; // Immediate change
                }
                this.filterNode.frequency.setTargetAtTime(this.baseSettings.filterFreq, now, transitionTime * 0.6);
            }

            // --- Update Base LFO Rates ---
            if (this.lfoNodes.filterLFO) this.lfoNodes.filterLFO.frequency.setTargetAtTime(this.baseSettings.filterLFORate, now, transitionTime * 0.6);
            if (this.lfoNodes.pitchLFO) this.lfoNodes.pitchLFO.frequency.setTargetAtTime(this.baseSettings.pitchLFORate, now, transitionTime * 0.6);

            // --- Handle Chord/Structure Changes ---
            const newChordFreqs = this._getChordFrequencies(this.baseSettings);
            const newWaveform = this.baseSettings.padWaveform || 'triangle';
            const newDetune = this.baseSettings.detuneAmount || 5; // Base detune from new settings

            if (newChordFreqs.length !== this.notesData.length || oldBaseSettings.padWaveform !== newWaveform) {
                 console.warn(`${this.MODULE_ID}: Chord structure or waveform changed. Recreating sound structure.`);
                 // Stop existing oscillators quickly
                 const quickStopTime = now + 0.1;
                 this.notesData.forEach(note => { if(note?.oscillators) note.oscillators.forEach(osc => { if (osc?.stop) try { osc.stop(quickStopTime); } catch(e){} }); });
                 // Recreate sound structure using NEW base settings
                 this._createPadSound(this.baseSettings);
                 // Reconnect graph
                 this.notesData.forEach(note => { if (note?.noteGain) note.noteGain.connect(this.filterNode); });
                 this._connectLFOs(); // Reconnect LFOs (depths already ramped by _applyMoodConfig)
                 // Restart if playing
                 if (this.isPlaying) {
                      const restartTime = quickStopTime + 0.05;
                      this.notesData.forEach(note => { if(note?.oscillators) note.oscillators.forEach(osc => { if (osc?.start) try { osc.start(restartTime); } catch(e){} }); });
                      Object.values(this.lfoNodes).forEach(node => { if (node?.start && node.frequency) try { node.start(restartTime); } catch(e){} });
                 }
            } else {
                 // Chord structure same, just ramp frequencies/detune of existing oscillators
                 console.log(`${this.MODULE_ID}: Ramping existing oscillator frequencies/detune.`);
                 this.notesData.forEach((noteData, index) => {
                     if (!noteData?.oscillators) return;
                     const newFreq = newChordFreqs[index];
                     noteData.freq = newFreq;
                     noteData.oscillators.forEach(osc => {
                         if (osc) {
                             let targetOscFreq = newFreq;
                             let targetDetuneValue = 0;
                             if (osc.isSubOsc) targetOscFreq *= 0.5;
                             else if (osc.isDetunedPos) { targetDetuneValue = newDetune; } // LFO modulates around this
                             else if (osc.isDetunedNeg) { targetDetuneValue = -newDetune; } // LFO modulates around this

                             osc.frequency.setTargetAtTime(targetOscFreq, now, transitionTime * 0.7);
                             if (osc.detune && !osc.isSubOsc) {
                                 osc.detune.setTargetAtTime(targetDetuneValue, now, transitionTime * 0.6);
                             }
                         }
                     });
                 });
            }

            console.log(`${this.MODULE_ID}: Mood parameters updated for '${newMood}'.`);

        } catch (error) { /* ... error handling ... */ }
    }

    // ... (rest of AEPads, including _createPadSound, _connectLFOs, _getChordFrequencies, _detuneFreq, dispose) ...
}

// Additionally: Review data.js
// Keep padVolume, filterQ, filterLFODepth, pitchLFODepth, etc., in moodAudioSettings. These now define the target value when the corresponding 0-100 config is set to 100.
// Add *Base and *Max values to moodAudioSettings if you want the intensity mapping range to vary per mood (e.g., filterQBase, filterQMax). Otherwise, use the defaults defined within the module.
// Additionally: Testing
// Start the application.
// Change moods and observe the console logs from the modules. Verify that the Applying Volume/Occurrence/Intensity messages show the correct 0-100 values from Emotion*List.js and the resulting mapped parameter values.
// Listen carefully to the changes in volume, density (e.g., fewer drips/chirps, sparser melodies), and effect strength (e.g., filter sweeps, vibrato, delay) between moods.
// Adjust the 0-100 values in EmotionAudioList.js and EmotionVisualList.js and refresh to fine-tune the balance for each mood.