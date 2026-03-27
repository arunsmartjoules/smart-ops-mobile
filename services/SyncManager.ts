/**
 * SyncManager — Simple Cache Manager
 *
 * No sync engine. Data is cached locally via API fetches.
 * This is a lightweight replacement for the PowerSync-based SyncManager.
 */

import NetInfo from "@react-native-community/netinfo";
import logger from "@/utils/logger";

export type SyncStatus = {
  connected: boolean;
  hasSynced: boolean;
  downloading: boolean;
};

type StatusListener = (status: SyncStatus) => void;

class SyncManager {
  private static instance: SyncManager;
  private listeners: Set<StatusListener> = new Set();
  private _status: SyncStatus = {
    connected: false,
    hasSynced: false,
    downloading: false,
  };
  private netUnsubscribe: (() => void) | null = null;

  private constructor() {}

  static getInstance(): SyncManager {
    if (!SyncManager.instance) {
      SyncManager.instance = new SyncManager();
    }
    return SyncManager.instance;
  }

  get status(): SyncStatus {
    return this._status;
  }

  subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    listener(this._status);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    this.listeners.forEach((l) => l(this._status));
  }

  async initialize(): Promise<void> {
    // Watch network connectivity
    this.netUnsubscribe = NetInfo.addEventListener((state) => {
      const isOnline = state.isConnected === true;
      this._status = {
        ...this._status,
        connected: isOnline,
        hasSynced: this._status.hasSynced || isOnline,
      };
      this.emit();
    });

    // Check current state immediately
    const state = await NetInfo.fetch();
    const isOnline = state.isConnected === true;
    this._status = { connected: isOnline, hasSynced: isOnline, downloading: false };
    this.emit();

    logger.info("SyncManager initialized", { module: "SYNC_MANAGER", online: isOnline });
  }

  async cleanup(): Promise<void> {
    this.netUnsubscribe?.();
    this.netUnsubscribe = null;
    this._status = { connected: false, hasSynced: false, downloading: false };
    this.emit();
  }

  // No-op — kept for API compatibility
  async clearAllData(): Promise<void> {
    logger.info("clearAllData called — no-op in cache mode", { module: "SYNC_MANAGER" });
  }
}

export const syncManager = SyncManager.getInstance();
