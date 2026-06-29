"""Import wearable data from local exports (no OAuth).

Supported:
  - Apple Health: export.xml inside ZIP (or raw XML)
  - Garmin Connect: Weight.csv, Sleep.csv (manual export)
  - Generic CSV: date,type,value
"""
import csv
import io
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, date
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.device import HealthMetric

router = APIRouter(prefix="/wearable", tags=["wearable"])


_UNITS = {
    "weight": "kg", "steps": "steps", "heart_rate": "bpm", "glucose": "mg/dL",
    "calories_burned": "kcal", "sleep": "hours",
    "blood_pressure_sys": "mmHg", "blood_pressure_dia": "mmHg",
}

_APPLE_TYPE_MAP = {
    "HKQuantityTypeIdentifierBodyMass": "weight",        # kg
    "HKQuantityTypeIdentifierStepCount": "steps",
    "HKQuantityTypeIdentifierHeartRate": "heart_rate",
    "HKQuantityTypeIdentifierBloodGlucose": "glucose",
    "HKQuantityTypeIdentifierActiveEnergyBurned": "calories_burned",
    "HKCategoryTypeIdentifierSleepAnalysis": "sleep",
    "HKQuantityTypeIdentifierBloodPressureSystolic": "blood_pressure_sys",
    "HKQuantityTypeIdentifierBloodPressureDiastolic": "blood_pressure_dia",
}


@router.post("/import/apple-health")
async def import_apple_health(
    file: UploadFile = File(..., description="Apple Health export.xml or export.zip"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    raw = await file.read()
    if len(raw) > 200 * 1024 * 1024:
        raise HTTPException(413, "File too large (max 200MB)")

    # Detect ZIP vs raw XML
    xml_bytes = None
    if raw[:2] == b"PK":  # ZIP
        try:
            zf = zipfile.ZipFile(io.BytesIO(raw))
            for name in zf.namelist():
                if name.endswith("export.xml"):
                    xml_bytes = zf.read(name)
                    break
            if not xml_bytes:
                raise HTTPException(400, "export.xml not found in ZIP")
        except zipfile.BadZipFile:
            raise HTTPException(400, "Bad ZIP")
    else:
        xml_bytes = raw

    inserted = 0
    skipped = 0
    # Use iterparse to handle big XML without loading all in memory
    try:
        for event, elem in ET.iterparse(io.BytesIO(xml_bytes), events=("end",)):
            if elem.tag != "Record":
                continue
            apple_type = elem.attrib.get("type", "")
            mapped = _APPLE_TYPE_MAP.get(apple_type)
            if not mapped:
                skipped += 1
                elem.clear()
                continue
            value_raw = elem.attrib.get("value", "")
            try:
                value = float(value_raw)
            except Exception:
                elem.clear()
                continue
            date_str = elem.attrib.get("startDate", "")[:10]
            try:
                recorded = datetime.fromisoformat(elem.attrib.get("startDate", "").replace("Z", "+00:00").split(" +")[0].split(" ")[0] + "T00:00:00")
            except Exception:
                recorded = datetime.utcnow()
            db.add(HealthMetric(
                id=uuid4(),
                user_id=user.id,
                provider="apple_health",
                metric_type=mapped,
                value=value,
                unit=_UNITS.get(mapped, ""),
                measured_at=recorded,
            ))
            inserted += 1
            elem.clear()
            if inserted >= 5000:
                break
    except ET.ParseError as e:
        raise HTTPException(400, f"XML parse error: {e}")

    await db.commit()
    return {"inserted": inserted, "skipped_types": skipped}


@router.post("/import/garmin-csv")
async def import_garmin_csv(
    file: UploadFile = File(..., description="Garmin Weight/Sleep/Steps CSV"),
    metric: str = Query("weight", pattern="^(weight|steps|sleep|heart_rate)$"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    raw = await file.read()
    text = raw.decode("utf-8", errors="ignore")
    reader = csv.DictReader(io.StringIO(text))
    inserted = 0
    for row in reader:
        # Garmin CSV usually has 'Date' + 'Value'/'Weight'/'Steps' columns. Try common variants.
        date_str = row.get("Date") or row.get("date") or row.get("Дата") or ""
        val_str = (
            row.get("Weight (kg)") or row.get("Weight") or row.get("Value") or
            row.get("Steps") or row.get("Sleep (h)") or row.get("Heart Rate") or ""
        )
        try:
            val = float(str(val_str).replace(",", "."))
        except Exception:
            continue
        try:
            recorded = datetime.fromisoformat(date_str[:19]) if "T" in date_str else datetime.strptime(date_str[:10], "%Y-%m-%d")
        except Exception:
            try:
                recorded = datetime.strptime(date_str[:10], "%d.%m.%Y")
            except Exception:
                continue
        db.add(HealthMetric(
            id=uuid4(),
            user_id=user.id,
            provider="garmin",
            metric_type=metric,
            value=val,
            unit=_UNITS.get(metric, ""),
            measured_at=recorded,
        ))
        inserted += 1
        if inserted >= 5000:
            break

    await db.commit()
    return {"inserted": inserted}
