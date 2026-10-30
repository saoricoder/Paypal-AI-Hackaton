"""
services/deal_extraction_service.py — Deal2Pay AI
Uses Google Gemini AI (gemini-1.5-flash) to extract structured deal data
from free-form natural language (text or voice transcript).
"""

from __future__ import annotations

import json
import logging
from typing import Optional

import google.generativeai as genai

from schemas import DealCreateRequest, LineItem, RuleType, ValidationRule

logger = logging.getLogger(__name__)


# System prompt that guides the LLM to extract deal terms
_SYSTEM_INSTRUCTION = """You are a financial terms extraction agent for Deal2Pay AI.

Your task is to parse informal deal descriptions (spoken or typed) and extract 
structured invoice data. Always:
1. Identify the client's email address (look for @).
2. Extract the client's name (look for company names, "for", "with", or proper nouns near the email).
3. Break the work into individual line items with quantity and unit price.
4. Compute the total_amount as the sum of all line items (quantity × unit_price).
5. Identify document validation rules mentioned (signed work order, checkboxes, 
   signature required, date verification, etc.).

For validation_rules:
- Use rule_type "checkbox" for any checkbox, test item, or verification point.
- Use rule_type "signature" for any sign-off, signature, or approval requirement.
- Use rule_type "date" for any date or timestamp requirement.
- Always set required: true for explicitly mentioned compliance items.

If the client email is not clearly stated, use "client@example.com" as placeholder.
If the client name is not stated, use "Client" as placeholder.
If quantity is implicit (e.g. "a security review"), set quantity to 1.0.
"""


class DealExtractionService:
    """
    Wraps the Google Gemini AI client to extract structured deal data
    with type-safe JSON output matching our Pydantic schema.
    """

    def __init__(self, api_key: str, model: str = "gemini-1.5-flash") -> None:
        self.model = model
        genai.configure(api_key=api_key)
        self.client = genai.GenerativeModel(
            model_name=self.model,
            system_instruction=_SYSTEM_INSTRUCTION,
        )

    async def extract_deal_from_text(
        self,
        raw_text: str,
    ) -> DealCreateRequest:
        """
        Parse a raw deal description and return a fully validated DealCreateRequest.

        Args:
            raw_text: Free-form user input (typed text or voice transcript).

        Returns:
            DealCreateRequest: Pydantic-validated, ready for PayPal invoice creation.

        Raises:
            Exception: If extraction fails or JSON parsing fails.
        """
        logger.info("Extracting deal from text (%d chars)...", len(raw_text))

        try:
            # Configure structured output with JSON schema
            generation_config = genai.GenerationConfig(
                response_mime_type="application/json",
                response_schema=DealCreateRequest.model_json_schema(),
                temperature=0.1,  # Low temperature for deterministic extraction
            )

            response = await self.client.generate_content_async(
                f"Extract the deal terms from the following description:\n\n---\n{raw_text}\n---\n\nReturn a complete, valid DealCreateRequest JSON object.",
                generation_config=generation_config,
            )

            # Parse the JSON response
            response_text = response.text
            response_data = json.loads(response_text)

            # Create DealCreateRequest from parsed data
            deal = DealCreateRequest(**response_data)
            deal.raw_text = raw_text  # Preserve original text

            logger.info(
                "Deal extracted: client=%s, total=$%.2f, items=%d, rules=%d",
                deal.client_email,
                deal.total_amount,
                len(deal.line_items),
                len(deal.validation_rules),
            )

            return deal

        except json.JSONDecodeError as e:
            logger.error("Failed to parse Gemini JSON response: %s", e)
            raise Exception(f"Invalid JSON response from Gemini: {e}") from e
        except Exception as e:
            logger.error("Gemini extraction failed: %s", e)
            raise Exception(f"Failed to extract deal: {e}") from e

    async def validate_and_enrich(
        self,
        deal: DealCreateRequest,
    ) -> DealCreateRequest:
        """
        Post-process a DealCreateRequest to recompute total_amount from line items
        if there's a discrepancy, and ensure at least one default validation rule exists.
        """
        # Recompute total from items as a sanity check
        computed_total = round(
            sum(item.quantity * item.unit_price for item in deal.line_items), 2
        )

        if abs(computed_total - deal.total_amount) > 0.02:
            logger.warning(
                "Total mismatch: stated=%.2f computed=%.2f — using computed.",
                deal.total_amount,
                computed_total,
            )
            deal.total_amount = computed_total

        # If no validation rules were extracted, add a default signature rule
        if not deal.validation_rules:
            deal.validation_rules = [
                ValidationRule(
                    label="Client Signature",
                    rule_type=RuleType.SIGNATURE,
                    required=True,
                )
            ]

        return deal
