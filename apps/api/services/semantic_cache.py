"""
semantic_cache.py — Semantic cache for FAQ-like AI responses using Gemini embeddings + pgvector.

Caches AI responses for repetitive questions (e.g., "Onde fica?", "Qual o preço?").
When a new lead asks a similar question (cosine similarity > 0.92), returns the
cached response without calling the LLM — saving tokens and latency.

Architecture:
    Embedding model:  gemini-embedding-2-preview (3072 dims)
    Storage:          Supabase pgvector (table: semantic_cache)
    Invalidation:     Hash of MARIA_SYSTEM.md — cache purged when prompt changes
    TTL:              7 days (enforced in SQL query)

Usage:
    from services.semantic_cache import semantic_cache

    # In generate_response, BEFORE calling the model:
    cached = await semantic_cache.lookup(question, step, channel)
    if cached:
        return cached

    # AFTER successful response (no tool calls):
    asyncio.create_task(semantic_cache.store(question, answer, step, channel))
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# ── Prompt hash: invalidate cache when system prompt changes ─────────
_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"
_MARIA_PROMPT_PATH = _PROMPTS_DIR / "MARIA_SYSTEM.md"


def _compute_prompt_hash() -> str:
    """SHA-256 of MARIA_SYSTEM.md content — changes when prompt is edited."""
    try:
        content = _MARIA_PROMPT_PATH.read_text(encoding="utf-8")
        return hashlib.sha256(content.encode()).hexdigest()[:16]
    except Exception as e:
        logger.warning(f"[SemanticCache] Cannot hash MARIA_SYSTEM.md: {e}, using fallback")
        return "unknown"


class SemanticCache:
    """Semantic cache backed by Gemini embeddings + Supabase pgvector."""

    SIMILARITY_THRESHOLD = 0.92
    TTL_DAYS = 7
    EMBEDDING_MODEL = "gemini-embedding-2-preview"
    EMBEDDING_DIMS = 768  # Truncated via MRL — IVFFlat max is 2000

    def __init__(self):
        self._genai_client = None
        self._prompt_hash: str = ""
        self._initialized = False

    def _ensure_init(self):
        """Lazy init — called on first lookup/store to avoid import-time side effects."""
        if self._initialized:
            return

        api_key = os.environ.get("GEMINI_API_KEY", "").strip()
        if not api_key:
            logger.warning("[SemanticCache] GEMINI_API_KEY not set — cache disabled")
            self._initialized = True
            return

        try:
            from google import genai
            self._genai_client = genai.Client(api_key=api_key)
            self._prompt_hash = _compute_prompt_hash()
            self._initialized = True
            logger.info(f"[SemanticCache] Initialized (prompt_hash={self._prompt_hash}, model={self.EMBEDDING_MODEL})")
        except Exception as e:
            logger.error(f"[SemanticCache] Init error: {e}")
            self._initialized = True

    async def _embed(self, text: str) -> Optional[list[float]]:
        """Generate embedding for text using Gemini."""
        if not self._genai_client:
            return None

        try:
            from google.genai import types

            result = await asyncio.to_thread(
                self._genai_client.models.embed_content,
                model=self.EMBEDDING_MODEL,
                contents=text,
                config=types.EmbedContentConfig(
                    output_dimensionality=self.EMBEDDING_DIMS,
                ),
            )
            if result and result.embeddings:
                return result.embeddings[0].values
            return None
        except Exception as e:
            logger.error(f"[SemanticCache] Embedding error: {e}")
            return None

    async def lookup(
        self,
        question: str,
        qualification_step: str,
        channel: str,
    ) -> Optional[str]:
        """Look up a cached response for a similar question.

        Returns the cached answer string if found (similarity > threshold),
        or None if no match.
        """
        self._ensure_init()
        if not self._genai_client:
            return None

        try:
            embedding = await self._embed(question)
            if not embedding:
                return None

            from services.supabase_client import create_client
            supabase = create_client()

            result = await asyncio.to_thread(
                supabase.rpc(
                    "match_semantic_cache",
                    {
                        "query_embedding": embedding,
                        "match_threshold": self.SIMILARITY_THRESHOLD,
                        "match_step": qualification_step,
                        "match_channel": channel,
                        "match_prompt_hash": self._prompt_hash,
                        "max_ttl_days": self.TTL_DAYS,
                    },
                ).execute
            )

            if result.data and len(result.data) > 0:
                hit = result.data[0]
                cache_id = hit["id"]
                answer = hit["answer"]
                similarity = hit.get("similarity", 0)

                logger.info(
                    f"[SemanticCache] HIT (similarity={similarity:.4f}, "
                    f"step={qualification_step}, channel={channel}): "
                    f"Q={question[:60]}..."
                )

                # Fire-and-forget: increment hit count
                asyncio.create_task(self._increment_hit(cache_id))

                # Fire-and-forget: record metric
                from services.observability import metrics
                asyncio.create_task(metrics.record_cache_event("hit"))

                return answer

            # Cache miss
            from services.observability import metrics
            asyncio.create_task(metrics.record_cache_event("miss"))
            return None

        except Exception as e:
            logger.error(f"[SemanticCache] Lookup error (non-fatal): {e}")
            return None

    async def store(
        self,
        question: str,
        answer: str,
        qualification_step: str,
        channel: str,
    ) -> None:
        """Store a question-answer pair in the semantic cache.

        Called fire-and-forget after a successful AI response (no tool calls).
        """
        self._ensure_init()
        if not self._genai_client:
            return

        try:
            embedding = await self._embed(question)
            if not embedding:
                return

            from services.supabase_client import create_client
            supabase = create_client()

            await asyncio.to_thread(
                supabase.table("semantic_cache")
                .insert({
                    "question": question[:500],
                    "answer": answer[:2000],
                    "embedding": embedding,
                    "qualification_step": qualification_step,
                    "channel": channel,
                    "prompt_hash": self._prompt_hash,
                })
                .execute
            )

            logger.info(
                f"[SemanticCache] STORED (step={qualification_step}, "
                f"channel={channel}): Q={question[:60]}..."
            )
        except Exception as e:
            logger.error(f"[SemanticCache] Store error (non-fatal): {e}")

    async def purge_stale(self) -> int:
        """Delete cache entries with outdated prompt hash. Returns count deleted."""
        self._ensure_init()
        try:
            from services.supabase_client import create_client
            supabase = create_client()

            result = await asyncio.to_thread(
                supabase.table("semantic_cache")
                .delete()
                .neq("prompt_hash", self._prompt_hash)
                .execute
            )
            count = len(result.data) if result.data else 0
            if count > 0:
                logger.info(f"[SemanticCache] Purged {count} stale entries (old prompt hash)")
            return count
        except Exception as e:
            logger.error(f"[SemanticCache] Purge error: {e}")
            return 0

    async def _increment_hit(self, cache_id: str) -> None:
        """Increment hit_count for a cache entry."""
        try:
            from services.supabase_client import create_client
            supabase = create_client()
            await asyncio.to_thread(
                supabase.rpc("increment_cache_hit", {"cache_id": cache_id}).execute
            )
        except Exception:
            pass  # Non-critical — just a counter


# Module-level singleton
semantic_cache = SemanticCache()
