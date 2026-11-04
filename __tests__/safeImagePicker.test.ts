// Regression: on high-megapixel Android phones, picking a photo at quality < 1
// made expo-image-picker decode the full frame into memory and the app was
// killed right after the camera's ✓ (Nov 2026, PM before-photo). The safe
// picker must hand the picker quality 1 and downscale through expo-image, and
// must give a photo back after Android killed the app mid-capture.

const mockPlatform = { OS: "android" };
const mockStore = new Map<string, string>();

jest.mock("react-native", () => ({ Platform: mockPlatform }));
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
    removeItem: jest.fn(async (k: string) => void mockStore.delete(k)),
  },
}));
jest.mock("expo-file-system/legacy", () => ({
  deleteAsync: jest.fn(async () => undefined),
}));
jest.mock("expo-image", () => ({
  Image: { loadAsync: jest.fn() },
}));
jest.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg", PNG: "png", WEBP: "webp" },
  ImageManipulator: { manipulate: jest.fn() },
}));
jest.mock("expo-image-picker", () => ({
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  getPendingResultAsync: jest.fn(),
}));
jest.mock("@/utils/logger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const ImagePicker = require("expo-image-picker");
const { Image } = require("expo-image");
const { ImageManipulator } = require("expo-image-manipulator");
const {
  launchCameraSafe,
  launchImageLibrarySafe,
  takePendingCapture,
  MAX_PHOTO_EDGE,
} = require("../utils/safeImagePicker") as typeof import("../utils/safeImagePicker");
/* eslint-enable @typescript-eslint/no-require-imports */

const PENDING_KEY = "pending_camera_capture_v1";
const RAW = "file:///cache/ImagePicker/raw.jpg";
const SMALL = "file:///cache/ImageManipulator/small.jpeg";

const picked = (uri = RAW) => ({
  canceled: false,
  assets: [{ uri, type: "image", width: 12000, height: 9000, mimeType: "image/jpeg", fileName: "raw.jpg" }],
});

let saveAsync: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockStore.clear();
  mockPlatform.OS = "android";
  saveAsync = jest.fn(async () => ({ uri: SMALL, width: 2560, height: 1920 }));
  Image.loadAsync.mockResolvedValue({ release: jest.fn() });
  ImageManipulator.manipulate.mockReturnValue({
    renderAsync: async () => ({ saveAsync, release: jest.fn() }),
  });
  ImagePicker.launchCameraAsync.mockResolvedValue(picked());
  ImagePicker.launchImageLibraryAsync.mockResolvedValue(picked());
});

test("android camera is launched at quality 1 so the picker never decodes the full frame", async () => {
  await launchCameraSafe({ mediaTypes: ["images"], quality: 0.7 });
  expect(ImagePicker.launchCameraAsync).toHaveBeenCalledWith({ mediaTypes: ["images"], quality: 1 });
});

test("android camera photo is decoded at most MAX_PHOTO_EDGE on the long side", async () => {
  await launchCameraSafe({ quality: 0.7 });
  expect(Image.loadAsync).toHaveBeenCalledWith(RAW, { maxWidth: MAX_PHOTO_EDGE, maxHeight: MAX_PHOTO_EDGE });
});

test("android camera photo is re-encoded at the caller's quality", async () => {
  await launchCameraSafe({ quality: 0.7 });
  expect(saveAsync).toHaveBeenCalledWith({ compress: 0.7, format: "jpeg" });
});

test("android camera result points at the downscaled file", async () => {
  const result = await launchCameraSafe({ quality: 0.7 });
  expect(!result.canceled && result.assets[0]).toMatchObject({ uri: SMALL, width: 2560, height: 1920 });
});

test("a failed downscale keeps the original photo instead of losing it", async () => {
  Image.loadAsync.mockRejectedValue(new Error("decode failed"));
  const result = await launchCameraSafe({ quality: 0.7 });
  expect(!result.canceled && result.assets[0]?.uri).toBe(RAW);
});

test("every gallery pick is downscaled", async () => {
  ImagePicker.launchImageLibraryAsync.mockResolvedValue({
    canceled: false,
    assets: [picked("file:///a.jpg").assets[0], picked("file:///b.jpg").assets[0]],
  });
  await launchImageLibrarySafe({ quality: 0.6, allowsMultipleSelection: true });
  expect(Image.loadAsync).toHaveBeenCalledTimes(2);
});

test("a cancelled capture is passed through untouched", async () => {
  ImagePicker.launchCameraAsync.mockResolvedValue({ canceled: true, assets: null });
  const result = await launchCameraSafe({ quality: 0.7 });
  expect(result).toEqual({ canceled: true, assets: null });
});

test("ios keeps the caller's options and is not downscaled", async () => {
  mockPlatform.OS = "ios";
  await launchCameraSafe({ quality: 0.7 });
  expect(ImagePicker.launchCameraAsync).toHaveBeenCalledWith({ quality: 0.7 });
});

test("the pending-capture record exists while the camera is open", async () => {
  let storedDuringCapture: string | undefined;
  ImagePicker.launchCameraAsync.mockImplementation(async () => {
    storedDuringCapture = mockStore.get(PENDING_KEY);
    return picked();
  });
  await launchCameraSafe({ quality: 0.7 }, { owner: "pm_start_before", payload: { instanceId: "pm-1" } });
  expect(JSON.parse(storedDuringCapture ?? "{}")).toMatchObject({ owner: "pm_start_before", payload: { instanceId: "pm-1" } });
});

test("the pending-capture record is cleared when the app survives the camera", async () => {
  await launchCameraSafe({ quality: 0.7 }, { owner: "pm_start_before", payload: { instanceId: "pm-1" } });
  expect(mockStore.has(PENDING_KEY)).toBe(false);
});

const seedPending = (owner: string, savedAt = Date.now()) =>
  mockStore.set(PENDING_KEY, JSON.stringify({ owner, payload: { instanceId: "pm-1" }, quality: 0.7, savedAt }));

test("after a kill, the owner gets its photo back, downscaled, with its payload", async () => {
  seedPending("pm_start_before");
  ImagePicker.getPendingResultAsync.mockResolvedValue(picked());
  await expect(takePendingCapture("pm_start_before")).resolves.toEqual({ payload: { instanceId: "pm-1" }, uri: SMALL });
});

test("another owner's pending photo is left for that owner", async () => {
  seedPending("pm_execution_evidence:pm-9");
  await takePendingCapture("pm_start_before");
  expect(ImagePicker.getPendingResultAsync).not.toHaveBeenCalled();
});

test("a stale pending record is dropped without claiming any photo", async () => {
  seedPending("pm_start_before", Date.now() - 31 * 60 * 1000);
  await expect(takePendingCapture("pm_start_before")).resolves.toBeNull();
});

test("no recovery when the picker has nothing pending", async () => {
  seedPending("pm_start_before");
  ImagePicker.getPendingResultAsync.mockResolvedValue(null);
  await expect(takePendingCapture("pm_start_before")).resolves.toBeNull();
});

test("a picker error result is not treated as a photo", async () => {
  seedPending("pm_start_before");
  ImagePicker.getPendingResultAsync.mockResolvedValue({ code: "ERR", message: "boom" });
  await expect(takePendingCapture("pm_start_before")).resolves.toBeNull();
});
