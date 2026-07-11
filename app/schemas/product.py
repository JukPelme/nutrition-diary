import html
from uuid import UUID
from pydantic import BaseModel, field_validator


def _strip_html(v: str | None):
    """Neutralise stored-XSS and fix mojibake: product name/brand/category are
    shown to other users, so decode HTML entities (&quot;, &amp;, &#39; — common
    in crowdsourced OFF data) and drop tag delimiters (e.g. '<img onerror=...>').
    Decoding first also prevents entities from breaking inline onclick JSON on
    the client when the browser re-decodes them in the attribute value."""
    if not isinstance(v, str):
        return v
    v = html.unescape(v)
    v = v.replace("<", "").replace(">", "")
    return " ".join(v.split()).strip()


class ProductCreate(BaseModel):
    name: str
    brand: str | None = None
    barcode: str | None = None
    category: str | None = None
    serving_size: float = 100.0
    serving_unit: str = "g"
    calories: float | None = None
    protein: float | None = None
    fat: float | None = None
    carbohydrates: float | None = None
    fiber: float | None = None
    sugar: float | None = None
    vitamins: dict | None = None
    minerals: dict | None = None
    description: str | None = None
    image_url: str | None = None

    @field_validator("name", "brand", "category")
    @classmethod
    def _san(cls, v):
        return _strip_html(v)


class ProductUpdate(BaseModel):
    name: str | None = None
    brand: str | None = None
    barcode: str | None = None
    category: str | None = None
    serving_size: float | None = None
    calories: float | None = None
    protein: float | None = None
    fat: float | None = None
    carbohydrates: float | None = None
    fiber: float | None = None
    sugar: float | None = None
    vitamins: dict | None = None
    minerals: dict | None = None

    @field_validator("name", "brand", "category")
    @classmethod
    def _san(cls, v):
        return _strip_html(v)


class ProductResponse(BaseModel):
    id: UUID
    name: str
    brand: str | None
    barcode: str | None
    category: str | None
    source: str
    serving_size: float
    serving_unit: str
    calories: float | None
    protein: float | None
    fat: float | None
    carbohydrates: float | None
    fiber: float | None
    sugar: float | None
    vitamins: dict | None
    minerals: dict | None
    image_url: str | None
    is_verified: bool

    model_config = {"from_attributes": True}
