import { useSyncExternalStore } from "react";
import { getState, subscribe } from "./store";

export function useBookItState() {
  return useSyncExternalStore(subscribe, getState, getState);
}
