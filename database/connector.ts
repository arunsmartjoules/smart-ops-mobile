/**
 * PowerSync Backend Connector
 *
 * Handles two responsibilities:
 *  1. fetchCredentials() — obtains a short-lived JWT from the backend so
 *     PowerSync can authenticate the client against the self-hosted service.
 *  2. uploadData() — processes the local CRUD queue and routes each mutation
 *     to the correct REST API endpoint on the existing backend.
 */

import {
  AbstractPowerSyncDatabase,
  CrudEntry,
  PowerSyncBackendConnector,
  UpdateType,
} from "@powersync/react-native";
import { supabase } from "@/services/supabase";
import { API_BASE_URL } from "@/constants/api";
import { fetchWithTimeout } from "@/utils/apiHelper";
import logger from "@/utils/logger";

const POWERSYNC_URL =
  process.env.EXPO_PUBLIC_POWERSYNC_URL || "http://localhost:8080";

async function getAuthToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export class SmartOpsConnector implements PowerSyncBackendConnector {
  /**
   * Called by PowerSync when it needs credentials to connect to the sync service.
   * We request a purpose-built short-lived JWT from /api/auth/powersync-token.
   */
  async fetchCredentials() {
    const token = await getAuthToken();
    if (!token) {
      throw new Error("No auth session — cannot fetch PowerSync credentials");
    }

    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/auth/powersync-token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch PowerSync token: ${response.status}`,
      );
    }

    const result = await response.json();
    const data = result.data;

    return {
      endpoint: data.powersync_url || POWERSYNC_URL,
      token: data.token,
      expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
    };
  }

  /**
   * Called by PowerSync whenever there are local writes to upload.
   * Processes the CRUD queue entry-by-entry, routing to existing REST endpoints.
   */
  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    const token = await getAuthToken();
    if (!token) {
      throw new Error("No auth session — cannot upload data");
    }

    try {
      for (const entry of transaction.crud) {
        await this.processEntry(entry, token);
      }
      await transaction.complete();
    } catch (error: any) {
      logger.error("uploadData failed — transaction will be retried", {
        module: "POWERSYNC_CONNECTOR",
        error: error.message,
      });
      throw error;
    }
  }

  private async processEntry(
    entry: CrudEntry,
    token: string,
  ): Promise<void> {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };

    const { table, opData, opType, id } = entry;

    switch (table) {
      // ── Complaints / Tickets ────────────────────────────────────────────
      case "tickets": {
        if (opType === UpdateType.PUT) {
          await fetchWithTimeout(
            `${API_BASE_URL}/api/complaints/${id}`,
            { method: "PUT", headers, body: JSON.stringify(opData) },
          );
        } else if (opType === UpdateType.PATCH) {
          await fetchWithTimeout(
            `${API_BASE_URL}/api/complaints/${id}`,
            { method: "PUT", headers, body: JSON.stringify(opData) },
          );
        } else if (opType === UpdateType.DELETE) {
          await fetchWithTimeout(
            `${API_BASE_URL}/api/complaints/${id}`,
            { method: "DELETE", headers },
          );
        }
        break;
      }

      // ── Ticket Updates (local-only queue → push as complaint update) ────
      case "ticket_updates": {
        if (opType === UpdateType.PUT && opData) {
          const updateData = opData.update_data
            ? JSON.parse(opData.update_data as string)
            : opData;
          await fetchWithTimeout(
            `${API_BASE_URL}/api/complaints/${opData.ticket_id}`,
            { method: "PUT", headers, body: JSON.stringify(updateData) },
          );
        }
        break;
      }

      // ── Site Logs ───────────────────────────────────────────────────────
      case "site_logs": {
        if (opType === UpdateType.PUT) {
          const isNew = !opData?._server_synced;
          const endpoint = isNew
            ? `${API_BASE_URL}/api/site-logs`
            : `${API_BASE_URL}/api/site-logs/${id}`;
          await fetchWithTimeout(endpoint, {
            method: isNew ? "POST" : "PUT",
            headers,
            body: JSON.stringify({
              site_code: opData?.site_code,
              executor_id: opData?.executor_id,
              log_name: opData?.log_name,
              task_name: opData?.task_name,
              temperature: opData?.temperature,
              rh: opData?.rh,
              tds: opData?.tds,
              ph: opData?.ph,
              hardness: opData?.hardness,
              chemical_dosing: opData?.chemical_dosing,
              remarks: opData?.remarks,
              signature: opData?.signature,
              entry_time: opData?.entry_time,
              end_time: opData?.end_time,
              status: opData?.status || "Completed",
            }),
          });
        } else if (opType === UpdateType.DELETE) {
          await fetchWithTimeout(
            `${API_BASE_URL}/api/site-logs/${id}`,
            { method: "DELETE", headers },
          );
        }
        break;
      }

      // ── Chiller Readings ────────────────────────────────────────────────
      case "chiller_readings": {
        if (opType === UpdateType.PUT) {
          const isNew = !opData?._server_synced;
          const endpoint = isNew
            ? `${API_BASE_URL}/api/chiller-readings`
            : `${API_BASE_URL}/api/chiller-readings/${id}`;
          await fetchWithTimeout(endpoint, {
            method: isNew ? "POST" : "PUT",
            headers,
            body: JSON.stringify({
              log_id: opData?.log_id,
              site_code: opData?.site_code,
              executor_id: opData?.executor_id,
              chiller_id: opData?.chiller_id,
              equipment_id: opData?.equipment_id,
              asset_name: opData?.asset_name,
              asset_type: opData?.asset_type,
              date_shift: opData?.date_shift,
              reading_time: opData?.reading_time,
              start_datetime: opData?.start_datetime,
              end_datetime: opData?.end_datetime,
              condenser_inlet_temp: opData?.condenser_inlet_temp,
              condenser_outlet_temp: opData?.condenser_outlet_temp,
              evaporator_inlet_temp: opData?.evaporator_inlet_temp,
              evaporator_outlet_temp: opData?.evaporator_outlet_temp,
              compressor_suction_temp: opData?.compressor_suction_temp,
              motor_temperature: opData?.motor_temperature,
              saturated_condenser_temp: opData?.saturated_condenser_temp,
              saturated_suction_temp: opData?.saturated_suction_temp,
              set_point_celsius: opData?.set_point_celsius,
              discharge_pressure: opData?.discharge_pressure,
              main_suction_pressure: opData?.main_suction_pressure,
              oil_pressure: opData?.oil_pressure,
              oil_pressure_difference: opData?.oil_pressure_difference,
              condenser_inlet_pressure: opData?.condenser_inlet_pressure,
              condenser_outlet_pressure: opData?.condenser_outlet_pressure,
              evaporator_inlet_pressure: opData?.evaporator_inlet_pressure,
              evaporator_outlet_pressure: opData?.evaporator_outlet_pressure,
              compressor_load_percentage: opData?.compressor_load_percentage,
              inline_btu_meter: opData?.inline_btu_meter,
              remarks: opData?.remarks,
              signature_text: opData?.signature_text,
              status: opData?.status,
            }),
          });
        } else if (opType === UpdateType.DELETE) {
          await fetchWithTimeout(
            `${API_BASE_URL}/api/chiller-readings/${id}`,
            { method: "DELETE", headers },
          );
        }
        break;
      }

      // ── PM Instances ────────────────────────────────────────────────────
      case "pm_instances": {
        if (opType === UpdateType.PUT || opType === UpdateType.PATCH) {
          await fetchWithTimeout(
            `${API_BASE_URL}/api/pm-instances/${id}`,
            { method: "PUT", headers, body: JSON.stringify(opData) },
          );
        }
        break;
      }

      // ── PM Responses ────────────────────────────────────────────────────
      case "pm_responses": {
        if (opType === UpdateType.PUT) {
          await fetchWithTimeout(`${API_BASE_URL}/api/pm-response`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              id,
              instance_id: opData?.instance_id,
              checklist_item_id: opData?.checklist_item_id,
              response_value: opData?.response_value,
              readings: opData?.readings,
              remarks: opData?.remarks,
              image_url: opData?.image_url,
            }),
          });
        }
        break;
      }

      // ── Attendance Logs ─────────────────────────────────────────────────
      case "attendance_logs": {
        if (opType === UpdateType.PUT || opType === UpdateType.PATCH) {
          // Check-in or check-out
          const isCheckOut = opData?.check_out_time;
          
          if (isCheckOut) {
            // Check-out
            await fetchWithTimeout(
              `${API_BASE_URL}/api/attendance/checkout`,
              {
                method: "POST",
                headers,
                body: JSON.stringify({
                  latitude: opData?.check_out_latitude,
                  longitude: opData?.check_out_longitude,
                  address: opData?.check_out_address,
                  remarks: opData?.remarks,
                }),
              }
            );
          } else {
            // Check-in
            await fetchWithTimeout(
              `${API_BASE_URL}/api/attendance/checkin`,
              {
                method: "POST",
                headers,
                body: JSON.stringify({
                  user_id: opData?.user_id,
                  site_code: opData?.site_code,
                  latitude: opData?.check_in_latitude,
                  longitude: opData?.check_in_longitude,
                  address: opData?.check_in_address,
                  shift_id: opData?.shift_id,
                }),
              }
            );
          }
        }
        break;
      }

      default:
        logger.warn(`uploadData: unhandled table "${table}"`, {
          module: "POWERSYNC_CONNECTOR",
        });
    }
  }
}
