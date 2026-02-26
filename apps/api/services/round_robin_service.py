"""
RoundRobinService — Distribuicao sequencial de leads entre vendedores.

Usa a stored procedure assign_next_seller() do PostgreSQL que mantem um lock
FOR UPDATE na tabela round_robin_state, garantindo atomicidade mesmo com
chamadas simultaneas de Maria (WhatsApp) e Sofia (Instagram).

Quando nenhum vendedor esta ativo, faz fallback para GERENTE_PHONE.
"""

import os
from dataclasses import dataclass
from typing import Optional

from services.supabase_client import create_client

FALLBACK_PHONE = os.environ.get("GERENTE_PHONE", "5527998724593")


@dataclass
class SellerInfo:
    id: str
    full_name: str
    whatsapp_number: str
    seller_order: Optional[int] = None
    is_fallback: bool = False


@dataclass
class AssignmentResult:
    success: bool
    seller: Optional[SellerInfo]
    is_fallback: bool
    reason: Optional[str] = None


class RoundRobinService:
    """Gerencia a roleta de atribuicao de leads para vendedores."""

    def __init__(self):
        self._fallback_seller = SellerInfo(
            id="",
            full_name="Gerente Comercial",
            whatsapp_number=FALLBACK_PHONE,
            is_fallback=True,
        )

    def assign_next_seller(
        self,
        lead_id: str,
        transfer_reason: Optional[str] = None,
        channel: str = "whatsapp",
    ) -> AssignmentResult:
        """
        Atribui atomicamente o proximo vendedor da roleta ao lead.

        Chama a stored procedure assign_next_seller() via PostgREST RPC.
        Se nenhum vendedor ativo existir, retorna fallback para GERENTE_PHONE.
        """
        supabase = create_client()
        try:
            result = supabase.rpc("assign_next_seller", {
                "p_lead_id": lead_id,
                "p_transfer_reason": transfer_reason,
                "p_channel": channel,
            }).execute()

            if not result.data:
                print("[RoundRobin] RPC retornou vazio — usando fallback")
                return self._fallback_result(lead_id, transfer_reason, channel)

            data = result.data
            if isinstance(data, list):
                data = data[0] if data else {}

            if not data.get("success"):
                reason = data.get("reason", "unknown")
                print(f"[RoundRobin] Sem vendedores ativos ({reason}) — usando fallback")
                self._log_fallback_assignment(lead_id, transfer_reason, channel)
                return AssignmentResult(
                    success=True,
                    seller=self._fallback_seller,
                    is_fallback=True,
                    reason=reason,
                )

            seller_data = data["seller"]
            seller = SellerInfo(
                id=seller_data["id"],
                full_name=seller_data["full_name"],
                whatsapp_number=seller_data["whatsapp_number"],
                seller_order=seller_data.get("seller_order"),
                is_fallback=False,
            )
            print(f"[RoundRobin] Lead {lead_id} atribuido a {seller.full_name} ({seller.whatsapp_number})")
            return AssignmentResult(success=True, seller=seller, is_fallback=False)

        except Exception as e:
            print(f"[RoundRobin] Erro ao chamar assign_next_seller: {e}")
            import traceback
            traceback.print_exc()
            return self._fallback_result(lead_id, transfer_reason, channel)

    # ------------------------------------------------------------------
    # Queries de leitura (para endpoints da API)
    # ------------------------------------------------------------------

    def get_active_sellers(self) -> list:
        """Retorna vendedores ativos ordenados por seller_order."""
        supabase = create_client()
        result = (
            supabase.table("users")
            .select("id, full_name, email, whatsapp_number, seller_active, seller_order, last_assigned_at")
            .eq("is_seller", "true")
            .eq("seller_active", "true")
            .order("seller_order", direction="asc")
            .execute()
        )
        return result.data or []

    def get_all_sellers(self) -> list:
        """Retorna todos os vendedores (ativos e inativos)."""
        supabase = create_client()
        result = (
            supabase.table("users")
            .select("id, full_name, email, whatsapp_number, is_seller, seller_active, seller_order, last_assigned_at")
            .eq("is_seller", "true")
            .order("seller_order", direction="asc")
            .execute()
        )
        return result.data or []

    def get_rotation_state(self) -> dict:
        """Retorna o estado atual da roleta."""
        supabase = create_client()
        result = (
            supabase.table("round_robin_state")
            .select("current_seller_id, total_assignments, updated_at")
            .eq("id", "1")
            .execute()
        )
        if not result.data:
            return {"current_seller_id": None, "total_assignments": 0, "updated_at": None}
        return result.data[0]

    def get_assignment_history(self, limit: int = 50) -> list:
        """Retorna historico recente de atribuicoes."""
        supabase = create_client()
        result = (
            supabase.table("lead_assignments")
            .select("id, lead_id, seller_name, seller_phone, source, transfer_reason, assigned_at, channel")
            .order("assigned_at", direction="desc")
            .limit(limit)
            .execute()
        )
        return result.data or []

    # ------------------------------------------------------------------
    # Helpers internos
    # ------------------------------------------------------------------

    def _fallback_result(self, lead_id: str, transfer_reason: Optional[str], channel: str) -> AssignmentResult:
        """Registra fallback no log e retorna o seller fallback."""
        self._log_fallback_assignment(lead_id, transfer_reason, channel)
        return AssignmentResult(
            success=True,
            seller=self._fallback_seller,
            is_fallback=True,
            reason="service_error",
        )

    def _log_fallback_assignment(self, lead_id: str, transfer_reason: Optional[str], channel: str):
        """Registra uma atribuicao fallback no log de auditoria."""
        try:
            supabase = create_client()
            supabase.table("lead_assignments").insert({
                "lead_id": lead_id,
                "seller_id": None,
                "seller_phone": FALLBACK_PHONE,
                "seller_name": "Gerente Comercial (fallback)",
                "source": "fallback",
                "transfer_reason": transfer_reason,
                "channel": channel,
            }).execute()
        except Exception as e:
            print(f"[RoundRobin] Falha ao registrar fallback no log: {e}")
