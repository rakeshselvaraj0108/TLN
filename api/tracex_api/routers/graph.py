"""Routes tagged "graph"."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from tracex_api.auth import User, current_user
from tracex_api.engine import correlate, graphs
from tracex_api.engine.dataset import current

router = APIRouter(tags=["graph"])


@router.get("/graph", summary="Graph Stats")
def graph_stats(user: User = Depends(current_user)):
    return {**graphs.stats(current()), "engine": "local"}


@router.get("/graph/subgraph", summary="Subgraph")
def subgraph(limit: int = Query(400, ge=1, le=5000), clusters: bool = Query(True), user: User = Depends(current_user)):
    """Identity + Person nodes and their structural edges (no event nodes)."""
    return graphs.subgraph(current(), limit=limit, with_clusters=clusters)


@router.get("/graph/imei-persistence", summary="Imei Persistence")
def imei_persistence(min_sims: int = Query(2, ge=1), user: User = Depends(current_user)):
    """Devices seen with >= min_sims distinct numbers — burner rotation."""
    devices = correlate.imei_persistence(current(), max(min_sims, 3) if min_sims <= 3 else min_sims)
    return {"devices": devices, "count": len(devices), "engine": "local"}


@router.get("/graph/network", summary="Network")
def network(user: User = Depends(current_user)):
    """The behavioural graph: people, and why the evidence connects them."""
    return graphs.network(current())


@router.get("/graph/paths", summary="Paths")
def paths(
    source: str = Query(...),
    target: str = Query(...),
    max_hops: int = Query(4, ge=1, le=5),
    limit: int = Query(5, ge=1, le=25),
    user: User = Depends(current_user),
):
    """How are these two connected, and by what evidence?"""
    ds = current()
    for pid in (source, target):
        if pid not in ds.persons:
            raise HTTPException(status_code=404, detail=f"no such entity: {pid}")
    found = graphs.paths(ds, source, target, max_hops=max_hops, limit=limit)
    return {"source": source, "target": target, "paths": found, "count": len(found), "max_hops": max_hops, "engine": "local"}
