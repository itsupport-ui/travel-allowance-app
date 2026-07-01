from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.orm import declarative_base
from dotenv import load_dotenv
from os import getenv

load_dotenv()

DATABASE_URL = getenv("DATABASE_URL")

engine = create_engine(
    DATABASE_URL, 
    connect_args={"pool_pre_ping": True} 
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()