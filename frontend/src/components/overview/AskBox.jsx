"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CornerDownLeft, LoaderCircle, Mic, MicOff, Square, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { ErrorAlert, buttonClass, primaryButtonClass } from "@/components/ui/primitives";
import { ask } from "@/lib/api";
import { cn } from "@/lib/utils";
let _Component = Square;
let _Component2 = Mic;
let _Component3 = MicOff;
function v() {
  let n = window;
  return n.SpeechRecognition ?? n.webkitSpeechRecognition ?? null;
}
let b = "tracex.voice.consent";
export function AskBox() {
  let [e, t] = useState("");
  let [n, a] = useState(null);
  let [l, m] = useState(false);
  let [g, k] = useState(null);
  let [j, w] = useState(false);
  let [N, S] = useState("");
  let [C, A] = useState(false);
  let [M, _] = useState(false);
  let [E, R] = useState(false);
  let O = useRef(null);
  let T = useRef("");
  useEffect(() => {
    A(v() !== null);
    let e = (function () {
      if (typeof navigator == "undefined") {
        return false;
      }
      let e = navigator.userAgent;
      return /^((?!chrome|android|crios|fxios).)*safari/i.test(e);
    })();
    _(e);
    try {
      R(e || window.localStorage.getItem(b) === "yes");
    } catch (t) {
      R(e);
    }
  }, []);
  let P = useCallback(async (e, t) => {
    let n = e.trim();
    if (n) {
      m(true);
      k(null);
      try {
        a(await ask(n, t));
      } catch (e) {
        k(e instanceof Error ? e.message : String(e));
      } finally {
        m(false);
      }
    }
  }, []);
  useEffect(
    () => () => {
      var e;
      if ((e = O.current) === null || e === undefined) {
        return undefined;
      } else {
        return e.abort();
      }
    },
    [],
  );
  let Z = !C || (!M && !E) || l;
  return (
    <section className="space-y-3 rounded border border-canvas-border bg-canvas-panel p-4 shadow-panel">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">Ask</h2>
        <span className="text-[0.6875rem] text-ink-faint">
          Answers come from this system's own data — never invented.
        </span>
      </header>
      <form
        onSubmit={(t) => {
          t.preventDefault();
          P(e, "text");
        }}
        className="flex flex-wrap gap-2"
      >
        <label htmlFor="ask-input" className="sr-only">
          Ask a question about the investigation data
        </label>
        <input
          id="ask-input"
          value={j && N ? `${e} ${N}`.trim() : e}
          onChange={(e) => t(e.target.value)}
          placeholder={j ? "Listening…" : "Ask a question, or press the mic…"}
          className="focus-ring min-w-[14rem] flex-1 rounded border border-canvas-border bg-canvas-raised px-3 py-1.5 text-[0.8125rem] text-ink transition placeholder:text-ink-faint"
        />
        <button
          type="button"
          onClick={
            j
              ? function () {
                  var e;
                  if ((e = O.current) !== null && e !== undefined) {
                    e.stop();
                  }
                  w(false);
                }
              : function () {
                  let e = v();
                  if (!e) {
                    return;
                  }
                  k(null);
                  S("");
                  T.current = "";
                  let n = new e();
                  n.lang = navigator.language || "en-US";
                  n.continuous = false;
                  n.interimResults = true;
                  n.onresult = (e) => {
                    let n = "";
                    for (let t = e.resultIndex; t < e.results.length; t++) {
                      let r = e.results[t];
                      if (r.isFinal) {
                        T.current += r[0].transcript;
                      } else {
                        n += r[0].transcript;
                      }
                    }
                    S(n);
                    if (T.current) {
                      t(T.current.trim());
                    }
                  };
                  n.onerror = (e) => {
                    w(false);
                    k(
                      e.error === "not-allowed"
                        ? "Microphone access was blocked. Allow it in your browser's site settings, or type the question instead."
                        : e.error === "no-speech"
                          ? "I didn't catch anything. Try again, or type the question."
                          : `Speech recognition failed (${e.error}). You can type the question instead.`,
                    );
                  };
                  n.onend = () => {
                    w(false);
                    S("");
                    let e = T.current.trim();
                    if (e) {
                      P(e, "voice");
                    }
                  };
                  O.current = n;
                  w(true);
                  try {
                    n.start();
                  } catch (e) {
                    w(false);
                    k("Could not start the microphone.");
                  }
                }
          }
          disabled={Z}
          aria-pressed={j}
          className={cn(buttonClass, j && "border-risk text-risk")}
          title={
            C
              ? M || E
                ? j
                  ? "Stop listening"
                  : "Ask by voice"
                : "Voice input needs to be enabled — see the note below."
              : "This browser has no speech recognition. Type the question instead."
          }
        >
          {j ? (
            <_Component className="h-3.5 w-3.5" />
          ) : C ? (
            <_Component2 className="h-3.5 w-3.5" />
          ) : (
            <_Component3 className="h-3.5 w-3.5" />
          )}
          {j ? "Stop" : "Speak"}
        </button>
        <button type="submit" disabled={l || !e.trim()} className={primaryButtonClass}>
          {l ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CornerDownLeft className="h-3.5 w-3.5" />
          )}
          Ask
        </button>
      </form>
      {j ? (
        <p className="flex items-center gap-2 text-[0.75rem] text-risk" aria-live="polite">
          <span className="pulse-dot" aria-hidden="true" />
          Listening — it will send as soon as you stop speaking.
        </p>
      ) : null}
      {C && !M ? (
        <div className="rounded border border-risk-border bg-risk-bg p-3 text-[0.75rem]">
          <div className="mb-1 flex items-center gap-1.5 font-medium text-risk">
            <TriangleAlert className="h-3.5 w-3.5" />
            Voice input in this browser is not on-device
          </div>
          <p className="leading-relaxed text-ink-muted">
            Chromium-based browsers send captured audio to a speech service to transcribe it. On a
            closed network that breaks the air-gap, so it is off by default. Typed questions never
            leave this deployment, and neither does the transcript once it has been recognised.
          </p>
          {E ? (
            <p className="mt-1.5 text-ink-faint">
              Enabled for this browser.{" "}
              <button
                type="button"
                className="underline hover:text-ink"
                onClick={() => {
                  R(false);
                  try {
                    window.localStorage.removeItem(b);
                  } catch (e) {}
                }}
              >
                Turn off
              </button>
            </p>
          ) : (
            <button
              type="button"
              className={cn(buttonClass, "mt-2")}
              onClick={() => {
                R(true);
                try {
                  window.localStorage.setItem(b, "yes");
                } catch (e) {}
              }}
            >
              Enable voice anyway
            </button>
          )}
        </div>
      ) : null}
      {C ? null : (
        <p className="text-[0.75rem] text-ink-faint">
          This browser has no speech recognition. Typing works exactly the same.
        </p>
      )}
      {g ? <ErrorAlert>{g}</ErrorAlert> : null}
      {n ? <_Component4 answer={n} onPick={(e) => P(e, "text")} /> : null}
    </section>
  );
}
function _Component4(e) {
  let { answer: t, onPick: n } = e;
  let s = t.intent === "unknown" || t.intent === "empty";
  return (
    <div className="animate-fade-in space-y-2 rounded border border-canvas-border bg-canvas-raised p-3">
      <p className={cn("text-[0.875rem] leading-relaxed", s ? "text-ink-muted" : "text-ink")}>
        {t.answer}
      </p>
      <div className="flex flex-wrap items-center gap-2 text-[0.6875rem] text-ink-faint">
        <Badge variant={s ? "neutral" : "accent"}>{t.intent.replace(/_/g, " ")}</Badge>
        {t.sources.length ? <span className="mono">read from {t.sources.join(", ")}</span> : null}
        {t.link ? (
          <Link href={t.link} className="text-accent-bright hover:underline">
            Open the underlying view →
          </Link>
        ) : null}
      </div>
      {t.suggestions.length ? (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {t.suggestions.map((e) => (
            <button
              type="button"
              onClick={() => n(e)}
              className="focus-ring rounded border border-canvas-border px-2 py-0.5 text-[0.6875rem] text-ink-muted transition hover:bg-canvas-hover hover:text-ink"
              key={e}
            >
              {e}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
