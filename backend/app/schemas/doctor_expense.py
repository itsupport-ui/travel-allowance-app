from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.utils.uploads import public_upload_name


class DoctorExpenseCreate(BaseModel):
    expense_date: date
    from_location: str
    to_location: str
    transport_mode: str
    fare: float = Field(gt=0)
    remarks: str | None = None


class DoctorExpenseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    doctor_id: int
    expense_date: date
    from_location: str
    to_location: str
    transport_mode: str
    fare: float
    proof_file: str | None = None
    remarks: str | None = None
    status: str
    claim_id: int | None = None
    created_at: datetime

    @field_validator("proof_file", mode="before")
    @classmethod
    def serialize_proof_name(cls, value) -> str | None:
        return public_upload_name(value, "proof")
