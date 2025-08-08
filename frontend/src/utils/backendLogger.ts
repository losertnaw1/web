/**
 * Backend Logger Utility
 * Sends frontend logs to backend for centralized logging
 */

// const API_BASE_URL = import.meta.env.VITE_BACKEND_HOST || 'http://localhost:8000';
const API_BASE_URL = '';

interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  component?: string;
  data?: any;
}

class BackendLogger {
  private queue: LogEntry[] = [];
  private isProcessing = false;

  private async sendLog(entry: LogEntry): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/frontend-log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          level: entry.level,
          message: entry.data ? `${entry.message} | Data: ${JSON.stringify(entry.data)}` : entry.message,
          component: entry.component || 'unknown',
          timestamp: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        console.warn('Failed to send log to backend:', response.statusText);
      }
    } catch (error) {
      console.warn('Error sending log to backend:', error);
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    
    while (this.queue.length > 0) {
      const entry = this.queue.shift();
      if (entry) {
        await this.sendLog(entry);
      }
    }

    this.isProcessing = false;
  }

  private addToQueue(entry: LogEntry): void {
    this.queue.push(entry);
    this.processQueue(); // Fire and forget
  }

  info(message: string, component?: string, data?: any): void {
    console.log(`[${component || 'FE'}] ${message}`, data || '');
    this.addToQueue({ level: 'info', message, component, data });
  }

  warn(message: string, component?: string, data?: any): void {
    console.warn(`[${component || 'FE'}] ${message}`, data || '');
    this.addToQueue({ level: 'warn', message, component, data });
  }

  error(message: string, component?: string, data?: any): void {
    console.error(`[${component || 'FE'}] ${message}`, data || '');
    this.addToQueue({ level: 'error', message, component, data });
  }

  debug(message: string, component?: string, data?: any): void {
    console.debug(`[${component || 'FE'}] ${message}`, data || '');
    this.addToQueue({ level: 'debug', message, component, data });
  }
}

// Export singleton instance
export const backendLogger = new BackendLogger();

// Export convenience functions
export const logInfo = (message: string, component?: string, data?: any) => 
  backendLogger.info(message, component, data);

export const logWarn = (message: string, component?: string, data?: any) => 
  backendLogger.warn(message, component, data);

export const logError = (message: string, component?: string, data?: any) => 
  backendLogger.error(message, component, data);

export const logDebug = (message: string, component?: string, data?: any) => 
  backendLogger.debug(message, component, data);
