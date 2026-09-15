"use client";

// Application store.
//
// Two modes, one reducer:
//
//   server  (Gate A)  Shared state lives in the server repository (PostgreSQL
//                     or a JSON file). Every dispatch applies the pure reducer
//                     optimistically for instant feedback, then sends the same
//                     action to POST /api/commands with an idempotency key and
//                     the version it was computed against. The server replays
//                     the reducer, persists the diff, and returns the
//                     authoritative state, which replaces the optimistic one.
//                     A stale base (someone else changed shared state) comes
//                     back as 409: the current state is adopted and the person
//                     is asked to repeat the action against what they now see.
//
//   local             The original per-browser localStorage demo mode (kept
//                     for the isolated e2e suite and for running without any
//                     server persistence).
//
// The viewer's mock identity (`currentUserId`) is session state in both modes
// and is never sent to shared storage except as the actor of a command.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { buildInitialState } from "@/domain/fixtures";
import { applyAction, LOCAL_ONLY_ACTIONS, recomputeAllProjections, type Action } from "@/domain/reducer";
import type { AppState } from "@/domain/types";
import { parseStoredEnvelope, serializeEnvelope, STORAGE_KEY } from "./persistence";

export type { Action };
export type StoreMode = "local" | "server";

export interface PersistenceInfo {
  mode: StoreMode;
  /** "postgres" | "file" once the server has answered; undefined in local mode. */
  repository?: string;
  version: number;
  ready: boolean;
  syncing: boolean;
  error: string | null;
}

const USER_KEY = "rotech-proto-user";

const StateCtx = createContext<AppState | null>(null);
const DispatchCtx = createContext<React.Dispatch<Action> | null>(null);
const PersistenceCtx = createContext<PersistenceInfo | null>(null);

function ErrorToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="error-toast" role="alert" data-testid="error-toast">
      <span>Action rejected: {message}</span>
      <button type="button" aria-label="Dismiss" onClick={onDismiss}>
        ×
      </button>
    </div>
  );
}

function readStoredUser(): string | null {
  try {
    return window.localStorage.getItem(USER_KEY);
  } catch {
    return null;
  }
}

function writeStoredUser(id: string): void {
  try {
    window.localStorage.setItem(USER_KEY, id);
  } catch {
    // not fatal
  }
}

// ---------------------------------------------------------------------------
// Local (per-browser) mode
// ---------------------------------------------------------------------------

function LocalStoreProvider({ children }: { children: React.ReactNode }) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [state, setState] = useState<AppState>(buildInitialState);
  const [hydrated, setHydrated] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const dispatch = useCallback<React.Dispatch<Action>>((action) => {
    try {
      const next = applyAction(stateRef.current, action);
      stateRef.current = next;
      setState(next);
    } catch (err) {
      // Surface domain violations loudly rather than hiding them (no silent
      // fallback) - shown as an inline banner, not a native alert dialog.
      console.error("Domain action rejected:", err);
      setErrorMessage((err as Error).message);
    }
  }, []);

  // Server render and the client's first render both call buildInitialState()
  // directly, so markup matches and there is no hydration warning. Only after
  // mount do we look at localStorage and, if a save exists, adopt it -
  // recomputing every projection rather than trusting the saved values.
  useEffect(() => {
    let saved: AppState | null = null;
    try {
      saved = parseStoredEnvelope(window.localStorage.getItem(STORAGE_KEY));
    } catch {
      saved = null;
    }
    if (saved) dispatch({ type: "hydrateState", state: saved });
    setHydrated(true);
  }, [dispatch]);

  useEffect(() => {
    if (!hydrated) return; // don't persist the pre-hydration fixture render
    try {
      window.localStorage.setItem(STORAGE_KEY, serializeEnvelope(state));
    } catch {
      // quota / disabled storage: this write just doesn't persist
    }
  }, [state, hydrated]);

  const info = useMemo<PersistenceInfo>(
    () => ({ mode: "local", version: 0, ready: hydrated, syncing: false, error: null }),
    [hydrated]
  );

  return (
    <StateCtx.Provider value={state}>
      <DispatchCtx.Provider value={dispatch}>
        <PersistenceCtx.Provider value={info}>
          {children}
          {errorMessage && <ErrorToast message={errorMessage} onDismiss={() => setErrorMessage(null)} />}
        </PersistenceCtx.Provider>
      </DispatchCtx.Provider>
    </StateCtx.Provider>
  );
}

// ---------------------------------------------------------------------------
// Server (Gate A) mode
// ---------------------------------------------------------------------------

interface ServerSnapshot {
  mode?: string;
  version: number;
  state: AppState;
}

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `cmd-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function trustedUatHeaders(employeeId: string): Record<string, string> {
  // This header is accepted only when the OEH server is explicitly running in
  // UAT mode. Hosted Sites requests use the platform's oai-authenticated-* headers.
  return process.env.NEXT_PUBLIC_OEH_UAT_MODE === "1" ? { "x-oeh-uat-employee-id": employeeId } : {};
}

function ServerStoreProvider({ children }: { children: React.ReactNode }) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [state, setState] = useState<AppState>(buildInitialState);
  const [info, setInfo] = useState<PersistenceInfo>({ mode: "server", version: 0, ready: false, syncing: false, error: null });
  const stateRef = useRef(state);
  stateRef.current = state;
  const versionRef = useRef(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingRef = useRef(0);

  const adopt = useCallback((snapshot: ServerSnapshot, userOverride?: string) => {
    const user = userOverride ?? stateRef.current.currentUserId;
    const next = recomputeAllProjections({ ...snapshot.state, currentUserId: user });
    stateRef.current = next;
    versionRef.current = snapshot.version;
    setState(next);
    setInfo((i) => ({ ...i, version: snapshot.version, repository: snapshot.mode ?? i.repository, ready: true, error: null }));
  }, []);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/state", { cache: "no-store", headers: trustedUatHeaders(stateRef.current.currentUserId) });
    if (!response.ok) throw new Error(`State fetch failed (${response.status})`);
    adopt((await response.json()) as ServerSnapshot);
  }, [adopt]);

  useEffect(() => {
    const storedUser = readStoredUser();
    (async () => {
      try {
        const initialUser = storedUser && stateRef.current.employees.some((employee) => employee.id === storedUser)
          ? storedUser
          : stateRef.current.currentUserId;
        const response = await fetch("/api/state", { cache: "no-store", headers: trustedUatHeaders(initialUser) });
        if (!response.ok) throw new Error(`State fetch failed (${response.status})`);
        const snapshot = (await response.json()) as ServerSnapshot;
        const user =
          storedUser && snapshot.state.employees.some((e) => e.id === storedUser) ? storedUser : snapshot.state.currentUserId;
        adopt(snapshot, user);
      } catch (err) {
        setInfo((i) => ({ ...i, ready: true, error: (err as Error).message }));
        setErrorMessage(`Could not load shared state: ${(err as Error).message}`);
      }
    })();
  }, [adopt]);

  const send = useCallback(
    async (action: Action) => {
      pendingRef.current += 1;
      setInfo((i) => ({ ...i, syncing: true }));
      try {
        const response = await fetch("/api/commands", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...trustedUatHeaders(stateRef.current.currentUserId) },
          body: JSON.stringify({
            idempotencyKey: newIdempotencyKey(),
            actorId: stateRef.current.currentUserId,
            expectedVersion: versionRef.current,
            action
          })
        });
        const body = (await response.json()) as ServerSnapshot & { error?: string; code?: string };
        if (response.ok) {
          adopt(body);
          return;
        }
        if (response.status === 409 && body.state) {
          adopt(body);
          setErrorMessage("Shared state changed while you were working — it has been refreshed; please repeat your last action.");
          return;
        }
        await refresh();
        setErrorMessage(body.error ?? `Command failed (${response.status})`);
      } catch (err) {
        setErrorMessage(`Could not save: ${(err as Error).message}`);
        try {
          await refresh();
        } catch {
          // keep whatever we have; the banner shows the error
        }
      } finally {
        pendingRef.current -= 1;
        if (pendingRef.current === 0) setInfo((i) => ({ ...i, syncing: false }));
      }
    },
    [adopt, refresh]
  );

  const dispatch = useCallback<React.Dispatch<Action>>(
    (action) => {
      if (action.type === "switchUser") {
        writeStoredUser(action.employeeId);
        const next = { ...stateRef.current, currentUserId: action.employeeId };
        stateRef.current = next;
        setState(next);
        return;
      }
      if (action.type === "hydrateState") {
        const next = recomputeAllProjections(action.state);
        stateRef.current = next;
        setState(next);
        return;
      }
      if (action.type === "resetToFixtures") {
        queueRef.current = queueRef.current.then(async () => {
          const response = await fetch("/api/admin/reset", { method: "POST" });
          if (!response.ok) {
            setErrorMessage("Reset is not allowed on this server");
            return;
          }
          adopt((await response.json()) as ServerSnapshot);
        });
        return;
      }
      if (LOCAL_ONLY_ACTIONS.has(action.type)) return;
      // Optimistic: the same reducer the server will run.
      try {
        const next = applyAction(stateRef.current, action);
        stateRef.current = next;
        setState(next);
      } catch (err) {
        console.error("Domain action rejected:", err);
        setErrorMessage((err as Error).message);
        return;
      }
      queueRef.current = queueRef.current.then(() => send(action));
    },
    [adopt, send]
  );

  return (
    <StateCtx.Provider value={state}>
      <DispatchCtx.Provider value={dispatch}>
        <PersistenceCtx.Provider value={info}>
          {children}
          {errorMessage && <ErrorToast message={errorMessage} onDismiss={() => setErrorMessage(null)} />}
        </PersistenceCtx.Provider>
      </DispatchCtx.Provider>
    </StateCtx.Provider>
  );
}

export function StoreProvider({ mode = "local", children }: { mode?: StoreMode; children: React.ReactNode }) {
  return mode === "server" ? <ServerStoreProvider>{children}</ServerStoreProvider> : <LocalStoreProvider>{children}</LocalStoreProvider>;
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

export function usePersistence(): PersistenceInfo {
  const p = useContext(PersistenceCtx);
  if (!p) throw new Error("usePersistence must be used inside StoreProvider");
  return p;
}
