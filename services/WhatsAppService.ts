import { authEvents } from "../utils/authEvents";
import { API_BASE_URL } from "../constants/api";
import { apiFetch as centralApiFetch } from "../utils/apiHelper";
import logger from "../utils/logger";
import { Ticket } from "./TicketsService";

const BACKEND_URL = API_BASE_URL;

const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  try {
    let response = await centralApiFetch(`${BACKEND_URL}${endpoint}`, options);

    if (response.status === 401) {
      // Silent sign-out: avoid intrusive alerts for token issues
      authEvents.emitUnauthorized();
      return { ok: false, error: "No token provided" };
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
      logger.debug(`[WhatsApp] Starting sendStatusUpdate for ticket ${ticket.ticket_no}, status: ${newStatus}`);
      
      // 1. Fetch Template for newStatus
      const templateRes = await apiFetch(
        `/api/whatsapp/templates/status/${newStatus}`,
      );
      
      logger.debug(`[WhatsApp] Template fetch result:`, { 
        ok: templateRes.ok, 
        hasData: !!templateRes.data,
        error: templateRes.error 
      });
      
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

      logger.debug(`[WhatsApp] Sending message for site: ${ticket.site_code}`);

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

      logger.debug(`[WhatsApp] Send result:`, { 
        ok: sendRes.ok, 
        error: sendRes.error,
        data: sendRes.data 
      });

      if (sendRes.ok) {
        logger.debug(
          `Successfully sent WhatsApp notification for ticket ${ticket.ticket_no}`,
        );
      } else {
        logger.error(`Failed to send WhatsApp notification`, {
          ticket_no: ticket.ticket_no,
          site_code: ticket.site_code,
          error: sendRes.error,
          response: sendRes
        });
      }
    } catch (error: any) {
      logger.error(
        `Failed to process WhatsApp notification for ${ticket.ticket_no}`,
        { 
          error: error.message || error,
          stack: error.stack,
          ticket_no: ticket.ticket_no,
          site_code: ticket.site_code
        },
      );
    }
  },

  /**
   * Sends a WhatsApp message with an image for ticket activity.
   */
  async sendActivityImage(
    site_code: string,
    ticket_no: string,
    image_url: string,
  ) {
    try {
      const res = await apiFetch(`/api/whatsapp/send-image`, {
        method: "POST",
        body: JSON.stringify({
          site_code,
          ticket_no,
          image_url,
          caption: `*Ticket ${ticket_no} Activity (Image)*`,
          template_key: "activity_update",
        }),
      });

      if (res.ok) {
        logger.debug(
          `Successfully sent WhatsApp image for ticket ${ticket_no}`,
        );
      } else {
        logger.warn(`Failed to send WhatsApp image`, { error: res.error });
      }
    } catch (error) {
      logger.error(`Failed to send WhatsApp image for ${ticket_no}`, {
        error,
      });
    }
  },
};
