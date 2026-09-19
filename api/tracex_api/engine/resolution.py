"""Deterministic entity resolution.

R1  a phone number and the handset (IMEI) it was used in belong to one person — union-find over
    every CDR (a_party, imei) and IPDR (msisdn, imei) pair.
R2  a bank account belongs to the person whose registered name is its account-holder name.
R3  identifier groups registered to the same subscriber are one person (subscriber registry).
R4  a social handle belongs to the person holding the number it is linked to.

The subscriber registry (seed_data/subjects.json) supplies names and the declared roles of the
seed population. Groups that match no registered subscriber become new, unnamed subjects.
"""
from __future__ import annotations

from collections import defaultdict
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from tracex_api.engine.dataset import Dataset, Person


class UnionFind:
    """Union by size plus full path compression: O(α(n)) amortized per operation (Tarjan 1975)."""

    def __init__(self) -> None:
        self.parent: dict[str, str] = {}
        self.size: dict[str, int] = {}

    def find(self, x: str) -> str:
        if x not in self.parent:
            self.parent[x] = x
            self.size[x] = 1
        root = x
        while self.parent[root] != root:
            root = self.parent[root]
        while self.parent[x] != root:
            self.parent[x], x = root, self.parent[x]
        return root

    def union(self, a: str, b: str) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return
        if self.size[ra] > self.size[rb]:
            ra, rb = rb, ra
        self.parent[ra] = rb
        self.size[rb] += self.size[ra]


def resolve(ds: "Dataset") -> dict[str, "Person"]:
    from tracex_api.engine.dataset import Person

    uf = UnionFind()
    for c in ds.calls:
        uf.union(f"Phone:{c.a_party}", f"Device:{c.imei}")
    for s in ds.sessions:
        uf.union(f"Phone:{s.msisdn}", f"Device:{s.imei}")

    registry_of: dict[str, str] = {}
    registered_rule: dict[str, str] = {}
    for subject in ds.registry:
        for ident in subject["identifiers"]:
            if ident["kind"] in ("Phone", "Device"):
                key = f"{ident['kind']}:{ident['value']}"
                registry_of[key] = subject["entity_id"]
                registered_rule[key] = ident["resolved_by"]
                uf.find(key)

    # R3: merge groups registered to the same subscriber.
    first_key_of_subject: dict[str, str] = {}
    for key, subject_id in registry_of.items():
        if subject_id in first_key_of_subject:
            uf.union(key, first_key_of_subject[subject_id])
        else:
            first_key_of_subject[subject_id] = key

    groups: dict[str, set[str]] = defaultdict(set)
    for key in list(uf.parent):
        groups[uf.find(key)].add(key)

    registry = {s["entity_id"]: s for s in ds.registry}
    persons: dict[str, Person] = {}
    next_number = max((int(pid[1:]) for pid in registry), default=0) + 1
    unregistered = []
    for members in groups.values():
        subject_ids = sorted({registry_of[m] for m in members if m in registry_of})
        if subject_ids:
            pid = subject_ids[0]
            info = registry[pid]
            person = persons.get(pid) or Person(entity_id=pid, name=info["name"], role=info["role"])
            persons[pid] = person
        else:
            unregistered.append(members)
            continue
        _attach(person, members, registered_rule)

    for members in sorted(unregistered, key=lambda m: min(m)):
        pid = f"P{next_number:04d}"
        next_number += 1
        person = Person(entity_id=pid, name=f"Unregistered subscriber {pid}", role="unknown")
        persons[pid] = person
        _attach(person, members, {})

    # R2: accounts by holder name.
    by_name = {p.name: p for p in persons.values()}
    holders: dict[str, str] = {}
    for t in ds.txns:
        if t.src_account and t.src_name:
            holders.setdefault(t.src_account, t.src_name)
        if t.dst_account and t.dst_name:
            holders.setdefault(t.dst_account, t.dst_name)
    for subject in ds.registry:
        for ident in subject["identifiers"]:
            if ident["kind"] == "Account" and subject["entity_id"] in persons:
                holders.setdefault(ident["value"], subject["name"])
    for account in sorted(holders):
        person = by_name.get(holders[account])
        if person and account not in person.accounts:
            person.accounts.append(account)
            person.rules[account] = "R2"

    # R4: social handles by linked number.
    phone_owner = {ph: p for p in persons.values() for ph in p.phones}
    seen_handles = set()
    for post in ds.posts:
        owner = phone_owner.get(post.msisdn)
        if owner and post.handle not in seen_handles:
            seen_handles.add(post.handle)
            owner.handles.append({"handle": post.handle, "platform": post.platform})
            owner.rules[post.handle] = "R4"

    # Vehicles registered to a subject.
    for plate, pid in ds.vehicle_registry.items():
        if pid in persons:
            persons[pid].plates.append(plate)

    for p in persons.values():
        p.phones.sort()
        p.devices.sort()
        p.member_count = len(p.phones) + len(p.devices) + len(p.accounts) + len(p.handles)
    return dict(sorted(persons.items()))


def _attach(person: "Person", members: set[str], registered_rule: dict[str, str]) -> None:
    for key in sorted(members):
        kind, value = key.split(":", 1)
        target = person.phones if kind == "Phone" else person.devices
        if value not in target:
            target.append(value)
            person.rules[value] = registered_rule.get(key, "R1")
