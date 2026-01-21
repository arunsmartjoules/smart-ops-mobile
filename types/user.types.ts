/**
 * User-related types
 */

import type { EntityId } from "./common.types";

/**
 * User role
 */
export type UserRole = "Admin" | "Supervisor" | "Technician" | "Client";

/**
 * User entity
 */
export interface User {
  id: EntityId;
  user_id: string;
  email: string;
  name: string;
  role: UserRole;
  employee_code?: string;
  designation?: string;
  site_id?: string;
  site_name?: string;
  phone?: string;
  is_active: boolean;
  is_superadmin?: boolean;
  created_at: string;
  updated_at?: string;
}

/**
 * Auth user (from context)
 */
export interface AuthUser {
  id: string;
  user_id: string;
  email: string;
  name: string;
  role: UserRole;
  employee_code?: string;
  site_id?: string;
  is_admin?: boolean;
}

/**
 * Login credentials
 */
export interface LoginCredentials {
  email: string;
  password: string;
}

/**
 * Auth response
 */
export interface AuthResponse {
  success: boolean;
  token?: string;
  user?: AuthUser;
  error?: string;
}
