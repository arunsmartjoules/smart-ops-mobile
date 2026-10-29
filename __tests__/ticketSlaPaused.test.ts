/**
 * A No Access ticket's SLA clocks are paused server-side, so a deadline cached
 * on the phone from before the pause must not flip it to "breached" locally.
 */
import { isSlaBreached } from "@/utils/ticketSla";

const past = new Date(Date.now() - 60 * 60_000).toISOString();

describe("isSlaBreached for a No Access ticket", () => {
  it("ignores a cached deadline that passed during the pause", () => {
    expect(isSlaBreached({ status: "No Access", sla: "Met", sla_due_at: past })).toBe(false);
  });

  it("still reports a breach the server already recorded", () => {
    expect(isSlaBreached({ status: "No Access", sla: "Breached", sla_due_at: null })).toBe(true);
  });

  it("keeps flipping an un-paused ticket once its deadline passes", () => {
    expect(isSlaBreached({ status: "Inprogress", sla: "Met", sla_due_at: past })).toBe(true);
  });
});
