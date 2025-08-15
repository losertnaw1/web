/**
 * Configuration file for the frontend application
 * This file contains all configurable settings that may change between environments
 */

// Environment detection
const isDevelopment = import.meta.env.NODE_ENV === 'development';
const isProduction = import.meta.env.NODE_ENV === 'production';

// Default configuration
const defaultConfig = {
  // Backend server configuration
  backend: {
    // Default to localhost for development, can be overridden by environment variables
    host: import.meta.env.VITE_BACKEND_HOST || 'localhost',
    port: import.meta.env.VITE_BACKEND_PORT,
    protocol: import.meta.env.VITE_BACKEND_PROTOCOL || 'http',
  },
  
  // WebSocket configuration
  websocket: {
    // Will be constructed from backend config
    autoReconnect: true,
    reconnectInterval: 5000, // 5 seconds
    maxReconnectAttempts: 10,
  },
  
  // Map configuration
  map: {
    defaultZoom: 1.0,
    maxZoom: 5.0,
    minZoom: 0.1,
    centerOnRobot: true,
  },
  
  // Robot configuration
  robot: {
    // Default robot settings
    maxLinearVelocity: 1.0, // m/s
    maxAngularVelocity: 1.0, // rad/s
    safetyTimeout: 5000, // ms
  },
  
  // UI configuration
  ui: {
    theme: 'light', // 'light' | 'dark'
    language: 'en', // 'en' | 'vi'
    updateInterval: 100, // ms for real-time updates
  },
  
  // Development/Debug settings
  debug: {
    enabled: isDevelopment,
    logLevel: isDevelopment ? 'debug' : 'debug',
    showPerformanceMetrics: isDevelopment,
  }
};

// Environment-specific overrides
const environmentConfigs = {
  development: {
    backend: {
      host: 'localhost',
      port: '8000',
    },
    debug: {
      enabled: true,
      logLevel: 'debug',
    }
  },
  
  production: {
    backend: {
      // In production, try to detect the current host
      host: window.location.hostname,
      port: '8000',
    },
    debug: {
      enabled: false,
      logLevel: 'warn',
    }
  },
  
  // Custom environment for remote development
  remote: {
    backend: {
      host: '192.168.0.220', // Current remote server
      port: '8000',
    },
    debug: {
      enabled: true,
      logLevel: 'debug',
    }
  }
};

// Determine which environment config to use
const getEnvironmentConfig = () => {
  // Check for custom environment variable
  const customEnv = import.meta.env.VITE_APP_ENV;
  if (customEnv && environmentConfigs[customEnv]) {
    return environmentConfigs[customEnv];
  }
  
  // Check for remote development (when accessing from different IP)
  if (isDevelopment && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return environmentConfigs.remote;
  }
  
  // Default to NODE_ENV
  return environmentConfigs[import.meta.env.NODE_ENV] || environmentConfigs.development;
};

// Merge configurations
const envConfig = getEnvironmentConfig();
const config = {
  ...defaultConfig,
  ...envConfig,
  backend: {
    ...defaultConfig.backend,
    ...envConfig.backend,
  },
  websocket: {
    ...defaultConfig.websocket,
    ...envConfig.websocket,
  },
  map: {
    ...defaultConfig.map,
    ...envConfig.map,
  },
  robot: {
    ...defaultConfig.robot,
    ...envConfig.robot,
  },
  ui: {
    ...defaultConfig.ui,
    ...envConfig.ui,
  },
  debug: {
    ...defaultConfig.debug,
    ...envConfig.debug,
  }
};

// Computed properties
config.backend.baseUrl = `${config.backend.protocol}://${config.backend.host}:${config.backend.port}`;
config.websocket.url = `ws://${config.backend.host}:${config.backend.port}/ws`;

// Export the final configuration
export default config;

// Export individual sections for convenience
export const { backend, websocket, map, robot, ui, debug } = config;

// Helper functions
export const getApiUrl = (endpoint: string): string => {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${config.backend.baseUrl}${cleanEndpoint}`;
};

export const getWebSocketUrl = (): string => {
  return config.websocket.url;
};

// Log configuration in development
if (config.debug.enabled) {
  console.log('🔧 Application Configuration:', config);
  console.log('🌐 Backend URL:', config.backend.baseUrl);
  console.log('🔌 WebSocket URL:', config.websocket.url);
}
