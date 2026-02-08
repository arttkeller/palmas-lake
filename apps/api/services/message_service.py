
from services.supabase_client import create_client
import os
from datetime import datetime
import pytz
import uuid
import logging
import traceback

# Configure logging for MessageService (Requirements 3.4, 7.4, 9.5)
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

# Create console handler if not already present
if not logger.handlers:
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.DEBUG)
    formatter = logging.Formatter('[%(asctime)s] [%(name)s] [%(levelname)s] %(message)s')
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

# Timezone do Brasil
BRAZIL_TZ = pytz.timezone('America/Sao_Paulo')

def get_brazil_now():
    """Retorna datetime atual no horário de Brasília em formato ISO"""
    return datetime.now(BRAZIL_TZ).isoformat()


class MessageServiceError(Exception):
    """Custom exception for MessageService errors."""
    pass


class SchemaError(MessageServiceError):
    """Exception for schema-related errors (Requirements 7.4)."""
    pass


class LeadCreationError(MessageServiceError):
    """Exception for lead creation failures (Requirements 9.5)."""
    pass


class ConversationError(MessageServiceError):
    """Exception for conversation-related errors."""
    pass


class MessageService:
    """
    Service for managing messages, conversations, and leads.
    
    Implements comprehensive error handling and logging as per Requirements 3.4, 7.4, 9.5.
    """
    
    def __init__(self, use_mock=False):
        """
        Initialize MessageService.
        
        Args:
            use_mock: If True, indicates mock mode is active (for testing)
        """
        try:
            self.supabase = create_client()
            self.use_mock = use_mock
            
            # Log mock mode status (Requirement 10.5)
            if self.use_mock:
                logger.info("MOCK MODE ACTIVE - Using mocked data for testing")
        except Exception as e:
            logger.error(f"Failed to initialize MessageService: {e}")
            raise MessageServiceError(f"Initialization failed: {e}")

    def save_message(self, remote_jid: str, content: str, sender_type: str, message_type: str = "text", whatsapp_msg_id: str = None):
        """
        Saves a message to the database.
        Ensures a lead and conversation exist for the remote_jid (phone).
        
        Implements comprehensive error handling (Requirements 3.4, 7.4, 9.5):
        - Try-catch blocks for all database operations
        - Detailed error logging for schema mismatches
        - Retry logic for failed operations
        
        Args:
            remote_jid: Identificador do lead (telefone@whatsapp)
            content: Conteúdo da mensagem
            sender_type: 'lead', 'ai', ou 'user'
            message_type: 'text', 'image', etc.
            whatsapp_msg_id: ID da mensagem no WhatsApp (opcional)
        
        Returns:
            conversation_id se sucesso, None se falha
        """
        try:
            # 0. Clean phone number from remote_jid (e.g. 5511999999999@s.whatsapp.net)
            phone = remote_jid.split('@')[0] if '@' in remote_jid else remote_jid
            logger.debug(f"Processing message for phone: {phone}")
            
            # 1. Find or Create Lead (with retry logic - Requirements 9.1, 9.2, 9.3, 9.5)
            lead_id = None
            try:
                lead_res = self.supabase.table("leads").select("id").eq("phone", phone).execute()
                
                if lead_res.data:
                    lead_id = lead_res.data[0]["id"]
                    logger.debug(f"Found existing lead: {lead_id}")
                else:
                    # Create a simple lead with proper formatting (Requirements 9.2, 9.3)
                    new_lead = {
                        "full_name": f"Lead {phone}",  # Requirement 9.3: proper name formatting
                        "phone": phone,
                        "status": "new"  # Requirement 9.2: proper lead status
                    }
                    
                    # Retry logic for failed lead creation (Requirement 9.5)
                    max_retries = 1
                    last_error = None
                    for attempt in range(max_retries + 1):
                        try:
                            new_lead_res = self.supabase.table("leads").insert(new_lead).execute()
                            if new_lead_res.data:
                                lead_id = new_lead_res.data[0]["id"]
                                logger.info(f"Created new lead {lead_id} for phone {phone}")
                                break
                        except Exception as create_error:
                            last_error = create_error
                            logger.warning(f"Lead creation attempt {attempt + 1} failed: {create_error}")
                            
                            # Check for schema-related errors (Requirements 7.4)
                            if "schema" in str(create_error).lower() or "not found" in str(create_error).lower():
                                logger.error(f"[SCHEMA ERROR] Lead creation failed - schema mismatch detected: {create_error}")
                            
                            if attempt == max_retries:
                                logger.error(f"Failed to create lead after {max_retries + 1} attempts: {last_error}")
                                return None
                    
            except Exception as lead_error:
                logger.error(f"Error finding/creating lead for phone {phone}: {lead_error}")
                # Check for schema-related errors (Requirements 7.4)
                if "schema" in str(lead_error).lower():
                    logger.error(f"[SCHEMA ERROR] Lead query failed - verify schema 'palmaslake-agno' is correct")
                return None
            
            if not lead_id:
                logger.error(f"Failed to find/create lead for phone {phone}")
                return None

            # 2. Check/Create Conversation (with retry logic - Requirement 9.4)
            conversation_id = None
            try:
                res = self.supabase.table("conversations").select("*").eq("lead_id", lead_id).execute()
                
                if res.data:
                    conversation_id = res.data[0]["id"]
                    logger.debug(f"Found existing conversation: {conversation_id}")
                else:
                    # Create conversation (Requirement 9.4)
                    conv_data = {
                        "lead_id": lead_id,
                        "platform": "whatsapp",
                    }
                    
                    # Retry logic for failed conversation creation
                    max_retries = 1
                    last_error = None
                    for attempt in range(max_retries + 1):
                        try:
                            conv_res = self.supabase.table("conversations").insert(conv_data).execute()
                            if conv_res.data:
                                conversation_id = conv_res.data[0]["id"]
                                logger.info(f"Created new conversation {conversation_id} for lead {lead_id}")
                                break
                        except Exception as create_error:
                            last_error = create_error
                            logger.warning(f"Conversation creation attempt {attempt + 1} failed: {create_error}")
                            
                            # Check for schema-related errors (Requirements 7.4)
                            if "schema" in str(create_error).lower():
                                logger.error(f"[SCHEMA ERROR] Conversation creation failed - schema mismatch: {create_error}")
                            
                            if attempt == max_retries:
                                logger.error(f"Failed to create conversation after {max_retries + 1} attempts: {last_error}")
                                return None
                                
            except Exception as conv_error:
                logger.error(f"Error finding/creating conversation for lead {lead_id}: {conv_error}")
                # Check for schema-related errors (Requirements 7.4)
                if "schema" in str(conv_error).lower():
                    logger.error(f"[SCHEMA ERROR] Conversation query failed - verify schema 'palmaslake-agno' is correct")
                return None
            
            if not conversation_id:
                logger.error(f"Failed to find/create conversation for lead {lead_id}")
                return None

            # 3. Build metadata with whatsapp_msg_id if provided
            metadata = {}
            if whatsapp_msg_id:
                metadata["whatsapp_msg_id"] = whatsapp_msg_id

            # 4. Insert Message
            try:
                msg_data = {
                    "conversation_id": conversation_id,
                    "sender_type": sender_type, # 'user', 'ai', 'lead'
                    "content": content,
                    "message_type": message_type,
                    "created_at": get_brazil_now()
                }
                
                # Only add metadata if it has content
                if metadata:
                    msg_data["metadata"] = metadata
                
                insert_result = self.supabase.table("messages").insert(msg_data).execute()
                
                # Verify the insert was successful
                if insert_result.data:
                    logger.debug(f"Message saved successfully for conversation {conversation_id}")
                else:
                    logger.error(f"Message insert returned no data - insert may have failed silently")
                    logger.error(f"Message data was: {msg_data}")
                
            except Exception as msg_error:
                logger.error(f"Error inserting message: {msg_error}")
                # Check for schema-related errors (Requirements 7.4)
                if "schema" in str(msg_error).lower():
                    logger.error(f"[SCHEMA ERROR] Message insert failed - verify schema 'palmaslake-agno' is correct")
                # Continue anyway - we'll try to update conversation
            
            # 5. Update Conversation Last Message (Requirements 1.1, 1.2, 3.1, 3.2, 3.3)
            try:
                self.supabase.table("conversations").update({
                    "last_message": content[:50] + "..." if len(content) > 50 else content,
                    "updated_at": get_brazil_now()
                }).eq("id", conversation_id).execute()
                logger.debug(f"Updated conversation {conversation_id} last_message")
            except Exception as update_error:
                # Log error but continue - message was saved successfully (Requirement 3.4)
                logger.warning(f"Error updating conversation last_message (non-fatal): {update_error}")
                # Check for schema-related errors (Requirements 7.4)
                if "schema" in str(update_error).lower():
                    logger.error(f"[SCHEMA ERROR] Conversation update failed - schema mismatch: {update_error}")
            
            # 6. Update last_interaction timestamp for lead messages (Requirements 5.3, 6.1)
            # 7. Cancel pending follow-ups when lead responds (Requirements 6.5)
            if sender_type == "lead":
                try:
                    self.supabase.table("leads").update({
                        "last_interaction": get_brazil_now(),
                        "follow_up_stage": 0,  # Reset follow-up stage on response
                        "next_follow_up": None  # Clear scheduled follow-up (Requirements 4.2)
                    }).eq("id", lead_id).execute()
                    logger.debug(f"Updated last_interaction for lead {lead_id}")
                    
                    # Cancel any pending follow-ups (Requirements 6.5)
                    try:
                        from services.follow_up_service import cancel_follow_ups_for_lead
                        cancelled = cancel_follow_ups_for_lead(lead_id)
                        if cancelled > 0:
                            logger.info(f"Cancelled {cancelled} pending follow-ups for lead {lead_id}")
                    except ImportError:
                        # Follow-up service not available yet
                        pass
                    except Exception as fu_error:
                        logger.warning(f"Error cancelling follow-ups (non-fatal): {fu_error}")
                        
                except Exception as e:
                    logger.warning(f"Error updating last_interaction (non-fatal): {e}")
            
            logger.info(f"Message saved: {content[:20]}... ({sender_type})")
            return conversation_id
            
        except Exception as e:
            logger.error(f"Unexpected error in save_message: {e}")
            logger.error(traceback.format_exc())
            return None

    def get_conversations(self):
        """
        Fetch conversations with lead details, ordered by updated_at DESC.
        
        Implements error handling (Requirements 3.4, 7.4).
        
        Returns:
            List of conversations with lead details, or empty list on error
        """
        try:
            result = self.supabase.table("conversations").select("*, leads(full_name, phone)").order("updated_at", direction="desc").execute()
            return result.data if result.data else []
        except Exception as e:
            logger.error(f"Error fetching conversations: {e}")
            # Check for schema-related errors (Requirements 7.4)
            if "schema" in str(e).lower():
                logger.error(f"[SCHEMA ERROR] Conversations query failed - verify schema 'palmaslake-agno' is correct")
            return []

    def get_conversation_by_lead(self, lead_id: str):
        """
        Returns the conversation for a specific lead.
        
        Implements error handling (Requirements 3.4, 7.4).
        
        Args:
            lead_id: UUID of the lead
        
        Returns:
            Conversation data with lead details, or None if not found
        """
        try:
            res = self.supabase.table("conversations").select("*, leads(full_name, phone)").eq("lead_id", lead_id).execute()
            if res.data and len(res.data) > 0:
                return res.data[0]
            logger.debug(f"No conversation found for lead {lead_id}")
            return None
        except Exception as e:
            logger.error(f"Error getting conversation by lead {lead_id}: {e}")
            # Check for schema-related errors (Requirements 7.4)
            if "schema" in str(e).lower():
                logger.error(f"[SCHEMA ERROR] Conversation query failed - verify schema 'palmaslake-agno' is correct")
            return None

    def get_messages(self, conversation_id: str):
        """
        Fetch messages for a conversation, sorted by created_at.
        
        Implements error handling (Requirements 3.4, 7.4).
        
        Args:
            conversation_id: UUID of the conversation
        
        Returns:
            List of messages sorted by created_at, or empty list on error
        """
        try:
            res = self.supabase.table("messages").select("*").eq("conversation_id", conversation_id).execute()
            if res.data:
                return sorted(res.data, key=lambda x: x['created_at'])
            return []
        except Exception as e:
            logger.error(f"Error fetching messages for conversation {conversation_id}: {e}")
            # Check for schema-related errors (Requirements 7.4)
            if "schema" in str(e).lower():
                logger.error(f"[SCHEMA ERROR] Messages query failed - verify schema 'palmaslake-agno' is correct")
            return []

    def find_message_by_whatsapp_id(self, conversation_id: str, whatsapp_msg_id: str) -> dict:
        """
        Busca mensagem pelo whatsapp_msg_id no metadata.
        
        Implements error handling (Requirements 3.4, 7.4).
        
        Args:
            conversation_id: ID da conversa no banco
            whatsapp_msg_id: ID da mensagem no WhatsApp
        
        Returns:
            Dados da mensagem ou None se não encontrada
        """
        try:
            if not conversation_id or not whatsapp_msg_id:
                logger.warning(f"Invalid parameters: conversation_id={conversation_id}, whatsapp_msg_id={whatsapp_msg_id}")
                return None
            
            # Query messages filtering by metadata->whatsapp_msg_id using Supabase JSONB filter
            # Using the ->> operator to extract text from JSONB
            res = self.supabase.table("messages").select("*").eq(
                "conversation_id", conversation_id
            ).eq(
                "metadata->>whatsapp_msg_id", whatsapp_msg_id
            ).execute()
            
            if res.data and len(res.data) > 0:
                logger.debug(f"Found message with whatsapp_msg_id={whatsapp_msg_id}")
                return res.data[0]
            
            logger.debug(f"No message found with whatsapp_msg_id={whatsapp_msg_id}")
            return None
            
        except Exception as e:
            logger.error(f"Error finding message by whatsapp_id: {e}")
            logger.error(traceback.format_exc())
            # Check for schema-related errors (Requirements 7.4)
            if "schema" in str(e).lower():
                logger.error(f"[SCHEMA ERROR] Message query failed - verify schema 'palmaslake-agno' is correct")
            return None

    def save_reaction(self, remote_jid: str, whatsapp_msg_id: str, emoji: str):
        """
        Salva uma reação a uma mensagem no banco de dados.
        Busca a mensagem pelo whatsapp_msg_id no metadata e atualiza com a reação.
        
        Implements error handling (Requirements 3.4, 7.4).
        
        Args:
            remote_jid: Identificador do lead (telefone@whatsapp)
            whatsapp_msg_id: ID da mensagem no WhatsApp para reagir
            emoji: Emoji da reação
        
        Returns:
            ID da mensagem no banco se sucesso, None se falha
        """
        try:
            phone = remote_jid.split('@')[0] if '@' in remote_jid else remote_jid
            
            # Buscar lead
            try:
                lead_res = self.supabase.table("leads").select("id").eq("phone", phone).execute()
                if not lead_res.data:
                    logger.warning(f"Lead not found for phone {phone}")
                    return None
                
                lead_id = lead_res.data[0]["id"]
            except Exception as lead_error:
                logger.error(f"Error finding lead for reaction: {lead_error}")
                if "schema" in str(lead_error).lower():
                    logger.error(f"[SCHEMA ERROR] Lead query failed - verify schema 'palmaslake-agno' is correct")
                return None
            
            # Buscar conversa
            try:
                conv_res = self.supabase.table("conversations").select("id").eq("lead_id", lead_id).execute()
                if not conv_res.data:
                    logger.warning(f"Conversation not found for lead {lead_id}")
                    return None
                
                conversation_id = conv_res.data[0]["id"]
            except Exception as conv_error:
                logger.error(f"Error finding conversation for reaction: {conv_error}")
                if "schema" in str(conv_error).lower():
                    logger.error(f"[SCHEMA ERROR] Conversation query failed - verify schema 'palmaslake-agno' is correct")
                return None
            
            # Buscar mensagem pelo whatsapp_msg_id usando o novo método
            msg = self.find_message_by_whatsapp_id(conversation_id, whatsapp_msg_id)
            
            if not msg:
                logger.warning(f"No message found with whatsapp_msg_id={whatsapp_msg_id}")
                return None
            
            db_msg_id = msg["id"]
            
            # Atualizar metadata com a reação
            try:
                current_metadata = msg.get("metadata") or {}
                if isinstance(current_metadata, str):
                    import json
                    current_metadata = json.loads(current_metadata) if current_metadata else {}
                
                current_metadata["reaction"] = emoji
                current_metadata["reaction_from"] = "ai"
                
                self.supabase.table("messages").update({
                    "metadata": current_metadata
                }).eq("id", db_msg_id).execute()
                
                logger.info(f"Saved reaction {emoji} to message {db_msg_id}")
                return db_msg_id
                
            except Exception as update_error:
                logger.error(f"Error updating message with reaction: {update_error}")
                if "schema" in str(update_error).lower():
                    logger.error(f"[SCHEMA ERROR] Message update failed - verify schema 'palmaslake-agno' is correct")
                return None
                
        except Exception as e:
            logger.error(f"Unexpected error saving reaction: {e}")
            logger.error(traceback.format_exc())
            return None
