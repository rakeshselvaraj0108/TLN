"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FolderKanban, LoaderCircle, Plus } from "lucide-react";
import { EmptyState, ErrorAlert, PageHeader, primaryButtonClass } from "@/components/ui/primitives";
import { createCase, getCases } from "@/lib/api";
import { cn } from "@/lib/utils";
let h = {
  open: "border-canvas-border text-ink-muted",
  review: "border-accent/40 bg-accent/10 text-accent-bright",
  closed: "border-ok/40 bg-ok/15 text-ok",
};
export default function CasesPage() {
  let [e, t] = useState(null);
  let [n, f] = useState("");
  let [m, p] = useState(false);
  let [x, b] = useState(null);
  async function v() {
    try {
      t(await getCases());
    } catch (e) {
      b(String(e));
    }
  }
  useEffect(() => {
    v();
  }, []);
  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader
        title="Cases"
        description="A case pins a set of entities together with notes and a shared timeline. Status moves open → review → closed; only a supervisor may close one."
      />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (n.trim()) {
            p(true);
            b(null);
            try {
              await createCase(n.trim());
              f("");
              await v();
            } catch (e) {
              b(String(e));
            } finally {
              p(false);
            }
          }
        }}
        className="flex gap-2"
      >
        <input
          value={n}
          onChange={(e) => f(e.target.value)}
          placeholder="New case title…"
          className="focus-ring flex-1 rounded border border-canvas-border bg-canvas-raised px-3 py-1.5 text-[0.8125rem] text-ink transition placeholder:text-ink-faint"
        />
        <button type="submit" disabled={m || !n.trim()} className={primaryButtonClass}>
          {m ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Create
        </button>
      </form>
      {x ? <ErrorAlert>{x}</ErrorAlert> : null}
      {e ? (
        e.length === 0 ? (
          <EmptyState title="No cases yet" icon={FolderKanban}>
            Create one above, then pin entities to it from the risk queue.
          </EmptyState>
        ) : (
          <ul className="stagger space-y-1.5">
            {e.map((e) => {
              return (
                <li key={e.id}>
                  <Link
                    href={`/cases/${e.id}`}
                    className="flex items-center justify-between gap-3 rounded border border-canvas-border bg-canvas-panel px-3 py-2.5 text-[0.8125rem] shadow-panel transition hover:border-accent/30 hover:bg-canvas-hover"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <FolderKanban className="h-4 w-4 shrink-0 text-ink-faint" />
                      <span className="mono shrink-0 text-accent-bright">{e.case_code}</span>
                      <span className="truncate text-ink">{e.title}</span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded border px-1.5 py-0.5 text-[0.6875rem] uppercase tracking-wider",
                        h[e.status] ?? h.open,
                      )}
                    >
                      {e.status}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )
      ) : (
        <div className="space-y-1.5" aria-busy={true}>
          {[0, 1, 2].map((e) => (
            <div className="skeleton h-11 rounded" key={e} />
          ))}
        </div>
      )}
    </div>
  );
}
