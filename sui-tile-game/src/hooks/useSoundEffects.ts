import { useCallback, useRef } from 'react';

// Simple sound effect system using Web Audio API
export function useSoundEffects() {
  const audioContextRef = useRef<AudioContext | null>(null);

  // Initialize audio context
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  // Generate beep sound
  const playBeep = useCallback((frequency: number = 440, duration: number = 200, volume: number = 0.3) => {
    try {
      const audioContext = getAudioContext();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(volume, audioContext.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration / 1000);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + duration / 1000);
    } catch (error) {
      console.log('Audio not supported:', error);
    }
  }, [getAudioContext]);

  // Sound effects
  const soundEffects = {
    // Move sound
    move: useCallback(() => playBeep(330, 100, 0.2), [playBeep]),
    
    // Capture tile sound
    capture: useCallback(() => {
      playBeep(523, 150, 0.3); // High C
      setTimeout(() => playBeep(659, 150, 0.3), 100); // High E
    }, [playBeep]),
    
    // Turn change sound
    turnChange: useCallback(() => playBeep(440, 200, 0.15), [playBeep]),
    
    // Game start sound
    gameStart: useCallback(() => {
      playBeep(262, 150, 0.25); // C
      setTimeout(() => playBeep(330, 150, 0.25), 150); // E
      setTimeout(() => playBeep(392, 200, 0.3), 300); // G
    }, [playBeep]),
    
    // Game end sound
    gameEnd: useCallback(() => {
      playBeep(523, 200, 0.3); // High C
      setTimeout(() => playBeep(440, 200, 0.3), 200); // A
      setTimeout(() => playBeep(349, 300, 0.35), 400); // F
    }, [playBeep]),
    
    // Win sound
    win: useCallback(() => {
      const notes = [523, 659, 784, 1047]; // C, E, G, High C
      notes.forEach((freq, i) => {
        setTimeout(() => playBeep(freq, 250, 0.3), i * 150);
      });
    }, [playBeep]),
    
    // Button click sound
    buttonClick: useCallback(() => playBeep(800, 50, 0.1), [playBeep]),
    
    // Countdown tick
    tick: useCallback(() => playBeep(880, 100, 0.2), [playBeep]),
    
    // Warning sound (when time is running out)
    warning: useCallback(() => playBeep(220, 300, 0.4), [playBeep]),
  };

  return soundEffects;
}