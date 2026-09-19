"""TRACE-X API application (interface recovered from the deployed OpenAPI document)."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from tracex_api.routers import agentic, agents, ask, audit, auth, benchmark, campaign_hunt, cases, casework, compliance, documents, evidence, geo, graph, health, ingest, integrity, intel, ml, overview, pattern_of_life, profiles, reasoning, records, response_agent, retention, spatial_agent, timeline, verify

app = FastAPI(title="TRACE-X API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (agentic, agents, ask, audit, auth, benchmark, campaign_hunt, cases, casework, compliance, documents, evidence, geo, graph, health, ingest, integrity, intel, ml, overview, pattern_of_life, profiles, reasoning, records, response_agent, retention, spatial_agent, timeline, verify,):
    app.include_router(module.router)
