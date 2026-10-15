"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False during server rendering and hydration, true afterwards. Use it for
 * output that depends on the viewer's clock or time zone, which the server
 * cannot know.
 */
export function useIsClient() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
