import { useEffect, useCallback } from 'react';

type Direction = "up" | "down" | "left" | "right";

export function useKeyboardControls(
  onMove: (direction: Direction) => void,
  isEnabled: boolean = true
) {
  const handleKeyPress = useCallback((event: KeyboardEvent) => {
    if (!isEnabled) return;
    
    // Prevent default scrolling behavior
    const preventDefaultKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D'];
    if (preventDefaultKeys.includes(event.key)) {
      event.preventDefault();
    }

    // Map keys to directions
    const keyMap: { [key: string]: Direction } = {
      // Arrow keys
      'ArrowUp': 'up',
      'ArrowDown': 'down',
      'ArrowLeft': 'left',
      'ArrowRight': 'right',
      // WASD keys
      'w': 'up',
      'W': 'up',
      's': 'down',
      'S': 'down',
      'a': 'left',
      'A': 'left',
      'd': 'right',
      'D': 'right'
    };

    const direction = keyMap[event.key];
    if (direction) {
      onMove(direction);
    }
  }, [onMove, isEnabled]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyPress);
    
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [handleKeyPress]);

  return null; // This hook doesn't render anything
}