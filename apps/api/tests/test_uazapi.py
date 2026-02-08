
import unittest
from unittest.mock import patch, MagicMock
import sys
import os
import json

# Add api folder to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from services.uazapi_service import UazapiService

class TestUazapiService(unittest.TestCase):
    def setUp(self):
        self.service = UazapiService()
        self.service.base_url = "https://mock.uazapi.com"
        self.service.msg_token = "mock_token"

    @patch('requests.post')
    def test_send_whatsapp_message_basic(self, mock_post):
        # Configure mock
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"success": True}
        mock_post.return_value = mock_response

        # Call
        self.service.send_whatsapp_message("5511999999999", "Hello World")

        # Assert
        mock_post.assert_called_once()
        args, kwargs = mock_post.call_args
        self.assertEqual(args[0], "https://mock.uazapi.com/send/text")
        
        payload = kwargs['json']
        self.assertEqual(payload['number'], "5511999999999")
        self.assertEqual(payload['text'], "Hello World")
        self.assertEqual(payload['linkPreview'], True)

    @patch('requests.post')
    def test_send_whatsapp_message_with_reply(self, mock_post):
        self.service.send_whatsapp_message("5511999999999", "Reply", reply_id="msg_123")
        
        args, kwargs = mock_post.call_args
        payload = kwargs['json']
        self.assertEqual(payload['replyid'], "msg_123")

    @patch('requests.post')
    def test_send_media(self, mock_post):
        self.service.send_image("5511999999999", "http://img.com/a.jpg", "Caption")
        
        args, kwargs = mock_post.call_args
        self.assertEqual(args[0], "https://mock.uazapi.com/send/media")
        
        payload = kwargs['json']
        self.assertEqual(payload['type'], "image")
        self.assertEqual(payload['file'], "http://img.com/a.jpg")
        self.assertEqual(payload['text'], "Caption")

    @patch('requests.post')
    def test_send_carousel(self, mock_post):
        items = [
            {"text": "Card 1", "image": "http://img.1", "buttons": []},
            {"text": "Card 2", "image": "http://img.2"}
        ]
        self.service.send_carousel("5511999999999", "Title", items)
        
        args, kwargs = mock_post.call_args
        self.assertEqual(args[0], "https://mock.uazapi.com/send/carousel")
        
        payload = kwargs['json']
        self.assertEqual(payload['text'], "Title")
        self.assertEqual(len(payload['carousel']), 2)
        # Check defaults added
        self.assertEqual(payload['carousel'][1]['buttons'][0]['id'], "Quero agendar uma visita para ver Card 2")

    @patch('requests.post')
    def test_send_reaction(self, mock_post):
        self.service.send_reaction("5511999999999", "msg_id_10", "❤️")
        
        args, kwargs = mock_post.call_args
        self.assertEqual(args[0], "https://mock.uazapi.com/message/react")
        
        payload = kwargs['json']
        self.assertEqual(payload['text'], "❤️")
        self.assertEqual(payload['id'], "msg_id_10")

if __name__ == '__main__':
    unittest.main()
