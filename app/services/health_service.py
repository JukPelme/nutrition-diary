"""
Rules engine: merges dietary rules from multiple conditions into unified recommendations.
When rules conflict, the more restrictive rule wins (lower max, higher min).
"""
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.models.health import ICD11Condition, UserCondition


async def get_conditions(db: AsyncSession, query: str | None = None, category: str | None = None, limit: int = 50, offset: int = 0):
    stmt = select(ICD11Condition)
    if query:
        stmt = stmt.where(
            ICD11Condition.name_en.ilike(f"%{query}%")
            | ICD11Condition.name_ru.ilike(f"%{query}%")
            | ICD11Condition.code.ilike(f"%{query}%")
        )
    if category:
        stmt = stmt.where(ICD11Condition.category == category)
    stmt = stmt.order_by(ICD11Condition.code).offset(offset).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_user_conditions(db: AsyncSession, user_id: UUID) -> list[UserCondition]:
    result = await db.execute(
        select(UserCondition)
        .where(UserCondition.user_id == user_id)
        .options(selectinload(UserCondition.condition))
    )
    return list(result.scalars().all())


async def add_user_condition(db: AsyncSession, user_id: UUID, condition_id: UUID, severity: str | None = None, diagnosed_at: str | None = None, notes: str | None = None) -> UserCondition:
    uc = UserCondition(user_id=user_id, condition_id=condition_id, severity=severity, diagnosed_at=diagnosed_at, notes=notes)
    db.add(uc)
    await db.flush()
    # Reload with condition
    result = await db.execute(
        select(UserCondition).where(UserCondition.id == uc.id).options(selectinload(UserCondition.condition))
    )
    return result.scalar_one()


async def remove_user_condition(db: AsyncSession, user_condition_id: UUID, user_id: UUID) -> bool:
    result = await db.execute(
        select(UserCondition).where(UserCondition.id == user_condition_id, UserCondition.user_id == user_id)
    )
    uc = result.scalar_one_or_none()
    if not uc:
        return False
    await db.delete(uc)
    await db.flush()
    return True


async def get_merged_recommendations(db: AsyncSession, user_id: UUID) -> dict:
    """
    Merge dietary rules from all user conditions.
    Conflicts resolved: more restrictive wins.
    """
    user_conditions = await get_user_conditions(db, user_id)

    merged = {
        "restrict": {},      # nutrient -> {"value": max, "from": [conditions]}
        "increase": {},      # nutrient -> {"value": min, "from": [conditions]}
        "avoid": {},         # item -> [conditions]
        "prefer": {},        # item -> [conditions]
        "calorie_adjustment": 0,
        "macro_ratio": None,
        "conditions": [],
    }

    for uc in user_conditions:
        cond = uc.condition
        rules = cond.dietary_rules
        if not rules:
            continue

        cond_label = f"{cond.code} {cond.name_ru or cond.name_en}"
        merged["conditions"].append(cond_label)

        # Restrict: lower is more restrictive
        for nutrient, max_val in rules.get("restrict", {}).items():
            if nutrient not in merged["restrict"] or max_val < merged["restrict"][nutrient]["value"]:
                merged["restrict"][nutrient] = {"value": max_val, "from": [cond_label]}
            elif max_val == merged["restrict"][nutrient]["value"]:
                merged["restrict"][nutrient]["from"].append(cond_label)

        # Increase: higher is more demanding
        for nutrient, min_val in rules.get("increase", {}).items():
            if nutrient not in merged["increase"] or min_val > merged["increase"][nutrient]["value"]:
                merged["increase"][nutrient] = {"value": min_val, "from": [cond_label]}
            elif min_val == merged["increase"][nutrient]["value"]:
                merged["increase"][nutrient]["from"].append(cond_label)

        # Avoid: union of all
        for item in rules.get("avoid", []):
            if item not in merged["avoid"]:
                merged["avoid"][item] = []
            merged["avoid"][item].append(cond_label)

        # Prefer: union of all
        for item in rules.get("prefer", []):
            if item not in merged["prefer"]:
                merged["prefer"][item] = []
            merged["prefer"][item].append(cond_label)

        # Calorie adjustment: most negative wins
        adj = rules.get("calorie_adjustment", 0)
        if adj < merged["calorie_adjustment"]:
            merged["calorie_adjustment"] = adj

        # Macro ratio: last non-null wins (could be improved with averaging)
        if rules.get("macro_ratio"):
            merged["macro_ratio"] = rules["macro_ratio"]

    # Flatten for cleaner response
    return {
        "restrict": {k: v["value"] for k, v in merged["restrict"].items()},
        "increase": {k: v["value"] for k, v in merged["increase"].items()},
        "avoid": list(merged["avoid"].keys()),
        "prefer": list(merged["prefer"].keys()),
        "calorie_adjustment": merged["calorie_adjustment"],
        "macro_ratio": merged["macro_ratio"],
        "conditions": merged["conditions"],
        "details": {
            "restrict": merged["restrict"],
            "increase": merged["increase"],
            "avoid": merged["avoid"],
            "prefer": merged["prefer"],
        },
    }
