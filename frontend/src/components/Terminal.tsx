import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import { Terminal as TerminalIcon, Clear, Fullscreen, FullscreenExit } from '@mui/icons-material';
import { terminalManager } from '../utils/terminalManager';

interface TerminalProps {
  height?: number;
  onFullscreen?: (isFullscreen: boolean) => void;
}

const Terminal: React.FC<TerminalProps> = ({ height = 400, onFullscreen }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [output, setOutput] = useState<string[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isFocused, setIsFocused] = useState(false);

  // Connect to terminal WebSocket using the global manager
  useEffect(() => {
    // Get initial state
    const initialState = terminalManager.getState();
    setIsConnected(initialState.isConnected);
    setIsConnecting(initialState.isConnecting);
    setOutput(initialState.output);
    setCommandHistory(initialState.commandHistory);

    // Subscribe to connection changes
    const unsubscribeConnection = terminalManager.onConnectionChange((connected, connecting) => {
      setIsConnected(connected);
      setIsConnecting(connecting);
    });

    // Subscribe to output changes
    const unsubscribeOutput = terminalManager.onOutputChange((newOutput) => {
      setOutput(newOutput);
    });

    // Auto-focus the terminal after a short delay
    setTimeout(() => {
      if (terminalRef.current) {
        terminalRef.current.focus();
      }
    }, 200);

    // Cleanup subscriptions on unmount
    return () => {
      unsubscribeConnection();
      unsubscribeOutput();
      // Note: We don't close the WebSocket connection on component unmount anymore
    };
  }, []);
  
  // Auto-scroll to bottom
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [output]);

  // Prevent browser scrolling when terminal is focused (simplified)
  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (isFocused) {
        // Only prevent specific keys that cause scrolling
        if (['Space', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.code)) {
          event.preventDefault();
        }
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);

    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [isFocused]);
  
  // Handle keyboard input
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!isConnected || isConnecting) return;

    console.log('Key pressed:', event.key, event.code);

    // Prevent default for specific keys that might cause issues
    if (['Enter', 'Tab', 'ArrowUp', 'ArrowDown', 'Backspace'].includes(event.key) ||
        event.key === ' ' || event.code === 'Space') {
      event.preventDefault();
    }

    // Special handling for Ctrl/Cmd combinations
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      if (event.key === 'c') {
        // Ctrl+C - send SIGINT
        terminalManager.sendInput('\x03');
        return;
      } else if (event.key === 'l') {
        // Ctrl+L - clear screen
        clearTerminal();
        return;
      } else if (event.key === 'd') {
        // Ctrl+D - send EOF
        terminalManager.sendInput('\x04');
        return;
      }
      return;
    }

    if (event.key === 'Enter') {
      // Send command using terminal manager
      terminalManager.sendInput(currentInput);
      setHistoryIndex(-1);
      // Update local command history from manager
      setCommandHistory(terminalManager.getCommandHistory());
      setCurrentInput('');

    } else if (event.key === 'ArrowUp') {
      // Previous command in history
      if (commandHistory.length > 0) {
        const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setCurrentInput(commandHistory[newIndex]);
      }

    } else if (event.key === 'ArrowDown') {
      // Next command in history
      if (historyIndex >= 0) {
        const newIndex = historyIndex + 1;
        if (newIndex >= commandHistory.length) {
          setHistoryIndex(-1);
          setCurrentInput('');
        } else {
          setHistoryIndex(newIndex);
          setCurrentInput(commandHistory[newIndex]);
        }
      }

    } else if (event.key === 'Tab') {
      // Tab completion (basic)
      const commonCommands = ['ls', 'cd', 'pwd', 'cat', 'echo', 'ros2', 'rostopic', 'rosnode', 'clear', 'exit'];
      const matches = commonCommands.filter(cmd => cmd.startsWith(currentInput));
      if (matches.length === 1) {
        setCurrentInput(matches[0] + ' ');
      }

    } else if (event.key === 'Backspace') {
      setCurrentInput(prev => prev.slice(0, -1));

    } else if (event.key === ' ' || event.code === 'Space') {
      // Handle space key
      setCurrentInput(prev => prev + ' ');

    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      // Regular character input
      setCurrentInput(prev => prev + event.key);
    }
  };
  
  // Clear terminal
  const clearTerminal = () => {
    terminalManager.clearOutput();
  };

  // Toggle fullscreen
  const toggleFullscreen = () => {
    const newFullscreen = !isFullscreen;
    setIsFullscreen(newFullscreen);
    if (onFullscreen) {
      onFullscreen(newFullscreen);
    }
  };

  // Send resize event when dimensions change
  useEffect(() => {
    if (isConnected && !isConnecting) {
      // Add a small delay to ensure WebSocket is fully ready
      const timer = setTimeout(() => {
        if (isConnected && !isConnecting) {
          const cols = Math.floor((terminalRef.current?.clientWidth || 800) / 8); // Approximate char width
          const rows = Math.floor((height - 40) / 16); // Approximate line height
          terminalManager.sendResize(cols, rows);
        }
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [height, isConnected, isConnecting]);
  
  return (
    <Box sx={{ 
      height: isFullscreen ? '100vh' : height,
      display: 'flex',
      flexDirection: 'column',
      border: '1px solid #333',
      borderRadius: 1,
      backgroundColor: '#1e1e1e',
      color: '#ffffff',
      fontFamily: 'Monaco, Consolas, "Courier New", monospace',
      fontSize: '14px',
      position: isFullscreen ? 'fixed' : 'relative',
      top: isFullscreen ? 0 : 'auto',
      left: isFullscreen ? 0 : 'auto',
      right: isFullscreen ? 0 : 'auto',
      bottom: isFullscreen ? 0 : 'auto',
      zIndex: isFullscreen ? 9999 : 'auto'
    }}>
      {/* Terminal Header */}
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        padding: '8px 12px',
        backgroundColor: '#2d2d2d',
        borderBottom: '1px solid #333'
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TerminalIcon sx={{ fontSize: 16 }} />
          <Typography variant="caption" sx={{ color: '#ffffff' }}>
            Terminal
          </Typography>
          <Box sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: isConnecting ? '#ff9800' : (isConnected ? '#4caf50' : '#f44336'),
            animation: isConnecting ? 'pulse 1s infinite' : 'none'
          }} />
          {isConnecting && (
            <Typography variant="caption" sx={{ color: '#ff9800', marginLeft: 1 }}>
              Connecting...
            </Typography>
          )}
        </Box>
        
        <Box>
          <Tooltip title="Clear Terminal">
            <IconButton size="small" onClick={clearTerminal} sx={{ color: '#ffffff' }}>
              <Clear sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}>
            <IconButton size="small" onClick={toggleFullscreen} sx={{ color: '#ffffff' }}>
              {isFullscreen ? <FullscreenExit sx={{ fontSize: 16 }} /> : <Fullscreen sx={{ fontSize: 16 }} />}
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
      
      {/* Terminal Output */}
      <Box
        ref={terminalRef}
        sx={{
          flex: 1,
          padding: '8px 12px',
          overflow: 'auto',
          backgroundColor: '#1e1e1e',
          color: '#ffffff',
          fontFamily: '"Courier New", Courier, monospace',
          fontSize: '14px',
          lineHeight: '1.4',
          cursor: 'text',
          outline: 'none',
          border: isFocused ? '2px solid #4caf50' : '1px solid #333',
          borderRadius: 1
        }}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onClick={() => {
          // Focus the terminal when clicked
          if (terminalRef.current) {
            terminalRef.current.focus();
          }
        }}
      >
        <pre style={{
          margin: 0,
          padding: 0,
          fontFamily: '"Courier New", Courier, monospace',
          fontSize: '14px',
          lineHeight: '1.4',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all'
        }}>
          {output.join('\n')}
        </pre>

        {/* Current Input Line */}
        {isConnected && (
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            marginTop: '4px',
            fontFamily: 'monospace, "Courier New", Courier',
            whiteSpace: 'pre'
          }}>
            <span style={{ color: '#4caf50', marginRight: '8px' }}>$</span>
            <span style={{
              backgroundColor: isFocused ? '#333' : '#2a2a2a',
              padding: '2px 4px',
              minWidth: '8px',
              fontFamily: 'monospace, "Courier New", Courier',
              border: isFocused ? '1px solid #4caf50' : '1px solid #555'
            }}>
              {currentInput}
              <span style={{
                backgroundColor: isFocused ? '#ffffff' : '#888',
                color: '#1e1e1e',
                animation: isFocused ? 'blink 1s infinite' : 'none'
              }}>_</span>
            </span>
          </Box>
        )}

        {/* Help message when not focused */}
        {isConnected && !isFocused && (
          <Box sx={{ marginTop: '8px', color: '#888', fontSize: '12px', fontStyle: 'italic' }}>
            💡 Click anywhere in the terminal area to start typing commands
          </Box>
        )}

        {/* Debug info */}
        {process.env.NODE_ENV === 'development' && (
          <Box sx={{ marginTop: '8px', color: '#666', fontSize: '10px', fontStyle: 'italic' }}>
            Debug: Connected={isConnected ? 'Yes' : 'No'}, Connecting={isConnecting ? 'Yes' : 'No'},
            Focused={isFocused ? 'Yes' : 'No'}, Output lines={output.length},
            Current input="{currentInput}"
          </Box>
        )}
      </Box>
      

      
      {/* CSS for animations */}
      <style>
        {`
          @keyframes blink {
            0%, 50% { opacity: 1; }
            51%, 100% { opacity: 0; }
          }
          @keyframes pulse {
            0% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.7; transform: scale(1.1); }
            100% { opacity: 1; transform: scale(1); }
          }
        `}
      </style>
    </Box>
  );
};

export default Terminal;
