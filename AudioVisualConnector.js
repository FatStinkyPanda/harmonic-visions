// AudioVisualConnector.js - Processes audio data and maps it to visual parameters
// Part of the Harmonic Visions project by FatStinkyPanda
// Copyright (c) 2025 FatStinkyPanda - All rights reserved.
// Version: 2.1.0 (Refined for Modular Engine compatibility)

const AudioVisualConnector = (() => {
    let instance = null;

    class Connector {
        constructor() {
            // --- Singleton Enforcement ---
            if (instance) {
                console.warn("AudioVisualConnector: Attempted to create second instance. Returning existing one.");
                return instance;
            }

            // --- State ---
            this.audioEngine = null; // Reference to the AudioEngine instance
            this.currentMood = 'calm'; // Default mood
            this.visualParams = this._resetVisualParams(); // Holds parameters for VisualCanvas
            this.audioReactivity = this._resetAudioReactivity(); // Holds processed audio features
            this.lastUpdateTime = performance.now();
            this.isProcessing = false; // Flag to prevent overlapping updates

            // --- Configuration ---
            this.UPDATE_RATE_HZ = 60; // Target update rate
            this.FREQUENCY_BANDS = 24; // Number of detailed frequency bands to analyze
            this.BEAT_HISTORY_SIZE = 43; // Approx 1 sec history at 60Hz for beat detection
            this.PEAK_COOLDOWN_FRAMES = 15; // Frames (~250ms at 60Hz) cooldown for peak impact
            this.SMOOTHING_FACTOR_DECREASE = 0.1; // How fast values decrease
            this.SMOOTHING_FACTOR_INCREASE = 0.3; // How fast values increase (more responsive to rises)

            // --- Initialization ---
            // Start internal update loop using setInterval for consistent timing
            this.updateInterval = setInterval(() => this.update(), 1000 / this.UPDATE_RATE_HZ);

            instance = this;
            console.log("AudioVisualConnector initialized (Singleton)");
        }

        /**
         * Resets the visual parameters object to default values.
         * @private
         */
        _resetVisualParams() {
            return {
                // General Parameters
                globalIntensity: 1.0, movementSpeed: 1.0, dreaminess: 0.5, fluidity: 0.5,
                // Camera Parameters
                cameraShake: 0.0, cameraAutoRotateSpeed: 0.1,
                // Particle Parameters
                particleSize: 1.0, particleSpeed: 1.0, particleOpacity: 0.8, particleColorIntensity: 1.0,
                // Landscape Parameters
                landscapeElevation: 1.0, landscapeMorphSpeed: 0.3, landscapePulseStrength: 0.0,
                // Water Parameters
                waterWaveHeight: 1.0, waterRippleStrength: 0.0,
                // Lighting Parameters
                mainLightIntensity: 1.0, ambientLightIntensity: 0.3, fxGlow: 0.7,
                // Event Triggers
                isBeat: false, peakImpact: 0.0,
                // Raw-ish data for complex effects
                rawBass: 0.0, rawMid: 0.0, rawTreble: 0.0, rawOverall: 0.0,
                rawFreqBands: new Array(this.FREQUENCY_BANDS).fill(0),
            };
        }

        /**
         * Resets the internal audio reactivity state object.
         * @private
         */
        _resetAudioReactivity() {
            return {
                bassPower: 0, midPower: 0, treblePower: 0, overallPower: 0,
                bassImpact: 0, // Smoothed impact value (0-1)
                peakDetector: { thresholdMultiplier: 1.2, lastPeakFrame: 0, currentFrame: 0 },
                frequencyBands: new Array(this.FREQUENCY_BANDS).fill(0), // Detailed analysis
                beatDetector: {
                    energyHistory: new Array(this.BEAT_HISTORY_SIZE).fill(0),
                    beatCutoff: 0, // Dynamic threshold
                    lastBeatTime: 0, // Timestamp of last detected beat
                    isBeat: false // One-frame beat trigger
                }
            };
        }

        /**
         * Stores a reference to the main AudioEngine instance.
         * @param {AudioEngine} engine - The initialized AudioEngine instance.
         */
        setAudioEngine(engine) {
            if (!engine || typeof engine.getAudioData !== 'function') {
                console.error("AudioVisualConnector: Invalid AudioEngine provided. Must have getAudioData method.");
                this.audioEngine = null; // Ensure it's null if invalid
                return;
            }
            this.audioEngine = engine;
            console.log("AudioVisualConnector linked with AudioEngine.");
        }

        /**
         * Updates the current mood, used for mapping audio features to visuals.
         * @param {string} mood - The new mood key (e.g., 'calm').
         */
        setMood(mood) {
            if (mood !== this.currentMood) {
                console.log(`AudioVisualConnector: Mood changed to '${mood}'`);
                this.currentMood = mood;
                // Resetting reactivity helps prevent stale values during mood transition
                // this.audioReactivity = this._resetAudioReactivity();
                // No need to reset visualParams here, mapAudioToVisuals will update them based on new mood settings
            }
        }

        /**
         * Processes the raw audio frequency data into meaningful reactivity features.
         * @param {Uint8Array} data - The raw byte frequency data from the AnalyserNode.
         * @private
         */
        _processAudioData(data) {
            if (!data || data.length === 0) {
                // console.warn("AudioVisualConnector: No audio data received for processing.");
                // Optionally decay reactivity values if no data comes in for a while
                this._decayReactivity(0.01); // Slow decay factor
                return;
            }

            const audioReactivity = this.audioReactivity;
            const bandCount = data.length; // Number of frequency bins

            // --- Calculate Power in Broad Bands (Bass, Mid, Treble) ---
            // Define frequency ranges (adjust based on analyser FFT size and sample rate if needed)
            // These are approximate % of the bins.
            const bassEndIndex = Math.floor(bandCount * 0.08); // ~ Up to 250Hz (adjust as needed)
            const midEndIndex = Math.floor(bandCount * 0.40); // ~ Up to 2kHz
            const trebleEndIndex = Math.floor(bandCount * 0.90); // ~ Up to high frequencies

            let bassSum = 0, midSum = 0, trebleSum = 0;
            let bassCount = 0, midCount = 0, trebleCount = 0;

            for (let i = 0; i < bandCount; i++) {
                const value = data[i] / 255.0; // Normalize 0-1
                if (i < bassEndIndex) { bassSum += value; bassCount++; }
                else if (i < midEndIndex) { midSum += value; midCount++; }
                else if (i < trebleEndIndex) { trebleSum += value; trebleCount++; }
            }

            const bassNorm = bassCount > 0 ? bassSum / bassCount : 0;
            const midNorm = midCount > 0 ? midSum / midCount : 0;
            const trebleNorm = trebleCount > 0 ? trebleSum / trebleCount : 0;

            // --- Calculate Detailed Frequency Bands ---
            const detailBandCount = audioReactivity.frequencyBands.length;
            for (let i = 0; i < detailBandCount; i++) {
                // Use logarithmic scale for bin mapping (more musically relevant)
                const lowFreq = (i === 0) ? 0 : (this.audioEngine?.audioContext?.sampleRate / 2) * Math.pow(2, (i / detailBandCount - 1) * 10);
                const highFreq = (this.audioEngine?.audioContext?.sampleRate / 2) * Math.pow(2, ((i + 1) / detailBandCount - 1) * 10);
                const lowIndex = Math.max(0, Math.floor(lowFreq / (this.audioEngine?.audioContext?.sampleRate / 2) * bandCount));
                const highIndex = Math.min(bandCount, Math.floor(highFreq / (this.audioEngine?.audioContext?.sampleRate / 2) * bandCount));

                let sum = 0;
                let count = 0;
                for (let j = lowIndex; j < highIndex; j++) {
                    if (data[j] !== undefined) {
                        sum += data[j];
                        count++;
                    }
                }
                const bandValue = count > 0 ? (sum / count) / 255.0 : 0;
                // Apply adaptive smoothing to detailed bands
                audioReactivity.frequencyBands[i] = this._applyAdaptiveSmoothing(
                    audioReactivity.frequencyBands[i], bandValue,
                    this.SMOOTHING_FACTOR_DECREASE * 1.5, // Slightly slower decay for bands
                    this.SMOOTHING_FACTOR_INCREASE * 1.2 // Slightly faster increase
                );
            }

            // --- Apply Smoothing and Calculate Overall Power ---
            // Use adaptive smoothing for responsiveness
            audioReactivity.bassPower = this._applyAdaptiveSmoothing(audioReactivity.bassPower, bassNorm, this.SMOOTHING_FACTOR_DECREASE, this.SMOOTHING_FACTOR_INCREASE);
            audioReactivity.midPower = this._applyAdaptiveSmoothing(audioReactivity.midPower, midNorm, this.SMOOTHING_FACTOR_DECREASE, this.SMOOTHING_FACTOR_INCREASE);
            audioReactivity.treblePower = this._applyAdaptiveSmoothing(audioReactivity.treblePower, trebleNorm, this.SMOOTHING_FACTOR_DECREASE, this.SMOOTHING_FACTOR_INCREASE);

            // Weighted overall power (emphasize bass/mid slightly)
            audioReactivity.overallPower = (audioReactivity.bassPower * 1.1 + audioReactivity.midPower * 1.0 + audioReactivity.treblePower * 0.9) / 3.0;

            // --- Simple Beat Detection (Energy-Based) ---
            const beatDetector = audioReactivity.beatDetector;
            const currentBassEnergy = audioReactivity.bassPower; // Use smoothed bass power
            beatDetector.energyHistory.pop(); // Remove oldest
            beatDetector.energyHistory.unshift(currentBassEnergy); // Add current

            // Calculate average and variance over history
            const avgEnergy = beatDetector.energyHistory.reduce((sum, val) => sum + val, 0) / beatDetector.energyHistory.length;
            const variance = beatDetector.energyHistory.reduce((sum, val) => sum + Math.pow(val - avgEnergy, 2), 0) / beatDetector.energyHistory.length;
            // Dynamic threshold based on variance (C value from literature/experimentation)
            const C = -0.0025714 * variance + 1.5142857; // Adjust this calculation based on testing
            beatDetector.beatCutoff = Math.max(0.1, C * avgEnergy); // Ensure minimum threshold

            const now = performance.now();
            let beatDetected = false;
            if (currentBassEnergy > beatDetector.beatCutoff && (now - beatDetector.lastBeatTime) > 200) { // Min 200ms between beats (~300 BPM max)
                beatDetected = true;
                beatDetector.lastBeatTime = now;
            }
            beatDetector.isBeat = beatDetected; // Store one-frame trigger

            // --- Peak Impact Detection (Based on Bass Power Rise) ---
            const peakDetector = audioReactivity.peakDetector;
            peakDetector.currentFrame++;
            let currentPeakImpact = 0.0;
            // Detect peak if bass power exceeds a threshold relative to average AND cooldown passed
            const peakThreshold = avgEnergy * peakDetector.thresholdMultiplier; // Threshold relative to average bass energy
            if (audioReactivity.bassPower > peakThreshold && (peakDetector.currentFrame - peakDetector.lastPeakFrame) > this.PEAK_COOLDOWN_FRAMES) {
                peakDetector.lastPeakFrame = peakDetector.currentFrame;
                // Impact strength proportional to how much threshold was exceeded
                currentPeakImpact = Math.min(1.0, (audioReactivity.bassPower - peakThreshold) * 2.5); // Scale impact strength
            }
            // Smooth the bass impact value so it fades out gracefully
            audioReactivity.bassImpact = this._applyAdaptiveSmoothing(audioReactivity.bassImpact, currentPeakImpact, 0.05, 0.9); // Fast rise, slow decay
        }

        /**
         * Helper function for adaptive smoothing (different factors for increase/decrease).
         * @param {number} current - The current smoothed value.
         * @param {number} target - The new raw value.
         * @param {number} decreaseFactor - Smoothing factor when target < current (0-1).
         * @param {number} increaseFactor - Smoothing factor when target > current (0-1).
         * @returns {number} The new smoothed value.
         * @private
         */
        _applyAdaptiveSmoothing(current, target, decreaseFactor, increaseFactor) {
            if (isNaN(current) || isNaN(target)) return 0; // Safety check
            const factor = (target >= current) ? increaseFactor : decreaseFactor;
            return current * (1 - factor) + target * factor;
        }

         /**
         * Slowly decays reactivity values when no audio data is present.
         * @param {number} decayFactor - The factor by which to decay (e.g., 0.01).
         * @private
         */
        _decayReactivity(decayFactor) {
            const r = this.audioReactivity;
            r.bassPower *= (1 - decayFactor);
            r.midPower *= (1 - decayFactor);
            r.treblePower *= (1 - decayFactor);
            r.overallPower *= (1 - decayFactor);
            r.bassImpact *= (1 - decayFactor * 2); // Decay impact faster
            r.frequencyBands = r.frequencyBands.map(v => v * (1-decayFactor));
            // Don't decay beat detector history, let it naturally phase out
            r.beatDetector.isBeat = false; // Ensure beat trigger is off
        }


        /**
         * Maps the processed audio reactivity features to the visual parameters object.
         * Uses the current mood settings from data.js to influence the mapping.
         * @private
         */
        _mapAudioToVisuals() {
            const audio = this.audioReactivity;
            const params = this.visualParams; // Direct reference for modification

            // Safely get mood settings, fallback to 'calm' if currentMood is invalid or settings missing
            const moodSettingsGlobal = typeof moodSettings !== 'undefined' ? moodSettings : {};
            const settings = moodSettingsGlobal[this.currentMood] || moodSettingsGlobal.calm || {};

            // --- Map General Parameters ---
            // Intensity driven by overall power, but clamped and scaled by mood's base brightness (implicit via lighting module)
            params.globalIntensity = 0.7 + audio.overallPower * 0.6;
            // Movement speed driven by mid-range energy (often correlates with rhythm/melody activity)
            params.movementSpeed = (settings.speed || 0.6) * (1.0 + audio.midPower * 1.0);
            // Dreaminess affected by mood base, increased by treble (shimmer), decreased by bass (grounding)
            params.dreaminess = (settings.dreaminess || 0.5) + audio.treblePower * 0.2 - audio.bassPower * 0.15;
            // Fluidity affected by mood base, increased by overall energy (more chaotic/active)
            params.fluidity = (settings.fluidMotion || 0.5) + audio.overallPower * 0.4;

            // --- Map Camera Parameters ---
            // Shake driven strongly by bass impact/peaks
            params.cameraShake = audio.bassImpact * 0.2 * (params.dreaminess > 0.6 ? 1.5 : 1.0); // More shake if dreamy
            // Auto-rotate speed uses base from settings, modulated by mid-power
            params.cameraAutoRotateSpeed = (settings.speed || 0.6) * 0.1 * (1.0 + audio.midPower * 0.5);

            // --- Map Particle Parameters ---
            // Size reacts to treble (sparkle) and bass impact (explosions)
            params.particleSize = 0.8 + audio.treblePower * 1.2 + audio.bassImpact * 0.6;
            // Speed reacts to mid (flow) and bass (push)
            params.particleSpeed = 0.7 + audio.midPower * 1.0 + audio.bassPower * 0.6;
            // Opacity linked to overall intensity
            params.particleOpacity = 0.5 + audio.overallPower * 0.5;
            // Color intensity linked to treble
            params.particleColorIntensity = 1.0 + audio.treblePower * 0.4;

            // --- Map Landscape Parameters ---
            // Elevation driven by bass power (ground shaking/rising)
            params.landscapeElevation = 1.0 + audio.bassPower * 1.0;
            // Morph speed uses base from settings, modulated by mid-power
            params.landscapeMorphSpeed = (settings.morphSpeed || 0.3) * (1.0 + audio.midPower * 0.7);
            // Pulse strength triggered by beat detector, magnitude by bass power
            params.landscapePulseStrength = audio.beatDetector.isBeat ? (0.15 + audio.bassPower * 0.4) : 0.0;

            // --- Map Water Parameters ---
            // Wave height driven strongly by bass power and impact
            params.waterWaveHeight = 0.5 + audio.bassPower * 2.0 + audio.bassImpact * 1.5;
            // Ripple strength driven by mid/treble frequencies
            params.waterRippleStrength = audio.midPower * 0.6 + audio.treblePower * 0.3;

            // --- Map Lighting Parameters ---
            // These are base multipliers/hints; the VCLighting module does the detailed work
            params.mainLightIntensity = 0.8 + audio.overallPower * 0.6;
            params.ambientLightIntensity = 0.2 + audio.overallPower * 0.3;
            // Glow/Bloom strongly affected by treble and overall intensity
            params.fxGlow = (settings.bloom || 0.7) * (0.8 + audio.globalIntensity * 0.5) + audio.treblePower * 0.6;

            // --- Map Event Triggers ---
            params.isBeat = audio.beatDetector.isBeat; // Pass beat flag directly
            params.peakImpact = audio.bassImpact; // Pass smoothed peak impact

            // --- Map Raw-ish Data ---
            // Provide the smoothed power values directly
            params.rawBass = audio.bassPower;
            params.rawMid = audio.midPower;
            params.rawTreble = audio.treblePower;
            params.rawOverall = audio.overallPower;
            // Copy the detailed frequency band data safely
            if (params.rawFreqBands.length === audio.frequencyBands.length) {
                for (let i = 0; i < params.rawFreqBands.length; i++) {
                    params.rawFreqBands[i] = audio.frequencyBands[i];
                }
            }

            // --- Clamp Final Values ---
            // Apply reasonable limits to prevent extreme visual values
            params.globalIntensity = Math.max(0.5, Math.min(params.globalIntensity, 1.5));
            params.movementSpeed = Math.max(0.1, Math.min(params.movementSpeed, 2.5));
            params.dreaminess = Math.max(0.0, Math.min(params.dreaminess, 1.0));
            params.fluidity = Math.max(0.0, Math.min(params.fluidity, 1.0));
            params.cameraShake = Math.max(0.0, Math.min(params.cameraShake, 0.1)); // Keep shake subtle
            params.particleSize = Math.max(0.5, Math.min(params.particleSize, 3.0));
            params.particleSpeed = Math.max(0.2, Math.min(params.particleSpeed, 2.5));
            params.particleOpacity = Math.max(0.1, Math.min(params.particleOpacity, 1.0));
            params.landscapeElevation = Math.max(0.5, Math.min(params.landscapeElevation, 2.0));
            params.waterWaveHeight = Math.max(0.1, Math.min(params.waterWaveHeight, 3.5));
            params.waterRippleStrength = Math.max(0.0, Math.min(params.waterRippleStrength, 1.0));
            params.fxGlow = Math.max(0.1, Math.min(params.fxGlow, 2.5));
            params.peakImpact = Math.max(0.0, Math.min(params.peakImpact, 1.0));
        }

        /**
         * Main update function called by the interval timer.
         * Fetches audio data, processes it, and maps it to visual parameters.
         */
        update() {
            // Prevent overlapping processing if update takes longer than interval
            if (this.isProcessing) {
                // console.warn("AudioVisualConnector: Update skipped, previous cycle still running.");
                return;
            }
            this.isProcessing = true;

            try {
                // Check if AudioEngine is available
                if (!this.audioEngine) {
                    // console.warn("AudioVisualConnector: AudioEngine not available in update loop.");
                    this._decayReactivity(0.02); // Decay faster if engine is missing
                    this._mapAudioToVisuals(); // Still map potentially decaying values
                    this.isProcessing = false;
                    return;
                }

                // Get raw audio data from the linked AudioEngine instance
                const rawData = this.audioEngine.getAudioData();

                // Process the data and update visual parameters
                this._processAudioData(rawData);
                this._mapAudioToVisuals();

            } catch (error) {
                console.error("AudioVisualConnector: Error in update loop:", error);
                // Attempt to reset or handle error gracefully?
                 this.visualParams = this._resetVisualParams(); // Reset visuals on error
                 this.audioReactivity = this._resetAudioReactivity();
            } finally {
                this.isProcessing = false; // Ensure flag is reset
            }
        }

        /**
         * Public method for VisualCanvas to retrieve the latest calculated visual parameters.
         * @returns {object} A copy of the visual parameters object.
         */
        getVisualParams() {
            // Return a shallow copy to prevent external modification of the internal state
            // Deep copy the frequency bands array specifically
            return {
                ...this.visualParams,
                rawFreqBands: [...this.visualParams.rawFreqBands]
            };
        }

        /**
         * Cleans up resources, specifically the update interval timer.
         */
        dispose() {
            if (this.updateInterval) {
                clearInterval(this.updateInterval);
                this.updateInterval = null;
            }
            this.audioEngine = null; // Release reference
            instance = null; // Allow recreation if needed
            console.log("AudioVisualConnector disposed.");
        }
    }

    // --- Singleton Access ---
    return {
        getInstance: () => {
            if (!instance) {
                instance = new Connector();
            }
            return instance;
        }
    };
})();

window.AudioVisualConnector = AudioVisualConnector;