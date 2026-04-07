export type AuthUnauthorizedReason =
  | "unauthorized"
  | "token_missing"
  | "session_revoked";

type AuthEventCallback = (reason: AuthUnauthorizedReason) => void;

class AuthEventEmitter {
  private listeners: AuthEventCallback[] = [];

  subscribe(callback: AuthEventCallback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  emitUnauthorized(reason: AuthUnauthorizedReason = "unauthorized") {
    this.listeners.forEach((callback) => callback(reason));
  }
}

export const authEvents = new AuthEventEmitter();
