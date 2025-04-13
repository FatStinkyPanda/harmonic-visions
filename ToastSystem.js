// ToastSystem.js - Handles notification toast messages

const ToastSystem = (() => {
    let toasts = [];
    let listeners = [];
    
    const subscribe = (listener) => {
      listeners.push(listener);
      return () => {
        listeners = listeners.filter(l => l !== listener);
      };
    };
    
    const notify = (type, message, duration = 3000) => {
      const id = Date.now();
      const toast = { id, type, message };
      toasts.push(toast);
      listeners.forEach(listener => listener(toasts));
      
      setTimeout(() => {
        removeToast(id);
      }, duration);
      
      return id;
    };
    
    const removeToast = (id) => {
      const toast = toasts.find(t => t.id === id);
      if (toast) {
        toast.removing = true;
        listeners.forEach(listener => listener([...toasts]));
        
        setTimeout(() => {
          toasts = toasts.filter(t => t.id !== id);
          listeners.forEach(listener => listener(toasts));
        }, 300);
      }
    };
    
    return {
      subscribe,
      notify,
      removeToast
    };
  })();