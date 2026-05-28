import * as Updates from 'expo-updates';
import logger from '@/utils/logger';

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'downloading' }
  | { status: 'ready'; restart: () => void }
  | { status: 'error'; message: string }
  | { status: 'up-to-date' };

/** Outcome of a manual update check — lets the caller show an accurate message. */
export type UpdateCheckResult =
  | { status: 'available' }
  | { status: 'up-to-date' }
  | { status: 'unsupported' } // OTA disabled — dev build / Expo Go
  | { status: 'error'; error: string };

type UpdateListener = (state: UpdateState) => void;

class UpdateService {
  private isChecking = false;
  private updateAvailable = false;
  private listeners: Set<UpdateListener> = new Set();
  private currentState: UpdateState = { status: 'idle' };

  subscribe(listener: UpdateListener) {
    this.listeners.add(listener);
    listener(this.currentState); // Emit current state to new subscriber
    return () => this.listeners.delete(listener);
  }

  private emit(state: UpdateState) {
    this.currentState = state;
    this.listeners.forEach(fn => fn(state));
  }

  get isUpdateAvailable() {
    return this.updateAvailable;
  }

  /**
   * Check for an OTA update.
   *
   * `automatic` (launch): downloads silently and surfaces "Restart" via the
   * banner. Manual checks (profile screen) emit nothing to the banner — the
   * caller drives its own UI from the returned UpdateCheckResult.
   */
  async checkForUpdate(automatic = true): Promise<UpdateCheckResult> {
    if (this.isChecking) return { status: 'up-to-date' };
    this.isChecking = true;

    try {
      if (!Updates.isEnabled) {
        logger.debug('expo-updates not enabled (dev build)', { module: 'UPDATE_SERVICE' });
        return { status: 'unsupported' };
      }

      const result = await Updates.checkForUpdateAsync();
      logger.info('Update check result', { module: 'UPDATE_SERVICE', available: result.isAvailable });

      if (result.isAvailable) {
        this.updateAvailable = true;
        if (automatic) {
          logger.info('Background downloading update...', { module: 'UPDATE_SERVICE' });
          await Updates.fetchUpdateAsync();
          logger.info('Background update downloaded.', { module: 'UPDATE_SERVICE' });
          this.emit({ status: 'ready', restart: () => this.reloadApp() });
        }
        return { status: 'available' };
      }

      this.updateAvailable = false;
      return { status: 'up-to-date' };
    } catch (e: any) {
      logger.warn('Update check failed', { module: 'UPDATE_SERVICE', error: e?.message });
      return { status: 'error', error: e?.message || 'Unknown error' };
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Check for an OTA update and, if one exists, download it — emitting
   * progress the whole way (`checking` → `downloading` → `ready`). Used by the
   * force-update screen, which needs to know whether an OTA can fix the block
   * before falling back to the app store.
   */
  async checkAndPrepare(): Promise<void> {
    if (this.isChecking) return;
    this.isChecking = true;
    try {
      if (!Updates.isEnabled) {
        logger.debug('expo-updates not enabled (dev build)', { module: 'UPDATE_SERVICE' });
        // Surface a result so the caller's UI isn't left hanging.
        this.emit({ status: 'up-to-date' });
        setTimeout(() => this.emit({ status: 'idle' }), 1500);
        return;
      }
      this.emit({ status: 'checking' });
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) {
        this.emit({ status: 'downloading' });
        await Updates.fetchUpdateAsync();
        this.updateAvailable = true;
        this.emit({ status: 'ready', restart: () => this.reloadApp() });
      } else {
        this.emit({ status: 'up-to-date' });
        setTimeout(() => this.emit({ status: 'idle' }), 1500);
      }
    } catch (e: any) {
      logger.warn('checkAndPrepare failed', { module: 'UPDATE_SERVICE', error: e.message });
      this.emit({ status: 'error', message: e.message });
    } finally {
      this.isChecking = false;
    }
  }

  async fetchUpdate() {
    try {
      if (!Updates.isEnabled) return { success: false, error: 'Updates not enabled' };
      this.emit({ status: 'downloading' });
      await Updates.fetchUpdateAsync();
      this.updateAvailable = true;
      this.emit({ status: 'ready', restart: () => this.reloadApp() });
      return { success: true };
    } catch (e: any) {
      const message = e?.message || 'Download failed';
      logger.warn('Update download failed', {
        module: 'UPDATE_SERVICE',
        error: message,
      });
      this.emit({ status: 'error', message });
      return { success: false, error: message };
    }
  }

  async reloadApp() {
    try {
      await Updates.reloadAsync();
    } catch (e: any) {
      logger.warn('reloadApp failed', { module: 'UPDATE_SERVICE', error: e.message });
    }
  }

  dismiss() {
    this.emit({ status: 'idle' });
  }
}

export default new UpdateService();
