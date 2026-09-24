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
 * Outcome of an upload attempt. `permanent` marks failures a retry can't fix
 * (the local file is gone/unreadable, or the server refused the upload
 * itself); everything else — timeouts, dropped connections, 5xx — is a weak
 * or missing network and must stay retryable indefinitely.
 */
export interface UploadResult {
  url: string | null;
  permanent: boolean;
  error?: string;
}

/**
 * Cap on the S3 PUT. fetch() has no timeout of its own, so on a weak link a
 * stalled upload could hang for minutes and hold up the whole sync queue
 * behind it. Generous enough for a full-size photo on a slow 2G/3G uplink.
 */
const UPLOAD_TIMEOUT_MS = 120_000;

/** 4xx statuses that are about auth/throttling/timing, not the request. */
const RETRYABLE_4XX = new Set([401, 403, 408, 429]);

/**
 * Ask the backend to mint a presigned S3 PUT URL for `key`. Auth + token
 * refresh are handled by apiFetch. Returns null on any failure (offline,
 * rejected key, server error) so the caller can queue/retry.
 */
async function requestPresignedUpload(
  key: string,
  contentType: string,
): Promise<PresignResult | { status: number } | null> {
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
      return { status: res.status };
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
    return (await this.uploadFileDetailed(filePath, fileUri)).url;
  },

  /**
   * uploadFile, but reporting whether a failure is worth retrying — the
   * offline attachment queue uses this so a patch of bad network never
   * exhausts a photo's retries (see UploadResult).
   */
  async uploadFileDetailed(
    filePath: string,
    fileUri: string,
  ): Promise<UploadResult> {
    let blob: any = null;
    try {
      appLogger.info(`Uploading file to S3: ${filePath}`, {
        module: "STORAGE_SERVICE",
      });

      // 1. Create a blob from the local URI using XHR. React Native's JS
      // environment doesn't support the Blob constructor from ArrayBuffer
      // reliably; fetching the local file as a "blob" response is the standard
      // workaround.
      try {
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
      } catch {
        // Reading a local file doesn't touch the network — if it fails the
        // file is missing or unreadable and no retry will bring it back.
        return { url: null, permanent: true, error: "Local file unreadable" };
      }

      const contentType = getContentType(filePath || fileUri);

      // 2. Get a presigned PUT URL from the backend.
      const presigned = await requestPresignedUpload(filePath, contentType);
      if (!presigned) {
        return { url: null, permanent: false, error: "Presign request failed" };
      }
      if ("status" in presigned) {
        const permanent =
          presigned.status >= 400 &&
          presigned.status < 500 &&
          !RETRYABLE_4XX.has(presigned.status);
        return {
          url: null,
          permanent,
          error: `Presign HTTP ${presigned.status}`,
        };
      }

      // 3. Upload the blob directly to S3. The Content-Type header MUST match
      // the one the presigned URL was signed with, or S3 rejects the PUT.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
      let putRes: Response;
      try {
        putRes = await fetch(presigned.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": contentType },
          body: blob,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!putRes.ok) {
        appLogger.error("S3 PUT failed", {
          module: "STORAGE_SERVICE",
          status: putRes.status,
          filePath,
        });
        // 403 is usually the presigned URL expiring mid-way through a slow
        // upload — the next attempt mints a fresh one.
        const permanent =
          putRes.status >= 400 &&
          putRes.status < 500 &&
          !RETRYABLE_4XX.has(putRes.status);
        return { url: null, permanent, error: `S3 PUT HTTP ${putRes.status}` };
      }

      // 4. Return the permanent public URL.
      return { url: presigned.publicUrl, permanent: false };
    } catch (error: any) {
      appLogger.error("S3 upload failed", {
        module: "STORAGE_SERVICE",
        error: error.message,
      });
      const aborted = error?.name === "AbortError";
      return {
        url: null,
        permanent: false,
        error: aborted ? "Upload timed out" : error?.message,
      };
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
