from datetime import datetime
import hmac
import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.users import User

router = APIRouter(prefix="/api/users", tags=["users"])


def normalize_email(value: str) -> str:
    return value.strip().lower()


def serialize_user(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat() if isinstance(user.created_at, datetime) else None,
        "updated_at": user.updated_at.isoformat() if isinstance(user.updated_at, datetime) else None,
    }


def hash_password(raw: str) -> str:
    # rounds explícitos y decode a str
    return bcrypt.hashpw(raw.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")

def verify_password(raw: str, hashed: str) -> bool:
    try:
        # Fallback: si no parece bcrypt ($2a/$2b/$2y) o es muy corto, comparamos plano de forma segura.
        if not hashed or not hashed.startswith("$2") or len(hashed) < 50:
            return hmac.compare_digest(raw, hashed or "")
        return bcrypt.checkpw(raw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        # Nunca propagar errores al endpoint de login
        return False


class UserCreateSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    email: EmailStr
    role: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=6, max_length=255)


class UserUpdateSchema(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=150)
    email: EmailStr | None = None
    role: str | None = Field(None, min_length=1, max_length=50)
    password: str | None = Field(None, min_length=6, max_length=255)
    is_active: bool | None = None


class UserLoginSchema(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)


@router.get("/")
async def list_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).order_by(User.id))
    users = result.scalars().all()
    return [serialize_user(user) for user in users]


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_user(payload: UserCreateSchema, db: AsyncSession = Depends(get_db)):
    email = normalize_email(payload.email)
    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        name=payload.name.strip(),
        email=email,
        role=payload.role.strip(),
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not create user") from exc

    await db.refresh(user)
    return serialize_user(user)


@router.put("/{user_id}")
async def update_user(user_id: int, payload: UserUpdateSchema, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if payload.name is not None:
        user.name = payload.name.strip()

    if payload.email is not None:
        email = normalize_email(payload.email)
        if email != user.email:
            duplicate = await db.execute(select(User).where(User.email == email))
            if duplicate.scalar_one_or_none():
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
        user.email = email

    if payload.role is not None:
        user.role = payload.role.strip()

    if payload.password:
        user.password_hash = hash_password(payload.password)

    if payload.is_active is not None:
        user.is_active = payload.is_active

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not update user") from exc

    await db.refresh(user)
    return serialize_user(user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(user_id: int, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    await db.delete(user)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/login")
async def login(payload: UserLoginSchema, db: AsyncSession = Depends(get_db)):
    email = normalize_email(payload.email)
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario inactivo")

    return serialize_user(user)
