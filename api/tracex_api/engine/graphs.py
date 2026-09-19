"""Identity graph, behavioural graph, paths and detected communities."""
from __future__ import annotations

from collections import Counter, defaultdict, deque

from tracex_api.engine import correlate, scoring
from tracex_api.engine.dataset import Dataset, clean_num

KIND_ORDER = {"Account": 0, "Device": 1, "Phone": 2, "SocialHandle": 3}
EDGE_TYPE_RANK = {"MONEY_TO": 0, "CALLED": 1, "CALL_THEN_DEBIT": 2, "SEEN_AT": 3, "SHARED_IP": 4}


# ---- knowledge-graph statistics -------------------------------------------------------------
def stats(ds: Dataset) -> dict:
    """Node and relationship counts of the full knowledge graph (identities + events)."""
    def build():
        phones = {c.a_party for c in ds.calls} | {c.b_party for c in ds.calls} | {s.msisdn for s in ds.sessions} | {p.msisdn for p in ds.posts if p.msisdn}
        devices = {c.imei for c in ds.calls} | {s.imei for s in ds.sessions}
        sims = {c.imsi for c in ds.calls} | {s.imsi for s in ds.sessions}
        accounts = {t.src_account for t in ds.txns if t.src_account} | {t.dst_account for t in ds.txns if t.dst_account}
        ips = {s.public_ip for s in ds.sessions}
        handles = {p.handle for p in ds.posts}
        by_label = {
            "Account": len(accounts), "Call": len(ds.calls), "DataSession": len(ds.sessions), "Device": len(devices),
            "Ip": len(ips), "Person": len(ds.persons), "Phone": len(phones), "Post": len(ds.posts), "Sim": len(sims),
            "SocialHandle": len(handles), "Txn": len(ds.txns), "UpiId": len(accounts),
        }
        sub = subgraph(ds, limit=100_000, with_clusters=False)
        phone_sim = {(c.a_party, c.imsi) for c in ds.calls} | {(s.msisdn, s.imsi) for s in ds.sessions}
        sim_device = {(c.imsi, c.imei) for c in ds.calls} | {(s.imsi, s.imei) for s in ds.sessions}
        relationships = (
            len(sub["edges"])                                     # CONTROLS, LINKED_TO, TRANSFERRED_TO
            + 2 * len(ds.calls)                                   # (Phone)-[:PLACED]->(Call)-[:TO]->(Phone)
            + len(ds.sessions)                                    # (Phone)-[:OPENED]->(DataSession)
            + sum((1 if t.src_account else 0) + (1 if t.dst_account else 0) for t in ds.txns)  # FROM / TO accounts
            + len(phone_sim) + len(sim_device)                    # HAS_SIM, IN_DEVICE
            + len(accounts)                                       # (UpiId)-[:ALIAS_OF]->(Account)
        )
        return {"nodes": sum(by_label.values()), "relationships": relationships, "by_label": by_label}
    return ds.memo("graph_stats", build)


# ---- identity subgraph ------------------------------------------------------------------------
def subgraph(ds: Dataset, limit: int = 400, with_clusters: bool = True) -> dict:
    def build():
        scores = scoring.scores(ds)
        order = [s["entity_id"] for s in scoring.ranked(ds)]
        nodes, edges, seen = [], [], set()

        def add(node_id, label, props):
            if node_id not in seen:
                seen.add(node_id)
                nodes.append({"id": node_id, "labels": [label], "props": props})

        for pid in order:
            p = ds.persons[pid]
            s = scores.get(pid)
            add(f"Person:{pid}", "Person", {
                "entity_id": pid, "member_count": p.member_count, "resolved": True, "name": p.name, "role": p.role,
                **({"risk_score": s["risk_score"], "band": s["band"]} if s else {}),
            })
            idents = (
                [("Account", a, {"number": a, "ifsc": ds.account_ifsc.get(a)}) for a in p.accounts]
                + [("Device", d, {"imei": d}) for d in p.devices]
                + [("Phone", ph, {"msisdn": ph}) for ph in p.phones]
                + [("SocialHandle", h["handle"], {"handle": h["handle"], "platform": h["platform"]}) for h in p.handles]
            )
            for kind, value, props in idents:
                add(f"{kind}:{value}", kind, props)
                edges.append({"source": f"Person:{pid}", "target": f"{kind}:{value}", "type": "CONTROLS"})

        handle_links = defaultdict(list)
        for post in ds.posts:
            if post.msisdn and post.msisdn not in handle_links[post.handle]:
                handle_links[post.handle].append(post.msisdn)
        for handle, numbers in handle_links.items():
            for number in numbers:
                if f"SocialHandle:{handle}" in seen and f"Phone:{number}" in seen:
                    edges.append({"source": f"SocialHandle:{handle}", "target": f"Phone:{number}", "type": "LINKED_TO"})

        transfers = []
        for t in ds.txns:
            if t.direction == "DEBIT" and t.src_account and t.dst_account and (t.src_account, t.dst_account) not in transfers:
                transfers.append((t.src_account, t.dst_account))
        for src, dst in transfers:
            if f"Account:{src}" in seen and f"Account:{dst}" in seen:
                edges.append({"source": f"Account:{src}", "target": f"Account:{dst}", "type": "TRANSFERRED_TO"})

        kept = nodes[:limit]
        kept_ids = {n["id"] for n in kept}
        result = {"nodes": kept, "edges": [e for e in edges if e["source"] in kept_ids and e["target"] in kept_ids], "engine": "local"}
        return result
    base = ds.memo(("subgraph", limit), build)
    if with_clusters:
        return {**base, "clusters": clusters(ds)}
    return base


# ---- behavioural network ----------------------------------------------------------------------
def network(ds: Dataset) -> dict:
    def build():
        scores = scoring.scores(ds)
        edges: list[dict] = []

        # CALLED
        called = defaultdict(lambda: {"count": 0, "value": 0, "rec_ids": []})
        for c in ds.calls:
            a, b = ds.by_phone.get(c.a_party), ds.by_phone.get(c.b_party)
            if a and b and a != b:
                e = called[(a, b)]
                e["count"] += 1
                e["value"] += c.duration
                e["rec_ids"].append(c.rec_id)
        for (a, b), e in called.items():
            edges.append({"type": "CALLED", "source": a, "target": b, "directed": True, "count": e["count"], "value": e["value"], "rec_ids": e["rec_ids"][:25], "detail": ""})

        # MONEY_TO
        money = defaultdict(lambda: {"count": 0, "value": 0.0, "rec_ids": []})
        for t in ds.txns:  # both legs of a transfer (debit and credit rows) are evidence of it
            a, b = ds.by_account.get(t.src_account), ds.by_account.get(t.dst_account)
            if a and b and a != b:
                e = money[(a, b)]
                e["count"] += 1
                e["value"] += t.amount
                e["rec_ids"].append(t.rec_id)
        for (a, b), e in money.items():
            edges.append({"type": "MONEY_TO", "source": a, "target": b, "directed": True, "count": e["count"], "value": clean_num(e["value"]), "rec_ids": e["rec_ids"][:25], "detail": ""})

        # CALL_THEN_DEBIT
        c2d = defaultdict(list)
        for l in correlate.call_to_debit(ds):
            caller = ds.by_phone.get(l["caller"])
            if caller and caller != l["person"]:
                c2d[(caller, l["person"])].append(l)
        for (a, b), links in c2d.items():
            rec_ids: list[str] = []
            for l in links:
                for r in (l["call_rec_id"], l["debit_rec_id"]):
                    if r not in rec_ids:
                        rec_ids.append(r)
            first = links[0]
            edges.append({
                "type": "CALL_THEN_DEBIT", "source": a, "target": b, "directed": True, "count": len(links),
                "value": clean_num(sum(l["amount"] for l in links)), "rec_ids": rec_ids[:25],
                "detail": f"{first['latency_s']}s after the call ended, {first['amount']:,.0f} left {first['src_account']}",
            })

        # SEEN_AT: two subjects' vehicles read by the same camera. Cameras are walked in id order and each
        # camera's subjects by how often it read them, which fixes the order pairs are first reported in.
        reads_at = defaultdict(list)
        for r in sorted(ds.reads, key=lambda r: (r.time, r.rec_id)):
            reads_at[r.camera_id].append(r)
        seen_pairs: dict[tuple[str, str], list[str]] = {}
        for camera_id in sorted(reads_at):
            tally, first = Counter(), {}
            for r in reads_at[camera_id]:
                owner = ds.by_plate.get(r.plate)
                if owner:
                    tally[owner] += 1
                    first.setdefault(owner, r.time)
            owners = sorted(tally, key=lambda o: (-tally[o], first[o]))
            for i, a in enumerate(owners):
                for b in owners[i + 1:]:
                    seen_pairs.setdefault(tuple(sorted((a, b))), []).append(camera_id)
        for (a, b), shared in seen_pairs.items():
            cam = ds.cameras.get(shared[0], {})
            edges.append({
                "type": "SEEN_AT", "source": a, "target": b, "directed": False, "count": len(shared), "value": len(shared),
                "rec_ids": [reads_at[c][0].rec_id for c in shared], "detail": f"{shared[0]} - {cam.get('name', '')}",
            })

        # SHARED_IP
        ip_people = defaultdict(set)
        for s in ds.sessions:
            p = ds.by_phone.get(s.msisdn)
            if p:
                ip_people[s.public_ip].add(p)
        for ip, people in ip_people.items():
            people = sorted(people)
            for i, a in enumerate(people):
                for b in people[i + 1:]:
                    edges.append({"type": "SHARED_IP", "source": a, "target": b, "directed": False, "count": 1, "value": 1, "rec_ids": [], "detail": f"ip {ip}"})

        edges.sort(key=lambda e: (-e["count"], EDGE_TYPE_RANK[e["type"]]))
        degree = Counter()
        for e in edges:
            degree[e["source"]] += 1
            degree[e["target"]] += 1
        nodes = []
        for s in scoring.ranked(ds):
            p = ds.persons[s["entity_id"]]
            nodes.append({
                "entity_id": p.entity_id, "name": p.name, "risk_score": s["risk_score"], "band": s["band"],
                "accounts": len(p.accounts), "phones": len(p.phones), "devices": len(p.devices),
                "degree": degree[p.entity_id], "connected": degree[p.entity_id] > 0,
            })
        by_type = Counter(e["type"] for e in edges)
        return {"nodes": nodes, "edges": edges, "by_type": {t: by_type[t] for t in ["MONEY_TO", "CALLED", "CALL_THEN_DEBIT", "SHARED_IP", "SEEN_AT"] if by_type[t]}, "engine": "local"}
    return ds.memo("network", build)


def paths(ds: Dataset, source: str, target: str, max_hops: int = 4, limit: int = 5) -> list[dict]:
    """Shortest routes through the behavioural graph, ranked by length and then by how much evidence
    stands behind them. Parallel edges between the same two people are distinct routes."""
    net = network(ds)
    adjacency = defaultdict(list)
    kept = set()
    for e in net["edges"]:  # strongest edge of each type between a pair; edges arrive count-descending
        key = (frozenset((e["source"], e["target"])), e["type"])
        if key in kept:
            continue
        kept.add(key)
        adjacency[e["source"]].append((e["target"], e, True))
        adjacency[e["target"]].append((e["source"], e, False))
    found: list[dict] = []
    frontier = [(source, [], {source})]
    for _ in range(max_hops):
        next_frontier = []
        for node, hops, visited in frontier:
            for nxt, edge, along in adjacency[node]:
                if nxt in visited:
                    continue
                hop = {
                    "from": node, "to": nxt, "type": edge["type"], "count": edge["count"], "value": edge["value"],
                    "detail": edge["detail"], "rec_ids": edge["rec_ids"], "along_direction": along, "directed": edge["directed"],
                }
                if nxt == target:
                    found.append({"hops": hops + [hop], "length": len(hops) + 1, "rec_ids": [r for h in hops + [hop] for r in h["rec_ids"]]})
                    if len(found) >= limit:
                        break
                else:
                    next_frontier.append((nxt, hops + [hop], visited | {nxt}))
            if len(found) >= limit:
                break
        if len(found) >= limit or len(next_frontier) > 200_000:
            break
        frontier = next_frontier
    found.sort(key=lambda p: (p["length"], -sum(h["count"] for h in p["hops"])))
    return found[:limit]


# ---- communities --------------------------------------------------------------------------------
def clusters(ds: Dataset) -> list[dict]:
    def build():
        scores = scoring.scores(ds)
        c2d = correlate.call_to_debit(ds)
        fan = correlate.fanout(ds)
        member = lambda pid: {"entity_id": pid, "name": ds.persons[pid].name, "role": ds.persons[pid].role,
                              "risk_score": scores[pid]["risk_score"], "band": scores[pid]["band"]}
        out = []

        fast = [l for l in c2d if l["latency_s"] <= scoring.FAST_LATENCY_S]
        if fast:
            lead = max(fast, key=lambda l: (l["amount"], -l["latency_s"]))
            recipient = ds.by_account.get(lead["dst_account"]) if lead["dst_account"] else None
            chain_accounts = set()
            hops = 0
            frontier = [lead["dst_account"]] if lead["dst_account"] else []
            chain_fan = []
            while frontier:
                account = frontier.pop(0)
                for l in fan:
                    if l["inbound_account"] == account and l not in chain_fan:
                        chain_fan.append(l)
                        chain_accounts.add(account)
                        hops += l["hop_count"]
                        for rec in l["outbound_rec_ids"]:
                            dst = ds.txns_by_id[rec].dst_account
                            if dst and dst not in chain_accounts:
                                frontier.append(dst)
            # The ring: the victim and the collector, the mules the money fanned out to, everyone on either
            # end of a fast call-then-debit, and anyone who exchanged money directly with the chain.
            chain = {lead["person"]} | ({recipient} if recipient else set()) | {l["person"] for l in chain_fan}
            people = set(chain)
            for l in fast:
                people.add(l["person"])
                caller = ds.by_phone.get(l["caller"])
                if caller:
                    people.add(caller)
            for e in network(ds)["edges"]:
                if e["type"] == "MONEY_TO":
                    if e["source"] in chain:
                        people.add(e["target"])
                    if e["target"] in chain:
                        people.add(e["source"])
            ids = sorted(people)
            out.append({
                "kind": "scam_ring", "label": "Organised scam ring", "entity_ids": ids,
                "members": sorted((member(p) for p in ids), key=lambda m: -m["risk_score"]), "size": len(ids), "severity": "high",
                "principal_inr": lead["amount"], "hop_count": hops,
                "evidence": f"a debit of Rs {lead['amount']:,.0f} {round(lead['latency_s'] / 60)} min after an inbound call — then {hops} onward hops across {len(chain_fan)} accounts",
            })

        if fan:
            ids = sorted({l["person"] for l in fan})
            ratios = [round(l["passthrough_ratio"] * 100) for l in fan]
            typical = Counter(ratios).most_common(1)[0][0]
            out.append({
                "kind": "mule_network", "label": "Suspicious money-mule network", "entity_ids": ids,
                "members": sorted((member(p) for p in ids), key=lambda m: -m["risk_score"]), "size": len(ids), "severity": "high",
                "principal_inr": max(l["inbound_amount"] for l in fan), "hop_count": sum(l["hop_count"] for l in fan),
                "evidence": f"{len(ids)} accounts each passed on {typical}% of what they received; largest single credit Rs {max(l['inbound_amount'] for l in fan):,.0f}",
            })

        for d in sorted(correlate.imei_persistence(ds, 3), key=lambda d: (-scores[d["persons"][0]]["risk_score"] if d["persons"] else 0)):
            if not d["persons"]:
                continue
            owner = d["persons"][0]
            out.append({
                "kind": "burner_rotation", "label": "Rotating-SIM handset", "entity_ids": d["persons"],
                "members": [member(p) for p in d["persons"]], "size": len(d["persons"]), "severity": scores[owner]["band"],
                "evidence": f"handset {d['imei']} carried {d['sim_count']} distinct numbers", "imei": d["imei"],
            })
        for i, c in enumerate(out, start=1):
            c["id"] = f"CL-{i:02d}"
        return out
    return ds.memo("clusters", build)
