"use client";

// Activity feed: posts, one level of replies, mentions, attachment cards,
// unread indicators, follow control, and comment-to-record conversion that
// preserves the original comment.

import Link from "next/link";
import { useState } from "react";
import { useAppDispatch, useAppState } from "@/store/StoreProvider";
import { employeeName, postsForOrder, unitsForOrder } from "@/domain/selectors";
import type { ActivityPost, ConvertedKind } from "@/domain/types";
import { Exact, MockPhoto } from "./bits";

function BodyWithMentions({ body }: { body: string }) {
  const parts = body.split(/(@[A-Za-z]+)/g);
  return (
    <div className="post-body">
      {parts.map((p, i) =>
        p.startsWith("@") ? (
          <span key={i} className="mention">
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </div>
  );
}

function ConvertedCard({ post }: { post: ActivityPost }) {
  const state = useAppState();
  if (!post.convertedTo) return null;
  const { kind, recordId } = post.convertedTo;
  let summary = "";
  let href: string | null = null;
  if (kind === "MaterialChange") {
    const mc = state.materialChanges.find((m) => m.id === recordId);
    if (mc) {
      summary = `${mc.orderedMaterial} → ${mc.proposedMaterial} on ${mc.unitId} · ${mc.status}`;
      href = `/orders/${post.orderNumber}?tab=materials`;
    }
  } else if (kind === "SpecialInstruction") {
    const swi = state.specialInstructions.find((s) => s.id === recordId);
    if (swi) {
      summary = `${swi.part}: ${swi.instruction} (${swi.unitId}) · ${swi.verificationStatus}`;
      href = `/units/${swi.unitId}`;
    }
  } else if (kind === "Problem") {
    const pr = state.problems.find((p) => p.id === recordId);
    if (pr) {
      summary = `${pr.description} · ${pr.status}`;
      href = pr.unitId ? `/units/${pr.unitId}` : `/orders/${pr.orderNumber}`;
    }
  } else {
    const t = state.tasks.find((x) => x.id === recordId);
    if (t) {
      summary = `Task "${t.name}" on ${t.unitId} · ${t.status}`;
      href = `/units/${t.unitId}`;
    }
  }
  return (
    <div className="converted-card" data-testid={`converted-${post.id}`}>
      🔗 Converted to <b>{kind}</b> <code>{recordId}</code>
      {summary && <> — {summary}</>}
      {href && (
        <>
          {" "}
          <Link href={href}>Open record</Link>
        </>
      )}
      <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>
        Original comment preserved above.
      </div>
    </div>
  );
}

function ConvertMenu({ post }: { post: ActivityPost }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ConvertedKind>("Task");
  const [unitId, setUnitId] = useState<string>(post.unitId ?? "");
  const [detail, setDetail] = useState("");
  const units = unitsForOrder(state, post.orderNumber);

  if (post.convertedTo) return null;
  if (!open) {
    return (
      <button className="btn" style={{ minHeight: 36 }} onClick={() => setOpen(true)}>
        Convert to record…
      </button>
    );
  }
  return (
    <div className="card" style={{ marginTop: 8, background: "var(--bg-subtle)" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <label>
          Record type{" "}
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as ConvertedKind)}
            style={{ width: "auto" }}
            data-testid="convert-kind"
          >
            <option value="Task">Task</option>
            <option value="Problem">Problem</option>
            <option value="MaterialChange">Material Change</option>
            <option value="SpecialInstruction">Special Work Instruction</option>
          </select>
        </label>
        <label>
          Target Unit{" "}
          <select
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            style={{ width: "auto" }}
            data-testid="convert-unit"
          >
            <option value="">(order level — Problem only)</option>
            {units.map((u) => (
              <option key={u.unitId} value={u.unitId}>
                {u.unitId}
              </option>
            ))}
          </select>
        </label>
      </div>
      <input
        style={{ marginTop: 8 }}
        data-testid="convert-detail"
        placeholder={
          kind === "MaterialChange"
            ? "Proposed material (e.g. CD4MCu)"
            : kind === "SpecialInstruction"
              ? "Part affected (e.g. Stub shaft)"
              : "Short name/description (optional)"
        }
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
      />
      <div className="composer-actions" style={{ marginTop: 8 }}>
        <button
          className="btn btn-primary"
          onClick={() => {
            dispatch({
              type: "convertPost",
              postId: post.id,
              input: {
                kind,
                unitId: unitId || null,
                proposedMaterial: kind === "MaterialChange" ? detail || undefined : undefined,
                part: kind === "SpecialInstruction" ? detail || undefined : undefined,
                name: kind === "Task" ? detail || undefined : undefined,
                description: kind === "Problem" ? detail || undefined : undefined
              }
            });
            setOpen(false);
          }}
        >
          Create linked record
        </button>
        <button className="btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function PostCard({ post }: { post: ActivityPost }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);

  return (
    <article className={`post-card ${post.unread ? "unread" : ""}`} data-testid={`post-${post.id}`}>
      <div className="post-head">
        <span className="post-author">{employeeName(state, post.authorId)}</span>
        <span className="badge s-notstarted">{post.category}</span>
        {post.unitId && (
          <Link href={`/units/${post.unitId}`} style={{ fontSize: 12.5 }}>
            {post.unitId}
          </Link>
        )}
        <span className="post-time">
          <Exact at={post.at} />
        </span>
        {post.unread && (
          <button className="pill-link" style={{ fontSize: 12 }} onClick={() => dispatch({ type: "markPostRead", postId: post.id })}>
            Mark read
          </button>
        )}
      </div>
      <BodyWithMentions body={post.body} />
      {post.attachmentIds.map((aid) => {
        const a = state.attachments.find((x) => x.id === aid);
        if (!a) return null;
        return (
          <div key={aid} className="attachment-card">
            {a.kind === "photo" ? (
              <MockPhoto art={a.placeholderArt} caption={`${a.fileName} · ${a.category}`} width={140} height={90} />
            ) : (
              <span>📄 {a.fileName}</span>
            )}
          </div>
        );
      })}
      <ConvertedCard post={post} />
      {post.replies.map((r) => (
        <div key={r.id} className="reply">
          <span className="post-author" style={{ fontSize: 13.5 }}>
            {employeeName(state, r.authorId)}
          </span>{" "}
          <span className="post-time">
            <Exact at={r.at} />
          </span>
          <BodyWithMentions body={r.body} />
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        {!replying ? (
          <button className="btn" style={{ minHeight: 36 }} onClick={() => setReplying(true)}>
            Reply
          </button>
        ) : (
          <div className="composer" style={{ flex: 1 }}>
            <input
              placeholder="Write a reply…"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              aria-label="Reply text"
            />
            <div className="composer-actions">
              <button
                className="btn btn-primary"
                style={{ minHeight: 36 }}
                disabled={!replyText.trim()}
                onClick={() => {
                  dispatch({ type: "addReply", postId: post.id, body: replyText });
                  setReplyText("");
                  setReplying(false);
                }}
              >
                Post reply
              </button>
              <button className="btn" style={{ minHeight: 36 }} onClick={() => setReplying(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
        <ConvertMenu post={post} />
      </div>
    </article>
  );
}

export function ActivityFeed({
  orderNumber,
  unitId
}: {
  orderNumber: string;
  unitId?: string;
}) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [body, setBody] = useState("");
  const posts = postsForOrder(state, orderNumber, unitId);
  const units = unitsForOrder(state, orderNumber);
  const [targetUnit, setTargetUnit] = useState<string>(unitId ?? "");
  const following = state.followedOrders.includes(orderNumber);

  return (
    <div>
      <div className="card composer">
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <b>New post</b>
          <button
            className="pill-link"
            onClick={() => dispatch({ type: "toggleFollowOrder", orderNumber })}
          >
            {following ? "★ Following — unfollow" : "☆ Follow this order"}
          </button>
        </div>
        <textarea
          rows={3}
          placeholder="Share an update… use @Name to mention someone"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-label="New post text"
        />
        {!unitId && (
          <label style={{ fontSize: 13 }}>
            Target{" "}
            <select value={targetUnit} onChange={(e) => setTargetUnit(e.target.value)} style={{ width: "auto" }}>
              <option value="">Whole order</option>
              {units.map((u) => (
                <option key={u.unitId} value={u.unitId}>
                  {u.unitId}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="composer-actions">
          <button
            className="btn btn-primary"
            disabled={!body.trim()}
            onClick={() => {
              dispatch({
                type: "addPost",
                orderNumber,
                unitId: unitId ?? (targetUnit || null),
                body
              });
              setBody("");
            }}
          >
            Post
          </button>
        </div>
      </div>

      {posts.length === 0 && (
        <p style={{ color: "var(--text-subtle)" }}>No activity yet for this record.</p>
      )}
      {posts.map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
    </div>
  );
}
