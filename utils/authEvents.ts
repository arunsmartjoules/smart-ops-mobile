export type AuthUnauthorizedReason =
  | "unauthorized"
  | "token_missing"
  | "session_revoked"
  // The refresh token itself is dead (missing, or the server rejected it with a
  // 401 — revoked/expired/logged-out). The session cannot be recovered, so the
  // app must re-authenticate. Distinct from transient refresh failures (network
  // / 5xx), which do NOT emit this.
  | "session_expired";

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
