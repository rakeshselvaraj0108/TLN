"""Routes tagged "benchmark"."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from tracex_api.auth import User, current_user
from tracex_api.engine import benchmark

router = APIRouter(tags=["benchmark"])


@router.get("/benchmark/run", summary="Run Benchmark")
def run_benchmark(include_hallucination: bool = Query(True), user: User = Depends(current_user)):
    """Execute the full benchmark and return the scorecard.

Runs the real scorer over label-blind features built from the seed corpus,
grades against the generator's answer key, and reports the result as
measured — including a poor result."""
    return benchmark.run(include_hallucination)


@router.get("/benchmark/report", response_model=dict[str, str], summary="Benchmark Report")
def benchmark_report(user: User = Depends(current_user)):
    """The same run, rendered as a plain-text scorecard."""
    return {"report": benchmark.report_text(benchmark.run(True))}
