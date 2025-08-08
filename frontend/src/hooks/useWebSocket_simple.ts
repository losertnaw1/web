import { useState, useEffect, useRef, useCallback } from 'react';
import { logWarn, logDebug, logInfo, logError } from '../utils/backendLogger';

export interface RobotData {
  pose?: {
    position: {
      x: number;
      y: number;
      z: number;
    };
    orientation: {
      x: number;
      y: number;
      z: number;
      w: number;
    };
    covariance?: number[];
    timestamp: number;
    frame_id?: string;
  };
  odom?: {
    position: {
      x: number;
      y: number;
      z: number;
    };
    orientation: {
      x: number;
      y: number;
      z: number;
      w: number;
    };
    linear_velocity: {
      x: number;
      y: number;
      z: number;
    };
    angular_velocity: {
      x: number;
      y: number;
      z: number;
    };
    timestamp: number;
  };
  battery?: {
    voltage: number;
    current: number;
    charge: number;
    capacity: number;
    percentage: number;
    power_supply_status: number;
    timestamp: number;
  };
}

export interface SensorData {
  scan?: {
    angle_min: number;
    angle_max: number;
    angle_increment: number;
    range_min: number;
    range_max: number;
    ranges: (number | null)[];
    timestamp: number;
  };
  ultrasonic?: {
    range: number;
    min_range: number;
    max_range: number;
    field_of_view: number;
    timestamp: number;
  };
  map?: {
    width: number;
    height: number;
    resolution: number;
    origin: {
      x: number;
      y: number;
      theta: number;  // Changed from orientation to theta to match bridge
    };
    data: number[];
    timestamp: number;
  };
}

export interface SystemData {
  // System resource usage
  cpu_usage?: number;
  memory_usage?: number;
  disk_usage?: number;
  cpu_cores?: number;
  total_memory?: number;
  available_memory?: number;
  uptime?: string;
  load_average?: string;

  // Network interfaces
  network_interfaces?: Record<string, {
    ip: string;
    status: string;
    bytes_sent: number;
    bytes_recv: number;
  }>;

  // ROS2 nodes
  ros_nodes?: Array<{
    name: string;
    status: string;
    pid?: number;
    cpu_usage: number;
    memory_usage: number;
  }>;

  // Diagnostics
  diagnostics?: {
    status: Array<{
      name: string;
      level: number;
      message: string;
      hardware_id: string;
      values: Record<string, string>;
    }>;
    timestamp: number;
  };

  // Logs
  logs?: Array<{
    timestamp: number;
    level: number;
    name: string;
    msg: string;
    file: string;
    function: string;
    line: number;
  }>;

  // Node status
  node_status?: Record<string, {
    status: string;
    timestamp: number;
  }>;
}

export interface UseWebSocketReturn {
  socket: WebSocket | null;
  isConnected: boolean;
  robotData: RobotData;
  sensorData: SensorData;
  systemData: SystemData;
  sendCommand: (command: string, params?: any) => void;
  subscribe: (topics: string[]) => void;
  unsubscribe: (topics: string[]) => void;
}

export const useWebSocket = (url: string): UseWebSocketReturn => {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [robotData, setRobotData] = useState<RobotData>({});
  const [sensorData, setSensorData] = useState<SensorData>({});
  const [systemData, setSystemData] = useState<SystemData>({});

  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 10;

  const connect = useCallback(() => {
    try {
      // Convert HTTP URL to WebSocket URL
      const wsUrl = url.replace('http://', 'ws://').replace('https://', 'wss://');
      //console.log(`🔄 Attempting WebSocket connection to: ${wsUrl}`);
      const newSocket = new WebSocket(wsUrl);

      newSocket.onopen = () => {
        //console.log('✅ WebSocket connected successfully!');
        setIsConnected(true);
        reconnectAttempts.current = 0;
        
        // Subscribe to all data types
        const subscribeMessage = {
          type: 'subscribe',
          topics: ['pose', 'odom', 'scan', 'battery', 'map', 'diagnostics', 'log', 'ultrasonic', 'node_status', 'network_status']
        };
        newSocket.send(JSON.stringify(subscribeMessage));
      };

      newSocket.onclose = (event) => {
        console.log(`❌ WebSocket disconnected - Code: ${event.code}, Reason: ${event.reason}, Clean: ${event.wasClean}`);
        setIsConnected(false);

        // Attempt to reconnect
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = 2000 * (reconnectAttempts.current + 1); // Fix: start from attempt 1, not 0
          reconnectTimeoutRef.current = window.setTimeout(() => {
            reconnectAttempts.current++;
            console.log(`🔄 Reconnection attempt ${reconnectAttempts.current}/${maxReconnectAttempts} (delay: ${delay}ms)`);
            connect();
          }, delay);
        } else {
          console.log(`❌ Max reconnection attempts (${maxReconnectAttempts}) reached. Giving up.`);
        }
      };

      newSocket.onerror = (error) => {
        console.error('❌ WebSocket error occurred:', error);
        console.error('❌ WebSocket readyState:', newSocket.readyState);
        console.error('❌ WebSocket URL:', wsUrl);
        setIsConnected(false);
      };

      newSocket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          //console.log('📡 Received from ROS2 backend:', message);

          const { type, data_type, data } = message;

          // Handle different message types from ROS2 backend
          // Backend sends type: 'data' for all real-time data
          if (type === 'data') {
            //console.log(`📊 Processing ${data_type} data:`, data);

            // Categorize data types
            if (['pose', 'odom', 'battery'].includes(data_type)) {
              // Robot data
              switch (data_type) {
                case 'pose':
                  console.log('🤖 [WebSocket] Received pose data:', data);
                  setRobotData(prev => ({ ...prev, pose: data }));
                  break;
                case 'odom':
                  console.log('🚗 [WebSocket] Received odom data:', data);
                  setRobotData(prev => ({ ...prev, odom: data }));
                  break;
                case 'battery':
                  setRobotData(prev => ({ ...prev, battery: data }));
                  break;
              }
            } else if (['scan', 'ultrasonic', 'map'].includes(data_type)) {
              // Sensor data
              switch (data_type) {
                case 'scan':
                  setSensorData(prev => ({ ...prev, scan: data }));
                  break;
                case 'ultrasonic':
                  setSensorData(prev => ({ ...prev, ultrasonic: data }));
                  break;
                case 'map':
                  console.log('🗺️ [WS] Received map data:', data);
                  setSensorData(prev => ({ ...prev, map: data }));
                  break;
              }
            } else if (['diagnostics', 'log', 'node_status', 'network_status'].includes(data_type)) {
              // System data
              switch (data_type) {
                case 'diagnostics':
                  setSystemData(prev => ({
                    ...prev,
                    diagnostics: data,
                    cpu_usage: data.cpu_usage,
                    memory_usage: data.memory_usage,
                    disk_usage: data.disk_usage,
                    uptime: data.uptime,
                    load_average: data.load_average
                  }));
                  break;
                case 'log':
                  setSystemData(prev => ({
                    ...prev,
                    logs: [...(prev.logs || []), data].slice(-1000)
                  }));
                  break;
                case 'node_status':
                  setSystemData(prev => ({
                    ...prev,
                    node_status: data,
                    ros_nodes: data.ros_nodes
                  }));
                  break;
                case 'network_status':
                  setSystemData(prev => ({
                    ...prev,
                    network_interfaces: data.network_interfaces
                  }));
                  break;
              }
            } else {
              console.log('Unknown data type:', data_type, data);
            }
          } else if (type === 'connection') {
            console.log('✅ [WS] Connection message:', message);
          } else if (type === 'command_result') {
            const timestamp = new Date().toISOString();
            console.log(`✅ [WS] ${timestamp} - Command result:`, message);
            if (message.command === 'navigate') {
              console.log(`🎯 [WS] Navigation command result - Status: ${message.status}`);
            }
          } else if (type === 'error') {
            const timestamp = new Date().toISOString();
            console.error(`❌ [WS] ${timestamp} - Backend error:`, message);
          } else {
            console.log('Unknown message type:', type, message);
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
        }
      };

      setSocket(newSocket);

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
    }
  }, [url]);

  useEffect(() => {
    connect();

    // Listen for custom map update events from App.tsx
    const handleMapUpdate = (event: CustomEvent) => {
      console.log('🗺️ [WS Hook] Received map update event:', event.detail);
      if (event.detail && event.detail.map) {
        setSensorData(prev => ({ ...prev, map: event.detail.map }));
      }
    };

    window.addEventListener('mapDataUpdate', handleMapUpdate as EventListener);

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socket) {
        socket.close();
      }
      window.removeEventListener('mapDataUpdate', handleMapUpdate as EventListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connect]); // socket is intentionally excluded to prevent infinite reconnection loops

  const sendCommand = useCallback((command: string, params: any = {}) => {
    const timestamp = new Date().toISOString();
    logInfo(`🌐 [WS] ${timestamp} - Sending command: ${command} : ${JSON.stringify(params)}`, 'useWebSocket', { command, params });

    if (socket && isConnected) {
      const message = {
        type: 'command',
        command,
        params
      };
      logInfo(`🌐 [WS] WebSocket message: ${message.type} - ${message.command} - ${JSON.stringify(message.params)}`, 'useWebSocket', message);

      try {
        socket.send(JSON.stringify(message));
        logInfo(`✅ [WS] Command sent successfully via WebSocket`);
      } catch (error) {
        console.error(`❌ [WS] Error sending WebSocket message:`, error);
      }
    } else {
      console.warn(`⚠️ [WS] Cannot send command: WebSocket not connected (socket: ${!!socket}, connected: ${isConnected})`);
    }
  }, [socket, isConnected]);

  const subscribe = useCallback((topics: string[]) => {
    if (socket && isConnected) {
      const message = {
        type: 'subscribe',
        topics
      };
      socket.send(JSON.stringify(message));
    }
  }, [socket, isConnected]);

  const unsubscribe = useCallback((topics: string[]) => {
    if (socket && isConnected) {
      const message = {
        type: 'unsubscribe',
        topics
      };
      socket.send(JSON.stringify(message));
    }
  }, [socket, isConnected]);

  return {
    socket,
    isConnected,
    robotData,
    sensorData,
    systemData,
    sendCommand,
    subscribe,
    unsubscribe
  };
};
