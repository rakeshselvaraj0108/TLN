"""LLM-driven investigator agent.

    providers.py  Claude / Ollama / deterministic-planner behind one interface, with explicit local-vs-cloud disclosure
    tools.py      the READ-ONLY investigation tools the agent may call (least privilege: it can look, it cannot act)
    loop.py       the tool-use loop: plan -> call tools -> observe -> answer -> verify -> repair, traced into the ledger
    narrate.py    grounded prose for the pipeline's run report

The agent never scores, decides or executes anything itself. Scores come from the model in `ml/`, evidence from the
records, and every factual sentence it writes is re-checked against the cited records by `engine/verify.py`.
"""
