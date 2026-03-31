import { storage } from "./firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
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
    let blob: any = null;
    try {
      logger.info(`Uploading file to Firebase Storage: ${filePath}`, {
        module: "STORAGE_SERVICE",
      });

      // 1. Create a blob from the local URI using XHR
      // React Native's JS environment doesn't support the Blob constructor from ArrayBuffer reliably.
      // Fetching the local file as a "blob" response is the standard workaround for Firebase.
      blob = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = function () {
          resolve(xhr.response);
        };
        xhr.onerror = function (e) {
          logger.error("Network request failed for local file access", {
            module: "STORAGE_SERVICE",
            error: e,
          });
          reject(new TypeError("Network request failed"));
        };
        xhr.responseType = "blob";
        xhr.open("GET", fileUri, true);
        xhr.send(null);
      });

      // 2. Create storage reference
      const storageRef = ref(storage, filePath);

      // 3. Upload the blob directly using uploadBytes
      await uploadBytes(storageRef, blob, {
        contentType: "image/jpeg",
      });

      // 4. Get Download URL
      const publicUrl = await getDownloadURL(storageRef);

      return publicUrl;
    } catch (error: any) {
      logger.error("Firebase Storage upload failed", {
        module: "STORAGE_SERVICE",
        error: error.message,
      });
      return null;
    } finally {
      // 5. Release the blob to prevent memory leaks
      if (blob && typeof blob.close === "function") {
        blob.close();
      }
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
