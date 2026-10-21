/**
 * Quick create from the tab bar's centre "+" button. The bar navigates to the
 * module's tab and files a request here; the screen consumes it (once) and
 * opens its own create flow, so every create keeps that screen's validation,
 * offline handling and permissions.
 */
import { useEffect } from "react";

export type QuickCreateKind = "ticket" | "incident" | "comm";

let pending: { kind: QuickCreateKind; at: number } | null = null;
const listeners = new Set<() => void>();

/** Requests older than this are dropped (e.g. the target screen never mounted). */
const TTL_MS = 10_000;

export function requestQuickCreate(kind: QuickCreateKind) {
  pending = { kind, at: Date.now() };
  listeners.forEach((l) => l());
}

function take(kind: QuickCreateKind): boolean {
  if (!pending || pending.kind !== kind) return false;
  const fresh = Date.now() - pending.at < TTL_MS;
  pending = null;
  return fresh;
}

/**
 * Call from the target screen: runs `open` when a request for `kind` is
 * pending now (screen just mounted) or arrives later (screen already mounted).
 * `ready` lets a screen wait until it can actually open the flow.
 */
export function useQuickCreate(kind: QuickCreateKind, open: () => void, ready = true) {
  useEffect(() => {
    if (!ready) return;
    const check = () => {
      if (take(kind)) open();
    };
    check();
    listeners.add(check);
    return () => {
      listeners.delete(check);
    };
  }, [kind, open, ready]);
}
