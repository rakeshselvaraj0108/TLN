"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleCheck, CircleX, Cpu, LoaderCircle, ShieldCheck, Users } from "lucide-react";
import { ErrorAlert, PageHeader } from "@/components/ui/primitives";
import { getHealth, getMe, getUsers } from "@/lib/api";
import { DEFAULT_USER, getActiveUser, setActiveUser } from "@/lib/identity";
let _Component = Cpu;
export default function SettingsPage() {
  let [e, t] = useState(null);
  let [n, x] = useState(null);
  let [p, f] = useState([]);
  let [b, v] = useState(DEFAULT_USER);
  let [y, k] = useState(null);
  let g = useCallback(() => {
    v(getActiveUser());
    getHealth()
      .then(t)
      .catch((e) => k(String(e)));
    getMe()
      .then(x)
      .catch(() => x(null));
    getUsers()
      .then((e) => f(e.users))
      .catch(() => {});
  }, []);
  useEffect(() => {
    g();
    window.addEventListener("tracex:user-changed", g);
    return () => window.removeEventListener("tracex:user-changed", g);
  }, [g]);
  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader
        title="Settings"
        description="Identity, model provider, and service status for this deployment."
      />
      {y ? <ErrorAlert>{y}</ErrorAlert> : null}
      <section className="rounded border border-canvas-border bg-canvas-panel p-4 shadow-panel">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
          <Users className="h-4 w-4 text-accent-bright" /> Acting as
        </h2>
        <p className="mb-3 text-[0.8125rem] text-ink-muted">
          The demo authenticates with a bearer token that is simply the username; the API validates
          it against the provisioned accounts. A real deployment replaces this with the department's
          SSO — no client code changes, because every request already carries the identity.
        </p>
        <div className="space-y-1.5">
          {p.map((e) => (
            <label
              className="flex cursor-pointer items-center gap-2.5 rounded border border-canvas-border/60 px-3 py-2 text-[0.8125rem] hover:bg-canvas-hover"
              key={e.username}
            >
              <input
                type="radio"
                name="user"
                checked={b === e.username}
                onChange={() => setActiveUser(e.username)}
                className="accent-[#2563eb]"
              />
              <span className="mono text-ink">{e.username}</span>
              <span className="text-ink-muted">{e.display_name}</span>
              <span
                className={
                  "ml-auto rounded px-1.5 py-0.5 text-[0.6875rem] uppercase tracking-wider " +
                  (e.role === "supervisor"
                    ? "bg-accent/15 text-accent-bright"
                    : "border border-canvas-border text-ink-faint")
                }
              >
                {e.role}
              </span>
            </label>
          ))}
        </div>
        {n ? (
          <p className="mt-3 border-t border-canvas-border pt-2 text-[0.75rem] text-ink-faint">
            Server sees you as <span className="mono text-ink-muted">{n.username}</span> ({n.role}).
            Supervisor-only actions: close a case, export an evidence package.
          </p>
        ) : null}
      </section>
      <section className="rounded border border-canvas-border bg-canvas-panel p-4 shadow-panel">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
          <_Component className="h-4 w-4 text-accent-bright" /> Language model
        </h2>
        {e ? (
          <div className="space-y-1 text-[0.8125rem] text-ink-muted">
            <div className="flex justify-between">
              <span>Provider</span>
              <span className="mono text-ink">{e.llm.provider}</span>
            </div>
            <div className="flex justify-between">
              <span>Ready</span>
              <span className="mono text-ink">{String(e.llm.ready)}</span>
            </div>
          </div>
        ) : (
          <LoaderCircle className="h-4 w-4 animate-spin text-ink-muted" />
        )}
        <p className="mt-3 border-t border-canvas-border pt-2 text-[0.75rem] text-ink-faint">
          Set <span className="mono">LLM_PROVIDER=stub</span> (deterministic planner, default), <span className="mono">ollama</span> (a local server) or{" "}
          <span className="mono">anthropic</span> (the Claude API, needs <span className="mono">ANTHROPIC_API_KEY</span>). <span className="mono">auto</span> never picks a cloud
          provider; a cloud model is used only when an operator asks for it by name, and then tool results leave this machine. A model chooses tools and phrases
          answers — it never scores or decides.
        </p>
      </section>
      <section className="rounded border border-canvas-border bg-canvas-panel p-4 shadow-panel">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
          <ShieldCheck className="h-4 w-4 text-accent-bright" /> Services
        </h2>
        {e ? (
          <ul className="space-y-1.5">
            {e.services.map((e) => (
              <li className="flex items-center justify-between text-[0.8125rem]" key={e.name}>
                <span className="flex items-center gap-2 text-ink-muted">
                  {e.ok ? (
                    <CircleCheck className="h-4 w-4 text-ok" />
                  ) : (
                    <CircleX className="h-4 w-4 text-risk" />
                  )}
                  {e.name}
                </span>
                {e.detail ? <span className="mono">{e.detail}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <LoaderCircle className="h-4 w-4 animate-spin text-ink-muted" />
        )}
      </section>
    </div>
  );
}
