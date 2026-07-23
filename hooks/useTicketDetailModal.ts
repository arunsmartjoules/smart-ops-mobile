/**
 * useTicketDetailModal
 *
 * Encapsulates the in-place ticket detail + status-update flow used by the
 * dashboard (open a ticket, edit status/remarks/area/category/temps, submit via
 * TicketsService with optimistic + offline handling, WhatsApp notify, attachment
 * upload). Returns props ready to spread into <TicketDetailModal /> plus an
 * `openTicket(ticketNo)` action, so any screen gets the same behaviour without
 * duplicating the logic.
 */

import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import TicketsService, { type Ticket } from "@/services/TicketsService";
import { WhatsAppService } from "@/services/WhatsAppService";
import {
  isTempMandatoryCategory,
  isBreakdownTypeCategory,
} from "@/components/TicketDetailStatusUpdate";
import { type SelectOption } from "@/components/SearchableSelect";
import logger from "@/utils/logger";

const getDefaultUpdateStatus = (ticket: Ticket) => {
  if (ticket.status === "Open") return "Inprogress";
  if (ticket.status === "Inprogress") return "Resolved";
  return ticket.status;
};

const getInitialUpdateRemarks = (ticket: Ticket, status: string) =>
  status === ticket.status ? ticket.internal_remarks || "" : "";

interface HookUser {
  id?: string;
  user_id?: string;
  full_name?: string;
  name?: string;
}

export function useTicketDetailModal(params: {
  siteCode: string;
  user: HookUser | null | undefined;
  /** Called after a successful update so the host can refresh its view. */
  onUpdated?: () => void;
}) {
  const { siteCode, user, onUpdated } = params;

  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isDetailVisible, setIsDetailVisible] = useState(false);
  const [updateStatus, setUpdateStatus] = useState("");
  const [updateRemarks, setUpdateRemarks] = useState("");
  const [updateArea, setUpdateArea] = useState("");
  const [updateCategory, setUpdateCategory] = useState("");
  const [updateBreakdownType, setUpdateBreakdownType] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [areaOptions, setAreaOptions] = useState<SelectOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<SelectOption[]>([]);
  const [areasLoading, setAreasLoading] = useState(false);
  const [beforeTemp, setBeforeTemp] = useState("");
  const [afterTemp, setAfterTemp] = useState("");
  const [attachmentUri, setAttachmentUri] = useState("");

  const loadAreasAndCategories = useCallback(async () => {
    if (!siteCode) return;
    setAreasLoading(true);
    try {
      const [cachedAreas, cachedCategories] = await Promise.all([
        TicketsService.getAssets(siteCode),
        TicketsService.getComplaintCategories(),
      ]);
      if (cachedAreas?.data && cachedAreas.data.length > 0) {
        setAreaOptions(
          cachedAreas.data.map((asset: any) => ({
            value: asset.asset_name || asset.asset_id,
            label: asset.asset_name,
            description:
              `${asset.asset_type || ""} ${asset.location ? `- ${asset.location}` : ""}`.trim(),
          })),
        );
      }
      if (cachedCategories?.data && cachedCategories.data.length > 0) {
        setCategoryOptions(
          cachedCategories.data.map((cat: any) => ({
            value: cat.category,
            label: cat.category,
            description: cat.description || "",
          })),
        );
      }
    } catch (error) {
      logger.warn("useTicketDetailModal: load areas/categories failed", {
        error,
      });
    } finally {
      setAreasLoading(false);
    }
  }, [siteCode]);

  useEffect(() => {
    if (siteCode) loadAreasAndCategories();
  }, [siteCode, loadAreasAndCategories]);

  const openTicket = useCallback(
    async (ticketNo: string) => {
      if (!siteCode || !ticketNo) return;
      try {
        const res = await TicketsService.getTickets(siteCode, {
          ticket_no: ticketNo,
        });
        if (res.success && res.data && res.data.length > 0) {
          const ticket = res.data[0];
          const defaultStatus = getDefaultUpdateStatus(ticket);
          setSelectedTicket(ticket);
          setUpdateStatus(defaultStatus);
          setUpdateRemarks(getInitialUpdateRemarks(ticket, defaultStatus));
          setUpdateArea(ticket.area_asset || "");
          setUpdateCategory(ticket.category || "");
          setUpdateBreakdownType(ticket.breakdown_type || "");
          setBeforeTemp(
            ticket.before_temp != null &&
              !Number.isNaN(Number(ticket.before_temp))
              ? String(ticket.before_temp)
              : "",
          );
          setAfterTemp(
            ticket.after_temp != null &&
              !Number.isNaN(Number(ticket.after_temp))
              ? String(ticket.after_temp)
              : "",
          );
          setAttachmentUri("");
          setIsDetailVisible(true);
        } else {
          Alert.alert(
            "Couldn't open ticket",
            "This ticket couldn't be loaded. Please try again from the Tickets screen.",
          );
        }
      } catch (e) {
        logger.warn("useTicketDetailModal: openTicket failed", { error: e });
        Alert.alert("Error", "Couldn't open this ticket.");
      }
    },
    [siteCode],
  );

  const closeModal = useCallback(() => setIsDetailVisible(false), []);

  const handleUpdateStatus = async () => {
    if (!selectedTicket || !(user?.id || user?.user_id)) return;

    const needsRemarks = ["Hold", "Cancelled", "Waiting", "Resolved"].includes(
      updateStatus,
    );
    const needsAreaAndCategory =
      updateStatus === "Inprogress" || updateStatus === "Resolved";
    if (needsRemarks && !updateRemarks.trim()) {
      Alert.alert("Required", "Please provide remarks for this status update.");
      return;
    }
    if (needsAreaAndCategory && !updateArea.trim()) {
      Alert.alert("Required", "Please select an area before updating the ticket.");
      return;
    }
    if (needsAreaAndCategory && !updateCategory.trim()) {
      Alert.alert("Required", "Please select a category before updating the ticket.");
      return;
    }
    if (
      needsAreaAndCategory &&
      isBreakdownTypeCategory(
        updateCategory.trim() || selectedTicket.category || "",
      ) &&
      !updateBreakdownType.trim()
    ) {
      Alert.alert(
        "Required",
        "Please select Electrical or Mechanical for this breakdown.",
      );
      return;
    }
    if (needsAreaAndCategory) {
      const effectiveCategory = (
        updateCategory.trim() ||
        selectedTicket.category ||
        ""
      ).trim();
      if (isTempMandatoryCategory(effectiveCategory)) {
        const isOpen = selectedTicket.status === "Open";
        const isInprogress = selectedTicket.status === "Inprogress";
        const bt = beforeTemp.trim();
        const at = afterTemp.trim();
        if (isOpen && !bt) {
          Alert.alert("Required", "Please enter before temperature for this category.");
          return;
        }
        if (isInprogress && (!bt || !at)) {
          Alert.alert(
            "Required",
            "Please enter before and after temperature for this category.",
          );
          return;
        }
        if (bt && Number.isNaN(parseFloat(bt))) {
          Alert.alert("Required", "Before temperature must be a valid number.");
          return;
        }
        if (isInprogress && at && Number.isNaN(parseFloat(at))) {
          Alert.alert("Required", "After temperature must be a valid number.");
          return;
        }
      }
    }

    const effectivePayloadCategory = updateCategory || selectedTicket.category;
    const payload: any = {
      status: updateStatus,
      internal_remarks: updateRemarks,
      area_asset: updateArea || selectedTicket.area_asset,
      category: effectivePayloadCategory,
    };
    if (needsAreaAndCategory) {
      payload.breakdown_type = isBreakdownTypeCategory(
        effectivePayloadCategory || "",
      )
        ? updateBreakdownType || null
        : null;
    }
    if (beforeTemp.trim() !== "") payload.before_temp = parseFloat(beforeTemp);
    if (afterTemp.trim() !== "") payload.after_temp = parseFloat(afterTemp);
    if (updateStatus === "Inprogress" || updateStatus === "Cancelled") {
      payload.assigned_to = user?.full_name || user?.name || "";
    }

    const nowIso = new Date().toISOString();
    if (
      (updateStatus === "Inprogress" || updateStatus === "Resolved") &&
      !selectedTicket.responded_at
    ) {
      payload.responded_at = nowIso;
    }
    if (updateStatus === "Resolved" && !selectedTicket.resolved_at) {
      payload.resolved_at = nowIso;
    }

    setIsUpdating(true);
    try {
      const optimisticTicket = {
        ...selectedTicket,
        ...payload,
        responded_at:
          updateStatus === "Inprogress" || updateStatus === "Resolved"
            ? selectedTicket.responded_at || nowIso
            : selectedTicket.responded_at,
        resolved_at:
          updateStatus === "Resolved"
            ? selectedTicket.resolved_at || nowIso
            : selectedTicket.resolved_at,
      };
      const res = await TicketsService.updateTicket(
        selectedTicket.id || selectedTicket.ticket_no,
        payload,
      );

      const apiConfirmed = res.success === true;
      const queuedOffline =
        !apiConfirmed && (res.isNetworkError === true || res.queued === true);

      if (apiConfirmed) {
        WhatsAppService.sendStatusUpdate(
          optimisticTicket,
          updateStatus,
          updateRemarks,
        ).catch((e) => logger.warn("Failed WhatsApp notification", { error: e }));
      }

      if (attachmentUri && (apiConfirmed || queuedOffline)) {
        const uploadRes = await TicketsService.uploadImage(
          attachmentUri,
          selectedTicket.id || selectedTicket.ticket_no,
        );
        if (uploadRes.success && uploadRes.url) {
          await TicketsService.addLineItem(
            selectedTicket.id || selectedTicket.ticket_no,
            { image_url: uploadRes.url },
          ).catch(() => {});
        }
      }

      if (apiConfirmed) {
        Alert.alert("Success", "Ticket updated successfully");
      } else if (queuedOffline) {
        Alert.alert(
          "Saved",
          "Update saved. It will sync automatically when your connection is stable.",
        );
      } else {
        Alert.alert("Error", res.error || "Failed to update ticket");
        return;
      }

      setSelectedTicket(optimisticTicket);
      setUpdateRemarks("");
      setBeforeTemp("");
      setAfterTemp("");
      setAttachmentUri("");
      setIsDetailVisible(false);
      onUpdated?.();
    } catch {
      Alert.alert(
        "Saved",
        "Update saved. It will sync automatically when your connection is stable.",
      );
    } finally {
      setIsUpdating(false);
    }
  };

  return {
    openTicket,
    ticketModalProps: {
      visible: isDetailVisible,
      onClose: closeModal,
      ticket: selectedTicket,
      updateStatus,
      setUpdateStatus,
      updateRemarks,
      setUpdateRemarks,
      updateArea,
      setUpdateArea,
      updateCategory,
      setUpdateCategory,
      updateBreakdownType,
      setUpdateBreakdownType,
      isUpdating,
      handleUpdateStatus,
      areaOptions,
      categoryOptions,
      areasLoading,
      beforeTemp,
      setBeforeTemp,
      afterTemp,
      setAfterTemp,
      attachmentUri,
      setAttachmentUri,
    },
  };
}
