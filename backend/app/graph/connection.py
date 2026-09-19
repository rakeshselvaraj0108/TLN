from neo4j import AsyncGraphDatabase, AsyncDriver
from neo4j.exceptions import Neo4jError
from app.core.config import get_settings
import structlog

logger = structlog.get_logger()
settings = get_settings()


class Neo4jConnection:
    _driver: AsyncDriver | None = None

    @classmethod
    async def get_driver(cls) -> AsyncDriver:
        if cls._driver is None:
            cls._driver = AsyncGraphDatabase.driver(
                settings.NEO4J_URI,
                auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
                max_connection_lifetime=3600,
                max_connection_pool_size=50,
                connection_acquisition_timeout=60,
            )
            await cls._driver.verify_connectivity()
            logger.info("neo4j_connected", uri=settings.NEO4J_URI)
        return cls._driver

    @classmethod
    async def close(cls) -> None:
        if cls._driver:
            await cls._driver.close()
            cls._driver = None
            logger.info("neo4j_disconnected")

    @classmethod
    async def run_cypher(cls, query: str, parameters: dict | None = None):
        driver = await cls.get_driver()
        async with driver.session() as session:
            try:
                result = await session.run(query, parameters or {})
                return [record.data() async for record in result]
            except Neo4jError as e:
                logger.error("neo4j_query_failed", query=query[:200], error=str(e))
                raise


async def init_neo4j_schema() -> None:
    driver = await Neo4jConnection.get_driver()
    async with driver.session() as session:
        constraints = [
            "CREATE CONSTRAINT person_canonical_id IF NOT EXISTS FOR (p:Person) REQUIRE p.canonical_id IS UNIQUE",
            "CREATE CONSTRAINT phone_number IF NOT EXISTS FOR (p:Phone) REQUIRE p.number IS UNIQUE",
            "CREATE CONSTRAINT device_imei IF NOT EXISTS FOR (d:Device) REQUIRE d.imei IS UNIQUE",
            "CREATE CONSTRAINT sim_imsi IF NOT EXISTS FOR (s:Sim) REQUIRE s.imsi IS UNIQUE",
            "CREATE CONSTRAINT account_number IF NOT EXISTS FOR (a:Account) REQUIRE a.number IS UNIQUE",
            "CREATE CONSTRAINT upi_id IF NOT EXISTS FOR (u:UpiId) REQUIRE u.id IS UNIQUE",
            "CREATE CONSTRAINT ip_address IF NOT EXISTS FOR (i:Ip) REQUIRE i.address IS UNIQUE",
            "CREATE CONSTRAINT social_handle IF NOT EXISTS FOR (h:SocialHandle) REQUIRE h.handle IS UNIQUE",
            "CREATE CONSTRAINT call_record_id IF NOT EXISTS FOR (c:Call) REQUIRE c.record_id IS UNIQUE",
            "CREATE CONSTRAINT data_session_record_id IF NOT EXISTS FOR (d:DataSession) REQUIRE d.record_id IS UNIQUE",
            "CREATE CONSTRAINT txn_record_id IF NOT EXISTS FOR (t:Txn) REQUIRE t.record_id IS UNIQUE",
            "CREATE CONSTRAINT post_record_id IF NOT EXISTS FOR (p:Post) REQUIRE p.record_id IS UNIQUE",
        ]
        for constraint in constraints:
            try:
                await session.run(constraint)
            except Neo4jError as e:
                if "already exists" not in str(e).lower():
                    logger.warning("constraint_creation_warning", constraint=constraint, error=str(e))

        indexes = [
            "CREATE INDEX person_risk_score IF NOT EXISTS FOR (p:Person) ON (p.risk_score)",
            "CREATE INDEX person_risk_band IF NOT EXISTS FOR (p:Person) ON (p.risk_band)",
            "CREATE INDEX call_start_time IF NOT EXISTS FOR (c:Call) ON (c.start_time)",
            "CREATE INDEX txn_time IF NOT EXISTS FOR (t:Txn) ON (t.txn_time)",
            "CREATE INDEX data_session_start IF NOT EXISTS FOR (d:DataSession) ON (d.session_start)",
            "CREATE INDEX post_time IF NOT EXISTS FOR (p:Post) ON (p.post_time)",
            "CREATE INDEX row_sha256 IF NOT EXISTS FOR (n) ON (n.row_sha256)",
        ]
        for index in indexes:
            try:
                await session.run(index)
            except Neo4jError as e:
                if "already exists" not in str(e).lower():
                    logger.warning("index_creation_warning", index=index, error=str(e))

    logger.info("neo4j_schema_initialized")