/**
 * Imperative, hook-less route-param passing.
 *
 * Background: `useLocalSearchParams` / `useNavigation` / `useRouter` all
 * throw "Couldn't find a navigation context" when expo-router's navigation
 * context is momentarily unavailable (e.g. during a route teardown
 * re-render). Routes that read params via those hooks crash even when the
 * teardown is otherwise benign.
 *
 * Workaround: the *caller* writes the params into this module-level store
 * right before `router.push(path)`; the destination screen reads them with
 * `consumeRouteParams(path)` (a plain object lookup — no hooks, no context,
 * cannot throw). Once read the entry is removed so a later visit to the same
 * path doesn't inherit stale values.
 *
 * Use only for screen-local params that travel with a single navigation
 * (siteCode, editId, shift). Anything that needs to survive reloads belongs
 * in AsyncStorage / global state, not here.
 */

export type RouteParamsValue =
  | string
  | number
  | boolean
  | null
  | undefined;

export type RouteParams = Record<string, RouteParamsValue>;

const store: Record<string, RouteParams> = {};

export function setRouteParams(path: string, params: RouteParams): void {
  store[path] = { ...params };
}

/**
 * Returns the params written for `path` and removes them. Returns `{}` if
 * nothing was set, so callers can destructure safely.
 */
export function consumeRouteParams<T extends RouteParams = RouteParams>(
  path: string,
): T {
  const value = store[path] ?? {};
  delete store[path];
  return value as T;
}

/** Non-consuming peek. Use only for debugging / tests. */
export function peekRouteParams<T extends RouteParams = RouteParams>(
  path: string,
): T {
  return (store[path] ?? {}) as T;
}
