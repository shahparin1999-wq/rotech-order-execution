// Gate A persistence: how AppState maps onto durable storage.
//
// Every array on AppState is a COLLECTION of records keyed by one stable id
// field. Everything else on AppState is a small set of SCALARS kept in the
// state metadata row. The reducer keeps producing whole AppState values; the
// repository diffs consecutive states per collection and writes only what
// changed, inside one transaction, with an optimistic state version.
//
// `currentUserId` is deliberately NOT persisted: it is the viewer's own mock
// identity (a per-session fact), never shared state.

import type { AppState } from "@/domain/types";

export type CollectionName = {
  [K in keyof AppState]: AppState[K] extends unknown[] ? K : never;
}[keyof AppState];

export const COLLECTION_KEYS: Record<CollectionName, string> = {
  employees: "id",
  customers: "id",
  contacts: "id",
  orders: "id",
  units: "unitId",
  routeOps: "id",
  tasks: "id",
  checklistDefs: "key",
  responses: "id",
  posts: "id",
  materialChanges: "id",
  specialInstructions: "id",
  problems: "id",
  attachments: "id",
  auditEvents: "id",
  qrIdentities: "publicRef",
  components: "id",
  materialLots: "id",
  transfers: "id",
  pallets: "id",
  configurationSnapshots: "id",
  manufacturingNotes: "id",
  configurationAdjustments: "id",
  workingBomRows: "id",
  attentionItems: "id",
  pump1196Configs: "id",
  componentRequirements1196: "id",
  serviceRequirements1196: "id",
  confirmationRecords1196: "id",
  configuredLines: "id",
  requirements: "id",
  fulfillments: "id",
  componentUsages: "id",
  inventoryIdentities: "id",
  inventoryMovements: "id",
  inventoryReceipts: "id",
  inventoryReceiptLines: "id",
  inventoryLocations: "id",
  internalJobs: "id",
  shipmentFiles: "id",
  parseRuns: "id",
  parsedFields: "id",
  expectedShipments: "id",
  openingImports: "id",
  reconciliationExceptions: "id",
  vendorPoReferences: "id",
  // string arrays: the value is its own key
  favourites: "",
  followedOrders: ""
};

export const COLLECTION_NAMES = Object.keys(COLLECTION_KEYS) as CollectionName[];

/** Scalars stored in the metadata row rather than as records. */
export const SCALAR_NAMES = ["nextId"] as const;
export type ScalarName = (typeof SCALAR_NAMES)[number];

/** Per-session fields that must never reach shared storage. */
export const SESSION_ONLY_FIELDS = ["currentUserId"] as const;

export function recordId(collection: CollectionName, record: unknown): string {
  const key = COLLECTION_KEYS[collection];
  if (key === "") return String(record);
  const value = (record as Record<string, unknown>)[key];
  if (typeof value !== "string" || value === "") {
    throw new Error(`Record in ${collection} has no usable ${key}`);
  }
  return value;
}

export interface PersistedRecord {
  collection: CollectionName;
  id: string;
  seq: number;
  payload: unknown;
}

export interface StateDiff {
  upserts: PersistedRecord[];
  deletes: Array<{ collection: CollectionName; id: string }>;
  scalars: Partial<Record<ScalarName, unknown>>;
}

function stable(value: unknown): string {
  return JSON.stringify(value);
}

/**
 * Records that must be written or removed to move storage from `prev` to
 * `next`. Position (`seq`) is part of the record so array order survives a
 * reload — the domain relies on it (movement history, unit sequence).
 */
export function diffStates(prev: AppState | null, next: AppState): StateDiff {
  const upserts: PersistedRecord[] = [];
  const deletes: StateDiff["deletes"] = [];
  for (const collection of COLLECTION_NAMES) {
    const nextItems = next[collection] as unknown[];
    const prevItems = (prev ? (prev[collection] as unknown[]) : []) ?? [];
    const prevById = new Map<string, { seq: number; json: string }>();
    prevItems.forEach((item, seq) => prevById.set(recordId(collection, item), { seq, json: stable(item) }));
    const seen = new Set<string>();
    nextItems.forEach((item, seq) => {
      const id = recordId(collection, item);
      if (seen.has(id)) throw new Error(`Duplicate id ${id} in ${collection}`);
      seen.add(id);
      const json = stable(item);
      const before = prevById.get(id);
      if (!before || before.seq !== seq || before.json !== json) {
        upserts.push({ collection, id, seq, payload: item });
      }
    });
    for (const id of prevById.keys()) {
      if (!seen.has(id)) deletes.push({ collection, id });
    }
  }
  const scalars: StateDiff["scalars"] = {};
  for (const name of SCALAR_NAMES) {
    if (!prev || prev[name] !== next[name]) scalars[name] = next[name];
  }
  return { upserts, deletes, scalars };
}

/** Rebuilds an AppState from stored records + scalars. Session-only fields take the given defaults. */
export function assembleState(
  records: PersistedRecord[],
  scalars: Partial<Record<ScalarName, unknown>>,
  sessionDefaults: { currentUserId: string }
): AppState {
  const state: Record<string, unknown> = { currentUserId: sessionDefaults.currentUserId };
  for (const collection of COLLECTION_NAMES) state[collection] = [];
  const byCollection = new Map<CollectionName, PersistedRecord[]>();
  for (const record of records) {
    const list = byCollection.get(record.collection) ?? [];
    list.push(record);
    byCollection.set(record.collection, list);
  }
  for (const [collection, list] of byCollection) {
    list.sort((a, b) => a.seq - b.seq);
    state[collection] = COLLECTION_KEYS[collection] === "" ? list.map((r) => r.id) : list.map((r) => r.payload);
  }
  for (const name of SCALAR_NAMES) {
    state[name] = scalars[name];
  }
  if (typeof state.nextId !== "number") throw new Error("Persisted state is missing nextId");
  return state as unknown as AppState;
}
