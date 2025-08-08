
import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import { RobotData } from '../hooks/useWebSocket_simple';

interface NavigationPanelProps {
  onCommand: (command: string, params?: any) => void;
  robotData: RobotData;
  isConnected: boolean;
}

const NavigationPanel: React.FC<NavigationPanelProps> = ({ onCommand, robotData, isConnected }) => {
  return (
    <Box>
      <Typography variant="body2" gutterBottom>
        Navigation controls will be implemented here
      </Typography>
      <Button 
        variant="contained" 
        onClick={() => onCommand('navigate', { x: 1, y: 1 })}
        disabled={!isConnected}
      >
        Go to (1,1)
      </Button>
    </Box>
  );
};

export default NavigationPanel;
