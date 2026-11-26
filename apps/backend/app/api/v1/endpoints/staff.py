from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.dependencies.auth import require_user
from app.core.database import get_db
from app.models.base import new_id
from app.models.business import Membership
from app.models.catalog import Employee
from app.models.engagement import Notification
from app.models.user import User
from app.schemas.business import InviteMemberIn, MemberRoleUpdateIn, MembershipOut
from app.schemas.catalog import EmployeeAvailabilityUpdateIn, EmployeeOut
from app.schemas.common import OkResponse
from app.services.rbac import require_business_permission

router = APIRouter(prefix="/workspaces/{business_id}", tags=["staff"])


@router.post("/team/invite", response_model=MembershipOut, status_code=status.HTTP_201_CREATED)
async def invite_member(
    business_id: str,
    payload: InviteMemberIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await require_business_permission(db, user, business_id, "team.manage")
    target = (
        await db.execute(select(User).where(User.email == payload.email.strip().lower()))
    ).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No BookIt account uses that email yet")

    existing = (
        await db.execute(
            select(Membership).where(
                Membership.user_id == target.id,
                Membership.business_id == business_id,
                Membership.status != "suspended",
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="That person is already in this workspace")

    membership = Membership(
        id=new_id("mem"),
        user_id=target.id,
        business_id=business_id,
        role=payload.role,
        status="invited",
        title=payload.title.strip(),
    )
    db.add(membership)
    db.add(
        Notification(
            id=new_id("ntf"),
            user_id=target.id,
            business_id=business_id,
            category="message",
            title="Workspace invite",
            body=f"You were invited as {payload.role}.",
            href="/account",
        )
    )
    await db.commit()
    await db.refresh(membership)
    return MembershipOut.model_validate(membership)


@router.post("/team/accept", response_model=MembershipOut)
async def accept_workspace_invite(
    business_id: str,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    membership = (
        await db.execute(
            select(Membership).where(
                Membership.business_id == business_id,
                Membership.user_id == user.id,
                Membership.status == "invited",
            )
        )
    ).scalar_one_or_none()
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No pending workspace invitation found",
        )
    membership.status = "active"
    await db.commit()
    await db.refresh(membership)
    return MembershipOut.model_validate(membership)


@router.post("/team/decline", response_model=OkResponse)
async def decline_workspace_invite(
    business_id: str,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    membership = (
        await db.execute(
            select(Membership).where(
                Membership.business_id == business_id,
                Membership.user_id == user.id,
                Membership.status == "invited",
            )
        )
    ).scalar_one_or_none()
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No pending workspace invitation found",
        )
    await db.delete(membership)
    await db.commit()
    return OkResponse(ok=True, message="Workspace invitation declined")


@router.patch("/team/{membership_id}/role", response_model=MembershipOut)
async def set_member_role(
    business_id: str,
    membership_id: str,
    payload: MemberRoleUpdateIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await require_business_permission(db, user, business_id, "team.manage")
    membership = (
        await db.execute(
            select(Membership).where(Membership.id == membership_id, Membership.business_id == business_id)
        )
    ).scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membership not found")
    if membership.role == "owner":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot reassign primary owner role")
    membership.role = payload.role
    await db.commit()
    await db.refresh(membership)
    return MembershipOut.model_validate(membership)


@router.patch("/employees/{employee_id}", response_model=EmployeeOut)
async def update_employee_availability(
    business_id: str,
    employee_id: str,
    payload: EmployeeAvailabilityUpdateIn,
    user: Annotated[User, Depends(require_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await require_business_permission(db, user, business_id, "calendar.manage")
    employee = (
        await db.execute(
            select(Employee)
            .options(selectinload(Employee.services))
            .where(Employee.id == employee_id, Employee.business_id == business_id)
        )
    ).scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    if payload.status is not None:
        employee.status = payload.status
    if payload.hours is not None:
        employee.hours = payload.hours.model_dump()
    if payload.title is not None:
        employee.title = payload.title.strip()
    await db.commit()
    await db.refresh(employee)
    return EmployeeOut(
        id=employee.id,
        business_id=employee.business_id,
        user_id=employee.user_id,
        membership_id=employee.membership_id,
        title=employee.title,
        bio=employee.bio,
        service_ids=[s.id for s in employee.services],
        hours=employee.hours,  # type: ignore[arg-type]
        status=employee.status,  # type: ignore[arg-type]
        rating=employee.rating,
    )
