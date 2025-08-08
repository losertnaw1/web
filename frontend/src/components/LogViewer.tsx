
import React from 'react';
import { Box, Typography } from '@mui/material';

interface LogViewerProps {
  logs: Array<{
    timestamp: number;
    level: number;
    name: string;
    msg: string;
  }>;
}

const LogViewer: React.FC<LogViewerProps> = ({ logs }) => {
  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      {logs.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No logs available
        </Typography>
      ) : (
        logs.slice(-10).map((log, index) => (
          <Typography key={index} variant="caption" display="block" sx={{ fontFamily: 'monospace' }}>
            [{new Date(log.timestamp * 1000).toLocaleTimeString()}] {log.name}: {log.msg}
          </Typography>
        ))
      )}
    </Box>
  );
};

export default LogViewer;
