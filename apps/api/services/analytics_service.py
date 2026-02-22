
import logging
import pandas as pd
from services.supabase_client import create_client
from services.analytics_computations import (
    compute_em_atendimento,
    compute_funnel_data,
    compute_temperature_distribution,
    compute_source_analysis,
    compute_time_metrics,
    compute_response_times,
    compute_sentiment_trend,
)

logger = logging.getLogger(__name__)

class AnalyticsService:
    def __init__(self):
        self.supabase = create_client()

    def get_dashboard_metrics(self):
        """
        Generates key metrics for the dashboard using Real Data from Supabase.
        """
        # 1. Fetch Data from Supabase
        try:
            # Fetch leads
            leads_res = self.supabase.table("leads").select("*").execute()
            leads_data = leads_res.data if leads_res.data else []
            
            logger.info(f"[get_dashboard_metrics] Fetched {len(leads_data)} leads from database")
            
            # Fetch appointments for history check (optional, or just use lead creation date)
            # For simpler history chart, we use lead creation date
            
            if not leads_data:
                 return {
                    "total_leads": 0,
                    "conversion_rate": 0,
                    "status_distribution": {},
                    "history": []
                }

            df_leads = pd.DataFrame(leads_data)
            
            # Ensure proper datetime format and convert to Brazil timezone
            if 'created_at' in df_leads.columns:
                df_leads['created_at'] = pd.to_datetime(df_leads['created_at'], format='ISO8601')
                # Verificar se já tem timezone, se não, assumir UTC
                if df_leads['created_at'].dt.tz is None:
                    df_leads['created_at_br'] = df_leads['created_at'].dt.tz_localize('UTC').dt.tz_convert('America/Sao_Paulo')
                else:
                    df_leads['created_at_br'] = df_leads['created_at'].dt.tz_convert('America/Sao_Paulo')
                df_leads['date_str'] = df_leads['created_at_br'].dt.strftime('%Y-%m-%d')
            else:
                 return {
                     "error": "Data integrity issue: missing created_at"
                 }

            # 2. Key High-Level Metrics
            total_leads = len(df_leads)
            
            # Calculate Conversion Rate (Leads que avançaram no funil)
            converted = df_leads[df_leads['status'].isin(['visita_agendada', 'visita_realizada', 'proposta_enviada', 'venda_realizada', 'visit_scheduled', 'sold', 'qualificado'])]
            conversion_rate = (len(converted) / total_leads * 100) if total_leads > 0 else 0
            
            # Contar leads em atendimento (distinct lead_ids from conversations)
            em_atendimento = 0
            try:
                convs_res = self.supabase.table("conversations").select("lead_id").execute()
                if convs_res.data:
                    df_convs_em = pd.DataFrame(convs_res.data)
                    em_atendimento = compute_em_atendimento(df_leads, df_convs_em)
            except:
                # Fallback: considerar leads que não são 'novo' como em atendimento
                em_atendimento = len(df_leads[~df_leads['status'].isin(['new', 'novo', 'novo_lead'])])

            # 3. Status Distribution (for Pie Chart)
            # Fill NaN status
            df_leads['status'] = df_leads['status'].fillna('novo')
            status_counts = df_leads['status'].value_counts().to_dict()
            
            logger.info(
                f"[get_dashboard_metrics] Key metrics - "
                f"total_leads={total_leads}, "
                f"conversion_rate={round(conversion_rate, 2)}%, "
                f"em_atendimento={em_atendimento}, "
                f"status_distribution={status_counts}"
            )

            # 4. History (Leads per Day - Last 30 days)
            daily_counts = df_leads.groupby('date_str').size().reset_index(name='leads')
            daily_counts = daily_counts.sort_values('date_str')
            history = daily_counts.to_dict('records')
            history_formatted = [{"date": r["date_str"], "leads": r["leads"]} for r in history]

            # 5. Appointment Heatmap (Day x Hour)
            # Filter for leads that reached 'visita_agendada' or 'visit_scheduled'
            # Note: We use created_at as proxy for 'engagement time' if specific appointment logs missing
            heatmap_data = []
            if total_leads > 0 and 'created_at_br' in df_leads.columns:
                scheduled_leads = df_leads[df_leads['status'].isin(['visita_agendada', 'visit_scheduled', 'sold', 'venda_realizada'])]
                if scheduled_leads.empty:
                    scheduled_leads = df_leads # Fallback to all leads to show *traffic* patterns if no appointments yet
                
                # Copy to avoid SettingWithCopyWarning and ensure created_at_br is preserved
                scheduled_leads = scheduled_leads[['created_at_br']].copy()
                
                # Extract day of week (0=Mon, 6=Sun) and hour using Brazil timezone column
                scheduled_leads['dow'] = scheduled_leads['created_at_br'].dt.dayofweek
                scheduled_leads['hour'] = scheduled_leads['created_at_br'].dt.hour
                
                # Group
                heatmap_counts = scheduled_leads.groupby(['dow', 'hour']).size().reset_index(name='value')
                heatmap_data = heatmap_counts.to_dict('records')

            # 6. Response Time Analysis (REAL DATA)
            response_times = {"ai_avg_seconds": 0, "lead_avg_minutes": 0, "history": []}
            try:
                msgs_res = self.supabase.table("messages").select("sender_type, created_at, conversation_id").order("created_at", direction="desc").limit(500).execute()
                if msgs_res.data:
                    df_msgs_rt = pd.DataFrame(msgs_res.data)
                    response_times = compute_response_times(df_msgs_rt)
            except Exception as e:
                print(f"Error calculating response times: {e}")

            # 7. Objections (REAL DATA)
            # We combine analysis of 'notes' from lost leads AND active message scanning for sentiment
            objections_list = []
            
            # A) Scan lost leads notes
            lost_leads = df_leads[df_leads['status'].isin(['perdido', 'lost', 'frio', 'cold'])]
            if not lost_leads.empty:
                for _, row in lost_leads.iterrows():
                    note = str(row.get('notes', '')).lower()
                    if any(k in note for k in ['preço', 'valor', 'caro', 'orçamento']): objections_list.append('Preço / Orçamento')
                    elif any(k in note for k in ['local', 'longe', 'bairro']): objections_list.append('Localização')
                    elif any(k in note for k in ['outra', 'concorrencia', 'comprou']): objections_list.append('Concorrência')
                    elif any(k in note for k in ['momento', 'esperar']): objections_list.append('Momento / Adiou')
            
            # B) Scan recent messages for "Active Objections" (Sentiment Scan)
            try:
                # Fetch last 100 messages from 'lead' to detect live friction
                live_msgs = self.supabase.table("messages").select("content").eq("sender_type", "lead").order("created_at", direction="desc").limit(100).execute()
                if live_msgs.data:
                    for m in live_msgs.data:
                        content = str(m['content']).lower()
                        if any(k in content for k in ['caro', 'preço', 'valor', 'orçamento', 'condição']):
                            objections_list.append('Preço / Orçamento')
                        if any(k in content for k in ['longe', 'localização', 'avenida', 'distância']):
                            objections_list.append('Localização')
                        if any(k in content for k in ['concorrente', 'outro prédio', 'visto outros']):
                            objections_list.append('Concorrência')
            except Exception as e:
                print(f"Error scanning live objections: {e}")

            if objections_list:
                obj_counts = pd.Series(objections_list).value_counts().reset_index()
                obj_counts.columns = ['name', 'value']
                # Limit to top 5
                objections = obj_counts.head(5).to_dict('records')
            else:
                objections = [] 

            # 8. Channel Distribution (REAL DATA)
            conv_res = self.supabase.table("conversations").select("platform").execute()
            if conv_res.data:
                df_conv = pd.DataFrame(conv_res.data)
                # Map platform names to display names if needed
                channel_counts = df_conv['platform'].value_counts().reset_index()
                channel_counts.columns = ['name', 'value']
                
                # Assign colors
                def get_color(name):
                    if 'whatsapp' in name.lower(): return "#25D366"
                    if 'instagram' in name.lower(): return "#E1306C"
                    if 'site' in name.lower(): return "#3b82f6"
                    return "#9ca3af"

                channel_counts['color'] = channel_counts['name'].apply(get_color)
                # Capitalize
                channel_counts['name'] = channel_counts['name'].str.capitalize()
                
                channels = channel_counts.to_dict('records')
            else:
                channels = []

            # 9. FAQ - Perguntas Mais Frequentes (REAL DATA)
            faq_list = []
            try:
                # Buscar mensagens dos leads para identificar perguntas frequentes
                faq_msgs = self.supabase.table("messages").select("content").eq("sender_type", "lead").order("created_at", direction="desc").limit(500).execute()
                if faq_msgs.data:
                    faq_keywords = {
                        'Localização': ['onde fica', 'localização', 'endereço', 'qual o endereço', 'fica onde', 'região'],
                        'Preço/Valores': ['quanto custa', 'valor', 'preço', 'parcela', 'entrada', 'financiamento', 'condições'],
                        'Prazo de Entrega': ['quando fica pronto', 'prazo', 'entrega', 'previsão'],
                        'Visita': ['posso visitar', 'agendar visita', 'conhecer', 'ver pessoalmente', 'horário'],
                        'Área de Lazer': ['lazer', 'piscina', 'academia', 'área comum', 'churrasqueira'],
                        'Metragem': ['metros', 'tamanho', 'área', 'quantos m²', 'metragem'],
                        'Vagas': ['vaga', 'garagem', 'estacionamento', 'carro'],
                        'Documentação': ['documento', 'contrato', 'escritura', 'registro']
                    }
                    
                    faq_counts = {k: 0 for k in faq_keywords.keys()}
                    
                    for m in faq_msgs.data:
                        content = str(m.get('content', '')).lower()
                        for category, keywords in faq_keywords.items():
                            if any(kw in content for kw in keywords):
                                faq_counts[category] += 1
                    
                    # Ordenar por frequência e pegar top 8
                    faq_sorted = sorted(faq_counts.items(), key=lambda x: x[1], reverse=True)
                    faq_list = [{"name": k, "value": v} for k, v in faq_sorted if v > 0][:8]
            except Exception as e:
                print(f"Error calculating FAQ: {e}")

            # 10. Taxa de Transferência para Humano (REAL DATA)
            transfer_rate = 0
            transfer_count = 0
            try:
                # Contar leads que foram transferidos (status 'transferido' ou notas com 'transferido')
                transferred = df_leads[df_leads['status'].isin(['transferido', 'transferred', 'humano'])]
                transfer_count = len(transferred)
                
                # Também verificar nas notas
                if 'notes' in df_leads.columns:
                    notes_transferred = df_leads[df_leads['notes'].str.contains('transfer|humano|comercial', case=False, na=False)]
                    transfer_count = max(transfer_count, len(notes_transferred))
                
                transfer_rate = round((transfer_count / total_leads * 100), 1) if total_leads > 0 else 0
            except Exception as e:
                print(f"Error calculating transfer rate: {e}")

            # 11. Sentiment Trend (REAL DATA)
            sentiment_trend = []
            try:
                sentiment_trend = compute_sentiment_trend(df_leads)
                if not sentiment_trend:
                    # Fallback: usar dados do histórico com valores estimados
                    for h in history_formatted[-7:]:
                        leads_count = h.get('leads', 1)
                        sentiment_trend.append({
                            'date': h['date'],
                            'positive': max(1, int(leads_count * 0.6)),
                            'neutral': max(0, int(leads_count * 0.3)),
                            'negative': max(0, int(leads_count * 0.1))
                        })
            except Exception as e:
                print(f"Error calculating sentiment trend: {e}")

            # 12. Conversion Funnel (REAL DATA)
            funnel_data = compute_funnel_data(df_leads)

            # 13. Temperature Distribution (REAL DATA)
            temperature_distribution = compute_temperature_distribution(df_leads)

            # 14. Source Analysis (REAL DATA)
            source_analysis = compute_source_analysis(df_leads)

            # 15. Time-Based Metrics (REAL DATA)
            try:
                msgs_for_time = self.supabase.table("messages").select(
                    "conversation_id, sender_type, created_at"
                ).order("created_at", direction="desc").limit(1000).execute()
                df_msgs_time = pd.DataFrame(msgs_for_time.data) if msgs_for_time.data else pd.DataFrame()

                # If messages have no lead_id, try joining via conversations
                if not df_msgs_time.empty and "lead_id" not in df_msgs_time.columns:
                    convs_for_join = self.supabase.table("conversations").select("id, lead_id").execute()
                    if convs_for_join.data:
                        df_convs = pd.DataFrame(convs_for_join.data)
                        df_msgs_time = df_msgs_time.merge(
                            df_convs, left_on="conversation_id", right_on="id", suffixes=("", "_conv")
                        )
            except Exception as e:
                print(f"Error fetching messages for time metrics: {e}")
                df_msgs_time = pd.DataFrame()

            time_metrics = compute_time_metrics(df_leads, df_msgs_time)

            return {
                "total_leads": total_leads,
                "conversion_rate": round(conversion_rate, 2),
                "em_atendimento": em_atendimento,
                "status_distribution": status_counts,
                "history": history_formatted[-30:], # Last 30 days
                "heatmap": heatmap_data,
                "response_times": response_times,
                "objections": objections,
                "channels": channels,
                "faq": faq_list,
                "transfer_rate": transfer_rate,
                "transfer_count": transfer_count,
                "sentiment_trend": sentiment_trend[-7:] if sentiment_trend else [],
                "funnel_data": funnel_data,
                "temperature_distribution": temperature_distribution,
                "source_analysis": source_analysis,
                "avg_first_response_seconds": time_metrics["avg_first_response_seconds"],
                "lead_velocity": time_metrics["lead_velocity"],
            }

        except Exception as e:
            print(f"Error generating analytics: {e}")
            return {
                "total_leads": 0,
                "conversion_rate": 0,
                "status_distribution": {},
                "history": [],
                "error": str(e)
            }

    def analyze_lead_sentiment(self, lead_id: str = None) -> dict:
        """
        Analisa o sentimento das conversas de um lead específico ou todos os leads.
        Usa OpenAI para análise de texto + pandas para agregação.
        
        Retorna score de -100 (muito negativo) a +100 (muito positivo)
        """
        import os
        from openai import OpenAI
        
        try:
            api_key = os.environ.get("OPENAI_API_KEY")
            if not api_key:
                return {"error": "OpenAI API key not configured"}
            
            client = OpenAI(api_key=api_key)
            
            # Buscar leads
            if lead_id:
                leads_res = self.supabase.table("leads").select("*").eq("id", lead_id).execute()
            else:
                leads_res = self.supabase.table("leads").select("*").execute()
            
            if not leads_res.data:
                return {"error": "No leads found", "leads": []}
            
            results = []
            
            for lead in leads_res.data:
                lead_db_id = lead['id']
                lead_name = lead.get('full_name') or lead.get('phone') or 'Unknown'
                
                # Buscar conversa do lead
                conv_res = self.supabase.table("conversations").select("id").eq("lead_id", lead_db_id).execute()
                
                if not conv_res.data:
                    results.append({
                        "lead_id": lead_db_id,
                        "name": lead_name,
                        "sentiment_score": 0,
                        "sentiment_label": "neutro",
                        "analysis": "Sem conversas para analisar"
                    })
                    continue
                
                conv_id = conv_res.data[0]['id']
                
                # Buscar últimas 20 mensagens do lead (não da IA)
                msgs_res = self.supabase.table("messages").select("content, sender_type").eq("conversation_id", conv_id).eq("sender_type", "lead").order("created_at", direction="desc").limit(20).execute()
                
                if not msgs_res.data:
                    results.append({
                        "lead_id": lead_db_id,
                        "name": lead_name,
                        "sentiment_score": 0,
                        "sentiment_label": "neutro",
                        "analysis": "Lead ainda não respondeu"
                    })
                    continue
                
                # Concatenar mensagens para análise
                messages_text = "\n".join([msg['content'] for msg in msgs_res.data if msg['content']])
                
                if not messages_text.strip():
                    results.append({
                        "lead_id": lead_db_id,
                        "name": lead_name,
                        "sentiment_score": 0,
                        "sentiment_label": "neutro",
                        "analysis": "Mensagens vazias"
                    })
                    continue
                
                # Prompt para análise de sentimento
                prompt = f"""Analise o sentimento das mensagens deste lead de imobiliária e retorne APENAS um JSON válido (sem markdown, sem explicação).

Mensagens do lead:
\"\"\"
{messages_text[:2000]}
\"\"\"

Retorne exatamente neste formato JSON:
{{"score": <número de -100 a 100>, "label": "<positivo|neutro|negativo>", "reason": "<explicação curta em português>"}}

Regras:
- Score +50 a +100: Lead muito interessado, quer agendar, perguntas específicas
- Score +20 a +49: Lead curioso, fazendo perguntas
- Score -20 a +19: Neutro, respostas genéricas
- Score -50 a -21: Desinteressado, evasivo
- Score -100 a -51: Claramente não quer, reclamou, pediu para parar

Responda APENAS o JSON, nada mais:"""

                try:
                    response = client.chat.completions.create(
                        model="gpt-4o-mini",  # Modelo mais barato para análise em batch
                        messages=[
                            {"role": "system", "content": "Você é um analisador de sentimentos. Retorne apenas JSON válido."},
                            {"role": "user", "content": prompt}
                        ],
                        temperature=0.3,
                        max_tokens=200
                    )
                    
                    response_text = response.choices[0].message.content.strip()
                    
                    # Tentar parsear JSON (remover possíveis backticks de markdown)
                    import json
                    import re
                    
                    json_match = re.search(r'\{[^}]+\}', response_text)
                    if json_match:
                        sentiment_data = json.loads(json_match.group())
                    else:
                        sentiment_data = json.loads(response_text)
                    
                    score = int(sentiment_data.get('score', 0))
                    label = sentiment_data.get('label', 'neutro')
                    reason = sentiment_data.get('reason', '')
                    
                    # Atualizar lead no banco com o sentimento
                    try:
                        self.supabase.table("leads").update({
                            "sentiment_score": score,
                            "sentiment_label": label
                        }).eq("id", lead_db_id).execute()
                    except Exception as db_err:
                        print(f"Error updating lead sentiment: {db_err}")
                    
                    results.append({
                        "lead_id": lead_db_id,
                        "name": lead_name,
                        "sentiment_score": score,
                        "sentiment_label": label,
                        "analysis": reason
                    })
                    
                except Exception as ai_err:
                    print(f"AI Error analyzing lead {lead_db_id}: {ai_err}")
                    results.append({
                        "lead_id": lead_db_id,
                        "name": lead_name,
                        "sentiment_score": 0,
                        "sentiment_label": "erro",
                        "analysis": f"Erro na análise: {str(ai_err)}"
                    })
            
            # Agregar estatísticas com pandas
            if results:
                df = pd.DataFrame(results)
                
                # Calcular médias por label
                label_stats = df.groupby('sentiment_label').agg({
                    'sentiment_score': 'mean',
                    'lead_id': 'count'
                }).rename(columns={'lead_id': 'count'}).to_dict('index')
                
                return {
                    "leads": results,
                    "summary": {
                        "total_analyzed": len(results),
                        "avg_score": round(df['sentiment_score'].mean(), 1),
                        "positivos": len(df[df['sentiment_label'] == 'positivo']),
                        "neutros": len(df[df['sentiment_label'] == 'neutro']),
                        "negativos": len(df[df['sentiment_label'] == 'negativo']),
                        "by_label": label_stats
                    }
                }
            
            return {"leads": [], "summary": {}}
            
        except Exception as e:
            print(f"Error in sentiment analysis: {e}")
            import traceback
            traceback.print_exc()
            return {"error": str(e)}
