/**
 * The three modules pinned to the floating bar (between Home and More).
 * A tiny external store so the bar and the "All modules" drawer stay in step;
 * persisted per device in AsyncStorage (cleared on sign-out with the rest).
 */
import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_PINS,
  MAX_PINS,
  isModuleKey,
  type ModuleKey,
} from "@/components/jo/modules";

const STORAGE_KEY = "nav-pins:v1";

let pins: ModuleKey[] = DEFAULT_PINS;
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function load() {
  if (loaded) return;
  loaded = true;
  AsyncStorage.getItem(STORAGE_KEY)
    .then((raw) => {
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const valid = [...new Set(parsed.filter(isModuleKey))].slice(0, MAX_PINS);
      if (valid.length > 0) {
        pins = valid;
        emit();
      }
    })
    .catch(() => {});
}

function subscribe(listener: () => void) {
  load();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return pins;
}

export function setPins(next: ModuleKey[]) {
  pins = next;
  emit();
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
}

/**
 * Artboard rule: tapping a pinned module unpins it (never below one pin);
 * tapping an unpinned one pins it, dropping the oldest pin when full.
 */
export function togglePin(key: ModuleKey) {
  let next = pins.slice();
  if (next.includes(key)) {
    if (next.length > 1) next = next.filter((k) => k !== key);
  } else {
    if (next.length >= MAX_PINS) next.shift();
    next.push(key);
  }
  setPins(next);
}

export function useNavPins(): ModuleKey[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
