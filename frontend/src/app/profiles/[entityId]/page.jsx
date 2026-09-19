"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Fingerprint, LoaderCircle, MessageSquarePlus, Phone, Trash2 } from "lucide-react";
import { RiskBadge } from "@/components/RiskBadge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { DataTable, TableCell, TableRow, TableSkeleton } from "@/components/ui/DataTable";
import { EmptyState, ErrorAlert, PageHeader, buttonClass, primaryButtonClass } from "@/components/ui/primitives";
import { createNote, deleteNote, getMe, getProfile } from "@/lib/api";
import { cn } from "@/lib/utils";

function money(n) {
  return `₹${Math.round(n ?? 0).toLocaleString("en-IN")}`;
}

export function ProfilePage() {
  let { entityId } = useParams();
  let [profile, setProfile] = useState(null);
  let [loading, setLoading] = useState(true);
  let [error, setError] = useState(null);
  let [me, setMe] = useState(null);
  let [draft, setDraft] = useState("");
  let [saving, setSaving] = useState(false);
  let [busyNoteId, setBusyNoteId] = useState(null);

  let load = useCallback(() => {
    setLoading(true);
    setError(null);
    getProfile(entityId)
      .then(setProfile)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [entityId]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    getMe()
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  async function submitNote() {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      await createNote({ subject: entityId, subject_kind: "entity", body: draft.trim() });
      setDraft("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function removeNote(id) {
    setBusyNoteId(id);
    try {
      await deleteNote(id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyNoteId(null);
    }
  }

  if (loading && !profile) {
    return (
      <div className="space-y-4">
        <PageHeader
          title={entityId}
          eyebrow="Profile"
          description="Every identifier resolved to this person, who they talk to, what has moved through their accounts, and the analyst notes attached to them."
        />
        <TableSkeleton cols={4} rows={5} />
      </div>
    );
  }
  if (error && !profile) {
    return (
      <div className="space-y-4">
        <PageHeader title={entityId} eyebrow="Profile" />
        <ErrorAlert>{error}</ErrorAlert>
      </div>
    );
  }
  if (!profile) return null;

  let identifierRows = Object.entries(profile.identifiers ?? {}).flatMap(([kind, values]) =>
    (values ?? []).map((v) => ({ kind, ...v })),
  );
  let a = profile.activity ?? {};

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Profile"
        title={profile.entity_id}
        description="Every identifier resolved to this person, who they talk to, what has moved through their accounts, and the analyst notes attached to them."
        actions={
          <>
            {profile.risk ? <RiskBadge band={profile.risk.band} score={profile.risk.risk_score} /> : null}
            <Link href={`/queue/${profile.entity_id}`} className={buttonClass}>
              Full assessment <ArrowLeft className="h-3.5 w-3.5 rotate-180" />
            </Link>
          </>
        }
      />
      {error ? <ErrorAlert>{error}</ErrorAlert> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardBody>
            <p className="text-[0.6875rem] uppercase tracking-[0.08em] text-ink-faint">Identifiers</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{profile.identifier_count}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-[0.6875rem] uppercase tracking-[0.08em] text-ink-faint">Calls placed</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{a.calls_placed ?? 0}</p>
            <p className="mt-0.5 text-[0.6875rem] text-ink-faint">
              {a.first_call ? `${new Date(a.first_call).toLocaleDateString()} – ${new Date(a.last_call).toLocaleDateString()}` : "no calls on record"}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-[0.6875rem] uppercase tracking-[0.08em] text-ink-faint">Sent</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{money(a.amount_sent)}</p>
            <p className="mt-0.5 text-[0.6875rem] text-ink-faint">{a.txns_sent ?? 0} transaction(s)</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-[0.6875rem] uppercase tracking-[0.08em] text-ink-faint">Received</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{money(a.amount_received)}</p>
            <p className="mt-0.5 text-[0.6875rem] text-ink-faint">{a.txns_received ?? 0} transaction(s)</p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Fingerprint className="h-4 w-4 text-ink-muted" strokeWidth={2} />
            Identifiers
          </CardTitle>
        </CardHeader>
        <CardBody>
          {identifierRows.length === 0 ? (
            <EmptyState title="No identifiers resolved to this entity" />
          ) : (
            <DataTable head={["Kind", "Value", "Resolved by"]}>
              {identifierRows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="text-ink-muted">{r.kind}</TableCell>
                  <TableCell className="font-mono">{r.value}</TableCell>
                  <TableCell className="text-ink-faint">{r.resolved_by}</TableCell>
                </TableRow>
              ))}
            </DataTable>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-ink-muted" strokeWidth={2} />
            Contacts ({(profile.contacts ?? []).length})
          </CardTitle>
        </CardHeader>
        <CardBody>
          {(profile.contacts ?? []).length === 0 ? (
            <EmptyState title="No contact activity on record" />
          ) : (
            <DataTable head={["Number", "Entity", "Calls out", "Calls in", "SMS out", "SMS in", "Duration"]}>
              {profile.contacts.map((c, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono">{c.msisdn}</TableCell>
                  <TableCell>
                    {c.entity_id ? (
                      <Link href={`/profiles/${c.entity_id}`} className="text-accent-bright hover:underline">
                        {c.entity_id}
                      </Link>
                    ) : (
                      <span className="text-ink-faint">unresolved</span>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums text-ink-muted">{c.calls_out}</TableCell>
                  <TableCell className="tabular-nums text-ink-muted">{c.calls_in}</TableCell>
                  <TableCell className="tabular-nums text-ink-muted">{c.sms_out}</TableCell>
                  <TableCell className="tabular-nums text-ink-muted">{c.sms_in}</TableCell>
                  <TableCell className="tabular-nums text-ink-faint">{Math.round(c.seconds / 60)} min</TableCell>
                </TableRow>
              ))}
            </DataTable>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquarePlus className="h-4 w-4 text-ink-muted" strokeWidth={2} />
            Notes
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-start gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              placeholder="Add a note against this entity — visible to every analyst who opens it next…"
              className="focus-ring min-w-[16rem] flex-1 rounded border border-canvas-border bg-canvas px-2.5 py-1.5 text-[0.8125rem] text-ink placeholder:text-ink-faint"
            />
            <button type="button" onClick={submitNote} disabled={saving || !draft.trim()} className={primaryButtonClass}>
              {saving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
              Add note
            </button>
          </div>
          {(profile.notes ?? []).length === 0 ? (
            <p className="text-[0.8125rem] text-ink-faint">No notes recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {profile.notes.map((n) => (
                <li key={n.id} className="flex items-start justify-between gap-3 rounded border border-canvas-border bg-canvas-raised p-2.5">
                  <div className="min-w-0">
                    <p className="text-[0.8125rem] leading-relaxed text-ink">{n.body}</p>
                    <p className="mt-1 text-[0.6875rem] text-ink-faint">
                      {n.author} · {new Date(n.created_at).toLocaleString()}
                    </p>
                  </div>
                  {me && (me.username === n.author || me.is_supervisor) ? (
                    <button
                      type="button"
                      onClick={() => removeNote(n.id)}
                      disabled={busyNoteId === n.id}
                      className={cn("shrink-0 rounded p-1 text-ink-faint transition hover:bg-canvas-hover hover:text-risk", busyNoteId === n.id && "opacity-50")}
                      title="Delete note"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

export default ProfilePage;
