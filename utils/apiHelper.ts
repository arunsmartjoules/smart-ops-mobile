import logger from "./logger";

/**
 * Enhanced fetch with timeout support
 */
export const fetchWithTimeout = async (
  url: string,
  options: RequestInit = {},
  timeout = 30000,
): Promise<Response> => {
  const controller = new AbortController();
  const id = setTimeout(() => {
    controller.abort();
    logger.warn(`Request timeout: ${url}`, { module: "API_HELPER" });
  }, timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error: any) {
    if (error.name === "AbortError") {
      throw new Error(`Request timed out after ${timeout}ms`);
    }
    throw error;
  } finally {
    clearTimeout(id);
  }
};

/**
 * Exponential backoff delay
 */
export const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retry logic for sync operations
 */
export async function syncWithRetry(
  syncFn: () => Promise<Response>,
  maxRetries = 3,
): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await syncFn();
      if (response.ok) return response;

      if (response.status >= 500) {
        // Server error - retry with backoff
        const waitTime = Math.pow(2, attempt) * 1000;
        logger.debug(
          `Server error ${response.status}, retrying in ${waitTime}ms`,
          {
            module: "API_HELPER",
            attempt: attempt + 1,
          },
        );
        await delay(waitTime);
        continue;
      }
      return response; // Client error - don't retry
    } catch (error: any) {
      if (attempt === maxRetries - 1) throw error;
      const waitTime = Math.pow(2, attempt) * 1000;
      logger.debug(`Network error, retrying in ${waitTime}ms`, {
        module: "API_HELPER",
        attempt: attempt + 1,
        error: error.message,
      });
      await delay(waitTime);
    }
  }
  throw new Error("Max retries exceeded");
}
