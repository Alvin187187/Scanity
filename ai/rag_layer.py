"""Scanity RAG layer: local knowledge retrieval + optional RAGFlow HTTP API.

RAGFlow (https://github.com/infiniflow/ragflow) is a full Docker stack.
This module does not embed that stack. It:
  1. Retrieves local allergen / ingredient knowledge for grounding.
  2. Optionally queries a hosted RAGFlow OpenAPI endpoint when configured.
  3. Passes retrieved snippets into Gemini prompts.

Allergy Safe / Caution / Avoid still comes from the rule engine only.
"""

from __future__ import annotations

import logging
import os
import re
from functools import lru_cache
from typing import Any

import requests

logger = logging.getLogger(__name__)


def _normalize(text: str) -> str:
    value = (text or "").strip().lower()
    value = value.replace("–", "-").replace("—", "-")
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


@lru_cache(maxsize=1)
def _local_corpus() -> list[dict[str, str]]:
    docs: list[dict[str, str]] = []
    try:
        from seed.allergen_seed_loader import load_allergen_seed

        for row in load_allergen_seed():
            name = str(row.get("ingredient_name") or "").strip()
            if not name:
                continue
            aliases = " ".join(row.get("aliases") or [])
            explanation = str(row.get("plain_explanation") or "").strip()
            category = str(row.get("allergen_category") or "").strip()
            docs.append(
                {
                    "id": f"allergen:{name}",
                    "title": name,
                    "category": category,
                    "text": f"{name}. Allergen category: {category}. {explanation} Aliases: {aliases}".strip(),
                    "source": "Scanity allergen knowledge",
                }
            )
    except Exception as exc:
        logger.warning("RAG local allergen corpus failed: %s", type(exc).__name__)

    try:
        from seed.ingredient_knowledge_loader import load_ingredient_knowledge

        for row in load_ingredient_knowledge():
            name = str(row.get("ingredient_name") or "").strip()
            if not name:
                continue
            docs.append(
                {
                    "id": f"knowledge:{name}",
                    "title": name,
                    "category": str(row.get("category") or ""),
                    "text": (
                        f"{name}. {row.get('what_it_is') or ''} "
                        f"Seen in: {row.get('commonly_seen_in') or ''}. "
                        f"Watch-outs: {row.get('possible_effects') or ''}"
                    ).strip(),
                    "source": str(row.get("source") or "Scanity ingredient knowledge"),
                }
            )
    except Exception as exc:
        logger.warning("RAG local ingredient corpus failed: %s", type(exc).__name__)
    return docs


def retrieve_local(query: str, *, limit: int = 6) -> list[dict[str, str]]:
    """Simple keyword retrieval over local allergen + ingredient knowledge."""
    q = _normalize(query)
    if not q:
        return []
    tokens = [t for t in q.split() if len(t) >= 3]
    scored: list[tuple[int, dict[str, str]]] = []
    for doc in _local_corpus():
        hay = _normalize(f"{doc.get('title','')} {doc.get('text','')}")
        score = 0
        if q and q in hay:
            score += 12
        title = _normalize(doc.get("title") or "")
        if title and (title in q or q in title):
            score += 10
        for token in tokens:
            if token in hay:
                score += 2
        if score:
            scored.append((score, doc))
    scored.sort(key=lambda item: (-item[0], item[1].get("title") or ""))
    return [doc for _, doc in scored[:limit]]


def _ragflow_settings() -> tuple[str, str, str]:
    base = (os.environ.get("RAGFLOW_API_URL") or "").strip().rstrip("/")
    key = (os.environ.get("RAGFLOW_API_KEY") or "").strip()
    chat_id = (os.environ.get("RAGFLOW_CHAT_ID") or "").strip()
    if not base or not key:
        try:
            from app.core.config import settings

            base = base or (getattr(settings, "RAGFLOW_API_URL", None) or "")
            key = key or (getattr(settings, "RAGFLOW_API_KEY", None) or "")
            chat_id = chat_id or (getattr(settings, "RAGFLOW_CHAT_ID", None) or "")
            base = str(base).strip().rstrip("/")
            key = str(key).strip()
            chat_id = str(chat_id).strip()
        except Exception:
            pass
    if key.startswith("YOUR_") or base.startswith("YOUR_"):
        return "", "", ""
    return base, key, chat_id


def retrieve_ragflow(query: str, *, limit: int = 4) -> list[dict[str, str]]:
    """Optional RAGFlow retrieval via OpenAPI when RAGFLOW_* env vars are set."""
    base, key, chat_id = _ragflow_settings()
    if not base or not key:
        return []
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    # Prefer retrieval endpoint; fall back to chat completion snippets.
    endpoints = []
    if chat_id:
        endpoints.append((f"{base}/api/v1/chats_openai/{chat_id}/chat/completions", {
            "model": chat_id,
            "messages": [{"role": "user", "content": query}],
            "stream": False,
        }))
    endpoints.append((f"{base}/api/v1/retrieval", {
        "question": query,
        "top_k": limit,
    }))

    for url, payload in endpoints:
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=12)
        except requests.RequestException as exc:
            logger.warning("RAGFlow network error: %s", type(exc).__name__)
            continue
        if response.status_code != 200:
            logger.warning("RAGFlow HTTP %s on %s", response.status_code, url)
            continue
        try:
            data = response.json()
        except ValueError:
            continue
        docs = _parse_ragflow_payload(data, limit=limit)
        if docs:
            return docs
    return []


def _parse_ragflow_payload(data: Any, *, limit: int) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    if not isinstance(data, dict):
        return out

    # Chat-completions style
    choices = data.get("choices")
    if isinstance(choices, list) and choices:
        message = (choices[0] or {}).get("message") or {}
        content = message.get("content")
        if isinstance(content, str) and content.strip():
            out.append(
                {
                    "id": "ragflow:chat",
                    "title": "RAGFlow context",
                    "category": "ragflow",
                    "text": content.strip()[:1200],
                    "source": "RAGFlow",
                }
            )

    # Retrieval chunks
    candidates = data.get("data") or data.get("chunks") or data.get("records") or []
    if isinstance(candidates, dict):
        candidates = candidates.get("chunks") or candidates.get("records") or []
    if isinstance(candidates, list):
        for idx, item in enumerate(candidates[:limit]):
            if not isinstance(item, dict):
                continue
            text = str(
                item.get("content")
                or item.get("text")
                or item.get("chunk")
                or item.get("answer")
                or ""
            ).strip()
            if not text:
                continue
            out.append(
                {
                    "id": f"ragflow:{idx}",
                    "title": str(item.get("document_keyword") or item.get("docnm_kwd") or "RAGFlow chunk"),
                    "category": "ragflow",
                    "text": text[:1200],
                    "source": "RAGFlow",
                }
            )
    return out[:limit]


def retrieve_context(query: str, *, limit: int = 6) -> list[dict[str, str]]:
    """Merge RAGFlow (if configured) with local knowledge retrieval."""
    remote = retrieve_ragflow(query, limit=max(2, limit // 2))
    local = retrieve_local(query, limit=limit)
    merged: list[dict[str, str]] = []
    seen: set[str] = set()
    for doc in remote + local:
        key = _normalize(f"{doc.get('title','')}|{doc.get('text','')[:80]}")
        if not key or key in seen:
            continue
        seen.add(key)
        merged.append(doc)
        if len(merged) >= limit:
            break
    return merged


def format_context_block(docs: list[dict[str, str]]) -> str:
    if not docs:
        return "No extra knowledge snippets retrieved."
    lines = ["Retrieved knowledge snippets (for grounding only; do not invent beyond these + the scan facts):"]
    for idx, doc in enumerate(docs, start=1):
        title = doc.get("title") or f"Snippet {idx}"
        source = doc.get("source") or "knowledge"
        text = (doc.get("text") or "").strip()
        lines.append(f"{idx}. {title} [{source}]: {text}")
    return "\n".join(lines)


def enrich_prompt_with_rag(prompt: str, query: str, *, limit: int = 6) -> str:
    docs = retrieve_context(query, limit=limit)
    block = format_context_block(docs)
    return f"{prompt}\n\n{block}\n"
