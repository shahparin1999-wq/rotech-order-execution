"use client";

// Client-side in-memory store. The provider lives in the root layout so state
// persists across client navigations. This is the prototype's mock repository
// layer - no server, database, or external system.

import React, { createContext, useContext, useMemo, useReducer } from "react";
import { buildInitialState } from "@/domain/fixtures";
import type { AppState } from "@/domain/types";
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
  | { type: "switchUser"; employeeId: string };

function reducer(state: AppState, action: Action): AppState {
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
      default:
        return state;
    }
  } catch (err) {
    // Surface domain violations loudly in the prototype rather than hiding
    // them (no silent fallback).
    console.error("Domain action rejected:", err);
    if (typeof window !== "undefined") {
      window.alert(`Action rejected: ${(err as Error).message}`);
    }
    return state;
  }
}

const StateCtx = createContext<AppState | null>(null);
const DispatchCtx = createContext<React.Dispatch<Action> | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, buildInitialState);
  const memoState = useMemo(() => state, [state]);
  return (
    <StateCtx.Provider value={memoState}>
      <DispatchCtx.Provider value={dispatch}>{children}</DispatchCtx.Provider>
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
