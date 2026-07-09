import appLogger from "@/utils/logger";
import { apiFetch } from "@/utils/apiHelper";
import { API_URL } from "@/constants/api";

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  mov: "video/quicktime",
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

interface PresignResult {
  uploadUrl: string;
  publicUrl: string;
}

/**
 * Ask the backend to mint a presigned S3 PUT URL for `key`. Auth + token
 * refresh are handled by apiFetch. Returns null on any failure (offline,
 * rejected key, server error) so the caller can queue/retry.
 */
async function requestPresignedUpload(
  key: string,
  contentType: string,
): Promise<PresignResult | null> {
  try {
    const res = await apiFetch(`${API_URL}/uploads/presign`, {
      method: "POST",
      body: JSON.stringify({ key, contentType }),
    });

    if (!res.ok) {
      appLogger.error("Presign request failed", {
        module: "STORAGE_SERVICE",
        status: res.status,
        key,
      });
      return null;
    }

    const json = await res.json();
    const data = json?.data;
    if (!data?.uploadUrl || !data?.publicUrl) {
      appLogger.error("Presign response missing url fields", {
        module: "STORAGE_SERVICE",
        key,
      });
      return null;
    }
    return { uploadUrl: data.uploadUrl, publicUrl: data.publicUrl };
  } catch (error: any) {
    appLogger.error("Presign request threw", {
      module: "STORAGE_SERVICE",
      error: error?.message,
      key,
    });
    return null;
  }
}

export const StorageService = {
  /**
   * Upload a local file to S3 via a backend-minted presigned PUT URL.
   * Returns the permanent public URL or null on failure.
   *
   * Flow: read the local file into a blob → request a presigned URL from the
   * backend (authenticated) → PUT the bytes directly to S3 → return the public
   * URL. The device never holds AWS credentials; access is entirely mediated
   * by the backend. Works with the offline AttachmentQueueService, which only
   * invokes this once connectivity is available.
   */
  async uploadFile(
    _bucketName: string, // Retained for call-site compatibility; unused with S3.
    filePath: string,
    fileUri: string,
  ): Promise<string | null> {
    let blob: any = null;
    try {
      appLogger.info(`Uploading file to S3: ${filePath}`, {
        module: "STORAGE_SERVICE",
      });

      // 1. Create a blob from the local URI using XHR. React Native's JS
      // environment doesn't support the Blob constructor from ArrayBuffer
      // reliably; fetching the local file as a "blob" response is the standard
      // workaround.
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

      const contentType = getContentType(filePath || fileUri);

      // 2. Get a presigned PUT URL from the backend.
      const presigned = await requestPresignedUpload(filePath, contentType);
      if (!presigned) return null;

      // 3. Upload the blob directly to S3. The Content-Type header MUST match
      // the one the presigned URL was signed with, or S3 rejects the PUT.
      const putRes = await fetch(presigned.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: blob,
      });

      if (!putRes.ok) {
        appLogger.error("S3 PUT failed", {
          module: "STORAGE_SERVICE",
          status: putRes.status,
          filePath,
        });
        return null;
      }

      // 4. Return the permanent public URL.
      return presigned.publicUrl;
    } catch (error: any) {
      appLogger.error("S3 upload failed", {
        module: "STORAGE_SERVICE",
        error: error.message,
      });
      return null;
    } finally {
      // 5. Release the blob to prevent memory leaks.
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
