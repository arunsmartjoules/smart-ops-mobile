import { storage } from "./firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import appLogger from "@/utils/logger";

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain",
  csv: "text/csv",
};

const getContentType = (filePathOrUri: string): string => {
  const noQuery = filePathOrUri.split("?")[0] || filePathOrUri;
  const ext = (noQuery.split(".").pop() || "").toLowerCase();
  return MIME_BY_EXTENSION[ext] || "application/octet-stream";
};

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
      appLogger.info(`Uploading file to Firebase Storage: ${filePath}`, {
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
          appLogger.error("Network request failed for local file access", {
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
      const contentType = getContentType(filePath || fileUri);

      // 3. Upload the blob directly using uploadBytes
      await uploadBytes(storageRef, blob, {
        contentType,
      });

      // 4. Get Download URL
      const publicUrl = await getDownloadURL(storageRef);

      return publicUrl;
    } catch (error: any) {
      appLogger.error("Firebase Storage upload failed", {
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
