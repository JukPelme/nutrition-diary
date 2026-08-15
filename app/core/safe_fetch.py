"""SSRF-safe HTTP fetch + HTML sanitation for recipe import (PR6).

Threats closed here:
* DNS-rebinding (TOCTOU): the hostname is resolved ONCE, every address it maps
  to is validated as publicly-routable, and the real TCP connection is pinned
  to that validated IP (Host header + TLS SNI preserved). httpx can no longer
  re-resolve to an internal address between the check and the connect.
* r.jina.ai fallback: the proxy host goes through the exact same pin, so it is
  not a hole around the IP allow-list.
* Prompt-injection: callers get sanitized plain text (script/style/tags
  stripped), never raw HTML, and the model's answer is validated by Pydantic.
"""
from __future__ import annotations

import html as _html
import ipaddress
import re
import socket
from urllib.parse import urlparse, urlunparse

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, Field

_UA = "Mozilla/5.0 NutritionDiary/1.0"
_MAX_HTML = 50000


def _assert_public_ip(ip_str: str) -> None:
    ip = ipaddress.ip_address(ip_str)
    if (ip.is_private or ip.is_loopback or ip.is_link_local
            or ip.is_reserved or ip.is_multicast or ip.is_unspecified):
        raise HTTPException(400, "URL resolves to a non-public address")


def _resolve_pinned(url: str):
    """Resolve host once, validate ALL addresses, return (ip, host, port, scheme)."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(400, "Only http/https URLs are allowed")
    host = parsed.hostname
    if not host:
        raise HTTPException(400, "Invalid URL")
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror:
        raise HTTPException(400, "Cannot resolve host")
    if not infos:
        raise HTTPException(400, "Cannot resolve host")
    for info in infos:
        _assert_public_ip(info[4][0])
    return infos[0][4][0], host, port, parsed.scheme


def assert_public_url(url: str) -> None:
    """Fail-fast validation (raises 400 on internal/non-public). No connection."""
    _resolve_pinned(url)


async def _get_pinned(cli: httpx.AsyncClient, url: str) -> httpx.Response:
    """GET, but connect to a freshly-validated pinned IP — never re-resolve."""
    pinned, host, port, scheme = _resolve_pinned(url)
    parsed = urlparse(url)
    ip_host = f"[{pinned}]" if ":" in pinned else pinned
    ip_url = urlunparse(parsed._replace(netloc=f"{ip_host}:{port}"))
    host_hdr = host if port in (80, 443) else f"{host}:{port}"
    ext = {"sni_hostname": host} if scheme == "https" else None
    return await cli.get(ip_url, headers={"Host": host_hdr}, extensions=ext)


async def fetch_recipe_html(url: str) -> str:
    """Fetch a public recipe page safely; return SANITIZED plain text."""
    async with httpx.AsyncClient(timeout=15, follow_redirects=False,
                                 headers={"User-Agent": _UA}) as cli:
        try:
            r = await _get_pinned(cli, url)
        except httpx.HTTPError as e:
            raise HTTPException(400, f"Fetch failed: {e}")
        if r.status_code < 300:
            return sanitize_html(r.text)
        # fallback: r.jina.ai reader — its own host is pinned+validated too
        try:
            rj = await _get_pinned(cli, "https://r.jina.ai/" + url)
        except httpx.HTTPError as e:
            raise HTTPException(400, f"Fetch failed: {e}")
        if rj.status_code >= 400:
            raise HTTPException(400, f"Cannot fetch URL ({r.status_code})")
        return sanitize_html(rj.text)


_SCRIPT_STYLE = re.compile(r"<(script|style|noscript)[^>]*>.*?</\1>", re.I | re.S)
_TAG = re.compile(r"<[^>]+>")
_WS = re.compile(r"[ \t\r\f\v]+")
_MULTINL = re.compile(r"\n\s*\n\s*")


def sanitize_html(raw: str, limit: int = _MAX_HTML) -> str:
    """Strip scripts/tags and unescape entities -> untrusted plain text."""
    txt = _SCRIPT_STYLE.sub(" ", raw)
    txt = _TAG.sub(" ", txt)
    txt = _html.unescape(txt)
    txt = _WS.sub(" ", txt)
    txt = _MULTINL.sub("\n", txt)
    return txt.strip()[:limit]


class ExtractedIngredient(BaseModel):
    name: str = Field(min_length=1, max_length=500)
    amount_g: float = Field(gt=0)


class ExtractedRecipe(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    servings: int = Field(default=1, ge=1, le=100)
    total_weight_g: float = Field(gt=0)
    ingredients: list[ExtractedIngredient] = Field(min_length=1, max_length=50)
