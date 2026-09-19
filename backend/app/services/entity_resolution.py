from collections import defaultdict
from typing import Any
from uuid import UUID

from neo4j import AsyncSession as Neo4jSession

from app.graph.connection import Neo4jConnection


class UnionFind:
    def __init__(self):
        self.parent: dict[str, str] = {}
        self.rank: dict[str, int] = {}

    def find(self, x: str) -> str:
        if x not in self.parent:
            self.parent[x] = x
            self.rank[x] = 0
            return x
        if self.parent[x] != x:
            self.parent[x] = self.find(self.parent[x])
        return self.parent[x]

    def union(self, x: str, y: str) -> bool:
        xr, yr = self.find(x), self.find(y)
        if xr == yr:
            return False
        if self.rank[xr] < self.rank[yr]:
            self.parent[xr] = yr
        elif self.rank[xr] > self.rank[yr]:
            self.parent[yr] = xr
        else:
            self.parent[yr] = xr
            self.rank[xr] += 1
        return True

    def get_components(self) -> dict[str, list[str]]:
        components = defaultdict(list)
        for x in self.parent:
            components[self.find(x)].append(x)
        return dict(components)


async def run_entity_resolution() -> dict[str, Any]:
    driver = await Neo4jConnection.get_driver()
    async with driver.session() as session:
        uf = UnionFind()

        await _apply_rule_device_sim_phone(session, uf)
        await _apply_rule_shared_handset(session, uf)
        await _apply_rule_handle_phone(session, uf)
        await _apply_rule_roster_hint(session, uf)

        components = uf.get_components()

        await _create_person_nodes(session, components)
        await _create_controls_edges(session, components)

        return {
            "components_found": len(components),
            "total_entities": sum(len(members) for members in components.values()),
            "largest_component": max((len(m) for m in components.values()), default=0),
        }


async def _apply_rule_device_sim_phone(session: Neo4jSession, uf: UnionFind) -> None:
    query = """
    MATCH (d:Device)<-[:USED_IN]-(s:Sim)
    MATCH (d)<-[:USED_IN]-(ph:Phone)
    RETURN d.imei as device, s.imsi as sim, ph.number as phone
    """
    result = await session.run(query)
    async for record in result:
        device = record["device"]
        sim = record["sim"]
        phone = record["phone"]
        uf.union(f"device:{device}", f"sim:{sim}")
        uf.union(f"device:{device}", f"phone:{phone}")
        uf.union(f"sim:{sim}", f"phone:{phone}")


async def _apply_rule_shared_handset(session: Neo4jSession, uf: UnionFind) -> None:
    query = """
    MATCH (d:Device)<-[:USED_IN]-(s1:Sim), (d)<-[:USED_IN]-(s2:Sim)
    WHERE s1.imsi <> s2.imsi
    RETURN d.imei as device, collect(s1.imsi) as sims
    """
    result = await session.run(query)
    async for record in result:
        device = record["device"]
        sims = record["sims"]
        for sim in sims:
            uf.union(f"device:{device}", f"sim:{sim}")
        for i in range(len(sims)):
            for j in range(i + 1, len(sims)):
                uf.union(f"sim:{sims[i]}", f"sim:{sims[j]}")


async def _apply_rule_handle_phone(session: Neo4jSession, uf: UnionFind) -> None:
    query = """
    MATCH (h:SocialHandle)-[:POSTED]->(p:Post)
    WHERE p.linked_phone IS NOT NULL AND p.linked_phone <> ''
    RETURN h.handle as handle, p.linked_phone as phone
    """
    result = await session.run(query)
    async for record in result:
        handle = record["handle"]
        phone = record["phone"]
        uf.union(f"handle:{handle}", f"phone:{phone}")


async def _apply_rule_roster_hint(session: Neo4jSession, uf: UnionFind) -> None:
    query = """
    MATCH (p:Person)-[:CONTROLS]->(ph:Phone)
    WHERE p.roster_hint IS NOT NULL
    MATCH (ph2:Phone {number: p.roster_hint})
    RETURN p.canonical_id as person, ph2.number as phone
    """
    result = await session.run(query)
    async for record in result:
        person = record["person"]
        phone = record["phone"]
        uf.union(f"person:{person}", f"phone:{phone}")


async def _create_person_nodes(session: Neo4jSession, components: dict[str, list[str]]) -> None:
    for canonical_id, members in components.items():
        identities = defaultdict(list)
        for member in members:
            if ":" in member:
                type_, value = member.split(":", 1)
                identities[type_].append(value)

        props = {
            "canonical_id": canonical_id,
            "phones": identities.get("phone", []),
            "devices": identities.get("device", []),
            "sims": identities.get("sim", []),
            "accounts": identities.get("account", []),
            "upi_ids": identities.get("upi", []),
            "ips": identities.get("ip", []),
            "social_handles": identities.get("handle", []),
            "source": "entity_resolution",
            "resolved_at": "datetime()",
        }

        await session.run("""
            MERGE (p:Person {canonical_id: $canonical_id})
            SET p += $props
            RETURN p
        """, {"canonical_id": canonical_id, "props": props})


async def _create_controls_edges(session: Neo4jSession, components: dict[str, list[str]]) -> None:
    for canonical_id, members in components.items():
        for member in members:
            if ":" not in member:
                continue
            type_, value = member.split(":", 1)

            rel_type = "CONTROLS"
            target_label = type_.capitalize()
            if type_ == "upi":
                target_label = "UpiId"
            elif type_ == "handle":
                target_label = "SocialHandle"

            await session.run(f"""
                MATCH (p:Person {{canonical_id: $canonical_id}})
                MATCH (t:{target_label} {{{_get_identifier_property(type_)}: $value}})
                MERGE (p)-[r:{rel_type}]->(t)
                SET r.resolved_by = 'entity_resolution', r.resolved_at = datetime()
            """, {"canonical_id": canonical_id, "value": value})


def _get_identifier_property(type_: str) -> str:
    mapping = {
        "phone": "number",
        "device": "imei",
        "sim": "imsi",
        "account": "number",
        "upi": "id",
        "ip": "address",
        "handle": "handle",
    }
    return mapping.get(type_, "id")