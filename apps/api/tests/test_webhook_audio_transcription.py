import asyncio
import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

# Add api folder to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


def test_uazapi_upsert_audio_message_is_transcribed_and_saved_as_audio_type():
    from routers import webhook

    mock_request = AsyncMock()
    mock_request.json.return_value = {
        "event": "messages.upsert",
        "data": {
            "key": {
                "remoteJid": "5511999999999@s.whatsapp.net",
                "fromMe": False,
                "id": "audio-msg-001",
            },
            "message": {
                "AudioMessage": {
                    "url": "https://example.com/audio.ogg",
                    "mimetype": "audio/ogg",
                }
            },
        },
    }

    async def mock_queue_recalculation(_trigger_source: str):
        return None

    async def run_test():
        with patch.object(
            webhook.analytics_cache_service,
            "queue_recalculation",
            side_effect=mock_queue_recalculation,
        ):
            with patch("services.message_service.MessageService") as mock_msg_service_class:
                mock_msg_service = MagicMock()
                mock_msg_service_class.return_value = mock_msg_service

                with patch("routers.webhook.add_to_buffer", new_callable=AsyncMock) as mock_add_to_buffer:
                    with patch.object(webhook.audio_transcription_service, "is_enabled", return_value=True):
                        with patch.object(
                            webhook.audio_transcription_service,
                            "transcribe_from_url",
                            return_value="quero saber o valor do apartamento",
                        ):
                            result = await webhook.handle_uazapi_webhook(mock_request)

        return result, mock_msg_service, mock_add_to_buffer

    result, mock_msg_service, mock_add_to_buffer = asyncio.run(run_test())

    assert result == {"status": "received"}
    mock_msg_service.save_message.assert_called_once()

    args, kwargs = mock_msg_service.save_message.call_args
    assert args[0] == "5511999999999@s.whatsapp.net"
    assert args[1].startswith("[Áudio transcrito pelo cliente]")
    assert kwargs["message_type"] == "audio"
    assert kwargs["whatsapp_msg_id"] == "audio-msg-001"

    mock_add_to_buffer.assert_awaited_once()
    buffer_args, _ = mock_add_to_buffer.call_args
    assert buffer_args[0] == "5511999999999@s.whatsapp.net"
    assert buffer_args[1].startswith("[Áudio transcrito pelo cliente]")
    assert buffer_args[2] == "audio-msg-001"


def test_uazapi_upsert_audio_message_without_transcription_uses_fallback_text():
    from routers import webhook

    mock_request = AsyncMock()
    mock_request.json.return_value = {
        "event": "messages.upsert",
        "data": {
            "key": {
                "remoteJid": "5563999999999@s.whatsapp.net",
                "fromMe": False,
                "id": "audio-msg-002",
            },
            "message": {
                "AudioMessage": {
                    "url": "https://example.com/audio.ogg",
                }
            },
        },
    }

    async def mock_queue_recalculation(_trigger_source: str):
        return None

    async def run_test():
        with patch.object(
            webhook.analytics_cache_service,
            "queue_recalculation",
            side_effect=mock_queue_recalculation,
        ):
            with patch("services.message_service.MessageService") as mock_msg_service_class:
                mock_msg_service = MagicMock()
                mock_msg_service_class.return_value = mock_msg_service

                with patch("routers.webhook.add_to_buffer", new_callable=AsyncMock):
                    with patch.object(webhook.audio_transcription_service, "is_enabled", return_value=False):
                        result = await webhook.handle_uazapi_webhook(mock_request)

        return result, mock_msg_service

    result, mock_msg_service = asyncio.run(run_test())

    assert result == {"status": "received"}
    mock_msg_service.save_message.assert_called_once()
    args, kwargs = mock_msg_service.save_message.call_args
    assert args[1] == "[Áudio enviado pelo cliente]"
    assert kwargs["message_type"] == "audio"


def test_blackai_audio_message_is_transcribed_and_buffered():
    from routers import webhook

    mock_request = AsyncMock()
    mock_request.json.return_value = {
        "EventType": "messages",
        "message": {
            "chatid": "5511888888888@s.whatsapp.net",
            "fromMe": False,
            "id": "audio-msg-003",
            "type": "audio",
            "AudioMessage": {
                "url": "https://example.com/audio2.ogg",
            },
        },
    }

    async def mock_queue_recalculation(_trigger_source: str):
        return None

    async def run_test():
        with patch.object(
            webhook.analytics_cache_service,
            "queue_recalculation",
            side_effect=mock_queue_recalculation,
        ):
            with patch("services.message_service.MessageService") as mock_msg_service_class:
                mock_msg_service = MagicMock()
                mock_msg_service_class.return_value = mock_msg_service

                with patch("routers.webhook.add_to_buffer", new_callable=AsyncMock) as mock_add_to_buffer:
                    with patch.object(webhook.audio_transcription_service, "is_enabled", return_value=True):
                        with patch.object(
                            webhook.audio_transcription_service,
                            "transcribe_from_url",
                            return_value="tenho interesse no empreendimento",
                        ):
                            result = await webhook.handle_uazapi_webhook(mock_request)

        return result, mock_msg_service, mock_add_to_buffer

    result, mock_msg_service, mock_add_to_buffer = asyncio.run(run_test())

    assert result == {"status": "received"}
    mock_msg_service.save_message.assert_called_once()
    args, kwargs = mock_msg_service.save_message.call_args
    assert kwargs["message_type"] == "audio"
    assert args[1].startswith("[Áudio transcrito pelo cliente]")

    mock_add_to_buffer.assert_awaited_once()
