"""
Pure computation functions for analytics.

These functions take pandas DataFrames as input and return computed results.
They are separated from the AnalyticsService to enable property-based testing
without database mocking.
"""

import json
import pandas as pd
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional


# Canonical funnel stages in order
FUNNEL_STAGES = [
    "novo_lead",
    "transferido",
    "visita_agendada",
    "visita_realizada",
    "proposta_enviada",
    "venda_realizada",
]

# Map alternative status names to canonical stages
STATUS_TO_STAGE = {
    "new": "novo_lead",
    "novo": "novo_lead",
    "novo_lead": "novo_lead",
    "transferred": "transferido",
    "transferido": "transferido",
    "qualified": "transferido",
    "qualificado": "transferido",
    "visit_scheduled": "visita_agendada",
    "visita_agendada": "visita_agendada",
    "visit_done": "visita_realizada",
    "visita_realizada": "visita_realizada",
    "proposal_sent": "proposta_enviada",
    "proposta_enviada": "proposta_enviada",
    "sold": "venda_realizada",
    "venda_realizada": "venda_realizada",
}

# Default stage for unknown statuses
DEFAULT_STAGE = "novo_lead"


def compute_em_atendimento(
    df_leads: pd.DataFrame,
    df_conversations: pd.DataFrame,
) -> int:
    """
    Compute the number of leads currently being attended ("Em Atendimento").

    This equals the number of distinct lead_ids that appear in the
    conversations table, capped at total_leads so it never exceeds
    the total number of leads.

    Returns a non-negative integer.
    """
    total_leads = len(df_leads)

    if df_conversations.empty or "lead_id" not in df_conversations.columns:
        return 0

    distinct_lead_ids = df_conversations["lead_id"].dropna().nunique()
    # Ensure em_atendimento never exceeds total_leads
    return min(distinct_lead_ids, total_leads)


def compute_funnel_data(df_leads: pd.DataFrame) -> List[Dict[str, Any]]:
    """
    Compute conversion funnel stage counts from leads DataFrame.

    Each lead is mapped to exactly one funnel stage. Unknown statuses
    are mapped to 'novo_lead'.

    Returns a list of {stage, count} dicts in funnel order.
    """
    if df_leads.empty or "status" not in df_leads.columns:
        return [{"stage": s, "count": 0} for s in FUNNEL_STAGES]

    mapped = df_leads["status"].fillna("novo_lead").map(
        lambda s: STATUS_TO_STAGE.get(str(s).strip().lower(), DEFAULT_STAGE)
    )
    counts = mapped.value_counts()

    return [
        {"stage": stage, "count": int(counts.get(stage, 0))}
        for stage in FUNNEL_STAGES
    ]


def compute_temperature_distribution(df_leads: pd.DataFrame) -> Dict[str, int]:
    """
    Group leads by temperature field (hot, warm, cold, null).

    Returns a dict mapping temperature label to count.
    The sum of all counts equals the total number of leads.
    """
    if df_leads.empty or "temperature" not in df_leads.columns:
        return {"hot": 0, "warm": 0, "cold": 0, "null": 0}

    temps = df_leads["temperature"].fillna("null").astype(str).str.strip().str.lower()
    # Normalize known values, everything else goes to its own bucket
    counts = temps.value_counts().to_dict()

    result: Dict[str, int] = {}
    for key, val in counts.items():
        normalized = key if key in ("hot", "warm", "cold", "null") else key
        result[normalized] = result.get(normalized, 0) + int(val)

    # Ensure canonical keys exist
    for k in ("hot", "warm", "cold", "null"):
        result.setdefault(k, 0)

    return result


def compute_source_analysis(
    df_leads: pd.DataFrame,
    converted_statuses: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Group leads by source and compute per-source conversion rates.

    Conversion rate = (converted leads / total leads for source) * 100.
    Returns a list of {source, count, conversion_rate} dicts.
    """
    if converted_statuses is None:
        converted_statuses = [
            "transferido", "transferred",
            "qualificado", "qualified",
            "visita_agendada", "visit_scheduled",
            "visita_realizada", "visit_done",
            "proposta_enviada", "proposal_sent",
            "venda_realizada", "sold",
        ]

    if df_leads.empty or "source" not in df_leads.columns:
        return []

    df = df_leads.copy()
    df["source"] = df["source"].fillna("whatsapp").astype(str).str.strip()
    df["status_lower"] = df["status"].fillna("").astype(str).str.strip().str.lower()

    result = []
    for source, group in df.groupby("source"):
        total = len(group)
        converted = len(group[group["status_lower"].isin(converted_statuses)])
        rate = (converted / total * 100) if total > 0 else 0.0
        result.append({
            "source": str(source),
            "count": int(total),
            "conversion_rate": round(rate, 2),
        })

    return result


def compute_response_times(
    df_messages: pd.DataFrame,
    session_gap_seconds: float = 30000,
) -> Dict[str, Any]:
    """
    Compute AI and lead response times from a messages DataFrame.

    For each conversation, pairs consecutive messages:
    - lead → ai  = AI response time (seconds)
    - ai → lead  = Lead response time (minutes)

    Gaps larger than *session_gap_seconds* are ignored (session breaks).

    Returns a dict with:
    - ai_avg_seconds: mean AI response time in seconds (0 if no pairs)
    - lead_avg_minutes: mean lead response time in minutes (0 if no pairs)
    - history: list of {date, ai_avg, lead_avg} per day with at least one pair.
               Guaranteed to contain at least one entry when valid pairs exist.
    """
    empty_result: Dict[str, Any] = {
        "ai_avg_seconds": 0.0,
        "lead_avg_minutes": 0.0,
        "history": [],
    }

    required_cols = {"sender_type", "created_at", "conversation_id"}
    if df_messages.empty or not required_cols.issubset(df_messages.columns):
        return empty_result

    df = df_messages.copy()
    df["created_at"] = pd.to_datetime(df["created_at"], format="ISO8601", utc=True)
    df = df.sort_values(["conversation_id", "created_at"])

    ai_deltas = []
    lead_deltas = []
    ai_daily: Dict[str, list] = {}
    lead_daily: Dict[str, list] = {}

    for _, group in df.groupby("conversation_id"):
        group = group.reset_index(drop=True)
        for i in range(len(group) - 1):
            current = group.iloc[i]
            next_msg = group.iloc[i + 1]

            delta_seconds = (next_msg["created_at"] - current["created_at"]).total_seconds()
            if delta_seconds > session_gap_seconds:
                continue  # session break

            date_str = current["created_at"].strftime("%Y-%m-%d")

            if current["sender_type"] == "lead" and next_msg["sender_type"] == "ai":
                ai_deltas.append(delta_seconds)
                ai_daily.setdefault(date_str, []).append(delta_seconds)

            elif current["sender_type"] == "ai" and next_msg["sender_type"] == "lead":
                lead_minutes = delta_seconds / 60.0
                lead_deltas.append(lead_minutes)
                lead_daily.setdefault(date_str, []).append(lead_minutes)

    avg_ai = (sum(ai_deltas) / len(ai_deltas)) if ai_deltas else 0.0
    avg_lead = (sum(lead_deltas) / len(lead_deltas)) if lead_deltas else 0.0

    # Build daily history
    all_dates = sorted(set(list(ai_daily.keys()) + list(lead_daily.keys())))
    history = []
    for d in all_dates:
        ai_vals = ai_daily.get(d, [])
        lead_vals = lead_daily.get(d, [])
        history.append({
            "date": d,
            "ai_avg": round(sum(ai_vals) / len(ai_vals), 1) if ai_vals else 0.0,
            "lead_avg": round(sum(lead_vals) / len(lead_vals), 1) if lead_vals else 0.0,
        })

    # Guarantee at least one data point when we have valid pairs
    if not history and (ai_deltas or lead_deltas):
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        history.append({
            "date": today,
            "ai_avg": round(avg_ai, 1),
            "lead_avg": round(avg_lead, 1),
        })

    return {
        "ai_avg_seconds": round(avg_ai, 1),
        "lead_avg_minutes": round(avg_lead, 1),
        "history": history,
    }


def compute_time_metrics(
    df_leads: pd.DataFrame,
    df_messages: pd.DataFrame,
) -> Dict[str, float]:
    """
    Compute time-based metrics:
    - avg_first_response_seconds: average seconds from lead creation to first AI message
    - lead_velocity: average leads per day over the last 30 days

    All returned values are non-negative.
    """
    avg_first_response = 0.0
    lead_velocity = 0.0

    # --- Average first response time ---
    if (
        not df_leads.empty
        and not df_messages.empty
        and "created_at" in df_leads.columns
        and "created_at" in df_messages.columns
        and "sender_type" in df_messages.columns
        and "conversation_id" in df_messages.columns
    ):
        try:
            leads = df_leads.copy()
            msgs = df_messages.copy()

            leads["created_at"] = pd.to_datetime(leads["created_at"], utc=True)
            msgs["created_at"] = pd.to_datetime(msgs["created_at"], utc=True)

            # Get first AI message per conversation
            ai_msgs = msgs[msgs["sender_type"] == "ai"].copy()
            if not ai_msgs.empty:
                first_ai = ai_msgs.sort_values("created_at").groupby("conversation_id").first().reset_index()

                # We need to join conversations to leads. If conversation has lead_id, use it.
                # Otherwise we skip this metric.
                if "lead_id" in first_ai.columns:
                    merged = first_ai.merge(
                        leads[["id", "created_at"]],
                        left_on="lead_id",
                        right_on="id",
                        suffixes=("_msg", "_lead"),
                    )
                    if not merged.empty:
                        deltas = (merged["created_at_msg"] - merged["created_at_lead"]).dt.total_seconds()
                        positive_deltas = deltas[deltas >= 0]
                        if len(positive_deltas) > 0:
                            avg_first_response = float(positive_deltas.mean())
        except Exception:
            avg_first_response = 0.0

    # --- Lead velocity (leads per day, last 30 days) ---
    if not df_leads.empty and "created_at" in df_leads.columns:
        try:
            leads = df_leads.copy()
            leads["created_at"] = pd.to_datetime(leads["created_at"], utc=True)
            cutoff = datetime.now(timezone.utc) - timedelta(days=30)
            recent = leads[leads["created_at"] >= cutoff]
            if len(recent) > 0:
                date_range = (recent["created_at"].max() - recent["created_at"].min()).days
                days = max(date_range, 1)
                lead_velocity = float(len(recent) / days)
        except Exception:
            lead_velocity = 0.0

    return {
        "avg_first_response_seconds": max(0.0, round(avg_first_response, 2)),
        "lead_velocity": max(0.0, round(lead_velocity, 2)),
    }


def compute_sentiment_trend(
    df_leads: pd.DataFrame,
) -> List[Dict[str, Any]]:
    """
    Compute daily sentiment trend from leads DataFrame.

    Groups leads by date and sentiment_label, producing daily counts
    of positive, neutral, and negative leads.

    The sentiment_label column is normalized to lowercase before grouping
    so that "Positivo", "positivo", "POSITIVO" are all treated the same.

    For each date, the sum of positive + neutral + negative equals the
    total number of leads on that date.

    Returns a list of {date, positive, neutral, negative} dicts sorted by date.
    """
    if df_leads.empty:
        return []

    if "sentiment_label" not in df_leads.columns or "date_str" not in df_leads.columns:
        return []

    df = df_leads.copy()
    df["sentiment_label"] = df["sentiment_label"].fillna("neutro").str.lower()

    sentiment_by_date = df.groupby(["date_str", "sentiment_label"]).size().unstack(fill_value=0)

    result = []
    for date_str in sorted(sentiment_by_date.index):
        row = sentiment_by_date.loc[date_str]
        result.append({
            "date": date_str,
            "positive": int(row.get("positivo", 0)),
            "neutral": int(row.get("neutro", 0)),
            "negative": int(row.get("negativo", 0)),
        })

    return result
