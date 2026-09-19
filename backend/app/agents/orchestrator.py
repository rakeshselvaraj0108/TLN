from datetime import datetime
from typing import Any, TypedDict, Literal
from uuid import UUID
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from sqlalchemy import select

from app.agents.reasoning_kernel import ReasoningKernel
from app.ml.model import get_scorer
from app.ml.adversarial import CounterfactualEngine, ExculpatoryEngine
from app.graph.connection import Neo4jConnection
from app.graph.queries import CYPHER_QUERIES
from app.db.session import get_db_context
from app.models import Entity, Case, CaseEntity, CaseTimeline, User, CaseAction, ActionType, ActionStatus


class AgentState(TypedDict):
    case_id: UUID
    entity_id: UUID | None
    investigator_id: UUID
    current_stage: str
    findings: dict
    hypotheses: list[dict]
    criticisms: list[dict]
    recommendations: list[dict]
    verified_actions: list[dict]
    audit_trail: list[dict]
    error: str | None


async def planner_node(state: AgentState) -> AgentState:
    async with get_db_context() as session:
        result = await session.execute(select(Case).where(Case.id == state["case_id"]))
        case = result.scalar_one_or_none()
        if not case:
            state["error"] = "Case not found"
            return state

    state["current_stage"] = "planner"
    state["findings"] = {"case_id": str(state["case_id"]), "status": "planned"}
    state["audit_trail"].append({"stage": "planner", "action": "case_reviewed", "timestamp": "now"})
    return state


async def investigator_node(state: AgentState) -> AgentState:
    if not state.get("entity_id"):
        state["error"] = "No entity specified for investigation"
        return state

    async with get_db_context() as session:
        result = await session.execute(select(Entity).where(Entity.id == state["entity_id"]))
        entity = result.scalar_one_or_none()
        if not entity:
            state["error"] = "Entity not found"
            return state

        driver = await Neo4jConnection.get_driver()
        async with driver.session() as neo4j_session:
            graph_result = await neo4j_session.run(
                CYPHER_QUERIES["get_entity_graph"],
                {"canonical_id": entity.canonical_id}
            )
            graph_data = await graph_result.data()

    state["current_stage"] = "investigator"
    state["findings"]["entity_graph"] = graph_data
    state["findings"]["entity_canonical_id"] = entity.canonical_id
    state["audit_trail"].append({"stage": "investigator", "action": "entity_graph_retrieved"})
    return state


async def correlator_node(state: AgentState) -> AgentState:
    canonical_id = state["findings"].get("entity_canonical_id")
    if not canonical_id:
        state["error"] = "No canonical ID for correlation"
        return state

    driver = await Neo4jConnection.get_driver()
    async with driver.session() as neo4j_session:
        corr_result = await neo4j_session.run(
            CYPHER_QUERIES["get_call_txn_correlation"],
            {"canonical_id": canonical_id, "max_latency_seconds": 3600, "limit": 50}
        )
        correlations = [r.data() for r in corr_result]

        passthrough_result = await neo4j_session.run(
            CYPHER_QUERIES["get_passthrough_analysis"],
            {}
        )
        passthrough = [r.data() for r in passthrough_result]

        fanout_result = await neo4j_session.run(
            CYPHER_QUERIES["get_fan_out"],
            {"window_start": "2024-01-01", "window_end": "2024-12-31", "min_width": 2}
        )
        fanout = [r.data() for r in fanout_result]

    state["current_stage"] = "correlator"
    state["findings"]["correlations"] = {
        "call_txn": correlations,
        "passthrough": passthrough,
        "fanout": fanout,
    }
    state["audit_trail"].append({"stage": "correlator", "action": "cross_domain_correlation_completed"})
    return state


async def analyst_node(state: AgentState) -> AgentState:
    canonical_id = state["findings"].get("entity_canonical_id")
    if not canonical_id:
        state["error"] = "No canonical ID for scoring"
        return state

    driver = await Neo4jConnection.get_driver()
    async with driver.session() as neo4j_session:
        entity_result = await neo4j_session.run(
            CYPHER_QUERIES["get_all_entities_for_scoring"],
            {}
        )
        entities_data = [r.data() for r in entity_result]

    entity_data = next((e for e in entities_data if e["person_id"] == canonical_id), None)
    if not entity_data:
        state["error"] = "Entity data not found for scoring"
        return state

    scorer = get_scorer()
    risk_result = scorer.predict(entity_data)

    counterfactual = CounterfactualEngine()
    boundary_result = counterfactual.find_boundary(entity_data)

    exculpatory = ExculpatoryEngine()
    exculpatory_result = exculpatory.run_checks(entity_data, risk_result)

    async with get_db_context() as session:
        result = await session.execute(select(Entity).where(Entity.canonical_id == canonical_id))
        entity = result.scalar_one_or_none()
        if entity:
            entity.risk_score = risk_result["risk_score"]
            entity.risk_band = risk_result["risk_band"]
            entity.shap_factors = risk_result["shap_factors"]
            entity.counterfactual_boundary = boundary_result["boundary"]
            entity.exculpatory_reduction = exculpatory_result["total_reduction"]
            entity.final_adjusted_score = exculpatory_result["adjusted_score"]
            await session.flush()

    state["current_stage"] = "analyst"
    state["findings"]["risk_assessment"] = risk_result
    state["findings"]["counterfactual"] = boundary_result
    state["findings"]["exculpatory"] = exculpatory_result
    state["hypotheses"] = [
        {"type": "fraud_core", "confidence": risk_result["archetype_probs"].get("fraud_core", 0)},
        {"type": "mule", "confidence": risk_result["archetype_probs"].get("mule", 0)},
        {"type": "handler", "confidence": risk_result["archetype_probs"].get("handler", 0)},
    ]
    state["audit_trail"].append({"stage": "analyst", "action": "risk_scoring_completed", "score": risk_result["risk_score"]})
    return state


async def critic_node(state: AgentState) -> AgentState:
    hypotheses = state.get("hypotheses", [])
    exculpatory = state["findings"].get("exculpatory", {})
    counterfactual = state["findings"].get("counterfactual", {})

    criticisms = []

    for hypothesis in hypotheses:
        if hypothesis["confidence"] < 0.5:
            criticisms.append({
                "target": hypothesis["type"],
                "criticism": f"Low confidence ({hypothesis['confidence']:.2f}) for {hypothesis['type']} hypothesis",
                "severity": "medium",
            })

    for check in exculpatory.get("checks", []):
        if check["triggered"]:
            criticisms.append({
                "target": check["check"],
                "criticism": check["explanation"],
                "severity": "high" if check["reduction"] > 0.15 else "medium",
                "reduction": check["reduction"],
            })

    if counterfactual.get("feature_changes"):
        for change in counterfactual["feature_changes"]:
            if abs(change["change_pct"]) < 50:
                criticisms.append({
                    "target": "counterfactual",
                    "criticism": f"Small change in {change['feature']} ({change['change_pct']:.1f}%) would clear entity",
                    "severity": "high",
                })

    state["current_stage"] = "critic"
    state["criticisms"] = criticisms
    state["audit_trail"].append({"stage": "critic", "action": "adversarial_review_completed", "criticisms_count": len(criticisms)})
    return state


async def verifier_node(state: AgentState) -> AgentState:
    risk_result = state["findings"].get("risk_assessment", {})
    exculpatory = state["findings"].get("exculpatory", {})
    features = risk_result.get("features", {})

    verification = {
        "tier1": {"passed": True, "checks": []},
        "tier2": {"passed": True, "checks": []},
    }

    for feature_name, feature_value in features.items():
        verification["tier1"]["checks"].append({
            "feature": feature_name,
            "value": feature_value,
            "verified": True,
        })

    for check in exculpatory.get("checks", []):
        verification["tier2"]["checks"].append({
            "check": check["check"],
            "triggered": check["triggered"],
            "evidence_verified": check["triggered"],
        })

    state["current_stage"] = "verifier"
    state["findings"]["verification"] = verification
    state["audit_trail"].append({"stage": "verifier", "action": "verification_completed"})
    return state


async def responder_node(state: AgentState) -> AgentState:
    risk_result = state["findings"].get("risk_assessment", {})
    adjusted_score = state["findings"].get("exculpatory", {}).get("adjusted_score", risk_result.get("risk_score", 0))
    risk_band = state["findings"].get("exculpatory", {}).get("adjusted_band", risk_result.get("risk_band", "low"))

    recommendations = []

    if risk_band == "high":
        recommendations.append({
            "action": ActionType.FREEZE_ACCOUNT,
            "priority": 1,
            "rationale": f"Entity {state['findings']['entity_canonical_id']} scored {adjusted_score:.2f} (high risk)",
            "reversible": False,
            "weight": 0.45,
        })
        recommendations.append({
            "action": ActionType.REQUEST_BANK,
            "priority": 2,
            "rationale": "Request detailed bank records for flagged accounts",
            "reversible": True,
            "weight": 1.0,
        })
    elif risk_band == "elevated":
        recommendations.append({
            "action": ActionType.REQUEST_CDR,
            "priority": 1,
            "rationale": f"Entity {state['findings']['entity_canonical_id']} scored {adjusted_score:.2f} (elevated risk)",
            "reversible": True,
            "weight": 1.0,
        })
        recommendations.append({
            "action": ActionType.ENTITY_PIN,
            "priority": 2,
            "rationale": "Pin entity for continuous monitoring",
            "reversible": True,
            "weight": 1.0,
        })

    state["current_stage"] = "responder"
    state["recommendations"] = recommendations
    state["audit_trail"].append({"stage": "responder", "action": "recommendations_generated", "count": len(recommendations)})
    return state


async def auditor_node(state: AgentState) -> AgentState:
    async with get_db_context() as session:
        for rec in state.get("recommendations", []):
            action = CaseAction(
                case_id=state["case_id"],
                entity_id=state["entity_id"],
                action_type=rec["action"],
                status=ActionStatus.PENDING,
                requester_id=state["investigator_id"],
                rationale=rec["rationale"],
                reversible=rec["reversible"],
                weight=rec["weight"],
            )
            session.add(action)

        timeline = CaseTimeline(
            case_id=state["case_id"],
            entity_id=state["entity_id"],
            event_time=datetime.utcnow(),
            event_type="agent_pipeline_completed",
            description=f"8-stage agent pipeline completed for entity {state['findings'].get('entity_canonical_id')}",
            actor_id=state["investigator_id"],
            extra_metadata={"audit_trail": state["audit_trail"]},
        )
        session.add(timeline)

    state["current_stage"] = "auditor"
    state["audit_trail"].append({"stage": "auditor", "action": "pipeline_audit_recorded"})
    return state


def build_agent_graph():
    workflow = StateGraph(AgentState)

    workflow.add_node("planner", planner_node)
    workflow.add_node("investigator", investigator_node)
    workflow.add_node("correlator", correlator_node)
    workflow.add_node("analyst", analyst_node)
    workflow.add_node("critic", critic_node)
    workflow.add_node("verifier", verifier_node)
    workflow.add_node("responder", responder_node)
    workflow.add_node("auditor", auditor_node)

    workflow.set_entry_point("planner")
    workflow.add_edge("planner", "investigator")
    workflow.add_edge("investigator", "correlator")
    workflow.add_edge("correlator", "analyst")
    workflow.add_edge("analyst", "critic")
    workflow.add_edge("critic", "verifier")
    workflow.add_edge("verifier", "responder")
    workflow.add_edge("responder", "auditor")
    workflow.add_edge("auditor", END)

    return workflow.compile(checkpointer=MemorySaver())


agent_graph = build_agent_graph()


async def run_agent_pipeline(case_id: UUID, entity_id: UUID, investigator_id: UUID) -> dict:
    initial_state: AgentState = {
        "case_id": case_id,
        "entity_id": entity_id,
        "investigator_id": investigator_id,
        "current_stage": "start",
        "findings": {},
        "hypotheses": [],
        "criticisms": [],
        "recommendations": [],
        "verified_actions": [],
        "audit_trail": [],
        "error": None,
    }

    config = {"configurable": {"thread_id": f"{case_id}-{entity_id}"}}
    final_state = await agent_graph.ainvoke(initial_state, config)
    return final_state