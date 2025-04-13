// AudioEngine.js - Handles audio synthesis and processing

class AudioEngine {
    constructor(isPlaying, volume, mood) {
      this.isPlaying = isPlaying;
      this.volume = volume;
      this.mood = mood;
      
      // Audio context and nodes references
      this.audioContext = null;
      this.masterGain = null;
      this.reverbNode = null;
      this.analyser = null;
      this.compressor = null;
      
      // Sound generators references
      this.oscillators = [];
      this.ambientSources = [];
      this.melodicPattern = null;
      this.bassPattern = null;
      this.percussionPattern = null;
      
      // Audio data for visualization
      this.audioData = new Uint8Array(2048);
      
      // Initialize audio context
      this.initializeAudio();
    }
    
    initializeAudio() {
      try {
        // Create audio context
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioContext({ latencyHint: 'interactive' });
        
        // Create dynamics compressor for better overall sound
        const compressor = this.audioContext.createDynamicsCompressor();
        compressor.threshold.value = -24;
        compressor.knee.value = 30;
        compressor.ratio.value = 12;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;
        this.compressor = compressor;
        
        // Create main gain node
        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = this.volume;
        
        // Create analyzer node for visualization
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        this.analyser.smoothingTimeConstant = 0.85;
        
        // Create convolver for reverb
        this.reverbNode = this.audioContext.createConvolver();
        
        // Generate impulse response for reverb
        this.createReverb(this.audioContext, 3.0, 0.2).then(buffer => {
          this.reverbNode.buffer = buffer;
        });
        
        // Connect nodes: Master Gain -> Reverb -> Compressor -> Analyser -> Output
        this.masterGain.connect(this.reverbNode);
        this.reverbNode.connect(this.compressor);
        this.compressor.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);
        
        // Handle Safari: avoid initial suspension
        if (this.audioContext.state === 'suspended') {
          const resumeContext = () => {
            this.audioContext.resume();
            document.removeEventListener('click', resumeContext);
          };
          document.addEventListener('click', resumeContext);
        }
      } catch (error) {
        console.error("Failed to initialize audio engine:", error);
        ToastSystem.notify('error', 'Failed to initialize audio. Please try reloading the page.');
      }
    }
    
    // Get audio data for visualization
    getAudioData() {
      if (this.analyser) {
        this.analyser.getByteFrequencyData(this.audioData);
        return this.audioData;
      }
      return null;
    }
    
    // Update volume
    setVolume(volume) {
      this.volume = volume;
      if (this.masterGain && this.audioContext) {
        this.masterGain.gain.setValueAtTime(
          this.volume,
          this.audioContext.currentTime
        );
      }
    }
    
    // Start/stop audio
    setPlaying(isPlaying, mood) {
      this.isPlaying = isPlaying;
      this.mood = mood;
      
      if (isPlaying) {
        // Resume audio context if suspended
        if (this.audioContext && this.audioContext.state === 'suspended') {
          this.audioContext.resume().catch(error => {
            console.error("Failed to resume audio context:", error);
            ToastSystem.notify('error', 'Failed to start audio. Try clicking or tapping the screen first.');
          });
        }
        
        // Start audio generators
        this.startAudio(mood);
      } else {
        // Stop all sound sources
        this.stopAudio();
      }
    }
    
    // Update reverb when mood changes
    updateReverb(mood) {
      if (this.reverbNode && this.audioContext && moodAudioSettings[mood]) {
        this.createReverb(
          this.audioContext,
          moodAudioSettings[mood].reverbTime,
          moodAudioSettings[mood].reverbDamping
        ).then(buffer => {
          this.reverbNode.buffer = buffer;
        }).catch(error => {
          console.error("Failed to create reverb:", error);
        });
      }
    }
    
    // Create enhanced reverb impulse response
    async createReverb(context, duration, damping = 0.4) {
      const sampleRate = context.sampleRate;
      const length = sampleRate * duration;
      const impulseResponse = context.createBuffer(2, length, sampleRate);
      
      const leftChannel = impulseResponse.getChannelData(0);
      const rightChannel = impulseResponse.getChannelData(1);
      
      // Create more realistic reverb with initial reflections and decay
      for (let i = 0; i < length; i++) {
        // Early reflections (first 50ms)
        if (i < sampleRate * 0.05) {
          const reflectionStrength = Math.random() * 0.5 * Math.exp(-i / (sampleRate * 0.02));
          leftChannel[i] = (Math.random() * 2 - 1) * reflectionStrength;
          rightChannel[i] = (Math.random() * 2 - 1) * reflectionStrength;
        } 
        // Main decay
        else {
          // Decay curve with frequency-dependent damping
          const decay = Math.exp(-i / (sampleRate * duration * (1 - damping * 0.5)));
          
          // Add some subtle modulation to create a more organic sound
          const modulation = 1 + 0.1 * Math.sin(i * 0.0001);
          
          // Stereo field enhancement
          const stereoSpread = 0.3;
          const leftSample = (Math.random() * 2 - 1) * decay * modulation;
          const rightSample = (Math.random() * 2 - 1) * decay * modulation;
          
          // Mix for stereo spread
          leftChannel[i] = leftSample * (1 - stereoSpread/2) + rightSample * stereoSpread/2;
          rightChannel[i] = rightSample * (1 - stereoSpread/2) + leftSample * stereoSpread/2;
        }
      }
      
      return impulseResponse;
    }
    
    // Start audio generators
    startAudio(currentMood) {
      const context = this.audioContext;
      const masterGain = this.masterGain;
      const settings = moodAudioSettings[currentMood];
      
      if (!context || !masterGain || !settings) {
        console.error("Audio context, master gain, or settings not available");
        return;
      }
      
      // Stop any currently playing sounds
      this.stopAudio();
      
      try {
        // Create ambient sound layers
        this.createAmbientLayers(settings);
        
        // Create drone/pad sound
        this.createDronePad(settings);
        
        // Create bass pattern
        this.createBassPattern(settings);
        
        // Create melodic pattern
        this.createMelodicPattern(settings);
        
        // Create subtle percussion (if not calm or cosmic mood)
        if (currentMood !== 'calm' && currentMood !== 'cosmic') {
          this.createPercussionPattern(settings);
        }
      } catch (error) {
        console.error("Error starting audio:", error);
        ToastSystem.notify('error', 'An error occurred while creating audio elements');
      }
    }
    
    // Stop all audio generators
    stopAudio() {
      // Stop oscillators
      this.oscillators.forEach(osc => {
        try {
          if (osc.stop && typeof osc.stop === 'function') {
            osc.stop();
          }
          if (osc.disconnect && typeof osc.disconnect === 'function') {
            osc.disconnect();
          }
        } catch (e) {
          // Oscillator might be already stopped
        }
      });
      this.oscillators = [];
      
      // Stop ambient sources
      this.ambientSources.forEach(source => {
        try {
          if (source.stop && typeof source.stop === 'function') {
            source.stop();
          }
          if (source.disconnect && typeof source.disconnect === 'function') {
            source.disconnect();
          }
        } catch (e) {
          // Source might be already stopped
        }
      });
      this.ambientSources = [];
      
      // Stop patterns
      [this.melodicPattern, this.bassPattern, this.percussionPattern].forEach(ref => {
        if (ref) {
          clearInterval(ref);
        }
      });
      this.melodicPattern = null;
      this.bassPattern = null;
      this.percussionPattern = null;
    }
    
    // Create advanced ambient sound layers
    createAmbientLayers(settings) {
      const context = this.audioContext;
      const masterGain = this.masterGain;
      
      if (!context || !masterGain) return;
      
      settings.ambientSounds.forEach((type, index) => {
        // Create stereo panner for spatial positioning
        const panner = context.createStereoPanner();
        panner.pan.value = settings.panning ? (index % 2 === 0 ? -0.3 : 0.3) : 0;
        
        // Create white noise source for base ambient sounds
        const bufferSize = 2 * context.sampleRate;
        const noiseBuffer = context.createBuffer(1, bufferSize, context.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        
        // Generate noise based on ambient type
        switch (type) {
          case 'water':
            // Water flowing sound (filtered noise with modulation)
            for (let i = 0; i < bufferSize; i++) {
              // Combine multiple noise frequencies for natural water sound
              const highFreq = Math.random() * 2 - 1;
              const midFreq = Math.random() * 2 - 1;
              const lowFreq = Math.random() * 2 - 1;
              
              // Water has more mid and low frequencies than pure white noise
              output[i] = (highFreq * 0.2 + midFreq * 0.5 + lowFreq * 0.3) * 
                          (0.7 + 0.3 * Math.sin(i / 20000)); // Subtle wave pattern
            }
            break;
          
          case 'wind':
            // Wind sound (filtered noise with slow modulation)
            for (let i = 0; i < bufferSize; i++) {
              // Wind has a "whistling" quality created by filtered noise
              const noise = Math.random() * 2 - 1;
              // Slow amplitude modulation creates gusts
              const gustIntensity = 0.5 + 0.5 * Math.sin(i / 40000) + 0.2 * Math.sin(i / 12000);
              // Frequency modulation creates the whistling effect
              const whistling = 0.1 * Math.sin(i / (1000 + 500 * Math.sin(i / 25000)));
              
              output[i] = noise * gustIntensity + whistling;
            }
            break;
          
          case 'birds':
            // Birds chirping (random chirps over quiet background)
            let lastChirpTime = 0;
            for (let i = 0; i < bufferSize; i++) {
              // Background ambient noise (very quiet)
              output[i] = Math.random() * 0.03;
              
              // Occasionally generate a bird chirp
              if (i - lastChirpTime > 10000 && Math.random() > 0.9995) {
                // Start of chirp sequence
                lastChirpTime = i;
                
                // Each bird has a different chirp pattern
                const chirpCount = 2 + Math.floor(Math.random() * 5);
                const chirpBaseFreq = 2000 + Math.random() * 3000; // Hz, higher frequency for birds
                
                for (let c = 0; c < chirpCount; c++) {
                  const chirpStart = i + c * 2000 * Math.random();
                  const chirpLength = 300 + Math.random() * 500;
                  
                  if (chirpStart + chirpLength < bufferSize) {
                    // Generate a single chirp
                    for (let j = 0; j < chirpLength; j++) {
                      const position = chirpStart + j;
                      const envelope = Math.sin((j / chirpLength) * Math.PI);
                      const chirpFreq = chirpBaseFreq * (1 + 0.2 * Math.sin(j / 30));
                      
                      output[Math.floor(position)] += 
                        Math.sin(j * (chirpFreq / context.sampleRate) * Math.PI * 2) * 
                        envelope * 0.25;
                    }
                  }
                }
              }
            }
            break;
          
          case 'fire':
            // Fire crackling (random bursts of noise)
            for (let i = 0; i < bufferSize; i++) {
              // Base fire sound (low rumble)
              const baseFire = Math.random() * 0.1;
              
              // Random crackling
              let crackle = 0;
              if (Math.random() > 0.995) {
                // Create a crackle
                for (let j = 0; j < 500 && i + j < bufferSize; j++) {
                  // Sharp attack, quick decay
                  const envelope = Math.exp(-j / 100);
                  output[i + j] += (Math.random() * 2 - 1) * envelope * 0.4;
                }
              }
              
              output[i] += baseFire;
            }
            break;
          
          case 'night':
            // Night sounds (crickets, occasional owl, etc.)
            for (let i = 0; i < bufferSize; i++) {
              // Very quiet background
              output[i] = Math.random() * 0.02;
              
              // Cricket chirps (repeating pattern)
              if (i % 20000 < 2000 && i % 250 < 50) {
                const chirpEnvelope = Math.sin((i % 250) / 50 * Math.PI);
                output[i] += Math.sin(i * 0.3) * chirpEnvelope * 0.15;
              }
              
              // Occasional owl hoot
              if (Math.random() > 0.9999) {
                for (let j = 0; j < 5000 && i + j < bufferSize; j++) {
                  const hootEnvelope = Math.sin((j / 5000) * Math.PI);
                  const hootFreq = 300 + 50 * Math.sin(j / 1000);
                  output[i + j] += Math.sin(j * (hootFreq / context.sampleRate) * 
                                  Math.PI * 2) * hootEnvelope * 0.2;
                }
              }
            }
            break;
          
          case 'space':
            // Space ambient (low drones, occasional swooshes)
            for (let i = 0; i < bufferSize; i++) {
              // Deep space background (filtered noise)
              const spaceNoise = Math.random() * 2 - 1;
              
              // Very low frequency modulation
              const spaceMod = 0.1 + 0.1 * Math.sin(i / 100000);
              
              // Occasional ethereal tones
              let toneSweep = 0;
              if (i % 200000 < 30000) {
                const sweepPhase = (i % 200000) / 30000;
                const sweepFreq = 100 + sweepPhase * 200;
                const sweepEnvelope = 0.5 * 
                                    Math.sin(sweepPhase * Math.PI) * 
                                    (0.5 + 0.5 * Math.sin(sweepPhase * 20 * Math.PI));
                
                toneSweep = Math.sin(i * (sweepFreq / context.sampleRate) * 
                            Math.PI * 2) * sweepEnvelope * 0.1;
              }
              
              output[i] = spaceNoise * spaceMod * 0.1 + toneSweep;
            }
            break;
          
          default:
            // Default white noise
            for (let i = 0; i < bufferSize; i++) {
              output[i] = Math.random() * 2 - 1;
            }
        }
        
        // Create audio source from noise buffer
        const source = context.createBufferSource();
        source.buffer = noiseBuffer;
        source.loop = true;
        
        // Create filter for shaping the sound
        const filter = context.createBiquadFilter();
        
        // Configure filter based on ambient type
        switch (type) {
          case 'water':
            filter.type = 'lowpass';
            filter.frequency.value = 800;
            filter.Q.value = 1;
            
            // Add LFO for water movement
            const waterLFO = context.createOscillator();
            const waterLFOGain = context.createGain();
            waterLFO.frequency.value = 0.1;
            waterLFOGain.gain.value = 100;
            waterLFO.connect(waterLFOGain);
            waterLFOGain.connect(filter.frequency);
            waterLFO.start();
            this.oscillators.push(waterLFO);
            break;
            
          case 'wind':
            filter.type = 'bandpass';
            filter.frequency.value = 500;
            filter.Q.value = 2;
            
            // More complex LFO system for wind
            const windLFO1 = context.createOscillator();
            const windLFO2 = context.createOscillator();
            const windLFOGain = context.createGain();
            
            windLFO1.frequency.value = 0.1;
            windLFO2.frequency.value = 0.05;
            
            const windLFO1Gain = context.createGain();
            const windLFO2Gain = context.createGain();
            
            windLFO1Gain.gain.value = 200;
            windLFO2Gain.gain.value = 100;
            
            windLFO1.connect(windLFO1Gain);
            windLFO2.connect(windLFO2Gain);
            
            windLFO1Gain.connect(windLFOGain);
            windLFO2Gain.connect(windLFOGain);
            
            windLFOGain.connect(filter.frequency);
            
            windLFO1.start();
            windLFO2.start();
            
            this.oscillators.push(windLFO1);
            this.oscillators.push(windLFO2);
            break;
            
          case 'birds':
            // High-pass to emphasize the chirps
            filter.type = 'highpass';
            filter.frequency.value = 2000;
            filter.Q.value = 1;
            
            // Add a second bandpass filter for the characteristic bird sound
            const birdFilter2 = context.createBiquadFilter();
            birdFilter2.type = 'bandpass';
            birdFilter2.frequency.value = 3500;
            birdFilter2.Q.value = 2;
            
            filter.connect(birdFilter2);
            // Use birdFilter2 for future connections
            source.connect(filter);
            filter.connect(birdFilter2);
            birdFilter2.connect(panner);
            panner.connect(masterGain);
            
            // Store references for cleanup
            this.ambientSources.push(source);
            
            // Skip the rest of the processing as we've already connected everything
            return;
            
          case 'fire':
            // Layered filters for fire
            filter.type = 'lowpass';
            filter.frequency.value = 4000;  // Allow higher frequencies for crackling
            
            const fireFilter2 = context.createBiquadFilter();
            fireFilter2.type = 'bandpass';
            fireFilter2.frequency.value = 1500; // Mid frequencies for the base fire sound
            fireFilter2.Q.value = 0.8;
            
            // Modulate filter frequency for live fire effect
            const fireLFO = context.createOscillator();
            const fireLFOGain = context.createGain();
            fireLFO.frequency.value = 0.3;
            fireLFOGain.gain.value = 400;
            fireLFO.connect(fireLFOGain);
            fireLFOGain.connect(fireFilter2.frequency);
            fireLFO.start();
            
            // Connect the first filter to the second
            source.connect(filter);
            filter.connect(fireFilter2);
            fireFilter2.connect(panner);
            panner.connect(masterGain);
            
            this.oscillators.push(fireLFO);
            this.ambientSources.push(source);
            
            // Skip the rest of the processing as we've already connected everything
            return;
            
          case 'night':
            // Combined filters for night sounds
            filter.type = 'bandpass';
            filter.frequency.value = 3000;
            filter.Q.value = 5;
            
            // Add a second filter for the lower sounds (owls)
            const nightFilter2 = context.createBiquadFilter();
            nightFilter2.type = 'lowpass';
            nightFilter2.frequency.value = 400;
            
            // Create a gain for the second filter path
            const nightLowGain = context.createGain();
            nightLowGain.gain.value = 0.6;
            
            // Split the signal
            source.connect(filter);
            filter.connect(panner);
            source.connect(nightFilter2);
            nightFilter2.connect(nightLowGain);
            nightLowGain.connect(panner);
            panner.connect(masterGain);
            
            this.ambientSources.push(source);
            
            // Skip the rest of the processing as we've already connected everything
            return;
            
          case 'space':
            // Complex filter arrangement for space sounds
            filter.type = 'lowpass';
            filter.frequency.value = 200;
            filter.Q.value = 5;
            
            // Add a second bandpass filter for ethereal tones
            const spaceFilter2 = context.createBiquadFilter();
            spaceFilter2.type = 'bandpass';
            spaceFilter2.frequency.value = 700;
            spaceFilter2.Q.value = 8;
            
            // Create a gain for the second filter path
            const spaceToneGain = context.createGain();
            spaceToneGain.gain.value = 0.3;
            
            // LFO for sweeping the bandpass
            const spaceLFO = context.createOscillator();
            const spaceLFOGain = context.createGain();
            spaceLFO.frequency.value = 0.02; // Very slow
            spaceLFOGain.gain.value = 300;
            spaceLFO.connect(spaceLFOGain);
            spaceLFOGain.connect(spaceFilter2.frequency);
            spaceLFO.start();
            
            // Split the signal
            source.connect(filter);
            filter.connect(panner);
            source.connect(spaceFilter2);
            spaceFilter2.connect(spaceToneGain);
            spaceToneGain.connect(panner);
            panner.connect(masterGain);
            
            this.oscillators.push(spaceLFO);
            this.ambientSources.push(source);
            
            // Skip the rest of the processing as we've already connected everything
            return;
            
          default:
            filter.type = 'lowpass';
            filter.frequency.value = 1000;
        }
        
        // Create gain for the ambient sound
        const ambientGain = context.createGain();
        ambientGain.gain.value = settings.ambientVolume; // Set from mood settings
        
        // Create an EQ section (using multiple filters)
        const lowEQ = context.createBiquadFilter();
        const midEQ = context.createBiquadFilter();
        const highEQ = context.createBiquadFilter();
        
        lowEQ.type = 'lowshelf';
        lowEQ.frequency.value = 300;
        lowEQ.gain.value = type === 'water' || type === 'fire' ? 3 : 0; // Boost lows for water and fire
        
        midEQ.type = 'peaking';
        midEQ.frequency.value = 1000;
        midEQ.Q.value = 1;
        midEQ.gain.value = type === 'birds' ? 3 : (type === 'night' ? -3 : 0); // EQ adjustments by type
        
        highEQ.type = 'highshelf';
        highEQ.frequency.value = 3000;
        highEQ.gain.value = type === 'birds' ? 5 : (type === 'space' ? -5 : 0); // EQ adjustments by type
        
        // Connect all the nodes
        source.connect(filter);
        filter.connect(lowEQ);
        lowEQ.connect(midEQ);
        midEQ.connect(highEQ);
        highEQ.connect(ambientGain);
        ambientGain.connect(panner);
        panner.connect(masterGain);
        
        // Start the source
        source.start(0);
        
        // Store references for cleanup
        this.ambientSources.push(source);
      });
    }
    
    // Create enhanced drone/pad sound
    createDronePad(settings) {
      const context = this.audioContext;
      const masterGain = this.masterGain;
      
      if (!context || !masterGain) return;
      
      // Create a separate gain node for all pad elements
      const padMasterGain = context.createGain();
      padMasterGain.gain.value = settings.padVolume;
      padMasterGain.connect(masterGain);
      
      // Add a subtle chorus effect
      const chorus = this.createChorus(context);
      
      // Create oscillators for each harmonic
      settings.harmonics.forEach((harmonic, idx) => {
        // Create and configure a gain node for this harmonic
        const oscGain = context.createGain();
        oscGain.gain.value = 0; // Will be ramped up
        
        // Calculate slight detuning for each oscillator instance to create a richer sound
        const detune1 = -5 + Math.random() * 10;
        const detune2 = -5 + Math.random() * 10;
        
        // Create two slightly detuned oscillators per harmonic for richness
        const createPadOscillator = (detune, pan = 0) => {
          // Create and configure oscillator
          const osc = context.createOscillator();
          
          // Alternate between waveforms for different harmonics
          const waveforms = ['sine', 'triangle', 'sine', 'triangle', 'sine'];
          osc.type = waveforms[idx % waveforms.length];
          
          // Apply frequency and detune
          osc.frequency.value = settings.baseFreq * harmonic;
          osc.detune.value = detune;
          
          // Create a filter for this oscillator
          const oscFilter = context.createBiquadFilter();
          oscFilter.type = 'lowpass';
          oscFilter.frequency.value = settings.filterFreq / (harmonic * 0.5);
          oscFilter.Q.value = settings.filterQ * (1 - idx * 0.1);
          
          // Create a panner for stereo spread
          const oscPanner = context.createStereoPanner();
          oscPanner.pan.value = pan;
          
          // Create an LFO for subtle movement
          const lfo = context.createOscillator();
          // Different LFO speeds for each oscillator
          lfo.frequency.value = settings.modulationFreq * (1 + 0.3 * Math.random() - 0.15);
          
          const lfoGain = context.createGain();
          lfoGain.gain.value = settings.modulationAmount * (1 / (harmonic * 0.3));
          
          // Connect LFO to oscillator frequency for vibrato
          lfo.connect(lfoGain);
          lfoGain.connect(osc.frequency);
          
          // Connect everything
          osc.connect(oscFilter);
          oscFilter.connect(oscPanner);
          oscPanner.connect(oscGain);
          
          // Start oscillator and LFO
          osc.start(0);
          lfo.start(0);
          
          // Store for cleanup
          this.oscillators.push(osc);
          this.oscillators.push(lfo);
          
          return { osc, lfo, filter: oscFilter };
        };
        
        // Create the two detuned oscillators with opposite panning
        const osc1 = createPadOscillator(detune1, -0.2 * (idx % 2 ? 1 : -1));
        const osc2 = createPadOscillator(detune2, 0.2 * (idx % 2 ? 1 : -1));
        
        // Connect the oscillator gain to chorus and then to the pad master gain
        oscGain.connect(chorus.input);
        
        // Apply volume curve based on harmonic number (lower harmonics louder)
        const harmonicVolume = 0.15 / Math.sqrt(idx + 1);
        
        // Fade in the gain with an appropriate envelope
        oscGain.gain.setValueAtTime(0, context.currentTime);
        oscGain.gain.linearRampToValueAtTime(
          harmonicVolume,
          context.currentTime + settings.attackTime * (1 + idx * 0.2) // Stagger attacks
        );
      });
      
      // Connect chorus to pad master gain
      chorus.output.connect(padMasterGain);
    }
    
    // Create a simple chorus effect
    createChorus(context) {
      // Delay lines
      const delay1 = context.createDelay();
      const delay2 = context.createDelay();
      
      delay1.delayTime.value = 0.025;
      delay2.delayTime.value = 0.02;
      
      // LFOs to modulate the delay times
      const lfo1 = context.createOscillator();
      const lfo2 = context.createOscillator();
      
      const lfo1Gain = context.createGain();
      const lfo2Gain = context.createGain();
      
      lfo1.frequency.value = 0.6;
      lfo2.frequency.value = 0.7;
      
      lfo1Gain.gain.value = 0.005;
      lfo2Gain.gain.value = 0.004;
      
      lfo1.connect(lfo1Gain);
      lfo2.connect(lfo2Gain);
      
      lfo1Gain.connect(delay1.delayTime);
      lfo2Gain.connect(delay2.delayTime);
      
      // Gain nodes for delay lines
      const delay1Gain = context.createGain();
      const delay2Gain = context.createGain();
      
      delay1Gain.gain.value = 0.33;
      delay2Gain.gain.value = 0.33;
      
      // Input and output nodes
      const input = context.createGain();
      const output = context.createGain();
      
      // Wet/dry mix
      const dryGain = context.createGain();
      dryGain.gain.value = 0.5;
      
      // Connections
      input.connect(dryGain);
      dryGain.connect(output);
      
      input.connect(delay1);
      input.connect(delay2);
      
      delay1.connect(delay1Gain);
      delay2.connect(delay2Gain);
      
      delay1Gain.connect(output);
      delay2Gain.connect(output);
      
      // Start LFOs
      lfo1.start();
      lfo2.start();
      
      // Store for cleanup
      this.oscillators.push(lfo1);
      this.oscillators.push(lfo2);
      
      return { input, output };
    }
    
    // Create bass pattern
    createBassPattern(settings) {
      const context = this.audioContext;
      const masterGain = this.masterGain;
      
      if (!context || !masterGain) return;
      
      // Clear any existing pattern
      if (this.bassPattern) {
        clearInterval(this.bassPattern);
      }
      
      // Create a gain node for the bass
      const bassGain = context.createGain();
      bassGain.gain.value = settings.bassVolume;
      
      // Create filter and compressor for bass
      const bassFilter = context.createBiquadFilter();
      bassFilter.type = 'lowpass';
      bassFilter.frequency.value = 300;
      bassFilter.Q.value = 0.7;
      
      const bassCompressor = context.createDynamicsCompressor();
      bassCompressor.threshold.value = -24;
      bassCompressor.knee.value = 10;
      bassCompressor.ratio.value = 12;
      bassCompressor.attack.value = 0.005;
      bassCompressor.release.value = 0.25;
      
      // Connect nodes
      bassGain.connect(bassFilter);
      bassFilter.connect(bassCompressor);
      bassCompressor.connect(masterGain);
      
      // Get scale for current mood
      const scale = musicalScales[settings.scale] || musicalScales.pentatonic;
      
      // Calculate tempo-related values
      const tempo = settings.tempo;
      const beatDuration = 60 / tempo;
      const noteDuration = beatDuration * 2; // Half-notes for bass typically
      
      // Create bass pattern based on mood
      let bassPattern;
      const baseNote = 0; // Root note
      
      switch (this.mood) {
        case 'calm':
          bassPattern = [baseNote, baseNote, baseNote + 7, baseNote + 5];
          break;
        case 'soft':
          bassPattern = [baseNote, baseNote + 5, baseNote + 3, baseNote + 5];
          break;
        case 'uplifting':
          bassPattern = [baseNote, baseNote + 7, baseNote + 9, baseNote + 5];
          break;
        case 'warm':
          bassPattern = [baseNote, baseNote + 5, baseNote + 3, baseNote];
          break;
        case 'cosmic':
          bassPattern = [baseNote, baseNote + 2, baseNote + 5, baseNote + 3];
          break;
        default:
          bassPattern = [baseNote, baseNote + 5, baseNote + 7, baseNote + 5];
      }
      
      let patternIndex = 0;
      
      // Function to play a single bass note
      const playBassNote = () => {
        // Basic bass note with sub-oscillator
        const noteIndex = bassPattern[patternIndex];
        patternIndex = (patternIndex + 1) % bassPattern.length;
        
        // Calculate frequency: two octaves below the base
        const frequency = settings.baseFreq * 0.25 * Math.pow(2, noteIndex / 12);
        
        // Create oscillators (layered for richness)
        // Base sub-oscillator (sine wave, one octave down)
        const subOsc = context.createOscillator();
        subOsc.type = 'sine';
        subOsc.frequency.value = frequency * 0.5;
        
        // Main oscillator (can be triangle or sawtooth depending on mood)
        const mainOsc = context.createOscillator();
        mainOsc.type = this.mood === 'uplifting' ? 'sawtooth' : 'triangle';
        mainOsc.frequency.value = frequency;
        
        // Upper harmonic (adds definition)
        const harmOsc = context.createOscillator();
        harmOsc.type = 'sine';
        harmOsc.frequency.value = frequency * 2;
        
        // Create gain nodes for each oscillator
        const subGain = context.createGain();
        const mainGain = context.createGain();
        const harmGain = context.createGain();
        
        // Set relative volumes
        subGain.gain.value = 0.6;
        mainGain.gain.value = 0.4;
        harmGain.gain.value = 0.15;
        
        // Connect oscillators to their respective gain nodes
        subOsc.connect(subGain);
        mainOsc.connect(mainGain);
        harmOsc.connect(harmGain);
        
        // Connect all gain nodes to the bass gain
        subGain.connect(bassGain);
        mainGain.connect(bassGain);
        harmGain.connect(bassGain);
        
        // Create envelopes
        const createEnvelope = (gainNode, attackTime, releaseTime) => {
          gainNode.gain.setValueAtTime(0, context.currentTime);
          gainNode.gain.linearRampToValueAtTime(
            gainNode.gain.value,
            context.currentTime + attackTime
          );
          
          gainNode.gain.setValueAtTime(
            gainNode.gain.value,
            context.currentTime + noteDuration - releaseTime
          );
          
          gainNode.gain.linearRampToValueAtTime(
            0,
            context.currentTime + noteDuration
          );
        };
        
        // Apply envelopes
        createEnvelope(subGain, 0.05, 0.2);
        createEnvelope(mainGain, 0.02, 0.15);
        createEnvelope(harmGain, 0.01, 0.1);
        
        // Start oscillators
        subOsc.start(context.currentTime);
        mainOsc.start(context.currentTime);
        harmOsc.start(context.currentTime);
        
        // Stop oscillators
        const stopTime = context.currentTime + noteDuration + 0.1;
        subOsc.stop(stopTime);
        mainOsc.stop(stopTime);
        harmOsc.stop(stopTime);
        
        // Store for cleanup
        this.oscillators.push(subOsc);
        this.oscillators.push(mainOsc);
        this.oscillators.push(harmOsc);
      };
      
      // Initial bass note
      playBassNote();
      
      // Schedule remaining bass notes
      this.bassPattern = setInterval(() => {
        if (this.isPlaying) {
          playBassNote();
        }
      }, noteDuration * 1000);
    }
    
    // Create melodic pattern
    createMelodicPattern(settings) {
      const context = this.audioContext;
      const masterGain = this.masterGain;
      
      if (!context || !masterGain) return;
      
      // Clear any existing pattern
      if (this.melodicPattern) {
        clearInterval(this.melodicPattern);
      }
      
      // Create a gain node for melodic elements
      const melodyGain = context.createGain();
      melodyGain.gain.value = settings.melodyVolume;
      melodyGain.connect(masterGain);
      
      // Get scale for current mood
      const scale = musicalScales[settings.scale] || musicalScales.pentatonic;
      
      // Calculate tempo-related timing
      const tempo = settings.tempo;
      const beatDuration = 60 / tempo;
      
      // Determine note density based on mood
      let noteDensity, patternVariation;
      
      switch (this.mood) {
        case 'calm':
          noteDensity = 2 * beatDuration; // Every half note
          patternVariation = 0.3; // 30% timing variation
          break;
        case 'soft':
          noteDensity = 1.5 * beatDuration; // Dotted quarter notes
          patternVariation = 0.25;
          break;
        case 'uplifting':
          noteDensity = 0.5 * beatDuration; // Eighth notes
          patternVariation = 0.15;
          break;
        case 'warm':
          noteDensity = beatDuration; // Quarter notes
          patternVariation = 0.2;
          break;
        case 'cosmic':
          noteDensity = 3 * beatDuration; // Dotted half notes
          patternVariation = 0.4; // More varied
          break;
        default:
          noteDensity = beatDuration;
          patternVariation = 0.2;
      }
      
      // Convert to milliseconds
      const noteInterval = noteDensity * 1000;
      const intervalVariation = noteInterval * patternVariation;
      
      // Function to play a single melodic note
      const playMelodicNote = () => {
        // Choose note from scale
        const scaleIndex = Math.floor(Math.random() * scale.length);
        const semitones = scale[scaleIndex];
        
        // Adjust octave based on position in scale
        const octaveAdjust = Math.floor(scaleIndex / 7);
        
        // Calculate frequency from base frequency and semitones
        const frequency = settings.baseFreq * Math.pow(2, (semitones + 12 * octaveAdjust) / 12);
        
        // Create multi-oscillator for richer tone
        const createOscillatorGroup = () => {
          // Main oscillator
          const osc = context.createOscillator();
          
          // Choose waveform based on mood
          const waveforms = {
            calm: ['sine', 'triangle'],
            soft: ['sine', 'triangle'],
            uplifting: ['triangle', 'square'],
            warm: ['triangle', 'sine'],
            cosmic: ['sine', 'triangle']
          };
          
          const moodWaveforms = waveforms[this.mood] || ['sine', 'triangle'];
          osc.type = moodWaveforms[Math.floor(Math.random() * moodWaveforms.length)];
          
          osc.frequency.value = frequency;
          
          // Slight random detune for more organic sound
          osc.detune.value = Math.random() * 10 - 5;
          
          // Secondary oscillator for harmonic richness
          const osc2 = context.createOscillator();
          osc2.type = 'sine';
          
          // Fifth above (perfect fifth, 7 semitones)
          osc2.frequency.value = frequency * 1.5;
          osc2.detune.value = Math.random() * 10 - 5;
          
          // Gain nodes for each oscillator
          const oscGain = context.createGain();
          const osc2Gain = context.createGain();
          
          oscGain.gain.value = 0.7;
          osc2Gain.gain.value = 0.3;
          
          // Filter for tone shaping
          const filter = context.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = settings.filterFreq * 2;
          filter.Q.value = settings.filterQ * 0.8;
          
          // Create stereo panner for spatial position
          const panner = context.createStereoPanner();
          panner.pan.value = Math.random() * 0.8 - 0.4; // Random position between -0.4 and 0.4
          
          // Connect everything
          osc.connect(oscGain);
          osc2.connect(osc2Gain);
          
          oscGain.connect(filter);
          osc2Gain.connect(filter);
          
          filter.connect(panner);
          panner.connect(melodyGain);
          
          return {
            oscillators: [osc, osc2],
            gains: [oscGain, osc2Gain],
            filter,
            panner
          };
        };
        
        // Create oscillator group
        const oscGroup = createOscillatorGroup();
        
        // Note duration based on mood - normally a percentage of the interval
        const durationFactor = {
          calm: 0.9, // Long, legato notes
          soft: 0.8,
          uplifting: 0.6, // Shorter, more staccato
          warm: 0.75,
          cosmic: 0.95 // Very long, connected notes
        };
        
        const noteDuration = noteDensity * (durationFactor[this.mood] || 0.7);
        
        // Attack and release times scaled to note duration
        const attackTime = Math.min(noteDuration * 0.3, settings.attackTime);
        const releaseTime = Math.min(noteDuration * 0.5, settings.releaseTime);
        
        // Apply envelopes to all oscillator gains
        oscGroup.gains.forEach(gain => {
          // Attack
          gain.gain.setValueAtTime(0, context.currentTime);
          gain.gain.linearRampToValueAtTime(
            gain.gain.value,
            context.currentTime + attackTime
          );
          
          // Release
          gain.gain.setValueAtTime(
            gain.gain.value,
            context.currentTime + noteDuration - releaseTime
          );
          gain.gain.linearRampToValueAtTime(
            0,
            context.currentTime + noteDuration
          );
        });
        
        // Filter envelope for dynamic tone
        oscGroup.filter.frequency.setValueAtTime(
          settings.filterFreq * 2,
          context.currentTime
        );
        oscGroup.filter.frequency.linearRampToValueAtTime(
          settings.filterFreq,
          context.currentTime + noteDuration
        );
        
        // Start and stop oscillators
        oscGroup.oscillators.forEach(osc => {
          osc.start(context.currentTime);
          osc.stop(context.currentTime + noteDuration + 0.1);
          
          // Store for cleanup
          this.oscillators.push(osc);
        });
        
        // Schedule next note with variation
        const nextNoteTime = noteInterval + (Math.random() * intervalVariation * 2 - intervalVariation);
        
        if (this.melodicPattern) {
          clearTimeout(this.melodicPattern);
        }
        
        this.melodicPattern = setTimeout(() => {
          if (this.isPlaying) {
            playMelodicNote();
          }
        }, nextNoteTime);
      };
      
      // Start playing notes
      playMelodicNote();
    }
    
    // Create subtle percussion pattern
    createPercussionPattern(settings) {
      const context = this.audioContext;
      const masterGain = this.masterGain;
      
      if (!context || !masterGain) return;
      
      // Clear any existing pattern
      if (this.percussionPattern) {
        clearInterval(this.percussionPattern);
      }
      
      // Create a gain node for percussion
      const percussionGain = context.createGain();
      percussionGain.gain.value = 0.2; // Lower volume for percussion
      percussionGain.connect(masterGain);
      
      // Calculate tempo-related timing
      const tempo = settings.tempo;
      const beatDuration = 60 / tempo;
      
      // Create percussion sounds
      const createHiHat = () => {
        // White noise buffer for hi-hat
        const bufferSize = context.sampleRate * 0.1; // 100ms buffer
        const noiseBuffer = context.createBuffer(1, bufferSize, context.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        
        // Fill buffer with white noise
        for (let i = 0; i < bufferSize; i++) {
          output[i] = Math.random() * 2 - 1;
        }
        
        // Create source from buffer
        const source = context.createBufferSource();
        source.buffer = noiseBuffer;
        
        // Create bandpass filter for hi-hat sound
        const filter = context.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 8000;
        filter.Q.value = 1;
        
        // Create envelope with gain node
        const gainNode = context.createGain();
        gainNode.gain.value = 0;
        
        // Create panner for stereo image
        const panner = context.createStereoPanner();
        panner.pan.value = 0.3; // Slightly to the right
        
        // Connect nodes: Source -> Filter -> Gain -> Panner -> Percussion Gain
        source.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(panner);
        panner.connect(percussionGain);
        
        // Very short envelope for hi-hat
        const duration = 0.05 + Math.random() * 0.05; // 50-100ms
        
        gainNode.gain.setValueAtTime(0, context.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.5, context.currentTime + 0.001); // Fast attack
        gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + duration); // Quick decay
        
        // Start and stop source
        source.start(context.currentTime);
        source.stop(context.currentTime + duration + 0.01);
        
        // Store for cleanup
        this.ambientSources.push(source);
      };
      
      const createKick = () => {
        // Create oscillator for kick sound
        const osc = context.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 150; // Start frequency
        
        // Create envelope with gain node
        const gainNode = context.createGain();
        gainNode.gain.value = 0;
        
        // Create panner for stereo image
        const panner = context.createStereoPanner();
        panner.pan.value = -0.2; // Slightly to the left
        
        // Connect nodes
        osc.connect(gainNode);
        gainNode.connect(panner);
        panner.connect(percussionGain);
        
        // Duration for kick
        const duration = 0.15;
        
        // Frequency envelope for pitch drop
        osc.frequency.setValueAtTime(150, context.currentTime);
        osc.frequency.exponentialRampToValueAtTime(55, context.currentTime + 0.08);
        
        // Amplitude envelope
        gainNode.gain.setValueAtTime(0, context.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.7, context.currentTime + 0.01); // Fast attack
        gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + duration); // Decay
        
        // Start and stop oscillator
        osc.start(context.currentTime);
        osc.stop(context.currentTime + duration + 0.01);
        
        // Store for cleanup
        this.oscillators.push(osc);
      };
      
      const createSnare = () => {
        // Combine noise and oscillator for snare
        
        // 1. Noise component (for the snare "rattle")
        const bufferSize = context.sampleRate * 0.2; // 200ms buffer
        const noiseBuffer = context.createBuffer(1, bufferSize, context.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
          output[i] = Math.random() * 2 - 1;
        }
        
        const noiseSource = context.createBufferSource();
        noiseSource.buffer = noiseBuffer;
        
        // Filter for noise
        const noiseFilter = context.createBiquadFilter();
        noiseFilter.type = 'highpass';
        noiseFilter.frequency.value = 1000;
        
        // Gain for noise
        const noiseGain = context.createGain();
        noiseGain.gain.value = 0;
        
        // Connect noise path
        noiseSource.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        
        // 2. Tonal component (for the snare "body")
        const osc = context.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = 180;
        
        const oscGain = context.createGain();
        oscGain.gain.value = 0;
        
        // Connect oscillator path
        osc.connect(oscGain);
        
        // Create panner for stereo image
        const panner = context.createStereoPanner();
        panner.pan.value = 0;
        
        // Connect both paths to panner
        noiseGain.connect(panner);
        oscGain.connect(panner);
        
        // Connect to percussion gain
        panner.connect(percussionGain);
        
        // Duration
        const duration = 0.2;
        
        // Envelopes
        // Noise envelope (longer)
        noiseGain.gain.setValueAtTime(0, context.currentTime);
        noiseGain.gain.linearRampToValueAtTime(0.5, context.currentTime + 0.005);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, context.currentTime + duration);
        
        // Oscillator envelope (shorter)
        oscGain.gain.setValueAtTime(0, context.currentTime);
        oscGain.gain.linearRampToValueAtTime(0.3, context.currentTime + 0.005);
        oscGain.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.1);
        
        // Start and stop
        noiseSource.start(context.currentTime);
        osc.start(context.currentTime);
        
        noiseSource.stop(context.currentTime + duration + 0.01);
        osc.stop(context.currentTime + duration + 0.01);
        
        // Store for cleanup
        this.ambientSources.push(noiseSource);
        this.oscillators.push(osc);
      };
      
      // Create percussion pattern based on mood
      let pattern = [];
      let currentBeat = 0;
      
      switch (this.mood) {
        case 'uplifting':
          // More energetic pattern with kick on 1 and 3, snare on 2 and 4
          pattern = [
            { beat: 0, instruments: ['kick'] },
            { beat: 0.5, instruments: ['hihat'] },
            { beat: 1, instruments: ['snare'] },
            { beat: 1.5, instruments: ['hihat'] },
            { beat: 2, instruments: ['kick'] },
            { beat: 2.5, instruments: ['hihat'] },
            { beat: 3, instruments: ['snare'] },
            { beat: 3.5, instruments: ['hihat'] }
          ];
          break;
          
        case 'warm':
          // Gentle but rhythmic pattern
          pattern = [
            { beat: 0, instruments: ['kick'] },
            { beat: 1, instruments: ['snare'] },
            { beat: 1.75, instruments: ['hihat'] },
            { beat: 2, instruments: ['kick'] },
            { beat: 3, instruments: ['snare'] },
            { beat: 3.5, instruments: ['hihat'] }
          ];
          break;
          
        case 'soft':
          // Very subtle pattern, mainly hi-hats
          pattern = [
            { beat: 0, instruments: ['kick'] },
            { beat: 1, instruments: ['hihat'] },
            { beat: 2, instruments: ['hihat'] },
            { beat: 3, instruments: ['hihat'] }
          ];
          break;
          
        default:
          // Default simple pattern
          pattern = [
            { beat: 0, instruments: ['kick'] },
            { beat: 1, instruments: ['hihat'] },
            { beat: 2, instruments: ['snare'] },
            { beat: 3, instruments: ['hihat'] }
          ];
      }
      
      // Find pattern length in beats
      const patternLength = Math.max(...pattern.map(p => p.beat)) + 1;
      
      // Schedule initial pattern playback
      const schedulePattern = () => {
        // Find events at current beat
        const events = pattern.filter(p => Math.abs(p.beat - currentBeat) < 0.01);
        
        // Play each instrument for matching events
        events.forEach(event => {
          event.instruments.forEach(instrument => {
            if (instrument === 'kick') createKick();
            else if (instrument === 'snare') createSnare();
            else if (instrument === 'hihat') createHiHat();
          });
        });
        
        // Advance beat position
        currentBeat = (currentBeat + 0.5) % patternLength;
        
        // Schedule next beat
        this.percussionPattern = setTimeout(() => {
          if (this.isPlaying) {
            schedulePattern();
          }
        }, beatDuration * 500); // 8th notes (half a beat)
      };
      
      // Start pattern
      schedulePattern();
    }
  }