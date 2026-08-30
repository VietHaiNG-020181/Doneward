import os
import unittest

os.environ["DONEWARD_PAIRING_TOKEN"] = "test_pairing_token_abcdefghijklmnopqrstuvwxyz012345"

from backend import server


class BackendSecurityTests(unittest.TestCase):
    def setUp(self):
        with server.RATE_LOCK:
            server.EXTRACTION_TIMESTAMPS.clear()

    def test_rejects_content_without_a_pdf_signature(self):
        with self.assertRaisesRegex(ValueError, "valid PDF signature"):
            server.extract_pdf_text(b"not a pdf")

    def test_rejects_a_malformed_pdf_without_leaking_parser_details(self):
        with self.assertRaisesRegex(ValueError, "damaged or unreadable"):
            server.extract_pdf_text(b"%PDF-broken")

    def test_pairing_token_is_long_and_url_safe(self):
        self.assertRegex(server.pairing_token(), r"^[A-Za-z0-9_-]{32,128}$")

    def test_extraction_rate_limit_closes_after_eight_attempts(self):
        self.assertTrue(all(server.consume_rate_slot(100.0) for _ in range(8)))
        self.assertFalse(server.consume_rate_slot(100.0))
        self.assertTrue(server.consume_rate_slot(100.0 + server.EXTRACTION_RATE_WINDOW_SECONDS + 1))

    def test_default_origins_are_exact_loopback_origins(self):
        self.assertEqual(
            server.ALLOWED_ORIGINS,
            frozenset({"http://localhost:3000", "http://127.0.0.1:3000"}),
        )
        self.assertNotIn("https://evil.example", server.ALLOWED_ORIGINS)

    def test_model_output_is_reduced_to_the_expected_fields(self):
        value = server.validate_extraction({
            "courseName": "Security 101",
            "ignored": "not returned",
            "tasks": [{
                "taskName": "Threat model",
                "category": "project",
                "deadline": "not-a-date",
                "html": "<script>alert(1)</script>",
            }],
        })
        self.assertEqual(value, {
            "courseName": "Security 101",
            "tasks": [{"taskName": "Threat model", "category": "project", "deadline": None}],
        })


if __name__ == "__main__":
    unittest.main()
