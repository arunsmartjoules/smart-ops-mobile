/**
 * Common types used throughout the application
 */

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Paginated API response
 */
export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

/**
 * Application error
 */
export interface AppError {
  message: string;
  code?: string;
  status?: number;
  details?: Record<string, unknown>;
}

/**
 * Network state
 */
export interface NetworkState {
  isConnected: boolean;
  isInternetReachable: boolean | null;
}

/**
 * Sync status for offline operations
 */
export interface SyncStatus {
  pendingCount: number;
  lastSyncTime: Date | null;
  isSyncing: boolean;
}

/**
 * Generic ID type for database entities
 */
export type EntityId = string; // UUID format
