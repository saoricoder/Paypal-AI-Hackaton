"""
services/deal_extraction_service.py — Deal2Pay AI
Uses Google Gemini AI to extract structured deal data
from free-form natural language (text or voice transcript).
"""

from __future__ import annotations

import logging

import google.generativeai as genai

from schemas import DealCreateRequest, RuleType, ValidationRule

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

    def __init__(
        self,
        api_key: str,
        model: str = "gemini-2.5-flash",
        fallback_model: str = "gemini-3.6-flash",
    ) -> None:
        self.model = model
        self.fallback_model = fallback_model
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
            # Ask for JSON without passing Pydantic's nested schema. Pydantic v2
            # emits $defs for nested models, which the legacy Gemini SDK rejects.
            generation_config = genai.GenerationConfig(
                response_mime_type="application/json",
                temperature=0.1,  # Low temperature for deterministic extraction
            )

            prompt = f"""Extract the deal terms from this description and return only one JSON object.
Use exactly this structure:
{{
  "raw_text": "the original description",
  "client_email": "valid email address",
  "client_name": "client or company name",
  "line_items": [{{"description": "work item", "quantity": 1.0, "unit_price": 100.0}}],
  "total_amount": 100.0,
  "validation_rules": [{{"label": "Client Signature", "rule_type": "signature", "required": true}}]
}}
Each line item must include description, quantity, and unit_price. Each validation rule
must include label, rule_type (one of "checkbox", "signature", "date"), and required.
Use an empty array when there are no explicit validation rules. Return valid JSON only.

Deal description:
---
{raw_text}
---"""
            response = None
            models_to_try = [self.model]
            if self.fallback_model and self.fallback_model != self.model:
                models_to_try.append(self.fallback_model)

            for index, model_name in enumerate(models_to_try):
                model_client = self.client if model_name == self.model else genai.GenerativeModel(
                    model_name=model_name,
                    system_instruction=_SYSTEM_INSTRUCTION,
                )
                try:
                    response = await model_client.generate_content_async(
                        prompt,
                        generation_config=generation_config,
                    )
                    if index:
                        logger.info("Gemini extraction succeeded using fallback model %s", model_name)
                    break
                except Exception as exc:
                    if index == len(models_to_try) - 1 or not _is_model_not_found_error(exc):
                        raise
                    logger.warning(
                        "Gemini model %s is unavailable; retrying with fallback model %s: %s",
                        model_name,
                        models_to_try[index + 1],
                        exc,
                    )

            if response is None:
                raise RuntimeError("Gemini returned no response from the configured models.")

            # Parse and validate the response with the application model.
            deal = DealCreateRequest.model_validate_json(response.text)
            deal.raw_text = raw_text  # Preserve original text

            logger.info(
                "Deal extracted: client=%s, total=$%.2f, items=%d, rules=%d",
                deal.client_email,
                deal.total_amount,
                len(deal.line_items),
                len(deal.validation_rules),
            )

            return deal

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


def _is_model_not_found_error(error: Exception) -> bool:
    """Return true only for API errors that indicate the requested model is absent."""
    code = getattr(error, "code", None)
    if callable(code):
        try:
            code = code()
        except Exception:
            code = None
    if code == 404 or str(code) == "404":
        return True
    message = str(error).lower()
    return "model_not_found" in message or ("404" in message and "model" in message and "not found" in message)
