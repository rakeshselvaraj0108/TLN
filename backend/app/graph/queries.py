CYPHER_QUERIES = {
    "upsert_person": """
    MERGE (p:Person {canonical_id: $canonical_id})
    SET p += $properties
    RETURN p
    """,

    "upsert_phone": """
    MERGE (p:Phone {number: $number})
    SET p += $properties
    RETURN p
    """,

    "upsert_device": """
    MERGE (d:Device {imei: $imei})
    SET d += $properties
    RETURN d
    """,

    "upsert_sim": """
    MERGE (s:Sim {imsi: $imsi})
    SET s += $properties
    RETURN s
    """,

    "upsert_account": """
    MERGE (a:Account {number: $number})
    SET a += $properties
    RETURN a
    """,

    "upsert_upi": """
    MERGE (u:UpiId {id: $id})
    SET u += $properties
    RETURN u
    """,

    "upsert_ip": """
    MERGE (i:Ip {address: $address})
    SET i += $properties
    RETURN i
    """,

    "upsert_social_handle": """
    MERGE (h:SocialHandle {handle: $handle})
    SET h += $properties
    RETURN h
    """,

    "link_person_phone": """
    MATCH (p:Person {canonical_id: $person_id}), (ph:Phone {number: $phone_number})
    MERGE (p)-[r:CONTROLS]->(ph)
    SET r += $properties
    RETURN r
    """,

    "link_person_device": """
    MATCH (p:Person {canonical_id: $person_id}), (d:Device {imei: $device_imei})
    MERGE (p)-[r:CONTROLS]->(d)
    SET r += $properties
    RETURN r
    """,

    "link_person_sim": """
    MATCH (p:Person {canonical_id: $person_id}), (s:Sim {imsi: $sim_imsi})
    MERGE (p)-[r:CONTROLS]->(s)
    SET r += $properties
    RETURN r
    """,

    "link_person_account": """
    MATCH (p:Person {canonical_id: $person_id}), (a:Account {number: $account_number})
    MERGE (p)-[r:CONTROLS]->(a)
    SET r += $properties
    RETURN r
    """,

    "link_person_upi": """
    MATCH (p:Person {canonical_id: $person_id}), (u:UpiId {id: $upi_id})
    MERGE (p)-[r:CONTROLS]->(u)
    SET r += $properties
    RETURN r
    """,

    "link_person_ip": """
    MATCH (p:Person {canonical_id: $person_id}), (i:Ip {address: $ip_address})
    MERGE (p)-[r:CONTROLS]->(i)
    SET r += $properties
    RETURN r
    """,

    "link_person_social": """
    MATCH (p:Person {canonical_id: $person_id}), (h:SocialHandle {handle: $handle})
    MERGE (p)-[r:CONTROLS]->(h)
    SET r += $properties
    RETURN r
    """,

    "create_call": """
    MERGE (c:Call {record_id: $record_id})
    SET c += $properties
    WITH c
    MATCH (a:Phone {number: $a_party}), (b:Phone {number: $b_party})
    MERGE (a)-[:MADE_CALL {record_id: $record_id}]->(c)
    MERGE (c)-[:TO]->(b)
    RETURN c
    """,

    "create_data_session": """
    MERGE (d:DataSession {record_id: $record_id})
    SET d += $properties
    WITH d
    MATCH (ph:Phone {number: $msisdn})
    MERGE (ph)-[:HAS_SESSION {record_id: $record_id}]->(d)
    MERGE (d)-[:TO_IP]->(ip:Ip {address: $dest_ip})
    RETURN d
    """,

    "create_txn": """
    MERGE (t:Txn {record_id: $record_id})
    SET t += $properties
    WITH t
    MATCH (src:Account {number: $src_account}), (dst:Account {number: $dst_account})
    MERGE (src)-[:SENT_TXN {record_id: $record_id}]->(t)
    MERGE (t)-[:TO_ACCOUNT]->(dst)
    RETURN t
    """,

    "create_post": """
    MERGE (p:Post {record_id: $record_id})
    SET p += $properties
    WITH p
    MATCH (h:SocialHandle {handle: $handle})
    MERGE (h)-[:POSTED {record_id: $record_id}]->(p)
    RETURN p
    """,

    "get_entity_graph": """
    MATCH (p:Person {canonical_id: $canonical_id})
    OPTIONAL MATCH (p)-[r1:CONTROLS]->(id:Identity)
    OPTIONAL MATCH (p)-[r2:MADE_CALL|HAS_SESSION|SENT_TXN|POSTED]->(e:Event)
    OPTIONAL MATCH (e)-[r3]->(id2:Identity)
    RETURN p, collect(DISTINCT {node: id, rel: r1}) as identities,
           collect(DISTINCT {event: e, rel: r2, target: id2}) as events
    """,

    "get_call_txn_correlation": """
    MATCH (c:Call)-[:TO]->(b:Phone)<-[:CONTROLS]-(p1:Person)
    MATCH (t:Txn)-[:TO_ACCOUNT]->(dst:Account)<-[:CONTROLS]-(p2:Person)
    WHERE c.start_time <= t.txn_time
      AND t.txn_time - c.start_time <= $max_latency_seconds
      AND p1.canonical_id = p2.canonical_id
    RETURN c.record_id as call_id, t.record_id as txn_id,
           c.start_time as call_time, t.txn_time as txn_time,
           (t.txn_time - c.start_time) as latency_seconds,
           p1.canonical_id as person_id
    ORDER BY latency_seconds
    LIMIT $limit
    """,

    "get_passthrough_analysis": """
    MATCH (p:Person)-[:CONTROLS]->(a:Account)
    MATCH (a)-[:SENT_TXN]->(t:Txn)-[:TO_ACCOUNT]->(dst:Account)<-[:CONTROLS]-(p2:Person)
    WHERE p.canonical_id <> p2.canonical_id
    WITH p, p2, collect(t) as txns
    UNWIND txns as t
    WITH p, p2, t,
         t.amount as amount,
         sum(t.amount) over (partition by p, p2) as total_out
    RETURN p.canonical_id as source_person,
           p2.canonical_id as target_person,
           count(t) as hop_count,
           sum(t.amount) as total_amount,
           avg(t.amount / total_out) as avg_passthrough_ratio
    ORDER BY avg_passthrough_ratio DESC
    """,

    "get_fan_out": """
    MATCH (p:Person)-[:CONTROLS]->(a:Account)
    MATCH (a)-[:SENT_TXN]->(t:Txn)-[:TO_ACCOUNT]->(dst:Account)<-[:CONTROLS]-(p2:Person)
    WHERE p.canonical_id <> p2.canonical_id
      AND t.txn_time >= $window_start
      AND t.txn_time <= $window_end
    WITH p, p2, collect(t) as txns
    RETURN p.canonical_id as source_person,
           count(DISTINCT p2) as fan_out_width,
           min(t.txn_time) as window_start,
           max(t.txn_time) as window_end,
           sum(t.amount) as total_amount
    HAVING fan_out_width >= $min_width
    ORDER BY fan_out_width DESC
    """,

    "get_imei_persistence": """
    MATCH (d:Device)<-[:CONTROLS]-(p:Person)
    MATCH (d)<-[:USED_IN]-(s:Sim)
    WITH d, collect(DISTINCT s.imsi) as sims, collect(DISTINCT p.canonical_id) as persons
    WHERE size(sims) > 1
    RETURN d.imei as imei, sims, persons, size(sims) as sim_count
    ORDER BY sim_count DESC
    """,

    "get_all_entities_for_scoring": """
    MATCH (p:Person)
    OPTIONAL MATCH (p)-[:CONTROLS]->(ph:Phone)
    OPTIONAL MATCH (p)-[:CONTROLS]->(d:Device)
    OPTIONAL MATCH (p)-[:CONTROLS]->(s:Sim)
    OPTIONAL MATCH (p)-[:CONTROLS]->(a:Account)
    OPTIONAL MATCH (p)-[:CONTROLS]->(u:UpiId)
    OPTIONAL MATCH (p)-[:CONTROLS]->(i:Ip)
    OPTIONAL MATCH (p)-[:CONTROLS]->(h:SocialHandle)
    OPTIONAL MATCH (ph)-[:MADE_CALL]->(c:Call)
    OPTIONAL MATCH (ph)-[:HAS_SESSION]->(ds:DataSession)
    OPTIONAL MATCH (a)-[:SENT_TXN]->(t:Txn)
    OPTIONAL MATCH (h)-[:POSTED]->(po:Post)
    RETURN p.canonical_id as person_id,
           collect(DISTINCT ph.number) as phones,
           collect(DISTINCT d.imei) as devices,
           collect(DISTINCT s.imsi) as sims,
           collect(DISTINCT a.number) as accounts,
           collect(DISTINCT u.id) as upi_ids,
           collect(DISTINCT i.address) as ips,
           collect(DISTINCT h.handle) as social_handles,
           collect(DISTINCT {record_id: c.record_id, start_time: c.start_time, duration: c.duration_sec, a_party: c.a_party, b_party: c.b_party}) as calls,
           collect(DISTINCT {record_id: ds.record_id, session_start: ds.session_start, session_end: ds.session_end, dest_ip: ds.dest_ip}) as data_sessions,
           collect(DISTINCT {record_id: t.record_id, txn_time: t.txn_time, amount: t.amount, src_account: t.src_account, dst_account: t.dst_account}) as txns,
           collect(DISTINCT {record_id: po.record_id, post_time: po.post_time, text: po.text, platform: po.platform}) as posts
    """,

    "update_person_risk": """
    MATCH (p:Person {canonical_id: $canonical_id})
    SET p.risk_score = $risk_score,
        p.risk_band = $risk_band,
        p.shap_factors = $shap_factors,
        p.counterfactual_boundary = $counterfactual_boundary,
        p.exculpatory_reduction = $exculpatory_reduction,
        p.final_adjusted_score = $final_adjusted_score,
        p.updated_at = datetime()
    RETURN p
    """,

    "get_subgraph_for_visualization": """
    MATCH (p:Person {canonical_id: $canonical_id})
    CALL apoc.path.subgraphAll(p, {
        maxLevel: 2,
        relationshipFilter: "CONTROLS|MADE_CALL|TO|HAS_SESSION|TO_IP|SENT_TXN|TO_ACCOUNT|POSTED",
        labelFilter: "+Person|+Phone|+Device|+Sim|+Account|+UpiId|+Ip|+SocialHandle|+Call|+DataSession|+Txn|+Post"
    })
    YIELD nodes, relationships
    RETURN nodes, relationships
    """,

    "clear_all_data": """
    MATCH (n) DETACH DELETE n
    """,
}