/**
 * The trend sheet entry screens, rendered with the real form logic and the
 * real preview arithmetic (utils/trendCalc), and with the look and the
 * services stubbed. This is behaviour, not layout: what the footer says while
 * typing, what is refused before anything is sent, and exactly what is handed
 * to the service on Save.
 */
import React from "react";
import { Text, TextInput } from "react-native";
import renderer, { act } from "react-test-renderer";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useFocusEffect: () => {},
}));
jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(async () => {}),
  NotificationFeedbackType: { Success: "success", Warning: "warning" },
}));
jest.mock("react-native-keyboard-controller", () => {
  const R = require("react");
  const { View: V } = require("react-native");
  return { KeyboardAvoidingView: (p: any) => R.createElement(V, null, p.children) };
});
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/jo/Bx", () => ({ Bx: () => null }));

jest.mock("@/components/jo/ui", () => {
  const R = require("react");
  const { Pressable: P, Text: T, View: V } = require("react-native");
  const Box = (p: any) => R.createElement(V, null, p.children);
  const Button = ({ label, onPress, busy }: any) =>
    R.createElement(P, { onPress, disabled: !!busy, accessibilityRole: "button", accessibilityLabel: label }, R.createElement(T, null, label));
  // Every theme token is a colour string; the screens only pass them on.
  const theme = new Proxy({}, { get: () => "#000" });
  return {
    Card: Box,
    JoPage: Box,
    PrimaryButton: Button,
    SecondaryButton: Button,
    IconButton: ({ label, onPress }: any) => R.createElement(P, { onPress, accessibilityLabel: label }),
    EmptyState: ({ title, sub }: any) => R.createElement(T, null, `${title} ${sub ?? ""}`),
    Shimmer: () => null,
    f: { d: () => ({}), t: () => ({}), m: () => ({}) },
    useJoTheme: () => theme,
  };
});

jest.mock("@/components/sitelogs/LogsKit", () => {
  const R = require("react");
  const { Text: T, TextInput: TI, View: V } = require("react-native");
  return {
    EntryHeader: ({ title, sub }: any) => R.createElement(T, null, `${title} · ${sub ?? ""}`),
    NumberField: ({ label, value, onChangeText, onBlur, editable }: any) =>
      R.createElement(TI, { accessibilityLabel: label, value, onChangeText, onBlur, editable }),
    FormSheet: ({ visible, title, children, footer }: any) =>
      visible ? R.createElement(V, null, R.createElement(T, null, `Sheet: ${title}`), children, footer) : null,
    ReadOnlyEntry: ({ what }: any) => R.createElement(T, null, `View-only mode: ${what}`),
  };
});

let mockCanEdit = true;
jest.mock("@/contexts/AttendanceGateContext", () => ({ useAttendanceGate: () => ({ canEdit: mockCanEdit }) }));
let mockCanSave = true;
jest.mock("@/contexts/PermissionsContext", () => ({
  usePermissions: () => ({ canView: () => true, can: () => mockCanSave }),
}));

const mockHoldRelease = jest.fn();
const mockHoldPulls = jest.fn(() => mockHoldRelease);
jest.mock("@/services/SyncEngine", () => ({
  __esModule: true,
  default: { holdPulls: (...a: any[]) => mockHoldPulls(...(a as [])), flushQueue: jest.fn(async () => {}) },
}));
jest.mock("@/services/UpdateService", () => ({ __esModule: true, default: { checkForUpdate: jest.fn(), fetchUpdate: jest.fn() } }));
jest.mock("@/services/StoreUpdateService", () => ({ __esModule: true, default: { check: jest.fn(async () => false) } }));
jest.mock("@/utils/alert", () => ({ showAlert: jest.fn() }));
jest.mock("@/utils/istDate", () => ({ istTodayString: () => "2026-11-15" }));

let mockConnected: boolean | null = true;
jest.mock("@/hooks/useNetworkStatus", () => ({
  useNetworkStatus: () => ({ isConnected: mockConnected, isInternetReachable: mockConnected }),
}));

let mockView: any = null;
const mockSaveCategory = jest.fn(async (..._args: any[]) => ({}));
const mockFetchDay = jest.fn(async (..._args: any[]): Promise<any> => ({ ok: true, data: {} }));
// What a sync answer or a pull does: the cache changed, the screens re-read it.
let mockListeners: Array<() => void> = [];
jest.mock("@/services/TrendSheetService", () => ({
  __esModule: true,
  default: {
    viewFromCache: jest.fn(async () => mockView),
    fetchDay: (...args: any[]) => mockFetchDay(...args),
    saveCategory: (...args: any[]) => mockSaveCategory(...args),
  },
  subscribeTrendSheet: (listener: () => void) => {
    mockListeners.push(listener);
    return () => {
      mockListeners = mockListeners.filter((l) => l !== listener);
    };
  },
  isTrendCalcOutdated: (day: any) => !!day && day.calc_version > 1,
}));

import TrendElectricity from "../app/trend-electricity";
import TrendDg from "../app/trend-dg";
import TrendFuel from "../app/trend-fuel";
import TrendSummary from "../app/trend-summary";
import { setRouteParams } from "../utils/routeParams";
import { previewSave, viewOfContext, type TrendDayContext, type TrendDayView } from "../utils/trendSheet";

const SITE = "APLMAIN";
const DAY = "2026-11-15";

const blockOf = (extra: any) => ({
  name: extra.block_id,
  entry_mode: "readings",
  typed: null,
  opening_reading: null,
  opening_date: null,
  final_reading: null,
  mf: null,
  add_adjustment: 0,
  deduct_adjustment: 0,
  carried_from: null,
  quantity: null,
  litres: null,
  mismatch: null,
  ...extra,
});

const categoryOf = (extra: any) => ({
  label: extra.category,
  unit: "kWh",
  kind: "meter",
  entered: false,
  entered_by_name: null,
  entered_at: null,
  pending_inputs: [],
  consumption: null,
  adjustment: 0,
  saving: null,
  saving_pct: null,
  not_used: false,
  provisional: false,
  blocks: [],
  ...extra,
});

/** Apollo Main Hospital, Sunday 15 Nov 2026 (spec AC-18): Electricity, DG and Diesel, nothing entered. */
function apolloMain(): TrendDayContext {
  return {
    site_code: SITE,
    date: DAY,
    is_sunday: true,
    cycle_month: "2026-11",
    status: "missing",
    categories_expected: 3,
    categories_entered: 0,
    editable: true,
    calc_version: 1,
    categories: [
      categoryOf({
        category: "electricity",
        label: "Electricity",
        baseline: 35988.88,
        baseline_kind: "sunday",
        target_pct: 21,
        target: 7557.66,
        manual_allowed: false,
        blocks: [
          blockOf({ block_id: "main", name: "Main Block", opening_reading: 53064.46, opening_date: "2026-11-14", mf: 3000, carried_from: "2026-11-14" }),
          blockOf({
            block_id: "sindoori",
            name: "Sindoori Block",
            opening_reading: 37419.48,
            opening_date: "2026-11-14",
            mf: 800,
            add_adjustment: 4624.8,
            deduct_adjustment: 1873.5,
            carried_from: "2026-11-14",
          }),
        ],
      }),
      categoryOf({ category: "dg", label: "DG", kind: "dg", dg_factor: 3.2, blocks: [blockOf({ block_id: "dg1", name: "Main Block", entry_mode: null })] }),
      categoryOf({
        category: "diesel",
        label: "Diesel",
        unit: "L",
        kind: "fuel",
        baseline: 287.6,
        baseline_kind: "sunday",
        target_pct: null,
        target: null,
        blocks: [blockOf({ block_id: "boiler", name: "Hot Water and Steam Boiler", entry_mode: null })],
      }),
    ],
  } as TrendDayContext;
}

const ELECTRICITY_SAVED = {
  client_saved_at: "2026-11-15T06:00:00.000Z",
  calc_version: 1,
  blocks: [
    { block_id: "main", final_reading: 53073.41, opening_source: "carried" as const },
    { block_id: "sindoori", final_reading: 37422.66, opening_source: "carried" as const },
  ],
};

const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

async function open(Screen: React.ComponentType, route: string, view: TrendDayView, params: Record<string, string> = {}) {
  mockView = view;
  setRouteParams(route, { siteCode: SITE, date: DAY, ...params });
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<Screen />);
    await settle();
  });
  return tree;
}

const flat = (children: any): string =>
  Array.isArray(children) ? children.map(flat).join("") : children == null || typeof children === "boolean" ? "" : String(children);

/** Every piece of text on the screen, one per line. */
const screenText = (tree: renderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(Text)
    .map((n) => flat(n.props.children))
    .join("\n");

const field = (tree: renderer.ReactTestRenderer, label: string, index = 0) =>
  tree.root.findAll((n) => (n.type as any) === TextInput && n.props.accessibilityLabel === label)[index];

const type = async (tree: renderer.ReactTestRenderer, label: string, value: string, index = 0) => {
  await act(async () => {
    field(tree, label, index).props.onChangeText(value);
  });
};

const blur = async (tree: renderer.ReactTestRenderer, label: string, index = 0) => {
  await act(async () => {
    field(tree, label, index).props.onBlur();
  });
};

const press = async (tree: renderer.ReactTestRenderer, label: string) => {
  const target = tree.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === "function")[0];
  await act(async () => {
    target.props.onPress();
    await settle();
  });
};

const hasButton = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === "function").length > 0;

beforeEach(() => {
  mockCanEdit = true;
  mockCanSave = true;
  mockConnected = true;
  mockListeners = [];
  mockFetchDay.mockReset();
  mockFetchDay.mockImplementation(async () => ({ ok: true, data: {} }));
  mockSaveCategory.mockClear();
  mockHoldPulls.mockClear();
  mockHoldRelease.mockClear();
});

describe("Electricity entry", () => {
  const openElectricity = (view = viewOfContext(apolloMain())) => open(TrendElectricity, "/trend-electricity", view);
  const typeBoth = async (tree: renderer.ReactTestRenderer) => {
    await type(tree, "Today", "53073.41", 0);
    await type(tree, "Today", "37422.66", 1);
  };

  it("asks for both readings before it shows a saving", async () => {
    const tree = await openElectricity();
    expect(screenText(tree)).toContain("Enter 2 readings to see savings");
  });

  it("shows the saving as the readings are typed (AC-18)", async () => {
    const tree = await openElectricity();
    await typeBoth(tree);
    expect(screenText(tree)).toContain("9,346.18 kWh");
  });

  it("shows the saving percentage as the readings are typed", async () => {
    const tree = await openElectricity();
    await typeBoth(tree);
    expect(screenText(tree)).toContain("25.97%");
  });

  it("says how far above the target the day is", async () => {
    const tree = await openElectricity();
    await typeBoth(tree);
    expect(screenText(tree)).toContain("1,788.52 kWh above the 21% target");
  });

  it("shows each meter's consumption beside its name", async () => {
    const tree = await openElectricity();
    await typeBoth(tree);
    expect(screenText(tree)).toContain("26,850 kWh");
  });

  it("flags a reading lower than yesterday's once the field is left", async () => {
    const tree = await openElectricity();
    await type(tree, "Today", "53037.41", 0);
    await blur(tree, "Today", 0);
    expect(screenText(tree)).toContain("Lower than yesterday’s 53,064.46. Check the meter.");
  });

  it("offers the meter swap route for a reading lower than yesterday's", async () => {
    const tree = await openElectricity();
    await type(tree, "Today", "53037.41", 0);
    await blur(tree, "Today", 0);
    expect(screenText(tree)).toContain("Meter changed? Set opening reading");
  });

  it("sends nothing when a reading is missing", async () => {
    const tree = await openElectricity();
    await type(tree, "Today", "53073.41", 0);
    await press(tree, "Save electricity");
    expect(mockSaveCategory).not.toHaveBeenCalled();
  });

  it("saves the two closing readings and leaves the carried values to the server", async () => {
    const tree = await openElectricity();
    await typeBoth(tree);
    await press(tree, "Save electricity");
    expect(mockSaveCategory).toHaveBeenCalledWith(SITE, DAY, "electricity", {
      blocks: [
        { block_id: "main", final_reading: 53073.41, opening_source: "carried" },
        { block_id: "sindoori", final_reading: 37422.66, opening_source: "carried" },
      ],
    });
  });

  it("leads on to the next category once saved", async () => {
    const tree = await openElectricity();
    await typeBoth(tree);
    await press(tree, "Save electricity");
    expect(screenText(tree)).toContain("Electricity saved. Continue to DG");
  });

  it("shows a day over baseline as a negative saving and a negative saving %", async () => {
    const tree = await openElectricity();
    // Main Block 15 x 3,000 = 45,000 kWh: well over the 35,988.88 baseline.
    await type(tree, "Today", "53079.46", 0);
    await type(tree, "Today", "37422.66", 1);
    const text = screenText(tree);
    expect([/−[\d,]+\.\d{2} kWh/.test(text), /−\d+\.\d{2}%/.test(text), text.includes("Over")]).toEqual([true, true, false]);
  });

  it("offers Save again, not Continue, once the server refuses the saved entry", async () => {
    const tree = await openElectricity();
    await typeBoth(tree);
    await press(tree, "Save electricity");
    const refused = previewSave(viewOfContext(apolloMain()), "electricity", ELECTRICITY_SAVED);
    refused.categories[0] = { ...refused.categories[0], sync: "failed", sync_error: "Readings refused", draft: ELECTRICITY_SAVED };
    mockView = refused;
    await act(async () => {
      mockListeners.forEach((l) => l());
      await settle();
    });
    expect([hasButton(tree, "Save electricity"), screenText(tree).includes("Electricity saved. Continue to DG")]).toEqual([
      true,
      false,
    ]);
  });

  it("reads the day again when the network comes back while it shows the phone's copy", async () => {
    mockConnected = false;
    mockFetchDay.mockImplementation(async () => ({ ok: false, error: "No connection", status: null }));
    const tree = await openElectricity();
    mockFetchDay.mockClear();
    mockConnected = true;
    await act(async () => {
      tree.update(<TrendElectricity />);
      await settle();
    });
    expect(mockFetchDay).toHaveBeenCalledWith(SITE, DAY);
  });

  it("does not read the day again when the network comes back and the day is fresh", async () => {
    mockConnected = false;
    const tree = await openElectricity();
    mockFetchDay.mockClear();
    mockConnected = true;
    await act(async () => {
      tree.update(<TrendElectricity />);
      await settle();
    });
    expect(mockFetchDay).not.toHaveBeenCalled();
  });

  it("sends a typed opening reading and factor after a meter swap", async () => {
    const tree = await openElectricity();
    await press(tree, "Edit factor and adjustments for Main Block. × 3,000, no adjustment");
    await type(tree, "Opening reading", "2");
    await type(tree, "Multiplying factor", "1500");
    await press(tree, "Save changes");
    await type(tree, "Today", "12.5", 0);
    await type(tree, "Today", "37422.66", 1);
    await press(tree, "Save electricity");
    expect(mockSaveCategory.mock.calls[0]?.[3].blocks[0]).toEqual({
      block_id: "main",
      final_reading: 12.5,
      opening_source: "typed",
      initial_reading: 2,
      mf: 1500,
    });
  });

  it("opens with what this phone already saved and has not sent", async () => {
    const view = previewSave(viewOfContext(apolloMain()), "electricity", ELECTRICITY_SAVED);
    view.categories[0] = { ...view.categories[0], sync: "pending", draft: ELECTRICITY_SAVED };
    const tree = await openElectricity(view);
    expect([field(tree, "Today", 0).props.value, field(tree, "Today", 1).props.value]).toEqual(["53073.41", "37422.66"]);
  });

  it("shows one units field for a block that takes typed units", async () => {
    const day = apolloMain();
    day.categories[0].blocks = [blockOf({ block_id: "u1", name: "Main Block", entry_mode: "units" })];
    const tree = await openElectricity(viewOfContext(day));
    await type(tree, "Units today", "9800");
    await press(tree, "Save electricity");
    expect(mockSaveCategory.mock.calls[0]?.[3]).toEqual({ blocks: [{ block_id: "u1", quantity: 9800 }] });
  });

  it("takes a typed saving with no readings on a site that works that way", async () => {
    const day = apolloMain();
    day.categories[0].manual_allowed = true;
    const tree = await openElectricity(viewOfContext(day));
    await type(tree, "Electricity saved today (kWh)", "-120.5");
    await press(tree, "Save electricity");
    expect(mockSaveCategory.mock.calls[0]?.[3]).toEqual({ blocks: [], manual_saving: -120.5 });
  });

  it("holds background pulls while it is open", async () => {
    await openElectricity();
    expect(mockHoldPulls).toHaveBeenCalledWith("trend-entry");
  });

  it("releases the pull hold when it closes", async () => {
    const tree = await openElectricity();
    await act(async () => {
      tree.unmount();
    });
    expect(mockHoldRelease).toHaveBeenCalled();
  });

  it("shows the read only notice instead of the form when the day is not started", async () => {
    mockCanEdit = false;
    const tree = await openElectricity();
    expect(screenText(tree)).toBe("View-only mode: trend sheet readings");
  });

  it("replaces Save with the update block when the server's calculation is newer (AC-49)", async () => {
    const tree = await openElectricity(viewOfContext({ ...apolloMain(), calc_version: 2 }));
    expect([screenText(tree).includes("Update the app to enter readings"), hasButton(tree, "Save electricity")]).toEqual([
      true,
      false,
    ]);
  });

  it("keeps what was typed when the update block is showing", async () => {
    const tree = await openElectricity(viewOfContext({ ...apolloMain(), calc_version: 2 }));
    await type(tree, "Today", "53073.41", 0);
    expect(field(tree, "Today", 0).props.value).toBe("53073.41");
  });

  it("offers no Save to a role that cannot edit daily entry", async () => {
    mockCanSave = false;
    const tree = await openElectricity();
    expect(hasButton(tree, "Save electricity")).toBe(false);
  });
});

describe("DG entry", () => {
  const afterElectricity = () => previewSave(viewOfContext(apolloMain()), "electricity", ELECTRICITY_SAVED);
  const openDg = (view = afterElectricity()) => open(TrendDg, "/trend-dg", view);

  it("shows the Electricity saving before DG is entered", async () => {
    const tree = await openDg();
    expect(screenText(tree)).toContain("Electricity saved, before DG");
  });

  it("fills in the units from the litres and the site's factor", async () => {
    const tree = await openDg();
    await type(tree, "Diesel used", "100");
    expect(field(tree, "Units generated, calculated").props.value).toBe("320");
  });

  it("takes the DG units off the Electricity saving as they are typed", async () => {
    const tree = await openDg();
    await type(tree, "Diesel used", "100");
    expect(screenText(tree)).toContain("9,026.18 kWh");
  });

  it("says what DG adds to consumption", async () => {
    const tree = await openDg();
    await type(tree, "Diesel used", "100");
    expect(screenText(tree)).toContain("DG adds 320.00 kWh to consumption");
  });

  it("sends only the side that was typed", async () => {
    const tree = await openDg();
    await type(tree, "Diesel used", "100");
    await press(tree, "Save DG");
    expect(mockSaveCategory).toHaveBeenCalledWith(SITE, DAY, "dg", { not_used: false, blocks: [{ block_id: "dg1", litres: 100 }] });
  });

  it("refuses an empty DG entry and says what to do", async () => {
    const tree = await openDg();
    await press(tree, "Save DG");
    expect([mockSaveCategory.mock.calls.length, screenText(tree).includes("Enter litres or units, or mark that the DG did not run.")]).toEqual([
      0,
      true,
    ]);
  });

  it("saves a DG that did not run as a choice, with no blocks", async () => {
    const tree = await openDg();
    await press(tree, "DG did not run today");
    await press(tree, "Save DG");
    expect(mockSaveCategory).toHaveBeenCalledWith(SITE, DAY, "dg", { not_used: true, blocks: [] });
  });

  it("asks for units when the site has no DG factor", async () => {
    const day = apolloMain();
    day.categories[1].dg_factor = null;
    const tree = await openDg(viewOfContext(day));
    await type(tree, "Diesel used", "100");
    await press(tree, "Save DG");
    expect(screenText(tree)).toContain("This site has no DG factor in Baseline");
  });
});

describe("Fuel entry", () => {
  const openDiesel = () => open(TrendFuel, "/trend-fuel", viewOfContext(apolloMain()), { category: "diesel" });

  it("shows the saving against the fuel's own baseline as the quantity is typed", async () => {
    const tree = await openDiesel();
    await type(tree, "Diesel used", "87.6");
    expect(screenText(tree)).toContain("200.00 L");
  });

  it("saves the quantity for the block", async () => {
    const tree = await openDiesel();
    await type(tree, "Diesel used", "87.6");
    await press(tree, "Save diesel");
    expect(mockSaveCategory).toHaveBeenCalledWith(SITE, DAY, "diesel", { not_used: false, blocks: [{ block_id: "boiler", quantity: 87.6 }] });
  });

  it("saves the whole baseline when no diesel was used", async () => {
    const tree = await openDiesel();
    await press(tree, "No diesel used today");
    expect(screenText(tree)).toContain("287.60 L");
  });

  it("refuses an empty quantity", async () => {
    const tree = await openDiesel();
    await press(tree, "Save diesel");
    expect(mockSaveCategory).not.toHaveBeenCalled();
  });

  it("asks for run hours on PNG billed by the hour", async () => {
    const day = apolloMain();
    day.categories.push(
      categoryOf({
        category: "png",
        label: "PNG",
        unit: "SCM",
        kind: "fuel",
        hourly: true,
        baseline: null,
        baseline_kind: "hourly",
        baseline_per_hour: 12.5,
        target_pct: null,
        blocks: [blockOf({ block_id: "p1", name: "Boiler", entry_mode: null })],
      }) as any,
    );
    const tree = await open(TrendFuel, "/trend-fuel", viewOfContext(day), { category: "png" });
    await type(tree, "Run hours today", "8");
    await type(tree, "PNG used", "60");
    await press(tree, "Save PNG");
    expect(mockSaveCategory).toHaveBeenCalledWith(SITE, DAY, "png", {
      not_used: false,
      run_hours: 8,
      blocks: [{ block_id: "p1", quantity: 60 }],
    });
  });
});

describe("Day summary", () => {
  it("reads back a finished day", async () => {
    let view = previewSave(viewOfContext(apolloMain()), "electricity", ELECTRICITY_SAVED);
    view = previewSave(view, "dg", { ...ELECTRICITY_SAVED, not_used: true, blocks: [] });
    view = previewSave(view, "diesel", { ...ELECTRICITY_SAVED, not_used: true, blocks: [] });
    const text = screenText(await open(TrendSummary, "/trend-summary", view));
    expect([
      text.includes("All 3 entered"),
      text.includes("25.97%"),
      text.includes("1,788.52 kWh above the 21% target"),
      text.includes("Did not run"),
      text.includes("None today"),
      text.includes("+2,751.30 kWh"),
    ]).toEqual([true, true, true, true, true, true]);
  });

  it("says how many categories are still open", async () => {
    const view = previewSave(viewOfContext(apolloMain()), "electricity", ELECTRICITY_SAVED);
    expect(screenText(await open(TrendSummary, "/trend-summary", view))).toContain("1 of 3 entered");
  });
});
