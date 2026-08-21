import { useSyncExternalStore } from "react";
import { getCurrentUserId, getState, subscribe } from "./store";

export function useStoreState() {
  return useSyncExternalStore(subscribe, getState, getState);
}

export function useCurrentUser() {
  const state = useStoreState();
  const id = useSyncExternalStore(
    subscribe,
    () => getCurrentUserId(),
    () => getCurrentUserId(),
  );
  return state.users.find((u) => u.id === id) ?? null;
}
