"""
Sellers router — gerencia perfis de vendedores e estado da roleta.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from services.supabase_client import create_client
from services.round_robin_service import RoundRobinService

router = APIRouter()


class SellerUpdate(BaseModel):
    whatsapp_number: Optional[str] = None
    seller_active: Optional[bool] = None
    seller_order: Optional[int] = None
    is_seller: Optional[bool] = None


class ManualAssignment(BaseModel):
    seller_id: str


# ---------------------------------------------------------------------------
# GET /api/sellers — listar todos os vendedores
# ---------------------------------------------------------------------------
@router.get("/sellers")
def list_sellers():
    """Retorna todos os usuarios marcados como vendedores."""
    rr = RoundRobinService()
    return rr.get_all_sellers()


# ---------------------------------------------------------------------------
# GET /api/sellers/active — listar vendedores ativos na roleta
# ---------------------------------------------------------------------------
@router.get("/sellers/active")
def list_active_sellers():
    """Retorna vendedores ativos na ordem de rotacao."""
    rr = RoundRobinService()
    return rr.get_active_sellers()


# ---------------------------------------------------------------------------
# GET /api/sellers/state — estado atual da roleta
# ---------------------------------------------------------------------------
@router.get("/sellers/state")
def get_rotation_state():
    """Retorna o ponteiro atual da roleta e total de atribuicoes."""
    rr = RoundRobinService()
    state = rr.get_rotation_state()

    # Enriquecer com dados do vendedor atual
    if state.get("current_seller_id"):
        sb = create_client()
        seller_res = (
            sb.table("users")
            .select("id, full_name, whatsapp_number, seller_order")
            .eq("id", state["current_seller_id"])
            .execute()
        )
        state["current_seller"] = seller_res.data[0] if seller_res.data else None
    else:
        state["current_seller"] = None

    return state


# ---------------------------------------------------------------------------
# GET /api/sellers/assignments — log de atribuicoes recentes
# ---------------------------------------------------------------------------
@router.get("/sellers/assignments")
def get_assignment_history(limit: int = 50):
    """Retorna historico recente de atribuicoes de leads."""
    rr = RoundRobinService()
    return rr.get_assignment_history(limit=min(limit, 200))


# ---------------------------------------------------------------------------
# PATCH /api/sellers/{user_id} — atualizar config de vendedor
# ---------------------------------------------------------------------------
@router.patch("/sellers/{user_id}")
def update_seller(user_id: str, body: SellerUpdate):
    """
    Atualiza campos de vendedor em um usuario.
    - is_seller: marcar/desmarcar como vendedor
    - seller_active: ativar/desativar na roleta
    - whatsapp_number: numero para notificacoes
    - seller_order: posicao na rotacao
    """
    sb = create_client()
    allowed_fields = {"whatsapp_number", "seller_active", "seller_order", "is_seller"}
    update_data = {k: v for k, v in body.dict(exclude_none=True).items() if k in allowed_fields}

    if not update_data:
        raise HTTPException(status_code=400, detail="Nenhum campo valido para atualizar")

    # Se desativando como vendedor, tambem desativar na roleta
    if update_data.get("is_seller") is False:
        update_data["seller_active"] = False

    result = sb.table("users").update(update_data).eq("id", user_id).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Usuario nao encontrado")

    return result.data[0]


# ---------------------------------------------------------------------------
# POST /api/sellers/{user_id}/activate — ativar vendedor na roleta
# ---------------------------------------------------------------------------
@router.post("/sellers/{user_id}/activate")
def activate_seller(user_id: str):
    """Ativa um vendedor na rotacao da roleta."""
    sb = create_client()
    result = sb.table("users").update({
        "is_seller": True,
        "seller_active": True,
    }).eq("id", user_id).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Usuario nao encontrado")

    return result.data[0]


# ---------------------------------------------------------------------------
# POST /api/sellers/{user_id}/deactivate — desativar vendedor
# ---------------------------------------------------------------------------
@router.post("/sellers/{user_id}/deactivate")
def deactivate_seller(user_id: str):
    """Remove um vendedor da rotacao ativa (mantem perfil de vendedor)."""
    sb = create_client()
    result = sb.table("users").update({
        "seller_active": False,
    }).eq("id", user_id).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Usuario nao encontrado")

    return result.data[0]


# ---------------------------------------------------------------------------
# PATCH /api/sellers/order — reordenar vendedores (bulk)
# ---------------------------------------------------------------------------
@router.patch("/sellers/order")
def update_sellers_order(body: list):
    """
    Atualiza a ordem de rotacao dos vendedores.
    Recebe lista de {id, seller_order}.
    """
    sb = create_client()
    results = []
    for item in body:
        user_id = item.get("id")
        order = item.get("seller_order")
        if user_id and order is not None:
            res = sb.table("users").update({"seller_order": order}).eq("id", user_id).execute()
            if res.data:
                results.append(res.data[0])

    return results


# ---------------------------------------------------------------------------
# POST /api/leads/{lead_id}/reassign — reatribuir lead manualmente
# ---------------------------------------------------------------------------
@router.post("/leads/{lead_id}/reassign")
def reassign_lead(lead_id: str, body: ManualAssignment):
    """
    Reatribui um lead manualmente para outro vendedor.
    Nao avanca o ponteiro da roleta.
    """
    sb = create_client()

    # Verificar que o vendedor existe e esta ativo
    seller_res = (
        sb.table("users")
        .select("id, full_name, whatsapp_number, is_seller, seller_active")
        .eq("id", body.seller_id)
        .execute()
    )

    if not seller_res.data:
        raise HTTPException(status_code=404, detail="Vendedor nao encontrado")

    seller = seller_res.data[0]

    # Atualizar assigned_to no lead
    lead_res = sb.table("leads").update({
        "assigned_to": body.seller_id,
    }).eq("id", lead_id).execute()

    if not lead_res.data:
        raise HTTPException(status_code=404, detail="Lead nao encontrado")

    # Registrar no log de auditoria
    sb.table("lead_assignments").insert({
        "lead_id": lead_id,
        "seller_id": body.seller_id,
        "seller_phone": seller.get("whatsapp_number"),
        "seller_name": seller.get("full_name"),
        "source": "manual",
        "transfer_reason": "Reatribuicao manual pelo admin",
    }).execute()

    # Enviar notificacao WhatsApp para o novo vendedor (se tiver numero)
    if seller.get("whatsapp_number"):
        try:
            from services.uazapi_service import UazapiService

            lead = lead_res.data[0]
            msg = (
                f"*Lead Reatribuido para Voce*\n\n"
                f"*Nome:* {lead.get('full_name', 'N/A')}\n"
                f"*Telefone:* {lead.get('phone', 'N/A')}\n"
            )
            u_service = UazapiService()
            u_service.send_whatsapp_message(seller["whatsapp_number"], msg)
        except Exception as e:
            print(f"[Sellers] Erro ao enviar notificacao de reatribuicao: {e}")

    return {
        "lead_id": lead_id,
        "assigned_to": body.seller_id,
        "seller_name": seller.get("full_name"),
    }
