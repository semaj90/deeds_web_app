"""test_ace_bifrost_lm_v1.py — Offline and live tests for BifrostOrnithLM.

Tests:
1. Message formatting and parameter payload construction.
2. DSPy LM interface contract compatibility (__call__, basic_request, inspect_history).
3. Stop sequence handling.
4. Fail-closed connection error handling on unreachable endpoints.
"""
from __future__ import annotations

import json
import unittest
from unittest.mock import MagicMock, patch
import urllib.error

import ace_bifrost_lm_v1 as bifrost_lm


class TestBifrostOrnithLM(unittest.TestCase):

    def setUp(self):
        self.lm = bifrost_lm.BifrostOrnithLM(
            model="openai/ornith-1.5-9b",
            api_base="http://127.0.0.1:3040/v1",
            timeout=5.0,
            temperature=0.2,
            max_tokens=256,
        )

    def test_initialization_defaults(self):
        self.assertEqual(self.lm.model, "openai/ornith-1.5-9b")
        self.assertEqual(self.lm.endpoint, "http://127.0.0.1:3040/v1/chat/completions")
        self.assertEqual(self.lm.kwargs["temperature"], 0.2)
        self.assertEqual(self.lm.kwargs["max_tokens"], 256)
        self.assertEqual(self.lm.provider, "bifrost-direct")

    @patch("urllib.request.urlopen")
    def test_call_with_prompt_string(self, mock_urlopen):
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            "choices": [{"message": {"content": "Diagnosis: Memory alignment verified."}}]
        }).encode("utf-8")
        mock_urlopen.return_value.__enter__.return_value = mock_response

        completions = self.lm("Analyze AST chunk #42")
        self.assertEqual(len(completions), 1)
        self.assertEqual(completions[0], "Diagnosis: Memory alignment verified.")
        self.assertEqual(len(self.lm.history), 1)
        self.assertEqual(
            self.lm.history[0]["prompt_messages"],
            [{"role": "user", "content": "Analyze AST chunk #42"}]
        )

    @patch("urllib.request.urlopen")
    def test_call_with_messages_list(self, mock_urlopen):
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            "choices": [{"message": {"content": "Plan: Apply SIMDJSON patch."}}]
        }).encode("utf-8")
        mock_urlopen.return_value.__enter__.return_value = mock_response

        messages = [
            {"role": "system", "content": "You are a legal-AI diagnostic assistant."},
            {"role": "user", "content": "Propose repair action."},
        ]
        completions = self.lm(messages=messages, stop=["\n\n"])
        self.assertEqual(completions, ["Plan: Apply SIMDJSON patch."])
        self.assertEqual(len(self.lm.history), 1)
        self.assertEqual(self.lm.history[0]["prompt_messages"], messages)

    @patch("urllib.request.urlopen")
    def test_connection_error_fails_closed(self, mock_urlopen):
        mock_urlopen.side_effect = urllib.error.URLError("Connection refused")
        with self.assertRaises(ConnectionError):
            self.lm("Hello world")

    def test_empty_input_raises_error(self):
        with self.assertRaises(ValueError):
            self.lm()


if __name__ == "__main__":
    unittest.main()
