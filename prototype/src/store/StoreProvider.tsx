"use client";

// Client-side in-memory store. The provider lives in the root layout so state
// persists across client navigations. This is the prototype's mock repository
// layer - no server, database, or external system.
//
// State also survives a browser refresh via localStorage, but that is
// per-browser, per-device only (see src/store/persistence.ts) - it is not
// shared team state and nobody's edits are visible to anyone else.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState
} from "react";
import { buildInitialState } from "@/domain/fixtures";
import { recomputeUnitProjection } from "@/domain/projections";
import type { AppState } from "@/domain/types";
import { parseStoredEnvelope, serializeEnvelope, STORAGE_KEY } from "./persistence";
import {
  addAttachment,
  addChecklistResponse,
  addPost,
  addReply,
  blockTask,
  completeTask,
  convertPost,
  markPostRead,
  pauseTask,
  reprintLabel,
  resolveBlocker,
  resumeTask,
  startTask,
  toggleFollowOrder,
  type AttachmentInput,
  type ConvertInput,
  type PauseInput,
  type ResponseInput
} from "@/domain/actions";

export type Action =
  | { type: "startTask"; taskId: string }
  | { type: "pauseTask"; taskId: string; input: PauseInput }
  | { type: "resumeTask"; taskId: string }
  | { type: "completeTask"; taskId: string }
  | { type: "blockTask"; taskId: string; reason: string }
  | { type: "resolveBlocker"; taskId: string; note: string }
  | { type: "addResponse"; unitId: string; input: ResponseInput }
  | { type: "addAttachment"; input: AttachmentInput }
  | { type: "addPost"; orderNumber: string; unitId: string | null; body: string; mentions?: string[] }
  | { type: "addReply"; postId: string; body: string }
  | { type: "markPostRead"; postId: string }
  | { type: "toggleFollowOrder"; orderNumber: string }
  | { type: "convertPost"; postId: string; input: ConvertInput }
  | { type: "reprintLabel"; publicRef: string; reason: string }
  | { type: "switchUser"; employeeId: string }
  | { type: "hydrateState"; state: AppState }
  | { type: "resetToFixtures" };

// A saved/hydrated state's cached Unit/Operation statuses are never trusted
// as-is - always recomputed fresh before use, so a stale save (from before a
// projection-logic change) or a tampered one can never display an incorrect
// cached status. The projection is always the source of truth.
function recomputeAllProjections(state: AppState): AppState {
  return state.units.reduce((s, u) => recomputeUnitProjection(s, u.unitId), state);
}

function buildReducer(onError: (message: string) => void) {
  return function reducer(state: AppState, action: Action): AppState {
    const actor = state.currentUserId;
    try {
      switch (action.type) {
        case "startTask":
          return startTask(state, action.taskId, actor);
        case "pauseTask":
          return pauseTask(state, action.taskId, actor, action.input);
        case "resumeTask":
          return resumeTask(state, action.taskId, actor);
        case "completeTask":
          return completeTask(state, action.taskId, actor);
        case "blockTask":
          return blockTask(state, action.taskId, actor, action.reason);
        case "resolveBlocker":
          return resolveBlocker(state, action.taskId, actor, action.note);
        case "addResponse":
          return addChecklistResponse(state, action.unitId, actor, action.input);
        case "addAttachment":
          return addAttachment(state, actor, action.input);
        case "addPost":
          return addPost(state, actor, {
            orderNumber: action.orderNumber,
            unitId: action.unitId,
            body: action.body,
            mentions: action.mentions
          });
        case "addReply":
          return addReply(state, action.postId, actor, action.body);
        case "markPostRead":
          return markPostRead(state, action.postId);
        case "toggleFollowOrder":
          return toggleFollowOrder(state, action.orderNumber);
        case "convertPost":
          return convertPost(state, action.postId, actor, action.input);
        case "reprintLabel":
          return reprintLabel(state, action.publicRef, actor, action.reason);
        case "switchUser":
          return { ...state, currentUserId: action.employeeId };
        case "hydrateState":
          return recomputeAllProjections(action.state);
        case "resetToFixtures":
          return buildInitialState();
        default:
          return state;
      }
    } catch (err) {
      // Surface domain violations loudly in the prototype rather than hiding
      // them (no silent fallback) - shown as an inline banner, not a native
      // alert dialog.
      console.error("Domain action rejected:", err);
      onError((err as Error).message);
      return state;
    }
  };
}

const StateCtx = createContext<AppState | null>(null);
const DispatchCtx = createContext<React.Dispatch<Action> | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const reducer = useCallback(buildReducer(setErrorMessage), []);
  const [state, dispatch] = useReducer(reducer, undefined, buildInitialState);
  const [hydrated, setHydrated] = useState(false);

  // Server render and the client's first render both call buildInitialState()
  // directly, so markup matches and there is no hydration warning. Only
  // after mount do we look at localStorage and, if a save exists, adopt it -
  // recomputing every projection rather than trusting the saved values.
  useEffect(() => {
    let saved: AppState | null = null;
    try {
      saved = parseStoredEnvelope(window.localStorage.getItem(STORAGE_KEY));
    } catch {
      saved = null; // localStorage disabled/unavailable - just start fresh
    }
    if (saved) dispatch({ type: "hydrateState", state: saved });
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return; // don't persist the pre-hydration fixture render
    try {
      window.localStorage.setItem(STORAGE_KEY, serializeEnvelope(state));
    } catch {
      // Quota exceeded, serialization failure, or storage disabled: not
      // fatal for a demo tool - this write just doesn't persist.
    }
  }, [state, hydrated]);

  const memoState = useMemo(() => state, [state]);
  return (
    <StateCtx.Provider value={memoState}>
      <DispatchCtx.Provider value={dispatch}>
        {children}
        {errorMessage && (
          <div className="error-toast" role="alert" data-testid="error-toast">
            <span>Action rejected: {errorMessage}</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setErrorMessage(null)}
            >
              ×
            </button>
          </div>
        )}
      </DispatchCtx.Provider>
    </StateCtx.Provider>
  );
}

export function useAppState(): AppState {
  const s = useContext(StateCtx);
  if (!s) throw new Error("useAppState must be used inside StoreProvider");
  return s;
}

export function useAppDispatch(): React.Dispatch<Action> {
  const d = useContext(DispatchCtx);
  if (!d) throw new Error("useAppDispatch must be used inside StoreProvider");
  return d;
}
