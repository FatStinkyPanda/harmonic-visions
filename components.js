// components.js - React component definitions

// Toast Component
const Toast = ({ type, message, removing, onClose }) => {
    const icons = {
      success: '✓',
      warning: '⚠',
      error: '✕',
      info: 'ℹ'
    };
    
    return (
      <div className={`toast toast-${type} ${removing ? 'removing' : ''}`}>
        <div className="toast-icon">{icons[type]}</div>
        <div className="toast-message">{message}</div>
      </div>
    );
  };
  
  // ToastContainer Component
  const ToastContainer = () => {
    const [toasts, setToasts] = React.useState([]);
    
    React.useEffect(() => {
      const unsubscribe = ToastSystem.subscribe(setToasts);
      return unsubscribe;
    }, []);
    
    return (
      <div className="toast-container">
        {toasts.map(toast => (
          <Toast
            key={toast.id}
            type={toast.type}
            message={toast.message}
            removing={toast.removing}
            onClose={() => ToastSystem.removeToast(toast.id)}
          />
        ))}
      </div>
    );
  };
  
  // Onboarding Component with timer functionality
  const Onboarding = ({ moodDescriptions, onEnter }) => {
    const [timerValue, setTimerValue] = React.useState(30); // 30 seconds default
    const [timerRunning, setTimerRunning] = React.useState(true);
    const [currentTime, setCurrentTime] = React.useState(30);
    const timerIntervalRef = React.useRef(null);
  
    // Setup timer
    React.useEffect(() => {
      if (timerRunning && currentTime > 0) {
        timerIntervalRef.current = setInterval(() => {
          setCurrentTime(prev => prev - 1);
        }, 1000);
      } else if (currentTime === 0) {
        // Automatically continue when timer reaches 0
        onEnter();
      }
      
      return () => {
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
        }
      };
    }, [timerRunning, currentTime, onEnter]);
    
    // Handle timer value change
    const handleTimerChange = (e) => {
      const value = parseInt(e.target.value, 10);
      setTimerValue(value);
      setCurrentTime(value);
    };
    
    // Toggle timer
    const toggleTimer = () => {
      setTimerRunning(!timerRunning);
    };
    
    // Reset timer
    const resetTimer = () => {
      setCurrentTime(timerValue);
      if (!timerRunning) {
        setTimerRunning(true);
      }
    };
    
    // Format time as MM:SS
    const formatTime = (seconds) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };
    
    return (
      <div className="onboarding-overlay">
        <div className="onboarding-container">
          <div className="onboarding-card">
            <h1 className="onboarding-logo">Harmonic Visions</h1>
            <div className="onboarding-subheading">An immersive audiovisual journey</div>
            
            <p className="onboarding-description">
              Experience a mesmerizing fusion of evolving landscapes, harmonious sounds, and responsive visuals 
              designed to create a deeply immersive and transcendent experience. Each mood offers a unique 
              journey that resonates with different emotional states.
            </p>
            
            <div className="creator-attribution">
              FatStinkyPanda's Transcendence Experience - Unlock your mind and connect with the universe
            </div>
            
            <div className="onboarding-timer">
              <div className="timer-display">{formatTime(currentTime)}</div>
              <div className="timer-controls">
                <button className="timer-button" onClick={toggleTimer}>
                  {timerRunning ? 'Pause' : 'Resume'}
                </button>
                <button className="timer-button" onClick={resetTimer}>
                  Reset
                </button>
              </div>
              <div className="timer-progress">
                <div 
                  className="timer-progress-fill" 
                  style={{ width: `${(currentTime / timerValue) * 100}%` }}
                ></div>
              </div>
            </div>
            
            <div className="experience-cards">
              {Object.entries(moodDescriptions).map(([mood, description]) => (
                <div className="experience-card" key={mood}>
                  <h3>{mood.charAt(0).toUpperCase() + mood.slice(1)}</h3>
                  <p>{description}</p>
                </div>
              ))}
            </div>
            
            <div className="support-message">
              <p>If you enjoy this experience and find it valuable, your support helps me continue creating more immersive journeys. Thanks for being part of this adventure!</p>
            </div>
            
            <button className="enter-button" onClick={onEnter}>
              Begin Journey
            </button>
          </div>
        </div>
      </div>
    );
  };
  
  // LoadingIndicator Component
  const LoadingIndicator = () => {
    return (
      <div className="loading-indicator">
        <div className="spinner"></div>
        <div className="loading-text">Creating your experience...</div>
      </div>
    );
  };
  
  // Main App Component
  function App() {
    // State variables for the application
    const [isPlaying, setIsPlaying] = React.useState(false);
    const [volume, setVolume] = React.useState(0.7);
    const [currentMood, setCurrentMood] = React.useState('calm');
    const [showExportPanel, setShowExportPanel] = React.useState(false);
    const [isExporting, setIsExporting] = React.useState(false);
    const [exportProgress, setExportProgress] = React.useState(0);
    const [exportDuration, setExportDuration] = React.useState(900); // 15 minutes in seconds (default)
    const [exportQuality, setExportQuality] = React.useState('high');
    const [exportFormat, setExportFormat] = React.useState('mp4'); // Default to MP4
    const [showOnboarding, setShowOnboarding] = React.useState(true);
    const [isLoading, setIsLoading] = React.useState(false);
    const [uiVisible, setUiVisible] = React.useState(true); // Track UI visibility
    
    // References
    const canvasRef = React.useRef(null);
    const audioEngineRef = React.useRef(null);
    const videoExporterRef = React.useRef(null);
    const exportTimerRef = React.useRef(null);
    const uiTimerRef = React.useRef(null);
    
    // Get audio data for visualization
    const getAudioData = () => {
      if (audioEngineRef.current && typeof audioEngineRef.current.getAudioData === 'function') {
        return audioEngineRef.current.getAudioData();
      }
      return null;
    };
    
    // Initialize video exporter
    React.useEffect(() => {
      if (canvasRef.current && audioEngineRef.current) {
        try {
          videoExporterRef.current = new VideoExporter(
            canvasRef.current.canvas,
            audioEngineRef.current.audioContext,
            audioEngineRef.current.analyser
          );
        } catch (error) {
          console.error("Failed to initialize video exporter:", error);
          ToastSystem.notify('error', 'Could not initialize video export. Some features may be unavailable.');
        }
      }
    }, []);
    
    // Set up keyboard shortcuts
    React.useEffect(() => {
      const handleKeyPress = (e) => {
        // Space bar to toggle play/pause
        if (e.code === 'Space' && !showOnboarding) {
          e.preventDefault(); // Prevent scrolling
          togglePlayback();
        }
        
        // 1-5 to change moods
        if (e.code === 'Digit1' || e.code === 'Numpad1') setCurrentMood('calm');
        if (e.code === 'Digit2' || e.code === 'Numpad2') setCurrentMood('soft');
        if (e.code === 'Digit3' || e.code === 'Numpad3') setCurrentMood('uplifting');
        if (e.code === 'Digit4' || e.code === 'Numpad4') setCurrentMood('warm');
        if (e.code === 'Digit5' || e.code === 'Numpad5') setCurrentMood('cosmic');
        
        // E to toggle export panel
        if (e.code === 'KeyE') {
          setShowExportPanel(prev => !prev);
        }
        
        // H to toggle UI visibility
        if (e.code === 'KeyH') {
          toggleUIVisibility();
        }
      };
      
      window.addEventListener('keydown', handleKeyPress);
      
      return () => {
        window.removeEventListener('keydown', handleKeyPress);
      };
    }, [showOnboarding]);
    
    // Handle mouse movement to temporarily show UI
    React.useEffect(() => {
      const handleMouseMove = () => {
        if (!uiVisible) {
          // Show UI temporarily
          setUiVisible(true);
          
          // Reset existing timer
          if (uiTimerRef.current) {
            clearTimeout(uiTimerRef.current);
          }
          
          // Hide UI after 3 seconds of inactivity
          uiTimerRef.current = setTimeout(() => {
            setUiVisible(false);
          }, 3000);
        }
      };
      
      if (!uiVisible) {
        window.addEventListener('mousemove', handleMouseMove);
      }
      
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        if (uiTimerRef.current) {
          clearTimeout(uiTimerRef.current);
        }
      };
    }, [uiVisible]);
    
    // Handle enter from onboarding
    const handleEnterExperience = () => {
      setIsLoading(true);
      
      // Allow a brief moment for loading screen to display
      setTimeout(() => {
        setShowOnboarding(false);
        setIsLoading(false);
        
        // Auto-play when entering the experience
        setIsPlaying(true);
      }, 1500);
    };
    
    // Handle play/pause
    const togglePlayback = () => {
      setIsPlaying(!isPlaying);
    };
    
    // Handle volume change
    const handleVolumeChange = (newVolume) => {
      setVolume(newVolume);
    };
    
    // Handle mood change
    const handleMoodChange = (mood) => {
      setCurrentMood(mood);
      ToastSystem.notify('info', `Mood changed to ${mood.charAt(0).toUpperCase() + mood.slice(1)}`);
    };
    
    // Show/hide export panel
    const toggleExportPanel = () => {
      setShowExportPanel(!showExportPanel);
    };
    
    // Toggle UI visibility
    const toggleUIVisibility = () => {
      setUiVisible(!uiVisible);
      
      // If hiding UI, clear any existing timer
      if (uiVisible && uiTimerRef.current) {
        clearTimeout(uiTimerRef.current);
        uiTimerRef.current = null;
      }
    };
    
    // Handle export quality change
    const handleExportQualityChange = (quality) => {
      setExportQuality(quality);
    };
    
    // Handle export format change
    const handleExportFormatChange = (format) => {
      setExportFormat(format);
    };
    
    // Handle export duration change
    const handleExportDurationChange = (duration) => {
      setExportDuration(duration);
    };
    
    // Start export process
    const startExport = async () => {
      if (!videoExporterRef.current) {
        ToastSystem.notify('error', 'Video export is not available. Refresh the page and try again.');
        return;
      }
      
      try {
        // Start recording
        setIsExporting(true);
        setExportProgress(0);
        
        // Ensure audio is playing
        if (!isPlaying) {
          setIsPlaying(true);
        }
        
        ToastSystem.notify('info', 'Recording started. Please wait...');
        
        // Start media recorder
        const mediaRecorder = await videoExporterRef.current.startRecording(exportQuality);
        
        // Set up progress updates
        const updateInterval = 100; // Update every 100ms
        const totalUpdates = exportDuration * (1000 / updateInterval);
        let updateCount = 0;
        
        exportTimerRef.current = setInterval(() => {
          updateCount++;
          const progress = (updateCount / totalUpdates) * 100;
          setExportProgress(Math.min(progress, 99)); // Cap at 99% until finished
          
          if (updateCount >= totalUpdates) {
            clearInterval(exportTimerRef.current);
            finishExport();
          }
        }, updateInterval);
        
      } catch (error) {
        console.error('Error starting export:', error);
        ToastSystem.notify('error', 'Failed to start recording. Please try again.');
        setIsExporting(false);
        clearInterval(exportTimerRef.current);
      }
    };
    
    // Finish export process
    const finishExport = async () => {
      try {
        ToastSystem.notify('info', 'Processing video...');
        
        // Stop recording
        const blob = await videoExporterRef.current.stopRecording();
        
        // Convert if needed
        const finalBlob = await videoExporterRef.current.convertToFormat(
          blob,
          exportFormat,
          (progress) => {
            setExportProgress(99 + progress * 0.01); // Use the last 1% for conversion
          }
        );
        
        // Create download link
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `harmonic-visions-${currentMood}-${timestamp}.${exportFormat === 'mp4' ? 'webm' : exportFormat}`;
        const link = videoExporterRef.current.createDownloadLink(finalBlob, filename);
        
        // Trigger download
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Cleanup
        setExportProgress(100);
        
        ToastSystem.notify('success', 'Video created successfully! Download started.');
        
        setTimeout(() => {
          setIsExporting(false);
          setExportProgress(0);
          setShowExportPanel(false);
        }, 1500);
        
      } catch (error) {
        console.error('Error completing export:', error);
        ToastSystem.notify('error', 'Failed to complete recording. Try a shorter duration or refresh the page.');
        setIsExporting(false);
        setExportProgress(0);
      }
    };
    
    // Enhanced Export Panel
    const EnhancedExportPanel = () => {
      // Calculate estimated time based on quality and duration
      const calculateEstimatedTime = () => {
        // Base times in seconds per minute of video
        const baseTimes = {
          low: 5,
          medium: 12,
          high: 20,
          ultra: 40
        };
        
        // Adjust time based on format (WebM is the reference)
        const formatMultiplier = exportFormat === 'gif' ? 2.0 : (exportFormat === 'mp4' ? 1.2 : 1.0);
        
        // Calculate total estimated seconds
        const estimatedSeconds = (exportDuration / 60) * baseTimes[exportQuality] * formatMultiplier;
        
        // Convert to minutes and seconds
        const minutes = Math.floor(estimatedSeconds / 60);
        const seconds = Math.floor(estimatedSeconds % 60);
        
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
      };
      
      // Format duration for display
      const formatDuration = (totalSeconds) => {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
      };
      
      return (
        <div className="panel active">
          <div className="panel-header">
            <h2>Export Video</h2>
            <button 
              className="close-button"
              onClick={toggleExportPanel}
              disabled={isExporting}
              aria-label="Close export panel"
            >
              ×
            </button>
          </div>
          
          {isExporting ? (
            <div className="progress-container">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${exportProgress}%` }}></div>
              </div>
              <div className="progress-text">
                {exportProgress < 99 ? 
                  `Recording: ${exportProgress.toFixed(0)}%` : 
                  'Processing video...'}
              </div>
            </div>
          ) : (
            <>
              <div className="setting-group">
                <label htmlFor="duration">Duration</label>
                <input
                  id="duration"
                  type="number"
                  min="5"
                  max="1800"
                  value={exportDuration}
                  onChange={(e) => handleExportDurationChange(parseInt(e.target.value))}
                />
              </div>
              
              <div className="setting-group">
                <label>Duration (mm:ss)</label>
                <div>{formatDuration(exportDuration)}</div>
              </div>
              
              <div className="setting-group">
                <label>Quality</label>
                <div className="quality-options">
                  {qualityOptions.map(opt => (
                    <div 
                      key={opt.id}
                      className={`quality-option ${exportQuality === opt.id ? 'selected' : ''}`}
                      onClick={() => handleExportQualityChange(opt.id)}
                    >
                      <h4>{opt.label}</h4>
                      <p>{
                        opt.id === 'low' ? 'Faster export' :
                        opt.id === 'ultra' ? 'Best quality' :
                        `Balanced ${opt.id === 'medium' ? 'performance' : 'quality'}`
                      }</p>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="setting-group">
                <label>Format</label>
                <div className="format-options">
                  {formatOptions.map(opt => (
                    <div 
                      key={opt.id}
                      className={`format-option ${exportFormat === opt.id ? 'selected' : ''}`}
                      onClick={() => handleExportFormatChange(opt.id)}
                    >
                      <div className="format-icon">{
                        opt.id === 'webm' ? '🎥' :
                        opt.id === 'mp4' ? '📹' : '🖼️'
                      }</div>
                      <div className="format-label">{opt.label}</div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="estimated-time">
                Estimated Processing Time: {calculateEstimatedTime()}
              </div>
              
              <button 
                className="action-button"
                onClick={startExport}
              >
                Start Recording
              </button>
            </>
          )}
        </div>
      );
    };
    
    return (
      <div className={`app-container ${!uiVisible ? 'ui-hidden' : ''}`}>
        {showOnboarding ? (
          <Onboarding 
            moodDescriptions={moodDescriptions} 
            onEnter={handleEnterExperience} 
          />
        ) : (
          <>
            {/* UI hover zones for temporary UI visibility */}
            <div className="ui-hover-zone"></div>
            <div className="ui-hover-zone-bottom"></div>
            
            <div className="app-header">
              <h1 className="app-title">Harmonic Visions</h1>
              <div className="creator-badge">
                FatStinkyPanda's Transcendence Experience
                <span className="support-text">Thanks for your support!</span>
              </div>
            </div>
            
            <div className="main-content">
              <VisualCanvas 
                ref={canvasRef}
                isPlaying={isPlaying}
                mood={currentMood}
                audioData={getAudioData}
              />
              
              <AudioEngine 
                ref={audioEngineRef}
                isPlaying={isPlaying}
                volume={volume}
                mood={currentMood}
              />
              
              <div className="control-panel">
                <div className="control-group">
                  <button 
                    className="play-button" 
                    onClick={togglePlayback}
                    aria-label={isPlaying ? "Pause" : "Play"}
                  >
                    {isPlaying ? '❚❚' : '▶'}
                  </button>
                </div>
                
                <div className="control-group">
                  <label htmlFor="volume">Volume</label>
                  <input 
                    id="volume"
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.01" 
                    value={volume} 
                    onChange={(e) => handleVolumeChange(parseFloat(e.target.value))} 
                  />
                </div>
                
                <div className="control-group">
                  <label htmlFor="mood">Mood</label>
                  <div className="mood-tooltip">{moodDescriptions[currentMood]}</div>
                  <select 
                    id="mood"
                    className="control-select"
                    value={currentMood} 
                    onChange={(e) => handleMoodChange(e.target.value)}
                  >
                    {moods.map(m => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </div>
                
                <div className="control-group">
                  <button 
                    className="export-button"
                    onClick={toggleExportPanel}
                    disabled={isExporting}
                  >
                    <span className="export-button-icon">↓</span>
                    Export Video
                  </button>
                </div>
              </div>
              
              {/* UI toggle button */}
              <div className="ui-toggle" onClick={toggleUIVisibility}>
                <span className="ui-toggle-icon">{uiVisible ? '◱' : '◰'}</span>
              </div>
              
              {showExportPanel && <EnhancedExportPanel />}
              
              <div className="keyboard-shortcuts">
                Shortcuts: <span className="keyboard-shortcut">Space</span> Play/Pause
                <span className="keyboard-shortcut">1-5</span> Change Mood
                <span className="keyboard-shortcut">E</span> Export
                <span className="keyboard-shortcut">H</span> Hide UI
              </div>
            </div>
          </>
        )}
        
        {isLoading && <LoadingIndicator />}
        
        <ToastContainer />
      </div>
    );
  }