"""Export diary data as CSV."""
import io
import csv
from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.diary import DiaryEntry

router = APIRouter(prefix="/export", tags=["export"])


@router.get("/csv")
async def export_csv(
    days: int = Query(7, ge=1, le=365, description="Number of days to export"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    start_date = date.today() - timedelta(days=days - 1)

    result = await db.execute(
        select(DiaryEntry)
        .where(DiaryEntry.user_id == current_user.id)
        .where(DiaryEntry.entry_date >= start_date)
        .order_by(DiaryEntry.entry_date, DiaryEntry.created_at)
    )
    entries = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Дата", "Продукт", "Порция (г)", "Калории", "Белки", "Жиры", "Углеводы"])

    for e in entries:
        writer.writerow([
            e.entry_date.isoformat(),
            e.product_name,
            round(e.serving_amount, 1),
            round(e.calories or 0, 1),
            round(e.protein or 0, 1),
            round(e.fat or 0, 1),
            round(e.carbohydrates or 0, 1),
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=diary_{days}d.csv"}
    )


from datetime import date as _date, timedelta as _td, datetime as _dt
from io import BytesIO
from fastapi import Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select as _sel, func as _func, desc as _desc
from app.models.diary import DiaryEntry as _DE
from app.models.water import WaterEntry as _WE
from app.models.health import MoodEntry as _ME, FastingSession as _FS, ICD11Condition as _IC, UserCondition as _UC


@router.get("/pdf")
async def export_pdf(
    days: int = Query(30, ge=7, le=365),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    import os

    # Try to register a Cyrillic-capable font; reportlab default doesn't have Cyrillic
    font_name = "Helvetica"
    bold_name = "Helvetica-Bold"
    for candidate in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ]:
        if os.path.exists(candidate):
            try:
                if "Bold" in candidate:
                    pdfmetrics.registerFont(TTFont("DejaVuSans-Bold", candidate))
                    bold_name = "DejaVuSans-Bold"
                else:
                    pdfmetrics.registerFont(TTFont("DejaVuSans", candidate))
                    font_name = "DejaVuSans"
            except Exception:
                pass

    today = _date.today()
    since = today - _td(days=days - 1)

    # Diary daily aggregates
    daily = (await db.execute(
        _sel(
            _DE.entry_date.label("d"),
            _func.sum(_DE.calories).label("cal"),
            _func.sum(_DE.protein).label("prot"),
            _func.sum(_DE.fat).label("fat"),
            _func.sum(_DE.carbohydrates).label("carb"),
            _func.count(_DE.id).label("n"),
        ).where(_DE.user_id == user.id, _DE.entry_date >= since)
         .group_by(_DE.entry_date).order_by(_DE.entry_date)
    )).all()

    days_tracked = len(daily)
    if days_tracked == 0:
        avg = {"cal": 0, "prot": 0, "fat": 0, "carb": 0}
    else:
        avg = {
            "cal": sum(r.cal or 0 for r in daily) / days_tracked,
            "prot": sum(r.prot or 0 for r in daily) / days_tracked,
            "fat": sum(r.fat or 0 for r in daily) / days_tracked,
            "carb": sum(r.carb or 0 for r in daily) / days_tracked,
        }

    top_products = (await db.execute(
        _sel(_DE.product_name, _func.count(_DE.id).label("n"))
        .where(_DE.user_id == user.id, _DE.entry_date >= since)
        .group_by(_DE.product_name).order_by(_desc("n")).limit(10)
    )).all()

    water_avg = (await db.execute(
        _sel(_func.avg(_func.coalesce(_WE.amount_ml, 0)))
        .where(_WE.user_id == user.id)
    )).scalar() or 0

    mood_rows = (await db.execute(
        _sel(_ME).where(_ME.user_id == user.id).order_by(_desc(_ME.date)).limit(7)
    )).scalars().all()

    fasting_rows = (await db.execute(
        _sel(_FS).where(_FS.user_id == user.id, _FS.started_at >= _dt.combine(since, _dt.min.time()))
    )).scalars().all()
    fast_completed = sum(1 for f in fasting_rows if f.completed is True)

    conds = (await db.execute(
        _sel(_IC.name_ru, _IC.name_en, _IC.code).join(_UC).where(_UC.user_id == user.id)
    )).all()

    # Build PDF
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18*mm, rightMargin=18*mm, topMargin=18*mm, bottomMargin=18*mm)
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("H1", parent=styles["Heading1"], fontName=bold_name, fontSize=20, spaceAfter=10)
    h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontName=bold_name, fontSize=14, spaceBefore=12, spaceAfter=6)
    body = ParagraphStyle("Body", parent=styles["Normal"], fontName=font_name, fontSize=10, leading=14)
    small = ParagraphStyle("Small", parent=body, fontSize=9, textColor=colors.grey)

    story = []
    story.append(Paragraph("Отчёт по питанию", h1))
    story.append(Paragraph(
        f"{user.full_name or user.email} · {since.strftime('%d.%m.%Y')} — {today.strftime('%d.%m.%Y')} ({days} дней) · сгенерирован {today.strftime('%d.%m.%Y')}",
        small
    ))
    story.append(Spacer(1, 8))

    # Profile
    story.append(Paragraph("Профиль", h2))
    age = (today.year - user.birth_year) if user.birth_year else None
    bmi = None
    if user.current_weight and user.height:
        h_m = user.height / 100
        bmi = round(user.current_weight / (h_m * h_m), 1)
    profile_data = [
        ["Поле", "Значение"],
        ["Email", user.email or "—"],
        ["Имя", user.full_name or "—"],
        ["Возраст", str(age) if age else "—"],
        ["Пол", user.sex or "—"],
        ["Рост", f"{user.height} см" if user.height else "—"],
        ["Текущий вес", f"{user.current_weight} кг" if user.current_weight else "—"],
        ["Цель веса", f"{user.target_weight} кг" if user.target_weight else "—"],
        ["ИМТ", str(bmi) if bmi else "—"],
        ["Цель калорий/день", str(user.daily_calorie_goal or "—")],
        ["Цель белка, г", str(user.daily_protein_goal or "—")],
        ["Цель жиров, г", str(user.daily_fat_goal or "—")],
        ["Цель углеводов, г", str(user.daily_carb_goal or "—")],
        ["Цель воды, мл", str(user.daily_water_goal_ml or "—")],
    ]
    t = Table(profile_data, colWidths=[55*mm, 100*mm])
    t.setStyle(TableStyle([
        ("FONT", (0,0), (-1,-1), font_name, 9),
        ("FONT", (0,0), (-1,0), bold_name, 9),
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#e9ecef")),
        ("GRID", (0,0), (-1,-1), 0.25, colors.HexColor("#ced4da")),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#f8f9fa")]),
    ]))
    story.append(t)

    # Summary
    story.append(Paragraph(f"Сводка за период ({days_tracked} дней с записями)", h2))
    sum_data = [
        ["Метрика", "Среднее в день"],
        ["Калории, ккал", f"{avg['cal']:.0f}"],
        ["Белки, г", f"{avg['prot']:.1f}"],
        ["Жиры, г", f"{avg['fat']:.1f}"],
        ["Углеводы, г", f"{avg['carb']:.1f}"],
    ]
    t = Table(sum_data, colWidths=[80*mm, 75*mm])
    t.setStyle(TableStyle([
        ("FONT", (0,0), (-1,-1), font_name, 9),
        ("FONT", (0,0), (-1,0), bold_name, 9),
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#e9ecef")),
        ("GRID", (0,0), (-1,-1), 0.25, colors.HexColor("#ced4da")),
    ]))
    story.append(t)

    # Top products
    if top_products:
        story.append(Paragraph("Самые частые продукты", h2))
        top_data = [["#", "Продукт", "Раз"]]
        for i, r in enumerate(top_products, 1):
            top_data.append([str(i), r.product_name[:60], str(r.n)])
        t = Table(top_data, colWidths=[10*mm, 130*mm, 15*mm])
        t.setStyle(TableStyle([
            ("FONT", (0,0), (-1,-1), font_name, 9),
            ("FONT", (0,0), (-1,0), bold_name, 9),
            ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#e9ecef")),
            ("GRID", (0,0), (-1,-1), 0.25, colors.HexColor("#ced4da")),
        ]))
        story.append(t)

    # Conditions
    if conds:
        story.append(Paragraph("Медицинские состояния (ICD-11)", h2))
        for c in conds:
            nm = c.name_ru or c.name_en or "?"
            story.append(Paragraph(f"• <b>{c.code}</b> — {nm}", body))

    # Mood
    if mood_rows:
        story.append(Paragraph("Настроение (последние 7 записей)", h2))
        mood_data = [["Дата", "Настроение", "Энергия", "Сон, ч"]]
        for m in mood_rows:
            mood_data.append([m.date, str(m.mood), str(m.energy or "—"), f"{m.sleep_hours:.1f}" if m.sleep_hours else "—"])
        t = Table(mood_data, colWidths=[35*mm, 40*mm, 40*mm, 40*mm])
        t.setStyle(TableStyle([
            ("FONT", (0,0), (-1,-1), font_name, 9),
            ("FONT", (0,0), (-1,0), bold_name, 9),
            ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#e9ecef")),
            ("GRID", (0,0), (-1,-1), 0.25, colors.HexColor("#ced4da")),
        ]))
        story.append(t)

    if fasting_rows:
        story.append(Paragraph(f"Интервальное голодание: {fast_completed} из {len(fasting_rows)} сессий завершены", h2))

    story.append(Spacer(1, 12))
    story.append(Paragraph("Документ сгенерирован Nutrition Diary. Не является медицинским заключением.", small))

    doc.build(story)
    buf.seek(0)
    filename = f"nutrition_{since}_{today}.pdf"
    return StreamingResponse(buf, media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="{filename}"'})
