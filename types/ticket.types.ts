/**
 * Ticket-related types
 */

import type { TicketStatus } from "@/constants/statuses";
import type { EntityId } from "./common.types";

/**
 * Complaint/Ticket entity
 */
export interface Ticket {
  id: EntityId;
  ticket_id: string;
  ticket_no: string;
  title: string;
  description?: string;
  status: TicketStatus;
  category?: string;
  location?: string;
  site_code: string;
  site_name?: string;
  assigned_to?: string;
  created_by?: string;
  customer_inputs?: string;
  internal_remarks?: string;
  resolution_message?: string;
  created_at: string;
  updated_at: string;
  resolved_at?: string;
}

/**
 * Ticket creation payload
 */
export interface CreateTicketPayload {
  title: string;
  description?: string;
  category: string;
  location: string;
  site_code: string;
  customer_inputs?: string;
}

/**
 * Ticket update payload
 */
export interface UpdateTicketPayload {
  status?: TicketStatus;
  title?: string;
  description?: string;
  resolution_message?: string;
  internal_remarks?: string;
  remarks?: string; // For status transitions
}

/**
 * Ticket filter options
 */
export interface TicketFilters {
  status?: TicketStatus | TicketStatus[];
  site_code?: string;
  category?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
}

/**
 * Ticket stats summary
 */
export interface TicketStats {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  hold: number;
  cancelled: number;
}
