
import React from 'react';
import { Box, Typography, Chip } from '@mui/material';
import { SystemData } from '../hooks/useWebSocket_simple';

interface SystemStatusProps {
  systemData: SystemData;
  isConnected: boolean;
}

const SystemStatus: React.FC<SystemStatusProps> = ({ systemData, isConnected }) => {
  return (
    <Box>
      <Typography variant="body2" gutterBottom>
        System Status
      </Typography>
      <Chip 
        label={isConnected ? "Online" : "Offline"} 
        color={isConnected ? "success" : "error"} 
        size="small" 
      />
      {systemData.node_status && (
        <Typography variant="caption" display="block" sx={{ mt: 1 }}>
          Active Nodes: {Object.keys(systemData.node_status).length}
        </Typography>
      )}
    </Box>
  );
};

export default SystemStatus;
