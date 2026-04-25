"""
Legal Guardrails: Disclaimer injection, citation enforcement, and response validation

Provides:
- Disclaimer injection
- Citation enforcement
- Confidence scoring
- Response validation
"""

import logging
import re
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


class LegalGuardrails:
    """Legal guardrails for AI responses"""

    DISCLAIMER = """
⚠️ LEGAL DISCLAIMER
This AI assistant cannot determine guilt or innocence. It provides legal analysis based on evidence and statutes.
Always verify conclusions with official sources and consult with qualified legal professionals.
"""

    STATUTE_PATTERN = r"\b(PC|PEN|CAL|USC|U\.S\.C\.)\s+(\d+(?:\.\d+)?)\b"
    CASE_PATTERN = r"\b([A-Z][a-z]+\s+v\.?\s+[A-Z][a-z]+)\b"
    EVIDENCE_PATTERN = r"\b(evidence|exhibit|document|attachment)\s+([A-Z0-9]+)\b"

    def __init__(self):
        logger.info("✅ Legal Guardrails initialized")

    async def inject_disclaimer(self, response: str) -> str:
        """Inject disclaimer at start of response"""
        try:
            return f"{self.DISCLAIMER}\n\n{response}"
        except Exception as e:
            logger.error(f"Error injecting disclaimer: {e}")
            return response

    async def enforce_citations(self, response: str) -> str:
        """Enforce citation requirements"""
        try:
            # Check if response contains citations
            has_statute = re.search(self.STATUTE_PATTERN, response)
            has_case = re.search(self.CASE_PATTERN, response)
            has_evidence = re.search(self.EVIDENCE_PATTERN, response)

            if not (has_statute or has_case or has_evidence):
                # No citations found - append warning
                warning = "\n\n⚠️ Please verify this analysis with official sources and legal references."
                return response + warning

            return response

        except Exception as e:
            logger.error(f"Error enforcing citations: {e}")
            return response

    async def score_confidence(self, response: str) -> float:
        """Score confidence of response (0-1)"""
        try:
            confidence = 0.5  # Base confidence

            # Increase confidence if citations present
            if re.search(self.STATUTE_PATTERN, response):
                confidence += 0.15
            if re.search(self.CASE_PATTERN, response):
                confidence += 0.15
            if re.search(self.EVIDENCE_PATTERN, response):
                confidence += 0.1

            # Decrease confidence if uncertain language
            uncertain_phrases = [
                "might",
                "could",
                "possibly",
                "perhaps",
                "may",
                "uncertain",
                "unclear",
            ]
            for phrase in uncertain_phrases:
                if phrase.lower() in response.lower():
                    confidence -= 0.05

            # Clamp to 0-1
            confidence = max(0.0, min(1.0, confidence))

            logger.info(f"Confidence score: {confidence:.2f}")
            return confidence

        except Exception as e:
            logger.error(f"Error scoring confidence: {e}")
            return 0.5

    async def validate_response(self, response: str) -> Tuple[bool, List[str]]:
        """Validate response for legal compliance"""
        try:
            issues = []

            # Check length
            if len(response) < 50:
                issues.append("Response too short")

            if len(response) > 5000:
                issues.append("Response too long")

            # Check for harmful content
            harmful_phrases = [
                "definitely guilty",
                "definitely innocent",
                "100% certain",
                "absolutely sure",
            ]
            for phrase in harmful_phrases:
                if phrase.lower() in response.lower():
                    issues.append(f"Harmful phrase detected: {phrase}")

            # Check for required disclaimers
            if "verify" not in response.lower() and "official" not in response.lower():
                issues.append("Missing verification language")

            is_valid = len(issues) == 0
            logger.info(f"Response validation: {'✅ Valid' if is_valid else '❌ Invalid'}")

            if issues:
                logger.warning(f"Validation issues: {issues}")

            return is_valid, issues

        except Exception as e:
            logger.error(f"Error validating response: {e}")
            return False, [str(e)]

    async def extract_citations(self, response: str) -> Dict[str, List[str]]:
        """Extract citations from response"""
        try:
            citations = {
                "statutes": [],
                "cases": [],
                "evidence": [],
            }

            # Extract statutes
            statutes = re.findall(self.STATUTE_PATTERN, response)
            citations["statutes"] = [f"{s[0]} {s[1]}" for s in statutes]

            # Extract cases
            cases = re.findall(self.CASE_PATTERN, response)
            citations["cases"] = list(set(cases))

            # Extract evidence
            evidence = re.findall(self.EVIDENCE_PATTERN, response)
            citations["evidence"] = [f"{e[0]} {e[1]}" for e in evidence]

            logger.info(f"Extracted citations: {citations}")
            return citations

        except Exception as e:
            logger.error(f"Error extracting citations: {e}")
            return {"statutes": [], "cases": [], "evidence": []}

    async def apply_guardrails(self, response: str) -> Tuple[str, Dict]:
        """Apply all guardrails to response"""
        try:
            # Validate
            is_valid, issues = await self.validate_response(response)

            if not is_valid:
                logger.warning(f"Response validation failed: {issues}")

            # Enforce citations
            response = await self.enforce_citations(response)

            # Score confidence
            confidence = await self.score_confidence(response)

            # Extract citations
            citations = await self.extract_citations(response)

            return response, {
                "valid": is_valid,
                "issues": issues,
                "confidence": confidence,
                "citations": citations,
            }

        except Exception as e:
            logger.error(f"Error applying guardrails: {e}")
            return response, {
                "valid": False,
                "issues": [str(e)],
                "confidence": 0.0,
                "citations": {},
            }


# Global guardrails instance
guardrails: Optional[LegalGuardrails] = None


async def get_guardrails() -> LegalGuardrails:
    """Get or create guardrails instance"""
    global guardrails

    if guardrails is None:
        guardrails = LegalGuardrails()

    return guardrails
