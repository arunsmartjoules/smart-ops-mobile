import { supabase } from "./supabase";
import * as FileSystem from "expo-file-system";
import { decode } from "base64-arraybuffer";
import logger from "@/utils/logger";

export const StorageService = {
  async uploadFile(
    bucketName: string,
    filePath: string,
    fileUri: string,
  ): Promise<string | null> {
    try {
      logger.info(`Uploading file to ${bucketName}/${filePath}`, {
        module: "STORAGE_SERVICE",
      });

      // Read file as base64
      const base64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: "base64",
      });

      // Upload to Supabase
      const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(filePath, decode(base64), {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (error) {
        throw error;
      }

      // Get Public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from(bucketName).getPublicUrl(filePath);

      return publicUrl;
    } catch (error: any) {
      logger.error("File upload failed", {
        module: "STORAGE_SERVICE",
        error: error.message,
      });
      return null;
    }
  },
};
