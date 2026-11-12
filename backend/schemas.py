"""
schemas.py — Deal2Pay AI
All Pydantic v2 models. Every other module imports from here.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator


# ============================================================
# Enumerations
# ============================================================

class AuditStatus(str, Enum):
    PENDING     = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    APPROVED    = "APPROVED"
    FAILED      = "FAILED"


class PaymentStatus(str, Enum):
    DRAFT        = "DRAFT"
    DRAFT_LOCKED = "DRAFT_LOCKED"
    SENT         = "SENT"
    PAID         = "PAID"
    CANCELLED    = "CANCELLED"


class RuleType(str, Enum):
    CHECKBOX  = "checkbox"
    SIGNATURE = "signature"
    DATE      = "date"


# ============================================================
# Deal / Contract Models
# ============================================================

class LineItem(BaseModel):
    """A single billable line on the invoice."""
    description: str = Field(..., min_length=1, max_length=256)
    quantity:    float = Field(..., gt=0)
    unit_price:  float = Field(..., gt=0)

    @property
    def total(self) -> float:
        return round(self.quantity * self.unit_price, 2)


class ValidationRule(BaseModel):
    """A document compliance requirement the audit agent must verify."""
    label:     str      = Field(..., description="Human-readable description, e.g. 'Checkbox 1: Tests completed'")
    rule_type: RuleType = Field(..., description="The type of element to detect in the PDF")
    required:  bool     = Field(default=True)


class DealCreateRequest(BaseModel):
    """
    Structured output produced by Gemini AI from raw deal text.
    Also accepted directly by the /api/deals/create endpoint.
    """
    raw_text:         str             = Field(..., description="Original user text or voice transcript")
    client_email:     EmailStr        = Field(..., description="Recipient email for the PayPal invoice")
    client_name:      str             = Field(..., min_length=1)
    line_items:       list[LineItem]  = Field(..., min_length=1)
    total_amount:     float           = Field(..., gt=0, description="Total invoice amount in USD")
    validation_rules: list[ValidationRule] = Field(
        default_factory=list,
        description="Compliance rules the delivery document must satisfy"
    )


class DealRecord(BaseModel):
    """Full deal record as stored in PostgreSQL and returned by GET /api/deals."""
    id:                UUID
    raw_text:          str
    client_email:      str
    client_name:       str
    line_items:        list[LineItem]
    total_amount:      float
    validation_rules:  list[ValidationRule]
    paypal_invoice_id: str | None        = None
    paypal_invoice_url: str | None       = None
    audit_status:      AuditStatus       = AuditStatus.PENDING
    payment_status:    PaymentStatus     = PaymentStatus.DRAFT
    created_at:        datetime
    updated_at:        datetime

    class Config:
        from_attributes = True


class DealCreateResponse(BaseModel):
    """Response returned after successfully creating a deal + PayPal DRAFT invoice."""
    deal_id:           UUID
    paypal_invoice_id: str
    paypal_invoice_url: str | None = None
    paypal_invoice_is_fallback: bool = False
    payment_status:    PaymentStatus = PaymentStatus.DRAFT_LOCKED
    message:           str = "Deal created and PayPal DRAFT invoice generated. Locked pending audit."


# ============================================================
# Audit / Computer Vision Models
# ============================================================

class BoundingBox(BaseModel):
    """
    A detected element in the PDF, with coordinates as percentages (0–100)
    relative to the full page dimensions. Ready for CSS absolute positioning.
    """
    label:         str   = Field(..., description="e.g. 'Checkbox 1', 'Client Signature'")
    x_percent:     float = Field(..., ge=0, le=100)
    y_percent:     float = Field(..., ge=0, le=100)
    width_percent: float = Field(..., ge=0, le=100)
    height_percent: float = Field(..., ge=0, le=100)
    is_valid:      bool  = Field(..., description="True if the element is present and valid")
    confidence:    float = Field(..., ge=0.0, le=1.0, description="Detection confidence 0.0–1.0")
    rule_type:     RuleType


class AuditResponse(BaseModel):
    """Full result of an OpenCV document audit."""
    deal_id:       str
    overall_pass:  bool                = Field(..., description="True only if ALL required rules pass")
    bounding_boxes: list[BoundingBox]  = Field(default_factory=list)
    reasoning_log: list[str]           = Field(
        default_factory=list,
        description="Human-readable agent reasoning lines for the ReasoningTerminal"
    )
    failed_rules:  list[str]           = Field(default_factory=list)


class AuditLogRecord(BaseModel):
    """Audit log entry as stored in the PostgreSQL audit_logs table."""
    id:               UUID
    deal_id:          UUID
    pdf_storage_path: str | None
    overall_pass:     bool
    bounding_boxes:   list[BoundingBox]
    reasoning_log:    list[str]
    created_at:       datetime

    class Config:
        from_attributes = True


# ============================================================
# PayPal API Models
# ============================================================

class PayPalTokenResponse(BaseModel):
    access_token: str
    token_type:   str
    expires_in:   int


class PayPalLineItem(BaseModel):
    """PayPal-formatted line item for invoice creation."""
    name:        str
    description: str | None = None
    quantity:    str                    # PayPal expects string
    unit_amount: dict[str, Any]         # {"currency_code": "USD", "value": "45.00"}


class PayPalInvoicePayload(BaseModel):
    """Payload for POST /v2/invoicing/invoices (simplified)."""
    detail:    dict[str, Any]
    invoicer:  dict[str, Any]
    primary_recipients: list[dict[str, Any]]
    items:     list[dict[str, Any]]
    amount:    dict[str, Any]


class WebhookEvent(BaseModel):
    """Incoming PayPal webhook event envelope."""
    id:            str
    event_type:    str
    event_version: str | None = None
    resource_type: str
    resource:      dict[str, Any]
    summary:       str | None = None
    create_time:   str | None = None


class WebhookVerificationRequest(BaseModel):
    """Body for POST /v1/notifications/verify-webhook-signature."""
    auth_algo:         str
    cert_url:          str
    transmission_id:   str
    transmission_sig:  str
    transmission_time: str
    webhook_id:        str
    webhook_event:     dict[str, Any]


# ============================================================
# Generic API Responses
# ============================================================

class HealthResponse(BaseModel):
    status:  str = "ok"
    version: str = "1.0.0"
    service: str = "Deal2Pay AI Backend"


class ErrorResponse(BaseModel):
    detail:  str
    code:    str | None = None
