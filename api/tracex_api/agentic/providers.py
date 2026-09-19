"""LLM providers behind one interface.

Selection is explicit and never silently sends evidence off the machine:

    LLM_PROVIDER=stub       deterministic planner (default when nothing else is configured)
    LLM_PROVIDER=ollama     a local Ollama server (OLLAMA_HOST, OLLAMA_MODEL) — evidence stays on this machine
    LLM_PROVIDER=anthropic  the Claude API (ANTHROPIC_API_KEY, TRACEX_LLM_MODEL) — evidence leaves this machine
    LLM_PROVIDER=auto       ollama if a local server is reachable, otherwise stub. `auto` NEVER picks a cloud provider.

The wire formats implemented here are the providers' documented tool-use protocols; they are exercised in the tests
against protocol mocks. They have not been run against a live model in this repository's CI.
"""
from __future__ import annotations

import json
import os
import re
import time
import weakref
from dataclasses import dataclass, field

import httpx

# /health and /agentic/status ask "is a local model available?" on every call. An unreachable server would otherwise cost a
# connect timeout each time, so the answer is remembered briefly. Keyed weakly by the client OBJECT (not id(client): CPython reuses ids
# after garbage collection, which would hand a new client a dead one's answer).
_PROBE_TTL_S = 20.0
_PROBES: "weakref.WeakKeyDictionary" = weakref.WeakKeyDictionary()
_SHARED: dict = {}


def _shared_client() -> httpx.Client:
    if "c" not in _SHARED:
        _SHARED["c"] = httpx.Client(timeout=120.0)
    return _SHARED["c"]


DEFAULT_CLAUDE_MODEL = "claude-sonnet-5"
DEFAULT_OLLAMA_MODEL = "llama3.1:8b"
ANTHROPIC_VERSION = "2023-06-01"


class ProviderError(RuntimeError):
    """The provider could not produce a turn (network, auth, malformed reply)."""


@dataclass
class ToolCall:
    id: str
    name: str
    args: dict


@dataclass
class Turn:
    text: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)
    stop: str = "end"  # end | tool_use | max_tokens
    usage: dict = field(default_factory=lambda: {"in": 0, "out": 0})


# Provider-neutral history:
#   {"role": "user", "content": str}
#   {"role": "assistant", "content": str, "tool_calls": [{"id", "name", "args"}]}
#   {"role": "tool", "tool_call_id": str, "name": str, "content": str}
Message = dict


class Provider:
    name = "provider"
    model = ""
    local = True
    deterministic = False
    tool_calling = True

    def ready(self) -> tuple[bool, str | None]:
        return True, None

    def complete(self, system: str, messages: list[Message], tools: list[dict], max_tokens: int = 1024) -> Turn:
        raise NotImplementedError

    def describe(self) -> dict:
        ok, err = self.ready()
        return {"name": self.name, "model": self.model, "ready": ok, "error": err,
                "capabilities": {"streaming": False, "tool_calling": self.tool_calling, "structured_output": True,
                                 "deterministic": self.deterministic, "local_only": self.local, "max_context_tokens": 8192}}


# ---------------------------------------------------------------------------------------------------- Claude
class AnthropicProvider(Provider):
    name, local = "anthropic", False

    def __init__(self, api_key: str, model: str = DEFAULT_CLAUDE_MODEL, base_url: str = "https://api.anthropic.com",
                 client: httpx.Client | None = None, timeout: float = 60.0):
        self.api_key, self.model, self.base_url = api_key, model, base_url.rstrip("/")
        self.client = client or httpx.Client(timeout=timeout)

    def ready(self):
        return (bool(self.api_key), None if self.api_key else "ANTHROPIC_API_KEY is not set")

    @staticmethod
    def _wire(messages: list[Message]) -> list[dict]:
        out: list[dict] = []
        for m in messages:
            if m["role"] == "user":
                out.append({"role": "user", "content": m["content"]})
            elif m["role"] == "assistant":
                blocks = []
                if m.get("content"):
                    blocks.append({"type": "text", "text": m["content"]})
                blocks += [{"type": "tool_use", "id": c["id"], "name": c["name"], "input": c["args"]} for c in m.get("tool_calls", [])]
                out.append({"role": "assistant", "content": blocks or [{"type": "text", "text": ""}]})
            else:  # tool result: consecutive results share one user message, as the API requires
                block = {"type": "tool_result", "tool_use_id": m["tool_call_id"], "content": m["content"]}
                if out and out[-1]["role"] == "user" and isinstance(out[-1]["content"], list):
                    out[-1]["content"].append(block)
                else:
                    out.append({"role": "user", "content": [block]})
        return out

    def complete(self, system, messages, tools, max_tokens=1024) -> Turn:
        body = {"model": self.model, "max_tokens": max_tokens, "system": system, "messages": self._wire(messages)}
        if tools:
            body["tools"] = [{"name": t["name"], "description": t["description"], "input_schema": t["schema"]} for t in tools]
        try:
            r = self.client.post(f"{self.base_url}/v1/messages", json=body,
                                 headers={"x-api-key": self.api_key, "anthropic-version": ANTHROPIC_VERSION, "content-type": "application/json"})
            r.raise_for_status()
            data = r.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise ProviderError(f"anthropic request failed: {type(exc).__name__}: {exc}") from exc
        text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
        calls = [ToolCall(b["id"], b["name"], b.get("input") or {}) for b in data.get("content", []) if b.get("type") == "tool_use"]
        usage = data.get("usage") or {}
        stop = "tool_use" if calls else ("max_tokens" if data.get("stop_reason") == "max_tokens" else "end")
        return Turn(text, calls, stop, {"in": usage.get("input_tokens", 0), "out": usage.get("output_tokens", 0)})


# ---------------------------------------------------------------------------------------------------- Ollama
class OllamaProvider(Provider):
    name, local = "ollama", True

    def __init__(self, host: str = "http://127.0.0.1:11434", model: str = DEFAULT_OLLAMA_MODEL,
                 client: httpx.Client | None = None, timeout: float = 120.0):
        self.host, self.model = host.rstrip("/"), model
        self.client = client or _shared_client()

    def ready(self):
        per_client = _PROBES.setdefault(self.client, {})
        hit = per_client.get((self.host, self.model))
        if hit and time.monotonic() - hit[0] < _PROBE_TTL_S:
            return hit[1]
        result = self._probe()
        per_client[(self.host, self.model)] = (time.monotonic(), result)
        return result

    def _probe(self):
        try:
            r = self.client.get(f"{self.host}/api/tags", timeout=0.5)
            r.raise_for_status()
            names = {m.get("name", "") for m in r.json().get("models", [])}
        except (httpx.HTTPError, ValueError) as exc:
            return False, f"no Ollama server reachable at {self.host} ({type(exc).__name__})"
        base = self.model.split(":")[0]
        if self.model in names or any(n.split(":")[0] == base for n in names):
            return True, None
        return False, f"Ollama is running but model {self.model!r} is not pulled"

    @staticmethod
    def _wire(system: str, messages: list[Message]) -> list[dict]:
        out = [{"role": "system", "content": system}]
        for m in messages:
            if m["role"] == "assistant":
                msg = {"role": "assistant", "content": m.get("content", "")}
                if m.get("tool_calls"):
                    msg["tool_calls"] = [{"function": {"name": c["name"], "arguments": c["args"]}} for c in m["tool_calls"]]
                out.append(msg)
            elif m["role"] == "tool":
                out.append({"role": "tool", "tool_name": m["name"], "content": m["content"]})
            else:
                out.append({"role": "user", "content": m["content"]})
        return out

    def complete(self, system, messages, tools, max_tokens=1024) -> Turn:
        body = {"model": self.model, "messages": self._wire(system, messages), "stream": False, "options": {"num_predict": max_tokens, "temperature": 0}}
        if tools:
            body["tools"] = [{"type": "function", "function": {"name": t["name"], "description": t["description"], "parameters": t["schema"]}} for t in tools]
        try:
            r = self.client.post(f"{self.host}/api/chat", json=body)
            r.raise_for_status()
            data = r.json()
            msg = data["message"]
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            raise ProviderError(f"ollama request failed: {type(exc).__name__}: {exc}") from exc
        calls = []
        for i, c in enumerate(msg.get("tool_calls") or []):
            fn = c.get("function", {})
            args = fn.get("arguments") or {}
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except ValueError:
                    args = {}
            calls.append(ToolCall(f"call_{i}", fn.get("name", ""), args))
        return Turn(msg.get("content", "") or "", calls, "tool_use" if calls else "end",
                    {"in": data.get("prompt_eval_count", 0), "out": data.get("eval_count", 0)})


# ---------------------------------------------------------------------------------------------------- deterministic
ENTITY = re.compile(r"\bP\d{4}\b")


class StubProvider(Provider):
    """The disclosed fallback: the SAME loop, driven by a fixed plan instead of a model. It chooses tools from the
    objective by rule and writes its answer from the tool results with a fixed template. It is deterministic and does
    no reasoning — which is exactly what `degraded: true` in the agent's output tells the reader."""

    name, model, local, deterministic = "stub", "deterministic-planner", True, True

    @staticmethod
    def _plan(objective: str) -> list[tuple[str, dict]]:
        found = ENTITY.findall(objective)
        if found:
            e = found[0]
            return [("get_entity_risk", {"entity_id": e}), ("get_call_debit_links", {"entity_id": e}), ("get_fanout_patterns", {"entity_id": e}),
                    ("get_device_rotation", {"entity_id": e}), ("check_exculpatory", {"entity_id": e})]
        return [("list_top_risk", {"limit": 5}), ("get_campaigns", {})]

    def complete(self, system, messages, tools, max_tokens=1024) -> Turn:
        objective = messages[0]["content"]
        results = [json.loads(m["content"]) for m in messages if m["role"] == "tool"]
        plan = self._plan(objective)
        if tools and len(results) < len(plan):
            name, args = plan[len(results)]
            return Turn("", [ToolCall(f"plan_{len(results)}", name, args)], "tool_use")
        from tracex_api.agentic.narrate import compose_from_results  # local import: narrate imports the tool registry

        return Turn(compose_from_results(objective, results), [], "end")


# ---------------------------------------------------------------------------------------------------- selection
def select_provider(env: dict | None = None, ollama_client: httpx.Client | None = None) -> tuple[Provider, dict]:
    """(provider, info). `info` records what was asked for, what was chosen and why — surfaced in every agent run."""
    env = os.environ if env is None else env
    want = (env.get("LLM_PROVIDER") or "auto").strip().lower()
    if want == "stub":
        stub = StubProvider()
        return stub, {"requested": "stub", "selected": "stub", "reason": "requested"}
    if want == "anthropic":
        key = env.get("ANTHROPIC_API_KEY", "")
        if key:
            return AnthropicProvider(key, env.get("TRACEX_LLM_MODEL") or DEFAULT_CLAUDE_MODEL), {
                "requested": "anthropic", "selected": "anthropic", "reason": "requested; evidence leaves this machine for the Claude API"}
        return StubProvider(), {"requested": "anthropic", "selected": "stub", "reason": "ANTHROPIC_API_KEY is not set"}
    ollama = OllamaProvider(env.get("OLLAMA_HOST") or "http://127.0.0.1:11434", env.get("OLLAMA_MODEL") or DEFAULT_OLLAMA_MODEL, client=ollama_client)
    ok, err = ollama.ready()
    if want in ("ollama", "auto") and ok:
        return ollama, {"requested": want, "selected": "ollama", "reason": "local server reachable"}
    return StubProvider(), {"requested": want if want in ("ollama", "auto") else "auto", "selected": "stub",
                            "reason": err or f"unknown LLM_PROVIDER {want!r}"}


def status(env: dict | None = None) -> dict:
    """Shape served by /reasoning/providers and /health. Never makes a network call to a cloud provider."""
    env = os.environ if env is None else env
    chosen, info = select_provider(env)
    listing = [StubProvider().describe(),
               OllamaProvider(env.get("OLLAMA_HOST") or "http://127.0.0.1:11434", env.get("OLLAMA_MODEL") or DEFAULT_OLLAMA_MODEL).describe(),
               AnthropicProvider(env.get("ANTHROPIC_API_KEY", ""), env.get("TRACEX_LLM_MODEL") or DEFAULT_CLAUDE_MODEL).describe()]
    for entry, prio in zip(listing, (200, 500, 900)):
        entry["priority"] = prio
    return {"active": chosen.name, "providers": listing, "all_local": chosen.local, "selection": info}
