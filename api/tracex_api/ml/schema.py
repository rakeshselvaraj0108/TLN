"""The model's input contract. `engine.scoring.FEATURES` must stay identical (asserted in the tests)."""
from __future__ import annotations

FEATURES = [
    "n_phones", "n_devices", "n_accounts", "n_ips_shared", "max_imei_sim_count", "has_call_debit_coupling",
    "call_debit_speed_score", "n_call_debit_links", "max_passthrough_ratio", "max_fanout_hop_count",
    "total_fanout_inbound_inr", "inbound_txn_count", "outbound_txn_count", "distinct_counterparties",
    "counterparty_stability", "txn_velocity", "coupled_calls_out", "callee_money_movers",
]

# Monotone constraints encode domain knowledge the data alone must not be allowed to unlearn: sharing more
# network infrastructure, carrying more SIMs in one handset, passing more of a credit straight on, fanning out
# wider, and calling people who then move large sums are never *less* suspicious than their opposites.
# Everything else (counts, velocity, stability) is left free — a busy legitimate business looks busy too.
MONOTONE_UP = {"n_ips_shared", "max_imei_sim_count", "max_passthrough_ratio", "max_fanout_hop_count",
               "coupled_calls_out", "callee_money_movers"}
MONOTONE = tuple(1 if f in MONOTONE_UP else 0 for f in FEATURES)

FRAUD_ROLES = {"handler", "associate", "mule", "sim_farm", "layering"}
