// VisualCanvas.js - Handles all 3D visualization and effects


class VisualCanvas {
    // NEW SIGNATURE: Accept canvas, initial mood, and audio data getter
    constructor(canvasElement, initialMood, audioDataGetter) {
      this.canvas = canvasElement;
      this.mood = initialMood || 'calm'; // Set initial mood, default to 'calm'
      this.audioData = audioDataGetter; // Assign the function passed from App

      // All other properties initialize as before
      this.scene = null;
      this.camera = null;
      this.renderer = null;
      this.composer = null;
      this.controls = null;
      this.time = 0;
      this.frameId = null;
      this.objects = [];
      this.particles = null;
      this.clouds = null;
      this.animators = [];
      this.lightning = {
        active: false,
        intensity: 0,
        nextStrike: 0
      };

      // Fluid simulation parameters
      this.fluidSim = {
        active: true,
        particles: [],
        velocityField: [],
        gridSize: 32,
        lastUpdateTime: 0,
        iterations: 16
      };

      // Audio reactivity
      this.audioReactivity = {
        bassPower: 0,
        midPower: 0,
        treblePower: 0,
        overallPower: 0,
        bassImpact: 0,
        peakDetector: { threshold: 0.5, lastPeak: 0, cooldown: 20 },
        frequencyBands: new Array(24).fill(0), // More detailed frequency analysis
        beatDetector: {
          energyHistory: new Array(43).fill(0),
          beatCutoff: 0,
          beatTime: 0
        }
      };

      // Performance monitoring
      this.performance = {
        lastFrameTime: 0,
        frameRates: [],
        qualityAdjustTime: 0,
        adaptiveQuality: true
      };

      // Initialize Three.js scene only if canvas is valid
      if (this.canvas) {
        this.initScene();
      } else {
        console.error("VisualCanvas constructor requires a valid canvas element!");
      }
    }

    // Make sure initScene uses this.mood safely (add checks just in case)
    initScene() {
        if (!this.canvas) {
            console.error("Cannot initialize scene without a canvas element.");
            return;
        }
        // Get settings safely
        const currentSettings = moodSettings[this.mood] || moodSettings.calm; // Fallback to calm

        const width = window.innerWidth;
        const height = window.innerHeight;

      // Check WebGL capability and adjust settings if needed
      let rendererSettings = {
        canvas: this.canvas, // Ensure canvas is used here
        antialias: true,
        preserveDrawingBuffer: true,  // Needed for video recording
        powerPreference: "high-performance",
        alpha: true
      };

      // Test if device can handle high quality settings
      const testCanvas = document.createElement('canvas');
      const gl = testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl');
      const isHighPerformance = gl && gl.getExtension('WEBGL_depth_texture') && gl.getParameter(gl.MAX_TEXTURE_SIZE) >= 4096;

      if (!isHighPerformance) {
        // Lower settings for less powerful devices
        rendererSettings.antialias = false;
      }

      // Create scene
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color('#000000');

      // Add fog
      this.scene.fog = new THREE.FogExp2(currentSettings?.fogColor || '#000000', currentSettings?.fogDensity || 0.01);

      // Create camera
      this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
      this.camera.position.set(0, 5, currentSettings?.cameraDistance || 30);
      this.camera.lookAt(0, 0, 0);

      // Create renderer
      this.renderer = new THREE.WebGLRenderer(rendererSettings);
      this.renderer.setSize(width, height);

      // Limit pixel ratio for better performance
      const pixelRatio = Math.min(window.devicePixelRatio, isHighPerformance ? 2 : 1.5);
      this.renderer.setPixelRatio(pixelRatio);

      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.2;

      // Create orbit controls for camera - pass the canvas element
      this.controls = new THREE.OrbitControls(this.camera, this.canvas);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.rotateSpeed = 0.5;
      this.controls.enableZoom = false; // Disable zoom for smoother experience
      this.controls.autoRotate = true;
      this.controls.autoRotateSpeed = 0.1 * (currentSettings?.speed || 1);

      // Create post-processing passes with adaptive quality
      const bloomStrength = isHighPerformance ?
        (currentSettings?.bloom || 1) * 1.5 :
        (currentSettings?.bloom || 1);
      const bloomRadius = isHighPerformance ? 0.4 : 0.3;

      // 1. Render pass
      const renderPass = new THREE.RenderPass(this.scene, this.camera);

      // 2. Bloom pass
      const bloomPass = new THREE.UnrealBloomPass(
        new THREE.Vector2(width, height),
        bloomStrength,  // strength
        bloomRadius,  // radius
        0.85  // threshold
      );

      // 3. FXAA pass for anti-aliasing
      const fxaaPass = new THREE.ShaderPass(THREE.FXAAShader);
      fxaaPass.material.uniforms['resolution'].value.set(1 / (width * pixelRatio), 1 / (height * pixelRatio));

      // Create composer and add passes
      this.composer = new THREE.EffectComposer(this.renderer);

      this.composer.addPass(renderPass);
      this.composer.addPass(bloomPass);
      this.composer.addPass(fxaaPass);

      // Initialize fluid simulation grid
      this.initFluidSimulation();

      // Initial scene creation - only if mood is defined
      if (this.mood) {
        this.createScene(this.mood);
      }

      // Set up performance monitoring
      this.performance.lastFrameTime = performance.now();

      // Set up resize handler
      this.handleResize = () => {
        const width = window.innerWidth;
        const height = window.innerHeight;

        this.renderer.setSize(width, height);
        this.composer.setSize(width, height);

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        fxaaPass.material.uniforms['resolution'].value.set(1 / (width * pixelRatio), 1 / (height * pixelRatio));
      };

      window.addEventListener('resize', this.handleResize);
    }

    // Initialize the fluid simulation for more organic motion
    initFluidSimulation() {
      const fluid = this.fluidSim;
      const gridSize = fluid.gridSize;

      // Initialize velocity field
      fluid.velocityField = Array(gridSize);
      for (let i = 0; i < gridSize; i++) {
        fluid.velocityField[i] = Array(gridSize);
        for (let j = 0; j < gridSize; j++) {
          fluid.velocityField[i][j] = { x: 0, y: 0 };
        }
      }

      fluid.lastUpdateTime = performance.now();
    }

    // Update the fluid simulation
    updateFluidSimulation(audioImpact) {
      const fluid = this.fluidSim;
      const now = performance.now();
      const deltaTime = (now - fluid.lastUpdateTime) / 1000; // seconds
      fluid.lastUpdateTime = now;

      const settings = moodSettings[this.mood] || {};
      const audioReactivity = this.audioReactivity;

      // Only update every few frames for performance
      if (Math.random() > 0.3) return;

      // Add forces from audio
      const gridSize = fluid.gridSize;

      // Apply forces to velocity field
      if (audioImpact) {
        // Create a strong force at a random position
        const forceX = Math.floor(Math.random() * gridSize);
        const forceY = Math.floor(Math.random() * gridSize);
        const forceMagnitude = 1 + audioReactivity.bassImpact * 5;
        const forceDirection = Math.random() * Math.PI * 2;

        // Apply force with radius
        const radius = 3 + Math.floor(audioReactivity.overallPower * 4);

        for (let i = Math.max(0, forceX - radius); i < Math.min(gridSize, forceX + radius); i++) {
          for (let j = Math.max(0, forceY - radius); j < Math.min(gridSize, forceY + radius); j++) {
            const dist = Math.sqrt((i - forceX) ** 2 + (j - forceY) ** 2);
            if (dist <= radius) {
              const factor = (1 - dist / radius) * forceMagnitude;
              fluid.velocityField[i][j].x += Math.cos(forceDirection) * factor;
              fluid.velocityField[i][j].y += Math.sin(forceDirection) * factor;
            }
          }
        }
      }

      // Always add some gentle forces
      for (let k = 0; k < 2; k++) {
        const forceX = Math.floor(Math.random() * gridSize);
        const forceY = Math.floor(Math.random() * gridSize);
        const forceMagnitude = 0.2 + audioReactivity.overallPower * 0.3;
        const forceDirection = Math.random() * Math.PI * 2;

        const radius = 2;

        for (let i = Math.max(0, forceX - radius); i < Math.min(gridSize, forceX + radius); i++) {
          for (let j = Math.max(0, forceY - radius); j < Math.min(gridSize, forceY + radius); j++) {
            const dist = Math.sqrt((i - forceX) ** 2 + (j - forceY) ** 2);
            if (dist <= radius) {
              const factor = (1 - dist / radius) * forceMagnitude;
              fluid.velocityField[i][j].x += Math.cos(forceDirection) * factor;
              fluid.velocityField[i][j].y += Math.sin(forceDirection) * factor;
            }
          }
        }
      }

      // Diffusion and velocity updates (simple version)
      const iterations = fluid.iterations;
      const diffusionFactor = 0.05 * (settings.fluidMotion || 1);
      const viscosity = 0.2;

      for (let iter = 0; iter < iterations; iter++) {
        // Copy current state
        const tempField = Array(gridSize);
        for (let i = 0; i < gridSize; i++) {
          tempField[i] = Array(gridSize);
          for (let j = 0; j < gridSize; j++) {
            tempField[i][j] = {
              x: fluid.velocityField[i][j].x,
              y: fluid.velocityField[i][j].y
            };
          }
        }

        // Diffuse
        for (let i = 1; i < gridSize - 1; i++) {
          for (let j = 1; j < gridSize - 1; j++) {
            const x = (tempField[i-1][j].x + tempField[i+1][j].x +
                       tempField[i][j-1].x + tempField[i][j+1].x) * 0.25;
            const y = (tempField[i-1][j].y + tempField[i+1][j].y +
                       tempField[i][j-1].y + tempField[i][j+1].y) * 0.25;

            fluid.velocityField[i][j].x = tempField[i][j].x * (1 - diffusionFactor) + x * diffusionFactor;
            fluid.velocityField[i][j].y = tempField[i][j].y * (1 - diffusionFactor) + y * diffusionFactor;
          }
        }
      }

      // Apply damping to gradually reduce motion
      for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
          const damping = 1 - deltaTime * viscosity;
          fluid.velocityField[i][j].x *= damping;
          fluid.velocityField[i][j].y *= damping;
        }
      }
    }

    // Get the velocity from the fluid simulation at a given position
    getFluidVelocityAtPosition(x, z, scale = 1) {
      const fluid = this.fluidSim;
      const gridSize = fluid.gridSize;

      // Map world coordinates to grid coordinates
      const gridX = Math.floor(((x + 50) / 100) * gridSize);
      const gridZ = Math.floor(((z + 50) / 100) * gridSize);

      // Check bounds
      if (gridX < 0 || gridX >= gridSize || gridZ < 0 || gridZ >= gridSize) {
        return { x: 0, y: 0, z: 0 };
      }

      // Get velocity and scale for return
      const velX = fluid.velocityField[gridX][gridZ].x * scale;
      const velZ = fluid.velocityField[gridX][gridZ].y * scale;

      return { x: velX, y: 0, z: velZ };
    }

    // Process audio data for visualization with enhanced beat detection
    processAudioData(data) {
      if (!data) return 0;

      const audioReactivity = this.audioReactivity;

      // Calculate frequency band power
      const bassSum = data.slice(1, 10).reduce((sum, val) => sum + val, 0);
      const midSum = data.slice(10, 100).reduce((sum, val) => sum + val, 0);
      const trebleSum = data.slice(100, 300).reduce((sum, val) => sum + val, 0);

      // Normalize
      const bassNorm = bassSum / 10 / 255;
      const midNorm = midSum / 90 / 255;
      const trebleNorm = trebleSum / 200 / 255;

      // Calculate more detailed frequency bands for visualization
      for (let i = 0; i < 24; i++) {
        const startBin = Math.floor(data.length * (i / 24));
        const endBin = Math.floor(data.length * ((i + 1) / 24));
        let sum = 0;
        for (let j = startBin; j < endBin; j++) {
          sum += data[j];
        }
        const bandValue = sum / (endBin - startBin) / 255;

        // Apply smoothing
        audioReactivity.frequencyBands[i] = audioReactivity.frequencyBands[i] * 0.7 + bandValue * 0.3;
      }

      // Smooth values with adaptive smoothing (faster response to increases, slower to decreases)
      const smoothingFactor = 0.1;
      const increaseFactor = 0.3; // Responds faster to increases

      // Apply different smoothing based on whether values are increasing or decreasing
      audioReactivity.bassPower = this.applyAdaptiveSmoothing(audioReactivity.bassPower, bassNorm, smoothingFactor, increaseFactor);
      audioReactivity.midPower = this.applyAdaptiveSmoothing(audioReactivity.midPower, midNorm, smoothingFactor, increaseFactor);
      audioReactivity.treblePower = this.applyAdaptiveSmoothing(audioReactivity.treblePower, trebleNorm, smoothingFactor, increaseFactor);

      // Overall power
      audioReactivity.overallPower = (audioReactivity.bassPower * 1.2 + audioReactivity.midPower + audioReactivity.treblePower * 0.8) / 3;

      // Detect bass impacts (for camera shake, etc.)
      const bassImpactSmoothingFactor = 0.3;
      const previousBassPower = audioReactivity.bassImpact;
      audioReactivity.bassImpact = audioReactivity.bassImpact * (1 - bassImpactSmoothingFactor) +
                                  (Math.max(0, bassNorm - previousBassPower)) * bassImpactSmoothingFactor * 5;

      // Enhanced beat detection algorithm
      const beatDetector = audioReactivity.beatDetector;

      // Shift history values
      beatDetector.energyHistory.unshift(bassNorm);
      beatDetector.energyHistory.pop();

      // Calculate local energy average
      const localEnergy = beatDetector.energyHistory.slice(0, 8).reduce((sum, val) => sum + val, 0) / 8;

      // Calculate energy history average
      const historyEnergy = beatDetector.energyHistory.reduce((sum, val) => sum + val, 0) / beatDetector.energyHistory.length;

      // Calculate beat sensitivity based on music energy
      const sensitivity = 1.0 + 0.3 * historyEnergy; // More sensitive with higher energy music

      // Update beat cutoff value
      beatDetector.beatCutoff = beatDetector.beatCutoff * 0.99 + historyEnergy * 0.01;

      // Detect beat with adaptive threshold
      let beatDetected = false;
      if (localEnergy > beatDetector.beatCutoff * sensitivity && this.time > beatDetector.beatTime + 0.35) {
        beatDetector.beatCutoff = localEnergy * 1.1;
        beatDetector.beatTime = this.time;
        beatDetected = true;
      }

      // Peak detection for events (like lightning)
      const peakDetector = audioReactivity.peakDetector;
      peakDetector.lastPeak++;

      const bassThreshold = peakDetector.threshold * (1 + audioReactivity.overallPower * 0.5);

      if (audioReactivity.bassPower > bassThreshold && peakDetector.lastPeak > peakDetector.cooldown) {
        peakDetector.lastPeak = 0;
        return beatDetected ? 2 : 1; // Strong beat or regular bass impact
      }

      return beatDetected ? 1 : 0; // Return beat status
    }

    // Helper function for adaptive smoothing
    applyAdaptiveSmoothing(current, target, decreaseFactor, increaseFactor) {
      if (target > current) {
        return current * (1 - increaseFactor) + target * increaseFactor;
      } else {
        return current * (1 - decreaseFactor) + target * decreaseFactor;
      }
    }

    // Start/stop animation loop
    animate(isPlaying) {
      this.isPlaying = isPlaying;

      if (isPlaying && !this.frameId) {
        this.startAnimation();
      } else if (!isPlaying && this.frameId) {
        cancelAnimationFrame(this.frameId);
        this.frameId = null;
      }
    }

    // Start animation loop
    startAnimation() {
      const animateFrame = () => {
        // Update time
        this.time += 0.01 * (moodSettings[this.mood]?.speed || 1);

        // Performance monitoring
        const now = performance.now();
        const frameTime = now - this.performance.lastFrameTime;
        this.performance.lastFrameTime = now;

        // Calculate FPS and keep a running average
        const fps = 1000 / frameTime;
        this.performance.frameRates.push(fps);
        if (this.performance.frameRates.length > 30) {
          this.performance.frameRates.shift();
        }

        // Calculate average FPS over the last 30 frames
        const avgFps = this.performance.frameRates.reduce((sum, rate) => sum + rate, 0) /
                      this.performance.frameRates.length;

        // Auto-adjust quality based on performance
        if (this.performance.adaptiveQuality && now - this.performance.qualityAdjustTime > 3000) {
          this.performance.qualityAdjustTime = now;

          // If performance is poor, reduce effects
          if (avgFps < 30) {
            // Reduce bloom strength
            if (this.composer && this.composer.passes[1] &&
                this.composer.passes[1].strength > 0.5) {
              this.composer.passes[1].strength *= 0.8;
            }

            // Reduce particle count
            this.objects.forEach(obj => {
              if (obj.isPoints && obj.material && obj.material.uniforms &&
                  obj.material.uniforms.particleCount) {
                obj.material.uniforms.particleCount.value =
                  Math.max(1000, obj.material.uniforms.particleCount.value * 0.8);
              }
            });

          } else if (avgFps > 55) {
            // Performance is good, can increase some effects
            if (this.composer && this.composer.passes[1]) {
              this.composer.passes[1].strength =
                Math.min((moodSettings[this.mood]?.bloom || 1) * 1.5, this.composer.passes[1].strength * 1.05);
            }
          }
        }

        // Process audio data if available
        const audioImpact = this.audioData ? this.processAudioData(this.audioData()) : 0;

        // Update fluid simulation for organic motion
        this.updateFluidSimulation(audioImpact > 0);

        // Update scene elements
        this.updateScene(this.time, this.mood, audioImpact);

        // Update controls
        if (this.controls) {
          this.controls.update();
        }

        // Render using composer
        if (this.composer) { // Add check for composer
            this.composer.render();
        }

        // Schedule next frame
        this.frameId = requestAnimationFrame(animateFrame);
      };

      this.frameId = requestAnimationFrame(animateFrame);
    }

    // Change scene based on mood
    changeMood(mood) {
      this.mood = mood;

      if (this.scene) {
        // Update fog
        this.scene.fog.color.set(moodSettings[mood].fogColor);
        this.scene.fog.density = moodSettings[mood].fogDensity;

        // Update bloom
        if (this.composer && this.composer.passes[1]) {
          this.composer.passes[1].strength = moodSettings[mood].bloom * 1.5;
        }

        // Update orbit controls
        if (this.controls) {
          this.controls.autoRotateSpeed = 0.1 * moodSettings[mood].speed;
        }

        // Update camera position
        if (this.camera) {
          this.camera.position.z = moodSettings[mood].cameraDistance;
        }

        // Create new scene
        this.createScene(mood);
      }
    }

    // Create scene based on mood
    createScene(mood) {
        const scene = this.scene;
        const settings = moodSettings[mood] || moodSettings.calm; // Use safe fallback

      // Clear previous objects
      this.objects.forEach(obj => {
        scene.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => this.cleanupMaterial(m));
          } else {
            this.cleanupMaterial(obj.material);
          }
        }
      });

      // Clear animators
      this.animators.forEach(animator => {
        if (animator.dispose) animator.dispose();
      });

      this.objects = [];
      this.animators = [];

      // Create new objects based on mood

      // 1. Add lighting
      this.createLighting(scene, settings);

      // 2. Background stars
      this.createStars(scene, settings);

      // 3. Create landscape
      this.createLandscape(scene, settings);

      // 4. Create water
      this.createWater(scene, settings);

      // 5. Create celestial objects
      this.createCelestialObjects(scene, settings);

      // 6. Create plants
      this.createPlants(scene, settings);

      // 7. Create particles (fireflies, mist, etc.)
      this.createParticles(scene, settings);

      // 8. Create clouds
      this.createClouds(scene, settings);

      // 9. Create advanced dreamlike visual effects
      this.createDreamlikeEffects(scene, settings);
    }

    // Clean up material
    cleanupMaterial(material) {
      material.dispose();

      // Dispose textures
      for (const prop in material) {
        const value = material[prop];
        if (value && typeof value === 'object' && 'isTexture' in value) {
          value.dispose();
        }
      }
    }

    // Update scene animation
    updateScene(time, mood, audioImpact) {
        const settings = moodSettings[mood] || moodSettings.calm; // Use safe fallback
      const audioReactivity = this.audioReactivity;

      // Update camera for bass impacts
      if (audioImpact && this.camera) {
        // Apply slight camera shake based on bass and impact strength
        let shakeAmount = audioReactivity.bassImpact * 0.2;

        // Stronger shake for bigger impacts
        if (audioImpact > 1) {
          shakeAmount *= 2;
        }

        if (mood !== 'calm') {
          this.camera.position.y += Math.sin(time * 100) * shakeAmount;
          this.camera.position.x += Math.cos(time * 95) * shakeAmount * 0.5;
        }
      }

      // Process lightning effects
      const lightning = this.lightning;
      if (lightning.active) {
        // Update lightning
        lightning.intensity *= 0.9; // Fade out

        // Find lightning light and update
        const lightningLight = this.objects.find(obj =>
          obj.isPointLight && obj.userData.type === 'lightning');

        if (lightningLight) {
          lightningLight.intensity = lightning.intensity * 2;
        }

        if (lightning.intensity < 0.05) {
          lightning.active = false;
        }
      } else {
        // Randomly trigger lightning in cosmic mood or on strong audio impact
        if ((mood === 'cosmic' && Math.random() < 0.001) || audioImpact > 1) {
          // Start lightning
          lightning.active = true;
          lightning.intensity = 1.0;

          // Move lightning to random position
          const lightningLight = this.objects.find(obj =>
            obj.isPointLight && obj.userData.type === 'lightning');

          if (lightningLight) {
            lightningLight.position.set(
              Math.random() * 50 - 25,
              10 + Math.random() * 20,
              Math.random() * 50 - 25
            );
          }
        }
      }

      // Update all objects based on their type
      this.objects.forEach(obj => {
        if (!obj.userData) return;

        switch (obj.userData.type) {
          case 'star':
            // Slow rotation for star field
            obj.rotation.y = time * 0.05;
            obj.rotation.z = time * 0.02;

            // Pulsate based on treble
            if (audioReactivity && obj.material) {
              obj.material.size = 0.1 + audioReactivity.treblePower * 0.1;
            }
            break;

          case 'plant':
            // Get fluid motion for the plant's position
            const plantFluidVel = this.getFluidVelocityAtPosition(
              obj.position.x,
              obj.position.z,
              0.2 * settings.fluidMotion
            );

            // Swaying motion with fluid influence
            obj.rotation.y = Math.sin(time * 0.2 + obj.userData.offset) * 0.1 + plantFluidVel.x * 0.5;
            obj.position.y = obj.userData.originalY +
                            Math.sin(time * 0.3 + obj.userData.offset) * 0.1 +
                            Math.sin(time * 0.1) * 0.05 * plantFluidVel.z;

            // React to mid frequencies
            if (audioReactivity) {
              const scaleFactor = 1 + audioReactivity.midPower * 0.3;
              obj.scale.set(scaleFactor, scaleFactor, scaleFactor);
            }
            break;

          case 'water':
            // Update water shader time
            if (obj.material && obj.material.uniforms) {
              obj.material.uniforms.time.value = time;

              // Add dream-like, flowing quality to water
              obj.material.uniforms.dreamFactor.value = settings.dreaminess;

              // Apply fluid simulation influence
              obj.material.uniforms.fluidVelocity.value.set(
                Math.sin(time * 0.2) * settings.fluidMotion * 0.5,
                Math.cos(time * 0.1) * settings.fluidMotion * 0.5
              );

              // Audio reactivity for water
              if (audioReactivity) {
                obj.material.uniforms.waveHeight.value =
                  1.0 + audioReactivity.bassPower * 3.0;

                // Add frequency band data for rippling effects
                for (let i = 0; i < Math.min(8, audioReactivity.frequencyBands.length); i++) {
                  obj.material.uniforms.audioFrequencies.value[i] = audioReactivity.frequencyBands[i];
                }
              }
            }
            break;

          case 'celestial':
            // Orbit motion for celestial objects
            obj.position.x = obj.userData.radius * Math.cos(time * obj.userData.speed);
            obj.position.z = obj.userData.radius * Math.sin(time * obj.userData.speed);
            obj.rotation.y = time * 0.5;

            // Add fluid influence to orbit
            if (obj.userData.respondToFluid) {
              const fluidVel = this.getFluidVelocityAtPosition(obj.position.x, obj.position.z, 0.1);
              obj.position.x += fluidVel.x;
              obj.position.z += fluidVel.z;
            }

            // Audio reactive glow (if the object has children)
            if (audioReactivity && obj.children.length > 0) {
              const glowMesh = obj.children[0];
              if (glowMesh && glowMesh.material) {
                glowMesh.material.opacity = 0.3 + audioReactivity.midPower * 0.7;
                glowMesh.scale.set(
                  1.2 + audioReactivity.midPower * 0.6,
                  1.2 + audioReactivity.midPower * 0.6,
                  1.2 + audioReactivity.midPower * 0.6
                );
              }
            }
            break;

          case 'terrain':
            // Update terrain shader time
            if (obj.material && obj.material.uniforms) {
              obj.material.uniforms.time.value = time;

              // Add dreaminess factor to terrain
              obj.material.uniforms.dreamFactor.value =
                settings.dreaminess + Math.sin(time * 0.1) * 0.1;

              // Add morphing speed
              obj.material.uniforms.morphSpeed.value = settings.morphSpeed;

              // Audio reactivity for terrain
              if (audioReactivity) {
                obj.material.uniforms.elevationScale.value =
                  1.0 + audioReactivity.bassPower * 0.8;

                // Use beat detection for terrain pulse
                if (audioImpact > 0) {
                  obj.material.uniforms.pulseTime.value = time;
                  obj.material.uniforms.pulseStrength.value =
                    audioImpact > 1 ? 0.3 : 0.15;
                }
              }
            }
            break;

          case 'cloud':
            // Apply fluid motion to clouds
            const cloudFluidVel = this.getFluidVelocityAtPosition(
              obj.position.x,
              obj.position.z,
              0.5 * settings.fluidMotion
            );

            // Drift clouds with fluid motion
            obj.position.x += cloudFluidVel.x * 0.1;
            obj.position.z += cloudFluidVel.z * 0.1;

            // Add gentle circular motion
            obj.position.x += Math.sin(time * 0.1 + obj.userData.offset) * 0.01;
            obj.position.z += Math.cos(time * 0.1 + obj.userData.offset) * 0.01;

            // Slowly rotate
            obj.rotation.y = time * 0.05 + obj.userData.offset;

            // Audio reactivity for clouds
            // Check if the cloudGroup itself has material (might not, if it's just a group)
            // Instead, iterate over children (the cloud puffs)
            if (audioReactivity) {
                obj.children.forEach(puff => {
                    if (puff.material) {
                        // Pulse opacity with low frequencies
                         puff.material.opacity =
                           obj.userData.baseOpacity * (1 + audioReactivity.bassPower * 0.5);
                    }
                });
            }
            break;

            case 'particles':
              // Ensure material and uniforms exist before trying to access them
              if (obj.material && obj.material.uniforms) {
                  const uniforms = obj.material.uniforms; // Cache for readability

                  // === Update Common Uniforms (Check uniform object exists before accessing .value) ===
                  if (uniforms.time) { // Check if the uniform object itself exists
                      uniforms.time.value = time;
                  }

                  // Check settings properties exist before accessing
                  if (uniforms.fluidInfluence && settings?.fluidMotion !== undefined) { // Check uniform exists
                       uniforms.fluidInfluence.value = settings.fluidMotion;
                  }
                  if (uniforms.dreamFactor && settings?.dreaminess !== undefined) { // Check uniform exists
                       uniforms.dreamFactor.value = settings.dreaminess;
                  }
                   // Check audioReactivity property exists before accessing
                  if (uniforms.audioStrength && audioReactivity?.overallPower !== undefined) { // Check uniform exists
                      uniforms.audioStrength.value = audioReactivity.overallPower * 3.0;
                  }

                  // === Frequency Data Specific Update (Check uniform object exists) ===
                  const freqUniform = uniforms.frequencyData;
                  // Check freqUniform exists AND its value is a Float32Array
                  if (freqUniform && freqUniform.value instanceof Float32Array && audioReactivity?.frequencyBands) {
                      const uniformArray = freqUniform.value;
                      const audioBands = audioReactivity.frequencyBands;
                      const len = Math.min(uniformArray.length, audioBands.length);

                      for (let i = 0; i < len; i++) {
                          // Assign safely, ensure audio band value is a number, default to 0
                          uniformArray[i] = (typeof audioBands[i] === 'number' ? audioBands[i] : 0);
                      }
                      // Optional: Mark uniform as needing update if Three.js version requires it
                      // freqUniform.needsUpdate = true; // Usually not needed for array elements
                  }
                  // === End Frequency Data Specific Update ===
              }
              break; // End case 'particles'

          case 'dreamEffect':
            // Update dream-like visual effect shaders
            if (obj.material && obj.material.uniforms) {
              obj.material.uniforms.time.value = time;
              obj.material.uniforms.dreaminess.value = settings.dreaminess;

              // Audio reactivity
              if (audioReactivity) {
                obj.material.uniforms.audioStrength.value = audioReactivity.overallPower;

                // Enhance effect on beats
                if (audioImpact > 0) {
                  obj.material.uniforms.pulseTime.value = time;
                  obj.material.uniforms.pulseStrength.value =
                    audioImpact > 1 ? 0.7 : 0.4;
                }
              }
            }
            break;
        }
      });

      // Run custom animators
      this.animators.forEach(animator => {
        if (animator.update) {
          animator.update(time, audioReactivity, audioImpact);
        }
      });
    }

    // Create lighting
    createLighting(scene, settings) {
      // Ambient light
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
      scene.add(ambientLight);
      this.objects.push(ambientLight);

      // Main directional light (sun/moon)
      const mainLight = new THREE.DirectionalLight(
        new THREE.Color(settings.colors[1]).lerp(new THREE.Color(0xffffff), 0.5),
        1.0
      );
      mainLight.position.set(30, 30, 30);
      mainLight.castShadow = true;

      // Configure shadow
      mainLight.shadow.mapSize.width = 2048;
      mainLight.shadow.mapSize.height = 2048;
      mainLight.shadow.camera.near = 0.5;
      mainLight.shadow.camera.far = 100;
      mainLight.shadow.camera.left = -30;
      mainLight.shadow.camera.right = 30;
      mainLight.shadow.camera.top = 30;
      mainLight.shadow.camera.bottom = -30;
      mainLight.shadow.bias = -0.0001;

      scene.add(mainLight);
      this.objects.push(mainLight);

      // Secondary fill light
      const fillLight = new THREE.DirectionalLight(
        new THREE.Color(settings.colors[3]),
        0.5
      );
      fillLight.position.set(-20, 10, -20);
      scene.add(fillLight);
      this.objects.push(fillLight);

      // Lightning light (initially off)
      const lightningLight = new THREE.PointLight(0xaaccff, 0, 100);
      lightningLight.position.set(
        Math.random() * 30 - 15,
        20,
        Math.random() * 30 - 15
      );
      lightningLight.userData = { type: 'lightning' };
      scene.add(lightningLight);
      this.objects.push(lightningLight);

      // Add volumetric light rays for sun/moon
      const volumetricLight = new THREE.SpotLight(
        new THREE.Color(settings.colors[1]).lerp(new THREE.Color(0xffffff), 0.7),
        1.5,
        100,
        Math.PI / 4,
        0.5,
        1
      );
      volumetricLight.position.set(
        mainLight.position.x * 0.6,
        mainLight.position.y * 0.6,
        mainLight.position.z * 0.6
      );
      volumetricLight.lookAt(0, 0, 0);
      scene.add(volumetricLight);
      this.objects.push(volumetricLight);
    }

    // Create stars
    createStars(scene, settings) {
      // Small distant stars
      const starCount = 2000 + Math.floor(settings.complexity * 3000);
      const starGeometry = new THREE.BufferGeometry();
      const starMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.1,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true
      });

      const positions = new Float32Array(starCount * 3);
      const colors = new Float32Array(starCount * 3);
      const sizes = new Float32Array(starCount);

      for (let i = 0; i < starCount; i++) {
        const i3 = i * 3;

        // Position stars in a large sphere
        const radius = 50 + Math.random() * 50;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[i3 + 2] = radius * Math.cos(phi);

        // Give stars slightly different colors
        const starColor = new THREE.Color();

        // Temperature-based color
        if (Math.random() > 0.8) {
          // Reddish star
          starColor.setHSL(0.05, 1.0, 0.7);
        } else if (Math.random() > 0.6) {
          // Yellowish star
          starColor.setHSL(0.12, 1.0, 0.8);
        } else {
          // White-blue star
          starColor.setHSL(0.6, Math.random() * 0.3, 0.9);
        }

        colors[i3] = starColor.r;
        colors[i3 + 1] = starColor.g;
        colors[i3 + 2] = starColor.b;

        // Different star sizes
        sizes[i] = Math.random() * 0.1 + 0.05;
      }

      starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      starGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      starGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

      const stars = new THREE.Points(starGeometry, starMaterial);
      stars.userData = { type: 'star' };
      scene.add(stars);
      this.objects.push(stars);

      // Add a few glowing nebulae
      const nebulaCount = Math.floor(settings.complexity * 7);

      for (let i = 0; i < nebulaCount; i++) {
        const colorIndex = Math.floor(Math.random() * settings.colors.length);
        const color = new THREE.Color(settings.colors[colorIndex]);

        // Create a larger, more complex nebula shape
        const nebulaGeometry = new THREE.SphereGeometry(
          1 + Math.random() * 4,
          8,
          8
        );

        // Distort the geometry for more natural shape
        const positionAttribute = nebulaGeometry.getAttribute('position');
        const vertex = new THREE.Vector3();

        for (let v = 0; v < positionAttribute.count; v++) {
          vertex.fromBufferAttribute(positionAttribute, v);

          // Apply noise-based displacement
          const noise = Math.sin(vertex.x * 2) * Math.sin(vertex.y * 3) * Math.sin(vertex.z * 2);
          vertex.multiplyScalar(1 + noise * 0.4);

          positionAttribute.setXYZ(v, vertex.x, vertex.y, vertex.z);
        }

        const nebulaMaterial = new THREE.MeshBasicMaterial({
          color: color,
          transparent: true,
          opacity: 0.15,
          blending: THREE.AdditiveBlending
        });

        const nebula = new THREE.Mesh(nebulaGeometry, nebulaMaterial);

        // Position in 3D space
        nebula.position.set(
          (Math.random() - 0.5) * 80,
          (Math.random() - 0.5) * 80,
          (Math.random() - 0.5) * 80
        );

        // Random scale and rotation
        nebula.scale.set(
          3 + Math.random() * 5,
          3 + Math.random() * 5,
          6 + Math.random() * 15
        );

        nebula.rotation.set(
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2
        );

        nebula.userData = { type: 'nebula' };
        scene.add(nebula);
        this.objects.push(nebula);
      }
    }

    // Create improved landscape/terrain with more organic morphing
    createLandscape(scene, settings) {
      const terrainSize = 100;
      const segments = 256; // Higher detail

      const terrainGeometry = new THREE.PlaneGeometry(
        terrainSize,
        terrainSize,
        segments,
        segments
      );

      // Convert colors to THREE.Color objects
      const colors = settings.colors.map(color => new THREE.Color(color));

      // Create custom terrain shader with improved features for dreamlike morphing
      const terrainMaterial = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 },
          baseColors: { value: colors },
          complexity: { value: settings.complexity },
          elevationScale: { value: 1.0 },
          dreamFactor: { value: settings.dreaminess },
          morphSpeed: { value: settings.morphSpeed },
          pulseTime: { value: 0 },
          pulseStrength: { value: 0 }
        },
        vertexShader: `
          uniform float time;
          uniform float complexity;
          uniform float elevationScale;
          uniform float dreamFactor;
          uniform float morphSpeed;
          uniform float pulseTime;
          uniform float pulseStrength;

          varying vec2 vUv;
          varying float vElevation;
          varying vec3 vNormal;
          varying vec3 vPosition;

          // Improved 3D simplex noise functions
          vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
          vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
          vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
          vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

          float snoise(vec3 v) {
            const vec2 C = vec2(1.0/6.0, 1.0/3.0);
            const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

            // First corner
            vec3 i  = floor(v + dot(v, C.yyy));
            vec3 x0 = v - i + dot(i, C.xxx);

            // Other corners
            vec3 g = step(x0.yzx, x0.xyz);
            vec3 l = 1.0 - g;
            vec3 i1 = min(g.xyz, l.zxy);
            vec3 i2 = max(g.xyz, l.zxy);

            // Parallelepiped corners
            vec3 x1 = x0 - i1 + C.xxx;
            vec3 x2 = x0 - i2 + C.yyy;
            vec3 x3 = x0 - D.yyy;

            // Permutations
            i = mod289(i);
            vec4 p = permute(permute(permute(
                    i.z + vec4(0.0, i1.z, i2.z, 1.0))
                  + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                  + i.x + vec4(0.0, i1.x, i2.x, 1.0));

            // Gradients
            float n_ = 0.142857142857; // 1.0/7.0
            vec3 ns = n_ * D.wyz - D.xzx;

            vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

            vec4 x_ = floor(j * ns.z);
            vec4 y_ = floor(j - 7.0 * x_);

            vec4 x = x_ *ns.x + ns.yyyy;
            vec4 y = y_ *ns.x + ns.yyyy;
            vec4 h = 1.0 - abs(x) - abs(y);

            vec4 b0 = vec4(x.xy, y.xy);
            vec4 b1 = vec4(x.zw, y.zw);

            vec4 s0 = floor(b0)*2.0 + 1.0;
            vec4 s1 = floor(b1)*2.0 + 1.0;
            vec4 sh = -step(h, vec4(0.0));

            vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
            vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;

            vec3 p0 = vec3(a0.xy, h.x);
            vec3 p1 = vec3(a0.zw, h.y);
            vec3 p2 = vec3(a1.xy, h.z);
            vec3 p3 = vec3(a1.zw, h.w);

            // Normalise gradients
            vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
            p0 *= norm.x;
            p1 *= norm.y;
            p2 *= norm.z;
            p3 *= norm.w;

            // Mix final noise value
            vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
            m = m * m;
            return 42.0 * dot(m*m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
          }

          // Fractal Brownian Motion
          float fbm(vec3 p) {
            float f = 0.0;
            float amplitude = 0.5;
            float frequency = 1.0;

            // More iterations for higher complexity
            int octaves = 6 + int(complexity * 4.0);

            for (int i = 0; i < 10; i++) {
              if (i >= octaves) break;

              // Add dreamlike morphing effect based on time
              float timeShift = time * morphSpeed * 0.05 * float(i+1);
              vec3 p2 = p * frequency + vec3(timeShift, timeShift * 0.7, timeShift * 0.3);

              // Add traditional noise
              f += amplitude * snoise(p2);

              // Modify parameters for next octave
              frequency *= 2.0;
              amplitude *= 0.5;
            }

            return f;
          }

          // Ridged multifractal terrain
          float ridgedMF(vec3 position) {
            float lacunarity = 2.0;
            float gain = 0.5;
            float offset = 1.0;

            float sum = 0.0;
            float freq = 0.1;
            float amp = 0.5;
            float prev = 1.0;

            // Add dreaminess to the ridge function
            float timeFactor = time * morphSpeed * 0.05;

            for(int i = 0; i < 6; i++) {
              // Time-based position warping for dreamy effect
              vec3 p = position * freq;
              p.x += sin(timeFactor * float(i+1) * 0.753) * dreamFactor;
              p.z += cos(timeFactor * float(i+1) * 0.521) * dreamFactor;

              float n = abs(snoise(p));
              n = offset - n;
              n = n * n;
              n = n * prev;
              prev = n;
              sum += n * amp;
              freq *= lacunarity;
              amp *= gain;
            }

            return sum;
          }

          float calculateElevation(vec3 position) {
            // Base continent shape (large, gentle undulations)
            float timeScale = time * morphSpeed * 0.01;
            vec3 slowPos = vec3(position.x * 0.02, timeScale, position.z * 0.02);
            float continent = snoise(slowPos) * 0.5 + 0.5;
            continent = pow(continent, 1.5); // Make flatter areas

            // Hills and mountains using ridged multifractal
            float hills = ridgedMF(position) * 0.4;

            // Medium details
            float mediumDetails = 0.0;
            if (complexity > 0.3) {
              vec3 medPos = vec3(position.x, position.y + timeScale * 5.0, position.z);
              mediumDetails = fbm(medPos * 0.2) * 0.15;
            }

            // Fine details for higher complexity
            float fineDetails = 0.0;
            if (complexity > 0.6) {
              vec3 finePos = vec3(position.x, position.y + timeScale * 10.0, position.z);
              fineDetails = fbm(finePos * 0.5) * 0.1;
            }

            // Add dream-like distortion waves
            float dreamWave = sin(position.x * 0.05 + time * 0.1) *
                             cos(position.z * 0.07 + time * 0.08) *
                             dreamFactor * 0.1;

            // Add pulse on audio beats
            float pulse = 0.0;
            float timeSincePulse = time - pulseTime;
            if (timeSincePulse < 0.5) {
              pulse = pulseStrength * exp(-timeSincePulse * 5.0) *
                      sin(position.x * 0.1) * sin(position.z * 0.1);
            }

            return (continent * hills + mediumDetails + fineDetails + dreamWave + pulse) * elevationScale;
          }

          void main() {
            vUv = uv;
            vPosition = position;

            vec3 transformed = position;

            if (transformed.y > -48.0) { // Don't elevate edges of the plane
              // Use 3D noise for more organic morphing over time
              vec3 noisePosition = vec3(transformed.x, time * morphSpeed * 0.1, transformed.z);
              float elevation = calculateElevation(noisePosition);
              transformed.y += elevation * 10.0;
              vElevation = elevation;

              // Calculate normal for better lighting
              float delta = 0.1;
              vec3 noisePositionX = vec3(noisePosition.x + delta, noisePosition.y, noisePosition.z);
              vec3 noisePositionZ = vec3(noisePosition.x, noisePosition.y, noisePosition.z + delta);

              float elevationX = calculateElevation(noisePositionX) * 10.0;
              float elevationZ = calculateElevation(noisePositionZ) * 10.0;

              vec3 tangentX = normalize(vec3(delta, elevationX - elevation * 10.0, 0.0));
              vec3 tangentZ = normalize(vec3(0.0, elevationZ - elevation * 10.0, delta));

              vNormal = normalize(cross(tangentZ, tangentX));
            } else {
              vElevation = -1.0;
              vNormal = normal;
            }

            gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 baseColors[5];
          uniform float complexity;
          uniform float dreamFactor;
          uniform float time;

          varying vec2 vUv;
          varying float vElevation;
          varying vec3 vNormal;
          varying vec3 vPosition;

          // Simplex noise functions
          vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
          vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
          vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

          float snoise(vec2 v) {
            const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                               -0.577350269189626, 0.024390243902439);
            vec2 i  = floor(v + dot(v, C.yy));
            vec2 x0 = v -   i + dot(i, C.xx);
            vec2 i1;
            i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
            vec4 x12 = x0.xyxy + C.xxzz;
            x12.xy -= i1;
            i = mod289(i);
            vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                  + i.x + vec3(0.0, i1.x, 1.0));
            vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
                                  dot(x12.zw, x12.zw)), 0.0);
            m = m*m;
            m = m*m;
            vec3 x = 2.0 * fract(p * C.www) - 1.0;
            vec3 h = abs(x) - 0.5;
            vec3 ox = floor(x + 0.5);
            vec3 a0 = x - ox;
            m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
            vec3 g;
            g.x  = a0.x  * x0.x  + h.x  * x0.y;
            g.yz = a0.yz * x12.xz + h.yz * x12.yw;
            return 130.0 * dot(m, g);
          }

          // Hash function for texture variation
          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
          }

          // FBM for adding texture detail
          float fbm(vec2 p) {
            float f = 0.0;
            float a = 0.5;
            float total = 0.0;
            for(int i = 0; i < 5; i++) {
              f += a * snoise(p);
              p *= 2.0;
              total += a;
              a *= 0.5;
            }
            return f / total;
          }

          // Voronoi noise for additional texture
          float voronoi(vec2 p) {
            vec2 n = floor(p);
            vec2 f = fract(p);
            float md = 5.0;
            vec2 m = vec2(0.0);

            for(int i = -1; i <= 1; i++) {
              for(int j = -1; j <= 1; j++) {
                vec2 g = vec2(i, j);
                vec2 o = hash(n + g) * vec2(0.5) + vec2(0.5); // Randomize cell positions
                vec2 r = g + o - f;
                float d = dot(r, r);
                if(d < md) {
                  md = d;
                  m = n + g + o;
                }
              }
            }

            return md;
          }

          void main() {
            if (vElevation < -0.9) {
              discard; // Don't render the edges
            }

            // Normalize elevation to 0-1 range for color mapping
            float normalizedElevation = (vElevation + 1.0) * 0.5;

            // Slope calculation for different textures on steep vs flat areas
            float slope = 1.0 - max(0.0, dot(vNormal, vec3(0.0, 1.0, 0.0))); // 0 for flat, 1 for vertical

            // Determine which color bands to interpolate between
            float adjustedElev = normalizedElevation * float(5); // 5 colors
            int baseIndex = int(floor(adjustedElev));
            int nextIndex = min(baseIndex + 1, 4);
            float mixAmount = fract(adjustedElev);

            // Add some dreamlike color shifting based on time and position
            if (dreamFactor > 0.3) {
              float colorShift = sin(time * 0.1 + vPosition.x * 0.01 + vPosition.z * 0.02) * dreamFactor * 0.2;
              mixAmount = clamp(mixAmount + colorShift, 0.0, 1.0);
            }

            // Mix between appropriate colors
            vec3 terrainColor = mix(
              baseColors[baseIndex],
              baseColors[nextIndex],
              mixAmount
            );

            // Add noise-based detail
            vec2 detailCoord = vPosition.xz * 0.1;
            float detailNoise = fbm(detailCoord + vec2(time * 0.01)) * 0.05 +
                                fbm(detailCoord * 5.0 + vec2(time * 0.02)) * 0.025 +
                                fbm(detailCoord * 20.0 + vec2(time * 0.03)) * 0.0125;

            // Make steep areas more rocky using voronoi noise
            float rockiness = smoothstep(0.3, 0.7, slope);
            float rockDetail = voronoi(vPosition.xz * 0.5 + vec2(time * 0.01)) * 0.15 * rockiness;

            // Apply detail
            terrainColor = mix(terrainColor, terrainColor * (1.0 + detailNoise + rockDetail), 0.5);

            // Add dreamlike subtle color variations
            if (dreamFactor > 0.5) {
              float dreamWave = sin(vPosition.x * 0.02 + time * 0.03) *
                               cos(vPosition.z * 0.022 + time * 0.025);

              // Shift color slightly based on the wave
              vec3 dreamShift = vec3(0.05, 0.05, 0.1) * dreamWave * dreamFactor;
              terrainColor += dreamShift;
            }

            // Lighten peaks, darken valleys
            float heightEffect = smoothstep(0.0, 1.0, normalizedElevation) * 0.2;
            terrainColor = mix(terrainColor * 0.8, terrainColor * 1.2, heightEffect);

            // Apply basic lighting using normal
            float lightIntensity = max(0.3, dot(vNormal, normalize(vec3(0.5, 1.0, 0.5))));
            terrainColor *= lightIntensity;

            gl_FragColor = vec4(terrainColor, 1.0);
          }
        `,
        side: THREE.DoubleSide
      });

      const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
      terrain.rotation.x = -Math.PI / 2;
      terrain.position.y = -8;
      terrain.receiveShadow = true;
      terrain.userData = { type: 'terrain' };

      scene.add(terrain);
      this.objects.push(terrain);
    }

    // Create enhanced water with fluid dynamics
    createWater(scene, settings) {
      const waterSize = 90;
      const segments = 256;

      const waterGeometry = new THREE.PlaneGeometry(
        waterSize,
        waterSize,
        segments,
        segments
      );

      // Get colors from settings
      const colors = settings.colors.map(color => new THREE.Color(color));

      // Create enhanced water shader with fluid dynamics
      const waterMaterial = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 },
          waterColors: { value: [
            new THREE.Color(settings.colors[0]),
            new THREE.Color(settings.colors[3])
          ]},
          waveHeight: { value: 1.0 },
          baseWaterColor: { value: new THREE.Color(settings.colors[0]).lerp(new THREE.Color(0x101010), 0.7) },
          dreamFactor: { value: settings.dreaminess },
          fluidVelocity: { value: new THREE.Vector2(0, 0) },
          audioFrequencies: { value: new Float32Array(8) }
        },
        vertexShader: `
          uniform float time;
          uniform float waveHeight;
          uniform float dreamFactor;
          uniform vec2 fluidVelocity;
          uniform float audioFrequencies[8];

          varying vec2 vUv;
          varying float vWaveHeight;
          varying vec3 vPosition;
          varying vec3 vNormal;

          // Improved 3D simplex noise functions
          vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
          vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
          vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
          vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

          float snoise(vec3 v) {
            const vec2 C = vec2(1.0/6.0, 1.0/3.0);
            const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

            // First corner
            vec3 i  = floor(v + dot(v, C.yyy));
            vec3 x0 = v - i + dot(i, C.xxx);

            // Other corners
            vec3 g = step(x0.yzx, x0.xyz);
            vec3 l = 1.0 - g;
            vec3 i1 = min(g.xyz, l.zxy);
            vec3 i2 = max(g.xyz, l.zxy);

            // Parallelepiped corners
            vec3 x1 = x0 - i1 + C.xxx;
            vec3 x2 = x0 - i2 + C.yyy;
            vec3 x3 = x0 - D.yyy;

            // Permutations
            i = mod289(i);
            vec4 p = permute(permute(permute(
                    i.z + vec4(0.0, i1.z, i2.z, 1.0))
                  + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                  + i.x + vec4(0.0, i1.x, i2.x, 1.0));

            // Gradients
            float n_ = 0.142857142857; // 1.0/7.0
            vec3 ns = n_ * D.wyz - D.xzx;

            vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

            vec4 x_ = floor(j * ns.z);
            vec4 y_ = floor(j - 7.0 * x_);

            vec4 x = x_ *ns.x + ns.yyyy;
            vec4 y = y_ *ns.x + ns.yyyy;
            vec4 h = 1.0 - abs(x) - abs(y);

            vec4 b0 = vec4(x.xy, y.xy);
            vec4 b1 = vec4(x.zw, y.zw);

            vec4 s0 = floor(b0)*2.0 + 1.0;
            vec4 s1 = floor(b1)*2.0 + 1.0;
            vec4 sh = -step(h, vec4(0.0));

            vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
            vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;

            vec3 p0 = vec3(a0.xy, h.x);
            vec3 p1 = vec3(a0.zw, h.y);
            vec3 p2 = vec3(a1.xy, h.z);
            vec3 p3 = vec3(a1.zw, h.w);

            // Normalise gradients
            vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
            p0 *= norm.x;
            p1 *= norm.y;
            p2 *= norm.z;
            p3 *= norm.w;

            // Mix final noise value
            vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
            m = m * m;
            return 42.0 * dot(m*m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
          }

          void main() {
            vUv = uv;
            vPosition = position;

            vec3 transformed = position;

            // Distance from center for edge dampening
            float distFromCenter = length(transformed.xz) / (${waterSize.toFixed(1)} * 0.5);
            float edgeFactor = 1.0 - smoothstep(0.7, 0.95, distFromCenter);

            // Include fluid simulation influence in wave calculation
            vec2 flowOffset = fluidVelocity * 0.5;

            // Use 3D noise for more organic waves
            float wave1 = snoise(vec3(
                transformed.x * 0.05 + time * 0.2 + flowOffset.x,
                time * 0.1,
                transformed.z * 0.05 + time * 0.1 + flowOffset.y
            )) * 0.5;

            float wave2 = snoise(vec3(
                transformed.x * 0.1 - time * 0.15,
                time * 0.2,
                transformed.z * 0.1 + flowOffset.y * 0.5
            )) * 0.25;

            float wave3 = snoise(vec3(
                transformed.x * 0.2 + time * 0.1,
                time * 0.15,
                transformed.z * 0.2 - time * 0.05
            )) * 0.125;

            // Dream-like flowing motion
            float dreamWave = 0.0;
            if (dreamFactor > 0.0) {
                dreamWave = sin(transformed.x * 0.01 + time * 0.1) *
                           cos(transformed.z * 0.008 + time * 0.07) *
                           dreamFactor * 0.5;
            }

            // Audio-reactive ripples
            float audioRipples = 0.0;
            for (int i = 0; i < 8; i++) {
                if (audioFrequencies[i] > 0.1) {
                    float freq = 0.1 + float(i) * 0.05; // Increasing frequency
                    float amp = audioFrequencies[i] * 0.3;
                    float phase = time * (0.2 + float(i) * 0.05);

                    float xComp = sin(transformed.x * freq + phase);
                    float zComp = cos(transformed.z * freq + phase * 1.3);

                    audioRipples += xComp * zComp * amp * (1.0 - float(i) * 0.1);
                }
            }

            // Combine waves and apply edge dampening
            float waveHeight = (wave1 + wave2 + wave3 + dreamWave + audioRipples) *
                               edgeFactor * waveHeight;

            transformed.y += waveHeight;

            vWaveHeight = waveHeight;

            // Calculate normal for better reflections and lighting
            float delta = 0.1;

            vec3 pos1 = vec3(transformed.x + delta, 0.0, transformed.z);
            vec3 pos2 = vec3(transformed.x - delta, 0.0, transformed.z);
            vec3 pos3 = vec3(transformed.x, 0.0, transformed.z + delta);
            vec3 pos4 = vec3(transformed.x, 0.0, transformed.z - delta);

            float h1 = snoise(vec3(pos1.x * 0.05 + time * 0.2, time * 0.1, pos1.z * 0.05 + time * 0.1)) * 0.5 +
                       snoise(vec3(pos1.x * 0.1 - time * 0.15, time * 0.2, pos1.z * 0.1)) * 0.25;

            float h2 = snoise(vec3(pos2.x * 0.05 + time * 0.2, time * 0.1, pos2.z * 0.05 + time * 0.1)) * 0.5 +
                       snoise(vec3(pos2.x * 0.1 - time * 0.15, time * 0.2, pos2.z * 0.1)) * 0.25;

            float h3 = snoise(vec3(pos3.x * 0.05 + time * 0.2, time * 0.1, pos3.z * 0.05 + time * 0.1)) * 0.5 +
                       snoise(vec3(pos3.x * 0.1 - time * 0.15, time * 0.2, pos3.z * 0.1)) * 0.25;

            float h4 = snoise(vec3(pos4.x * 0.05 + time * 0.2, time * 0.1, pos4.z * 0.05 + time * 0.1)) * 0.5 +
                       snoise(vec3(pos4.x * 0.1 - time * 0.15, time * 0.2, pos4.z * 0.1)) * 0.25;

            vec3 tangentX = normalize(vec3(2.0 * delta, h1 - h2, 0.0));
            vec3 tangentZ = normalize(vec3(0.0, h3 - h4, 2.0 * delta));

            vNormal = normalize(cross(tangentZ, tangentX));

            gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 waterColors[2];
          uniform vec3 baseWaterColor;
          uniform float time;
          uniform float dreamFactor;

          varying vec2 vUv;
          varying float vWaveHeight;
          varying vec3 vPosition;
          varying vec3 vNormal;

          // Simple noise for water texture variation
          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
          }

          float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f*f*(3.0-2.0*f); // Smooth interpolation

            float n = mix(
              mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
              mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
              f.y
            );

            return n;
          }

          void main() {
            // Map wave height to color mix
            float mixFactor = (vWaveHeight + 0.875) * 0.5; // Normalize to 0-1 range

            // Add dreamlike color shifting
            float dreamShift = 0.0;
            if (dreamFactor > 0.0) {
              dreamShift = sin(vPosition.x * 0.02 + time * 0.05) *
                          cos(vPosition.z * 0.03 + time * 0.07) *
                          dreamFactor * 0.2;
            }

            mixFactor = clamp(mixFactor + dreamShift, 0.0, 1.0);

            // Mix between the two water colors
            vec3 waterColor = mix(waterColors[0], waterColors[1], mixFactor);

            // Distance from center for edge effect
            float distFromCenter = length(vPosition.xz) / 45.0;
            float edgeFactor = smoothstep(0.8, 0.95, distFromCenter);

            // Mix with deeper water color near edges
            waterColor = mix(waterColor, baseWaterColor, edgeFactor);

            // Add subtle water texture variation
            float waterTexture = noise(vPosition.xz * 0.1 + time * 0.05) * 0.05;
            waterColor += vec3(waterTexture);

            // Add reflections based on normal
            vec3 lightDir = normalize(vec3(0.5, 1.0, 0.5));
            float fresnel = 0.1 + 0.9 * pow(1.0 - dot(normalize(vNormal), normalize(vec3(0.0, 1.0, 0.0))), 3.0);
            // Calculate specular INTENSITY as a float first
            float specularIntensity = pow(max(0.0, dot(reflect(-lightDir, vNormal), vec3(0.0, 1.0, 0.0))), 20.0) * 0.8;

            // Initialize specular COLOR as white scaled by intensity
            vec3 specularColor = vec3(specularIntensity);

            // Enhanced specular highlights with dreaminess
            if (dreamFactor > 0.5) {
              // Add rainbow-like effect to specular highlights
              float hueShift = fract(time * 0.05 + vPosition.x * 0.01);
              vec3 rainbowSpec = vec3(
                0.5 + 0.5 * sin(hueShift * 6.28),
                0.5 + 0.5 * sin(hueShift * 6.28 + 2.1),
                0.5 + 0.5 * sin(hueShift * 6.28 + 4.2)
              );
              // Mix the base specular color (white * intensity) with the rainbow color, scaled by dreamFactor
              // Ensure mix factor is between 0 and 1
              float rainbowMixFactor = clamp((dreamFactor - 0.5) * 2.0, 0.0, 1.0);
              specularColor = mix(specularColor, rainbowSpec * specularIntensity, rainbowMixFactor);
            }
            // No 'else' needed, specularColor is already vec3(specularIntensity)

            // Apply lighting effects using the calculated specularColor (vec3)
            waterColor += specularColor;
            waterColor = mix(waterColor, waterColors[1], fresnel * 0.5);

            // Add subtle pulsing opacity based on wave height
            float opacity = 0.8 + vWaveHeight * 0.1;

            gl_FragColor = vec4(waterColor, opacity);
          }
        `,
        transparent: true,
        side: THREE.DoubleSide
      });

      const water = new THREE.Mesh(waterGeometry, waterMaterial);
      water.rotation.x = -Math.PI / 2;
      water.position.y = -7;
      water.userData = { type: 'water' };

      scene.add(water);
      this.objects.push(water);
    }

    // Create enhanced celestial objects with fluid morphing
    createCelestialObjects(scene, settings) {
      // Create sun or moon
      const mainCelestialSize = 5;
      const mainCelestialGeometry = new THREE.SphereGeometry(mainCelestialSize, 64, 64);

      // Choose color based on mood
      const mainColor = new THREE.Color(settings.colors[Math.floor(Math.random() * settings.colors.length)]);

      // Create dynamic texture for celestial object
      const celestialCanvas = document.createElement('canvas');
      celestialCanvas.width = 1024;
      celestialCanvas.height = 1024;
      const context = celestialCanvas.getContext('2d');

      // Fill with base color
      context.fillStyle = `#${mainColor.getHexString()}`;
      context.fillRect(0, 0, 1024, 1024);

      // Add some texture details
      const isMoon = this.mood === 'calm' || this.mood === 'cosmic';

      if (isMoon) {
        // Create moon craters with more dynamic appearance
        context.globalCompositeOperation = 'multiply'; // Darker effect for craters

        // Create larger, more defined craters
        for (let i = 0; i < 30; i++) {
          const x = Math.random() * 1024;
          const y = Math.random() * 1024;
          const radius = 10 + Math.random() * 80;
          const gradient = context.createRadialGradient(x, y, 0, x, y, radius);

          gradient.addColorStop(0, 'rgba(80, 80, 100, 0.7)');
          gradient.addColorStop(0.4, 'rgba(50, 50, 70, 0.5)');
          gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

          context.fillStyle = gradient;
          context.beginPath();
          context.arc(x, y, radius, 0, Math.PI * 2);
          context.fill();
        }

        // Add subtle highlights around craters
        context.globalCompositeOperation = 'screen';
        for (let i = 0; i < 20; i++) {
          const x = Math.random() * 1024;
          const y = Math.random() * 1024;
          const radius = 5 + Math.random() * 40;
          const gradient = context.createRadialGradient(x, y, 0, x, y, radius);

          gradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
          gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)');
          gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

          context.fillStyle = gradient;
          context.beginPath();
          context.arc(x, y, radius, 0, Math.PI * 2);
          context.fill();
        }

        // Add "maria" (dark areas) of the moon
        context.globalCompositeOperation = 'darken';
        for (let i = 0; i < 5; i++) {
          const x = Math.random() * 1024;
          const y = Math.random() * 1024;
          const radiusX = 100 + Math.random() * 200;
          const radiusY = 100 + Math.random() * 200;

          context.fillStyle = 'rgba(40, 40, 60, 0.3)';
          context.beginPath();
          context.ellipse(x, y, radiusX, radiusY, Math.random() * Math.PI, 0, Math.PI * 2);
          context.fill();
        }

      } else {
        // Create sun surface with enhanced details
        context.globalCompositeOperation = 'overlay';

        // Solar granulation (small cells)
        for (let i = 0; i < 8000; i++) {
          const x = Math.random() * 1024;
          const y = Math.random() * 1024;
          const radius = 3 + Math.random() * 15;
          const brightness = Math.random() > 0.5 ? 0.1 : -0.1; // Some cells brighter, some darker

          const gradient = context.createRadialGradient(x, y, 0, x, y, radius);

          if (brightness > 0) {
            gradient.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
          } else {
            gradient.addColorStop(0, 'rgba(0, 0, 0, 0.1)');
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
          }

          context.fillStyle = gradient;
          context.beginPath();
          context.arc(x, y, radius, 0, Math.PI * 2);
          context.fill();
        }

        // Solar flares and prominences
        context.globalCompositeOperation = 'screen';
        for (let i = 0; i < 8; i++) {
          const x = Math.random() * 1024;
          const y = Math.random() * 1024;
          const radius = 100 + Math.random() * 300;
          const gradient = context.createRadialGradient(x, y, 0, x, y, radius);

          gradient.addColorStop(0, 'rgba(255, 230, 150, 0.4)');
          gradient.addColorStop(0.5, 'rgba(255, 200, 100, 0.2)');
          gradient.addColorStop(1, 'rgba(255, 150, 50, 0)');

          context.fillStyle = gradient;
          context.beginPath();
          context.arc(x, y, radius, 0, Math.PI * 2);
          context.fill();
        }

        // Solar spots
        context.globalCompositeOperation = 'multiply';
        for (let i = 0; i < 12; i++) {
          const x = Math.random() * 1024;
          const y = Math.random() * 1024;
          const radius = 10 + Math.random() * 60;
          const gradient = context.createRadialGradient(x, y, 0, x, y, radius);

          gradient.addColorStop(0, 'rgba(0, 0, 0, 0.8)');
          gradient.addColorStop(0.3, 'rgba(50, 0, 0, 0.6)');
          gradient.addColorStop(1, 'rgba(100, 50, 0, 0)');

          context.fillStyle = gradient;
          context.beginPath();
          context.arc(x, y, radius, 0, Math.PI * 2);
          context.fill();
        }
      }

      // Create texture from canvas
      const celestialTexture = new THREE.CanvasTexture(celestialCanvas);
      celestialTexture.anisotropy = 16; // Improve texture quality

      // Create material with dreamlike animation
      const mainCelestialMaterial = new THREE.ShaderMaterial({
        uniforms: {
          map: { value: celestialTexture },
          time: { value: 0 },
          dreamFactor: { value: settings.dreaminess },
          colorShift: { value: settings.colorShift },
          isMoon: { value: isMoon ? 1.0 : 0.0 }
        },
        vertexShader: `
          uniform float time;
          uniform float dreamFactor;

          varying vec2 vUv;
          varying vec3 vPosition;

          void main() {
            vUv = uv;
            vPosition = position;

            // Add subtle morphing to the vertex positions for dreamlike effect
            vec3 transformed = position;

            if (dreamFactor > 0.0) {
              float morphFactor = dreamFactor * 0.1;
              transformed.x += sin(position.y * 4.0 + time * 0.2) * morphFactor;
              transformed.y += cos(position.z * 4.0 + time * 0.3) * morphFactor;
              transformed.z += sin(position.x * 4.0 + time * 0.25) * morphFactor;
            }

            gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D map;
          uniform float time;
          uniform float dreamFactor;
          uniform float colorShift;
          uniform float isMoon;

          varying vec2 vUv;
          varying vec3 vPosition;

          // Simple noise function
          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
          }

          // Simple 2D rotation
          vec2 rotate(vec2 v, float a) {
            float s = sin(a);
            float c = cos(a);
            return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
          }

          void main() {
            // Calculate distorted UVs for dreamlike effect
            vec2 uv = vUv;

            // Apply dream distortion if enabled
            if (dreamFactor > 0.0) {
              float distortAmount = 0.02 * dreamFactor;

              // Slow, gentle distortion
              uv.x += sin(uv.y * 10.0 + time * 0.1) * distortAmount;
              uv.y += cos(uv.x * 8.0 + time * 0.15) * distortAmount;

              // Subtle rotation
              uv = uv - 0.5;
              uv = rotate(uv, sin(time * 0.02) * 0.02 * dreamFactor);
              uv = uv + 0.5;
            }

            // Sample the texture
            vec4 texColor = texture2D(map, uv);

            // Apply color shifting if not moon
            if (isMoon < 0.5 && colorShift > 0.0) {
              float hueShift = sin(time * 0.1) * 0.1 * colorShift;
              float s = sin(hueShift);
              float c = cos(hueShift);

              mat3 hueRotation = mat3(
                0.299 + 0.701 * c + 0.168 * s, 0.587 - 0.587 * c + 0.330 * s, 0.114 - 0.114 * c - 0.497 * s,
                0.299 - 0.299 * c - 0.328 * s, 0.587 + 0.413 * c + 0.035 * s, 0.114 - 0.114 * c + 0.292 * s,
                0.299 - 0.299 * c + 1.250 * s, 0.587 - 0.587 * c - 1.050 * s, 0.114 + 0.886 * c - 0.203 * s
              );

              texColor.rgb = hueRotation * texColor.rgb;
            }

            // Add subtle pulse for sun
            if (isMoon < 0.5) {
              float brightness = 1.0 + sin(time * 0.2) * 0.05;
              texColor.rgb *= brightness;
            }

            // Add edge glow based on normals
            vec3 normal = normalize(vPosition);
            float edgeFactor = 1.0 - abs(dot(normal, vec3(0.0, 0.0, 1.0)));

            // More pronounced edge glow for sun
            if (isMoon < 0.5) {
              vec3 glowColor = texColor.rgb * 1.5;
              texColor.rgb = mix(texColor.rgb, glowColor, edgeFactor * 0.6);
            }

            gl_FragColor = texColor;
          }
        `,
        transparent: true
      });

      const mainCelestial = new THREE.Mesh(mainCelestialGeometry, mainCelestialMaterial);
      mainCelestial.position.set(30, 20, -30);
      mainCelestial.userData = {
        type: 'celestial',
        radius: 40,
        speed: 0.05,
        originalY: 20,
        respondToFluid: false
      };

      // Create a custom animation update for the celestial object
      const celestialAnimator = {
        update: (time, audioReactivity) => {
          if (mainCelestialMaterial.uniforms) {
            mainCelestialMaterial.uniforms.time.value = time;

            // Use audio reactivity
            if (audioReactivity && audioReactivity.frequencyBands) {
              const averageFreq = audioReactivity.frequencyBands.slice(0, 4).reduce((a, b) => a + b, 0) / 4;

              // Pulse with low frequencies
              mainCelestialMaterial.uniforms.colorShift.value =
                settings.colorShift + averageFreq * 0.3;
            }
          }
        },
        dispose: () => {
          // Cleanup if needed
        }
      };

      this.animators.push(celestialAnimator);

      scene.add(mainCelestial);
      this.objects.push(mainCelestial);

      // Add improved glow effect with adaptive shader
      const glowGeometry = new THREE.SphereGeometry(mainCelestialSize * 1.5, 32, 32);
      const glowMaterial = new THREE.ShaderMaterial({
        uniforms: {
          viewVector: { value: new THREE.Vector3(0, 0, 1) },
          glowColor: { value: new THREE.Color(mainColor) },
          time: { value: 0 },
          dreamFactor: { value: settings.dreaminess },
          pulseSpeed: { value: 0.5 }
        },
        vertexShader: `
          uniform vec3 viewVector;
          uniform float time;
          uniform float dreamFactor;

          varying float intensity;
          varying vec3 vPosition;

          void main() {
            vec3 vNormal = normalize(normalMatrix * normal);
            vec3 vNormel = normalize(normalMatrix * viewVector);

            // Calculate base intensity for rim glow
            intensity = pow(1.0 - dot(vNormal, vNormel), 2.0);

            // Add subtle pulsation to the glow
            intensity *= 0.8 + 0.2 * sin(time * 0.5);

            // More organic, dream-like variations in intensity
            if (dreamFactor > 0.3) {
              float distortion = sin(position.x * 3.0 + time * 0.2) *
                                 cos(position.y * 2.0 + time * 0.3) *
                                 dreamFactor * 0.3;

              intensity *= 1.0 + distortion;
            }

            // Pass position to fragment shader
            vPosition = position;

            // Slight vertex position morphing for more organic movement
            vec3 transformed = position;
            if (dreamFactor > 0.5) {
              transformed.x += sin(position.y * 2.0 + time * 0.3) * 0.05 * dreamFactor;
              transformed.y += cos(position.z * 2.0 + time * 0.4) * 0.05 * dreamFactor;
              transformed.z += sin(position.x * 2.0 + time * 0.5) * 0.05 * dreamFactor;
            }

            gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 glowColor;
          uniform float time;
          uniform float dreamFactor;
          uniform float pulseSpeed;

          varying float intensity;
          varying vec3 vPosition;

          // Simple noise function
          float hash(vec3 p) {
            p = fract(p * vec3(443.8975, 397.2973, 491.1871));
            p += dot(p.yzx, p.zxy + 19.19);
            return fract(p.x * p.y * p.z);
          }

          void main() {
            // Base rim glow color
            vec3 finalColor = glowColor * intensity;

            // Add color variations for dream-like effect
            if (dreamFactor > 0.4) {
              // Calculate noise-based color modulation
              float noise = hash(vPosition + vec3(time * 0.1, 0.0, 0.0));

              // Create subtle rainbow-like hue shifting
              vec3 colorShift = vec3(
                sin(time * pulseSpeed * 0.3 + vPosition.x * 0.2),
                sin(time * pulseSpeed * 0.4 + vPosition.y * 0.2),
                sin(time * pulseSpeed * 0.5 + vPosition.z * 0.2)
              ) * 0.1 * dreamFactor;

              finalColor += colorShift * intensity * noise;
            }

            // Slightly vary opacity with dream factor
            float opacityVariation = dreamFactor > 0.5 ?
                                     sin(vPosition.x * 10.0 + time) * 0.1 * dreamFactor :
                                     0.0;

            float finalOpacity = min(intensity + opacityVariation, 1.0);

            gl_FragColor = vec4(finalColor, finalOpacity);
          }
        `,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true
      });

      const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
      mainCelestial.add(glowMesh);

      // Create glow animator
      const glowAnimator = {
        update: (time, audioReactivity) => {
          if (glowMaterial.uniforms) {
            glowMaterial.uniforms.time.value = time;

            // Use audio reactivity for glow
            if (audioReactivity) {
              glowMaterial.uniforms.pulseSpeed.value =
                0.5 + audioReactivity.midPower * 2.0;
            }
          }
        },
        dispose: () => {
          // Cleanup if needed
        }
      };

      this.animators.push(glowAnimator);

      // Add some smaller planets/moons with enhanced dynamic effects
      const planetCount = Math.floor(Math.random() * 3) + 1;

      for (let i = 0; i < planetCount; i++) {
        const planetSize = 1 + Math.random() * 2;
        const planetGeometry = new THREE.SphereGeometry(planetSize, 32, 32);

        // Create unique texture for each planet
        const planetCanvas = document.createElement('canvas');
        planetCanvas.width = 512;
        planetCanvas.height = 512;
        const planetContext = planetCanvas.getContext('2d');

        // Base color
        const planetColorIndex = Math.floor(Math.random() * settings.colors.length);
        const planetBaseColor = new THREE.Color(settings.colors[planetColorIndex]);
        planetContext.fillStyle = `#${planetBaseColor.getHexString()}`;
        planetContext.fillRect(0, 0, 512, 512);

        // Add texture details
        planetContext.globalCompositeOperation = 'overlay';

        // Create bands or spots
        if (Math.random() > 0.5) {
          // Banded planet (like Jupiter)
          for (let band = 0; band < 10; band++) {
            const y = band * 512 / 10;
            const height = 512 / 10;
            const darkness = Math.random() * 0.4 - 0.2;

            planetContext.fillStyle = darkness > 0 ?
              `rgba(255, 255, 255, ${darkness})` :
              `rgba(0, 0, 0, ${-darkness})`;

            planetContext.fillRect(0, y, 512, height);
          }

          // Add swirls and storms
          for (let s = 0; s < 5; s++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const radius = 10 + Math.random() * 40;
            const brightness = Math.random() > 0.5 ? 0.15 : -0.15;

            const gradient = planetContext.createRadialGradient(x, y, 0, x, y, radius);

            if (brightness > 0) {
              gradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
              gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)');
              gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            } else {
              gradient.addColorStop(0, 'rgba(0, 0, 0, 0.3)');
              gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.1)');
              gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            }

            planetContext.fillStyle = gradient;
            planetContext.beginPath();
            planetContext.arc(x, y, radius, 0, Math.PI * 2);
            planetContext.fill();
          }

        } else {
          // Spotted planet (like Mars)
          planetContext.globalCompositeOperation = 'multiply';

          // Add terrain variations
          for (let terrain = 0; terrain < 10; terrain++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const radiusX = 20 + Math.random() * 100;
            const radiusY = 20 + Math.random() * 100;
            const rotation = Math.random() * Math.PI;

            planetContext.fillStyle = `rgba(50, 20, 0, 0.1)`;
            planetContext.beginPath();
            planetContext.ellipse(x, y, radiusX, radiusY, rotation, 0, Math.PI * 2);
            planetContext.fill();
          }

          // Add craters and surface features
          planetContext.globalCompositeOperation = 'overlay';
          for (let crater = 0; crater < 30; crater++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const radius = 5 + Math.random() * 20;
            const brightness = Math.random() > 0.7 ? 0.2 : -0.1;

            const gradient = planetContext.createRadialGradient(x, y, 0, x, y, radius);

            if (brightness > 0) {
              gradient.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
              gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            } else {
              gradient.addColorStop(0, 'rgba(0, 0, 0, 0.2)');
              gradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.05)');
              gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            }

            planetContext.fillStyle = gradient;
            planetContext.beginPath();
            planetContext.arc(x, y, radius, 0, Math.PI * 2);
            planetContext.fill();
          }
        }

        // Create planet texture
        const planetTexture = new THREE.CanvasTexture(planetCanvas);
        planetTexture.anisotropy = 4;

        // Create shader material for dynamic planet surface
        const planetMaterial = new THREE.ShaderMaterial({
          uniforms: {
            map: { value: planetTexture },
            time: { value: 0 },
            dreamFactor: { value: settings.dreaminess },
            colorShift: { value: settings.colorShift * Math.random() },
            baseColor: { value: planetBaseColor }
          },
          vertexShader: `
            uniform float time;
            uniform float dreamFactor;

            varying vec2 vUv;
            varying vec3 vNormal;

            void main() {
              vUv = uv;
              vNormal = normalize(normalMatrix * normal);

              // Add subtle morphing to vertices based on dreamFactor
              vec3 transformed = position;
              if (dreamFactor > 0.3) {
                float morphAmount = dreamFactor * 0.05;
                transformed.x += sin(position.y * 3.0 + time * 0.2) * morphAmount;
                transformed.y += cos(position.z * 3.0 + time * 0.3) * morphAmount;
                transformed.z += sin(position.x * 3.0 + time * 0.25) * morphAmount;
              }

              gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
            }
          `,
          fragmentShader: `
            uniform sampler2D map;
            uniform float time;
            uniform float dreamFactor;
            uniform float colorShift;
            uniform vec3 baseColor;

            varying vec2 vUv;
            varying vec3 vNormal;

            void main() {
              // Add dreamlike rotation to UVs
              vec2 uv = vUv;
              if (dreamFactor > 0.0) {
                float rotAmount = sin(time * 0.1) * 0.01 * dreamFactor;

                // Rotate UVs around center
                vec2 center = vec2(0.5, 0.5);
                vec2 centered = uv - center;
                float s = sin(rotAmount);
                float c = cos(rotAmount);
                mat2 rotMat = mat2(c, s, -s, c);
                centered = rotMat * centered;
                uv = centered + center;

                // Add subtle distortion
                uv.x += sin(uv.y * 10.0 + time * 0.1) * 0.01 * dreamFactor;
                uv.y += cos(uv.x * 8.0 + time * 0.15) * 0.01 * dreamFactor;
              }

              // Sample the texture
              vec4 texColor = texture2D(map, uv);

              // Apply time-based color shifting
              if (colorShift > 0.0) {
                float shift = sin(time * 0.2) * colorShift;

                // Shift the hue
                float angle = shift * 3.14159265;
                float s = sin(angle);
                float c = cos(angle);

                mat3 hueShift = mat3(
                  0.299 + 0.701 * c + 0.168 * s,
                  0.587 - 0.587 * c + 0.330 * s,
                  0.114 - 0.114 * c - 0.497 * s,

                  0.299 - 0.299 * c - 0.328 * s,
                  0.587 + 0.413 * c + 0.035 * s,
                  0.114 - 0.114 * c + 0.292 * s,

                  0.299 - 0.299 * c + 1.250 * s,
                  0.587 - 0.587 * c - 1.050 * s,
                  0.114 + 0.886 * c - 0.203 * s
                );

                texColor.rgb = mix(texColor.rgb, hueShift * texColor.rgb, colorShift);
              }

              // Add edge glow based on normals
              float edge = 1.0 - max(0.0, dot(vNormal, vec3(0.0, 0.0, 1.0)));
              texColor.rgb += baseColor * edge * 0.5;

              gl_FragColor = texColor;
            }
          `
        });

        const planet = new THREE.Mesh(planetGeometry, planetMaterial);

        const radius = 20 + Math.random() * 30;
        const speed = 0.05 + Math.random() * 0.15;
        const startAngle = Math.random() * Math.PI * 2;
        const inclination = Math.random() * Math.PI * 0.3;

        planet.position.set(
          Math.cos(startAngle) * radius,
          10 + Math.random() * 15,
          Math.sin(startAngle) * radius
        );

        planet.userData = {
          type: 'celestial',
          radius: radius,
          speed: speed,
          inclination: inclination,
          originalY: planet.position.y,
          respondToFluid: Math.random() > 0.5
        };

        // Create animator for the planet
        const planetAnimator = {
          update: (time, audioReactivity) => {
            if (planetMaterial.uniforms) {
              planetMaterial.uniforms.time.value = time;

              // Use audio reactivity
              if (audioReactivity) {
                const freqBandIndex = Math.floor(Math.random() * audioReactivity.frequencyBands.length);
                const freqBand = audioReactivity.frequencyBands[freqBandIndex] || 0;

                // Enhance color shifting with audio
                planetMaterial.uniforms.colorShift.value =
                  settings.colorShift * Math.random() + freqBand * 0.5;
              }
            }
          },
          dispose: () => {
            // Cleanup if needed
          }
        };

        this.animators.push(planetAnimator);

        // Add simple atmosphere for some planets
        if (Math.random() > 0.3) {
          const atmoGeometry = new THREE.SphereGeometry(planetSize * 1.1, 32, 32);
          const atmoMaterial = new THREE.ShaderMaterial({
            uniforms: {
              color: { value: planetBaseColor },
              time: { value: 0 },
              dreamFactor: { value: settings.dreaminess }
            },
            vertexShader: `
              uniform float time;
              uniform float dreamFactor;

              varying vec3 vNormal;
              varying vec3 vPosition;

              void main() {
                vNormal = normalize(normalMatrix * normal);
                vPosition = position;

                // Add subtle displacement for dreamlike effect
                vec3 transformed = position;
                if (dreamFactor > 0.3) {
                  float warpFactor = dreamFactor * 0.08;
                  transformed += normal * (
                    sin(position.x * 5.0 + time * 0.5) *
                    cos(position.y * 5.0 + time * 0.4) *
                    warpFactor
                  );
                }

                gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
              }
            `,
            fragmentShader: `
              uniform vec3 color;
              uniform float time;
              uniform float dreamFactor;

              varying vec3 vNormal;
              varying vec3 vPosition;

              void main() {
                // Calculate fresnel factor for atmospheric rim glow
                vec3 viewDir = normalize(cameraPosition - vPosition);
                float fresnel = pow(1.0 - max(0.0, dot(vNormal, viewDir)), 3.0);

                // Add dreamlike pulsating to the glow
                float pulse = 1.0;
                if (dreamFactor > 0.0) {
                  pulse += sin(time * 0.5) * 0.2 * dreamFactor;

                  // Add subtle color variation with time
                  float hueShift = sin(time * 0.1) * 0.1 * dreamFactor;
                  float r = color.r + hueShift;
                  float g = color.g + hueShift * 0.5;
                  float b = color.b - hueShift;

                  vec3 shiftedColor = vec3(r, g, b);
                  gl_FragColor = vec4(shiftedColor, fresnel * pulse * 0.6);
                } else {
                  gl_FragColor = vec4(color, fresnel * 0.5);
                }
              }
            `,
            transparent: true,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending
          });

          const atmosphere = new THREE.Mesh(atmoGeometry, atmoMaterial);
          planet.add(atmosphere);

          // Create animator for the atmosphere
          const atmoAnimator = {
            update: (time, audioReactivity) => {
              if (atmoMaterial.uniforms) {
                atmoMaterial.uniforms.time.value = time;
              }
            },
            dispose: () => {
              // Cleanup if needed
            }
          };

          this.animators.push(atmoAnimator);
        }

        scene.add(planet);
        this.objects.push(planet);
      }
    }

    // Create improved plants that grow and sway more organically
    createPlants(scene, settings) {
      const plantCount = Math.floor(15 + settings.complexity * 50);

      for (let i = 0; i < plantCount; i++) {
        // Create plant with random properties
        const height = 0.5 + Math.random() * 3;

        // Create a group for the whole plant
        const plantGroup = new THREE.Group();

        // Plant type
        const plantType = Math.random() > 0.3 ? 'flower' :
                         (Math.random() > 0.5 ? 'grass' : 'tree');

        if (plantType === 'flower') {
          // Create stem with organic curve
          const stemCurve = new THREE.CubicBezierCurve3(
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(Math.random() * 0.2 - 0.1, height * 0.3, Math.random() * 0.2 - 0.1),
            new THREE.Vector3(Math.random() * 0.4 - 0.2, height * 0.6, Math.random() * 0.4 - 0.2),
            new THREE.Vector3(Math.random() * 0.3 - 0.15, height, Math.random() * 0.3 - 0.15)
          );

          const stemGeometry = new THREE.TubeGeometry(stemCurve, 8, 0.03, 8, false);
          const stemMaterial = new THREE.MeshStandardMaterial({
            color: new THREE.Color(0x2e8b57),
            roughness: 0.8,
            metalness: 0.1
          });

          const stem = new THREE.Mesh(stemGeometry, stemMaterial);
          stem.castShadow = true;

          plantGroup.add(stem);

          // Create flower
          const petalCount = Math.floor(5 + Math.random() * 7);
          const petalSize = 0.2 + Math.random() * 0.4;
          const flowerColor = new THREE.Color(
            settings.colors[Math.floor(Math.random() * settings.colors.length)]
          );

          const flowerGroup = new THREE.Group();

          // Different flower types
          const flowerType = Math.random() > 0.5 ? 'daisy' : 'tulip';

          if (flowerType === 'daisy') {
            // Daisy-like flower with flat petals
            for (let p = 0; p < petalCount; p++) {
              const angle = (p / petalCount) * Math.PI * 2;

              const petalGeometry = new THREE.PlaneGeometry(petalSize * 1.5, petalSize * 0.5);
              const petalMaterial = new THREE.MeshStandardMaterial({
                color: flowerColor,
                side: THREE.DoubleSide,
                roughness: 0.7,
                metalness: 0
              });

              const petal = new THREE.Mesh(petalGeometry, petalMaterial);
              petal.position.y = height;

              petal.rotation.x = Math.PI / 2;
              petal.rotation.y = angle;

              flowerGroup.add(petal);
            }

            // Add center of flower
            const centerGeometry = new THREE.SphereGeometry(petalSize * 0.3, 16, 16);
            const centerMaterial = new THREE.MeshStandardMaterial({
              color: new THREE.Color(
                settings.colors[Math.floor(Math.random() * settings.colors.length)]
              ),
              roughness: 0.6,
              metalness: 0.1
            });

            const center = new THREE.Mesh(centerGeometry, centerMaterial);
            center.position.y = height;

            flowerGroup.add(center);
          } else {
            // Tulip-like flower with curved petals
            for (let p = 0; p < 6; p++) {
              const angle = (p / 6) * Math.PI * 2;

              // Create curved petal using extruded shape
              const petalShape = new THREE.Shape();
              petalShape.moveTo(0, 0);
              petalShape.quadraticCurveTo(petalSize * 0.5, petalSize * 1.5, 0, petalSize * 2);
              petalShape.quadraticCurveTo(-petalSize * 0.5, petalSize * 1.5, 0, 0);

              const extrudeSettings = {
                steps: 1,
                depth: 0.05,
                bevelEnabled: true,
                bevelThickness: 0.02,
                bevelSize: 0.02,
                bevelSegments: 3
              };

              const petalGeometry = new THREE.ExtrudeGeometry(petalShape, extrudeSettings);
              const petalMaterial = new THREE.MeshStandardMaterial({
                color: flowerColor,
                roughness: 0.7,
                metalness: 0
              });

              const petal = new THREE.Mesh(petalGeometry, petalMaterial);
              petal.position.y = height - petalSize;

              petal.rotation.x = -Math.PI / 6; // Tilt petals upwards
              petal.rotation.y = angle;

              flowerGroup.add(petal);
            }
          }

          plantGroup.add(flowerGroup);
        } else if (plantType === 'grass') {
          // Create grass blades with more natural curves
          const bladeCount = Math.floor(3 + Math.random() * 6);
          const bladeHeight = height * 1.2;

          for (let b = 0; b < bladeCount; b++) {
            // Create a curved blade using cubic bezier
            const curviness = Math.random() * 0.5 + 0.5; // Random curve amount
            const direction = b % 2 ? 1 : -1; // Alternate directions
            const curve = new THREE.CubicBezierCurve3(
              new THREE.Vector3(0, 0, 0),
              new THREE.Vector3(0.1 * direction * curviness, bladeHeight * 0.3, 0),
              new THREE.Vector3(0.2 * direction * curviness, bladeHeight * 0.6, 0),
              new THREE.Vector3(0.3 * direction * curviness, bladeHeight, 0)
            );

            const bladeGeometry = new THREE.TubeGeometry(curve, 8, 0.03 - 0.02 * (b / bladeCount), 8, false);

            const bladeColor = Math.random() > 0.8 ?
              new THREE.Color(settings.colors[Math.floor(Math.random() * settings.colors.length)]) :
              new THREE.Color(0x3a5f0b);

            const bladeMaterial = new THREE.MeshStandardMaterial({
              color: bladeColor,
              roughness: 0.8,
              metalness: 0.1
            });

            const blade = new THREE.Mesh(bladeGeometry, bladeMaterial);

            // Position blade with slight variation
            blade.rotation.y = (b / bladeCount) * Math.PI * 2;

            blade.castShadow = true;
            plantGroup.add(blade);
          }
        } else {
          // Create small tree with more organic structure
          const trunkHeight = height * 1.5;

          // Create a curved trunk for more natural look
          const trunkCurve = new THREE.CubicBezierCurve3(
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(Math.random() * 0.3 - 0.15, trunkHeight * 0.3, Math.random() * 0.3 - 0.15),
            new THREE.Vector3(Math.random() * 0.4 - 0.2, trunkHeight * 0.6, Math.random() * 0.4 - 0.2),
            new THREE.Vector3(Math.random() * 0.2 - 0.1, trunkHeight, Math.random() * 0.2 - 0.1)
          );

          const trunkGeometry = new THREE.TubeGeometry(trunkCurve, 8, 0.1, 8, false);
          const trunkMaterial = new THREE.MeshStandardMaterial({
            color: 0x8b4513,
            roughness: 0.9,
            metalness: 0
          });

          const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
          trunk.castShadow = true;

          plantGroup.add(trunk);

          // Add foliage
          const foliageType = Math.random() > 0.7 ? 'pine' : 'rounded';

          if (foliageType === 'pine') {
            // Pine tree with cone-shaped foliage
            const levels = Math.floor(2 + Math.random() * 3);

            for (let l = 0; l < levels; l++) {
              const coneHeight = trunkHeight * 0.5 - l * 0.2;
              const coneRadius = trunkHeight * 0.25 * (1 - l * 0.1);

              const coneGeometry = new THREE.ConeGeometry(coneRadius, coneHeight, 8);

              const coneColor = Math.random() > 0.2 ?
                new THREE.Color(0x2d4c1e) :
                new THREE.Color(settings.colors[Math.floor(Math.random() * settings.colors.length)]);

              const coneMaterial = new THREE.MeshStandardMaterial({
                color: coneColor,
                roughness: 0.8,
                metalness: 0.1
              });

              const cone = new THREE.Mesh(coneGeometry, coneMaterial);
              cone.position.y = trunkHeight * 0.5 + l * trunkHeight * 0.2; // Corrected positioning
              cone.castShadow = true;

              plantGroup.add(cone);
            }
          } else {
            // Tree with rounded foliage
            const foliageSize = trunkHeight * 0.4;

            // Create custom geometry for more organic shape
            const foliageGeometry = new THREE.SphereGeometry(foliageSize, 8, 8);
            const positionAttribute = foliageGeometry.getAttribute('position');
            const vertex = new THREE.Vector3();

            // Distort the sphere a bit for more natural look
            for (let v = 0; v < positionAttribute.count; v++) {
              vertex.fromBufferAttribute(positionAttribute, v);

              // Apply noise-based displacement
              const noise = Math.sin(vertex.x * 2) * Math.sin(vertex.y * 3) * Math.sin(vertex.z * 2);
              vertex.multiplyScalar(1 + noise * 0.2);

              positionAttribute.setXYZ(v, vertex.x, vertex.y, vertex.z);
            }

            // Create multiple overlapping foliage clusters
            const foliageClusters = Math.floor(2 + Math.random() * 3);

            for (let f = 0; f < foliageClusters; f++) {
              const foliageColor = Math.random() > 0.3 ?
                new THREE.Color(0x3a5f0b) :
                new THREE.Color(settings.colors[Math.floor(Math.random() * settings.colors.length)]);

              const foliageMaterial = new THREE.MeshStandardMaterial({
                color: foliageColor,
                roughness: 0.8,
                metalness: 0.1
              });

              const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
              foliage.position.set(
                Math.random() * 0.2 - 0.1,
                trunkHeight + Math.random() * 0.3 - 0.15,
                Math.random() * 0.2 - 0.1
              );

              foliage.castShadow = true;
              plantGroup.add(foliage);
            }
          }
        }

        // Position plant randomly on terrain
        plantGroup.position.set(
          Math.random() * 80 - 40,
          -7, // Base height, will be adjusted
          Math.random() * 80 - 40
        );

        // Keep track of original Y position for animation
        plantGroup.userData = {
          type: 'plant',
          originalY: plantGroup.position.y,
          offset: Math.random() * 10 // Random offset for varied animation
        };

        scene.add(plantGroup);
        this.objects.push(plantGroup);
      }
    }


    // Create enhanced particle systems with more fluid and dreamlike motion
    createParticles(scene, settings) {
      // Choose particle type based on mood
      let particleType;
      const mood = this.mood; // Get the current mood

      switch (mood) {
        case 'calm':
          particleType = Math.random() > 0.5 ? 'fireflies' : 'mist';
          break;
        case 'soft':
          particleType = Math.random() > 0.7 ? 'petals' : 'fireflies';
          break;
        case 'uplifting':
          particleType = Math.random() > 0.6 ? 'butterflies' : 'petals';
          break;
        case 'warm':
          particleType = Math.random() > 0.5 ? 'embers' : 'fireflies';
          break;
        case 'cosmic':
          particleType = Math.random() > 0.7 ? 'stardust' : 'mist';
          break;
        default:
          particleType = 'fireflies';
      }

      // Create the appropriate particle system
      if (particleType === 'fireflies') {
        this.createFireflies(scene, settings);
      } else if (particleType === 'mist') {
        this.createMist(scene, settings);
      } else if (particleType === 'petals') {
        this.createPetals(scene, settings);
      } else if (particleType === 'butterflies') {
        this.createButterflies(scene, settings); // New effect for more organic movement
      } else if (particleType === 'embers') {
        this.createEmbers(scene, settings);
      } else if (particleType === 'stardust') {
        this.createStardust(scene, settings);
      }
    }

    // Create improved fireflies with more natural, fluid movement
    createFireflies(scene, settings) {
        // FIX: Declare particleCount first
        const particleCount = Math.floor(settings.particleCount * 0.3);

        const fireflyGeometry = new THREE.BufferGeometry();

        const positions = new Float32Array(particleCount * 3);
        const scales = new Float32Array(particleCount);
        const offsets = new Float32Array(particleCount);
        const speeds = new Float32Array(particleCount);
        const phases = new Float32Array(particleCount);

        for (let i = 0; i < particleCount; i++) {
          // Position fireflies in a hemisphere above the ground
          const radius = 10 + Math.random() * 50;
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.random() * Math.PI * 0.5;

          positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
          positions[i * 3 + 1] = 1 + Math.abs(radius * Math.cos(phi)); // Keep above ground
          positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

          // Random size and animation offset
          scales[i] = 0.3 + Math.random() * 0.7;
          offsets[i] = Math.random() * Math.PI * 2;
          speeds[i] = 0.2 + Math.random() * 0.8; // Random speed for varied movement
          phases[i] = Math.random() * Math.PI * 2; // Random phase offset for natural movement
        }

        fireflyGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        fireflyGeometry.setAttribute('scale', new THREE.BufferAttribute(scales, 1));
        fireflyGeometry.setAttribute('offset', new THREE.BufferAttribute(offsets, 1));
        fireflyGeometry.setAttribute('speed', new THREE.BufferAttribute(speeds, 1));
        fireflyGeometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));

        // Create a custom shader material for the fireflies with improved fluid motion
        const fireflyMaterial = new THREE.ShaderMaterial({
          uniforms: {
            color: { value: new THREE.Color(settings.colors[Math.floor(Math.random() * settings.colors.length)]) },
            time: { value: 0 },
            pixelRatio: { value: window.devicePixelRatio },
            audioStrength: { value: 0.0 },
            dreamFactor: { value: settings.dreaminess },
            fluidInfluence: { value: 0.0 },
            frequencyData: { value: new Float32Array(8) }
          },
          vertexShader: `
            attribute float scale;
            attribute float offset;
            attribute float speed;
            attribute float phase;

            uniform float time;
            uniform float audioStrength;
            uniform float pixelRatio;
            uniform float dreamFactor;
            uniform float fluidInfluence;
            uniform float frequencyData[8];

            varying float vIntensity;
            varying vec2 vUv;
            varying vec3 vPosition;

            // Simplex noise function for fluid motion
            vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

            float snoise(vec2 v) {
              const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                                 -0.577350269189626, 0.024390243902439);
              vec2 i  = floor(v + dot(v, C.yy));
              vec2 x0 = v -   i + dot(i, C.xx);
              vec2 i1;
              i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
              vec4 x12 = x0.xyxy + C.xxzz;
              x12.xy -= i1;
              i = mod289(i);
              vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                    + i.x + vec3(0.0, i1.x, 1.0));
              vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
                                    dot(x12.zw, x12.zw)), 0.0);
              m = m*m;
              m = m*m;
              vec3 x = 2.0 * fract(p * C.www) - 1.0;
              vec3 h = abs(x) - 0.5;
              vec3 ox = floor(x + 0.5);
              vec3 a0 = x - ox;
              m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
              vec3 g;
              g.x  = a0.x  * x0.x  + h.x  * x0.y;
              g.yz = a0.yz * x12.xz + h.yz * x12.yw;
              return 130.0 * dot(m, g);
            }

            void main() {
              // Organic firefly movement with multiple motion influences
              vec3 pos = position;
              vPosition = position;

              // Calculate several motion factors
              float bobRate = 0.5 * speed + offset * 0.3; // Vertical bobbing
              float bobHeight = 0.2 + scale * 0.2; // Height of bobbing

              // Add subtle bobbing motion
              pos.y += sin(time * bobRate + phase) * bobHeight;

              // Add gentle circular drift with varied orbit
              float driftRadius = 0.5 + scale * 1.0;
              float driftRate = 0.2 * speed + offset * 0.1;

              pos.x += cos(time * driftRate + offset * 5.0) * driftRadius;
              pos.z += sin(time * driftRate + offset * 7.0) * driftRadius;

              // Add dreamlike fluid motion based on noise
              if (dreamFactor > 0.0) {
                float noiseScale = 0.1;
                float noiseSpeed = 0.1;
                float noiseFactor = dreamFactor * 0.5;

                float nx = snoise(vec2(pos.x * noiseScale, time * noiseSpeed)) * noiseFactor;
                float ny = snoise(vec2(pos.y * noiseScale, time * noiseSpeed + 100.0)) * noiseFactor;
                float nz = snoise(vec2(pos.z * noiseScale, time * noiseSpeed + 200.0)) * noiseFactor;

                pos.x += nx;
                pos.y += ny;
                pos.z += nz;
              }

              // Audio reactive motion
              if (audioStrength > 0.01) {
                // Use each particle's offset to select a frequency band
                int freqIndex = int(mod(offset * 10.0, 8.0));
                float freqValue = frequencyData[freqIndex];

                // Apply frequency-based displacement
                float freqFactor = freqValue * audioStrength * 2.0;
                pos.x += sin(time * 2.0 + offset * 10.0) * freqFactor;
                pos.y += cos(time * 1.5 + offset * 20.0) * freqFactor;
                pos.z += sin(time * 1.7 + offset * 30.0) * freqFactor;
              }

              // Project position to clip space
              vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
              gl_Position = projectionMatrix * mvPosition;

              // Size attenuation
              float computedScale = scale * (1.0 + audioStrength * 2.0);

              // Pulse scale with audio
              if (audioStrength > 0.1) {
                int pulseIndex = int(mod(phase * 10.0, 8.0));
                computedScale *= 1.0 + frequencyData[pulseIndex] * 2.0;
              }

              gl_PointSize = computedScale * 20.0 * pixelRatio / -mvPosition.z;

              // Calculate intensity for the pulsating glow
              float pulseRate = 1.0 + offset * 3.0;
              vIntensity = 0.3 + 0.7 * (0.5 + 0.5 * sin(time * pulseRate));
              vIntensity *= 1.0 + audioStrength * 0.5;

              // Pass varying data to fragment shader
              vUv = vec2(0.5, 0.5); // Center of point
            }
          `,
          fragmentShader: `
            uniform vec3 color;
            uniform float dreamFactor;

            varying float vIntensity;
            varying vec2 vUv;
            varying vec3 vPosition;

            // Hue shift function for color variation
            vec3 hueShift(vec3 color, float shift) {
              const vec3 k = vec3(0.57735, 0.57735, 0.57735);
              float cosAngle = cos(shift);
              return vec3(color * cosAngle + cross(k, color) * sin(shift) + k * dot(k, color) * (1.0 - cosAngle));
            }

            void main() {
              // Calculate distance from the center of the point
              vec2 center = gl_PointCoord - vec2(0.5);
              float dist = length(center);

              // Discard pixels outside the radius for round points
              if (dist > 0.5) discard;

              // Radial gradient for the glow
              float alpha = smoothstep(0.5, 0.0, dist);

              // Apply pulsating intensity
              alpha *= vIntensity;

              // Apply color variation based on position and dreaminess
              vec3 finalColor = color;
              if (dreamFactor > 0.2) {
                // Shift hue based on position for rainbow-like effect
                float hueAmount = vPosition.x * 0.01 * dreamFactor;
                finalColor = hueShift(color, hueAmount);
              }

              // Soften the center glow
              float centerGlow = smoothstep(0.0, 0.2, dist) * 0.5 + 0.5;
              finalColor *= centerGlow;

              // Final color with glow
              gl_FragColor = vec4(finalColor, alpha);
            }
          `,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });

        const fireflyParticles = new THREE.Points(fireflyGeometry, fireflyMaterial);
        fireflyParticles.userData = { type: 'particles' };

        scene.add(fireflyParticles);
        this.objects.push(fireflyParticles);
      }

    // Create improved mist/fog particle system with volumetric effect
    createMist(scene, settings) {
        // FIX: Declare particleCount first
        const particleCount = Math.floor(settings.particleCount * 0.5);

        const mistGeometry = new THREE.BufferGeometry();

        const positions = new Float32Array(particleCount * 3);
        const scales = new Float32Array(particleCount);
        const offsets = new Float32Array(particleCount);
        const speeds = new Float32Array(particleCount);

        for (let i = 0; i < particleCount; i++) {
          // Position mist particles in a layer above the ground with more variation
          const radius = Math.random() * 60;
          const theta = Math.random() * Math.PI * 2;

          positions[i * 3] = radius * Math.cos(theta);
          positions[i * 3 + 1] = Math.random() * 3; // Low-lying mist
          positions[i * 3 + 2] = radius * Math.sin(theta);

          // Random size and animation offset
          scales[i] = 5 + Math.random() * 15;
          offsets[i] = Math.random() * Math.PI * 2;
          speeds[i] = 0.1 + Math.random() * 0.4; // Varied speeds
        }

        mistGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        mistGeometry.setAttribute('scale', new THREE.BufferAttribute(scales, 1));
        mistGeometry.setAttribute('offset', new THREE.BufferAttribute(offsets, 1));
        mistGeometry.setAttribute('speed', new THREE.BufferAttribute(speeds, 1));

        // Create a texture for mist particles with improved volumetric look
        const mistCanvas = document.createElement('canvas');
        mistCanvas.width = 128;
        mistCanvas.height = 128;
        const context = mistCanvas.getContext('2d');

        // Draw a soft, circular gradient with noise for texture
        const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
        gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.5)');
        gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.2)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        context.fillStyle = gradient;
        context.fillRect(0, 0, 128, 128);

        // Add some noise for texture
        context.globalCompositeOperation = 'overlay';
        for (let i = 0; i < 300; i++) {
          const x = Math.random() * 128;
          const y = Math.random() * 128;
          const brightness = Math.random() > 0.5 ? 0.1 : -0.1;

          context.fillStyle = brightness > 0 ?
            'rgba(255, 255, 255, 0.1)' :
            'rgba(0, 0, 0, 0.1)';

          context.fillRect(x, y, 2, 2);
        }

        const mistTexture = new THREE.CanvasTexture(mistCanvas);

        const mistMaterial = new THREE.ShaderMaterial({
          uniforms: {
            map: { value: mistTexture },
            color: { value: new THREE.Color(settings.colors[4]) },
            time: { value: 0 },
            audioStrength: { value: 0.0 },
            dreamFactor: { value: settings.dreaminess },
            fluidInfluence: { value: settings.fluidMotion }
          },
          vertexShader: `
            attribute float scale;
            attribute float offset;
            attribute float speed;

            uniform float time;
            uniform float audioStrength;
            uniform float dreamFactor;
            uniform float fluidInfluence;

            varying float vScale;
            varying float vOffset;
            varying vec3 vPosition;

            // Simplex noise function
            vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

            float snoise(vec2 v) {
              const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                                 -0.577350269189626, 0.024390243902439);
              vec2 i  = floor(v + dot(v, C.yy));
              vec2 x0 = v -   i + dot(i, C.xx);
              vec2 i1;
              i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
              vec4 x12 = x0.xyxy + C.xxzz;
              x12.xy -= i1;
              i = mod289(i);
              vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                    + i.x + vec3(0.0, i1.x, 1.0));
              vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
                                    dot(x12.zw, x12.zw)), 0.0);
              m = m*m;
              m = m*m;
              vec3 x = 2.0 * fract(p * C.www) - 1.0;
              vec3 h = abs(x) - 0.5;
              vec3 ox = floor(x + 0.5);
              vec3 a0 = x - ox;
              m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
              vec3 g;
              g.x  = a0.x  * x0.x  + h.x  * x0.y;
              g.yz = a0.yz * x12.xz + h.yz * x12.yw;
              return 130.0 * dot(m, g);
            }

            void main() {
              vPosition = position;

              // Slow drifting motion with fluid dynamics
              vec3 pos = position;

              // Base movement
              float driftSpeed = 0.05 * speed;
              pos.x += sin(time * driftSpeed + offset * 10.0) * (1.0 + fluidInfluence);
              pos.z += cos(time * driftSpeed + offset * 8.0) * (1.0 + fluidInfluence);

              // Gentle bobbing - slower for mist
              pos.y += sin(time * 0.1 + offset) * 0.2;

              // Add dreamlike fluid motion
              if (dreamFactor > 0.0) {
                float noiseScale = 0.05;
                float noiseSpeed = 0.05;
                float noiseFactor = dreamFactor * fluidInfluence;

                float nx = snoise(vec2(pos.x * noiseScale, time * noiseSpeed)) * noiseFactor;
                float nz = snoise(vec2(pos.z * noiseScale, time * noiseSpeed + 100.0)) * noiseFactor;

                pos.x += nx;
                pos.z += nz;
              }

              // Audio-reactive motion
              if (audioStrength > 0.0) {
                float reactivity = audioStrength * 2.0;
                pos.y += sin(time * 0.2 + offset * 5.0) * reactivity * 0.5;
              }

              // Project position to clip space
              vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
              gl_Position = projectionMatrix * mvPosition;

              // Pass values to fragment shader
              vScale = scale * (1.0 + audioStrength * 0.5);
              vOffset = offset;

              // Size the particles
              gl_PointSize = vScale;
            }
          `,
          fragmentShader: `
            uniform sampler2D map;
            uniform vec3 color;
            uniform float time;
            uniform float dreamFactor;

            varying float vScale;
            varying float vOffset;
            varying vec3 vPosition;

            void main() {
              // Sample the texture
              vec4 texColor = texture2D(map, gl_PointCoord);

              // Slow pulsating opacity
              float opacity = 0.2 + 0.1 * sin(time * 0.2 + vOffset);

              // Add dream-like color variation
              vec3 finalColor = color;
              if (dreamFactor > 0.3) {
                // Subtle color shift based on position and time
                float colorShift = sin(vPosition.x * 0.01 + vPosition.z * 0.01 + time * 0.1) * dreamFactor * 0.2;

                // Apply color shift as a subtle gradient
                finalColor = mix(
                  color,
                  color * vec3(1.0 + colorShift, 1.0, 1.0 - colorShift),
                  0.3 * dreamFactor
                );
              }

              // Combine with texture alpha
              gl_FragColor = vec4(finalColor, texColor.a * opacity);
            }
          `,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });

        const mistParticles = new THREE.Points(mistGeometry, mistMaterial);
        mistParticles.userData = { type: 'particles' };

        scene.add(mistParticles);
        this.objects.push(mistParticles);
      }

    // Create falling petals particles with more organic motion
    createPetals(scene, settings) {
        // FIX: Declare particleCount first
        const particleCount = Math.floor(settings.particleCount * 0.3);

        const petalGeometry = new THREE.BufferGeometry();

        const positions = new Float32Array(particleCount * 3);
        const rotations = new Float32Array(particleCount);
        const scales = new Float32Array(particleCount);
        const offsets = new Float32Array(particleCount);
        const speeds = new Float32Array(particleCount);

        for (let i = 0; i < particleCount; i++) {
          // Position petals in a volume above the ground
          const radius = Math.random() * 60;
          const theta = Math.random() * Math.PI * 2;

          positions[i * 3] = radius * Math.cos(theta);
          positions[i * 3 + 1] = 5 + Math.random() * 20; // Start high up
          positions[i * 3 + 2] = radius * Math.sin(theta);

          // Random rotation, size and animation offset
          rotations[i] = Math.random() * Math.PI * 2;
          scales[i] = 0.5 + Math.random() * 1.0;
          offsets[i] = Math.random() * Math.PI * 2;
          speeds[i] = 0.5 + Math.random() * 1.0; // Random fall speeds
        }

        petalGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        petalGeometry.setAttribute('rotation', new THREE.BufferAttribute(rotations, 1));
        petalGeometry.setAttribute('scale', new THREE.BufferAttribute(scales, 1));
        petalGeometry.setAttribute('offset', new THREE.BufferAttribute(offsets, 1));
        petalGeometry.setAttribute('speed', new THREE.BufferAttribute(speeds, 1));

        // Create an improved petal texture with more natural shape
        const petalCanvas = document.createElement('canvas');
        petalCanvas.width = 64;
        petalCanvas.height = 64;
        const context = petalCanvas.getContext('2d');

        // Draw a petal shape with slight asymmetry for realism
        context.fillStyle = `#${new THREE.Color(settings.colors[1]).getHexString()}`;
        context.beginPath();

        // More natural petal shape
        context.moveTo(32, 10);
        context.bezierCurveTo(45, 15, 52, 32, 42, 54);
        context.bezierCurveTo(32, 60, 20, 54, 22, 32);
        context.bezierCurveTo(24, 15, 25, 12, 32, 10);

        context.fill();

        // Add vein detail
        context.strokeStyle = 'rgba(255,255,255,0.1)';
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(32, 10);
        context.lineTo(32, 50);
        context.stroke();

        // Add some subtle shading
        context.fillStyle = 'rgba(0,0,0,0.1)';
        context.beginPath();
        context.ellipse(38, 40, 10, 15, Math.PI/3, 0, Math.PI*2);
        context.fill();

        const petalTexture = new THREE.CanvasTexture(petalCanvas);

        const petalMaterial = new THREE.ShaderMaterial({
          uniforms: {
            map: { value: petalTexture },
            time: { value: 0 },
            audioStrength: { value: 0.0 },
            dreamFactor: { value: settings.dreaminess },
            fluidInfluence: { value: settings.fluidMotion }
          },
          vertexShader: `
            attribute float rotation;
            attribute float scale;
            attribute float offset;
            attribute float speed;

            uniform float time;
            uniform float audioStrength;
            uniform float dreamFactor;
            uniform float fluidInfluence;

            varying vec2 vUv;
            varying float vRotation;
            varying float vOffset;
            varying vec3 vPosition;

            // Simplex noise function
            vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

            float snoise(vec2 v) {
              const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                                 -0.577350269189626, 0.024390243902439);
              vec2 i  = floor(v + dot(v, C.yy));
              vec2 x0 = v -   i + dot(i, C.xx);
              vec2 i1;
              i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
              vec4 x12 = x0.xyxy + C.xxzz;
              x12.xy -= i1;
              i = mod289(i);
              vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                    + i.x + vec3(0.0, i1.x, 1.0));
              vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
                                    dot(x12.zw, x12.zw)), 0.0);
              m = m*m;
              m = m*m;
              vec3 x = 2.0 * fract(p * C.www) - 1.0;
              vec3 h = abs(x) - 0.5;
              vec3 ox = floor(x + 0.5);
              vec3 a0 = x - ox;
              m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
              vec3 g;
              g.x  = a0.x  * x0.x  + h.x  * x0.y;
              g.yz = a0.yz * x12.xz + h.yz * x12.yw;
              return 130.0 * dot(m, g);
            }

            void main() {
              // Falling motion with complex swaying and fluid influences
              vec3 pos = position;
              vPosition = position;
              vOffset = offset;

              // Falling speed based on scale and attribute (larger petals fall faster)
              float fallSpeed = 0.5 * speed;

              // Cyclic animation for continuous stream of petals
              float cycle = 20.0; // Height of cycle in world units
              float cycleTime = cycle / fallSpeed; // Time to complete one cycle
              float normalizedTime = mod(time * 0.5 + offset * cycleTime, cycleTime) / cycleTime;

              // Apply falling motion with cyclic reset
              pos.y = position.y - normalizedTime * cycle;

              // Swaying motion - more organic with multiple sine waves
              float swayAmount = 2.0 + scale * 2.0;
              pos.x += sin(time * 0.5 * speed + offset * 5.0) * swayAmount;
              pos.z += cos(time * 0.3 * speed + offset * 3.0) * swayAmount;

              // Add secondary micro-motion for realism
              pos.x += sin(time * 1.5 + vOffset * 20.0) * 0.2;
              pos.z += cos(time * 1.3 + vOffset * 15.0) * 0.2;

              // Dreamlike fluid motion
              if (dreamFactor > 0.0) {
                float noiseScale = 0.1;
                float noiseSpeed = 0.08;
                float noiseFactor = dreamFactor * fluidInfluence;

                float nx = snoise(vec2(pos.x * noiseScale, time * noiseSpeed)) * noiseFactor;
                float nz = snoise(vec2(pos.z * noiseScale, time * noiseSpeed + 100.0)) * noiseFactor;

                pos.x += nx * 2.0;
                pos.z += nz * 2.0;
              }

              // Audio reactivity - petals dance with the music
              if (audioStrength > 0.05) {
                float danceAmount = audioStrength * 3.0;
                pos.x += sin(time * 2.0 + offset * 10.0) * danceAmount;
                pos.y += cos(time * 1.8 + offset * 8.0) * danceAmount * 0.5;
                pos.z += sin(time * 1.5 + offset * 5.0) * danceAmount;
              }

              // Project position to clip space
              vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
              gl_Position = projectionMatrix * mvPosition;

              // Vary size with audio reactivity
              float finalScale = scale * (1.0 + audioStrength * 0.5);
              gl_PointSize = finalScale * 40.0;

              // Calculate rotation with both initial rotation and time-based animation
              // More natural rotation with occasional changes in direction
              float spinDirection = mod(offset * 10.0, 2.0) < 1.0 ? 1.0 : -1.0;
              float baseRotationSpeed = 0.2 * speed * spinDirection;

              // Add variation to rotation speed based on fallspeed
              float rotationSpeed = baseRotationSpeed * (0.8 + normalizedTime * 0.4);

              // Pass rotation to fragment shader with organic variation
              vRotation = rotation + time * rotationSpeed + sin(time * 0.2 + offset) * 0.3;

              // Pass uv coordinates
              vUv = vec2(0.5, 0.5); // Center of point for fragment shader
            }
          `,
          fragmentShader: `
            uniform sampler2D map;
            uniform float time;
            uniform float dreamFactor;

            varying float vRotation;
            varying float vOffset;
            varying vec3 vPosition;

            void main() {
              // Apply rotation to UV coordinates
              vec2 uv = gl_PointCoord - 0.5;
              float s = sin(vRotation);
              float c = cos(vRotation);
              vec2 rotatedUv = vec2(
                uv.x * c - uv.y * s,
                uv.x * s + uv.y * c
              ) + 0.5;

              // Discard pixels outside the bounds
              if (rotatedUv.x < 0.0 || rotatedUv.x > 1.0 ||
                  rotatedUv.y < 0.0 || rotatedUv.y > 1.0) {
                discard;
              }

              // Sample the texture
              vec4 texColor = texture2D(map, rotatedUv);

              // Add dreamlike color variation
              if (dreamFactor > 0.4) {
                // Shift hue slightly based on position and time
                float hueShift = sin(vPosition.y * 0.05 + time * 0.1) * dreamFactor * 0.3;

                // Create multi-color gradient effect
                vec3 colorShift = vec3(
                  1.0 + sin(hueShift) * 0.2,
                  1.0 + sin(hueShift + 2.1) * 0.2,
                  1.0 + sin(hueShift + 4.2) * 0.2
                );

                texColor.rgb *= colorShift;
              }

              // Add subtle pulsing for organic feel
              float pulse = 1.0 + sin(time * 0.5 + vOffset * 5.0) * 0.1;
              texColor.rgb *= pulse;

              gl_FragColor = texColor;
            }
          `,
          transparent: true,
          depthWrite: false
        });

        const petalParticles = new THREE.Points(petalGeometry, petalMaterial);
        petalParticles.userData = { type: 'particles' };

        scene.add(petalParticles);
        this.objects.push(petalParticles);
      }

    // Create new butterfly particles with wing-flapping animation
    createButterflies(scene, settings) {
        // FIX: Declare particleCount first
        const particleCount = Math.floor(settings.particleCount * 0.2);

        const butterflyGeometry = new THREE.BufferGeometry();

        const positions = new Float32Array(particleCount * 3);
        const scales = new Float32Array(particleCount);
        const offsets = new Float32Array(particleCount);
        const speeds = new Float32Array(particleCount);
        const colors = new Float32Array(particleCount * 3);

        // Get colors from mood settings
        const colorPalette = settings.colors.map(c => new THREE.Color(c));

        for (let i = 0; i < particleCount; i++) {
          // Position butterflies in a wide area
          const radius = 10 + Math.random() * 60;
          const theta = Math.random() * Math.PI * 2;
          const height = 1 + Math.random() * 15; // Varied heights

          positions[i * 3] = radius * Math.cos(theta);
          positions[i * 3 + 1] = height;
          positions[i * 3 + 2] = radius * Math.sin(theta);

          // Random size and animation offset
          scales[i] = 0.5 + Math.random() * 1.5;
          offsets[i] = Math.random() * Math.PI * 2;
          speeds[i] = 0.5 + Math.random() * 1.5; // Random speeds

          // Assign color from palette
          const colorIndex = Math.floor(Math.random() * colorPalette.length);
          const color = colorPalette[colorIndex];
          colors[i * 3] = color.r;
          colors[i * 3 + 1] = color.g;
          colors[i * 3 + 2] = color.b;
        }

        butterflyGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        butterflyGeometry.setAttribute('scale', new THREE.BufferAttribute(scales, 1));
        butterflyGeometry.setAttribute('offset', new THREE.BufferAttribute(offsets, 1));
        butterflyGeometry.setAttribute('speed', new THREE.BufferAttribute(speeds, 1));
        butterflyGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        // Create a butterfly wing texture
        const wingCanvas = document.createElement('canvas');
        wingCanvas.width = 128;
        wingCanvas.height = 128;
        const context = wingCanvas.getContext('2d');

        // Draw wing shape
        context.fillStyle = '#ffffff';
        context.beginPath();

        // Upper wing
        context.moveTo(64, 30);
        context.bezierCurveTo(80, 20, 110, 30, 90, 60);
        context.bezierCurveTo(80, 70, 70, 70, 64, 64);

        // Lower wing
        context.moveTo(64, 64);
        context.bezierCurveTo(70, 70, 85, 90, 75, 110);
        context.bezierCurveTo(60, 100, 60, 80, 64, 64);

        context.fill();

        // Add wing patterns
        context.fillStyle = 'rgba(0,0,0,0.3)';
        context.beginPath();
        context.arc(85, 45, 8, 0, Math.PI * 2);
        context.fill();

        context.beginPath();
        context.arc(75, 90, 5, 0, Math.PI * 2);
        context.fill();

        context.strokeStyle = 'rgba(0,0,0,0.2)';
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(64, 35);
        context.lineTo(90, 45);
        context.stroke();

        context.beginPath();
        context.moveTo(64, 64);
        context.lineTo(80, 90);
        context.stroke();

        const wingTexture = new THREE.CanvasTexture(wingCanvas);

        // Create shader material with wing-flapping animation
        const butterflyMaterial = new THREE.ShaderMaterial({
          uniforms: {
            map: { value: wingTexture },
            time: { value: 0 },
            audioStrength: { value: 0.0 },
            dreamFactor: { value: settings.dreaminess },
            fluidInfluence: { value: settings.fluidMotion }
          },
          vertexShader: `
            attribute float scale;
            attribute float offset;
            attribute float speed;
            attribute vec3 color;

            uniform float time;
            uniform float audioStrength;
            uniform float dreamFactor;
            uniform float fluidInfluence;

            varying vec2 vUv;
            varying vec3 vColor;
            varying float vWingFold;
            varying float vOffset;

            // Simplex noise
            vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

            float snoise(vec2 v) {
              const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                                 -0.577350269189626, 0.024390243902439);
              vec2 i  = floor(v + dot(v, C.yy));
              vec2 x0 = v -   i + dot(i, C.xx);
              vec2 i1;
              i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
              vec4 x12 = x0.xyxy + C.xxzz;
              x12.xy -= i1;
              i = mod289(i);
              vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                    + i.x + vec3(0.0, i1.x, 1.0));
              vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
                                    dot(x12.zw, x12.zw)), 0.0);
              m = m*m;
              m = m*m;
              vec3 x = 2.0 * fract(p * C.www) - 1.0;
              vec3 h = abs(x) - 0.5;
              vec3 ox = floor(x + 0.5);
              vec3 a0 = x - ox;
              m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
              vec3 g;
              g.x  = a0.x  * x0.x  + h.x  * x0.y;
              g.yz = a0.yz * x12.xz + h.yz * x12.yw;
              return 130.0 * dot(m, g);
            }

            void main() {
              // Complex butterfly movement
              vec3 pos = position;
              vOffset = offset;

              // Calculate flight path with multiple influencing factors

              // 1. Base movement - gentle figure-8 pattern
              float flightTime = time * speed * 0.2 + offset * 10.0;
              float figureEightSize = 5.0 * scale;

              pos.x += sin(flightTime) * figureEightSize;
              pos.z += sin(flightTime * 0.5) * cos(flightTime) * figureEightSize;

              // 2. Vertical bobbing with realistic physics
              float verticalRate = speed * 0.5;
              float verticalAmount = 2.0 * scale;

              // Asymmetric bobbing (faster up, slower down)
              float asymmetricBob = sin(flightTime * verticalRate) * 0.5 + 0.5;
              asymmetricBob = pow(asymmetricBob, 0.7); // Adjust power for physics feel

              pos.y += (asymmetricBob * 2.0 - 1.0) * verticalAmount;

              // 3. Add fluid motion influenced by dreaminess and fluid parameters
              if (dreamFactor > 0.0 || fluidInfluence > 0.0) {
                float noiseScale = 0.05;
                float noiseTime = time * 0.1;
                float noiseStrength = dreamFactor * fluidInfluence * 2.0;

                float nx = snoise(vec2(pos.x * noiseScale, noiseTime)) * noiseStrength;
                float ny = snoise(vec2(pos.y * noiseScale, noiseTime + 100.0)) * noiseStrength * 0.5;
                float nz = snoise(vec2(pos.z * noiseScale, noiseTime + 200.0)) * noiseStrength;

                pos.x += nx;
                pos.y += ny;
                pos.z += nz;
              }

              // 4. Audio reactivity - butterflies dance with music
              if (audioStrength > 0.05) {
                float danceAmount = audioStrength * 4.0;

                // More energetic movement when music is louder
                pos.x += sin(time * 3.0 + offset * 15.0) * danceAmount;
                pos.y += cos(time * 2.7 + offset * 10.0) * danceAmount * 0.7;
                pos.z += sin(time * 2.5 + offset * 5.0) * danceAmount * 0.5;
              }

              // Project position to clip space
              vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
              gl_Position = projectionMatrix * mvPosition;

              // Calculate wing flapping
              // Complex flapping pattern - varies with speed and has pauses
              float baseFrequency = 10.0 * speed;
              float pauseFrequency = 0.2 * speed;

              // Create occasional pauses in flapping
              float flapPause = smoothstep(0.8, 1.0, sin(time * pauseFrequency + offset * 5.0));
              float wingFreq = baseFrequency * (0.2 + 0.8 * flapPause);

              // Calculate wing fold amount (0 = fully extended, 1 = folded)
              float rawWingFold = sin(time * wingFreq + offset * 10.0) * 0.5 + 0.5;

              // Add audio reactivity to wing flapping
              if (audioStrength > 0.1) {
                wingFreq *= 1.0 + audioStrength * 2.0;
                rawWingFold *= 1.0 + audioStrength * 0.5;
              }

              // Apply easing for more realistic wing movement
              // Wings move faster at extremes, slower in middle positions
              vWingFold = pow(rawWingFold, 0.7); // Adjust power for different flapping styles

              // Size the particle with scale
              gl_PointSize = scale * 50.0;

              // Pass color to fragment shader
              vColor = color;

              // Default UV for fragment shader
              vUv = vec2(0.5, 0.5);
            }
          `,
          fragmentShader: `
            uniform sampler2D map;
            uniform float time;
            uniform float dreamFactor;

            varying vec2 vUv;
            varying vec3 vColor;
            varying float vWingFold;
            varying float vOffset;

            void main() {
              // Calculate wing points from center
              vec2 uv = gl_PointCoord;

              // Adjust UV based on which wing (left or right)
              float isRightWing = step(0.5, uv.x);

              // Mirror UVs for right wing
              vec2 wingUv = vec2(
                isRightWing ? uv.x * 2.0 - 1.0 : 1.0 - uv.x * 2.0,
                uv.y
              );

              // Apply wing folding animation
              float foldAmount = vWingFold * 0.9; // Max 90% folded

              // X-coordinate is affected by folding (wings fold in horizontally)
              float foldedX = mix(wingUv.x, 0.0, foldAmount);

              // Final wing UVs
              vec2 finalWingUv = vec2(foldedX, wingUv.y);

              // Sample the texture
              vec4 texColor = texture2D(map, finalWingUv);

              // Apply butterfly color
              vec3 butterflyColor = vColor;

              // Add dreamlike color variation
              if (dreamFactor > 0.3) {
                // Subtle iridescence effect
                float iridescence = sin(finalWingUv.y * 5.0 + time * 0.5 + vOffset) * 0.2 * dreamFactor;

                // Apply color shift
                vec3 shiftedColor = butterflyColor * vec3(
                  1.0 + iridescence,
                  1.0 + iridescence * 0.7,
                  1.0 + iridescence * 0.5
                );

                butterflyColor = mix(butterflyColor, shiftedColor, 0.7);
              }

              // Combine texture with color
              vec3 finalColor = texColor.rgb * butterflyColor;

              gl_FragColor = vec4(finalColor, texColor.a);
            }
          `,
          transparent: true,
          depthWrite: false
        });

        const butterflyParticles = new THREE.Points(butterflyGeometry, butterflyMaterial);
        butterflyParticles.userData = { type: 'particles' };

        scene.add(butterflyParticles);
        this.objects.push(butterflyParticles);
      }

    // Create embers/sparks particles with more organic flow
    createEmbers(scene, settings) {
        // FIX: Declare particleCount first
        const particleCount = Math.floor(settings.particleCount * 0.2);

        const emberGeometry = new THREE.BufferGeometry();

        const positions = new Float32Array(particleCount * 3);
        const scales = new Float32Array(particleCount);
        const offsets = new Float32Array(particleCount);
        const speeds = new Float32Array(particleCount);

        for (let i = 0; i < particleCount; i++) {
          // Position embers primarily near the ground
          const radius = 20 + Math.random() * 40;
          const theta = Math.random() * Math.PI * 2;

          positions[i * 3] = radius * Math.cos(theta);
          positions[i * 3 + 1] = Math.random() * 5; // Start near ground
          positions[i * 3 + 2] = radius * Math.sin(theta);

          // Random size, animation offset, and rise speed
          scales[i] = 0.2 + Math.random() * 0.8;
          offsets[i] = Math.random() * Math.PI * 2;
          speeds[i] = 0.5 + Math.random() * 1.5;
        }

        emberGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        emberGeometry.setAttribute('scale', new THREE.BufferAttribute(scales, 1));
        emberGeometry.setAttribute('offset', new THREE.BufferAttribute(offsets, 1));
        emberGeometry.setAttribute('speed', new THREE.BufferAttribute(speeds, 1));

        // Create ember shader material with improved fluid dynamics
        const emberMaterial = new THREE.ShaderMaterial({
          uniforms: {
            color1: { value: new THREE.Color(settings.colors[0]) },
            color2: { value: new THREE.Color(settings.colors[1]) },
            time: { value: 0 },
            audioStrength: { value: 0.0 },
            dreamFactor: { value: settings.dreaminess },
            fluidInfluence: { value: settings.fluidMotion },
            frequencyData: { value: new Float32Array(8) }
          },
          vertexShader: `
            attribute float scale;
            attribute float offset;
            attribute float speed;

            uniform float time;
            uniform float audioStrength;
            uniform float dreamFactor;
            uniform float fluidInfluence;
            uniform float frequencyData[8];

            varying float vIntensity;
            varying float vAge;
            varying vec3 vPosition;

            // Simplex noise function
            vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

            float snoise(vec2 v) {
              const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                                 -0.577350269189626, 0.024390243902439);
              vec2 i  = floor(v + dot(v, C.yy));
              vec2 x0 = v -   i + dot(i, C.xx);
              vec2 i1;
              i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
              vec4 x12 = x0.xyxy + C.xxzz;
              x12.xy -= i1;
              i = mod289(i);
              vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                    + i.x + vec3(0.0, i1.x, 1.0));
              vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
                                    dot(x12.zw, x12.zw)), 0.0);
              m = m*m;
              m = m*m;
              vec3 x = 2.0 * fract(p * C.www) - 1.0;
              vec3 h = abs(x) - 0.5;
              vec3 ox = floor(x + 0.5);
              vec3 a0 = x - ox;
              m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
              vec3 g;
              g.x  = a0.x  * x0.x  + h.x  * x0.y;
              g.yz = a0.yz * x12.xz + h.yz * x12.yw;
              return 130.0 * dot(m, g);
            }

            void main() {
              // Complex ember motion simulation
              vec3 pos = position;
              vPosition = position;

              // Lifecycle based on time and offset
              float lifecycle = 10.0 * speed; // seconds
              float age = mod(time + offset * lifecycle, lifecycle);
              float normalizedAge = age / lifecycle;
              vAge = normalizedAge;

              // Rising with acceleration and organic motion
              float riseHeight = 15.0 * speed;

              // Non-linear height curve for more realistic physics
              // Embers accelerate upward, then slow down
              float heightCurve = normalizedAge < 0.3 ?
                                 normalizedAge * normalizedAge * 3.333 : // Accelerate (quadratic)
                                 normalizedAge - 0.15; // Linear rise after acceleration

              pos.y += heightCurve * riseHeight;

              // Add some randomized swaying with increasing amplitude as they rise
              float swayFactor = normalizedAge * normalizedAge; // Sway more as they rise
              float swayAmount = 1.0 + scale * 2.0;

              pos.x += sin(age * 2.0 + offset * 10.0) * swayAmount * swayFactor;
              pos.z += cos(age * 1.5 + offset * 8.0) * swayAmount * swayFactor;

              // Add micro-turbulence for more organic motion
              pos.x += sin(age * 8.0 + offset * 20.0) * 0.1 * normalizedAge;
              pos.z += cos(age * 7.0 + offset * 30.0) * 0.1 * normalizedAge;

              // Apply fluid simulation influence
              if (fluidInfluence > 0.0) {
                float noiseScale = 0.1;
                float noiseTime = time * 0.1;
                float noiseStrength = fluidInfluence * (0.5 + normalizedAge * 0.5); // More influenced as they rise

                float nx = snoise(vec2(pos.x * noiseScale, noiseTime)) * noiseStrength;
                float nz = snoise(vec2(pos.z * noiseScale, noiseTime + 100.0)) * noiseStrength;

                pos.x += nx;
                pos.z += nz;
              }

              // Audio reactivity - embers dance with music
              if (audioStrength > 0.05) {
                // Use offset to select a frequency band
                int freqIndex = int(mod(offset * 10.0, 8.0));
                float freqValue = frequencyData[freqIndex];

                // More reactive as they age
                float reactivity = audioStrength * 3.0 * normalizedAge;
                pos.x += sin(time * 3.0 + offset * 20.0) * reactivity * freqValue;
                pos.z += cos(time * 2.5 + offset * 15.0) * reactivity * freqValue;

                // Add extra rise on strong beats
                pos.y += freqValue * audioStrength * 2.0;
              }

              // Dream-like distortion
              if (dreamFactor > 0.3) {
                float dreamIntensity = dreamFactor * normalizedAge;
                pos.x += sin(pos.y * 0.2 + time * 0.1) * dreamIntensity;
                pos.z += cos(pos.y * 0.3 + time * 0.15) * dreamIntensity;
              }

              // Project position to clip space
              vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
              gl_Position = projectionMatrix * mvPosition;

              // Size based on lifecycle (grow then shrink)
              float baseSize = scale * 10.0;
              float sizeMultiplier = 1.0;

              // Different size curve for more realistic ember behavior
              if (normalizedAge < 0.3) {
                // Grow quickly at start
                sizeMultiplier = normalizedAge / 0.3;
              } else if (normalizedAge > 0.7) {
                // Shrink at end
                sizeMultiplier = 1.0 - (normalizedAge - 0.7) / 0.3;
              }

              // Add audio-reactive sizing
              if (audioStrength > 0.1) {
                int sizeIndex = int(mod(offset * 15.0, 8.0));
                sizeMultiplier *= 1.0 + frequencyData[sizeIndex] * 2.0 * audioStrength;
              }

              gl_PointSize = baseSize * sizeMultiplier * (1.0 + audioStrength * 2.0);

              // Intensity for the glow effect
              vIntensity = sizeMultiplier * (1.0 + audioStrength);
            }
          `,
          fragmentShader: `
            uniform vec3 color1;
            uniform vec3 color2;
            uniform float dreamFactor;

            varying float vIntensity;
            varying float vAge;
            varying vec3 vPosition;

            void main() {
              // Calculate distance from the center of the point
              vec2 center = gl_PointCoord - vec2(0.5);
              float dist = length(center);

              // Discard pixels outside the radius for round points
              if (dist > 0.5) discard;

              // Radial gradient for the glow
              float alpha = smoothstep(0.5, 0.0, dist) * vIntensity;

              // Color transition based on age - change from bright to dim as they rise
              vec3 baseColor = mix(color1, color2, vAge);

              // Add subtle color variation for dream-like effect
              if (dreamFactor > 0.3) {
                float hueShift = sin(vPosition.y * 0.1) * dreamFactor * 0.3;

                // Simple hue shift approximation
                float r = baseColor.r + hueShift;
                float g = baseColor.g + hueShift * 0.5;
                float b = baseColor.b - hueShift;

                baseColor = vec3(r, g, b);
              }

              // Heat distortion effect at center
              float innerGlow = smoothstep(0.2, 0.0, dist) * 1.5;
              baseColor += vec3(0.3, 0.1, 0.0) * innerGlow * vIntensity;

              // Apply glow intensity
              gl_FragColor = vec4(baseColor, alpha);
            }
          `,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });

        const emberParticles = new THREE.Points(emberGeometry, emberMaterial);
        emberParticles.userData = { type: 'particles' };

        scene.add(emberParticles);
        this.objects.push(emberParticles);
      }

    // Create cosmic stardust particles with more fluid, dreamlike motion
    createStardust(scene, settings) {
        // FIX: Declare particleCount first
        const particleCount = Math.floor(settings.particleCount * 0.5);

        const stardustGeometry = new THREE.BufferGeometry();

        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        const scales = new Float32Array(particleCount);
        const offsets = new Float32Array(particleCount);
        const speeds = new Float32Array(particleCount);

        // Color palette from settings
        const palette = settings.colors.map(c => new THREE.Color(c));

        for (let i = 0; i < particleCount; i++) {
          // Position stardust in 3D space with more interesting distribution
          const radius = 10 + Math.pow(Math.random(), 0.5) * 70; // More particles closer to center
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.random() * Math.PI - Math.PI / 2; // -90 to +90 degrees

          positions[i * 3] = radius * Math.cos(phi) * Math.cos(theta);
          positions[i * 3 + 1] = 5 + radius * Math.sin(phi); // Keep most particles above ground
          positions[i * 3 + 2] = radius * Math.cos(phi) * Math.sin(theta);

          // Assign color from palette with slight variation
          const color = palette[Math.floor(Math.random() * palette.length)].clone();

          // Add slight color variation
          color.r += (Math.random() * 0.1 - 0.05);
          color.g += (Math.random() * 0.1 - 0.05);
          color.b += (Math.random() * 0.1 - 0.05);

          colors[i * 3] = color.r;
          colors[i * 3 + 1] = color.g;
          colors[i * 3 + 2] = color.b;

          // Random size and animation parameters
          scales[i] = 0.3 + Math.random() * 1.7;
          offsets[i] = Math.random() * Math.PI * 2;
          speeds[i] = 0.2 + Math.random() * 0.8; // Varied speeds
        }

        stardustGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        stardustGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        stardustGeometry.setAttribute('scale', new THREE.BufferAttribute(scales, 1));
        stardustGeometry.setAttribute('offset', new THREE.BufferAttribute(offsets, 1));
        stardustGeometry.setAttribute('speed', new THREE.BufferAttribute(speeds, 1));

        // Create enhanced stardust shader with dreamlike fluid motion
        const stardustMaterial = new THREE.ShaderMaterial({
          uniforms: {
            time: { value: 0 },
            audioStrength: { value: 0.0 },
            dreamFactor: { value: settings.dreaminess },
            fluidInfluence: { value: settings.fluidMotion },
            frequencyData: { value: new Float32Array(8) }
          },
          vertexShader: `
            attribute vec3 color;
            attribute float scale;
            attribute float offset;
            attribute float speed;

            uniform float time;
            uniform float audioStrength;
            uniform float dreamFactor;
            uniform float fluidInfluence;
            uniform float frequencyData[8];

            varying vec3 vColor;
            varying float vIntensity;
            varying vec3 vPosition;

            // Simplex noise function
            vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
            vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

            float snoise(vec3 v) {
              const vec2 C = vec2(1.0/6.0, 1.0/3.0);
              const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

              // First corner
              vec3 i  = floor(v + dot(v, C.yyy));
              vec3 x0 = v - i + dot(i, C.xxx);

              // Other corners
              vec3 g = step(x0.yzx, x0.xyz);
              vec3 l = 1.0 - g;
              vec3 i1 = min(g.xyz, l.zxy);
              vec3 i2 = max(g.xyz, l.zxy);

              vec3 x1 = x0 - i1 + C.xxx;
              vec3 x2 = x0 - i2 + C.yyy;
              vec3 x3 = x0 - D.yyy;

              // Permutations
              i = mod289(i);
              vec4 p = permute(permute(permute(
                      i.z + vec4(0.0, i1.z, i2.z, 1.0))
                    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                    + i.x + vec4(0.0, i1.x, i2.x, 1.0));

              // Gradients
              float n_ = 0.142857142857;
              vec3 ns = n_ * D.wyz - D.xzx;

              vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

              vec4 x_ = floor(j * ns.z);
              vec4 y_ = floor(j - 7.0 * x_);

              vec4 x = x_ *ns.x + ns.yyyy;
              vec4 y = y_ *ns.x + ns.yyyy;
              vec4 h = 1.0 - abs(x) - abs(y);

              vec4 b0 = vec4(x.xy, y.xy);
              vec4 b1 = vec4(x.zw, y.zw);

              vec4 s0 = floor(b0)*2.0 + 1.0;
              vec4 s1 = floor(b1)*2.0 + 1.0;
              vec4 sh = -step(h, vec4(0.0));

              vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
              vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;

              vec3 p0 = vec3(a0.xy, h.x);
              vec3 p1 = vec3(a0.zw, h.y);
              vec3 p2 = vec3(a1.xy, h.z);
              vec3 p3 = vec3(a1.zw, h.w);

              // Normalise gradients
              vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
              p0 *= norm.x;
              p1 *= norm.y;
              p2 *= norm.z;
              p3 *= norm.w;

              // Mix final noise value
              vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
              m = m * m;
              return 42.0 * dot(m*m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
            }

            void main() {
              // Complex fluid, dreamlike motion in 3D space
              vec3 pos = position;
              vPosition = position;

              // Base movement - flowing orbit-like motion
              float timeScale = time * 0.1 * speed;
              float radiusX = length(pos.yz);
              float radiusY = length(pos.xz);
              float radiusZ = length(pos.xy);

              // Create complex orbital paths with multiple rotation axes
              float angleX = atan(pos.z, pos.y) + timeScale * 0.2 + offset;
              float angleY = atan(pos.z, pos.x) + timeScale * 0.3 + offset * 2.0;
              float angleZ = atan(pos.y, pos.x) + timeScale * 0.1 - offset;

              // Calculate new positions with smooth blending
              vec3 newPos = pos;

              // Apply fluid motion influence
              float fluidFactor = fluidInfluence * 0.3;

              newPos.y = mix(pos.y, radiusX * cos(angleX), fluidFactor);
              newPos.z = mix(pos.z, radiusX * sin(angleX), fluidFactor);

              newPos.x = mix(newPos.x, radiusY * cos(angleY), fluidFactor * 0.8);
              newPos.z = mix(newPos.z, radiusY * sin(angleY), fluidFactor * 0.8);

              newPos.x = mix(newPos.x, radiusZ * cos(angleZ), fluidFactor * 0.5);
              newPos.y = mix(newPos.y, radiusZ * sin(angleZ), fluidFactor * 0.5);

              // Add dreamlike fluid distortion with 3D noise
              if (dreamFactor > 0.2) {
                float noiseTime = time * 0.05;
                float noiseScale = 0.02;
                float noiseStrength = dreamFactor * 5.0;

                // Use 3D simplex noise for more complex motion
                float nx = snoise(vec3(newPos.x * noiseScale, newPos.y * noiseScale, noiseTime)) * noiseStrength;
                float ny = snoise(vec3(newPos.y * noiseScale, newPos.z * noiseScale, noiseTime + 100.0)) * noiseStrength;
                float nz = snoise(vec3(newPos.z * noiseScale, newPos.x * noiseScale, noiseTime + 200.0)) * noiseStrength;

                newPos.x += nx;
                newPos.y += ny;
                newPos.z += nz;
              }

              // Audio reactivity - particles respond to music
              if (audioStrength > 0.05) {
                // Use offset to select frequency band
                int freqIndex = int(mod(offset * 10.0, 8.0));
                float freqValue = frequencyData[freqIndex];

                // Calculate motion based on audio and particle properties
                float audioMotion = audioStrength * 8.0 * freqValue;

                // Create expanding/contracting motion on beats
                vec3 toCenter = normalize(-newPos);
                newPos += toCenter * audioMotion * scale;

                // Add some swirling motion
                float swirl = audioStrength * 2.0;
                float swirlX = cos(time * 2.0 + offset * 10.0) * swirl;
                float swirlY = sin(time * 2.0 + offset * 10.0) * swirl;
                float swirlZ = cos(time * 2.0 + offset * 5.0) * swirl;

                newPos.x += swirlX;
                newPos.y += swirlY;
                newPos.z += swirlZ;
              }

              // Project position to clip space
              vec4 mvPosition = modelViewMatrix * vec4(newPos, 1.0);
              gl_Position = projectionMatrix * mvPosition;

              // Size with distance attenuation and audio reactivity
              float computedScale = scale * (1.0 + audioStrength * 3.0);
              gl_PointSize = computedScale * 8.0 / -mvPosition.z;

              // Pass color to fragment shader
              vColor = color;

              // Calculate intensity for pulsating effect based on multiple factors
              float basicPulse = 0.5 + 0.5 * sin(time + offset * 10.0);

              // More complex pulsing with audio reactivity
              float audioIntensity = 0.0;
              if (audioStrength > 0.1) {
                int pulseIndex = int(mod(offset * 5.0, 8.0));
                audioIntensity = frequencyData[pulseIndex] * audioStrength * 2.0;
              }

              // Dreamy pulsing effect
              float dreamPulse = 0.0;
              if (dreamFactor > 0.3) {
                float pulseFactor = dreamFactor * 0.5;
                dreamPulse = sin(time * 0.2 + offset * 5.0) * pulseFactor;
              }

              vIntensity = 0.5 + 0.5 * basicPulse + audioIntensity + dreamPulse;
            }
          `,
          fragmentShader: `
            varying vec3 vColor;
            varying float vIntensity;
            varying vec3 vPosition;

            uniform float time;
            uniform float dreamFactor;

            // Hash function for noise
            float hash(vec3 p) {
              p = fract(p * vec3(443.8975, 397.2973, 491.1871));
              p += dot(p.yzx, p.zxy + 19.19);
              return fract(p.x * p.y * p.z);
            }

            void main() {
              // Calculate distance from the center of the point
              vec2 center = gl_PointCoord - vec2(0.5);
              float dist = length(center);

              // Discard pixels outside the radius for round points
              if (dist > 0.5) discard;

              // Radial gradient for the glow
              float alpha = smoothstep(0.5, 0.0, dist) * vIntensity;

              // Base stardust color
              vec3 finalColor = vColor * vIntensity;

              // Add dreamlike twinkling effect
              if (dreamFactor > 0.3) {
                // Noise-based color modulation
                float noise = hash(vPosition + vec3(time * 0.1, 0.0, 0.0));

                // Time-based color shifting for dreamy effect
                vec3 shiftColor = vec3(
                  sin(time * 0.2 + vPosition.x * 0.1),
                  sin(time * 0.3 + vPosition.y * 0.1),
                  sin(time * 0.4 + vPosition.z * 0.1)
                ) * 0.3 * dreamFactor;

                // Apply subtle rainbow-like effect
                finalColor += shiftColor * noise;
              }

              // Core glow effect
              float coreGlow = smoothstep(0.2, 0.0, dist) * 0.5;
              finalColor += vColor * coreGlow;

              gl_FragColor = vec4(finalColor, alpha);
            }
          `,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });

        const stardustParticles = new THREE.Points(stardustGeometry, stardustMaterial);
        stardustParticles.userData = { type: 'particles' };

        scene.add(stardustParticles);
        this.objects.push(stardustParticles);
      }

    // Create volumetric clouds using instanced meshes and shaders
    createClouds(scene, settings) {
      // Skip clouds for some moods or if low complexity
      if (settings.complexity < 0.3 || Math.random() > 0.8) return;

      const cloudCount = Math.floor(10 + settings.complexity * 20);

      // Create a base cloud puff geometry
      const cloudPuffGeometry = new THREE.SphereGeometry(1, 8, 8);

      // Distort the geometry for more natural cloud shape
      const positionAttribute = cloudPuffGeometry.getAttribute('position');
      const vertex = new THREE.Vector3();

      for (let v = 0; v < positionAttribute.count; v++) {
        vertex.fromBufferAttribute(positionAttribute, v);

        // Apply noise-based displacement
        const noise = Math.sin(vertex.x * 2) * Math.sin(vertex.y * 3) * Math.sin(vertex.z * 2);
        vertex.multiplyScalar(1 + noise * 0.3);

        positionAttribute.setXYZ(v, vertex.x, vertex.y, vertex.z);
      }

      // Create advanced cloud material with volumetric effect
      const cloudMaterial = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 },
          fogColor: { value: new THREE.Color(settings.fogColor) },
          baseColor: { value: new THREE.Color(0xffffff) }
        },
        vertexShader: `
          uniform float time;

          varying vec3 vPosition;
          varying vec3 vNormal;

          void main() {
            vPosition = position;
            vNormal = normalize(normalMatrix * normal);

            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vec4 mvPosition = viewMatrix * worldPosition;
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: `
          uniform float time;
          uniform vec3 fogColor;
          uniform vec3 baseColor;

          varying vec3 vPosition;
          varying vec3 vNormal;

          void main() {
            // Calculate soft particle effect
            vec3 viewDir = normalize(cameraPosition - vPosition);
            float fresnel = pow(1.0 - max(0.0, dot(vNormal, viewDir)), 2.0);

            // Mix cloud colors: base is white, edges are fog color
            vec3 cloudColor = mix(baseColor, fogColor, fresnel * 0.6);

            // Make cloud more transparent at edges for volumetric look
            float alpha = 0.7 * (1.0 - fresnel * 0.8);

            gl_FragColor = vec4(cloudColor, alpha);
          }
        `,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending
      });

      // Create individual cloud clusters
      for (let i = 0; i < cloudCount; i++) {
        const cloudGroup = new THREE.Group();

        // Random cloud properties
        const cloudSize = 2 + Math.random() * 5;
        const puffCount = Math.floor(3 + Math.random() * 8);
        const baseOpacity = 0.3 + Math.random() * 0.3;

        // Create cloud using multiple puffs
        for (let j = 0; j < puffCount; j++) {
          const puff = new THREE.Mesh(cloudPuffGeometry, cloudMaterial.clone());

          // Position puffs to form a cloud shape
          const angle = (j / puffCount) * Math.PI * 2;
          const radius = Math.random() * cloudSize * 0.3;

          puff.position.set(
            Math.cos(angle) * radius,
            Math.random() * cloudSize * 0.2,
            Math.sin(angle) * radius
          );

          // Scale puffs randomly
          const puffSize = (0.5 + Math.random() * 0.8) * cloudSize;
          puff.scale.set(puffSize, puffSize * 0.7, puffSize);

          // Adjust opacity
          puff.material.opacity = baseOpacity * (0.7 + Math.random() * 0.3);

          // Rotate puffs randomly
          puff.rotation.set(
            Math.random() * Math.PI,
            Math.random() * Math.PI,
            Math.random() * Math.PI
          );

          cloudGroup.add(puff);

          // Create cloud animator
          const cloudAnimator = {
            update: (time, audioReactivity) => {
              if (puff.material.uniforms) { // Check if uniforms exist before accessing
                puff.material.uniforms.time.value = time;
              }
            },
            dispose: () => {
              // Cleanup if needed
            }
          };

          this.animators.push(cloudAnimator);
        }

        // Position cloud in scene
        cloudGroup.position.set(
          (Math.random() - 0.5) * 80,
          10 + Math.random() * 15,
          (Math.random() - 0.5) * 80
        );

        // Set cloud data for animation
        cloudGroup.userData = {
          type: 'cloud',
          offset: Math.random() * 100,
          baseOpacity: baseOpacity
        };

        scene.add(cloudGroup);
        this.objects.push(cloudGroup);
      }
    }

    // Create advanced dreamlike visual effects
    createDreamlikeEffects(scene, settings) {
      // Only add these effects if dreaminess is high enough
      if (settings.dreaminess < 0.5) return;

      // Create floating light orbs
      const orbCount = Math.floor(settings.dreaminess * 10);

      for (let i = 0; i < orbCount; i++) {
        const orbGeometry = new THREE.SphereGeometry(0.3 + Math.random() * 0.5, 16, 16);

        // Get a color from our settings
        const orbColor = new THREE.Color(
          settings.colors[Math.floor(Math.random() * settings.colors.length)]
        );

        // Create advanced shader for dream orbs
        const orbMaterial = new THREE.ShaderMaterial({
          uniforms: {
            time: { value: 0 },
            dreaminess: { value: settings.dreaminess },
            color: { value: orbColor },
            pulseTime: { value: 0 },
            pulseStrength: { value: 0 },
            audioStrength: { value: 0 }
          },
          vertexShader: `
            uniform float time;
            uniform float dreaminess;
            uniform float pulseTime;
            uniform float pulseStrength;

            varying vec3 vNormal;
            varying vec3 vPosition;

            void main() {
              vNormal = normalize(normalMatrix * normal);

              // Get worldspace position for animation
              vec3 transformed = position;

              // Calculate pulse effect (when audio beats)
              float timeSincePulse = time - pulseTime;
              float pulseEffect = 0.0;

              if (timeSincePulse < 0.5) {
                pulseEffect = pulseStrength * exp(-timeSincePulse * 10.0);
              }

              // Apply morphing and pulse
              transformed += normal * (
                sin(position.x * 3.0 + time) *
                cos(position.z * 3.0 + time * 0.7) *
                dreaminess * 0.1 +
                pulseEffect
              );

              // Calculate worldspace position for varyings
              vPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;

              gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
            }
          `,
          fragmentShader: `
            uniform float time;
            uniform float dreaminess;
            uniform vec3 color;
            uniform float audioStrength;

            varying vec3 vNormal;
            varying vec3 vPosition;

            void main() {
              // Get view direction
              vec3 viewDir = normalize(cameraPosition - vPosition);

              // Create fresnel effect (edge glow)
              float fresnel = pow(1.0 - dot(vNormal, viewDir), 3.0);

              // Create soft center highlight
              float centerHighlight = 1.0 - fresnel;

              // Mix base color with fresnel-modulated color
              vec3 freselColor = color * 1.5; // Brighter edges
              vec3 finalColor = mix(color, freselColor, fresnel);

              // Add time-based color shifts
              float hueShift = sin(time * 0.2) * 0.1 * dreaminess;
              float s = sin(hueShift);
              float c = cos(hueShift);

              mat3 hueShiftMatrix = mat3(
                vec3(0.299 + 0.701 * c + 0.168 * s,
                     0.587 - 0.587 * c + 0.330 * s,
                     0.114 - 0.114 * c - 0.497 * s),
                vec3(0.299 - 0.299 * c - 0.328 * s,
                     0.587 + 0.413 * c + 0.035 * s,
                     0.114 - 0.114 * c + 0.292 * s),
                vec3(0.299 - 0.299 * c + 1.250 * s,
                     0.587 - 0.587 * c - 1.050 * s,
                     0.114 + 0.886 * c - 0.203 * s)
              );

              finalColor = hueShiftMatrix * finalColor;

              // Add center white/bright spot
              finalColor = mix(finalColor, vec3(1.0), centerHighlight * 0.3);

              // Add audio-responsive pulsing
              finalColor *= 1.0 + audioStrength * 0.5;

              // Calculate opacity - more transparent at edges
              float opacity = mix(0.8, 0.2, fresnel);

              gl_FragColor = vec4(finalColor, opacity);
            }
          `,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });

        const orb = new THREE.Mesh(orbGeometry, orbMaterial);

        // Position orb in scene
        orb.position.set(
          (Math.random() - 0.5) * 40,
          Math.random() * 10,
          (Math.random() - 0.5) * 40
        );

        orb.userData = {
          type: 'dreamEffect',
          movePattern: Math.floor(Math.random() * 3),
          offset: Math.random() * 100
        };

        scene.add(orb);
        this.objects.push(orb);
      }

      // Create dreamy light rays or beams
      if (settings.dreaminess > 0.7) {
        const rayCount = Math.floor(settings.dreaminess * 5);

        for (let i = 0; i < rayCount; i++) {
          // Create beam geometry
          const rayGeometry = new THREE.CylinderGeometry(0.1, 0.5, 15, 8, 1, true);

          // Get a color from our settings
          const rayColor = new THREE.Color(
            settings.colors[Math.floor(Math.random() * settings.colors.length)]
          );

          // Create advanced shader for light rays
          const rayMaterial = new THREE.ShaderMaterial({
            uniforms: {
              time: { value: 0 },
              dreaminess: { value: settings.dreaminess },
              color: { value: rayColor },
              audioStrength: { value: 0 }
            },
            vertexShader: `
              uniform float time;

              varying vec2 vUv;
              varying vec3 vPosition;

              void main() {
                vUv = uv;
                vPosition = position;

                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              }
            `,
            fragmentShader: `
              uniform float time;
              uniform float dreaminess;
              uniform vec3 color;
              uniform float audioStrength;

              varying vec2 vUv;
              varying vec3 vPosition;

              void main() {
                // Create beam effect - more transparent at edges and with height
                float edgeFactor = pow(1.0 - abs(vUv.x - 0.5) * 2.0, 2.0);

                // Add vertical gradient
                float heightFactor = 1.0 - vUv.y;

                // Add time-based animation to make it shimmer
                float shimmer = sin(vUv.y * 20.0 + time * 3.0) * 0.1 + 0.9;

                // Apply audio reactivity
                shimmer *= 1.0 + audioStrength * 0.5;

                // Calculate alpha
                float alpha = edgeFactor * heightFactor * shimmer * 0.7;

                // Apply time-based color variations
                vec3 finalColor = color;
                finalColor *= 1.0 + sin(time * 0.5 + vUv.y * 10.0) * 0.2 * dreaminess;

                gl_FragColor = vec4(finalColor, alpha);
              }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
          });

          const ray = new THREE.Mesh(rayGeometry, rayMaterial);

          // Position and rotate ray
          ray.position.set(
            (Math.random() - 0.5) * 40,
            0, // Base at ground level
            (Math.random() - 0.5) * 40
          );

          // Random rotation, but keep vertical
          ray.rotation.y = Math.random() * Math.PI * 2;
          ray.rotation.x = (Math.random() - 0.5) * 0.2; // Slight tilt

          ray.userData = {
            type: 'dreamEffect',
            offset: Math.random() * 100
          };

          scene.add(ray);
          this.objects.push(ray);
        }
      }

      // Create ethereal dream portals
      if (settings.dreaminess > 0.8) {
        const portalCount = Math.floor(settings.dreaminess * 3);

        for (let i = 0; i < portalCount; i++) {
          // Create portal
          const portalGeometry = new THREE.TorusGeometry(2, 0.5, 16, 32);

          // Get portal colors
          const portalColor1 = new THREE.Color(
            settings.colors[Math.floor(Math.random() * settings.colors.length)]
          );

          const portalColor2 = new THREE.Color(
            settings.colors[Math.floor(Math.random() * settings.colors.length)]
          );

          // Create dream portal shader
          const portalMaterial = new THREE.ShaderMaterial({
            uniforms: {
              time: { value: 0 },
              dreaminess: { value: settings.dreaminess },
              color1: { value: portalColor1 },
              color2: { value: portalColor2 },
              audioStrength: { value: 0 },
              pulseTime: { value: 0 },
              pulseStrength: { value: 0 }
            },
            vertexShader: `
              uniform float time;
              uniform float dreaminess;
              uniform float pulseTime;
              uniform float pulseStrength;

              varying vec2 vUv;
              varying vec3 vPosition;
              varying vec3 vNormal;

              void main() {
                vUv = uv;
                vNormal = normalize(normalMatrix * normal);

                // Calculate pulse effect
                float timeSincePulse = time - pulseTime;
                float pulseEffect = 0.0;

                if (timeSincePulse < 1.0) {
                  pulseEffect = pulseStrength * exp(-timeSincePulse * 5.0);
                }

                // Apply dream-like morphing
                vec3 transformed = position;
                transformed += normal * (
                  sin(position.x * 5.0 + time * 2.0) *
                  cos(position.y * 5.0 + time * 1.5) *
                  dreaminess * 0.1 +
                  pulseEffect
                );

                vPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;

                gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
              }
            `,
            fragmentShader: `
              uniform float time;
              uniform float dreaminess;
              uniform vec3 color1;
              uniform vec3 color2;
              uniform float audioStrength;

              varying vec2 vUv;
              varying vec3 vPosition;
              varying vec3 vNormal;

              // Procedural noise helper
              float hash(vec3 p) {
                p = fract(p * vec3(443.8975, 397.2973, 491.1871));
                p += dot(p.yzx, p.zxy + 19.19);
                return fract(p.x * p.y * p.z);
              }

              void main() {
                // Create a moving pattern within the portal
                float angle = atan(vPosition.z, vPosition.x);
                float dist = length(vPosition.xz);

                // Animated swirl pattern
                float pattern = sin(dist * 5.0 - time * 2.0 + angle * 3.0);

                // Mix colors based on pattern with time-based shifting
                float colorMix = 0.5 + 0.5 * pattern;
                colorMix = mix(colorMix, fract(colorMix + time * 0.1), dreaminess * 0.5);

                vec3 portalColor = mix(color1, color2, colorMix);

                // Add noise detail
                float noise = hash(vPosition + vec3(time * 0.1));
                portalColor += vec3(noise) * 0.1 * dreaminess;

                // Add audio reactivity
                portalColor *= 1.0 + audioStrength * 0.5;

                // Edge glow
                vec3 viewDir = normalize(cameraPosition - vPosition);
                float fresnel = pow(1.0 - dot(vNormal, viewDir), 2.0);

                // Add outer glow
                portalColor += fresnel * color1 * 2.0;

                // Adjust opacity - more solid when audio is higher
                float opacity = 0.7 + audioStrength * 0.3;

                gl_FragColor = vec4(portalColor, opacity);
              }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
          });

          const portal = new THREE.Mesh(portalGeometry, portalMaterial);

          // Position portal
          portal.position.set(
            (Math.random() - 0.5) * 40,
            2 + Math.random() * 8,
            (Math.random() - 0.5) * 40
          );

          // Random rotation
          portal.rotation.set(
            Math.PI / 2 + (Math.random() - 0.5) * 0.5, // Mostly horizontal
            Math.random() * Math.PI * 2,
            (Math.random() - 0.5) * 0.5
          );

          portal.userData = {
            type: 'dreamEffect',
            offset: Math.random() * 100
          };

          scene.add(portal);
          this.objects.push(portal);
        }
      }
    }

    // Cleanup resources on destruction
    dispose() {
        // Cancel animation frame
        if (this.frameId) {
          cancelAnimationFrame(this.frameId);
          this.frameId = null; // Clear the ID
        }

        // Dispose controls
        if (this.controls) {
          this.controls.dispose();
          this.controls = null; // Clear the reference
        }

        // Dispose animators
        this.animators.forEach(animator => {
          if (animator.dispose) animator.dispose();
        });
        this.animators = []; // Clear the array

        // Clean up Three.js resources
        if (this.scene) {
          this.scene.traverse(object => {
            if (object.isMesh || object.isPoints) { // Include Points geometry
              if (object.geometry) object.geometry.dispose();
              if (object.material) {
                if (Array.isArray(object.material)) {
                  object.material.forEach(m => this.cleanupMaterial(m));
                } else {
                  this.cleanupMaterial(object.material);
                }
              }
            }
            // Remove children explicitly? Usually handled by scene disposal, but can be added if needed.
          });
          // Clear the scene reference after traversal/disposal
          this.scene = null;
        }

        this.composer = null; // Clear the reference

      if (this.renderer) {
        this.renderer.dispose();
        this.renderer.domElement = null; // Break reference to canvas
        this.renderer = null; // Clear the reference
      }


      // Remove resize listener
      window.removeEventListener('resize', this.handleResize);

      // Clear object references
      this.objects = [];
      console.log("VisualCanvas disposed."); // Add log for confirmation
    }

}