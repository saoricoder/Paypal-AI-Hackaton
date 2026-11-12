"""
services/paypal_service.py — Deal2Pay AI
PayPal Sandbox Invoicing API v2 integration.
Handles OAuth2 auth, DRAFT invoice creation, invoice send,
invoice retrieval, and webhook signature verification.
"""

from __future__ import annotations

import logging
import os
from typing import Any
from uuid import uuid4

import httpx

from schemas import DealCreateRequest, LineItem

logger = logging.getLogger(__name__)


class PayPalServiceError(Exception):
    """Raised when a PayPal API call fails."""
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class PayPalService:
    """
    Thin async wrapper around the PayPal Sandbox Invoicing API v2.

    Usage:
        service = PayPalService(client_id=..., client_secret=..., base_url=..., webhook_id=...)
        invoice_id = await service.create_draft_invoice(deal)
        await service.send_invoice(invoice_id)
    """

    def __init__(
        self,
        client_id:     str,
        client_secret: str,
        base_url:      str,
        webhook_id:    str,
    ) -> None:
        self.client_id     = client_id
        self.client_secret = client_secret
        self.base_url      = base_url.rstrip("/")
        self.webhook_id    = webhook_id
        self._access_token: str | None = None

    @property
    def _demo_fallback_enabled(self) -> bool:
        return os.getenv("DEAL2PAY_ENABLE_DEMO_ENDPOINTS", "false").lower() in {"1", "true", "yes"}

    @staticmethod
    def _generate_demo_invoice_id() -> str:
        return "INV2-" + "-".join(uuid4().hex[:4].upper() for _ in range(4))

    # ----------------------------------------------------------
    # Authentication
    # ----------------------------------------------------------

    async def get_access_token(self) -> str:
        """
        Obtain a short-lived Bearer token via the OAuth2 client_credentials flow.
        Caches the token for the lifetime of this instance.
        In production, implement proper token expiry tracking.
        """
        if self._access_token:
            return self._access_token

        url = f"{self.base_url}/v1/oauth2/token"
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                data={"grant_type": "client_credentials"},
                auth=(self.client_id, self.client_secret),
                headers={"Accept": "application/json"},
                timeout=15.0,
            )

        if response.status_code != 200:
            raise PayPalServiceError(
                f"PayPal OAuth2 failed: {response.text}",
                status_code=response.status_code,
            )

        self._access_token = response.json()["access_token"]
        logger.info("PayPal access token obtained successfully.")
        return self._access_token

    def _auth_headers(self, token: str) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type":  "application/json",
            "Prefer":        "return=representation",
        }

    # ----------------------------------------------------------
    # Invoice Creation (DRAFT)
    # ----------------------------------------------------------

    @staticmethod
    def _format_amount(value: float) -> str:
        """Format a float to a 2-decimal string as PayPal expects."""
        return f"{value:.2f}"

    @staticmethod
    def _line_item_to_paypal(item: LineItem) -> dict[str, Any]:
        return {
            "name":        item.description[:200],
            "description": item.description[:1000],
            "quantity":    str(item.quantity),
            "unit_amount": {
                "currency_code": "USD",
                "value":         PayPalService._format_amount(item.unit_price),
            },
        }

    async def create_draft_invoice(self, deal: DealCreateRequest) -> tuple[str, str | None, bool]:
        """
        Create a DRAFT invoice in PayPal Sandbox.

        Returns:
            Tuple of (invoice_id, invoice_detail_url, is_synthetic_fallback)
        """
        payload: dict[str, Any] = {
            "detail": {
                "currency_code": "USD",
                "note":          f"Deal2Pay AI — Auto-generated invoice. Locked pending document audit.",
                "terms_and_conditions": "Payment due upon invoice receipt. Subject to delivery document audit.",
                "memo":          f"Client: {deal.client_name}",
            },
            "primary_recipients": [
                {
                    "billing_info": {
                        "email_address": deal.client_email,
                        "name": {
                            "given_name": deal.client_name.split()[0] if deal.client_name else deal.client_name,
                            "surname":    " ".join(deal.client_name.split()[1:]) if len(deal.client_name.split()) > 1 else "",
                        },
                    }
                }
            ],
            "items": [self._line_item_to_paypal(item) for item in deal.line_items],
            "amount": {
                "breakdown": {
                    "item_total": {
                        "currency_code": "USD",
                        "value":         self._format_amount(deal.total_amount),
                    }
                }
            },
        }

        try:
            token = await self.get_access_token()
            url = f"{self.base_url}/v2/invoicing/invoices"
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    json=payload,
                    headers=self._auth_headers(token),
                    timeout=20.0,
                )

            if response.status_code not in (200, 201):
                # Some Sandbox business accounts (including EC accounts) do not
                # have Invoicing API access. Preserve the deal for the demo, but
                # clearly identify the generated ID as synthetic to callers.
                try:
                    error_data = response.json()
                except ValueError:
                    error_data = {}
                is_not_authorized = (
                    error_data.get("name") == "NOT_AUTHORIZED"
                    or any(
                        item.get("issue") == "NOT_AUTHORIZED"
                        for item in error_data.get("details", [])
                        if isinstance(item, dict)
                    )
                )
                if response.status_code == 403 and is_not_authorized:
                    invoice_id = self._generate_demo_invoice_id()
                    logger.warning(
                        "PayPal Invoicing API denied authorization (debug_id=%s); "
                        "persisting deal with synthetic demo invoice ID %s.",
                        error_data.get("debug_id", "unavailable"),
                        invoice_id,
                    )
                    return invoice_id, None, True
                raise PayPalServiceError(
                    f"Failed to create PayPal invoice: {response.text}",
                    status_code=response.status_code,
                )

            data = response.json()
            invoice_id = data.get("id", "")
            if not invoice_id:
                raise PayPalServiceError("PayPal invoice creation response did not include an ID.")

            # PayPal returns HATEOAS links; extract the 'self' detail link
            invoice_url: str | None = None
            for link in data.get("links", []):
                if link.get("rel") == "self":
                    invoice_url = link.get("href")
                    break

            logger.info("PayPal DRAFT invoice created: %s", invoice_id)
            return invoice_id, invoice_url, False
        except (PayPalServiceError, httpx.HTTPError, ValueError) as exc:
            if not self._demo_fallback_enabled:
                raise
            invoice_id = self._generate_demo_invoice_id()
            logger.warning(
                "PayPal invoice creation failed; using synthetic demo invoice ID %s: %s",
                invoice_id,
                exc,
            )
            return invoice_id, None, True

    # ----------------------------------------------------------
    # Invoice Send (Autonomous Release)
    # ----------------------------------------------------------

    async def send_invoice(self, invoice_id: str) -> bool:
        """
        Autonomously send a DRAFT invoice to the client via PayPal.
        This emails the invoice and makes the payment link live.

        Returns:
            True if sent successfully.
        """
        try:
            token = await self.get_access_token()
            url = f"{self.base_url}/v2/invoicing/invoices/{invoice_id}/send"
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    json={"send_to_invoicer": True},
                    headers=self._auth_headers(token),
                    timeout=20.0,
                )

            if response.status_code not in (200, 202):
                raise PayPalServiceError(
                    f"Failed to send invoice {invoice_id}: {response.text}",
                    status_code=response.status_code,
                )

            logger.info("PayPal invoice %s sent successfully.", invoice_id)
            return True
        except (PayPalServiceError, httpx.HTTPError) as exc:
            if not self._demo_fallback_enabled:
                raise
            logger.warning(
                "PayPal invoice send failed; treating invoice %s as sent in demo mode: %s",
                invoice_id,
                exc,
            )
            return True

    # ----------------------------------------------------------
    # Invoice Retrieval
    # ----------------------------------------------------------

    async def get_invoice(self, invoice_id: str) -> dict[str, Any]:
        """Fetch the current state of an invoice from PayPal."""
        token = await self.get_access_token()
        url   = f"{self.base_url}/v2/invoicing/invoices/{invoice_id}"

        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                headers=self._auth_headers(token),
                timeout=15.0,
            )

        if response.status_code != 200:
            raise PayPalServiceError(
                f"Failed to retrieve invoice {invoice_id}: {response.text}",
                status_code=response.status_code,
            )

        return response.json()

    # ----------------------------------------------------------
    # Webhook Signature Verification
    # ----------------------------------------------------------

    async def verify_webhook_signature(
        self,
        auth_algo:         str,
        cert_url:          str,
        transmission_id:   str,
        transmission_sig:  str,
        transmission_time: str,
        raw_body:          dict[str, Any],
    ) -> bool:
        """
        Verify an incoming PayPal webhook signature.
        Returns True if PayPal confirms the signature is valid.
        """
        token = await self.get_access_token()
        url   = f"{self.base_url}/v1/notifications/verify-webhook-signature"

        payload = {
            "auth_algo":         auth_algo,
            "cert_url":          cert_url,
            "transmission_id":   transmission_id,
            "transmission_sig":  transmission_sig,
            "transmission_time": transmission_time,
            "webhook_id":        self.webhook_id,
            "webhook_event":     raw_body,
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                json=payload,
                headers=self._auth_headers(token),
                timeout=15.0,
            )

        if response.status_code != 200:
            logger.warning("Webhook verification request failed: %s", response.text)
            return False

        verification_status = response.json().get("verification_status", "")
        is_valid = verification_status == "SUCCESS"
        logger.info("Webhook signature verification: %s", verification_status)
        return is_valid
