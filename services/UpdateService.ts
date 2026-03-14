import * as Updates from 'expo-updates';
import logger from '@/utils/logger';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

class UpdateService {
  private isChecking = false;

  /**
   * Check for updates and notify user if found
   */
  async checkForUpdate(automatic = true) {
    if (__DEV__) {
      logger.debug('Skipping update check in development mode', { module: 'UPDATE_SERVICE' });
      return { available: false, reason: 'Development mode' };
    }

    if (this.isChecking) return { available: false, reason: 'Already checking' };

    this.isChecking = true;
    try {
      logger.debug('Checking for updates...', { module: 'UPDATE_SERVICE' });
      const update = await Updates.checkForUpdateAsync();

      if (update.isAvailable) {
        logger.info('Update available!', { module: 'UPDATE_SERVICE' });
        
        if (automatic) {
          // Trigger a local notification
          await this.sendUpdateNotification();
        }
        
        return { available: true, manifest: update.manifest };
      }

      logger.debug('No updates available', { module: 'UPDATE_SERVICE' });
      return { available: false };
    } catch (error: any) {
      logger.error('Failed to check for updates', { 
        module: 'UPDATE_SERVICE', 
        error: error.message 
      });
      return { available: false, error: error.message };
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Fetch and install the update
   */
  async fetchUpdate() {
    try {
      logger.info('Fetching update...', { module: 'UPDATE_SERVICE' });
      await Updates.fetchUpdateAsync();
      logger.info('Update fetched, ready to reload', { module: 'UPDATE_SERVICE' });
      return { success: true };
    } catch (error: any) {
      logger.error('Failed to fetch update', { 
        module: 'UPDATE_SERVICE', 
        error: error.message 
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Reload the app to apply the update
   */
  async reloadApp() {
    try {
      await Updates.reloadAsync();
    } catch (error: any) {
      logger.error('Failed to reload app', { 
        module: 'UPDATE_SERVICE', 
        error: error.message 
      });
    }
  }

  /**
   * Send a local push notification about the update
   */
  private async sendUpdateNotification() {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') return;

      await Notifications.scheduleNotificationAsync({
        content: {
          title: "New Update Available! 🚀",
          body: "A new version of SmartOps is available. Click here or go to Settings to install.",
          data: { type: 'APP_UPDATE' },
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null, // deliver immediately
      });
    } catch (error) {
      logger.warn('Failed to send update notification', { module: 'UPDATE_SERVICE', error });
    }
  }
}

export default new UpdateService();
