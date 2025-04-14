// VideoExporter.js - Handles video recording and export functionality

class VideoExporter {
    constructor(canvas, audioContext, analyser) {
      this.canvas = canvas;
      this.audioContext = audioContext;
      this.analyser = analyser;
      this.mediaRecorder = null;
      this.chunks = [];
      this.stream = null;
      this.recordedTracks = [];
    }
    
    // Start recording
    async startRecording(quality = 'high') {
      try {
        // Ensure we can access the canvas
        if (!this.canvas) {
          throw new Error('Canvas is not available');
        }
        
        // Create canvas stream with higher framerate for smoother video
        this.stream = this.canvas.captureStream(60); // 60 FPS for smoother visuals
        
        // Get audio stream
        if (this.audioContext && this.analyser) {
          const audioDestination = this.audioContext.createMediaStreamDestination();
          this.analyser.connect(audioDestination);
          
          // Add audio tracks to the stream
          const audioTracks = audioDestination.stream.getAudioTracks();
          
          // Store original tracks for proper cleanup
          this.recordedTracks = [
            ...this.stream.getVideoTracks(),
            ...audioTracks
          ];
          
          // Add audio tracks to video stream
          audioTracks.forEach(track => this.stream.addTrack(track));
        } else {
          console.warn('Audio context or analyser not available. Video will be recorded without audio.');
          this.recordedTracks = [...this.stream.getVideoTracks()];
        }
        
        // Set media recorder options based on quality
        const options = this.getRecorderOptions(quality);
        
        // Create media recorder
        this.mediaRecorder = new MediaRecorder(this.stream, options);
        this.chunks = [];
        
        // Listen for data available events
        this.mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            this.chunks.push(e.data);
          }
        };
        
        // Start recording
        this.mediaRecorder.start(1000); // Collect data in 1-second chunks for better sync
        
        return this.mediaRecorder;
      } catch (error) {
        console.error('Error starting recording:', error);
        throw error;
      }
    }
    
    // Stop recording and get the recorded blob
    stopRecording() {
      return new Promise((resolve, reject) => {
        if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
          reject(new Error('No active recording'));
          return;
        }
        
        this.mediaRecorder.onstop = () => {
          try {
            // Create a single blob from all chunks
            const mimeType = this.mediaRecorder.mimeType;
            const blob = new Blob(this.chunks, { type: mimeType });
            
            // Clean up resources
            this.chunks = [];
            
            // Properly stop all tracks
            this.recordedTracks.forEach(track => {
              if (track.readyState === 'live') {
                track.stop();
              }
            });
            
            this.recordedTracks = [];
            this.stream = null;
            this.mediaRecorder = null;
            
            resolve(blob);
          } catch (error) {
            reject(error);
          }
        };
        
        this.mediaRecorder.stop();
      });
    }
    
    // Get a downloadable URL from the blob
    createDownloadLink(blob, filename) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      
      return link;
    }
    
    // Get recorder options based on quality
    getRecorderOptions(quality) {
      // Default options with higher bitrates for better quality
      let options = {
        mimeType: 'video/webm',
        videoBitsPerSecond: 5000000 // 5 Mbps default
      };
      
      // Adjust based on quality
      switch (quality) {
        case 'low':
          options.videoBitsPerSecond = 2500000; // 2.5 Mbps
          break;
        case 'medium':
          options.videoBitsPerSecond = 5000000; // 5 Mbps
          break;
        case 'high':
          options.videoBitsPerSecond = 8000000; // 8 Mbps
          break;
        case 'ultra':
          options.videoBitsPerSecond = 15000000; // 15 Mbps
          break;
        default:
          break;
      }
      
      // Try different codecs in order of preference
      const mimeTypes = [
        'video/webm;codecs=vp9,opus', // Best quality option
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=h264,opus',
        'video/webm',
        'video/mp4'
      ];
      
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          options.mimeType = mimeType;
          break;
        }
      }
      
      return options;
    }
    
    // Convert to different format if needed
    async convertToFormat(blob, format, progressCallback) {
      try {
        // Update progress to indicate start
        progressCallback(10);
        
        // For MP4 conversion attempt
        if (format === 'mp4' && blob.type.includes('webm')) {
          // Check if the browser supports the MediaRecorder with MP4 format
          if (MediaRecorder.isTypeSupported('video/mp4')) {
            // In a real-world implementation, we'd use a WebAssembly-based converter here
            // Since we can't easily convert in browser, we'll notify the user
            progressCallback(100);
            ToastSystem.notify('info', 'MP4 output will be provided as WebM due to browser limitations. For MP4, download and convert the file locally.');
            return blob;
          } else {
            progressCallback(100);
            ToastSystem.notify('warning', 'MP4 conversion requires external tools. Providing WebM format instead.');
            return blob;
          }
        } 
        // For GIF conversion (simplified)
        else if (format === 'gif') {
          progressCallback(100);
          ToastSystem.notify('warning', 'GIF conversion would require additional processing. Using WebM format instead.');
          return blob;
        }
        
        // If no conversion needed or possible
        progressCallback(100);
        return blob;
      } catch (error) {
        console.error('Conversion error:', error);
        progressCallback(100);
        ToastSystem.notify('error', 'Format conversion failed. Using original format.');
        return blob;
      }
    }
  }

  window.VideoExporter = VideoExporter;