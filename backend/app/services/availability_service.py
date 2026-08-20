"""Branch operational schedules and current availability."""

from __future__ import annotations

from datetime import datetime, timezone

from app.models.commerce import BranchSchedule, ShopBranch


class AvailabilityService:
    async def list_schedules(self, branch_id: int) -> list[dict]:
        if not await ShopBranch.filter(id=branch_id).exists():
            raise KeyError("Branch not found")
        return await BranchSchedule.filter(branch_id=branch_id, active=True).order_by(
            "starts_at", "id"
        ).values(
            "id", "branch_id", "kind", "title", "starts_at", "ends_at",
            "all_day", "is_closed", "notes", "active", "metadata", "created_at",
        )

    async def create_schedule(self, branch_id: int, **values) -> BranchSchedule:
        if not await ShopBranch.filter(id=branch_id, active=True).exists():
            raise KeyError("Active branch not found")
        starts_at = values["starts_at"].astimezone(timezone.utc)
        ends_at = values["ends_at"].astimezone(timezone.utc)
        return await BranchSchedule.create(
            branch_id=branch_id, starts_at=starts_at, ends_at=ends_at, **{
                key: value for key, value in values.items() if key not in {"starts_at", "ends_at"}
            },
        )

    async def delete_schedule(self, schedule_id: int) -> None:
        schedule = await BranchSchedule.get_or_none(id=schedule_id)
        if schedule is None:
            raise KeyError("Schedule not found")
        schedule.active = False
        await schedule.save(update_fields=["active", "updated_at"])

    async def current_status(self, branch_id: int, at: datetime | None = None) -> dict:
        moment = (at or datetime.now(timezone.utc)).astimezone(timezone.utc)
        branch = await ShopBranch.get_or_none(id=branch_id)
        if branch is None:
            raise KeyError("Branch not found")
        if not branch.active:
            return {"status": "disabled", "event": None}
        event = await BranchSchedule.filter(
            branch_id=branch_id, active=True, starts_at__lte=moment, ends_at__gt=moment,
        ).order_by("-starts_at", "-id").first()
        if event is None or not event.is_closed:
            return {"status": "open", "event": None}
        return {
            "status": "closed",
            "event": {
                "id": event.id, "kind": event.kind, "title": event.title,
                "starts_at": event.starts_at, "ends_at": event.ends_at,
            },
        }
