/**
 * Attendance Sync Utilities - PowerSync Edition
 * 
 * Handles offline queueing for attendance check-in/check-out.
 * With PowerSync, we store these in a local queue table that syncs automatically.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { v4 as uuidv4 } from "uuid";
import logger from "./logger";

const OFFLINE_CHECKIN_QUEUE_KEY = "@offline_checkin_queue";
const OFFLINE_CHECKOUT_QUEUE_KEY = "@offline_checkout_queue";

interface OfflineCheckIn {
  id: string;
  userId: string;
  siteCode: string;
  timestamp: string;
  latitude?: number;
  longitude?: number;
}

interface OfflineCheckOut {
  id: string;
  attendanceId: string;
  timestamp: string;
  remarks?: string;
  latitude?: number;
  longitude?: number;
}

/**
 * Queue an offline check-in
 * Returns the local ID for optimistic UI updates
 */
export async function queueOfflineCheckIn(
  userId: string,
  siteCode: string,
  timestamp: string,
  latitude?: number,
  longitude?: number
): Promise<string> {
  try {
    const id = uuidv4();
    const checkIn: OfflineCheckIn = {
      id,
      userId,
      siteCode,
      timestamp,
      latitude,
      longitude,
    };

    // Get existing queue
    const queueStr = await AsyncStorage.getItem(OFFLINE_CHECKIN_QUEUE_KEY);
    const queue: OfflineCheckIn[] = queueStr ? JSON.parse(queueStr) : [];

    // Add to queue
    queue.push(checkIn);
    await AsyncStorage.setItem(OFFLINE_CHECKIN_QUEUE_KEY, JSON.stringify(queue));

    logger.info("Queued offline check-in", {
      module: "SYNC_ATTENDANCE_STORAGE",
      id,
      userId,
      siteCode,
    });

    return id;
  } catch (error) {
    logger.error("Error queueing offline check-in", { error });
    throw error;
  }
}

/**
 * Queue an offline check-out
 */
export async function queueOfflineCheckOut(
  id: string,
  attendanceId: string,
  timestamp: string,
  remarks?: string,
  latitude?: number,
  longitude?: number
): Promise<void> {
  try {
    const checkOut: OfflineCheckOut = {
      id,
      attendanceId,
      timestamp,
      remarks,
      latitude,
      longitude,
    };

    // Get existing queue
    const queueStr = await AsyncStorage.getItem(OFFLINE_CHECKOUT_QUEUE_KEY);
    const queue: OfflineCheckOut[] = queueStr ? JSON.parse(queueStr) : [];

    // Add to queue
    queue.push(checkOut);
    await AsyncStorage.setItem(OFFLINE_CHECKOUT_QUEUE_KEY, JSON.stringify(queue));

    logger.info("Queued offline check-out", {
      module: "SYNC_ATTENDANCE_STORAGE",
      attendanceId,
    });
  } catch (error) {
    logger.error("Error queueing offline check-out", { error });
    throw error;
  }
}

/**
 * Get pending check-ins
 */
export async function getPendingCheckIns(): Promise<OfflineCheckIn[]> {
  try {
    const queueStr = await AsyncStorage.getItem(OFFLINE_CHECKIN_QUEUE_KEY);
    return queueStr ? JSON.parse(queueStr) : [];
  } catch (error) {
    logger.error("Error getting pending check-ins", { error });
    return [];
  }
}

/**
 * Get pending check-outs
 */
export async function getPendingCheckOuts(): Promise<OfflineCheckOut[]> {
  try {
    const queueStr = await AsyncStorage.getItem(OFFLINE_CHECKOUT_QUEUE_KEY);
    return queueStr ? JSON.parse(queueStr) : [];
  } catch (error) {
    logger.error("Error getting pending check-outs", { error });
    return [];
  }
}

/**
 * Clear a check-in from the queue after successful sync
 */
export async function clearCheckIn(id: string): Promise<void> {
  try {
    const queueStr = await AsyncStorage.getItem(OFFLINE_CHECKIN_QUEUE_KEY);
    if (!queueStr) return;

    const queue: OfflineCheckIn[] = JSON.parse(queueStr);
    const filtered = queue.filter((item) => item.id !== id);
    await AsyncStorage.setItem(OFFLINE_CHECKIN_QUEUE_KEY, JSON.stringify(filtered));

    logger.info("Cleared check-in from queue", { id });
  } catch (error) {
    logger.error("Error clearing check-in", { error });
  }
}

/**
 * Clear a check-out from the queue after successful sync
 */
export async function clearCheckOut(id: string): Promise<void> {
  try {
    const queueStr = await AsyncStorage.getItem(OFFLINE_CHECKOUT_QUEUE_KEY);
    if (!queueStr) return;

    const queue: OfflineCheckOut[] = JSON.parse(queueStr);
    const filtered = queue.filter((item) => item.id !== id);
    await AsyncStorage.setItem(OFFLINE_CHECKOUT_QUEUE_KEY, JSON.stringify(filtered));

    logger.info("Cleared check-out from queue", { id });
  } catch (error) {
    logger.error("Error clearing check-out", { error });
  }
}

/**
 * Clear all attendance queues
 */
export async function clearAllAttendanceQueues(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      OFFLINE_CHECKIN_QUEUE_KEY,
      OFFLINE_CHECKOUT_QUEUE_KEY,
    ]);
    logger.info("Cleared all attendance queues");
  } catch (error) {
    logger.error("Error clearing attendance queues", { error });
  }
}
