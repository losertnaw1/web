import React, { useState, useEffect } from 'react';
import { Box, Paper, Typography, Chip, Button, Alert } from '@mui/material';

interface ConnectionDebuggerProps {
  isConnected: boolean;
}

const ConnectionDebugger: React.FC<ConnectionDebuggerProps> = ({ isConnected }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [testResult, setTestResult] = useState<string>('');
  const [isVisible, setIsVisible] = useState<boolean>(false);

  useEffect(() => {
    // Capture console logs
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    console.log = (...args) => {
      const message = args.join(' ');
      if (message.includes('WebSocket') || message.includes('🔄') || message.includes('✅') || message.includes('❌')) {
        setLogs(prev => [...prev.slice(-20), `[LOG] ${new Date().toLocaleTimeString()}: ${message}`]);
      }
      //originalLog(...args);
    };

    console.error = (...args) => {
      const message = args.join(' ');
      if (message.includes('WebSocket') || message.includes('❌')) {
        setLogs(prev => [...prev.slice(-20), `[ERROR] ${new Date().toLocaleTimeString()}: ${message}`]);
      }
      originalError(...args);
    };

    console.warn = (...args) => {
      const message = args.join(' ');
      if (message.includes('WebSocket') || message.includes('⚠️')) {
        setLogs(prev => [...prev.slice(-20), `[WARN] ${new Date().toLocaleTimeString()}: ${message}`]);
      }
      //originalWarn(...args);
    };

    return () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);

  const testDirectConnection = async () => {
    setTestResult('Testing...');
    
    try {
      const ws = new WebSocket('ws://localhost:8000/ws');
      
      ws.onopen = () => {
        setTestResult('✅ Direct WebSocket test: SUCCESS');
        ws.close();
      };
      
      ws.onerror = (error) => {
        setTestResult(`❌ Direct WebSocket test: FAILED - ${error}`);
      };
      
      ws.onclose = (event) => {
        if (testResult === 'Testing...') {
          setTestResult(`❌ Direct WebSocket test: CLOSED - Code: ${event.code}, Reason: ${event.reason}`);
        }
      };
      
      // Timeout after 5 seconds
      setTimeout(() => {
        if (testResult === 'Testing...') {
          setTestResult('❌ Direct WebSocket test: TIMEOUT');
          ws.close();
        }
      }, 5000);
      
    } catch (error) {
      setTestResult(`❌ Direct WebSocket test: EXCEPTION - ${error}`);
    }
  };

  return (
    <Box sx={{ position: 'fixed', bottom: 20, right: 20, width: 400, zIndex: 9999 }}>
      {/* Toggle Button */}
      {!isVisible && (
        <Button
          variant="contained"
          size="small"
          onClick={() => setIsVisible(true)}
          sx={{
            mb: 1,
            bgcolor: 'rgba(0,0,0,0.7)',
            color: 'white',
            '&:hover': { bgcolor: 'rgba(0,0,0,0.9)' }
          }}
        >
          🔍 Debug
        </Button>
      )}

      {/* Debug Panel */}
      {isVisible && (
        <Paper sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.9)', color: 'white' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">
              🔍 Connection Debugger
            </Typography>
            <Button
              size="small"
              onClick={() => setIsVisible(false)}
              sx={{ color: 'white', minWidth: 'auto', p: 0.5 }}
            >
              ✕
            </Button>
          </Box>
        
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2">
            Status: <Chip 
              label={isConnected ? 'CONNECTED' : 'DISCONNECTED'} 
              color={isConnected ? 'success' : 'error'}
              size="small"
            />
          </Typography>
        </Box>

        <Button 
          variant="contained" 
          size="small" 
          onClick={testDirectConnection}
          sx={{ mb: 2 }}
        >
          Test Direct Connection
        </Button>

        {testResult && (
          <Alert severity={testResult.includes('✅') ? 'success' : 'error'} sx={{ mb: 2, fontSize: '0.8rem' }}>
            {testResult}
          </Alert>
        )}

        <Typography variant="body2" gutterBottom>
          Recent WebSocket Logs:
        </Typography>
        
        <Box 
          sx={{ 
            maxHeight: 200, 
            overflow: 'auto', 
            bgcolor: 'rgba(255,255,255,0.1)', 
            p: 1, 
            borderRadius: 1,
            fontSize: '0.7rem',
            fontFamily: 'monospace'
          }}
        >
          {logs.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No WebSocket logs yet...
            </Typography>
          ) : (
            logs.map((log, index) => (
              <div key={index} style={{ marginBottom: 2 }}>
                {log}
              </div>
            ))
          )}
        </Box>
        </Paper>
      )}
    </Box>
  );
};

export default ConnectionDebugger;
