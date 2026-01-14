type AuthEventCallback = () => void;

class AuthEventEmitter {
  private listeners: AuthEventCallback[] = [];

  subscribe(callback: AuthEventCallback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  emitUnauthorized() {
    this.listeners.forEach((callback) => callback());
  }
}

export const authEvents = new AuthEventEmitter();
