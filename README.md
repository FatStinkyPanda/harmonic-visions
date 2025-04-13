# Harmonic Visions: An Immersive Audiovisual Journey

**Created by FatStinkyPanda ([GitHub](https://github.com/FatStinkyPanda))**

Harmonic Visions is a web-based application designed to create deeply immersive and transcendent audiovisual experiences. It dynamically generates evolving visual landscapes synchronized with generative ambient soundscapes, offering different "moods" that cater to various emotional states like relaxation, focus, and wonder.

## Description

Experience a mesmerizing fusion of light, color, sound, and motion. Harmonic Visions utilizes generative algorithms for both its visuals (powered by Three.js) and audio (using the Web Audio API). Select a mood, and watch as abstract landscapes, particle systems, and fluid dynamics unfold before you, perfectly harmonized with a unique, evolving soundscape featuring ambient textures, pads, melodies, and subtle rhythms. The experience is designed to be captivating, relaxing, and potentially meditative, offering a unique journey for your senses.

## Features

- **Multiple Moods:** Choose from distinct moods (Calm, Soft, Uplifting, Warm, Cosmic) each with unique visual palettes, generative rules, and audio characteristics.
- **Generative Visuals:** Real-time 3D visuals created with Three.js, featuring:
  - Dynamic particle systems (stars, fireflies, mist, etc.)
  - Procedural landscapes and terrain generation.
  - Fluid simulation effects influencing visual elements.
  - Abstract geometric forms and celestial objects.
  - Volumetric lighting and atmospheric effects (fog, clouds).
  - Advanced post-processing effects (bloom, color grading, film grain, etc.).
- **Generative Audio:** Unique soundscapes created on-the-fly using the Web Audio API:
  - Layered ambient sounds (water, wind, space, etc.).
  - Evolving drone/pad synthesizers based on musical scales.
  - Algorithmic melodic and bass patterns.
  - Subtle generative percussion (mood-dependent).
  - Reverb, compression, and dynamic audio analysis.
- **Audio Reactivity:** Visual elements dynamically respond to various aspects of the generated audio (frequency bands, beats, overall energy).
- **Video Export:** Record your audiovisual experience directly from the browser (outputs primarily as WebM, other formats may require external conversion) with quality and duration settings.
- **Adaptive Performance:** Attempts to adjust visual quality (particle counts, post-processing) based on detected device performance for smoother playback.
- **User Controls:** Simple interface for play/pause, volume adjustment, and mood selection.
- **Keyboard Shortcuts:** Quick access to common controls.
- **Onboarding:** Introductory screen explaining the experience.
- **Disclaimer & Early Access:** The application is presented as an "Early Access" experience, acknowledging ongoing development.

## Technology Stack

- **Frontend:** HTML5, CSS3, JavaScript (ES6+)
- **UI Library:** React (via Babel Standalone)
- **3D Graphics:** Three.js
- **Audio:** Web Audio API
- **Video Recording:** MediaRecorder API
- **Transpilation:** Babel Standalone (for in-browser JSX)

## File Structure

- `index.html`: Main application entry point, loads libraries and scripts, defines HTML structure.
- `styles.css`: CSS styles for the user interface and layout.
- `data.js`: Contains configuration data for moods (visuals, audio, descriptions) and UI options.
- `AudioEngine.js`: Handles all audio generation, processing, and analysis using the Web Audio API.
- `VisualCanvas.js`: Manages the Three.js scene, rendering, visual effects, and audio reactivity for visuals.
- `VideoExporter.js`: Implements video and audio capture using MediaRecorder API.
- `ToastSystem.js`: Simple system for displaying short notification messages.
- _(components.js - Embedded within `index.html` via Babel)_: Contains React components for the UI (Onboarding, Controls, Export Panel, etc.).

## Setup & Running

1.  Ensure you have a modern web browser that supports WebGL and Web Audio API (Chrome, Firefox, Edge recommended).
2.  Clone or download the repository/files.
3.  Open the `index.html` file directly in your web browser. _No build step or server is strictly required due to the use of Babel Standalone and direct script includes._

## Controls & Usage

- **Onboarding:** Read the introduction and click "Begin Journey" or wait for the timer.
- **Play/Pause Button (or Spacebar):** Start or stop the audiovisual experience.
- **Volume Slider:** Adjust the master volume.
- **Mood Selector (or Keys 1-5):** Change the current mood, altering visuals and audio.
- **Export Button (or 'E' Key):** Opens the panel to configure and start video recording.
- **UI Toggle Button (or 'H' Key):** Hides/shows the main UI controls and header. UI reappears temporarily on mouse movement near top/bottom edges when hidden.

## Known Issues & Limitations

- **Performance:** Generative 3D graphics and audio can be resource-intensive. Performance may vary significantly depending on the device hardware. The adaptive quality feature attempts to mitigate this but may not be perfect.
- **Browser Compatibility:** While designed for modern browsers, minor visual or audio inconsistencies might occur across different browsers or versions.
- **Video Export:**
  - The primary export format is WebM due to browser limitations.
  - MP4/GIF export is mentioned but likely requires external conversion tools; the in-browser conversion is noted as limited/placeholder.
  - Exporting long durations at high quality can consume significant memory and CPU.
- **Early Access:** As indicated by the disclaimer, the application is under active development and may contain bugs or incomplete features.

## License

FatStinkyPanda Application License
Copyright (c) 2025 FatStinkyPanda

Permissions
You may copy, distribute, and modify this application.
You may use this application for personal or non-commercial purposes.
You may include this application in non-commercial projects.
Conditions
You must include this original license with any copy or modification of the application.
You must give appropriate credit to FatStinkyPanda as the original creator of this application.
You must clearly indicate if you have modified the original application.
Limitations
You may not sell this application or any derivative works based on it.
You may not use this application for commercial purposes without explicit permission from the copyright holder.
You may not sublicense this application or any derivative works.
THIS SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
