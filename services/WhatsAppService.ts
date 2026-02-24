import { authService } from "./AuthService";
import { API_BASE_URL } from "../constants/api";
import { fetchWithTimeout } from "../utils/apiHelper";
import logger from "../utils/logger";
import { Ticket } from "./TicketsService";

const BACKEND_URL = API_BASE_URL;

const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  let token = await authService.getValidToken();

  const getHeaders = (t: string | null) => ({
    "Content-Type": "application/json",
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
    ...options.headers,
  });

  try {
    let response = await fetchWithTimeout(`${BACKEND_URL}${endpoint}`, {
      ...options,
      headers: getHeaders(token),
    });

    if (response.status === 401) {
      const newToken = await authService.refreshToken();
      if (newToken) {
        token = newToken;
        response = await fetchWithTimeout(`${BACKEND_URL}${endpoint}`, {
          ...options,
          headers: getHeaders(token),
        });
      }
    }

    const result = await response.json();
    return { ok: response.ok, ...result };
  } catch (error: any) {
    logger.error(`Network Error on ${endpoint}`, { error: error.message });
    return { ok: false, error: error.message };
  }
};

export const WhatsAppService = {
  /**
   * Automatically fetches template for a status, replaces variables, and sends whatsapp message.
   */
  async sendStatusUpdate(ticket: Ticket, newStatus: string, remarks?: string) {
    try {
      // 1. Fetch Template for newStatus
      const templateRes = await apiFetch(
        `/api/whatsapp/templates/status/${newStatus}`,
      );
      if (!templateRes.ok || !templateRes.data) {
        logger.debug(`No WhatsApp template found for status: ${newStatus}`);
        return;
      }

      const template = templateRes.data;
      let messageContent = template.template_content;

      // 2. Replace placeholders (e.g. {{ticket_no}}, {{title}}, {{status}}, {{category}}, {{remarks}})
      messageContent = messageContent.replace(
        /\{\{\s*ticket_no\s*\}\}/g,
        ticket.ticket_no || "",
      );
      messageContent = messageContent.replace(
        /\{\{\s*title\s*\}\}/g,
        ticket.title || "",
      );
      messageContent = messageContent.replace(
        /\{\{\s*status\s*\}\}/g,
        newStatus || "",
      );
      messageContent = messageContent.replace(
        /\{\{\s*site_code\s*\}\}/g,
        ticket.site_code || "",
      );
      messageContent = messageContent.replace(
        /\{\{\s*site_name\s*\}\}/g,
        ticket.site_name || ticket.site_code || "",
      );
      messageContent = messageContent.replace(
        /\{\{\s*location\s*\}\}/g,
        ticket.location || "",
      );
      messageContent = messageContent.replace(
        /\{\{\s*category\s*\}\}/g,
        ticket.category || "",
      );
      messageContent = messageContent.replace(
        /\{\{\s*remarks\s*\}\}/g,
        remarks || "N/A",
      );
      messageContent = messageContent.replace(
        /\{\{\s*assigned_to\s*\}\}/g,
        ticket.assigned_to || "Unassigned",
      );
      messageContent = messageContent.replace(
        /\{\{\s*priority\s*\}\}/g,
        ticket.priority || "Normal",
      );
      messageContent = messageContent.replace(
        /\{\{\s*internal_remarks\s*\}\}/g,
        ticket.internal_remarks || "N/A",
      );
      messageContent = messageContent.replace(
        /\{\{\s*created_by\s*\}\}/g,
        ticket.created_user || "N/A",
      );

      // 3. Send Message
      const sendRes = await apiFetch(`/api/whatsapp/send`, {
        method: "POST",
        body: JSON.stringify({
          site_code: ticket.site_code,
          message: messageContent,
          ticket_no: ticket.ticket_no,
          template_key: newStatus,
        }),
      });

      if (sendRes.ok) {
        logger.debug(
          `Successfully sent WhatsApp notification for ticket ${ticket.ticket_no}`,
        );
      } else {
        logger.warn(`Failed to send WhatsApp notification`, {
          error: sendRes.error,
        });
      }
    } catch (error) {
      logger.error(
        `Failed to process WhatsApp notification for ${ticket.ticket_no}`,
        { error },
      );
    }
  },
};
