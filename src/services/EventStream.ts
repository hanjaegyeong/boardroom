export type SSEEventHandler = (event: any) => void;

export class EventStream {
  private eventSource: EventSource | null = null;
  private handlers: Map<string, SSEEventHandler[]> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  connect() {
    if (this.eventSource) {
      this.eventSource.close();
    }

    this.eventSource = new EventSource('/api/stream');

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.emit(data.type, data);
      } catch (e) {
        console.error('Failed to parse SSE event:', e);
      }
    };

    this.eventSource.onerror = () => {
      this.eventSource?.close();
      this.eventSource = null;

      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
        setTimeout(() => this.connect(), delay);
      }
    };

    this.eventSource.onopen = () => {
      this.reconnectAttempts = 0;
    };
  }

  on(eventType: string, handler: SSEEventHandler) {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler);
  }

  off(eventType: string, handler: SSEEventHandler) {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx > -1) handlers.splice(idx, 1);
    }
  }

  private emit(eventType: string, data: any) {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      for (const handler of handlers) {
        handler(data);
      }
    }

    // Also emit a wildcard
    const wildcardHandlers = this.handlers.get('*');
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        handler(data);
      }
    }
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}
