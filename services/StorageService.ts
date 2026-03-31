import { storage } from "./firebase";
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import * as FileSystem from "expo-file-system/legacy";
import logger from "@/utils/logger";

export const StorageService = {
  /**
   * Upload a file to Firebase Storage.
   * Returns the public download URL or null on failure.
   */
  async uploadFile(
    bucketName: string, // Kept for compatibility, Firebase uses the initialized bucket.
    filePath: string,
    fileUri: string,
  ): Promise<string | null> {
    try {
      logger.info(`Uploading file to Firebase Storage: ${filePath}`, {
        module: "STORAGE_SERVICE",
      });

      // Read file as base64
      const base64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: "base64",
      });

      // Create storage reference
      const storageRef = ref(storage, filePath);

      // Upload base64 string
      await uploadString(storageRef, base64, "base64", {
        contentType: "image/jpeg",
      });

      // Get Download URL
      const publicUrl = await getDownloadURL(storageRef);

      return publicUrl;
    } catch (error: any) {
      logger.error("Firebase Storage upload failed", {
        module: "STORAGE_SERVICE",
        error: error.message,
      });
      return null;
    }
  },

  /**
   * Upload from a persistent local file URI, returning the public URL.
   * Alias for uploadFile — used by AttachmentQueueService during background sync.
   */
  async uploadFromLocalUri(
    bucketName: string,
    remotePath: string,
    localUri: string,
  ): Promise<string | null> {
    return this.uploadFile(bucketName, remotePath, localUri);
  },
};

export default StorageService;
