from datetime import date

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.reimbursement_policy import ReimbursementPolicy
from app.services.reimbursement_policy_service import get_reimbursement_policy


def test_empty_policy_table_is_seeded_on_lookup():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    try:
        assert db.query(ReimbursementPolicy).count() == 0
        policy = get_reimbursement_policy(db, date(2026, 11, 4))
        assert policy.version == 1
        assert float(policy.per_km_rate) == 8
        assert float(policy.daily_allowance) == 150
        db.commit()
        assert db.query(ReimbursementPolicy).count() == 1
        get_reimbursement_policy(db, date(2026, 11, 4))
        assert db.query(ReimbursementPolicy).count() == 1
    finally:
        db.close()
