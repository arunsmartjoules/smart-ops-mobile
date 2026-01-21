import { Model } from "@nozbe/watermelondb";
import { field, date, readonly, text } from "@nozbe/watermelondb/decorators";

export default class ChillerReading extends Model {
  static table = "chiller_readings";

  @field("server_id") serverId!: string | null;
  @text("log_id") logId!: string;
  @text("site_id") siteId!: string;
  @text("chiller_id") chillerId!: string | null;
  @text("equipment_id") equipmentId!: string | null;
  @text("executor_id") executorId!: string;

  @text("date_shift") dateShift!: string | null;
  @field("reading_time") reading_time!: number | null;
  @field("start_datetime") start_datetime!: number | null;
  @field("end_datetime") end_datetime!: number | null;

  @field("condenser_inlet_temp") condenserInletTemp!: number | null;
  @field("condenser_outlet_temp") condenserOutletTemp!: number | null;
  @field("evaporator_inlet_temp") evaporatorInletTemp!: number | null;
  @field("evaporator_outlet_temp") evaporatorOutletTemp!: number | null;
  @field("compressor_suction_temp") compressorSuctionTemp!: number | null;
  @field("motor_temperature") motorTemperature!: number | null;
  @field("saturated_condenser_temp") saturatedCondenserTemp!: number | null;
  @field("saturated_suction_temp") saturatedSuctionTemp!: number | null;
  @field("set_point_celsius") setPointCelsius!: number | null;

  @field("discharge_pressure") dischargePressure!: number | null;
  @field("main_suction_pressure") mainSuctionPressure!: number | null;
  @field("oil_pressure") oilPressure!: number | null;
  @field("oil_pressure_difference") oilPressureDifference!: number | null;
  @field("condenser_inlet_pressure") condenserInletPressure!: number | null;
  @field("condenser_outlet_pressure") condenserOutletPressure!: number | null;
  @field("evaporator_inlet_pressure") evaporatorInletPressure!: number | null;
  @field("evaporator_outlet_pressure") evaporatorOutletPressure!: number | null;

  @field("compressor_load_percentage") compressorLoadPercentage!: number | null;
  @field("inline_btu_meter") inlineBtuMeter!: number | null;

  @text("remarks") remarks!: string | null;
  @text("sla_status") slaStatus!: string | null;
  @text("reviewed_by") reviewedBy!: string | null;
  @text("signature_text") signatureText!: string | null;
  @text("attachments") attachments!: string | null;

  @field("is_synced") isSynced!: boolean;

  @readonly @date("created_at") createdAt!: Date;
  @readonly @date("updated_at") updatedAt!: Date;
}
