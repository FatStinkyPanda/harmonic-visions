// ToastSystem.js - Enhanced notification toast message system for Harmonic Visions
// Copyright (c) 2025 FatStinkyPanda - All rights reserved.
// Version: 2.0.0 (Refactored for robustness and features)

const ToastSystem = (() => {
  // --- Configuration ---
  const DEFAULT_DURATION = 5000;          // Default display time in ms
  const REMOVAL_ANIMATION_DURATION = 300; // CSS animation duration in ms
  const MAX_VISIBLE_TOASTS = 5;           // Maximum number of toasts displayed simultaneously
  const VALID_TYPES = ['success', 'warning', 'error', 'info', 'debug']; // Allowed toast types

  // --- State ---
  let toasts = [];                        // Array of active toast objects { id, type, message, removing, clearRemovingTimeout }
  let listeners = [];                     // Array of listener functions (UI updaters)
  let removalTimeouts = new Map();        // Map<id, timeoutId> for auto-removal
  let nextId = 0;                         // Simple unique ID generator

  // --- Private Helper Functions ---

  /**
   * Generates a unique ID for a new toast.
   * @returns {number} A unique identifier.
   */
  const generateId = () => {
      return nextId++;
  };

  /**
   * Notifies all subscribed listeners about changes to the toast list.
   * Creates a shallow copy to prevent mutation issues.
   * @param {Array} currentToasts - The current state of the toasts array.
   */
  const notifyListeners = (currentToasts) => {
      const toastsCopy = [...currentToasts]; // Provide a copy to listeners
      listeners.forEach(listener => {
          try {
              listener(toastsCopy);
          } catch (error) {
              console.error('ToastSystem Error: Listener function threw an error:', error);
              // Optionally remove the faulty listener:
              // listeners = listeners.filter(l => l !== listener);
          }
      });
  };

  /**
   * Schedules the final removal of a toast after its animation.
   * @param {number} id - The ID of the toast to remove.
   */
  const scheduleFinalRemoval = (id) => {
      // Find the toast again to ensure it wasn't cleared in the meantime
      const toastIndex = toasts.findIndex(t => t.id === id);
      if (toastIndex !== -1) {
          const toast = toasts[toastIndex];
          // Set a timeout to remove the toast element from the array after animation
          const removalTimeoutId = setTimeout(() => {
              toasts = toasts.filter(t => t.id !== id);
              notifyListeners(toasts);
              // Clean up the timeout reference from the toast object itself
              if (toast.clearRemovingTimeout) {
                 toast.clearRemovingTimeout = null; // Clear the reference
              }
               console.debug(`ToastSystem: Final removal for toast ID ${id}`);
          }, REMOVAL_ANIMATION_DURATION);

          // Store a way to clear this specific timeout on the toast object
          toast.clearRemovingTimeout = () => clearTimeout(removalTimeoutId);
      }
  };


  // --- Public API ---

  /**
   * Subscribes a listener function to receive updates when the toast list changes.
   * @param {Function} listener - The function to call with the updated toasts array.
   * @returns {Function} An unsubscribe function.
   */
  const subscribe = (listener) => {
      if (typeof listener !== 'function') {
          console.error('ToastSystem Error: Listener must be a function.');
          return () => {}; // Return a no-op unsubscribe function
      }
      listeners.push(listener);
      console.debug('ToastSystem: Listener subscribed.');
      // Immediately provide the current state to the new listener
      listener([...toasts]);
      return () => {
          listeners = listeners.filter(l => l !== listener);
          console.debug('ToastSystem: Listener unsubscribed.');
      };
  };

  /**
   * Displays a new toast message.
   * @param {string} type - The type of toast (e.g., 'success', 'error', 'info'). Must be one of VALID_TYPES.
   * @param {string} message - The message content for the toast.
   * @param {number} [duration=DEFAULT_DURATION] - How long the toast should be visible in milliseconds.
   * @returns {number} The unique ID of the created toast.
   */
  const notify = (type, message, duration = DEFAULT_DURATION) => {
      // Input validation
      const finalType = VALID_TYPES.includes(type) ? type : 'info';
      if (!VALID_TYPES.includes(type)) {
          console.warn(`ToastSystem Warning: Invalid toast type "${type}". Defaulting to "info".`);
      }
      const finalMessage = typeof message === 'string' ? message.trim() : String(message);
      if (!finalMessage) {
          console.error('ToastSystem Error: Toast message cannot be empty.');
          return -1; // Indicate failure
      }
      const finalDuration = typeof duration === 'number' && duration > 0 ? duration : DEFAULT_DURATION;

      const id = generateId();
      const newToast = {
           id,
           type: finalType,
           message: finalMessage,
           removing: false,
           clearRemovingTimeout: null // Function to clear the final removal timeout
      };

      // Enforce maximum visible toasts limit
      const visibleToasts = toasts.filter(t => !t.removing);
      if (visibleToasts.length >= MAX_VISIBLE_TOASTS) {
          // Find the oldest non-removing toast to remove *immediately*
          const oldestToast = visibleToasts[0];
          if (oldestToast) {
              console.debug(`ToastSystem: Max toasts (${MAX_VISIBLE_TOASTS}) reached. Force removing oldest: ID ${oldestToast.id}`);
              // Clear its auto-removal timeout if it exists
              if (removalTimeouts.has(oldestToast.id)) {
                  clearTimeout(removalTimeouts.get(oldestToast.id));
                  removalTimeouts.delete(oldestToast.id);
              }
              // Clear its animation removal timeout if it exists
               if (oldestToast.clearRemovingTimeout) {
                   oldestToast.clearRemovingTimeout();
               }
              // Remove immediately from the array
              toasts = toasts.filter(t => t.id !== oldestToast.id);
              // No need to notify here, the next notification will handle it
          }
      }

      // Add the new toast
      toasts.push(newToast);
      console.debug(`ToastSystem: Added toast ID ${id} (${finalType}): "${finalMessage}"`);
      notifyListeners(toasts); // Notify about the new toast

      // Schedule auto-removal
      const autoRemovalTimeoutId = setTimeout(() => {
          removeToast(id); // Initiate the removal process
          removalTimeouts.delete(id); // Clean up the map entry
      }, finalDuration);
      removalTimeouts.set(id, autoRemovalTimeoutId); // Store the timeout

      return id;
  };

  /**
   * Initiates the removal of a specific toast, allowing for animation.
   * @param {number} id - The ID of the toast to remove.
   */
  const removeToast = (id) => {
      const toastIndex = toasts.findIndex(t => t.id === id);

      if (toastIndex === -1) {
          // console.warn(`ToastSystem: Toast with ID ${id} not found for removal.`);
          return; // Exit silently if not found
      }

      const toast = toasts[toastIndex];

      // Prevent double removal initiation
      if (toast.removing) {
          // console.debug(`ToastSystem: Toast ID ${id} is already being removed.`);
          return;
      }

      console.debug(`ToastSystem: Initiating removal for toast ID ${id}`);

      // Clear the auto-removal timeout if it's still pending
      if (removalTimeouts.has(id)) {
          clearTimeout(removalTimeouts.get(id));
          removalTimeouts.delete(id);
          console.debug(`ToastSystem: Cleared auto-removal timeout for toast ID ${id}`);
      }

      // Mark for removal (for CSS animation)
      toast.removing = true;
      notifyListeners(toasts); // Notify UI to start the removal animation

      // Schedule the actual removal from the array after the animation
      scheduleFinalRemoval(id);
  };

  /**
   * Clears all currently displayed toasts.
   * @param {boolean} [animate=true] - Whether to animate the removal.
   */
  const clearAll = (animate = true) => {
      console.debug(`ToastSystem: Clearing all toasts (animate: ${animate}).`);

      // Clear all pending auto-removal timeouts
      removalTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
      removalTimeouts.clear();

      // Clear any pending animation removal timeouts
      toasts.forEach(toast => {
          if (toast.clearRemovingTimeout) {
              toast.clearRemovingTimeout();
              toast.clearRemovingTimeout = null;
          }
      });

      if (animate && toasts.some(t => !t.removing)) {
          // Mark all non-removing toasts for animated removal
          toasts.forEach(toast => {
              if (!toast.removing) {
                  toast.removing = true;
              }
          });
          notifyListeners(toasts); // Notify UI to start animations

          // Schedule final clearance after animation
          setTimeout(() => {
              toasts = [];
              notifyListeners(toasts); // Notify final empty state
              console.debug("ToastSystem: All toasts cleared after animation.");
          }, REMOVAL_ANIMATION_DURATION);
      } else {
          // Remove immediately without animation
          toasts = [];
          notifyListeners(toasts); // Notify immediately
          console.debug("ToastSystem: All toasts cleared immediately.");
      }
  };

  // Expose public methods
  return {
      subscribe,
      notify,
      removeToast,
      clearAll,
      // Expose constants for potential external use (e.g., in CSS)
      REMOVAL_ANIMATION_DURATION
  };
})();

// Example Usage (can be removed in production)
/*
document.addEventListener('DOMContentLoaded', () => {
  // Example React-like listener (replace with actual React state update)
  const updateUI = (currentToasts) => {
      const container = document.getElementById('toast-container-example');
      if (!container) return;
      // Simple rendering example
      container.innerHTML = currentToasts.map(t =>
          `<div class="toast toast-${t.type} ${t.removing ? 'removing' : ''}" style="border-left-color: ${t.type === 'success' ? 'green' : t.type === 'error' ? 'red' : 'blue'}; margin-bottom: 5px; padding: 10px; background: #333; color: white; transition: transform 0.3s, opacity 0.3s; animation: ${t.removing ? 'slide-out 0.3s forwards' : 'slide-in 0.3s forwards'};">
              ${t.type.toUpperCase()}: ${t.message} (ID: ${t.id})
           </div>`
      ).join('');
  };

  // Create a dummy container
  const exampleContainer = document.createElement('div');
  exampleContainer.id = 'toast-container-example';
  exampleContainer.style.position = 'fixed';
  exampleContainer.style.top = '10px';
  exampleContainer.style.right = '10px';
  exampleContainer.style.zIndex = '9999';
  document.body.appendChild(exampleContainer);

  // Add some CSS for the example animations
  const style = document.createElement('style');
  style.innerHTML = `
      @keyframes slide-in { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      @keyframes slide-out { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
  `;
  document.head.appendChild(style);


  const unsubscribe = ToastSystem.subscribe(updateUI);

  // Test buttons
  document.getElementById('test-success').onclick = () => ToastSystem.notify('success', 'Operation successful!');
  document.getElementById('test-error').onclick = () => ToastSystem.notify('error', 'Something went wrong!', 7000);
  document.getElementById('test-info').onclick = () => ToastSystem.notify('info', 'Here is some information.');
  document.getElementById('test-warn').onclick = () => ToastSystem.notify('warning', 'Please check your input.');
  document.getElementById('test-debug').onclick = () => ToastSystem.notify('debug', 'Debug value: ' + Math.random().toFixed(3));
  document.getElementById('test-max').onclick = () => {
      for(let i=0; i<7; i++) ToastSystem.notify('info', `Spam toast ${i+1}`);
  };
  document.getElementById('test-clear').onclick = () => ToastSystem.clearAll();

  // Example of removing a specific toast after a delay
  setTimeout(() => {
      const id = ToastSystem.notify('info', 'This toast will be removed soon programmatically.');
      setTimeout(() => {
          ToastSystem.removeToast(id);
      }, 2000);
  }, 6000);

  // Clean up listener on page unload (though not strictly necessary for this example)
  // window.addEventListener('beforeunload', unsubscribe);
});

// Add some test buttons to index.html body for the example:
/*
<div style="position: fixed; bottom: 10px; left: 10px; z-index: 10000; background: rgba(0,0,0,0.7); padding: 10px; border-radius: 5px;">
   <button id="test-success">Success</button>
   <button id="test-error">Error</button>
   <button id="test-info">Info</button>
   <button id="test-warn">Warning</button>
   <button id="test-debug">Debug</button>
   <button id="test-max">Max Test</button>
   <button id="test-clear">Clear All</button>
</div>
*/