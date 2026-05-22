/**
 * ServerStatusService
 *
 * Tracks two distinct "the backend isn't usable" conditions and exposes them
 * to the UI (see components/ServerStatusOverlay.tsx):
 *
 *  - maintenance — admin-controlled maintenance mode, reported by the backend.
 *    Shows a full-screen notice.
 *  - serverDown  — the device HAS internet but the backend can't be reached
 *    (outage / deploy). Shows a non-blocking banner; the app stays usable
 *    offline so field operators keep capturing data, which syncs on recovery.
 *
 * A genuine "device is offline" (no connectivity at all) is NOT a serverDown
 * condition — that is the app's normal offline-first mode and is left alone.
 */

import NetInfo from "@react-native-community/netinfo";
import logger from "@/utils/logger";

export interface MaintenanceInfo {
  active: boolean;
  message: string;
  /** ISO timestamp the window ends — drives the countdown. null = open-ended. */
  endAt: string | null;
}

export interface ServerStatusState {
  /** Backend unreachable even though the device has internet. */
  serverDown: boolean;
  /** Device-level connectivity, from NetInfo. */
  deviceOnline: boolean;
  /** Admin-controlled maintenance mode. */
  maintenance: MaintenanceInfo;
}

type Listener = (state: ServerStatusState) => void;

// Consecutive backend failures before declaring the server down — avoids
// flapping the banner on a single transient timeout.
const FAILURE_THRESHOLD = 2;

class ServerStatusService {
  private failures = 0;
  private listeners = new Set<Listener>();
  private state: ServerStatusState = {
    serverDown: false,
    deviceOnline: true,
    maintenance: { active: false, message: "", endAt: null },
  };

  constructor() {
    NetInfo.fetch()
      .then((net) => this.setDeviceOnline(net.isConnected !== false))
      .catch(() => {});
    NetInfo.addEventListener((net) =>
      this.setDeviceOnline(net.isConnected !== false),
    );
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    this.listeners.forEach((fn) => fn(this.state));
  }

  private setDeviceOnline(online: boolean) {
    if (online !== this.state.deviceOnline) {
      this.state = { ...this.state, deviceOnline: online };
      this.emit();
    }
  }

  /** A backend request reached the server and got a response. */
  reportReachable() {
    this.failures = 0;
    if (this.state.serverDown) {
      this.state = { ...this.state, serverDown: false };
      logger.info("Backend reachable again", { module: "SERVER_STATUS" });
      this.emit();
    }
  }

  /** A backend request failed to reach the server (network error / gateway). */
  reportUnreachable() {
    this.failures += 1;
    if (this.failures >= FAILURE_THRESHOLD && !this.state.serverDown) {
      this.state = { ...this.state, serverDown: true };
      logger.warn("Backend unreachable", { module: "SERVER_STATUS" });
      this.emit();
    }
  }

  /** Apply the maintenance flag reported by the backend. */
  setMaintenance(info: MaintenanceInfo | undefined | null) {
    const next: MaintenanceInfo = {
      active: info?.active === true,
      message: String(info?.message ?? ""),
      endAt: info?.endAt ?? null,
    };
    const cur = this.state.maintenance;
    if (
      next.active !== cur.active ||
      next.message !== cur.message ||
      next.endAt !== cur.endAt
    ) {
      this.state = { ...this.state, maintenance: next };
      this.emit();
    }
  }

  get current(): ServerStatusState {
    return this.state;
  }
}

export default new ServerStatusService();
