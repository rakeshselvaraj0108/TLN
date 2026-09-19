"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, LoaderCircle, Plus, X } from "lucide-react";
import { DocumentsPanel } from "@/components/documents/DocumentsPanel";
import { EventTimeline } from "@/components/EventTimeline";
import { RiskBadge } from "@/components/RiskBadge";
import { EmptyState, ErrorAlert } from "@/components/ui/primitives";
import {
  addCaseEntity,
  addCaseNote,
  getCase,
  getCaseTimeline,
  getQueue,
  removeCaseEntity,
  updateCaseStatus,
} from "@/lib/api";
let p = ["open", "review", "closed"];
export default function CasesByCaseIdPage() {
  let a = Number(useParams()?.caseId ?? 0);
  let [o, y] = useState(null);
  let [v, k] = useState([]);
  let [j, g] = useState([]);
  let [N, w] = useState("");
  let [Z, _] = useState("");
  let [M, S] = useState(null);
  let [C, P] = useState(false);
  let [H, q] = useState(false);
  let A = useCallback(async () => {
    let [e, t, n] = await Promise.allSettled([getCase(a), getCaseTimeline(a), getQueue()]);
    if (e.status === "fulfilled") {
      y(e.value);
      S(null);
    } else {
      S(String(e.reason));
    }
    k(t.status === "fulfilled" ? t.value.events : []);
    g(n.status === "fulfilled" ? n.value.items : []);
    P(t.status === "rejected");
  }, [a]);
  let z = useCallback(
    async (e) => {
      q(true);
      S(null);
      try {
        await e();
        await A();
      } catch (e) {
        S(String(e));
      } finally {
        q(false);
      }
    },
    [A],
  );
  useEffect(() => {
    A();
  }, [A]);
  if (M && !o) {
    return (
      <div className="space-y-3">
        <_Component />
        <ErrorAlert>{M}</ErrorAlert>
      </div>
    );
  }
  if (!o) {
    return (
      <div className="flex items-center gap-2 text-ink-muted">
        <LoaderCircle className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  let E = new Set(o.entities.map((e) => e.entity_id));
  let V = j.filter((e) => !E.has(e.entity_id));
  return (
    <div className="max-w-4xl space-y-5">
      <_Component />
      {M ? <ErrorAlert>{M}</ErrorAlert> : null}
      <div className="sticky top-0 z-10 -mx-6 flex flex-wrap items-center gap-3 border-b border-canvas-border bg-canvas/95 px-6 pb-3 backdrop-blur">
        <span className="mono text-lg font-semibold text-accent-bright">{o.case_code}</span>
        <h1 className="min-w-0 truncate font-serif text-[1.75rem] font-light leading-[1.1] tracking-[-0.03em] text-ink">
          {o.title}
        </h1>
        <select
          value={o.status}
          disabled={H}
          aria-label="Case status"
          onChange={(e) => z(() => updateCaseStatus(a, e.target.value))}
          className="focus-ring ml-auto rounded border border-canvas-border bg-canvas-raised px-2 py-1 text-[0.75rem] uppercase tracking-wider text-ink transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          {p.map((e) => (
            <option value={e} key={e}>
              {e}
            </option>
          ))}
        </select>
      </div>
      <section className="rounded border border-canvas-border bg-canvas-panel p-4 shadow-panel">
        <DocumentsPanel caseId={a} title="Documents read on this case" />
      </section>
      <section className="rounded border border-canvas-border bg-canvas-panel p-4 shadow-panel">
        <h2 className="mb-2 text-sm font-semibold text-ink">Entities ({o.entities.length})</h2>
        {o.entities.length === 0 ? (
          <EmptyState title="No entities pinned">
            Add one below, or pin it from the risk queue.
          </EmptyState>
        ) : (
          <ul className="mb-3 space-y-1">
            {o.entities.map((e) => {
              return (
                <li
                  className="flex items-center justify-between rounded border border-canvas-border/60 px-2.5 py-1.5 text-[0.8125rem]"
                  key={e.entity_id}
                >
                  <span className="flex items-center gap-2.5">
                    <Link
                      href={`/queue/${e.entity_id}`}
                      className="mono text-accent-bright hover:underline"
                    >
                      {e.entity_id}
                    </Link>
                    {e.band ? <RiskBadge band={e.band} score={e.risk_score ?? undefined} /> : null}
                    {e.label ? <span className="text-ink-muted">{e.label}</span> : null}
                  </span>
                  <button
                    type="button"
                    disabled={H}
                    onClick={() => z(() => removeCaseEntity(a, e.entity_id))}
                    aria-label={`Remove ${e.entity_id} from this case`}
                    className="focus-ring rounded p-0.5 text-ink-faint transition hover:text-risk disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex gap-2">
          <select
            value={Z}
            onChange={(e) => _(e.target.value)}
            className="flex-1 rounded border border-canvas-border bg-canvas-raised px-2 py-1 text-[0.8125rem] text-ink"
          >
            <option value="">Add from risk queue…</option>
            {V.map((e) => (
              <option value={e.entity_id} key={e.entity_id}>
                {e.entity_id} — {e.band} {e.risk_score.toFixed(2)}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!Z || H}
            onClick={() =>
              z(async () => {
                await addCaseEntity(a, Z);
                _("");
              })
            }
            className="focus-ring flex items-center gap-1.5 rounded border border-accent/40 bg-accent/10 px-2.5 py-1 text-[0.8125rem] text-accent-bright transition hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {H ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}{" "}
            Add
          </button>
        </div>
      </section>
      <section>
        <h2 className="mb-2 text-sm font-semibold text-ink">Case timeline</h2>
        {C ? (
          <EmptyState title="Timeline unavailable">
            The case timeline is assembled from the knowledge graph, which is unreachable.
            Everything else on this page is unaffected.
          </EmptyState>
        ) : (
          <EventTimeline events={v} />
        )}
      </section>
      <section className="rounded border border-canvas-border bg-canvas-panel p-4 shadow-panel">
        <h2 className="mb-2 text-sm font-semibold text-ink">Notes ({o.notes.length})</h2>
        <div className="mb-3 flex gap-2">
          <input
            value={N}
            onChange={(e) => w(e.target.value)}
            placeholder="Add a note…"
            className="flex-1 rounded border border-canvas-border bg-canvas-raised px-2.5 py-1.5 text-[0.8125rem] text-ink placeholder:text-ink-faint"
          />
          <button
            type="button"
            disabled={!N.trim() || H}
            onClick={() =>
              z(async () => {
                await addCaseNote(a, N.trim());
                w("");
              })
            }
            className="focus-ring inline-flex items-center gap-1.5 rounded border border-accent/40 bg-accent/10 px-3 py-1.5 text-[0.8125rem] text-accent-bright transition hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {H ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}Add
          </button>
        </div>
        <ul className="space-y-2">
          {o.notes.map((e) => (
            <li className="border-l-2 border-canvas-border pl-3 text-[0.8125rem]" key={e.id}>
              <div className="text-ink">{e.body}</div>
              <div className="text-[0.6875rem] text-ink-faint">
                {e.author} · {e.created_at ? new Date(e.created_at).toLocaleString() : ""}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
function _Component() {
  return (
    <Link
      href="/cases"
      className="inline-flex items-center gap-1.5 text-[0.8125rem] text-ink-muted hover:text-ink"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> Cases
    </Link>
  );
}
