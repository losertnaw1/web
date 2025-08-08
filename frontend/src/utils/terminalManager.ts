// Global terminal manager to persist WebSocket connection across page navigation

export interface TerminalState {
  isConnected: boolean;
  isConnecting: boolean;
  output: string[];
  commandHistory: string[];
}

type ConnectionListener = (isConnected: boolean, isConnecting: boolean) => void;
type OutputListener = (output: string[]) => void;

class TerminalManager {
  private wsInstance: WebSocket | null = null;
  private state: TerminalState = {
    isConnected: false,
    isConnecting: false,
    output: [],
    commandHistory: []
  };
  
  private connectionListeners: ConnectionListener[] = [];
  private outputListeners: OutputListener[] = [];
  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor() {
    // Auto-connect when manager is created
    this.connect();
  }

  // Subscribe to connection state changes
  onConnectionChange(listener: ConnectionListener): () => void {
    this.connectionListeners.push(listener);
    // Immediately notify with current state
    listener(this.state.isConnected, this.state.isConnecting);
    
    // Return unsubscribe function
    return () => {
      this.connectionListeners = this.connectionListeners.filter(l => l !== listener);
    };
  }

  // Subscribe to output changes
  onOutputChange(listener: OutputListener): () => void {
    this.outputListeners.push(listener);
    // Immediately notify with current output
    listener(this.state.output);
    
    // Return unsubscribe function
    return () => {
      this.outputListeners = this.outputListeners.filter(l => l !== listener);
    };
  }

  // Get current state
  getState(): TerminalState {
    return { ...this.state };
  }

  // Connect to terminal WebSocket
  connect(): void {
    if (this.wsInstance && (this.wsInstance.readyState === WebSocket.OPEN || this.wsInstance.readyState === WebSocket.CONNECTING)) {
      console.log('Terminal WebSocket already exists, reusing');
      return;
    }

    try {
      this.state.isConnecting = true;
      this.state.isConnected = false;
      this.notifyConnectionListeners();
      
      const wsUrl = `ws://localhost:8000/ws/terminal`;
      console.log('Connecting to terminal WebSocket:', wsUrl);
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log('Terminal WebSocket connected');
        this.state.isConnecting = false;
        this.state.isConnected = true;
        // Clear any previous corrupted output
        this.state.output = [];
        this.addOutput('🔗 Terminal connected');
        this.addOutput('💡 Click here and start typing commands!');
        this.notifyConnectionListeners();
        this.notifyOutputListeners();
      };
      
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === 'output') {
            // Handle terminal output - clean and process the data
            const data = message.data;
            if (data) {
              // Clean the data by removing ANSI escape sequences and control characters
              const cleanData = data
                .replace(/\x1b\[[0-9;]*m/g, '') // Remove ANSI color codes
                .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '') // Remove other ANSI sequences
                .replace(/\r\n/g, '\n') // Normalize line endings
                .replace(/\r/g, '\n'); // Convert remaining \r to \n

              // Add the cleaned data as a single output
              if (cleanData.trim()) {
                this.addOutput(cleanData);
              }
            }
          } else if (message.type === 'error') {
            this.addOutput(`❌ Error: ${message.data}`);
          }
        } catch (e) {
          // Handle raw text output
          const data = event.data;
          if (data && typeof data === 'string') {
            const cleanData = data
              .replace(/\x1b\[[0-9;]*m/g, '')
              .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
              .replace(/\r\n/g, '\n')
              .replace(/\r/g, '\n');

            if (cleanData.trim()) {
              this.addOutput(cleanData);
            }
          }
        }
      };
      
      ws.onclose = (event) => {
        console.log('Terminal WebSocket closed:', event.code, event.reason);
        this.state.isConnecting = false;
        this.state.isConnected = false;
        this.addOutput('❌ Terminal disconnected');
        this.notifyConnectionListeners();

        // Only attempt to reconnect if it wasn't a clean close
        if (event.code !== 1000 && !this.state.isConnecting) {
          this.reconnectTimeout = setTimeout(() => {
            console.log('Attempting to reconnect terminal...');
            this.connect();
          }, 3000);
        }
      };
      
      ws.onerror = (error) => {
        console.error('Terminal WebSocket error:', error);
        this.state.isConnecting = false;
        this.state.isConnected = false;
        this.addOutput(`❌ Connection error: ${error}`);
        this.notifyConnectionListeners();
      };
      
      this.wsInstance = ws;
      
    } catch (error) {
      this.addOutput(`❌ Failed to connect: ${error}`);
      this.state.isConnecting = false;
      this.notifyConnectionListeners();
    }
  }

  // Send input to terminal
  sendInput(input: string): void {
    if (this.wsInstance && this.state.isConnected && this.wsInstance.readyState === WebSocket.OPEN) {
      try {
        this.wsInstance.send(JSON.stringify({
          type: 'input',
          data: input + '\n'
        }));

        // Add to command history - include all inputs, even just spaces
        if (input.length > 0) {
          this.state.commandHistory.push(input);
          // Keep only last 100 commands
          if (this.state.commandHistory.length > 100) {
            this.state.commandHistory = this.state.commandHistory.slice(-100);
          }
        }

        // Add to output display
        this.addOutput(`$ ${input}`);
      } catch (error) {
        console.warn('Failed to send command:', error);
        this.addOutput(`❌ Failed to send command: ${error}`);
      }
    } else {
      this.addOutput(`❌ Terminal not connected. Try reconnecting.`);
      // Try to reconnect
      this.connect();
    }
  }

  // Send resize event
  sendResize(cols: number, rows: number): void {
    if (this.wsInstance && this.state.isConnected && this.wsInstance.readyState === WebSocket.OPEN) {
      try {
        this.wsInstance.send(JSON.stringify({
          type: 'resize',
          cols: cols,
          rows: rows
        }));
      } catch (error) {
        console.warn('Failed to send resize event:', error);
      }
    }
  }

  // Clear terminal output
  clearOutput(): void {
    this.state.output = [];
    this.notifyOutputListeners();
  }

  // Get command history
  getCommandHistory(): string[] {
    return [...this.state.commandHistory];
  }

  // Add output line
  private addOutput(line: string): void {
    this.state.output.push(line);
    // Keep only last 1000 lines
    if (this.state.output.length > 1000) {
      this.state.output = this.state.output.slice(-1000);
    }
    this.notifyOutputListeners();
  }

  // Notify connection listeners
  private notifyConnectionListeners(): void {
    this.connectionListeners.forEach(listener => {
      listener(this.state.isConnected, this.state.isConnecting);
    });
  }

  // Notify output listeners
  private notifyOutputListeners(): void {
    this.outputListeners.forEach(listener => {
      listener([...this.state.output]);
    });
  }

  // Cleanup
  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.wsInstance) {
      this.wsInstance.close(1000, 'Manual disconnect');
      this.wsInstance = null;
    }
    
    this.state.isConnected = false;
    this.state.isConnecting = false;
    this.notifyConnectionListeners();
  }
}

// Global singleton instance
export const terminalManager = new TerminalManager();
