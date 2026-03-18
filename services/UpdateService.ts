import logger from '@/utils/logger';
import * as Notifications from 'expo-notifications';

// expo-updates removed — OTA updates disabled for internal distribution
class UpdateService {
  private isChecking = false;

  async checkForUpdate(automatic = true) {
    logger.debug('OTA updates disabled for internal build', { module: 'UPDATE_SERVICE' });
    return { available: false, reason: 'OTA updates disabled' };
  }

  async fetchUpdate() {
    return { success: false, error: 'OTA updates disabled' };
  }

  async reloadApp() {
    logger.warn('reloadApp called but OTA updates are disabled', { module: 'UPDATE_SERVICE' });
  }
}

export default new UpdateService();
