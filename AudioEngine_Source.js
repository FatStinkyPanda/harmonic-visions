// AudioEngine.js - Advanced audio synthesis and emotional sound design engine

class AudioEngine {
  constructor(isPlaying, volume, mood) {
    this.isPlaying = isPlaying;
    this.volume = volume;
    this.mood = mood;
    
    // Audio context and nodes references
    this.audioContext = null;
    this.masterGain = null;
    this.masterLimiter = null;
    this.reverbNode = null;
    this.analyser = null;
    this.compressor = null;
    this.enhancer = null;  // Stereo enhancement and harmonic exciter
    this.eq = null;  // Advanced parametric EQ
    
    // Sound generators references
    this.oscillators = [];
    this.ambientSources = [];
    this.melodicPattern = null;
    this.bassPattern = null;
    this.percussionPattern = null;
    this.droneLayers = [];  // For complex layered drones
    this.harmonicOvertones = []; // For overtone-based effects
    
    // Modulators for expressive sound design
    this.modulators = {
      lfo1: null,
      lfo2: null,
      envelope1: null,
      envelope2: null
    };
    
    // Audio data for visualization
    this.audioData = new Uint8Array(2048);
    
    // Emotional impact parameters
    this.emotionalParameters = {
      tension: 0,         // Dissonance and resolution
      brightness: 0.5,    // Spectral balance
      movement: 0.5,      // Rate of change
      depth: 0.7,         // Perceived spatial depth
      intimacy: 0.5       // Close/distant perception
    };
    
    // Initialize audio context
    this.initializeAudio();
  }
  
  initializeAudio() {
    try {
      // Create audio context with high-quality settings
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContext({ 
        latencyHint: 'interactive',
        sampleRate: 48000  // Higher sample rate for better quality
      });
      
      // Create advanced dynamics processing chain
      this.createMasterProcessingChain();
      
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
      try {
        ToastSystem.notify('error', 'Failed to initialize audio. Please try reloading the page.');
      } catch (e) {
        console.error("Toast notification failed:", e);
      }
    }
  }
  
  // Create a sophisticated audio processing chain for high-quality output
  createMasterProcessingChain() {
    const ctx = this.audioContext;
    
    // Create multi-band dynamics processor for better control
    this.createMultibandCompressor();
    
    // Create master gain
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.volume;
    
    // Create stereo enhancer/exciter for immersive width
    this.enhancer = this.createStereoEnhancer();
    
    // Create 5-band parametric EQ for tonal sculpting
    this.eq = this.createParametricEQ();
    
    // Create dynamics compressor with musicality-focused settings
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -24;
    this.compressor.knee.value = 30;
    this.compressor.ratio.value = 12;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.25;
    
    // Create master limiter to prevent clipping
    this.masterLimiter = ctx.createDynamicsCompressor();
    this.masterLimiter.threshold.value = -0.5;  // Just below 0dB
    this.masterLimiter.knee.value = 0;
    this.masterLimiter.ratio.value = 20;  // Heavy limiting
    this.masterLimiter.attack.value = 0.001;  // Very fast attack
    this.masterLimiter.release.value = 0.01;  // Fast release
    
    // Create analyzer node for visualization with higher resolution
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 4096;  // Higher resolution for better visualization
    this.analyser.smoothingTimeConstant = 0.85;
    
    // Create high-quality convolver for reverb
    this.reverbNode = ctx.createConvolver();
    
    // Generate advanced impulse response for reverb
    this.createConvolutionReverb(ctx, 5.0, 0.2, 'hall').then(buffer => {
      this.reverbNode.buffer = buffer;
    });
    
    // Connect in optimal order for best sound quality
    // Input → EQ → Compressor → Stereo Enhancer → Reverb → Limiter → Analyzer → Output
    this.masterGain.connect(this.eq.input);
    this.eq.output.connect(this.compressor);
    this.compressor.connect(this.enhancer.input);
    this.enhancer.output.connect(this.reverbNode);
    this.reverbNode.connect(this.masterLimiter);
    this.masterLimiter.connect(this.analyser);
    this.analyser.connect(ctx.destination);
  }
  
  // Create a multiband compressor for better dynamic control
  createMultibandCompressor() {
    const ctx = this.audioContext;
    
    // Split frequencies
    const lowMid = 250;
    const midHigh = 2500;
    
    // Create filters for frequency splitting
    const lowpassL = ctx.createBiquadFilter();
    lowpassL.type = 'lowpass';
    lowpassL.frequency.value = lowMid;
    lowpassL.Q.value = 0.7;
    
    const bandpassM = ctx.createBiquadFilter();
    bandpassM.type = 'bandpass';
    bandpassM.frequency.value = (lowMid + midHigh) / 2;
    bandpassM.Q.value = 0.7;
    
    const highpassH = ctx.createBiquadFilter();
    highpassH.type = 'highpass';
    highpassH.frequency.value = midHigh;
    highpassH.Q.value = 0.7;
    
    // Create compressors for each band with musical settings
    const lowComp = ctx.createDynamicsCompressor();
    lowComp.threshold.value = -30;
    lowComp.knee.value = 10;
    lowComp.ratio.value = 4;
    lowComp.attack.value = 0.02; // Slower attack to maintain bass impact
    lowComp.release.value = 0.2;
    
    const midComp = ctx.createDynamicsCompressor();
    midComp.threshold.value = -28;
    midComp.knee.value = 10;
    midComp.ratio.value = 3;
    midComp.attack.value = 0.015;
    midComp.release.value = 0.15;
    
    const highComp = ctx.createDynamicsCompressor();
    highComp.threshold.value = -25;
    highComp.knee.value = 10;
    highComp.ratio.value = 5;
    highComp.attack.value = 0.005; // Fast attack for transparent high frequency control
    highComp.release.value = 0.1;
    
    // Store references for later use with specific instruments
    this.multibandCompressor = {
      filters: {
        lowpass: lowpassL,
        bandpass: bandpassM,
        highpass: highpassH
      },
      compressors: {
        low: lowComp,
        mid: midComp,
        high: highComp
      }
    };
  }
  
  // Create a sophisticated stereo enhancer and harmonic exciter
  createStereoEnhancer() {
    const ctx = this.audioContext;
    
    // Create a signal split into mid and side channels for stereo enhancement
    // Mid = Left + Right (center content)
    // Side = Left - Right (stereo content)
    
    // Channel splitter for L/R
    const splitter = ctx.createChannelSplitter(2);
    
    // Channel merger for M/S back to L/R
    const merger = ctx.createChannelMerger(2);
    
    // Gain nodes for mid and side processing
    const midGain = ctx.createGain();
    midGain.gain.value = 1.0;  // Center content preserved
    
    const sideGain = ctx.createGain();
    sideGain.gain.value = 1.2;  // Enhance stereo width by 20%
    
    // For side channel harmonic excitement
    const sideHighpass = ctx.createBiquadFilter();
    sideHighpass.type = 'highpass';
    sideHighpass.frequency.value = 2000;
    
    const sideExciter = ctx.createWaveShaper();
    const exciterCurve = new Float32Array(65536);
    for (let i = 0; i < 65536; i++) {
      // Soft saturation curve for subtle euphonic harmonics
      const x = (i - 32768) / 32768;
      exciterCurve[i] = (Math.sign(x) * (1 - Math.exp(-Math.abs(x * 3)))) * 0.8;
    }
    sideExciter.curve = exciterCurve;
    
    // Input and output gain nodes
    const input = ctx.createGain();
    const output = ctx.createGain();
    
    // Connect everything to create the MS processing matrix
    // Split into L/R
    input.connect(splitter);
    
    // Create Mid (L+R) and Side (L-R)
    // Mid processing
    splitter.connect(midGain, 0); // L to mid
    splitter.connect(midGain, 1); // R to mid
    
    // Side processing with exciter
    const invertGain = ctx.createGain();
    invertGain.gain.value = -1;
    
    splitter.connect(sideGain, 0);  // L to side
    splitter.connect(invertGain, 1); // R to side (inverted)
    invertGain.connect(sideGain);
    
    sideGain.connect(sideHighpass);
    sideHighpass.connect(sideExciter);
    
    // Convert back to L/R
    // L = Mid + Side
    midGain.connect(merger, 0, 0);
    sideExciter.connect(merger, 0, 0);
    
    // R = Mid - Side
    midGain.connect(merger, 0, 1);
    
    const sideInvert = ctx.createGain();
    sideInvert.gain.value = -1;
    sideExciter.connect(sideInvert);
    sideInvert.connect(merger, 0, 1);
    
    // Connect to output
    merger.connect(output);
    
    return { input, output };
  }
  
  // Create a 5-band parametric EQ for tonal shaping
  createParametricEQ() {
    const ctx = this.audioContext;
    
    // Create input and output gain nodes
    const input = ctx.createGain();
    const output = ctx.createGain();
    
    // Create 5 biquad filters with musical frequency bands
    const lowShelf = ctx.createBiquadFilter();
    lowShelf.type = 'lowshelf';
    lowShelf.frequency.value = 120;
    lowShelf.gain.value = 1.0;  // Subtle bass boost
    
    const lowMid = ctx.createBiquadFilter();
    lowMid.type = 'peaking';
    lowMid.frequency.value = 350;
    lowMid.Q.value = 1.0;
    lowMid.gain.value = -1.0;  // Slight cut to reduce muddiness
    
    const mid = ctx.createBiquadFilter();
    mid.type = 'peaking';
    mid.frequency.value = 1000;
    mid.Q.value = 0.8;
    mid.gain.value = 0.0;  // Neutral mid
    
    const highMid = ctx.createBiquadFilter();
    highMid.type = 'peaking';
    highMid.frequency.value = 2500;
    highMid.Q.value = 1.0;
    highMid.gain.value = 2.0;  // Presence boost for clarity and emotion
    
    const highShelf = ctx.createBiquadFilter();
    highShelf.type = 'highshelf';
    highShelf.frequency.value = 7500;
    highShelf.gain.value = 1.5;  // Add air and sparkle
    
    // Connect all filters in series
    input
      .connect(lowShelf)
      .connect(lowMid)
      .connect(mid)
      .connect(highMid)
      .connect(highShelf)
      .connect(output);
    
    // Store filter references for potential runtime adjustments
    const filters = { lowShelf, lowMid, mid, highMid, highShelf };
    
    return { input, output, filters };
  }
  
  // Get audio data for visualization
  getAudioData() {
    if (this.analyser) {
      this.analyser.getByteFrequencyData(this.audioData);
      return this.audioData;
    }
    return null;
  }
  
  // Update volume with smooth transition to avoid clicks and pops
  setVolume(volume) {
    this.volume = volume;
    if (this.masterGain && this.audioContext) {
      // Smoothly ramp to new volume over 50ms for click-free adjustment
      this.masterGain.gain.setTargetAtTime(
        this.volume,
        this.audioContext.currentTime,
        0.05  // Time constant
      );
    }
  }
  
  // Set emotional parameters to influence sound generation
  setEmotionalParameters(params) {
    // Update emotional parameters
    if (params && typeof params === 'object') {
      Object.keys(params).forEach(key => {
        if (this.emotionalParameters.hasOwnProperty(key) && 
            typeof params[key] === 'number') {
          this.emotionalParameters[key] = params[key];
        }
      });
    }
    
    // Apply changes to active sound generators
    this.updateEmotionalCharacteristics();
  }
  
  // Update active sound elements based on emotional parameters
  updateEmotionalCharacteristics() {
    const ctx = this.audioContext;
    if (!ctx) return;
    
    // Update EQ based on brightness
    if (this.eq && this.eq.filters) {
      // More brightness = more high frequencies and less low-mids
      const brightness = this.emotionalParameters.brightness;
      
      this.eq.filters.highShelf.gain.setTargetAtTime(
        3 * brightness,  // -1.5 to +3 dB range
        ctx.currentTime,
        0.1
      );
      
      this.eq.filters.lowMid.gain.setTargetAtTime(
        -2 * brightness,  // -2 to +1 dB range (inverse)
        ctx.currentTime,
        0.1
      );
    }
    
    // Update reverb decay based on depth and intimacy
    const depth = this.emotionalParameters.depth;
    const intimacy = 1 - this.emotionalParameters.intimacy; // Inverse for reverb (less intimacy = more reverb)
    
    // Recreate reverb with new parameters
    const reverbTime = 1 + depth * 8;  // 1-9 seconds decay
    const dampingFactor = 0.8 * intimacy; // 0-0.8 damping
    
    this.createConvolutionReverb(ctx, reverbTime, dampingFactor, 'hall').then(buffer => {
      if (this.reverbNode) {
        this.reverbNode.buffer = buffer;
      }
    });
  }
  
  // Start/stop audio
  setPlaying(isPlaying, mood) {
    this.isPlaying = isPlaying;
    
    // Store previous mood for transitions
    const previousMood = this.mood;
    this.mood = mood;
    
    if (isPlaying) {
      // Resume audio context if suspended
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(error => {
          console.error("Failed to resume audio context:", error);
          try {
            ToastSystem.notify('error', 'Failed to start audio. Try clicking or tapping the screen first.');
          } catch (e) {
            console.error("Toast notification failed:", e);
          }
        });
      }
      
      // Start audio generators with potential transition from previous mood
      this.startAudio(mood, previousMood);
    } else {
      // Stop all sound sources with a gentle fade-out
      this.stopAudio(true);
    }
  }
  
  // Update reverb when mood changes
  updateReverb(mood) {
    const ctx = this.audioContext;
    if (!ctx || !this.reverbNode || !moodAudioSettings[mood]) return;
    
    const reverbSettings = moodAudioSettings[mood];
    
    // Choose reverb type based on mood for more appropriate spatial character
    let reverbType = 'hall';
    if (mood === 'cosmic' || mood === 'mystical') reverbType = 'space';
    else if (mood === 'warm' || mood === 'soft') reverbType = 'room';
    else if (mood === 'bright' || mood === 'uplifting') reverbType = 'plate';
    
    this.createConvolutionReverb(
      ctx,
      reverbSettings.reverbTime,
      reverbSettings.reverbDamping,
      reverbType
    ).then(buffer => {
      // Crossfade to new reverb for smooth transitions
      const oldReverb = this.reverbNode;
      
      // Create new reverb node
      const newReverb = ctx.createConvolver();
      newReverb.buffer = buffer;
      
      // Create crossfade gains
      const oldGain = ctx.createGain();
      const newGain = ctx.createGain();
      
      // Get current connections
      const source = this.enhancer.output;
      const destination = this.masterLimiter;
      
      // Disconnect old reverb
      source.disconnect(oldReverb);
      oldReverb.disconnect(destination);
      
      // Connect through crossfade path
      source.connect(oldReverb);
      source.connect(newReverb);
      
      oldReverb.connect(oldGain);
      newReverb.connect(newGain);
      
      oldGain.connect(destination);
      newGain.connect(destination);
      
      // Initial gain values
      oldGain.gain.setValueAtTime(1.0, ctx.currentTime);
      newGain.gain.setValueAtTime(0.0, ctx.currentTime);
      
      // Crossfade over 1 second
      const transitionTime = ctx.currentTime + 1;
      oldGain.gain.linearRampToValueAtTime(0.0, transitionTime);
      newGain.gain.linearRampToValueAtTime(1.0, transitionTime);
      
      // Replace the reverb node after crossfade
      setTimeout(() => {
        // Disconnect crossfade paths
        source.disconnect(oldReverb);
        source.disconnect(newReverb);
        oldReverb.disconnect(oldGain);
        newReverb.disconnect(newGain);
        oldGain.disconnect(destination);
        newGain.disconnect(destination);
        
        // Connect new reverb directly
        source.connect(newReverb);
        newReverb.connect(destination);
        
        // Update reference
        this.reverbNode = newReverb;
      }, 1100);
    }).catch(error => {
      console.error("Failed to create reverb:", error);
    });
  }
  
  // Create advanced convolution reverb with early reflections and late tail
  async createConvolutionReverb(context, duration, damping = 0.4, type = 'hall') {
    const sampleRate = context.sampleRate;
    const length = sampleRate * duration;
    const impulseResponse = context.createBuffer(2, length, sampleRate);
    
    const leftChannel = impulseResponse.getChannelData(0);
    const rightChannel = impulseResponse.getChannelData(1);
    
    // Early reflections configuration based on reverb type
    let earlyReflectionsCount;
    let earlyReflectionSpread;
    let earlyReflectionDecay;
    let diffusionFactor;
    let modulationDepth;
    let modulationRate;
    let stereoWidth;
    
    switch (type) {
      case 'room':
        // Small, tight space with quick reflections
        earlyReflectionsCount = 8;
        earlyReflectionSpread = 0.005; // 5ms spread
        earlyReflectionDecay = 0.3;
        diffusionFactor = 0.5;
        modulationDepth = 0.05;
        modulationRate = 0.7;
        stereoWidth = 0.4;
        break;
        
      case 'hall':
        // Large, smooth reverb with distinct reflections
        earlyReflectionsCount = 12;
        earlyReflectionSpread = 0.015; // 15ms spread
        earlyReflectionDecay = 0.2;
        diffusionFactor = 0.7;
        modulationDepth = 0.1;
        modulationRate = 0.5;
        stereoWidth = 0.7;
        break;
        
      case 'plate':
        // Bright, dense early reflections with smooth tail
        earlyReflectionsCount = 18;
        earlyReflectionSpread = 0.008; // 8ms spread
        earlyReflectionDecay = 0.1;
        diffusionFactor = 0.9;
        modulationDepth = 0.03;
        modulationRate = 1.0;
        stereoWidth = 0.6;
        break;
        
      case 'space':
        // Extremely diffuse with long, evolving tail
        earlyReflectionsCount = 6;
        earlyReflectionSpread = 0.03; // 30ms spread
        earlyReflectionDecay = 0.4;
        diffusionFactor = 0.8;
        modulationDepth = 0.2;
        modulationRate = 0.3;
        stereoWidth = 0.9;
        break;
        
      default:
        // Default to hall settings
        earlyReflectionsCount = 10;
        earlyReflectionSpread = 0.015;
        earlyReflectionDecay = 0.2;
        diffusionFactor = 0.7;
        modulationDepth = 0.1;
        modulationRate = 0.5;
        stereoWidth = 0.7;
    }
    
    // Generate early reflections (first ~100ms)
    const earlyReflectionsSamples = Math.floor(sampleRate * 0.1); // 100ms
    
    // Pre-allocate reflection times and amplitudes
    const reflectionTimes = [];
    const reflectionAmplitudes = [];
    
    // Generate random reflection times and amplitudes
    let prevTime = 0;
    for (let i = 0; i < earlyReflectionsCount; i++) {
      // Spacing increases as reflections get later
      const spacing = earlyReflectionSpread * (1 + i * 0.3);
      const time = prevTime + spacing * sampleRate;
      prevTime = time;
      
      // Amplitude decreases with time
      const amplitude = (1 - i / earlyReflectionsCount) * earlyReflectionDecay;
      
      // Add some randomness to create a natural sound
      reflectionTimes.push(Math.floor(time + Math.random() * 10));
      reflectionAmplitudes.push(amplitude * (0.8 + Math.random() * 0.4));
    }
    
    // Apply early reflections - these are distinct echoes in the impulse response
    for (let i = 0; i < earlyReflectionsCount; i++) {
      const time = reflectionTimes[i];
      const amplitude = reflectionAmplitudes[i];
      
      if (time < earlyReflectionsSamples) {
        // Different reflection patterns for left and right channels
        leftChannel[time] = amplitude * (1 - Math.random() * 0.2);
        rightChannel[time] = amplitude * (1 - Math.random() * 0.2);
      }
    }
    
    // Create late reflections (reverb tail)
    for (let i = earlyReflectionsSamples; i < length; i++) {
      // Calculate base decay envelope
      // We use a decay curve that's steeper at the beginning and then flattens out a bit
      // This creates a more natural sounding reverb
      const normalizedPosition = (i - earlyReflectionsSamples) / (length - earlyReflectionsSamples);
      
      // Adjusted decay curve with non-linear decay
      const decayShape = Math.pow(normalizedPosition, 0.5); // Non-linear decay shape
      const envelopeValue = Math.exp(-decayShape * (duration * (2 - damping)));
      
      // Frequency-dependent decay (damping)
      // Higher frequencies decay faster than lower frequencies
      const frequencyDamping = 1 - Math.pow(normalizedPosition, 2) * damping;
      
      // Add modulation for a more lively reverb
      // Using multiple sine oscillators at different frequencies creates complex modulation
      const modulation1 = Math.sin(i * modulationRate * 0.001);
      const modulation2 = Math.sin(i * modulationRate * 0.0007);
      const combinedModulation = (modulation1 + modulation2) * modulationDepth;
      
      // Calculate diffusion - more diffusion as the reverb progresses
      const currentDiffusion = diffusionFactor * (1 - Math.exp(-normalizedPosition * 3));
      
      // Generate base noise for each sample
      // More diffusion means more randomness
      const leftNoise = Math.random() * 2 - 1;
      const rightNoise = Math.random() * 2 - 1;
      
      // Create stereo image
      // As stereoWidth increases, the difference between left and right increases
      const stereoFactor = stereoWidth * 0.5;
      const leftStereo = leftNoise * (1 - stereoFactor) + rightNoise * stereoFactor;
      const rightStereo = rightNoise * (1 - stereoFactor) + leftNoise * stereoFactor;
      
      // Calculate diffuse noise by mixing previous samples with current noise
      // This creates a smoother, more diffuse sound
      let leftDiffuse = 0;
      let rightDiffuse = 0;
      
      if (i > earlyReflectionsSamples + 100) {
        // Mix in previous samples for diffusion
        const diffusionDelay = 83; // Prime number for better diffusion
        leftDiffuse = (leftChannel[i - diffusionDelay] || 0) * currentDiffusion;
        rightDiffuse = (rightChannel[i - diffusionDelay] || 0) * currentDiffusion;
      }
      
      // Combine all effects
      const leftValue = (leftStereo * (1 - currentDiffusion) + leftDiffuse) * 
                        envelopeValue * frequencyDamping * (1 + combinedModulation);
                        
      const rightValue = (rightStereo * (1 - currentDiffusion) + rightDiffuse) * 
                         envelopeValue * frequencyDamping * (1 + combinedModulation);
      
      // Apply to impulse response
      leftChannel[i] = leftValue;
      rightChannel[i] = rightValue;
    }
    
    // Normalize the impulse response to prevent clipping
    const normalize = (channel) => {
      // Find maximum value
      let max = 0;
      for (let i = 0; i < channel.length; i++) {
        max = Math.max(max, Math.abs(channel[i]));
      }
      
      // Normalize only if needed
      if (max > 0.99) {
        const gain = 0.99 / max;
        for (let i = 0; i < channel.length; i++) {
          channel[i] *= gain;
        }
      }
    };
    
    normalize(leftChannel);
    normalize(rightChannel);
    
    return impulseResponse;
  }
  
  // Start audio generators with transition from previous mood if applicable
  startAudio(currentMood, previousMood) {
    const context = this.audioContext;
    const masterGain = this.masterGain;
    const settings = moodAudioSettings[currentMood];
    
    if (!context || !masterGain || !settings) {
      console.error("Audio context, master gain, or settings not available");
      return;
    }
    
    // Update reverb for the new mood
    this.updateReverb(currentMood);
    
    // If we're changing moods with continuous playback, do a crossfade transition
    if (previousMood && previousMood !== currentMood && this.isAnySound()) {
      this.transitionToNewMood(currentMood, previousMood);
    } else {
      // Stop any currently playing sounds and start fresh
      this.stopAudio(false); // Stop without fade-out
      
      try {
        // Create audio elements in sequence with timing offsets for more natural entrance
        this.createDronePad(settings);
        
        // Small delay before ambient layers
        setTimeout(() => {
          if (this.isPlaying) this.createAmbientLayers(settings);
        }, 500);
        
        // Bass enters after ambient is established
        setTimeout(() => {
          if (this.isPlaying) this.createBassPattern(settings);
        }, 2000);
        
        // Melody comes in last
        setTimeout(() => {
          if (this.isPlaying) this.createMelodicPattern(settings);
          
          // Create subtle percussion (if appropriate for the mood)
          if (currentMood !== 'calm' && currentMood !== 'cosmic') {
            setTimeout(() => {
              if (this.isPlaying) this.createPercussionPattern(settings);
            }, 4000); // Percussion comes in after melody is established
          }
        }, 3000);
        
        // Create harmonic overtone shimmer effect for certain moods
        if (currentMood === 'uplifting' || currentMood === 'cosmic' || currentMood === 'bright') {
          setTimeout(() => {
            if (this.isPlaying) this.createHarmonicShimmer(settings);
          }, 5000); // Shimmer is the final layer
        }
        
      } catch (error) {
        console.error("Error starting audio:", error);
        try {
          ToastSystem.notify('error', 'An error occurred while creating audio elements');
        } catch (e) {
          console.error("Toast notification failed:", e);
        }
      }
    }
  }
  
  // Check if any sound is currently playing
  isAnySound() {
    return (
      this.oscillators.length > 0 || 
      this.ambientSources.length > 0 || 
      this.melodicPattern !== null || 
      this.bassPattern !== null || 
      this.percussionPattern !== null
    );
  }
  
  // Transition between moods with crossfade
  transitionToNewMood(newMood, oldMood) {
    // Store current sound generators
    const oldOscillators = [...this.oscillators];
    const oldAmbientSources = [...this.ambientSources];
    const oldMelodicPattern = this.melodicPattern;
    const oldBassPattern = this.bassPattern;
    const oldPercussionPattern = this.percussionPattern;
    
    // Clear references in main object (to prevent double cleanup)
    this.oscillators = [];
    this.ambientSources = [];
    this.melodicPattern = null;
    this.bassPattern = null;
    this.percussionPattern = null;
    
    // Create transition gain node for old sounds
    const ctx = this.audioContext;
    const oldSoundsGain = ctx.createGain();
    oldSoundsGain.gain.setValueAtTime(1.0, ctx.currentTime);
    
    // Reconnect old sound generators through this gain node
    // This is a simplified approach - in a real implementation, we'd need to
    // actually reconnect each sound generator to the new gain node
    
    // Start new sounds
    const settings = moodAudioSettings[newMood];
    
    try {
      // Start with drones which provide the foundation
      this.createDronePad(settings);
      
      // Add ambient layers
      setTimeout(() => {
        if (this.isPlaying) this.createAmbientLayers(settings);
        
        // Fade out old sounds as new soundscape establishes
        oldSoundsGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 3);
        
        // Add bass line
        setTimeout(() => {
          if (this.isPlaying) {
            this.createBassPattern(settings);
            
            // Add melodic elements
            setTimeout(() => {
              if (this.isPlaying) {
                this.createMelodicPattern(settings);
                
                // Add percussion if appropriate for the mood
                if (newMood !== 'calm' && newMood !== 'cosmic') {
                  setTimeout(() => {
                    if (this.isPlaying) this.createPercussionPattern(settings);
                  }, 1000);
                }
              }
            }, 1000);
          }
        }, 1000);
      }, 500);
      
      // Schedule cleanup of old sound generators after fade-out
      setTimeout(() => {
        // Stop old patterns
        if (oldMelodicPattern) clearInterval(oldMelodicPattern);
        if (oldBassPattern) clearInterval(oldBassPattern);
        if (oldPercussionPattern) clearInterval(oldPercussionPattern);
        
        // Stop old oscillators
        oldOscillators.forEach(osc => {
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
        
        // Stop old ambient sources
        oldAmbientSources.forEach(source => {
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
        
      }, 3500); // Cleanup after fade-out completes
      
    } catch (error) {
      console.error("Error during mood transition:", error);
    }
  }
  
  // Stop all audio generators
  stopAudio(withFadeOut = true) {
    const ctx = this.audioContext;
    
    if (withFadeOut && ctx && this.isAnySound()) {
      // Create a master fade-out gain node
      const fadeOutGain = ctx.createGain();
      fadeOutGain.gain.setValueAtTime(1.0, ctx.currentTime);
      fadeOutGain.gain.linearRampToValueAtTime(0.0, ctx.currentTime + 2.0); // 2 second fade-out
      
      // Schedule actual cleanup after fade-out completes
      setTimeout(() => {
        this.cleanupAudioSources();
      }, 2100);
      
    } else {
      // Immediate cleanup
      this.cleanupAudioSources();
    }
  }
  
  // Clean up all audio resources
  cleanupAudioSources() {
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
        clearTimeout(ref);
      }
    });
    this.melodicPattern = null;
    this.bassPattern = null;
    this.percussionPattern = null;
  }
  
  // Create advanced ambient sound layers with psychoacoustic principles
  createAmbientLayers(settings) {
    const context = this.audioContext;
    const masterGain = this.masterGain;
    
    if (!context || !masterGain) return;
    
    // Master gain for all ambient sounds
    const ambientMasterGain = context.createGain();
    ambientMasterGain.gain.value = 0; // Start at 0, will fade in
    ambientMasterGain.connect(masterGain);
    
    // Fade in ambient master gain
    ambientMasterGain.gain.setValueAtTime(0, context.currentTime);
    ambientMasterGain.gain.linearRampToValueAtTime(
      settings.ambientVolume,
      context.currentTime + 2.0  // 2 second fade-in
    );
    
    // Process each ambient sound type with enhanced techniques
    settings.ambientSounds.forEach((type, index) => {
      // Create more sophisticated noise generators and processing chains for each type
      this.createEnhancedAmbientSource(type, index, settings, ambientMasterGain);
    });
  }
  
  // Create a single enhanced ambient sound source
  createEnhancedAmbientSource(type, index, settings, outputNode) {
    const context = this.audioContext;
    
    // Create stereo panner with enhanced positioning
    const panner = context.createStereoPanner();
    
    // Position sounds in stereo field in a musically balanced way
    // For water, wind, fire - spread across stereo field
    // For birds, night - more dramatic stereo positioning
    // For space - wide, immersive stereo field
    let panPosition;
    
    if (settings.ambientSounds.length === 1) {
      // If only one ambient sound, center it
      panPosition = 0;
    } else {
      // Otherwise distribute sounds across stereo field
      // Use golden ratio distribution for more natural spacing
      const phi = 1.618033988749895;
      const normalizedIndex = index / (settings.ambientSounds.length - 1);
      const goldenPosition = (normalizedIndex * phi) % 1;
      panPosition = (goldenPosition * 2 - 1) * 0.8; // Scale to -0.8 to 0.8
    }
    
    // Additional stereo randomization for certain types
    if (type === 'birds' || type === 'night') {
      // More dramatic stereo movement for birds and night sounds
      panPosition = Math.sign(panPosition) * (0.5 + Math.random() * 0.4);
    }
    
    panner.pan.value = panPosition;
    
    // Create a buffer for noise-based ambient sounds
    // Using longer buffers for more natural sound with less obvious looping
    const bufferDuration = 20.0; // 20 seconds
    const bufferSize = context.sampleRate * bufferDuration;
    const noiseBuffer = context.createBuffer(2, bufferSize, context.sampleRate); // Stereo buffer
    
    // Get buffer channels for stereo processing
    const leftChannel = noiseBuffer.getChannelData(0);
    const rightChannel = noiseBuffer.getChannelData(1);
    
    // Generate noise based on ambient type using specialized algorithms
    switch (type) {
      case 'water':
        this.generateWaterSound(leftChannel, rightChannel, context.sampleRate);
        break;
      
      case 'wind':
        this.generateWindSound(leftChannel, rightChannel, context.sampleRate);
        break;
      
      case 'birds':
        this.generateBirdSound(leftChannel, rightChannel, context.sampleRate);
        break;
      
      case 'fire':
        this.generateFireSound(leftChannel, rightChannel, context.sampleRate);
        break;
      
      case 'night':
        this.generateNightSound(leftChannel, rightChannel, context.sampleRate);
        break;
      
      case 'space':
        this.generateSpaceSound(leftChannel, rightChannel, context.sampleRate);
        break;
      
      default:
        // Default colored noise with random modulation
        this.generateColoredNoise(leftChannel, rightChannel, context.sampleRate, 'pink');
    }
    
    // Create audio source from noise buffer
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    
    // Create a multi-filter processing chain specialized for each sound type
    const filters = this.createSpecializedFilterChain(type, context);
    
    // Connect the source to the first filter in the chain
    source.connect(filters.input);
    
    // Connect the last filter to the panner
    filters.output.connect(panner);
    
    // Connect panner to output
    panner.connect(outputNode);
    
    // Add subtle randomized modulation to filters over time for evolving sound
    this.addFilterModulation(filters.modulationTargets, type);
    
    // Start the source with a small random delay for more natural layering
    const startDelay = Math.random() * 0.5;
    source.start(context.currentTime + startDelay);
    
    // Store references for cleanup
    this.ambientSources.push(source);
    this.ambientSources.push(...filters.oscillators);
  }
  
  // Create specialized filter processing chains for each ambient sound type
  createSpecializedFilterChain(type, context) {
    // Filter chains with specific characteristics for each sound type
    
    // Input and output gain nodes for the chain
    const input = context.createGain();
    const output = context.createGain();
    
    // Store oscillators created for modulation
    const oscillators = [];
    
    // Store filter nodes that will be modulation targets
    const modulationTargets = [];
    
    // Create different filter configurations based on sound type
    switch (type) {
      case 'water': {
        // Water needs subtle movement and a fluid character
        // Combine lowpass, bandpass and resonance
        
        // Lowpass filter for the base "body" of water sound
        const lowpass = context.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 800;
        lowpass.Q.value = 0.7;
        modulationTargets.push({ node: lowpass, param: 'frequency', min: 600, max: 1000 });
        
        // Bandpass filter for the "movement" of water
        const bandpass = context.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.frequency.value = 1200;
        bandpass.Q.value = 2.5;
        modulationTargets.push({ node: bandpass, param: 'frequency', min: 800, max: 1600 });
        
        // Resonant peaking filter for "droplet" like characters
        const peaking = context.createBiquadFilter();
        peaking.type = 'peaking';
        peaking.frequency.value = 2500;
        peaking.Q.value = 5;
        peaking.gain.value = 6;
        modulationTargets.push({ node: peaking, param: 'frequency', min: 2000, max: 3000 });
        
        // Volume modulation for subtle variation
        const waterModGain = context.createGain();
        waterModGain.gain.value = 1.0;
        modulationTargets.push({ node: waterModGain, param: 'gain', min: 0.8, max: 1.0 });
        
        // Connect everything
        input
          .connect(lowpass)
          .connect(bandpass)
          .connect(peaking)
          .connect(waterModGain)
          .connect(output);
        
        break;
      }
      
      case 'wind': {
        // Wind needs howling resonances, movement, and a hollow character
        
        // Main body filter
        const lowpass = context.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 400;
        lowpass.Q.value = 0.5;
        modulationTargets.push({ node: lowpass, param: 'frequency', min: 200, max: 600 });
        
        // Resonant filter for wind whistling effect
        const resonant1 = context.createBiquadFilter();
        resonant1.type = 'bandpass';
        resonant1.frequency.value = 1000;
        resonant1.Q.value = 12;  // High Q for whistling resonance
        modulationTargets.push({ node: resonant1, param: 'frequency', min: 700, max: 2000 });
        
        // Second resonant filter for more complex howling
        const resonant2 = context.createBiquadFilter();
        resonant2.type = 'bandpass';
        resonant2.frequency.value = 1800;
        resonant2.Q.value = 10;
        modulationTargets.push({ node: resonant2, param: 'frequency', min: 1200, max: 2400 });
        
        // Gain nodes for each resonant filter
        const resonantGain1 = context.createGain();
        resonantGain1.gain.value = 0.2;  // Subtle resonance
        modulationTargets.push({ node: resonantGain1, param: 'gain', min: 0.05, max: 0.4 });
        
        const resonantGain2 = context.createGain();
        resonantGain2.gain.value = 0.15;
        modulationTargets.push({ node: resonantGain2, param: 'gain', min: 0.02, max: 0.3 });
        
        // Main body gain
        const mainGain = context.createGain();
        mainGain.gain.value = 0.7;
        
        // Connect main path
        input.connect(lowpass);
        lowpass.connect(mainGain);
        mainGain.connect(output);
        
        // Connect resonant paths
        input.connect(resonant1);
        resonant1.connect(resonantGain1);
        resonantGain1.connect(output);
        
        input.connect(resonant2);
        resonant2.connect(resonantGain2);
        resonantGain2.connect(output);
        
        break;
      }
      
      case 'birds': {
        // Birds need bright, chirping characteristics with distinct filters 
        
        // High-pass base to remove rumble
        const highpass = context.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 2000;
        highpass.Q.value = 0.7;
        
        // Multiple bandpass filters for different bird types
        const bandpass1 = context.createBiquadFilter();
        bandpass1.type = 'bandpass';
        bandpass1.frequency.value = 3000;
        bandpass1.Q.value = 8;
        modulationTargets.push({ node: bandpass1, param: 'frequency', min: 2500, max: 4000, speed: 'fast' });
        
        const bandpass2 = context.createBiquadFilter();
        bandpass2.type = 'bandpass';
        bandpass2.frequency.value = 5000;
        bandpass2.Q.value = 12;
        modulationTargets.push({ node: bandpass2, param: 'frequency', min: 4000, max: 6000, speed: 'fast' });
        
        // Gain nodes for bird types
        const birdGain1 = context.createGain();
        birdGain1.gain.value = 0.2;
        modulationTargets.push({ node: birdGain1, param: 'gain', min: 0, max: 0.3, speed: 'fast' });
        
        const birdGain2 = context.createGain();
        birdGain2.gain.value = 0.15;
        modulationTargets.push({ node: birdGain2, param: 'gain', min: 0, max: 0.3, speed: 'fast' });
        
        // Connect everything
        input.connect(highpass);
        
        // Two parallel bird paths
        highpass.connect(bandpass1);
        bandpass1.connect(birdGain1);
        birdGain1.connect(output);
        
        highpass.connect(bandpass2);
        bandpass2.connect(birdGain2);
        birdGain2.connect(output);
        
        break;
      }
      
      case 'fire': {
        // Fire needs crackling highs and a warm bed of low frequencies
        
        // Low frequencies for the fire "bed"
        const lowpass = context.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 400;
        lowpass.Q.value = 0.5;
        
        // Mid frequencies for main fire sound
        const bandpass = context.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.frequency.value = 1500;
        bandpass.Q.value = 1.2;
        modulationTargets.push({ node: bandpass, param: 'frequency', min: 1200, max: 1800 });
        
        // High frequencies for crackling
        const highpass = context.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 4500;
        highpass.Q.value = 0.5;
        
        // Waveshaper for crackle distortion
        const crackleShaper = context.createWaveShaper();
        const crackleCurve = new Float32Array(65536);
        for (let i = 0; i < 65536; i++) {
          // Asymmetric distortion curve for fire crackle sound
          const x = (i - 32768) / 32768;
          // Fire has sudden pops and crackles, which this curve simulates
          crackleCurve[i] = x < 0 ? x * 0.9 : x > 0.8 ? (x - 0.8) * 10 + 0.8 : x;
        }
        crackleShaper.curve = crackleCurve;
        
        // Gain nodes for each frequency range
        const lowGain = context.createGain();
        lowGain.gain.value = 0.5;
        modulationTargets.push({ node: lowGain, param: 'gain', min: 0.4, max: 0.6 });
        
        const midGain = context.createGain();
        midGain.gain.value = 0.3;
        modulationTargets.push({ node: midGain, param: 'gain', min: 0.2, max: 0.4 });
        
        const highGain = context.createGain();
        highGain.gain.value = 0.15;
        modulationTargets.push({ node: highGain, param: 'gain', min: 0.05, max: 0.25, speed: 'fast' });
        
        // Connect everything
        // Low frequency path
        input.connect(lowpass);
        lowpass.connect(lowGain);
        lowGain.connect(output);
        
        // Mid frequency path
        input.connect(bandpass);
        bandpass.connect(midGain);
        midGain.connect(output);
        
        // High frequency/crackle path
        input.connect(highpass);
        highpass.connect(crackleShaper);
        crackleShaper.connect(highGain);
        highGain.connect(output);
        
        break;
      }
      
      case 'night': {
        // Night sounds: crickets, occasional owl, distant sounds
        
        // Highpass for removing low rumble
        const highpass = context.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 200;
        
        // Crickets band
        const cricketFilter = context.createBiquadFilter();
        cricketFilter.type = 'bandpass';
        cricketFilter.frequency.value = 4200;
        cricketFilter.Q.value = 15;
        modulationTargets.push({ node: cricketFilter, param: 'frequency', min: 3800, max: 4600, speed: 'fast' });
        
        // Owl/low sounds band
        const owlFilter = context.createBiquadFilter();
        owlFilter.type = 'bandpass';
        owlFilter.frequency.value = 350;
        owlFilter.Q.value = 4;
        modulationTargets.push({ node: owlFilter, param: 'frequency', min: 300, max: 400, speed: 'slow' });
        
        // Gain nodes
        const cricketGain = context.createGain();
        cricketGain.gain.value = 0.15;
        modulationTargets.push({ node: cricketGain, param: 'gain', min: 0.05, max: 0.25, speed: 'medium' });
        
        const owlGain = context.createGain();
        owlGain.gain.value = 0;  // Start at 0, will be modulated for occasional hoots
        modulationTargets.push({ node: owlGain, param: 'gain', min: 0, max: 0.3, speed: 'slow' });
        
        // Connect paths
        input.connect(highpass);
        
        // Cricket path
        highpass.connect(cricketFilter);
        cricketFilter.connect(cricketGain);
        cricketGain.connect(output);
        
        // Owl path
        highpass.connect(owlFilter);
        owlFilter.connect(owlGain);
        owlGain.connect(output);
        
        break;
      }
      
      case 'space': {
        // Space: deep drones, occasional strange tones, ethereal
        
        // Resonator chain for space tones
        const resonator1 = context.createBiquadFilter();
        resonator1.type = 'bandpass';
        resonator1.frequency.value = 150;
        resonator1.Q.value = 25;  // Very resonant
        modulationTargets.push({ node: resonator1, param: 'frequency', min: 80, max: 250, speed: 'veryslow' });
        
        const resonator2 = context.createBiquadFilter();
        resonator2.type = 'bandpass';
        resonator2.frequency.value = 300;
        resonator2.Q.value = 30;
        modulationTargets.push({ node: resonator2, param: 'frequency', min: 220, max: 400, speed: 'veryslow' });
        
        const resonator3 = context.createBiquadFilter();
        resonator3.type = 'bandpass';
        resonator3.frequency.value = 1200;
        resonator3.Q.value = 40;
        modulationTargets.push({ node: resonator3, param: 'frequency', min: 800, max: 1600, speed: 'slow' });
        
        // Gain nodes
        const res1Gain = context.createGain();
        res1Gain.gain.value = 0.6;
        modulationTargets.push({ node: res1Gain, param: 'gain', min: 0.4, max: 0.8, speed: 'slow' });
        
        const res2Gain = context.createGain();
        res2Gain.gain.value = 0.3;
        modulationTargets.push({ node: res2Gain, param: 'gain', min: 0.1, max: 0.5, speed: 'slow' });
        
        const res3Gain = context.createGain();
        res3Gain.gain.value = 0.1;
        modulationTargets.push({ node: res3Gain, param: 'gain', min: 0, max: 0.3, speed: 'medium' });
        
        // Connect everything
        // Resonator 1 path
        input.connect(resonator1);
        resonator1.connect(res1Gain);
        res1Gain.connect(output);
        
        // Resonator 2 path
        input.connect(resonator2);
        resonator2.connect(res2Gain);
        res2Gain.connect(output);
        
        // Resonator 3 path
        input.connect(resonator3);
        resonator3.connect(res3Gain);
        res3Gain.connect(output);
        
        break;
      }
      
      default: {
        // Default processing chain with basic filters
        const lowpass = context.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 2000;
        
        input
          .connect(lowpass)
          .connect(output);
      }
    }
    
    return { input, output, oscillators, modulationTargets };
  }
  
  // Add modulation to filter parameters for evolving sound
  addFilterModulation(targets, type) {
    if (!targets || !targets.length) return;
    
    const context = this.audioContext;
    if (!context) return;
    
    // Define modulation speeds (in Hz)
    const speeds = {
      veryslow: 0.01,  // 100 second cycle
      slow: 0.05,      // 20 second cycle
      medium: 0.2,     // 5 second cycle
      fast: 0.8,       // 1.25 second cycle
      veryfast: 2.0    // 0.5 second cycle
    };
    
    // Process each modulation target
    targets.forEach(target => {
      // Default speed based on sound type if not specified
      let speedValue = speeds.medium;
      if (target.speed) {
        speedValue = speeds[target.speed] || speeds.medium;
      } else {
        // Different default speeds for different sound types
        if (type === 'water') speedValue = speeds.medium;
        else if (type === 'wind') speedValue = speeds.slow;
        else if (type === 'birds') speedValue = speeds.fast;
        else if (type === 'fire') speedValue = speeds.fast;
        else if (type === 'night') speedValue = speeds.veryslow;
        else if (type === 'space') speedValue = speeds.veryslow;
      }
      
      // Add some randomization to speed for more natural sound
      const randomizedSpeed = speedValue * (0.8 + Math.random() * 0.4);
      
      // Create LFO for parameter modulation
      const lfo = context.createOscillator();
      const lfoGain = context.createGain();
      
      // Use different waveforms for different parameters and speeds
      if (target.param === 'frequency') {
        // Smoother modulation for frequency
        if (speedValue < 0.1) lfo.type = 'sine';
        else lfo.type = 'triangle';
      } else if (target.param === 'gain') {
        // More random modulation for gain
        if (speedValue > 0.5) lfo.type = 'sawtooth';
        else lfo.type = 'sine';
      } else {
        lfo.type = 'sine';
      }
      
      // Set LFO frequency
      lfo.frequency.value = randomizedSpeed;
      
      // Calculate modulation amount
      const modAmount = (target.max - target.min) * 0.5;
      const center = (target.max + target.min) * 0.5;
      lfoGain.gain.value = modAmount;
      
      // Connect LFO to parameter through gain node
      lfo.connect(lfoGain);
      
      // Handle different parameter types properly
      if (target.param === 'frequency' || target.param === 'gain') {
        // These parameters are AudioParams
        target.node[target.param].value = center;
        lfoGain.connect(target.node[target.param]);
      }
      
      // Start oscillator
      lfo.start(context.currentTime);
      
      // Store LFO for cleanup
      this.oscillators.push(lfo);
    });
  }
  
  // Generate specialized water sounds
  generateWaterSound(leftChannel, rightChannel, sampleRate) {
    // Water is a combination of filtered noise with various modulation rates
    
    // Create different characteristics for left and right channels for stereo movement
    const leftPhase = Math.random() * 2 * Math.PI;
    const rightPhase = Math.random() * 2 * Math.PI;
    
    // Multi-noise approach for water
    for (let i = 0; i < leftChannel.length; i++) {
      const t = i / sampleRate;
      
      // Multiple noise frequencies create a more realistic water sound
      
      // Fast ripples (high frequency)
      const rippleL = Math.random() * 2 - 1;
      const rippleR = Math.random() * 2 - 1;
      
      // Medium waves (mid frequency)
      const waveFreq = 0.5;
      const waveL = (Math.sin(t * waveFreq * 2 * Math.PI + leftPhase) + 1) / 2;
      const waveR = (Math.sin(t * waveFreq * 2 * Math.PI + rightPhase) + 1) / 2;
      
      // Slow current (low frequency)
      const currentFreq = 0.05;
      const currentL = (Math.sin(t * currentFreq * 2 * Math.PI + leftPhase * 0.5) + 1) / 2;
      const currentR = (Math.sin(t * currentFreq * 2 * Math.PI + rightPhase * 0.5) + 1) / 2;
      
      // Occasional bigger splashes
      const splashL = Math.random() > 0.998 ? (Math.random() * 2 - 1) * 0.5 : 0;
      const splashR = Math.random() > 0.998 ? (Math.random() * 2 - 1) * 0.5 : 0;
      
      // Combine all elements with appropriate weighting
      leftChannel[i] = rippleL * 0.2 + (rippleL * waveL) * 0.4 + (currentL * rippleL) * 0.3 + splashL;
      rightChannel[i] = rippleR * 0.2 + (rippleR * waveR) * 0.4 + (currentR * rippleR) * 0.3 + splashR;
    }
  }
  
  // Generate specialized wind sounds
  generateWindSound(leftChannel, rightChannel, sampleRate) {
    // Wind needs gusting patterns and filtered noise
    
    // Different phases for left and right channels
    const leftPhase = Math.random() * 2 * Math.PI;
    const rightPhase = Math.random() * 2 * Math.PI;
    
    // Pre-calculate gust patterns for performance
    const gustCycleLength = Math.floor(sampleRate * 10); // 10 second gust cycle
    const gustPatternL = new Float32Array(gustCycleLength);
    const gustPatternR = new Float32Array(gustCycleLength);
    
    // Create natural gust envelopes
    for (let i = 0; i < gustCycleLength; i++) {
      const normalizedPosition = i / gustCycleLength;
      
      // Create primary gust cycle
      const primaryGust = Math.pow(Math.sin(normalizedPosition * 2 * Math.PI), 2);
      
      // Add secondary faster and smaller gusts
      const secondaryGust = 0.3 * Math.pow(Math.sin(normalizedPosition * 8 * Math.PI), 2);
      
      // Add random variation
      const randomVariation = 0.1 * (Math.random() * 2 - 1);
      
      // Combine with slightly different patterns for L/R
      gustPatternL[i] = 0.4 + 0.6 * (primaryGust + secondaryGust + randomVariation);
      gustPatternR[i] = 0.4 + 0.6 * (primaryGust + secondaryGust * 1.2 + randomVariation);
    }
    
    // Generate wind sound sample by sample
    for (let i = 0; i < leftChannel.length; i++) {
      // Base wind noise
      const baseNoiseL = Math.random() * 2 - 1;
      const baseNoiseR = Math.random() * 2 - 1;
      
      // Get gust amplitude from pattern
      const gustIndexL = (i + Math.floor(leftPhase * 1000)) % gustCycleLength;
      const gustIndexR = (i + Math.floor(rightPhase * 1000)) % gustCycleLength;
      
      const gustAmplitudeL = gustPatternL[gustIndexL];
      const gustAmplitudeR = gustPatternR[gustIndexR];
      
      // Apply gust modulation
      leftChannel[i] = baseNoiseL * gustAmplitudeL;
      rightChannel[i] = baseNoiseR * gustAmplitudeR;
      
      // Add occasional whistle for high wind areas (when gust is strong)
      if (gustAmplitudeL > 0.8 && Math.random() > 0.99) {
        const t = i / sampleRate;
        const whistleFreq = 500 + Math.random() * 1000;
        const whistleDuration = 0.1 + Math.random() * 0.3; // 0.1-0.4 seconds
        
        // Add whistle for its duration
        for (let j = 0; j < whistleDuration * sampleRate && i + j < leftChannel.length; j++) {
          const whistlePhase = (j / sampleRate) * whistleFreq * 2 * Math.PI;
          const whistleEnvelope = Math.sin((j / (whistleDuration * sampleRate)) * Math.PI);
          const whistleValue = Math.sin(whistlePhase) * whistleEnvelope * 0.15;
          
          leftChannel[i + j] += whistleValue;
          
          // Add whistle to right channel with slight delay for stereo effect
          if (i + j + 5 < rightChannel.length) {
            rightChannel[i + j + 5] += whistleValue * 0.8;
          }
        }
      }
    }
  }
  
  // Generate specialized bird sounds with authentic chirp patterns
  generateBirdSound(leftChannel, rightChannel, sampleRate) {
    // Birds consist of a quiet background with periodic chirps
    
    // First, create a very quiet background noise
    for (let i = 0; i < leftChannel.length; i++) {
      // Very quiet background
      leftChannel[i] = (Math.random() * 2 - 1) * 0.05;
      rightChannel[i] = (Math.random() * 2 - 1) * 0.05;
    }
    
    // Define different bird types
    const birdTypes = [
      { 
        // Small songbird - rapid high chirps
        minFreq: 3000, maxFreq: 4000, 
        minDuration: 0.05, maxDuration: 0.15, 
        minChirps: 3, maxChirps: 8,
        minGap: 0.01, maxGap: 0.04,
        volume: 0.4
      },
      { 
        // Medium bird - varied melody
        minFreq: 2000, maxFreq: 3000, 
        minDuration: 0.1, maxDuration: 0.25, 
        minChirps: 2, maxChirps: 5,
        minGap: 0.03, maxGap: 0.08,
        volume: 0.5
      },
      { 
        // Lower warbler
        minFreq: 1200, maxFreq: 2000, 
        minDuration: 0.15, maxDuration: 0.4, 
        minChirps: 1, maxChirps: 3,
        minGap: 0.05, maxGap: 0.1,
        volume: 0.35
      }
    ];
    
    // Schedule random bird chirps throughout the buffer
    const bufferDuration = leftChannel.length / sampleRate;
    const callDensity = 0.5; // Number of bird calls per second on average
    
    // Calculate total number of calls to distribute
    const totalCalls = Math.floor(bufferDuration * callDensity);
    
    for (let call = 0; call < totalCalls; call++) {
      // Choose random time for this call
      const callTime = Math.random() * bufferDuration;
      const callSample = Math.floor(callTime * sampleRate);
      
      // Choose a random bird type
      const birdType = birdTypes[Math.floor(Math.random() * birdTypes.length)];
      
      // Determine which channel (L/R) or both
      const channel = Math.floor(Math.random() * 3); // 0=L, 1=R, 2=both
      
      // Create the sequence of chirps for this call
      const chirpCount = Math.floor(birdType.minChirps + 
                       Math.random() * (birdType.maxChirps - birdType.minChirps + 1));
      
      // Track current position in samples
      let currentSample = callSample;
      
      // For each chirp in the sequence
      for (let chirp = 0; chirp < chirpCount; chirp++) {
        // Calculate chirp parameters
        const chirpFreq = birdType.minFreq + 
                        Math.random() * (birdType.maxFreq - birdType.minFreq);
                        
        const chirpDuration = birdType.minDuration + 
                            Math.random() * (birdType.maxDuration - birdType.minDuration);
                            
        const chirpSamples = Math.floor(chirpDuration * sampleRate);
        
        // Add frequency variation for more natural sound
        const freqVariation = 0.1; // 10% variation
        
        // Generate the chirp waveform
        for (let i = 0; i < chirpSamples; i++) {
          if (currentSample + i >= leftChannel.length) break;
          
          // Normalized position in the chirp (0-1)
          const normalizedPos = i / chirpSamples;
          
          // Envelope shape - attack and decay
          let envelope;
          if (normalizedPos < 0.2) {
            // Attack phase
            envelope = normalizedPos / 0.2; // Linear attack
          } else {
            // Decay phase
            envelope = 1 - (normalizedPos - 0.2) / 0.8; // Linear decay
          }
          
          // Frequency modulation for more realistic chirp
          // Birds often have slight frequency changes during chirps
          const chirpModFreq = chirpFreq * (1 + 
                              freqVariation * Math.sin(normalizedPos * Math.PI * 3));
          
          // Calculate instantaneous phase 
          const phase = (i / sampleRate) * chirpModFreq * 2 * Math.PI;
          
          // Generate sample value
          const sampleValue = Math.sin(phase) * envelope * birdType.volume;
          
          // Add to appropriate channel(s)
          if (channel === 0 || channel === 2) { // Left or both
            leftChannel[currentSample + i] += sampleValue;
          }
          
          if (channel === 1 || channel === 2) { // Right or both
            // For stereo effect, add slight variations to right channel
            const rightPhaseOffset = Math.PI * 0.05; // Small phase offset
            const rightVolumeFactor = 0.9 + Math.random() * 0.2; // Volume variation
            
            const rightPhase = phase + rightPhaseOffset;
            const rightSampleValue = Math.sin(rightPhase) * envelope * 
                                   birdType.volume * rightVolumeFactor;
            
            rightChannel[currentSample + i] += rightSampleValue;
          }
        }
        
        // Move position for next chirp, adding a gap
        const gapDuration = birdType.minGap + 
                          Math.random() * (birdType.maxGap - birdType.minGap);
        currentSample += chirpSamples + Math.floor(gapDuration * sampleRate);
      }
    }
  }
  
  // Generate specialized fire sounds
  generateFireSound(leftChannel, rightChannel, sampleRate) {
    // Fire consists of a low frequency rumble with random crackles
    
    // Generate base fire sound (low rumble)
    for (let i = 0; i < leftChannel.length; i++) {
      // Base fire sound - brown noise (deeper than white noise)
      // Brown noise has more energy in low frequencies, like a fire
      let leftSample = 0;
      let rightSample = 0;
      
      // Use integration of white noise for brown noise
      leftSample = (leftSample + (Math.random() * 2 - 1) * 0.02) * 0.99;
      rightSample = (rightSample + (Math.random() * 2 - 1) * 0.02) * 0.99;
      
      // Add slow modulation to simulate breathing of fire
      const t = i / sampleRate;
      const fireBreathing = 0.5 + 0.5 * Math.sin(t * 0.2 * 2 * Math.PI);
      
      leftChannel[i] = leftSample * (0.7 + 0.3 * fireBreathing);
      rightChannel[i] = rightSample * (0.7 + 0.3 * fireBreathing);
    }
    
    // Add random crackles 
    // Fire crackles happen randomly but more frequently when fire is "breathing" higher
    const crackleDensity = 15; // Average crackles per second
    const totalCrackles = Math.floor((leftChannel.length / sampleRate) * crackleDensity);
    
    for (let c = 0; c < totalCrackles; c++) {
      // Random time for this crackle
      const crackleTime = Math.random() * (leftChannel.length / sampleRate);
      const crackleSample = Math.floor(crackleTime * sampleRate);
      
      // Random properties for this crackle
      const crackleDuration = 0.005 + Math.random() * 0.03; // 5-35 ms
      const crackleSamples = Math.floor(crackleDuration * sampleRate);
      
      // Slightly different properties for left and right
      const leftAmplitude = 0.3 + Math.random() * 0.7;
      const rightAmplitude = 0.3 + Math.random() * 0.7;
      
      // Generate the crackle
      for (let i = 0; i < crackleSamples; i++) {
        if (crackleSample + i >= leftChannel.length) break;
        
        // Envelope shape - very quick attack, longer decay
        let envelope;
        const normalizedPos = i / crackleSamples;
        
        if (normalizedPos < 0.1) {
          // Fast attack
          envelope = normalizedPos / 0.1;
        } else {
          // Exponential decay
          envelope = Math.exp(-(normalizedPos - 0.1) * 10);
        }
        
        // Crackle noise with high frequency content
        const leftNoise = (Math.random() * 2 - 1) * envelope * leftAmplitude;
        const rightNoise = (Math.random() * 2 - 1) * envelope * rightAmplitude;
        
        // Add to fire base sound
        leftChannel[crackleSample + i] += leftNoise;
        rightChannel[crackleSample + i] += rightNoise;
      }
    }
    
    // Add occasional louder pops and shifts in the fire
    const popDensity = 1; // Average pops per second
    const totalPops = Math.floor((leftChannel.length / sampleRate) * popDensity);
    
    for (let p = 0; p < totalPops; p++) {
      // Random time for this pop
      const popTime = Math.random() * (leftChannel.length / sampleRate);
      const popSample = Math.floor(popTime * sampleRate);
      
      // Random properties for this pop
      const popDuration = 0.05 + Math.random() * 0.1; // 50-150 ms
      const popSamples = Math.floor(popDuration * sampleRate);
      
      // Pop is a mix of a pitch sweep and noise
      const baseFreq = 200 + Math.random() * 300;
      const freqEnd = baseFreq * (0.7 + Math.random() * 0.6);
      
      // Which channel is dominant for this pop
      const leftDominant = Math.random() > 0.5;
      const dominantAmp = 0.4 + Math.random() * 0.3;
      const secondaryAmp = dominantAmp * (0.3 + Math.random() * 0.4);
      
      // Generate the pop
      for (let i = 0; i < popSamples; i++) {
        if (popSample + i >= leftChannel.length) break;
        
        // Envelope shape
        const normalizedPos = i / popSamples;
        const envelope = Math.sin(normalizedPos * Math.PI); // Sine-shaped envelope
        
        // Frequency sweep
        const currentFreq = baseFreq + (freqEnd - baseFreq) * normalizedPos;
        const phase = (i / sampleRate) * currentFreq * 2 * Math.PI;
        
        // Mix sine tone and noise
        const toneFactor = 0.7 - 0.4 * normalizedPos; // More tone at beginning, more noise at end
        const toneSample = Math.sin(phase) * toneFactor;
        const noiseSample = (Math.random() * 2 - 1) * (1 - toneFactor);
        
        const combinedSample = (toneSample + noiseSample) * envelope;
        
        // Add to appropriate channels
        leftChannel[popSample + i] += combinedSample * (leftDominant ? dominantAmp : secondaryAmp);
        rightChannel[popSample + i] += combinedSample * (leftDominant ? secondaryAmp : dominantAmp);
      }
    }
  }
  
  // Generate specialized night sounds
  generateNightSound(leftChannel, rightChannel, sampleRate) {
    // Night consists of a quiet base with crickets and occasional owl or other animals
    
    // First, create a very quiet background noise
    for (let i = 0; i < leftChannel.length; i++) {
      // Very quiet background - dark ambient
      leftChannel[i] = (Math.random() * 2 - 1) * 0.02;
      rightChannel[i] = (Math.random() * 2 - 1) * 0.02;
    }
    
    // Add cricket sounds (repeating high frequency patterns)
    const cricketChirpHz = 25; // Chirps per second
    const chirpsPerPattern = 3; // Chirps before a pause
    
    // Multiple cricket patterns at different times, frequencies, and stereo positions
    const cricketCount = 5;
    
    for (let c = 0; c < cricketCount; c++) {
      // Cricket properties
      const cricketFreq = 4000 + Math.random() * 1000; // Base frequency
      const chirpDuration = 0.01 + Math.random() * 0.01; // 10-20ms per chirp
      const patternDuration = chirpsPerPattern * (1/cricketChirpHz); // Duration of active chirping
      const pauseDuration = 0.5 + Math.random() * 1.5; // 0.5-2s pause between patterns
      const cycleDuration = patternDuration + pauseDuration;
      
      // Stereo position
      const stereoPan = Math.random() * 2 - 1; // -1 to 1
      
      // Time offset for this cricket
      const timeOffset = Math.random() * 5; // Offset 0-5s
      const sampleOffset = Math.floor(timeOffset * sampleRate);
      
      // Generate cricket patterns throughout the buffer
      let currentSample = sampleOffset;
      
      while (currentSample < leftChannel.length) {
        // For each chirp in the pattern
        for (let chirp = 0; chirp < chirpsPerPattern; chirp++) {
          // Chirp start sample
          const chirpStart = currentSample + Math.floor(chirp * (1/cricketChirpHz) * sampleRate);
          const chirpSamples = Math.floor(chirpDuration * sampleRate);
          
          // Generate the chirp
          for (let i = 0; i < chirpSamples; i++) {
            if (chirpStart + i >= leftChannel.length) break;
            
            // Chirp envelope
            const envelope = Math.sin((i / chirpSamples) * Math.PI);
            
            // Cricket sound is a high frequency pulse
            const phase = (i / sampleRate) * cricketFreq * 2 * Math.PI;
            const cricketSample = Math.sin(phase) * envelope * 0.15;
            
            // Pan between channels
            const leftAmp = Math.max(0, 1 - stereoPan);
            const rightAmp = Math.max(0, 1 + stereoPan);
            
            leftChannel[chirpStart + i] += cricketSample * leftAmp;
            rightChannel[chirpStart + i] += cricketSample * rightAmp;
          }
        }
        
        // Move to next pattern
        currentSample += Math.floor(cycleDuration * sampleRate);
      }
    }
    
    // Add occasional owl hoots
    const owlDensity = 0.1; // Hoots per second on average
    const totalHoots = Math.floor((leftChannel.length / sampleRate) * owlDensity);
    
    for (let h = 0; h < totalHoots; h++) {
      // Random time for this hoot
      const hootTime = Math.random() * (leftChannel.length / sampleRate);
      const hootSample = Math.floor(hootTime * sampleRate);
      
      // Owl hoot parameters
      const hootBaseFreq = 300 + Math.random() * 100;
      const hootDuration = 0.5 + Math.random() * 0.5; // 0.5-1s
      const hootSamples = Math.floor(hootDuration * sampleRate);
      
      // Sometimes owls do a double hoot
      const doubleHoot = Math.random() > 0.6;
      
      // Stereo position
      const owlPan = Math.random() * 1.6 - 0.8; // -0.8 to 0.8
      
      // Generate owl hoot
      this.generateOwlHoot(leftChannel, rightChannel, hootSample, hootSamples, 
                         hootBaseFreq, owlPan, sampleRate);
      
      // Second hoot if needed
      if (doubleHoot) {
        const gap = 0.3 + Math.random() * 0.2; // 300-500ms gap
        const secondHootSample = hootSample + Math.floor(gap * sampleRate);
        
        this.generateOwlHoot(leftChannel, rightChannel, secondHootSample, hootSamples,
                           hootBaseFreq * 0.95, owlPan, sampleRate); // Slightly lower pitch
      }
    }
    
    // Add very distant sounds occasionally (wolf, etc.)
    const distantSoundDensity = 0.03; // Sounds per second
    const totalDistantSounds = Math.floor((leftChannel.length / sampleRate) * distantSoundDensity);
    
    for (let d = 0; d < totalDistantSounds; d++) {
      // Random time for this sound
      const soundTime = Math.random() * (leftChannel.length / sampleRate);
      const soundSample = Math.floor(soundTime * sampleRate);
      
      // Sound parameters
      const soundType = Math.floor(Math.random() * 3); // 0=wolf, 1=branch breaking, 2=distant animal
      
      // Generate the appropriate sound
      switch (soundType) {
        case 0: // Wolf/coyote howl
          this.generateDistantWolfHowl(leftChannel, rightChannel, soundSample, sampleRate);
          break;
        case 1: // Branch breaking
          this.generateBranchSnap(leftChannel, rightChannel, soundSample, sampleRate);
          break;
        case 2: // Distant animal (non-specific)
          this.generateDistantAnimal(leftChannel, rightChannel, soundSample, sampleRate);
          break;
      }
    }
  }
  
  // Helper to generate an owl hoot sound
  generateOwlHoot(leftChannel, rightChannel, startSample, samples, baseFreq, pan, sampleRate) {
    // Only generate if we have enough space in the buffer
    if (startSample + samples >= leftChannel.length) return;
    
    // Pan calculations
    const leftGain = Math.max(0, 1 - pan);
    const rightGain = Math.max(0, 1 + pan);
    
    // Distance simulation
    const distanceFactor = 0.5 + Math.random() * 0.5; // 0.5-1.0 (1 = close, 0.5 = far)
    
    // Owl hoot has a characteristic shape - starts at base frequency, dips down slightly, then back up
    for (let i = 0; i < samples; i++) {
      // Normalized position
      const normalizedPos = i / samples;
      
      // Overall envelope
      let envelope;
      if (normalizedPos < 0.1) {
        // Attack
        envelope = normalizedPos / 0.1;
      } else if (normalizedPos > 0.8) {
        // Release
        envelope = (1 - normalizedPos) / 0.2;
      } else {
        // Sustain with slight curve
        envelope = 1 - 0.2 * Math.sin((normalizedPos - 0.1) / 0.7 * Math.PI);
      }
      
      // Frequency modulation - the characteristic owl hoot shape
      let frequencyMod;
      if (normalizedPos < 0.3) {
        // Initial frequency drop
        frequencyMod = 1 - (normalizedPos / 0.3) * 0.2; // Down to 0.8x
      } else if (normalizedPos < 0.7) {
        // Hold at lower frequency
        frequencyMod = 0.8;
      } else {
        // Final frequency rise
        frequencyMod = 0.8 + ((normalizedPos - 0.7) / 0.3) * 0.3; // Up to 1.1x
      }
      
      const currentFreq = baseFreq * frequencyMod;
      
      // Calculate phase
      const phase = (i / sampleRate) * currentFreq * 2 * Math.PI;
      
      // Generate primary hoot tone 
      let hootSample = Math.sin(phase) * envelope * 0.2 * distanceFactor;
      
      // Add some harmonics for richness
      hootSample += Math.sin(phase * 2) * envelope * 0.05 * distanceFactor;
      hootSample += Math.sin(phase * 3) * envelope * 0.01 * distanceFactor;
      
      // Apply distance blur/reverb (simple approximation)
      if (i > 0) {
        hootSample = hootSample * 0.95 + leftChannel[startSample + i - 1] * 0.05;
      }
      
      // Add to channels with appropriate panning
      leftChannel[startSample + i] += hootSample * leftGain;
      rightChannel[startSample + i] += hootSample * rightGain;
    }
  }
  
  // Helper to generate a distant wolf/coyote howl
  generateDistantWolfHowl(leftChannel, rightChannel, startSample, sampleRate) {
    // Howl parameters
    const howlDuration = 1.5 + Math.random() * 1.0; // 1.5-2.5s
    const howlSamples = Math.floor(howlDuration * sampleRate);
    
    // Only generate if we have enough space
    if (startSample + howlSamples >= leftChannel.length) return;
    
    // Howl is very distant, so volume is very low
    const volumeFactor = 0.07 + Math.random() * 0.03;
    
    // Pan is very subtle for distant sounds
    const pan = Math.random() * 0.6 - 0.3; // -0.3 to 0.3
    const leftGain = Math.max(0, 1 - pan);
    const rightGain = Math.max(0, 1 + pan);
    
    // Base frequency and harmonics
    const baseFreq = 350 + Math.random() * 100;
    
    for (let i = 0; i < howlSamples; i++) {
      // Normalized position
      const normalizedPos = i / howlSamples;
      
      // Envelope shape
      let envelope;
      if (normalizedPos < 0.1) {
        // Slow attack
        envelope = Math.pow(normalizedPos / 0.1, 2);
      } else if (normalizedPos < 0.7) {
        // Sustain with slight rise
        envelope = 1 + (normalizedPos - 0.1) * 0.2;
      } else {
        // Decay
        envelope = 1.2 * Math.pow((1 - normalizedPos) / 0.3, 0.7);
      }
      
      // Frequency modulation - wolves/coyotes have a characteristic rising howl
      const freqModulation = 1 + normalizedPos * 0.5; // Rises by 50% by the end
      const currentFreq = baseFreq * freqModulation;
      
      // Phase calculation
      const phase = (i / sampleRate) * currentFreq * 2 * Math.PI;
      
      // Generate howl tone with harmonics
      let howlSample = Math.sin(phase) * 0.6; // Base tone
      howlSample += Math.sin(phase * 2) * 0.25; // First harmonic
      howlSample += Math.sin(phase * 3) * 0.1; // Second harmonic
      howlSample += Math.sin(phase * 4) * 0.05; // Third harmonic
      
      // Apply envelope and overall volume
      howlSample *= envelope * volumeFactor;
      
      // Add some tremolo for the characteristic wavering sound
      const tremoloRate = 6 + normalizedPos * 2; // Tremolo gets faster
      const tremoloDepth = 0.2;
      const tremolo = 1 - tremoloDepth * 0.5 * (1 + Math.sin(normalizedPos * tremoloRate * 2 * Math.PI));
      
      howlSample *= tremolo;
      
      // Distance reverb simulation (very simple approximation)
      if (i > 0) {
        howlSample = howlSample * 0.8 + leftChannel[startSample + i - 1] * 0.2;
      }
      
      // Add to channels with appropriate panning
      leftChannel[startSample + i] += howlSample * leftGain;
      rightChannel[startSample + i] += howlSample * rightGain;
    }
  }
  
  // Helper to generate a branch breaking sound
  generateBranchSnap(leftChannel, rightChannel, startSample, sampleRate) {
    // Snap parameters
    const snapDuration = 0.2 + Math.random() * 0.1; // 200-300ms
    const snapSamples = Math.floor(snapDuration * sampleRate);
    
    // Only generate if we have enough space
    if (startSample + snapSamples >= leftChannel.length) return;
    
    // Volume factor (distant sound)
    const volumeFactor = 0.1 + Math.random() * 0.05;
    
    // Pan
    const pan = Math.random() * 1.2 - 0.6; // -0.6 to 0.6
    const leftGain = Math.max(0, 1 - pan);
    const rightGain = Math.max(0, 1 + pan);
    
    // Generate noise burst with characteristic envelope
    for (let i = 0; i < snapSamples; i++) {
      // Normalized position
      const normalizedPos = i / snapSamples;
      
      // Envelope - very fast attack, sharp initial decay, then longer tail
      let envelope;
      if (normalizedPos < 0.02) {
        // Very fast attack
        envelope = normalizedPos / 0.02;
      } else if (normalizedPos < 0.1) {
        // First decay phase - sharp
        envelope = 1 - 0.5 * ((normalizedPos - 0.02) / 0.08);
      } else {
        // Long decay tail
        envelope = 0.5 * Math.exp(-(normalizedPos - 0.1) * 10);
      }
      
      // Generate noise with different characteristics through the snap
      let snapSample;
      if (normalizedPos < 0.1) {
        // Initial snap is more "woody" - filtered noise
        snapSample = (Math.random() * 2 - 1) * envelope;
      } else {
        // Trailing sound is lower frequency
        snapSample = (Math.random() * 2 - 1) * envelope;
        // Apply primitive low pass filtering
        if (i > 0) {
          snapSample = 0.3 * snapSample + 0.7 * leftChannel[startSample + i - 1];
        }
      }
      
      // Apply volume factor
      snapSample *= volumeFactor;
      
      // Add distance reverb effect
      if (i > 20) {
        snapSample = snapSample * 0.85 + leftChannel[startSample + i - 20] * 0.15;
      }
      
      // Add to channels with appropriate panning
      leftChannel[startSample + i] += snapSample * leftGain;
      rightChannel[startSample + i] += snapSample * rightGain;
    }
  }
  
  // Helper to generate a distant animal sound (generic)
  generateDistantAnimal(leftChannel, rightChannel, startSample, sampleRate) {
    // Sound parameters
    const soundDuration = 0.3 + Math.random() * 0.3; // 300-600ms
    const soundSamples = Math.floor(soundDuration * sampleRate);
    
    // Only generate if we have enough space
    if (startSample + soundSamples >= leftChannel.length) return;
    
    // Volume factor (very distant)
    const volumeFactor = 0.08 + Math.random() * 0.04;
    
    // Pan
    const pan = Math.random() * 1.4 - 0.7; // -0.7 to 0.7
    const leftGain = Math.max(0, 1 - pan);
    const rightGain = Math.max(0, 1 + pan);
    
    // Base frequency
    const baseFreq = 300 + Math.random() * 400; // 300-700 Hz
    
    // Generate a simple animal call
    for (let i = 0; i < soundSamples; i++) {
      // Normalized position
      const normalizedPos = i / soundSamples;
      
      // Envelope
      let envelope;
      if (normalizedPos < 0.1) {
        // Attack
        envelope = normalizedPos / 0.1;
      } else if (normalizedPos < 0.7) {
        // Sustain
        envelope = 1;
      } else {
        // Release
        envelope = (1 - normalizedPos) / 0.3;
      }
      
      // Frequency modulation - slight variation
      const freqMod = 1 + 0.1 * Math.sin(normalizedPos * 3 * Math.PI);
      const currentFreq = baseFreq * freqMod;
      
      // Phase
      const phase = (i / sampleRate) * currentFreq * 2 * Math.PI;
      
      // Generate sound with harmonics
      let animalSample = Math.sin(phase) * 0.6;
      animalSample += Math.sin(phase * 2) * 0.3;
      animalSample += Math.sin(phase * 3) * 0.1;
      
      // Add some noise for texture
      animalSample += (Math.random() * 2 - 1) * 0.05;
      
      // Apply envelope and volume
      animalSample *= envelope * volumeFactor;
      
      // Distance effect
      if (i > 30) {
        animalSample = animalSample * 0.8 + leftChannel[startSample + i - 30] * 0.2;
      }
      
      // Add to channels with appropriate panning
      leftChannel[startSample + i] += animalSample * leftGain;
      rightChannel[startSample + i] += animalSample * rightGain;
    }
  }
  
  // Generate specialized space sounds
  generateSpaceSound(leftChannel, rightChannel, sampleRate) {
    // Space sounds - deep drones, occasional ethereal tones, vast emptiness
    
    // Fill the buffer with a very quiet noise floor first
    for (let i = 0; i < leftChannel.length; i++) {
      // Very low noise floor
      leftChannel[i] = (Math.random() * 2 - 1) * 0.01;
      rightChannel[i] = (Math.random() * 2 - 1) * 0.01;
    }
    
    // Add deep space background drone
    // This is a very low frequency drone with harmonics
    const droneBaseFreq = 40 + Math.random() * 20; // 40-60 Hz
    const droneDuration = leftChannel.length / sampleRate;
    
    // Create the drone with evolving harmonics
    for (let i = 0; i < leftChannel.length; i++) {
      // Time and normalized position
      const t = i / sampleRate;
      const normalizedPos = t / droneDuration;
      
      // Base drone phase
      const basePhase = t * droneBaseFreq * 2 * Math.PI;
      
      // Calculate drone sample with evolving harmonics
      let droneSample = Math.sin(basePhase) * 0.3; // Base frequency
      
      // Add harmonics with evolving amplitudes
      const harm2Amp = 0.2 + 0.1 * Math.sin(normalizedPos * 0.5 * Math.PI); // Slow evolution
      droneSample += Math.sin(basePhase * 2) * harm2Amp;
      
      const harm3Amp = 0.1 + 0.1 * Math.sin(normalizedPos * 0.3 * Math.PI + 1); // Different phase
      droneSample += Math.sin(basePhase * 3) * harm3Amp;
      
      const harm5Amp = 0.05 + 0.05 * Math.sin(normalizedPos * 0.2 * Math.PI + 2); // Very slow
      droneSample += Math.sin(basePhase * 5) * harm5Amp;
      
      // Apply very slow amplitude modulation
      const ampMod = 0.5 + 0.5 * Math.sin(normalizedPos * 0.7 * Math.PI);
      droneSample *= 0.7 * ampMod;
      
      // Add to both channels with slight differences for stereo width
      leftChannel[i] += droneSample * (1 + Math.sin(normalizedPos * 0.3 * Math.PI) * 0.2);
      rightChannel[i] += droneSample * (1 + Math.sin(normalizedPos * 0.3 * Math.PI + 1) * 0.2);
    }
    
    // Add ethereal space tone events
    const toneEventDensity = 0.1; // Events per second
    const totalToneEvents = Math.floor(droneDuration * toneEventDensity);
    
    for (let e = 0; e < totalToneEvents; e++) {
      // Random time for this tone event
      const eventTime = Math.random() * droneDuration;
      const eventSample = Math.floor(eventTime * sampleRate);
      
      // Tone event properties
      const eventType = Math.floor(Math.random() * 3); // 0=sweep, 1=pulsing, 2=shimmer
      
      // Generate the appropriate event
      switch (eventType) {
        case 0: // Frequency sweep
          this.generateSpaceSweep(leftChannel, rightChannel, eventSample, sampleRate);
          break;
        case 1: // Pulsing tone
          this.generateSpacePulse(leftChannel, rightChannel, eventSample, sampleRate);
          break;
        case 2: // Harmonic shimmer
          this.generateSpaceShimmer(leftChannel, rightChannel, eventSample, sampleRate);
          break;
      }
    }
  }
  
  // Helper to generate a space frequency sweep
  generateSpaceSweep(leftChannel, rightChannel, startSample, sampleRate) {
    // Sweep parameters
    const sweepDuration = 4 + Math.random() * 6; // 4-10 seconds
    const sweepSamples = Math.floor(sweepDuration * sampleRate);
    
    // Make sure we don't exceed buffer
    const actualSamples = Math.min(sweepSamples, leftChannel.length - startSample);
    
    // Frequency range
    const startFreq = 200 + Math.random() * 300; // 200-500 Hz
    let endFreq;
    
    // Sweep can go up or down
    const sweepDirection = Math.random() > 0.5 ? 1 : -1;
    if (sweepDirection > 0) {
      // Upward sweep
      endFreq = startFreq * (2 + Math.random() * 2); // 2-4x higher
    } else {
      // Downward sweep
      endFreq = startFreq / (2 + Math.random() * 1.5); // 2-3.5x lower
    }
    
    // Volume factor
    const volume = 0.1 + Math.random() * 0.1;
    
    // Stereo width
    const stereoWidth = 0.3 + Math.random() * 0.6; // 0.3-0.9
    
    // Generate the sweep
    for (let i = 0; i < actualSamples; i++) {
      // Normalized position
      const normalizedPos = i / actualSamples;
      
      // Envelope - gentle fade in/out
      let envelope;
      if (normalizedPos < 0.2) {
        // Fade in
        envelope = normalizedPos / 0.2;
      } else if (normalizedPos > 0.8) {
        // Fade out
        envelope = (1 - normalizedPos) / 0.2;
      } else {
        // Sustained
        envelope = 1;
      }
      
      // Apply gentle envelope curve
      envelope = Math.pow(envelope, 2);
      
      // Calculate current frequency using logarithmic sweep for more natural sound
      const logPos = normalizedPos;
      const currentFreq = startFreq * Math.pow(endFreq / startFreq, logPos);
      
      // Phase
      const t = i / sampleRate;
      const phase = t * currentFreq * 2 * Math.PI;
      
      // Generate tone with slight phase and amplitude differences between channels
      const leftPhase = phase;
      const rightPhase = phase + stereoWidth * 0.1 * Math.PI;
      
      const leftAmp = 1 - stereoWidth * 0.2 * Math.sin(normalizedPos * 3 * Math.PI);
      const rightAmp = 1 - stereoWidth * 0.2 * Math.sin(normalizedPos * 3 * Math.PI + Math.PI);
      
      // Base tone with harmonics
      let leftSample = Math.sin(leftPhase) * 0.7;
      leftSample += Math.sin(leftPhase * 2) * 0.2;
      leftSample += Math.sin(leftPhase * 3) * 0.1;
      leftSample *= envelope * volume * leftAmp;
      
      let rightSample = Math.sin(rightPhase) * 0.7;
      rightSample += Math.sin(rightPhase * 2) * 0.2;
      rightSample += Math.sin(rightPhase * 3) * 0.1;
      rightSample *= envelope * volume * rightAmp;
      
      // Add to buffer
      leftChannel[startSample + i] += leftSample;
      rightChannel[startSample + i] += rightSample;
    }
  }
  
  // Helper to generate a pulsing space tone
  generateSpacePulse(leftChannel, rightChannel, startSample, sampleRate) {
    // Pulse parameters
    const pulseDuration = 3 + Math.random() * 5; // 3-8 seconds
    const pulseSamples = Math.floor(pulseDuration * sampleRate);
    
    // Make sure we don't exceed buffer
    const actualSamples = Math.min(pulseSamples, leftChannel.length - startSample);
    
    // Pulse properties
    const pulseFreq = 100 + Math.random() * 200; // 100-300 Hz
    const pulseRate = 0.5 + Math.random() * 2; // 0.5-2.5 Hz (pulses per second)
    const volume = 0.15 + Math.random() * 0.1;
    
    // Generate the pulse
    for (let i = 0; i < actualSamples; i++) {
      // Normalized position and time
      const normalizedPos = i / actualSamples;
      const t = i / sampleRate;
      
      // Overall envelope
      let envelope;
      if (normalizedPos < 0.1) {
        // Fade in
        envelope = normalizedPos / 0.1;
      } else if (normalizedPos > 0.9) {
        // Fade out
        envelope = (1 - normalizedPos) / 0.1;
      } else {
        // Sustained
        envelope = 1;
      }
      
      // Pulse envelope - create the pulsing effect
      const pulsePhase = t * pulseRate * 2 * Math.PI;
      const pulseEnvelope = Math.pow(0.5 + 0.5 * Math.sin(pulsePhase), 2); // Sharper pulse
      
      // Tone phase
      const tonePhase = t * pulseFreq * 2 * Math.PI;
      
      // Generate tone
      const baseTone = Math.sin(tonePhase) * pulseEnvelope * envelope * volume;
      
      // Add subtle variations for stereo effect
      const stereoPhase = 0.05 * Math.PI * Math.sin(t * 0.2);
      
      leftChannel[startSample + i] += baseTone * (1 + 0.2 * Math.sin(t * 0.3));
      rightChannel[startSample + i] += baseTone * (1 + 0.2 * Math.sin(t * 0.3 + Math.PI));
    }
  }
  
  // Helper to generate a harmonic shimmer effect
  generateSpaceShimmer(leftChannel, rightChannel, startSample, sampleRate) {
    // Shimmer parameters
    const shimmerDuration = 5 + Math.random() * 7; // 5-12 seconds
    const shimmerSamples = Math.floor(shimmerDuration * sampleRate);
    
    // Make sure we don't exceed buffer
    const actualSamples = Math.min(shimmerSamples, leftChannel.length - startSample);
    
    // Shimmer properties
    const baseFreq = 250 + Math.random() * 150; // 250-400 Hz
    const volume = 0.1 + Math.random() * 0.1;
    
    // Harmonic series (use harmonics from the harmonic series)
    const harmonics = [1, 2, 3, 5, 8, 13]; // Natural harmonics plus some Fibonacci for interest
    
    // Generate the shimmer
    for (let i = 0; i < actualSamples; i++) {
      // Normalized position and time
      const normalizedPos = i / actualSamples;
      const t = i / sampleRate;
      
      // Overall envelope
      let envelope;
      if (normalizedPos < 0.2) {
        // Fade in
        envelope = normalizedPos / 0.2;
      } else if (normalizedPos > 0.8) {
        // Fade out
        envelope = (1 - normalizedPos) / 0.2;
      } else {
        // Sustained
        envelope = 1;
      }
      
      // Shimmer is composed of several harmonics that fade in and out independently
      let leftSample = 0;
      let rightSample = 0;
      
      // Calculate each harmonic
      harmonics.forEach((harmonic, index) => {
        // Each harmonic has its own amplitude envelope
        const harmonicEnvelope = 0.5 + 0.5 * Math.sin(
          t * (0.1 + index * 0.05) * 2 * Math.PI + index * 0.5
        );
        
        // Calculate harmonic frequency and phase
        const harmonicFreq = baseFreq * harmonic;
        const harmonicPhase = t * harmonicFreq * 2 * Math.PI;
        
        // Amplitude decreases for higher harmonics
        const harmonicAmplitude = 0.7 / (index + 1);
        
        // Create stereo width with phase offsets
        const leftPhaseOffset = 0.05 * Math.PI * Math.sin(t * 0.1 + index * 0.2);
        const rightPhaseOffset = -leftPhaseOffset;
        
        // Add this harmonic to the shimmer
        leftSample += Math.sin(harmonicPhase + leftPhaseOffset) * 
                    harmonicEnvelope * harmonicAmplitude;
                    
        rightSample += Math.sin(harmonicPhase + rightPhaseOffset) * 
                     harmonicEnvelope * harmonicAmplitude;
      });
      
      // Apply overall envelope and volume
      leftSample *= envelope * volume;
      rightSample *= envelope * volume;
      
      // Add to buffer
      leftChannel[startSample + i] += leftSample;
      rightChannel[startSample + i] += rightSample;
    }
  }
  
  // Generate colored noise (white, pink, brown, blue)
  generateColoredNoise(leftChannel, rightChannel, sampleRate, noiseColor = 'white') {
    // Different noise colors have different spectral characteristics
    
    // For filtered noise, we'll need to track previous samples
    let leftPrev1 = 0, leftPrev2 = 0;
    let rightPrev1 = 0, rightPrev2 = 0;
    
    // Filter coefficients for different noise colors
    let b0, b1, b2, a1, a2;
    
    // Configure filter based on noise color
    switch (noiseColor) {
      case 'pink': // Pink noise (1/f spectrum, equal energy per octave)
        b0 = 0.04957526213389;
        b1 = 0.0;
        b2 = -0.04957526213389;
        a1 = -1.8895506381402;
        a2 = 0.8995574736582;
        break;
        
      case 'brown': // Brown noise (1/f^2 spectrum, more bass)
        b0 = 0.02;
        b1 = 0.0;
        b2 = 0.0;
        a1 = -1.98;
        a2 = 0.98;
        break;
        
      case 'blue': // Blue noise (f spectrum, more treble)
        b0 = 1.0;
        b1 = -1.0;
        b2 = 0.0;
        a1 = 0.0;
        a2 = 0.0;
        break;
        
      default: // White noise (flat spectrum)
        b0 = 1.0;
        b1 = 0.0;
        b2 = 0.0;
        a1 = 0.0;
        a2 = 0.0;
    }
    
    // Generate the colored noise
    for (let i = 0; i < leftChannel.length; i++) {
      // Generate white noise samples
      const leftWhite = Math.random() * 2 - 1;
      const rightWhite = Math.random() * 2 - 1;
      
      // Apply filter (biquad filter implementation)
      const leftFiltered = b0 * leftWhite + b1 * leftPrev1 + b2 * leftPrev2 -
                         a1 * leftChannel[i - 1] - a2 * leftChannel[i - 2];
                         
      const rightFiltered = b0 * rightWhite + b1 * rightPrev1 + b2 * rightPrev2 -
                          a1 * rightChannel[i - 1] - a2 * rightChannel[i - 2];
      
      // Store samples for next iteration
      leftPrev2 = leftPrev1;
      leftPrev1 = leftWhite;
      rightPrev2 = rightPrev1;
      rightPrev1 = rightWhite;
      
      // Update channels
      leftChannel[i] = isNaN(leftFiltered) ? leftWhite : leftFiltered;
      rightChannel[i] = isNaN(rightFiltered) ? rightWhite : rightFiltered;
      
      // Add slow modulation for more organic sound
      const t = i / sampleRate;
      const slowMod = 0.3 * Math.sin(t * 0.1 * 2 * Math.PI) + 
                     0.2 * Math.sin(t * 0.05 * 2 * Math.PI);
                     
      leftChannel[i] *= (1 + slowMod);
      rightChannel[i] *= (1 - slowMod); // Opposite for stereo effect
    }
    
    // Normalize the output to prevent clipping
    this.normalizeAudioBuffer(leftChannel);
    this.normalizeAudioBuffer(rightChannel);
  }
  
  // Helper to normalize audio buffer
  normalizeAudioBuffer(buffer) {
    // Find maximum absolute value
    let maxAmp = 0;
    for (let i = 0; i < buffer.length; i++) {
      maxAmp = Math.max(maxAmp, Math.abs(buffer[i]));
    }
    
    // Only normalize if needed
    if (maxAmp > 0.99) {
      const gain = 0.99 / maxAmp;
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] *= gain;
      }
    }
  }
  
  // Create advanced drone/pad sound with rich emotional character
  createDronePad(settings) {
    const context = this.audioContext;
    const masterGain = this.masterGain;
    
    if (!context || !masterGain) return;
    
    // Create a separate gain node for all pad elements
    const padMasterGain = context.createGain();
    padMasterGain.gain.value = 0; // Start at 0 for fade-in
    padMasterGain.connect(masterGain);
    
    // Fade in gently
    padMasterGain.gain.setValueAtTime(0, context.currentTime);
    padMasterGain.gain.linearRampToValueAtTime(
      settings.padVolume,
      context.currentTime + settings.attackTime * 3 // Longer attack for emotional impact
    );
    
    // Create advanced effects chain
    // 1. Create advanced chorus effect for depth and shimmer
    const chorus = this.createAdvancedChorus(context);
    
    // 2. Create multi-tap delay for added spaciousness
    const delay = this.createMultitapDelay(context);
    
    // 3. Create a soft saturation/drive for warmth
    const saturator = this.createSoftSaturator(context);
    
    // Chain effects: Input → Saturation → Chorus → Delay → Output
    saturator.output.connect(chorus.input);
    chorus.output.connect(delay.input);
    delay.output.connect(padMasterGain);
    
    // Define chord based on mood - using music theory for emotional impact
    const chordType = this.getChordForMood(this.mood);
    
    // Create oscillators for each note in the chord
    chordType.notes.forEach((interval, noteIdx) => {
      // Calculate note frequency from base frequency and interval
      const noteFreq = settings.baseFreq * Math.pow(2, interval / 12);
      
      // For each note, create multiple oscillator layers for richness
      this.createPadNote(noteFreq, noteIdx, chordType.notes.length, settings, context, saturator.input);
    });
  }
  
  // Helper to create a single note in the pad chord with multiple oscillator layers
  createPadNote(noteFreq, noteIndex, totalNotes, settings, context, outputNode) {
    // Create a note-specific gain
    const noteGain = context.createGain();
    noteGain.gain.value = 0; // Start silent, will ramp up
    noteGain.connect(outputNode);
    
    // Calculate panning - spread notes across stereo field using golden ratio
    let panValue;
    if (totalNotes === 1) {
      panValue = 0; // Center single notes
    } else {
      // Distribute notes using golden ratio for more natural spread
      const phi = 1.618033988749895;
      const normalizedPosition = noteIndex / (totalNotes - 1);
      const goldenPosition = (normalizedPosition * phi) % 1;
      panValue = (goldenPosition * 2 - 1) * 0.6; // -0.6 to 0.6
    }
    
    // Create panner for this note
    const notePanner = context.createStereoPanner();
    notePanner.pan.value = panValue;
    
    // Connect note gain to panner
    noteGain.connect(notePanner);
    notePanner.connect(outputNode);
    
    // Create oscillator layers for complex, emotionally rich timbres
    // 1. Base oscillator - main fundamental tone
    const createOscillator = (type, detune, octaveShift, gain) => {
      const osc = context.createOscillator();
      osc.type = type;
      osc.frequency.value = noteFreq * octaveShift;
      osc.detune.value = detune;
      
      const oscGain = context.createGain();
      oscGain.gain.value = gain;
      
      // Apply modulation to detune for subtle pitch movement - critical for emotional impact
      const lfo = context.createOscillator();
      lfo.type = 'sine';
      
      // Slightly different LFO rate for each oscillator to create complex beating patterns
      lfo.frequency.value = 0.1 + Math.random() * 0.2 + (noteIndex * 0.03); // Slow pitch modulation
      
      const lfoGain = context.createGain();
      lfoGain.gain.value = 3 + Math.random() * 2; // +/- 3-5 cents
      
      lfo.connect(lfoGain);
      lfoGain.connect(osc.detune);
      
      // Connect and start
      osc.connect(oscGain);
      oscGain.connect(noteGain);
      
      osc.start(context.currentTime);
      lfo.start(context.currentTime);
      
      // Store for cleanup
      this.oscillators.push(osc);
      this.oscillators.push(lfo);
      
      return { osc, gain: oscGain, lfo };
    };
    
    // Different waveforms for different notes in the chord to create variety and depth
    const waveforms = ['sine', 'triangle', 'sine', 'triangle'];
    const baseWaveform = waveforms[noteIndex % waveforms.length];
    
    // Create multiple oscillators for each note for a rich, layered sound
    
    // 1. Base oscillator - the fundamental
    const baseOsc = createOscillator(baseWaveform, 0, 1, 0.5);
    
    // 2. Detuned oscillators - create chorus/beating effect and richness
    const detune1 = createOscillator(baseWaveform, -7, 1, 0.4);
    const detune2 = createOscillator(baseWaveform, 7, 1, 0.4);
    
    // 3. Formant oscillator - adds vocal-like qualities by using filtered sawtooth
    const formantOsc = context.createOscillator();
    formantOsc.type = 'sawtooth';
    formantOsc.frequency.value = noteFreq;
    
    // Formant filter mimics vocal tract resonances
    const formantFilter = context.createBiquadFilter();
    formantFilter.type = 'bandpass';
    formantFilter.Q.value = 5;
    
    // Different formant frequencies for different notes creates vowel-like sounds
    const formantFreqs = [800, 1200, 500, 2000, 350];
    formantFilter.frequency.value = formantFreqs[noteIndex % formantFreqs.length];
    
    const formantGain = context.createGain();
    formantGain.gain.value = 0.15; // Subtle formant effect
    
    formantOsc.connect(formantFilter);
    formantFilter.connect(formantGain);
    formantGain.connect(noteGain);
    
    formantOsc.start(context.currentTime);
    this.oscillators.push(formantOsc);
    
    // 4. Sub oscillator (one octave below, adds fullness and depth)
    // Only add for lower notes to avoid mud
    if (noteIndex < 2) {
      const subOsc = createOscillator('sine', 0, 0.5, 0.3);
    }
    
    // 5. Noise component for certain moods (adds breath and air)
    if (this.mood === 'soft' || this.mood === 'calm') {
      const noiseGain = context.createGain();
      noiseGain.gain.value = 0.05; // Very subtle noise
      
      // Create noise source
      const bufferSize = context.sampleRate * 2; // 2 seconds of noise
      const noiseBuffer = context.createBuffer(1, bufferSize, context.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      
      // Fill with noise
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      
      // Create source and filter
      const noiseSource = context.createBufferSource();
      noiseSource.buffer = noiseBuffer;
      noiseSource.loop = true;
      
      // High-pass filter to keep only "airy" part
      const noiseFilter = context.createBiquadFilter();
      noiseFilter.type = 'highpass';
      noiseFilter.frequency.value = 3000;
      
      // Connect noise chain
      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(noteGain);
      
      noiseSource.start(context.currentTime);
      this.ambientSources.push(noiseSource);
    }
    
    // Create note volume envelope with staggered attack times
    // Small delay per note in chord for more natural sound
    const noteDelay = noteIndex * 0.1; // 100ms between notes
    const attackTime = settings.attackTime * (1 + noteIndex * 0.2); // Slightly longer attack for each note
    
    noteGain.gain.setValueAtTime(0, context.currentTime + noteDelay);
    noteGain.gain.linearRampToValueAtTime(
      1.0 / Math.sqrt(totalNotes), // Normalize volume based on number of notes
      context.currentTime + noteDelay + attackTime
    );
  }
  
  // Helper to determine appropriate chord based on mood for maximum emotional impact
  getChordForMood(mood) {
    // Define chord intervals as semitones from root
    // Using music theory to create emotionally appropriate chords
    
    switch (mood) {
      case 'calm':
        // Sus4 chord (1, 5, 8) - peaceful, floating
        return {
          notes: [0, 5, 7, 12],
          name: 'Sus4'
        };
        
      case 'soft':
        // Major 7th (1, 5, 8, 12) - gentle warmth with complexity
        return {
          notes: [0, 4, 7, 11],
          name: 'Major 7th'
        };
        
      case 'uplifting':
        // Major add9 (1, 4, 7, 14) - bright, optimistic, upward
        return {
          notes: [0, 4, 7, 14],
          name: 'Major add9'
        };
        
      case 'warm':
        // Major 6th (1, 4, 7, 9) - warm, cozy, comforting
        return {
          notes: [0, 4, 7, 9],
          name: 'Major 6th'
        };
        
      case 'cosmic':
        // Minor 9th (1, 3, 7, 10, 14) - mysterious, vast, complex
        return {
          notes: [0, 3, 7, 10, 14],
          name: 'Minor 9th'
        };
        
      case 'mystical':
        // Augmented (1, 4, 8) - otherworldly, suspension
        return {
          notes: [0, 4, 8],
          name: 'Augmented'
        };
        
      case 'bright':
        // Major 9th (1, 4, 7, 11, 14) - bright, full, sophisticated
        return {
          notes: [0, 4, 7, 11, 14],
          name: 'Major 9th'
        };
        
      default:
        // Default to major triad (1, 4, 7) - balanced, stable
        return {
          notes: [0, 4, 7],
          name: 'Major'
        };
    }
  }
  
  // Create advanced chorus effect with multiple voices for rich modulation
  createAdvancedChorus(context) {
    // Create multiple voices for richer chorus
    const voiceCount = 5;
    const voices = [];
    
    // Create delay & modulation for each voice
    for (let i = 0; i < voiceCount; i++) {
      const voice = {
        delay: context.createDelay(),
        lfo: context.createOscillator(),
        lfoGain: context.createGain(),
        voiceGain: context.createGain()
      };
      
      // Configure delay
      voice.delay.delayTime.value = 0.015 + i * 0.005; // 15-35ms staggered delays
      
      // Configure LFO with alternating waveforms
      voice.lfo.type = i % 2 === 0 ? 'sine' : 'triangle';
      voice.lfo.frequency.value = 0.1 + (i * 0.06); // Different rates for complexity
      
      // Different depths for each voice
      voice.lfoGain.gain.value = 0.0025 + (i * 0.0005); // Different depths
      
      // Individual voice volumes - earlier voices louder
      voice.voiceGain.gain.value = (voiceCount - i) / (voiceCount * 1.5);
      
      // Connect LFO to delay time
      voice.lfo.connect(voice.lfoGain);
      voice.lfoGain.connect(voice.delay.delayTime);
      
      // Start LFO
      voice.lfo.start();
      
      voices.push(voice);
      
      // Store oscillators for cleanup
      this.oscillators.push(voice.lfo);
    }
    
    // Create input and output gain nodes
    const input = context.createGain();
    const dryGain = context.createGain();
    const wetGain = context.createGain();
    const output = context.createGain();
    
    // Configure dry/wet mix
    dryGain.gain.value = 0.6; // 60% dry
    wetGain.gain.value = 0.4; // 40% wet
    
    // Connect dry path
    input.connect(dryGain);
    dryGain.connect(output);
    
    // Connect each chorus voice
    voices.forEach(voice => {
      input.connect(voice.delay);
      voice.delay.connect(voice.voiceGain);
      voice.voiceGain.connect(wetGain);
    });
    
    wetGain.connect(output);
    
    return { input, output };
  }
  
  // Create multi-tap delay for adding space to the pad sound
  createMultitapDelay(context) {
    // Create input and output
    const input = context.createGain();
    const output = context.createGain();
    
    // Direct path (no delay)
    const directGain = context.createGain();
    directGain.gain.value = 0.8; // 80% direct signal
    
    input.connect(directGain);
    directGain.connect(output);
    
    // Create multiple delay taps with golden ratio spacing
    const tapCount = 4;
    const maxDelayTime = 0.9; // Maximum delay in seconds
    
    for (let i = 0; i < tapCount; i++) {
      // Create delay node
      const delay = context.createDelay(maxDelayTime);
      
      // Calculate delay time for this tap using golden ratio for natural decay
      const delayTime = 0.3 + (i * 0.2 * 1.618) % maxDelayTime;
      delay.delayTime.value = delayTime;
      
      // Create gain for this tap
      const tapGain = context.createGain();
      
      // Taps get progressively quieter
      tapGain.gain.value = 0.2 * Math.pow(0.4, i);
      
      // Create filter for this tap
      // Each tap gets progressively darker to simulate distance
      const tapFilter = context.createBiquadFilter();
      tapFilter.type = 'lowpass';
      tapFilter.frequency.value = 4000 - (i * 500);
      
      // Create panning for this tap
      const tapPan = context.createStereoPanner();
      
      // Alternate taps between left and right
      tapPan.pan.value = i % 2 === 0 ? -0.5 : 0.5;
      
      // Connect everything
      input.connect(delay);
      delay.connect(tapFilter);
      tapFilter.connect(tapGain);
      tapGain.connect(tapPan);
      tapPan.connect(output);
    }
    
    return { input, output };
  }
  
  // Create a soft saturation/drive effect for warmth and emotion
  createSoftSaturator(context) {
    // Create input and output nodes
    const input = context.createGain();
    const output = context.createGain();
    
    // Create dynamic range compressor to prepare signal
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 30;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;
    
    // Create waveshaper for saturation
    const saturator = context.createWaveShaper();
    
    // Create saturation curve for harmonically rich warmth
    const saturationAmount = 0.8; // 0-1, higher = more saturation
    const sampleLength = 44100; // Resolution of the curve
    const curve = new Float32Array(sampleLength);
    
    // Generate curve
    for (let i = 0; i < sampleLength; i++) {
      // Convert to -1 to 1 range
      const x = (i * 2) / sampleLength - 1;
      
      // Apply soft clipping function
      // Arctangent (very smooth, adds both even and odd harmonics)
      const y = Math.atan(x * (1 + saturationAmount * 5)) / Math.atan(1 + saturationAmount * 5);
      
      curve[i] = y;
    }
    
    saturator.curve = curve;
    saturator.oversample = '4x'; // Reduce aliasing
    
    // Connect the modules
    input.connect(compressor);
    compressor.connect(saturator);
    saturator.connect(output);
    
    return { input, output };
  }
  
  // Create harmonic shimmer effect for ethereal beauty
  createHarmonicShimmer(settings) {
    const context = this.audioContext;
    const masterGain = this.masterGain;
    
    if (!context || !masterGain) return;
    
    // Create master gain for shimmer effect
    const shimmerGain = context.createGain();
    shimmerGain.gain.value = 0; // Start silent
    shimmerGain.connect(masterGain);
    
    // Fade in very slowly for emotional build
    shimmerGain.gain.setValueAtTime(0, context.currentTime);
    shimmerGain.gain.linearRampToValueAtTime(
      0.2, // Keep it subtle
      context.currentTime + 10 // 10 second fade in
    );
    
    // Create array of harmonic ratios to use (just intonation for beauty)
    // These specific ratios create very consonant harmonics
    const harmonicRatios = [
      2/1,    // Octave
      3/2,    // Perfect fifth
      5/4,    // Major third
      7/4,    // Harmonic seventh (slightly flat minor seventh)
      9/8,    // Major second
      11/8,   // Tritone plus quarter tone (ethereal)
      13/8    // Sharp minor sixth (ethereal)
    ];
    
    // Create oscillators for each harmonic
    harmonicRatios.forEach((ratio, index) => {
      // Frequency for this harmonic
      const frequency = settings.baseFreq * ratio;
      
      // Create oscillator
      const osc = context.createOscillator();
      osc.type = index % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.value = frequency;
      
      // Add slight random detune for movement
      osc.detune.value = Math.random() * 10 - 5;
      
      // Create modulation for this harmonic
      const lfo = context.createOscillator();
      lfo.type = 'sine';
      
      // Each harmonic has different modulation rate
      lfo.frequency.value = 0.05 + (index * 0.01);
      
      const lfoGain = context.createGain();
      lfoGain.gain.value = 3 + Math.random() * 2; // Subtle pitch modulation
      
      lfo.connect(lfoGain);
      lfoGain.connect(osc.detune);
      
      // Individual gain for this harmonic
      const harmonicGain = context.createGain();
      
      // Volume depends on harmonic number (higher harmonics quieter)
      harmonicGain.gain.value = 0.7 / Math.sqrt(index + 1);
      
      // Create shimmer envelope - slow attack and pulsing
      const now = context.currentTime;
      harmonicGain.gain.setValueAtTime(0, now);
      
      // Each harmonic fades in at a different rate
      const attackTime = 5 + index * 3;
      harmonicGain.gain.linearRampToValueAtTime(
        harmonicGain.gain.value,
        now + attackTime
      );
      
      // Add slow pulsing to each harmonic
      // We'll use setValueCurveAtTime for complex modulation
      
      // Create pulse cycles for 60 seconds
      const pulseDuration = 60;
      const pulseHz = 0.05 + (index * 0.01); // Different pulse rate for each harmonic
      const pulseCycles = pulseHz * pulseDuration;
      const pulseSteps = 100 * pulseCycles;
      
      const pulseValues = new Float32Array(pulseSteps);
      
      // Generate pulse curve
      for (let i = 0; i < pulseSteps; i++) {
        const phase = (i / pulseSteps) * pulseCycles * Math.PI * 2;
        // Add multiple sine waves for complex pulsing
        const pulse = 0.7 + 0.3 * Math.sin(phase) * Math.sin(phase * 0.33) * Math.sin(phase * 0.125);
        pulseValues[i] = harmonicGain.gain.value * pulse;
      }
      
      // Schedule the pulse after the attack
      harmonicGain.gain.setValueCurveAtTime(
        pulseValues,
        now + attackTime,
        pulseDuration
      );
      
      // Create filter for this harmonic - resonant bandpass for shimmer
      const filter = context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = frequency;
      filter.Q.value = 5 + index * 2; // Higher harmonics more resonant
      
      // Create panner for this harmonic
      const panner = context.createStereoPanner();
      
      // Distribute harmonics across stereo field
      const panValue = Math.sin(index * 0.7) * 0.7; // -0.7 to 0.7, distributed non-linearly
      panner.pan.value = panValue;
      
      // Connect everything
      osc.connect(filter);
      filter.connect(harmonicGain);
      harmonicGain.connect(panner);
      panner.connect(shimmerGain);
      
      // Start oscillators
      osc.start(now);
      lfo.start(now);
      
      // Store for cleanup
      this.oscillators.push(osc);
      this.oscillators.push(lfo);
    });
  }
  
  // Create melodic pattern with musicality and emotion
  createMelodicPattern(settings) {
    const context = this.audioContext;
    const masterGain = this.masterGain;
    
    if (!context || !masterGain) return;
    
    // Clear any existing pattern
    if (this.melodicPattern) {
      clearInterval(this.melodicPattern);
      clearTimeout(this.melodicPattern);
    }
    
    // Create a gain node for melodic elements
    const melodyGain = context.createGain();
    melodyGain.gain.value = 0; // Start silent
    
    // Fade in
    melodyGain.gain.setValueAtTime(0, context.currentTime);
    melodyGain.gain.linearRampToValueAtTime(
      settings.melodyVolume,
      context.currentTime + 3.0
    );
    
    // Create effects for melody
    const melodyProcessor = this.createMelodyProcessor(context);
    
    // Connect melody gain to processor
    melodyGain.connect(melodyProcessor.input);
    melodyProcessor.output.connect(masterGain);
    
    // Get scale for current mood
    const scale = musicalScales[settings.scale] || musicalScales.pentatonic;
    
    // Calculate tempo-related timing
    const tempo = settings.tempo;
    const beatDuration = 60 / tempo;
    
    // Create melodic patterns based on mood - each pattern designed for specific emotional impact
    const melodicPatterns = this.getMelodicPatternForMood(this.mood, scale);
    
    // Sequence state
    let currentPatternIndex = 0;
    let currentNoteIndex = 0;
    let currentOctave = 0;
    
    // Track pattern variation
    let variationCounter = 0;
    
    // Function to play next note in melodic sequence
    const playNextMelodicNote = () => {
      // Get current pattern
      const currentPattern = melodicPatterns[currentPatternIndex];
      
      // Get current note information
      const noteInfo = currentPattern.notes[currentNoteIndex];
      
      // Determine if this note should be played or is a rest
      const isRest = noteInfo.isRest || false;
      
      if (!isRest) {
        // Calculate note properties
        const scaleIndex = noteInfo.scaleIndex;
        const octaveOffset = noteInfo.octave || 0;
        const noteDuration = noteInfo.duration * beatDuration;
        
        // Calculate actual octave
        const actualOctave = currentOctave + octaveOffset;
        
        // Get the scale degree (0-based index in the scale)
        const scaleDegree = scaleIndex;
        
        // Get the semitone interval from the scale
        const semitones = scale[scaleDegree % scale.length];
        
        // Calculate octave adjustment based on wrapping through scale
        const octaveAdjust = Math.floor(scaleDegree / scale.length);
        
        // Calculate frequency from base frequency and semitones
        const frequency = settings.baseFreq * 
                        Math.pow(2, (semitones + 12 * (actualOctave + octaveAdjust)) / 12);
        
        // Create melodic note
        this.createEnhancedMelodicNote(
          context,
          frequency,
          noteDuration,
          noteInfo.velocity || 1.0,
          melodyGain,
          this.mood,
          // Information for note character
          {
            position: currentNoteIndex / currentPattern.notes.length,
            isAccented: noteInfo.accent || false,
            isLegato: noteInfo.legato || false,
            articulation: noteInfo.articulation || 'normal' // normal, staccato, legato
          }
        );
      }
      
      // Advance to next note
      currentNoteIndex++;
      
      // If we reached the end of the pattern
      if (currentNoteIndex >= currentPattern.notes.length) {
        currentNoteIndex = 0;
        variationCounter++;
        
        // Occasionally switch to a different pattern variation or octave
        if (variationCounter % 2 === 0) {
          // Switch pattern every 2 repetitions
          currentPatternIndex = (currentPatternIndex + 1) % melodicPatterns.length;
          
          // 25% chance to change octave
          if (Math.random() < 0.25) {
            // Choose between -1, 0, and 1, favoring 0
            const octaveChoices = [-1, 0, 0, 0, 1];
            currentOctave = octaveChoices[Math.floor(Math.random() * octaveChoices.length)];
          }
        }
      }
      
      // Calculate next note timing
      const nextNoteTiming = isRest ? 
                           (noteInfo.duration * beatDuration * 1000) : 
                           (noteInfo.nextDelay || 0) * 1000;
      
      // Schedule next note
      this.melodicPattern = setTimeout(() => {
        if (this.isPlaying) {
          playNextMelodicNote();
        }
      }, nextNoteTiming);
    };
    
    // Start the melodic pattern
    playNextMelodicNote();
  }
  
  // Create a melody processor chain
  createMelodyProcessor(context) {
    // Input and output nodes
    const input = context.createGain();
    const output = context.createGain();
    
    // Create EQ for melody
    const highpass = context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 250; // Remove low rumble
    
    const presence = context.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = 3000;
    presence.Q.value = 1;
    presence.gain.value = 3; // Boost presence for clarity
    
    // Create light compression
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 15;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.02;
    compressor.release.value = 0.15;
    
    // Create multi-tap delay for echo
    const delay = this.createMelodyDelay(context);
    
    // Connect chain
    input
      .connect(highpass)
      .connect(presence)
      .connect(compressor);
    
    // Split to delay (wet) and direct (dry)
    compressor.connect(output); // Direct/dry path
    compressor.connect(delay.input); // Wet path
    delay.output.connect(output); // Add delayed signal to output
    
    return { input, output };
  }
  
  // Create specialized delay for melody
  createMelodyDelay(context) {
    // Create input and output
    const input = context.createGain();
    const output = context.createGain();
    
    // Wet gain control
    const wetGain = context.createGain();
    wetGain.gain.value = 0.3; // 30% wet
    
    // Create delay line
    const delay = context.createDelay(3); // Max 3 seconds
    
    // Set delay time according to mood
    const moodToDelayTime = {
      'calm': 0.8,
      'soft': 0.7,
      'uplifting': 0.4,
      'warm': 0.5,
      'cosmic': 1.2,
      'mystical': 0.9,
      'bright': 0.3
    };
    
    delay.delayTime.value = moodToDelayTime[this.mood] || 0.5;
    
    // Create filter to darken the echoes
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2000;
    
    // Create feedback path
    const feedback = context.createGain();
    feedback.gain.value = 0.3; // 30% feedback
    
    // Connect everything
    input.connect(delay);
    delay.connect(filter);
    filter.connect(feedback);
    feedback.connect(delay); // Create feedback loop
    
    filter.connect(wetGain);
    wetGain.connect(output);
    
    return { input, output };
  }
  
  // Create enhanced melodic note with emotive qualities
  createEnhancedMelodicNote(context, frequency, duration, velocity, outputNode, mood, noteInfo) {
    // Create custom synthesizer type based on mood for emotional qualities
    let synthType;
    
    switch (mood) {
      case 'calm':
        synthType = 'glassy';
        break;
      case 'soft':
        synthType = 'gentle';
        break;
      case 'uplifting':
        synthType = 'bright';
        break;
      case 'warm':
        synthType = 'warm';
        break;
      case 'cosmic':
        synthType = 'ethereal';
        break;
      case 'mystical':
        synthType = 'crystal';
        break;
      case 'bright':
        synthType = 'sparkle';
        break;
      default:
        synthType = 'default';
    }
    
    // Create note gain
    const noteGain = context.createGain();
    noteGain.gain.value = 0; // Start silent
    
    // Calculate actual velocity
    const actualVelocity = velocity * (noteInfo.isAccented ? 1.25 : 1.0);
    
    // Create synth voice
    const synthVoice = this.createSynthVoice(context, frequency, synthType);
    
    // Connect synth to note gain
    synthVoice.output.connect(noteGain);
    
    // Connect note gain to output
    noteGain.connect(outputNode);
    
    // Create envelope based on articulation
    let attackTime, releaseTime;
    
    switch (noteInfo.articulation) {
      case 'staccato':
        attackTime = 0.01; // Very fast attack
        releaseTime = 0.1; // Short release
        break;
      case 'legato':
        attackTime = 0.1; // Slower attack
        releaseTime = 0.3 * duration; // Longer release
        break;
      case 'normal':
      default:
        attackTime = 0.03; // Normal attack
        releaseTime = 0.2 * duration; // Moderate release
    }
    
    // Ensure release doesn't exceed note duration
    releaseTime = Math.min(releaseTime, duration * 0.8);
    
    // Apply envelope
    noteGain.gain.setValueAtTime(0, context.currentTime);
    noteGain.gain.linearRampToValueAtTime(
      actualVelocity,
      context.currentTime + attackTime
    );
    
    // Sustain
    noteGain.gain.setValueAtTime(
      actualVelocity,
      context.currentTime + duration - releaseTime
    );
    
    // Release - use exponential ramp for more musical decay
    noteGain.gain.exponentialRampToValueAtTime(
      0.001, // Can't go to 0
      context.currentTime + duration
    );
    
    // Start oscillators
    synthVoice.start(context.currentTime);
    
    // Stop oscillators
    synthVoice.stop(context.currentTime + duration + 0.1);
  }
  
  // Create synth voice with different timbres for emotional variety
  createSynthVoice(context, frequency, type) {
    // Collection of oscillators and processing for this voice
    const oscillators = [];
    const gains = [];
    
    // Create base oscillator structure based on synth type
    switch (type) {
      case 'glassy': {
        // Glassy, pure tone with slight shimmer for calm, transparent emotions
        // Main sine oscillator
        const sine = context.createOscillator();
        sine.type = 'sine';
        sine.frequency.value = frequency;
        
        const sineGain = context.createGain();
        sineGain.gain.value = 0.7;
        
        sine.connect(sineGain);
        oscillators.push(sine);
        gains.push(sineGain);
        
        // Octave up for shimmer (very subtle)
        const octaveUp = context.createOscillator();
        octaveUp.type = 'sine';
        octaveUp.frequency.value = frequency * 2;
        
        const octaveGain = context.createGain();
        octaveGain.gain.value = 0.15;
        
        octaveUp.connect(octaveGain);
        oscillators.push(octaveUp);
        gains.push(octaveGain);
        
        // Subtle FM for movement
        const modulator = context.createOscillator();
        modulator.type = 'sine';
        modulator.frequency.value = frequency * 2.5;
        
        const modIndex = context.createGain();
        modIndex.gain.value = 0.3;
        
        modulator.connect(modIndex);
        modIndex.connect(sine.frequency);
        oscillators.push(modulator);
        
        break;
      }
      
      case 'gentle': {
        // Gentle rounded tone for soft, nurturing emotions
        // Main triangle oscillator
        const tri = context.createOscillator();
        tri.type = 'triangle';
        tri.frequency.value = frequency;
        
        const triGain = context.createGain();
        triGain.gain.value = 0.6;
        
        tri.connect(triGain);
        oscillators.push(tri);
        gains.push(triGain);
        
        // Sine for body
        const sine = context.createOscillator();
        sine.type = 'sine';
        sine.frequency.value = frequency;
        
        const sineGain = context.createGain();
        sineGain.gain.value = 0.4;
        
        sine.connect(sineGain);
        oscillators.push(sine);
        gains.push(sineGain);
        
        // Sub oscillator for warmth
        const sub = context.createOscillator();
        sub.type = 'sine';
        sub.frequency.value = frequency * 0.5;
        
        const subGain = context.createGain();
        subGain.gain.value = 0.3;
        
        sub.connect(subGain);
        oscillators.push(sub);
        gains.push(subGain);
        
        break;
      }
      
      case 'bright': {
        // Bright, sparkling tone for uplifting, joyful emotions
        // Main sawtooth
        const saw = context.createOscillator();
        saw.type = 'sawtooth';
        saw.frequency.value = frequency;
        
        const sawGain = context.createGain();
        sawGain.gain.value = 0.4;
        
        // Filter to shape tone
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 3000;
        filter.Q.value = 2;
        
        saw.connect(filter);
        filter.connect(sawGain);
        oscillators.push(saw);
        gains.push(sawGain);
        
        // Add square for body
        const square = context.createOscillator();
        square.type = 'square';
        square.frequency.value = frequency;
        square.detune.value = 7; // Slight detune
        
        const squareGain = context.createGain();
        squareGain.gain.value = 0.2;
        
        const squareFilter = context.createBiquadFilter();
        squareFilter.type = 'lowpass';
        squareFilter.frequency.value = 1000;
        
        square.connect(squareFilter);
        squareFilter.connect(squareGain);
        oscillators.push(square);
        gains.push(squareGain);
        
        // Add fifth for brightness
        const fifth = context.createOscillator();
        fifth.type = 'triangle';
        fifth.frequency.value = frequency * 1.5;
        
        const fifthGain = context.createGain();
        fifthGain.gain.value = 0.15;
        
        fifth.connect(fifthGain);
        oscillators.push(fifth);
        gains.push(fifthGain);
        
        break;
      }
      
      case 'warm': {
        // Warm, rich tone for comforting, intimate emotions
        // Main triangle
        const tri = context.createOscillator();
        tri.type = 'triangle';
        tri.frequency.value = frequency;
        
        const triGain = context.createGain();
        triGain.gain.value = 0.5;
        
        tri.connect(triGain);
        oscillators.push(tri);
        gains.push(triGain);
        
        // Add sawtooth for rich harmonics
        const saw = context.createOscillator();
        saw.type = 'sawtooth';
        saw.frequency.value = frequency;
        saw.detune.value = -5; // Slight detune
        
        const sawGain = context.createGain();
        sawGain.gain.value = 0.3;
        
        const sawFilter = context.createBiquadFilter();
        sawFilter.type = 'lowpass';
        sawFilter.frequency.value = 1200;
        
        saw.connect(sawFilter);
        sawFilter.connect(sawGain);
        oscillators.push(saw);
        gains.push(sawGain);
        
        // Sub oscillator for body
        const sub = context.createOscillator();
        sub.type = 'sine';
        sub.frequency.value = frequency * 0.5;
        
        const subGain = context.createGain();
        subGain.gain.value = 0.4;
        
        sub.connect(subGain);
        oscillators.push(sub);
        gains.push(subGain);
        
        break;
      }
      
      case 'ethereal': {
        // Ethereal, mysterious tone for cosmic, transcendent emotions
        // Main sine
        const sine = context.createOscillator();
        sine.type = 'sine';
        sine.frequency.value = frequency;
        
        const sineGain = context.createGain();
        sineGain.gain.value = 0.5;
        
        sine.connect(sineGain);
        oscillators.push(sine);
        gains.push(sineGain);
        
        // Add octave above
        const octave = context.createOscillator();
        octave.type = 'sine';
        octave.frequency.value = frequency * 2;
        
        const octaveGain = context.createGain();
        octaveGain.gain.value = 0.3;
        
        octave.connect(octaveGain);
        oscillators.push(octave);
        gains.push(octaveGain);
        
        // Add unusual interval for ethereal quality
        const unusual = context.createOscillator();
        unusual.type = 'sine';
        unusual.frequency.value = frequency * 2.7; // Unusual harmonic ratio
        
        const unusualGain = context.createGain();
        unusualGain.gain.value = 0.2;
        
        unusual.connect(unusualGain);
        oscillators.push(unusual);
        gains.push(unusualGain);
        
        // Add slow modulation
        const modulator = context.createOscillator();
        modulator.type = 'sine';
        modulator.frequency.value = 0.5;
        
        const modGain = context.createGain();
        modGain.gain.value = 5;
        
        modulator.connect(modGain);
        modGain.connect(sine.detune);
        modGain.connect(octave.detune);
        oscillators.push(modulator);
        
        break;
      }
      
      case 'crystal': {
        // Crystal-like, bell-like tone for mystical, magical emotions
        // Main sine
        const sine = context.createOscillator();
        sine.type = 'sine';
        sine.frequency.value = frequency;
        
        const sineGain = context.createGain();
        sineGain.gain.value = 0.3;
        
        sine.connect(sineGain);
        oscillators.push(sine);
        gains.push(sineGain);
        
        // Add several bell-like overtones
        // Bell tones have non-harmonic overtones
        const overtones = [
          { ratio: 2.0, gain: 0.2 },    // Octave
          { ratio: 3.0, gain: 0.1 },    // Octave + fifth
          { ratio: 4.2, gain: 0.05 },   // Slightly sharp double octave (inharmonicity)
          { ratio: 5.4, gain: 0.05 },   // Non-harmonic
          { ratio: 6.8, gain: 0.04 }    // Non-harmonic
        ];
        
        overtones.forEach(overtone => {
          const osc = context.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = frequency * overtone.ratio;
          
          const gain = context.createGain();
          gain.gain.value = overtone.gain;
          
          osc.connect(gain);
          oscillators.push(osc);
          gains.push(gain);
        });
        
        break;
      }
      
      case 'sparkle': {
        // Bright sparkling tone for brilliant, celebratory emotions
        // Main sawtooth
        const saw = context.createOscillator();
        saw.type = 'sawtooth';
        saw.frequency.value = frequency;
        
        const sawGain = context.createGain();
        sawGain.gain.value = 0.3;
        
        // Bright filter
        const filter = context.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = frequency * 3;
        filter.Q.value = 1;
        
        saw.connect(filter);
        filter.connect(sawGain);
        oscillators.push(saw);
        gains.push(sawGain);
        
        // Add square for body
        const square = context.createOscillator();
        square.type = 'square';
        square.frequency.value = frequency;
        square.detune.value = 10; // Detune for movement
        
        const squareGain = context.createGain();
        squareGain.gain.value = 0.2;
        
        square.connect(squareGain);
        oscillators.push(square);
        gains.push(squareGain);
        
        // Add high harmonics
        const highOsc = context.createOscillator();
        highOsc.type = 'triangle';
        highOsc.frequency.value = frequency * 4;
        
        const highGain = context.createGain();
        highGain.gain.value = 0.1;
        
        highOsc.connect(highGain);
        oscillators.push(highOsc);
        gains.push(highGain);
        
        break;
      }
      
      default: {
        // Default balanced tone
        // Main sine
        const sine = context.createOscillator();
        sine.type = 'sine';
        sine.frequency.value = frequency;
        
        const sineGain = context.createGain();
        sineGain.gain.value = 0.6;
        
        sine.connect(sineGain);
        oscillators.push(sine);
        gains.push(sineGain);
        
        // Add triangle for harmonics
        const tri = context.createOscillator();
        tri.type = 'triangle';
        tri.frequency.value = frequency;
        tri.detune.value = 5;
        
        const triGain = context.createGain();
        triGain.gain.value = 0.3;
        
        tri.connect(triGain);
        oscillators.push(tri);
        gains.push(triGain);
      }
    }
    
    // Create master output for this voice
    const output = context.createGain();
    
    // Connect all oscillator gains to output
    gains.forEach(gain => gain.connect(output));
    
    // Return interface
    return {
      output,
      start: (time) => {
        oscillators.forEach(osc => osc.start(time));
      },
      stop: (time) => {
        oscillators.forEach(osc => osc.stop(time));
        this.oscillators.push(...oscillators);
      }
    };
  }
  
  // Get melodic patterns appropriate for the current mood
  getMelodicPatternForMood(mood, scale) {
    // Define different melodic patterns for each mood
    // Each pattern consists of a sequence of notes with various properties
    
    switch (mood) {
      case 'calm': {
        // Calm mood - gentle, floating patterns with space between notes
        return [
          {
            name: 'Gentle Descent',
            notes: [
              { scaleIndex: 4, duration: 1.5, velocity: 0.8, articulation: 'legato' },
              { scaleIndex: 2, duration: 1.5, velocity: 0.7, articulation: 'legato' },
              { scaleIndex: 0, duration: 2, velocity: 0.9, articulation: 'legato' },
              { isRest: true, duration: 1 },
              { scaleIndex: 1, duration: 1.5, velocity: 0.7, articulation: 'legato' },
              { scaleIndex: 0, duration: 2.5, velocity: 0.8, articulation: 'legato' },
              { isRest: true, duration: 2 }
            ]
          },
          {
            name: 'Floating Arpeggios',
            notes: [
              { scaleIndex: 0, duration: 1, velocity: 0.8, articulation: 'normal' },
              { scaleIndex: 2, duration: 1, velocity: 0.7, articulation: 'normal' },
              { scaleIndex: 4, duration: 1, velocity: 0.9, articulation: 'normal' },
              { scaleIndex: 2, duration: 1, velocity: 0.7, articulation: 'normal' },
              { isRest: true, duration: 1 },
              { scaleIndex: 0, octave: 1, duration: 1, velocity: 0.8, articulation: 'normal' },
              { scaleIndex: 4, duration: 1, velocity: 0.7, articulation: 'normal' },
              { scaleIndex: 2, duration: 1, velocity: 0.6, articulation: 'normal' },
              { isRest: true, duration: 1 }
            ]
          }
        ];
      }
      
      case 'soft': {
        // Soft mood - gentle, smooth, connected patterns
        return [
          {
            name: 'Gentle Flow',
            notes: [
              { scaleIndex: 0, duration: 1, velocity: 0.7, articulation: 'legato' },
              { scaleIndex: 1, duration: 1, velocity: 0.6, articulation: 'legato' },
              { scaleIndex: 2, duration: 1, velocity: 0.8, articulation: 'legato' },
              { scaleIndex: 4, duration: 1.5, velocity: 0.9, articulation: 'legato' },
              { scaleIndex: 2, duration: 1, velocity: 0.7, articulation: 'legato' },
              { scaleIndex: 0, duration: 1.5, velocity: 0.6, articulation: 'legato' },
              { isRest: true, duration: 1 }
            ]
          },
          {
            name: 'Soft Waves',
            notes: [
              { scaleIndex: 0, duration: 1, velocity: 0.7, articulation: 'legato' },
              { scaleIndex: 2, duration: 1.5, velocity: 0.8, articulation: 'legato' },
              { scaleIndex: 1, duration: 1, velocity: 0.6, articulation: 'legato' },
              { scaleIndex: 4, duration: 2, velocity: 0.9, articulation: 'legato' },
              { scaleIndex: 2, duration: 1.5, velocity: 0.7, articulation: 'legato' },
              { isRest: true, duration: 1 }
            ]
          }
        ];
      }
      
      case 'uplifting': {
        // Uplifting mood - active, rising patterns with clear rhythm and accents
        return [
          {
            name: 'Rising Joy',
            notes: [
              { scaleIndex: 0, duration: 0.5, velocity: 0.8, articulation: 'normal' },
              { scaleIndex: 2, duration: 0.5, velocity: 0.7, articulation: 'normal' },
              { scaleIndex: 4, duration: 0.5, velocity: 0.8, articulation: 'normal' },
              { scaleIndex: 7, duration: 1, velocity: 1.0, accent: true, articulation: 'normal' },
              { scaleIndex: 4, duration: 0.5, velocity: 0.7, articulation: 'normal' },
              { scaleIndex: 7, duration: 0.5, velocity: 0.8, articulation: 'normal' },
              { scaleIndex: 9, duration: 1, velocity: 1.0, accent: true, articulation: 'normal' },
              { scaleIndex: 7, duration: 0.5, velocity: 0.7, articulation: 'staccato' },
              { scaleIndex: 4, duration: 0.5, velocity: 0.7, articulation: 'staccato' },
              { scaleIndex: 7, duration: 0.5, velocity: 1.0, accent: true, articulation: 'normal' }
            ]
          },
          {
            name: 'Joyful Bounce',
            notes: [
              { scaleIndex: 0, duration: 0.5, velocity: 0.9, articulation: 'staccato' },
              { isRest: true, duration: 0.25 },
              { scaleIndex: 0, duration: 0.25, velocity: 0.7, articulation: 'staccato' },
              { scaleIndex: 4, duration: 0.5, velocity: 0.8, articulation: 'normal' },
              { scaleIndex: 7, duration: 0.75, velocity: 1.0, accent: true, articulation: 'normal' },
              { scaleIndex: 9, duration: 0.5, velocity: 0.8, articulation: 'staccato' },
              { scaleIndex: 7, duration: 0.25, velocity: 0.7, articulation: 'staccato' },
              { scaleIndex: 4, duration: 0.5, velocity: 0.8, articulation: 'normal' },
              { scaleIndex: 2, duration: 0.5, velocity: 0.7, articulation: 'normal' },
              { scaleIndex: 4, duration: 1, velocity: 0.9, articulation: 'normal' }
            ]
          }
        ];
      }
      
      case 'warm': {
        // Warm mood - mid-paced, inviting patterns with warm intervals (3rds, 6ths)
        return [
          {
            name: 'Warm Embrace',
            notes: [
              { scaleIndex: 0, duration: 1, velocity: 0.8, articulation: 'normal' },
              { scaleIndex: 2, duration: 1, velocity: 0.9, articulation: 'normal' },
              { scaleIndex: 4, duration: 1.5, velocity: 0.8, articulation: 'normal' },
              { scaleIndex: 2, duration: 0.5, velocity: 0.7, articulation: 'normal' },
              { scaleIndex: 0, duration: 1, velocity: 0.8, articulation: 'normal' },
              { scaleIndex: 4, duration: 2, velocity: 0.9, articulation: 'legato' },
              { isRest: true, duration: 1 }
            ]
          },
          {
            name: 'Cozy Flow',
            notes: [
              { scaleIndex: 0, duration: 1, velocity: 0.8, articulation: 'normal' },
              { scaleIndex: 4, duration: 0.5, velocity: 0.7, articulation: 'normal' },
              { scaleIndex: 5, duration: 0.5, velocity: 0.7, articulation: 'normal' },
              { scaleIndex: 7, duration: 1, velocity: 0.9, articulation: 'normal' },
              { scaleIndex: 5, duration: 0.5, velocity: 0.7, articulation: 'normal' },
              { scaleIndex: 4, duration: 0.5, velocity: 0.7, articulation: 'normal' },
              { scaleIndex: 2, duration: 1, velocity: 0.8, articulation: 'normal' },
              { scaleIndex: 0, duration: 1.5, velocity: 0.9, articulation: 'legato' }
            ]
          }
        ];
      }
      
      case 'cosmic': {
        // Cosmic mood - spacious, unusual intervals, slow evolving patterns
        return [
          {
            name: 'Cosmic Expanse',
            notes: [
              { scaleIndex: 0, duration: 2, velocity: 0.7, articulation: 'legato' },
              { scaleIndex: 7, duration: 2, velocity: 0.8, articulation: 'legato' },
              { scaleIndex: 4, duration: 3, velocity: 0.9, articulation: 'legato' },
              { isRest: true, duration: 1 },
              { scaleIndex: 2, duration: 2, velocity: 0.7, articulation: 'legato' },
              { scaleIndex: 0, octave: 1, duration: 4, velocity: 0.8, articulation: 'legato' },
              { isRest: true, duration: 2 }
            ]
          },
          {
            name: 'Stellar Journey',
            notes: [
              { scaleIndex: 0, octave: 1, duration: 2, velocity: 0.6, articulation: 'legato' },
              { scaleIndex: 6, duration: 2, velocity: 0.7, articulation: 'legato' },
              { scaleIndex: 4, duration: 1.5, velocity: 0.6, articulation: 'legato' },
              { scaleIndex: 2, duration: 2.5, velocity: 0.8, articulation: 'legato' },
              { isRest: true, duration: 2 },
              { scaleIndex: 0, duration: 3, velocity: 0.7, articulation: 'legato' },
              { isRest: true, duration: 3 }
            ]
          }
        ];
      }
      
      case 'mystical': {
        // Mystical mood - exotic scales, unusual rhythms, dreamy
        return [
          {
            name: 'Ancient Mystery',
            notes: [
              { scaleIndex: 0, duration: 1, velocity: 0.9, articulation: 'normal' },
              { scaleIndex: 1, duration: 0.5, velocity: 0.7, articulation: 'normal' },
              { scaleIndex: 4, duration: 1.5, velocity: 0.8, articulation: 'normal' },
              { scaleIndex: 6, duration: 2, velocity: 0.9, articulation: 'legato' },
              { isRest: true, duration: 1 },
              { scaleIndex: 4, duration: 0.5, velocity: 0.7, articulation: 'staccato' },
              { scaleIndex: 1, duration: 0.5, velocity: 0.7, articulation: 'staccato' },
              { scaleIndex: 0, octave: 1, duration: 2, velocity: 0.8, articulation: 'legato' },
              { isRest: true, duration: 1.5 }
            ]
          },
          {
            name: 'Mystical Incantation',
            notes: [
              { scaleIndex: 0, duration: 0.5, velocity: 0.8, articulation: 'normal' },
              { scaleIndex: 3, duration: 0.5, velocity: 0.7, articulation: 'normal' },
              { isRest: true, duration: 0.25 },
              { scaleIndex: 5, duration: 0.75, velocity: 0.9, articulation: 'normal' },
              { scaleIndex: 6, duration: 1, velocity: 0.8, articulation: 'normal' },
              { scaleIndex: 5, duration: 0.5, velocity: 0.7, articulation: 'normal' },
              { scaleIndex: 3, duration: 0.5, velocity: 0.7, articulation: 'normal' },
              { scaleIndex: 0, duration: 1.5, velocity: 0.9, articulation: 'legato' },
              { isRest: true, duration: 1 }
            ]
          }
        ];
      }
      
      case 'bright': {
        // Bright mood - active, playful, major scales, quick articulations
        return [
          {
            name: 'Sunlit Dance',
            notes: [
              { scaleIndex: 0, duration: 0.5, velocity: 0.8, articulation: 'staccato' },
              { scaleIndex: 2, duration: 0.5, velocity: 0.7, articulation: 'staccato' },
              { scaleIndex: 4, duration: 0.5, velocity: 0.9, accent: true, articulation: 'normal' },
              { scaleIndex: 2, duration: 0.5, velocity: 0.7, articulation: 'staccato' },
              { scaleIndex: 4, duration: 0.5, velocity: 0.8, articulation: 'staccato' },
              { scaleIndex: 7, duration: 0.5, velocity: 1.0, accent: true, articulation: 'normal' },
              { scaleIndex: 4, duration: 0.5, velocity: 0.7, articulation: 'staccato' },
              { scaleIndex: 7, duration: 0.5, velocity: 0.9, articulation: 'normal' },
              { scaleIndex: 9, duration: 1, velocity: 0.8, articulation: 'normal' }
            ]
          },
          {
            name: 'Playful Skip',
            notes: [
              { scaleIndex: 0, duration: 0.25, velocity: 0.8, articulation: 'staccato' },
              { scaleIndex: 4, duration: 0.25, velocity: 0.8, articulation: 'staccato' },
              { scaleIndex: 7, duration: 0.5, velocity: 0.9, articulation: 'normal' },
              { isRest: true, duration: 0.25 },
              { scaleIndex: 7, duration: 0.25, velocity: 0.7, articulation: 'staccato' },
              { scaleIndex: 9, duration: 0.5, velocity: 0.8, articulation: 'normal' },
              { scaleIndex: 7, duration: 0.25, velocity: 0.7, articulation: 'staccato' },
              { scaleIndex: 4, duration: 0.25, velocity: 0.7, articulation: 'staccato' },
              { scaleIndex: 0, octave: 1, duration: 0.5, velocity: 0.9, accent: true, articulation: 'normal' },
              { scaleIndex: 9, duration: 0.25, velocity: 0.7, articulation: 'staccato' },
              { scaleIndex: 7, duration: 0.25, velocity: 0.7, articulation: 'staccato' },
              { scaleIndex: 4, duration: 0.5, velocity: 0.8, articulation: 'normal' }
            ]
          }
        ];
      }
      
      default: {
        // Default balanced pattern
        return [
          {
            name: 'Balanced Melody',
            notes: [
              { scaleIndex: 0, duration: 1, velocity: 0.8, articulation: 'normal' },
              { scaleIndex: 2, duration: 1, velocity: 0.7, articulation: 'normal' },
              { scaleIndex: 4, duration: 1, velocity: 0.9, articulation: 'normal' },
              { scaleIndex: 2, duration: 1, velocity: 0.7, articulation: 'normal' },
              { scaleIndex: 0, duration: 2, velocity: 0.8, articulation: 'normal' },
              { isRest: true, duration: 1 }
            ]
          }
        ];
      }
    }
  }
  
  // Create bass pattern with emotional resonance
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
    bassGain.gain.value = 0; // Start at 0 for fade-in
    
    // Fade in bass
    bassGain.gain.setValueAtTime(0, context.currentTime);
    bassGain.gain.linearRampToValueAtTime(
      settings.bassVolume,
      context.currentTime + 2.0
    );
    
    // Create multi-band processing chain for bass
    const bassProcessor = this.createBassProcessor(context);
    
    // Connect gain to bass processor
    bassGain.connect(bassProcessor.input);
    bassProcessor.output.connect(masterGain);
    
    // Get scale for current mood
    const scale = musicalScales[settings.scale] || musicalScales.pentatonic;
    
    // Calculate tempo-related values
    const tempo = settings.tempo;
    const beatDuration = 60 / tempo;
    const noteDuration = beatDuration * 2; // Half-notes for bass typically
    
    // Create bass pattern based on mood
    // Different moods use different patterns and rhythm feels
    let bassPattern;
    const baseNote = 0; // Root note
    
    // Pattern includes both note intervals and relative durations
    switch (this.mood) {
      case 'calm':
        // Simple, steady pattern with long notes
        bassPattern = [
          { note: baseNote, duration: 4 },
          { note: baseNote + 7, duration: 2 },
          { note: baseNote + 5, duration: 2 }
        ];
        break;
        
      case 'soft':
        // Gentle, flowing pattern
        bassPattern = [
          { note: baseNote, duration: 2 },
          { note: baseNote + 5, duration: 1 },
          { note: baseNote + 3, duration: 2 },
          { note: baseNote + 5, duration: 1 }
        ];
        break;
        
      case 'uplifting':
        // More active, upward moving pattern
        bassPattern = [
          { note: baseNote, duration: 1 },
          { note: baseNote + 7, duration: 1 },
          { note: baseNote + 9, duration: 1 },
          { note: baseNote + 12, duration: 0.5 },
          { note: baseNote + 9, duration: 0.5 }
        ];
        break;
        
      case 'warm':
        // Warm, comfortable pattern with emphasis on major 3rd
        bassPattern = [
          { note: baseNote, duration: 2 },
          { note: baseNote + 4, duration: 1 },
          { note: baseNote + 5, duration: 1 },
          { note: baseNote + 7, duration: 1 },
          { note: baseNote + 4, duration: 1 }
        ];
        break;
        
      case 'cosmic':
        // Sparse, mysterious pattern with unusual intervals
        bassPattern = [
          { note: baseNote, duration: 3 },
          { note: baseNote + 5, duration: 3 },
          { note: baseNote + 1, duration: 2 }, // Minor 2nd creates tension
          { note: baseNote + 7, duration: 2 }
        ];
        break;
        
      case 'mystical':
        // Unusual pattern with tritone
        bassPattern = [
          { note: baseNote, duration: 2 },
          { note: baseNote + 5, duration: 1 },
          { note: baseNote + 6, duration: 2 }, // Tritone
          { note: baseNote + 2, duration: 1 }
        ];
        break;
        
      case 'bright':
        // Active, bright pattern with emphasis on major 3rds and 6ths
        bassPattern = [
          { note: baseNote, duration: 1 },
          { note: baseNote + 4, duration: 1 },
          { note: baseNote + 9, duration: 1 }, // 6th
          { note: baseNote + 7, duration: 1 }
        ];
        break;
        
      default:
        // Default balanced pattern
        bassPattern = [
          { note: baseNote, duration: 2 },
          { note: baseNote + 7, duration: 1 },
          { note: baseNote + 5, duration: 1 }
        ];
    }
    
    // Pattern state
    let patternIndex = 0;
    let currentBeat = 0;
    
    // Get total pattern duration in beats
    const totalPatternBeats = bassPattern.reduce((sum, item) => sum + item.duration, 0);
    
    // Function to play the next bass note in the pattern
    const playNextBassNote = () => {
      const patternItem = bassPattern[patternIndex];
      
      // Get note properties
      const noteIndex = patternItem.note;
      const duration = patternItem.duration * beatDuration; // Convert to seconds
      
      // Calculate frequency
      const frequency = settings.baseFreq * 0.25 * Math.pow(2, noteIndex / 12);
      
      // Create enhanced bass tone with multiple oscillators and processing
      this.createEnhancedBassTone(
        context, 
        frequency, 
        duration, 
        bassGain, 
        this.mood,
        currentBeat / totalPatternBeats // Normalized position in pattern
      );
      
      // Update beat counter
      currentBeat += patternItem.duration;
      if (currentBeat >= totalPatternBeats) {
        currentBeat = 0;
      }
      
      // Advance to next note in pattern
      patternIndex = (patternIndex + 1) % bassPattern.length;
      
      // Schedule next note
      this.bassPattern = setTimeout(() => {
        if (this.isPlaying) {
          playNextBassNote();
        }
      }, duration * 1000);
    };
    
    // Start the pattern
    playNextBassNote();
  }
  
  // Create a specialized bass processor chain
  createBassProcessor(context) {
    // Input and output nodes
    const input = context.createGain();
    const output = context.createGain();
    
    // Create bass-specific EQ
    const lowShelf = context.createBiquadFilter();
    lowShelf.type = 'lowshelf';
    lowShelf.frequency.value = 120;
    lowShelf.gain.value = 3; // Boost bass
    
    const lowMid = context.createBiquadFilter();
    lowMid.type = 'peaking';
    lowMid.frequency.value = 250;
    lowMid.Q.value = 1;
    lowMid.gain.value = -2; // Cut muddy frequencies
    
    const highCut = context.createBiquadFilter();
    highCut.type = 'lowpass';
    highCut.frequency.value = 5000;
    highCut.Q.value = 0.7;
    
    // Create compressor specifically for bass
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 10;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.1;
    
    // Create bass enhancer for richness
    const bassEnhancer = this.createBassEnhancer(context);
    
    // Connect everything
    input
      .connect(lowShelf)
      .connect(lowMid)
      .connect(highCut)
      .connect(bassEnhancer.input);
    
    bassEnhancer.output
      .connect(compressor)
      .connect(output);
    
    return { input, output };
  }
  
  // Create bass enhancer effect for added depth and richness
  createBassEnhancer(context) {
    // Create input and output nodes
    const input = context.createGain();
    const output = context.createGain();
    
    // Direct path
    const directGain = context.createGain();
    directGain.gain.value = 0.7; // 70% direct signal
    
    input.connect(directGain);
    directGain.connect(output);
    
    // Create harmonic generator
    // Uses waveshaper to generate harmonics
    const harmonicShaper = context.createWaveShaper();
    const harmonicGain = context.createGain();
    harmonicGain.gain.value = 0.3; // 30% harmonic content
    
    // Create harmonics shape
    const harmonicCurve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i - 512) / 512;
      // This curve adds both even (octave, 2x) and odd (fifth, 3x) harmonics
      harmonicCurve[i] = (x * x * x) + (x * x) * 0.5;
    }
    
    harmonicShaper.curve = harmonicCurve;
    
    // Filter to focus the harmonics
    const harmonicFilter = context.createBiquadFilter();
    harmonicFilter.type = 'bandpass';
    harmonicFilter.frequency.value = 300; // Focus around 300Hz
    harmonicFilter.Q.value = 0.5;
    
    // Connect harmonic path
    input.connect(harmonicShaper);
    harmonicShaper.connect(harmonicFilter);
    harmonicFilter.connect(harmonicGain);
    harmonicGain.connect(output);
    
    return { input, output };
  }
  
  // Create enhanced bass tone with rich harmonics
  createEnhancedBassTone(context, frequency, duration, outputNode, mood, patternPosition) {
    // Create gain node for this note
    const noteGain = context.createGain();
    noteGain.gain.value = 0; // Start silent
    
    // Sub-oscillator (sine wave, one octave down for deep bass)
    const subOsc = context.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.value = frequency * 0.5;
    
    // Main oscillator
    const mainOsc = context.createOscillator();
    
    // Choose waveform based on mood for appropriate bass character
    const waveforms = {
      'calm': 'sine',
      'soft': 'sine',
      'uplifting': 'triangle',
      'warm': 'triangle',
      'cosmic': 'triangle',
      'mystical': 'triangle',
      'bright': 'sawtooth'
    };
    
    mainOsc.type = waveforms[mood] || 'triangle';
    mainOsc.frequency.value = frequency;
    
    // Second oscillator for harmonic richness
    const harmOsc = context.createOscillator();
    harmOsc.type = 'sawtooth';
    harmOsc.frequency.value = frequency;
    
    // Add slight detune between oscillators for movement
    mainOsc.detune.value = -7;
    harmOsc.detune.value = 7;
    
    // Create filter for harmonic oscillator to tame harshness
    const harmFilter = context.createBiquadFilter();
    harmFilter.type = 'lowpass';
    harmFilter.frequency.value = frequency * 4;
    harmFilter.Q.value = 2;
    
    // Create envelope for filter - add movement to the tone
    harmFilter.frequency.setValueAtTime(frequency * 8, context.currentTime);
    harmFilter.frequency.exponentialRampToValueAtTime(
      frequency * 2,
      context.currentTime + 0.1
    );
    
    // Create gain nodes for each oscillator layer
    const subGain = context.createGain();
    const mainGain = context.createGain();
    const harmGain = context.createGain();
    
    // Set relative levels - adjust based on mood
    // Darker moods = more sub, brighter moods = more harmonics
    const moodToSubLevel = {
      'calm': 0.7,
      'soft': 0.65,
      'uplifting': 0.5,
      'warm': 0.6,
      'cosmic': 0.8,
      'mystical': 0.7,
      'bright': 0.5
    };
    
    const subLevel = moodToSubLevel[mood] || 0.6;
    
    subGain.gain.value = subLevel;
    mainGain.gain.value = 0.7;
    harmGain.gain.value = 1 - subLevel;
    
    // Connect oscillators to their gain nodes
    subOsc.connect(subGain);
    mainOsc.connect(mainGain);
    harmOsc.connect(harmFilter);
    harmFilter.connect(harmGain);
    
    // Connect gain nodes to the note gain
    subGain.connect(noteGain);
    mainGain.connect(noteGain);
    harmGain.connect(noteGain);
    
    // Connect note gain to output
    noteGain.connect(outputNode);
    
    // Create dynamic envelope based on note position in pattern
    // First notes are more emphasized
    let attackTime, releaseTime;
    if (patternPosition < 0.1) {
      // First note - stronger attack
      attackTime = 0.03;
      releaseTime = duration * 0.2;
    } else {
      // Other notes - smoother
      attackTime = 0.05;
      releaseTime = duration * 0.3;
    }
    
    // Make sure release doesn't exceed note duration
    releaseTime = Math.min(releaseTime, duration * 0.8);
    
    // Apply envelope
    noteGain.gain.setValueAtTime(0, context.currentTime);
    noteGain.gain.linearRampToValueAtTime(
      1, 
      context.currentTime + attackTime
    );
    
    noteGain.gain.setValueAtTime(
      1,
      context.currentTime + duration - releaseTime
    );
    
    noteGain.gain.exponentialRampToValueAtTime(
      0.001, // Can't ramp to 0 with exponentialRamp
      context.currentTime + duration
    );
    
    // Start oscillators
    subOsc.start(context.currentTime);
    mainOsc.start(context.currentTime);
    harmOsc.start(context.currentTime);
    
    // Stop oscillators
    const stopTime = context.currentTime + duration + 0.1; // Small buffer
    subOsc.stop(stopTime);
    mainOsc.stop(stopTime);
    harmOsc.stop(stopTime);
    
    // Store for cleanup
    this.oscillators.push(subOsc);
    this.oscillators.push(mainOsc);
    this.oscillators.push(harmOsc);
  }
  
  // Create percussion pattern
  createPercussionPattern(settings) {
    const context = this.audioContext;
    const masterGain = this.masterGain;
    
    if (!context || !masterGain) return;
    
    // Clear any existing pattern
    if (this.percussionPattern) {
      clearInterval(this.percussionPattern);
      clearTimeout(this.percussionPattern);
    }
    
    // Create main gain for percussion
    const percussionGain = context.createGain();
    percussionGain.gain.value = 0; // Start silent
    percussionGain.connect(masterGain);
    
    // Fade in gradually
    percussionGain.gain.setValueAtTime(0, context.currentTime);
    percussionGain.gain.linearRampToValueAtTime(
      settings.percussionVolume || 0.2,
      context.currentTime + 5.0 // 5 second fade in for percussion
    );
    
    // Get appropriate pattern based on mood
    const pattern = this.getPercussionPatternForMood(this.mood);
    
    // Create processing for percussion
    const percussionProcessor = this.createPercussionProcessor(context);
    percussionProcessor.output.connect(percussionGain);
    
    // Calculate tempo
    const tempo = settings.tempo;
    const beatDuration = 60 / tempo;
    
    // Pattern playback state
    let currentStep = 0;
    const totalSteps = pattern.steps.length;
    
    // Play percussion patterns
    const playPercussionStep = () => {
      const step = pattern.steps[currentStep];
      
      // For each instrument in this step
      step.forEach(instrument => {
        if (instrument.play) {
          // Play this instrument
          switch (instrument.type) {
            case 'kick':
              this.createKickDrum(context, percussionProcessor.input, 
                               instrument.velocity || 1, instrument.variation || 0);
              break;
            case 'snare':
              this.createSnareDrum(context, percussionProcessor.input, 
                                instrument.velocity || 1, instrument.variation || 0);
              break;
            case 'hihat':
              this.createHiHat(context, percussionProcessor.input, 
                            instrument.velocity || 1, 
                            instrument.open || false, 
                            instrument.variation || 0);
              break;
            case 'shaker':
              this.createShaker(context, percussionProcessor.input, 
                             instrument.velocity || 1, instrument.variation || 0);
              break;
            case 'tom':
              this.createTom(context, percussionProcessor.input, 
                          instrument.velocity || 1, 
                          instrument.pitch || 'mid',
                          instrument.variation || 0);
              break;
            case 'rim':
              this.createRimshot(context, percussionProcessor.input, 
                              instrument.velocity || 1, instrument.variation || 0);
              break;
          }
        }
      });
      
      // Move to next step
      currentStep = (currentStep + 1) % totalSteps;
      
      // Schedule next step
      this.percussionPattern = setTimeout(() => {
        if (this.isPlaying) {
          playPercussionStep();
        }
      }, beatDuration * pattern.stepDuration * 1000);
    };
    
    // Start the pattern
    playPercussionStep();
  }
  
  // Get percussion pattern based on mood for rhythmic emotional support
  getPercussionPatternForMood(mood) {
    // All patterns are defined as arrays of steps
    // Each step contains instruments that either play or don't play
    // This allows for complex rhythmic patterns
    
    switch (mood) {
      case 'uplifting': {
        // Energetic pattern with focus on 4/4 rhythm
        return {
          steps: [
            // Beat 1
            [
              { type: 'kick', play: true, velocity: 1.0 },
              { type: 'hihat', play: true, velocity: 0.8, open: false },
              { type: 'snare', play: false },
              { type: 'shaker', play: true, velocity: 0.7 }
            ],
            // And
            [
              { type: 'kick', play: false },
              { type: 'hihat', play: true, velocity: 0.6, open: false },
              { type: 'snare', play: false },
              { type: 'shaker', play: false }
            ],
            // Beat 2
            [
              { type: 'kick', play: false },
              { type: 'hihat', play: true, velocity: 0.7, open: false },
              { type: 'snare', play: true, velocity: 0.9 },
              { type: 'shaker', play: true, velocity: 0.7 }
            ],
            // And
            [
              { type: 'kick', play: false },
              { type: 'hihat', play: true, velocity: 0.6, open: true },
              { type: 'snare', play: false },
              { type: 'shaker', play: false }
            ],
            // Beat 3
            [
              { type: 'kick', play: true, velocity: 0.9 },
              { type: 'hihat', play: true, velocity: 0.8, open: false },
              { type: 'snare', play: false },
              { type: 'shaker', play: true, velocity: 0.7 }
            ],
            // And
            [
              { type: 'kick', play: false },
              { type: 'hihat', play: true, velocity: 0.6, open: false },
              { type: 'snare', play: false },
              { type: 'shaker', play: false }
            ],
            // Beat 4
            [
              { type: 'kick', play: false },
              { type: 'hihat', play: true, velocity: 0.7, open: false },
              { type: 'snare', play: true, velocity: 1.0 },
              { type: 'shaker', play: true, velocity: 0.7 }
            ],
            // And
            [
              { type: 'kick', play: false },
              { type: 'hihat', play: true, velocity: 0.6, open: true },
              { type: 'snare', play: false },
              { type: 'shaker', play: false }
            ]
          ],
          stepDuration: 0.5 // 8th notes
        };
      }
      
      case 'warm': {
        // Mid-tempo warm pattern with subtle groove
        return {
          steps: [
            // Beat 1
            [
              { type: 'kick', play: true, velocity: 0.9 },
              { type: 'hihat', play: true, velocity: 0.7, open: false },
              { type: 'snare', play: false },
              { type: 'shaker', play: false }
            ],
            // Beat 1.5
            [
              { type: 'kick', play: false },
              { type: 'hihat', play: false },
              { type: 'snare', play: false },
              { type: 'shaker', play: true, velocity: 0.7 }
            ],
            // Beat 2
            [
              { type: 'kick', play: false },
              { type: 'hihat', play: true, velocity: 0.6, open: false },
              { type: 'snare', play: true, velocity: 0.8 },
              { type: 'shaker', play: false }
            ],
            // Beat 2.5
            [
              { type: 'kick', play: false },
              { type: 'hihat', play: false },
              { type: 'snare', play: false },
              { type: 'shaker', play: true, velocity: 0.6 }
            ],
            // Beat 3
            [
              { type: 'kick', play: true, velocity: 0.8 },
              { type: 'hihat', play: true, velocity: 0.7, open: false },
              { type: 'snare', play: false },
              { type: 'shaker', play: false }
            ],
            // Beat 3.5
            [
              { type: 'kick', play: false },
              { type: 'hihat', play: false },
              { type: 'snare', play: false },
              { type: 'shaker', play: true, velocity: 0.7 }
            ],
            // Beat 4
            [
              { type: 'kick', play: false },
              { type: 'hihat', play: true, velocity: 0.6, open: false },
              { type: 'snare', play: true, velocity: 0.7 },
              { type: 'shaker', play: false }
            ],
            // Beat 4.5
            [
              { type: 'kick', play: true, velocity: 0.6, variation: 0.5 },
              { type: 'hihat', play: false },
              { type: 'snare', play: false },
              { type: 'shaker', play: true, velocity: 0.6 }
            ]
          ],
          stepDuration: 0.5 // 8th notes
        };
      }
      
      case 'soft': {
        // Very gentle, minimal pattern
        return {
          steps: [
            // Beat 1
            [
              { type: 'kick', play: true, velocity: 0.7 },
              { type: 'hihat', play: false },
              { type: 'shaker', play: false }
            ],
            // Beat 2
            [
              { type: 'kick', play: false },
              { type: 'hihat', play: true, velocity: 0.5, open: false },
              { type: 'shaker', play: false }
            ],
            // Beat 3
            [
              { type: 'kick', play: false },
              { type: 'hihat', play: false },
              { type: 'shaker', play: true, velocity: 0.4 }
            ],
            // Beat 4
            [
              { type: 'kick', play: false },
              { type: 'hihat', play: true, velocity: 0.6, open: false },
              { type: 'shaker', play: false }
            ]
          ],
          stepDuration: 1.0 // Quarter notes
        };
      }
      
      case 'bright': {
        // Dynamic, active pattern with 16th note subdivisions for sparkle
        return {
          steps: [
            // Beat 1
            [
              { type: 'kick', play: true, velocity: 0.9 },
              { type: 'hihat', play: true, velocity: 0.8, open: false },
              { type: 'snare', play: false },
              { type: 'shaker', play: true, velocity: 0.7 }
            ],
            // Beat 1.25
            [
              { type: 'kick', play: false },
              { type: 'hihat', play: false },
              { type: 'snare', play: false },
              { type: 'shaker', play: false }
            ],
            // Beat 1.5
            [
              { type: 'kick', play: false },
              { type: 'hihat', play: true, velocity: 0.6, open: false },
              { type: 'snare', play: false },
              { type: 'shaker', play: true, velocity: 0.5 }
            ],
            // Beat 1.75
            [
              { type: 'kick', play: false },
              { type: 'hihat', play: false },
              { type: 'snare', play: false },
              { type: 'shaker', play: false }
            ],
            // Beat 2
            [
              { type: 'kick', play: false },
              { type: 'hihat', play: true, velocity: 0.7, open: false },
              { type: 'snare', play: true, velocity: 0.9 },
              { type: 'shaker', play: true, velocity: 0.7 }
            ],
            // Beat 2.25
            [
              { type: 'kick', play: false },
              { type: 'hihat', play: false },
              { type: 'snare', play: false },
              { type: 'shaker', play: false }
            ],
            // Beat 2.5
            [
              { type: 'kick', play: false },
              { type: 'hihat', play: true, velocity: 0.6, open: true },
              { type: 'snare', play: false },
              { type: 'shaker', play: true, velocity: 0.5 }
            ],
            // Beat 2.75
            [
              { type: 'kick', play: false },
              { type: 'hihat', play: false },
              { type: 'snare', play: false },
              { type: 'shaker', play: false }
            ],
            // Beat 3 - same as beat 1
            [
              { type: 'kick', play: true, velocity: 0.8 },
              { type: 'hihat', play: true, velocity: 0.8, open: false },
              { type: 'snare', play: false },
              { type: 'shaker', play: true, velocity: 0.7 }
            ],
            // Beat 3.25
            [
              { type: 'kick', play: false },
              { type: 'hihat', play: false },
              { type: 'snare', play: false },
              { type: 'shaker', play: false }
            ],
            // Beat 3.5
            [
              { type: 'kick', play: false },
              { type: 'hihat', play: true, velocity: 0.6, open: false },
              { type: 'snare', play: false },
              { type: 'shaker', play: true, velocity: 0.5 }
            ],
            // Beat 3.75
            [
              { type: 'kick', play: false },
              { type: 'hihat', play: false },
              { type: 'snare', play: false },
              { type: 'shaker', play: false }
            ],
            // Beat 4
            [
              { type: 'kick', play: false },
              { type: 'hihat', play: true, velocity: 0.7, open: false },
              { type: 'snare', play: true, velocity: 0.9 },
              { type: 'shaker', play: true, velocity: 0.7 }
            ],
            // Beat 4.25
            [
              { type: 'kick', play: false },
              { type: 'hihat', play: false },
              { type: 'snare', play: false },
              { type: 'shaker', play: false }
            ],
            // Beat 4.5
            [
              { type: 'kick', play: true, velocity: 0.7 },
              { type: 'hihat', play: true, velocity: 0.7, open: false },
              { type: 'snare', play: false },
              { type: 'shaker', play: true, velocity: 0.6 }
            ],
            // Beat 4.75
            [
              { type: 'kick', play: false },
              { type: 'hihat', play: true, velocity: 0.8, open: false },
              { type: 'snare', play: true, velocity: 0.7, variation: 0.5 },
              { type: 'shaker', play: false }
            ]
          ],
          stepDuration: 0.25 // 16th notes
        };
      }
      
      default: {
        // Default moderate pattern
        return {
          steps: [
            // Beat 1
            [
              { type: 'kick', play: true, velocity: 0.8 },
              { type: 'hihat', play: true, velocity: 0.7, open: false },
              { type: 'snare', play: false }
            ],
            // Beat 2
            [
              { type: 'kick', play: false },
              { type: 'hihat', play: true, velocity: 0.6, open: false },
              { type: 'snare', play: true, velocity: 0.8 }
            ],
            // Beat 3
            [
              { type: 'kick', play: true, velocity: 0.7 },
              { type: 'hihat', play: true, velocity: 0.7, open: false },
              { type: 'snare', play: false }
            ],
            // Beat 4
            [
              { type: 'kick', play: false },
              { type: 'hihat', play: true, velocity: 0.6, open: false },
              { type: 'snare', play: true, velocity: 0.9 }
            ]
          ],
          stepDuration: 1.0 // Quarter notes
        };
      }
    }
  }
  
  // Create processor for percussion sounds
  createPercussionProcessor(context) {
    // Input and output
    const input = context.createGain();
    const output = context.createGain();
    
    // Compressor specifically for percussion
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 5;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.002;
    compressor.release.value = 0.1;
    
    // EQ for percussion
    const lowShelf = context.createBiquadFilter();
    lowShelf.type = 'lowshelf';
    lowShelf.frequency.value = 100;
    lowShelf.gain.value = 3; // Boost low end
    
    const hiShelf = context.createBiquadFilter();
    hiShelf.type = 'highshelf';
    hiShelf.frequency.value = 8000;
    hiShelf.gain.value = 2; // Boost highs for sparkle
    
    // Connect chain
    input
      .connect(compressor)
      .connect(lowShelf)
      .connect(hiShelf)
      .connect(output);
    
    return { input, output };
  }
  
  // Create kick drum
  createKickDrum(context, outputNode, velocity = 1.0, variation = 0) {
    // Kick drum parameters
    const baseFreq = 60; // Base frequency
    const attack = 0.002; // Attack time
    const decay = 0.5; // Decay time
    
    // Variations based on variation parameter (0-1)
    const freqVariation = baseFreq * (1 - variation * 0.5); // Lower = punchier
    const decayVariation = decay * (1 - variation * 0.3); // Shorter = tighter
    
    // Oscillator for pitch
    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freqVariation;
    
    // Gain node for envelope
    const gain = context.createGain();
    gain.gain.value = 0;
    
    // Connect nodes
    osc.connect(gain);
    gain.connect(outputNode);
    
    // Create pitch envelope - the characteristic kick drum pitch drop
    const now = context.currentTime;
    osc.frequency.setValueAtTime(freqVariation * 5, now); // Start high
    osc.frequency.exponentialRampToValueAtTime(freqVariation, now + 0.08); // Quick pitch drop
    
    // Create amplitude envelope
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(velocity, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, now + decayVariation);
    
    // Start and stop
    osc.start(now);
    osc.stop(now + decay + 0.1);
    this.oscillators.push(osc);
    
    // Add click/attack transient for clarity and punch
    this.createKickAttack(context, outputNode, velocity, variation);
  }
  
  // Create kick drum attack transient
  createKickAttack(context, outputNode, velocity, variation) {
    // Create white noise for attack
    const bufferSize = context.sampleRate * 0.05; // 50ms buffer
    const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
    const data = buffer.getChannelData(0);
    
    // Fill with noise
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    // Create source
    const source = context.createBufferSource();
    source.buffer = buffer;
    
    // Create filter
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 400 + variation * 600; // Different click character
    filter.Q.value = 1;
    
    // Create gain
    const gain = context.createGain();
    gain.gain.value = 0;
    
    // Connect
    source.connect(filter);
    filter.connect(gain);
    gain.connect(outputNode);
    
    // Envelope - very short
    const now = context.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(velocity * 0.7, now + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    
    // Start and store
    source.start(now);
    this.ambientSources.push(source);
  }
  
  // Create snare drum
  createSnareDrum(context, outputNode, velocity = 1.0, variation = 0) {
    // Snare has body (oscillator) and snare rattle (noise)
    
    // Body parameters
    const bodyFreq = 150 - variation * 50; // Lower with more variation
    const bodyDecay = 0.05 + variation * 0.1; // Longer with more variation
    
    // Create body oscillator
    const bodyOsc = context.createOscillator();
    bodyOsc.type = 'triangle';
    bodyOsc.frequency.value = bodyFreq;
    
    // Gain for body
    const bodyGain = context.createGain();
    bodyGain.gain.value = 0;
    
    // Connect body
    bodyOsc.connect(bodyGain);
    bodyGain.connect(outputNode);
    
    // Create rattle noise
    const bufferSize = context.sampleRate * 0.2; // 200ms buffer
    const noiseBuffer = context.createBuffer(1, bufferSize, context.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    
    // Fill with noise
    for (let i = 0; i < bufferSize; i++) {
      noiseData[i] = Math.random() * 2 - 1;
    }
    
    // Create noise source
    const noiseSource = context.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    
    // Create filters for noise
    const noiseFilter = context.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 2000 - variation * 1000; // Different noise character
    
    // Gain for noise
    const noiseGain = context.createGain();
    noiseGain.gain.value = 0;
    
    // Connect noise
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(outputNode);
    
    // Create envelopes
    const now = context.currentTime;
    
    // Body envelope
    bodyGain.gain.setValueAtTime(0, now);
    bodyGain.gain.linearRampToValueAtTime(velocity * 0.5, now + 0.005);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + bodyDecay);
    
    // Noise envelope
    noiseGain.gain.setValueAtTime(0, now);
    noiseGain.gain.linearRampToValueAtTime(velocity * 0.8, now + 0.005);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1 + variation * 0.1);
    
    // Start and store
    bodyOsc.start(now);
    bodyOsc.stop(now + bodyDecay + 0.1);
    this.oscillators.push(bodyOsc);
    
    noiseSource.start(now);
    this.ambientSources.push(noiseSource);
  }
  
  // Create hi-hat
  createHiHat(context, outputNode, velocity = 1.0, open = false, variation = 0) {
    // Hi-hat parameters
    const decayTime = open ? 0.3 + variation * 0.3 : 0.05 + variation * 0.05;
    
    // Create noise for hi-hat
    const bufferSize = context.sampleRate * 0.5; // 500ms buffer
    const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
    const data = buffer.getChannelData(0);
    
    // Fill with noise
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    // Create source
    const source = context.createBufferSource();
    source.buffer = buffer;
    
    // Create bandpass filter for hi-hat sound
    const filter1 = context.createBiquadFilter();
    filter1.type = 'bandpass';
    filter1.frequency.value = 8000 + variation * 2000;
    filter1.Q.value = 1;
    
    // Secondary filter for shaping
    const filter2 = context.createBiquadFilter();
    filter2.type = 'highpass';
    filter2.frequency.value = 5000;
    
    // Create gain node
    const gain = context.createGain();
    gain.gain.value = 0;
    
    // Connect nodes
    source.connect(filter1);
    filter1.connect(filter2);
    filter2.connect(gain);
    gain.connect(outputNode);
    
    // Create envelope
    const now = context.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(velocity * 0.7, now + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.001, now + decayTime);
    
    // Start and store
    source.start(now);
    this.ambientSources.push(source);
  }
  
  // Create shaker
  createShaker(context, outputNode, velocity = 1.0, variation = 0) {
    // Create noise for shaker
    const bufferSize = context.sampleRate * 0.1; // 100ms buffer
    const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
    const data = buffer.getChannelData(0);
    
    // Fill with filtered noise (more high frequency content for shaker)
    let lastSample = 0;
    for (let i = 0; i < bufferSize; i++) {
      // Pinking filter for more realistic shaker sound
      lastSample = (lastSample + Math.random() * 2 - 1) * 0.5;
      data[i] = lastSample;
    }
    
    // Create source
    const source = context.createBufferSource();
    source.buffer = buffer;
    
    // Create bandpass filter
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 6000 + variation * 3000;
    filter.Q.value = 2;
    
    // Create gain node
    const gain = context.createGain();
    gain.gain.value = 0;
    
    // Connect nodes
    source.connect(filter);
    filter.connect(gain);
    gain.connect(outputNode);
    
    // Create envelope - short attack, short decay
    const now = context.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(velocity * 0.5, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05 + variation * 0.05);
    
    // Start and store
    source.start(now);
    this.ambientSources.push(source);
  }
}