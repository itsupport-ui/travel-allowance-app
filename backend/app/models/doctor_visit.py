from datetime import datetime
from sqlalchemy import (
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from app.database import Base
from app.models.enums import VISIT_STATUS

class DoctorVisit(Base):
    __tablename__ = 'doctor_visits'
    __table_args__ = (
        UniqueConstraint(
            'consultation_id',
            name='uq_doctor_visits_consultation_id',
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_name = Column(String(255), nullable=False)
    patient_phone = Column(String(20), nullable=False)
    patient_address = Column(String(255), nullable=True)
    doctor_id = Column(Integer, ForeignKey('doctors.id'), nullable=False)
    visit_date = Column(Date, nullable=False)
    visit_time = Column(Time, nullable=False)
    chief_complaint = Column(Text, nullable=True)
    remarks = Column(Text, nullable=True)
    status = Column(VISIT_STATUS, default='scheduled')
    created_by = Column(Integer, ForeignKey('users.id'), nullable=False)
    consultation_id = Column(Integer, ForeignKey('doctor_consultations.id'), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    doctor = relationship('Doctor', back_populates='visits')
    creator = relationship('User', back_populates='created_visits')
