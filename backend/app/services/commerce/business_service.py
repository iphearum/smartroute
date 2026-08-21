"""Merchant identity: businesses, their branches, and their storefronts.

Extracted from the old `MapStore` repository (now `MapService`), which mixed
map registry, places, commerce, and currency concerns in one 757-line class.
"""

from __future__ import annotations

from app.models.commerce import BranchSchedule, Business, ShopBranch, Storefront
from app.services.commerce.availability_service import AvailabilityService
from app.models.place import Place
from app.services.base_service import BaseService
from app.support.slug import validate_slug


class BusinessService(BaseService[Business]):
    model = Business

    async def create_business(self, **values) -> Business:
        values["display_name"] = values["display_name"].strip()
        return await self.create(**values)

    async def _require(self, business_id: int) -> None:
        if not await self.exists(id=business_id):
            raise KeyError("Business not found")

    async def get_business(self, business_id: int) -> dict:
        rows = await self.values(
            "id", "owner_user_id", "legal_name", "display_name", "business_type",
            "description", "logo_url", "status", "verification_status", "metadata",
            "created_at", "updated_at",
            id=business_id,
        )
        if not rows:
            raise KeyError("Business not found")
        return await self._with_branches_and_storefronts(rows[0])

    async def get_business_for_owner(self, owner_user_id: str) -> dict | None:
        """The signed-in user's own business, e.g. for GET /commerce/businesses/mine.

        Ownership here is a plain column match, not row-level security -- the
        caller (CommerceController.my_business) must derive `owner_user_id`
        from the session cookie, never from client-supplied input.
        """
        rows = await self.values(
            "id", "owner_user_id", "legal_name", "display_name", "business_type",
            "description", "logo_url", "status", "verification_status", "metadata",
            "created_at", "updated_at",
            owner_user_id=owner_user_id,
        )
        if not rows:
            return None
        return await self._with_branches_and_storefronts(rows[0])

    async def _with_branches_and_storefronts(self, business: dict) -> dict:
        business_id = business["id"]
        business["branches"] = await ShopBranch.filter(
            business_id=business_id, active=True,
        ).order_by("id").values(
            "id", "place_id", "name", "phone", "email", "opening_hours",
            "pickup_enabled", "delivery_enabled", "metadata",
            "active", "place__name", "place__address", "place__latitude", "place__longitude",
            "place__status",
        )
        availability = AvailabilityService()
        for branch in business["branches"]:
            branch["schedules"] = await availability.list_schedules(branch["id"])
            branch["availability"] = await availability.current_status(branch["id"])
        business["storefronts"] = await Storefront.filter(business_id=business_id).values(
            "id", "slug", "title", "description", "currency", "theme", "published",
        )
        return business

    async def update_business(self, business_id: int, **values) -> Business:
        business = await self.find(business_id)
        if business is None:
            raise KeyError("Business not found")
        if values.get("display_name") is not None:
            values["display_name"] = values["display_name"].strip()
        for field, value in values.items():
            if value is not None:
                setattr(business, field, value)
        await business.save()
        return business

    async def create_shop_branch(self, business_id: int, place_id: int, **values) -> ShopBranch:
        await self._require(business_id)
        if not await Place.filter(id=place_id, active=True).exists():
            raise KeyError("Place not found")
        if await ShopBranch.filter(business_id=business_id, place_id=place_id).exists():
            raise ValueError("Business already has a branch at this place")
        return await ShopBranch.create(business_id=business_id, place_id=place_id, **values)

    async def update_shop_branch(self, branch_id: int, **values) -> ShopBranch:
        branch = await ShopBranch.get_or_none(id=branch_id)
        if branch is None:
            raise KeyError("Branch not found")
        if values.get("name") is not None:
            values["name"] = values["name"].strip()
        for field, value in values.items():
            if value is not None:
                setattr(branch, field, value)
        await branch.save()
        return branch

    async def create_storefront(self, business_id: int, **values) -> Storefront:
        await self._require(business_id)
        values["slug"] = validate_slug(values["slug"]).replace("_", "-")
        values["currency"] = values.get("currency", "USD").upper()
        return await Storefront.create(business_id=business_id, **values)
