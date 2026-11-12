"""
main.py — Deal2Pay AI Backend
FastAPI application with all routes, CORS, and Render PostgreSQL integration.

Routes:
    GET  /health
    GET  /api/deals
    POST /api/deals/create
    POST /api/audit/verify-document
    POST /api/paypal/send-invoice/{invoice_id}
    POST /api/webhooks/paypal
"""

from __future__ import annotations

import json
import logging
import os
import io
from contextlib import asynccontextmanager
from uuid import UUID, uuid4

import psycopg2
from dotenv import load_dotenv
from fastapi import (
    FastAPI,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from PIL import Image, ImageDraw

from database import check_db_connectivity, get_db_connection, initialize_database
from schemas import (
    AuditResponse,
    AuditStatus,
    DealCreateResponse,
    ErrorResponse,
    HealthResponse,
    PaymentStatus,
    ValidationRule,
    WebhookEvent,
)
from services.audit_service import AuditService
from services.deal_extraction_service import DealExtractionService
from services.paypal_service import PayPalService, PayPalServiceError

# ============================================================
# Load environment & configure logging
# ============================================================

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

# ============================================================
# Service singletons (initialized at startup)
# ============================================================

_paypal_service:     PayPalService | None = None
_extraction_service: DealExtractionService | None = None
_audit_service:      AuditService | None = None


def get_paypal() -> PayPalService:
    if _paypal_service is None:
        raise RuntimeError("PayPalService not initialized.")
    return _paypal_service


def get_extraction() -> DealExtractionService:
    if _extraction_service is None:
        raise RuntimeError("DealExtractionService not initialized.")
    return _extraction_service


def get_audit() -> AuditService:
    if _audit_service is None:
        raise RuntimeError("AuditService not initialized.")
    return _audit_service


def require_demo_routes() -> None:
    """Keep sample audit and simulated settlement disabled outside explicit demos."""
    if os.getenv("DEAL2PAY_ENABLE_DEMO_ENDPOINTS", "false").lower() not in {"1", "true", "yes"}:
        raise HTTPException(status_code=404, detail="Demo endpoints are disabled.")


# ============================================================
# Application lifespan (startup / shutdown)
# ============================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _paypal_service, _extraction_service, _audit_service

    logger.info("Deal2Pay AI backend starting up...")

    # Validate required environment variables
    required_vars = [
        "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET",
        "GEMINI_API_KEY", "DATABASE_URL",
    ]
    missing = [v for v in required_vars if not os.getenv(v)]
    if missing:
        logger.warning(
            "Missing environment variables: %s — some features will be disabled.",
            missing,
        )

    # Initialize domain services
    _paypal_service = PayPalService(
        client_id=os.getenv("PAYPAL_CLIENT_ID", ""),
        client_secret=os.getenv("PAYPAL_CLIENT_SECRET", ""),
        base_url=os.getenv("PAYPAL_BASE_URL", "https://api-m.sandbox.paypal.com"),
        webhook_id=os.getenv("PAYPAL_WEBHOOK_ID", ""),
    )

    configured_gemini_model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    if configured_gemini_model.endswith("1.5-flash"):
        logger.warning("Ignoring retired Gemini model setting; using gemini-2.5-flash.")
        configured_gemini_model = "gemini-2.5-flash"

    _extraction_service = DealExtractionService(
        api_key=os.getenv("GEMINI_API_KEY", ""),
        model=configured_gemini_model,
        fallback_model=os.getenv("GEMINI_FALLBACK_MODEL", "gemini-3.6-flash"),
    )

    _audit_service = AuditService()

    # Create missing tables before serving any API requests, then verify access.
    schema_ok = initialize_database()
    if not schema_ok:
        logger.warning("Database schema initialization failed; database-backed routes may return errors.")

    db_ok = check_db_connectivity()
    if db_ok:
        logger.info("PostgreSQL (Render) connection verified successfully.")
    else:
        logger.warning(
            "PostgreSQL connectivity check failed. "
            "Ensure DATABASE_URL is set and database/schema.sql has been applied."
        )

    logger.info("All services initialized. Deal2Pay AI is ready.")
    yield

    logger.info("Deal2Pay AI backend shutting down.")


# ============================================================
# FastAPI app
# ============================================================

app = FastAPI(
    title="Deal2Pay AI",
    description="Autonomous Deal-to-Invoice & Audit Agent — PayPal AI Hackathon 2026",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow frontend origin(s)
configured_origins = [o.strip() for o in os.getenv("FRONTEND_ORIGIN", "").split(",") if o.strip()]
origins = list(dict.fromkeys([
    "https://deal2pay-frontend.onrender.com",
    "http://localhost:3000",
    *configured_origins,
]))
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# Exception handlers
# ============================================================

@app.exception_handler(PayPalServiceError)
async def paypal_error_handler(request: Request, exc: PayPalServiceError):
    logger.error("PayPal error: %s", exc)
    return JSONResponse(
        status_code=exc.status_code or 502,
        content={"detail": str(exc), "code": "PAYPAL_ERROR"},
    )


# ============================================================
# Route: Health Check
# ============================================================

@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health_check():
    """Liveness probe for Render deployment."""
    return HealthResponse()


# ============================================================
# Route: List All Deals
# ============================================================

@app.get("/api/deals", tags=["Deals"])
async def list_deals():
    """
    Return all deals from the PostgreSQL database, ordered by creation date
    descending. Consumed by the AG Grid dashboard via SWR polling.
    """
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    id, raw_text, client_email, client_name,
                    line_items, total_amount, validation_rules,
                    paypal_invoice_id, paypal_invoice_url,
                    audit_status, payment_status,
                    created_at, updated_at
                FROM deals
                ORDER BY created_at DESC;
                """
            )
            rows = cur.fetchall()
        # RealDictCursor returns dict-like rows; convert to plain dicts for JSON
        deals = [dict(row) for row in rows]
        return {"deals": deals}
    except psycopg2.Error as exc:
        logger.error("DB error fetching deals: %s", exc)
        raise HTTPException(status_code=500, detail="Database error while fetching deals.")
    finally:
        conn.close()


# ============================================================
# Route: Create Deal + PayPal DRAFT Invoice
# ============================================================

class CreateDealBody(BaseModel):
    raw_text: str


@app.post(
    "/api/deals/create",
    response_model=DealCreateResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Deals"],
)
async def create_deal(body: CreateDealBody):
    """
    1. Extract structured deal from raw_text via Gemini AI.
    2. Create a DRAFT invoice in PayPal Sandbox.
    3. Persist the deal in PostgreSQL with status DRAFT_LOCKED.
    4. Return deal_id + paypal_invoice_id.
    """
    extraction = get_extraction()
    paypal     = get_paypal()

    # Step 1 — LLM extraction
    try:
        deal = await extraction.extract_deal_from_text(body.raw_text)
        deal = await extraction.validate_and_enrich(deal)
    except Exception as exc:
        logger.exception("Deal extraction failed: %s", exc)
        raise HTTPException(
            status_code=422,
            detail=f"Could not extract deal terms from the provided text: {exc}",
        )

    # Step 2 — Create PayPal DRAFT invoice
    try:
        invoice_id, invoice_url, invoice_is_fallback = await paypal.create_draft_invoice(deal)
    except PayPalServiceError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"PayPal invoice creation failed: {exc}",
        )

    # Step 3 — Persist to PostgreSQL
    deal_id = str(uuid4())

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO deals (
                    id, raw_text, client_email, client_name,
                    line_items, total_amount, validation_rules,
                    paypal_invoice_id, paypal_invoice_url,
                    audit_status, payment_status
                ) VALUES (
                    %s, %s, %s, %s,
                    %s::jsonb, %s, %s::jsonb,
                    %s, %s,
                    %s, %s
                )
                RETURNING id, paypal_invoice_id, paypal_invoice_url, payment_status;
                """,
                (
                    deal_id,
                    deal.raw_text,
                    deal.client_email,
                    deal.client_name,
                    json.dumps([item.model_dump() for item in deal.line_items]),
                    deal.total_amount,
                    json.dumps([r.model_dump() for r in deal.validation_rules]),
                    invoice_id,
                    invoice_url,
                    AuditStatus.PENDING.value,
                    PaymentStatus.DRAFT_LOCKED.value,
                ),
            )
            conn.commit()

    except psycopg2.Error as exc:
        conn.rollback()
        logger.error("DB error inserting deal %s: %s", deal_id, exc)
        raise HTTPException(status_code=500, detail="Database error while saving deal.")
    finally:
        conn.close()

    logger.info("Deal %s created with PayPal invoice %s", deal_id, invoice_id)

    return DealCreateResponse(
        deal_id=UUID(deal_id),
        paypal_invoice_id=invoice_id,
        paypal_invoice_url=invoice_url,
        payment_status=PaymentStatus.DRAFT_LOCKED,
        paypal_invoice_is_fallback=invoice_is_fallback,
        message=(
            "Deal saved with a synthetic demo invoice ID; PayPal did not create an invoice."
            if invoice_is_fallback
            else "Deal created and PayPal DRAFT invoice generated. Locked pending audit."
        ),
    )


# ============================================================
# Route: Audit Document Upload
# ============================================================

@app.post(
    "/api/audit/verify-document",
    response_model=AuditResponse,
    tags=["Audit"],
)
async def verify_document(
    deal_id: str = Form(...),
    file:    UploadFile = File(..., description="PDF delivery document"),
):
    """
    1. Accept a multipart PDF upload.
    2. Fetch the deal's validation rules from PostgreSQL.
    3. Run OpenCV detection pipeline.
    4. Update deal audit_status in PostgreSQL.
    5. Insert an audit_log record.
    6. Return AuditResponse with bounding boxes and reasoning log.
    """
    audit = get_audit()

    # Validate file type
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    # Read PDF bytes
    pdf_bytes = await file.read()
    if len(pdf_bytes) < 100:
        raise HTTPException(status_code=400, detail="Uploaded file appears to be empty or corrupt.")

    # --- Fetch deal & validation rules ---
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, validation_rules FROM deals WHERE id = %s;",
                (deal_id,),
            )
            deal_row = cur.fetchone()

        if not deal_row:
            raise HTTPException(status_code=404, detail=f"Deal {deal_id} not found.")

        raw_rules = deal_row["validation_rules"] or []
        # PostgreSQL JSONB is already deserialized by psycopg2 → list of dicts
        if isinstance(raw_rules, str):
            raw_rules = json.loads(raw_rules)
        validation_rules = [ValidationRule(**r) for r in raw_rules]

        # Mark audit as IN_PROGRESS
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE deals SET audit_status = %s, updated_at = NOW() WHERE id = %s;",
                (AuditStatus.IN_PROGRESS.value, deal_id),
            )
        conn.commit()
    except HTTPException:
        raise
    except psycopg2.Error as exc:
        logger.error("DB error fetching deal %s: %s", deal_id, exc)
        raise HTTPException(status_code=500, detail="Database error while fetching deal.")
    finally:
        conn.close()

    # --- Run OpenCV audit ---
    try:
        audit_result = audit.analyze_document(
            pdf_bytes=pdf_bytes,
            validation_rules=validation_rules,
            deal_id=deal_id,
        )
    except Exception as exc:
        logger.exception("Audit analysis failed: %s", exc)
        # Mark deal as FAILED before re-raising
        _update_audit_status(deal_id, AuditStatus.FAILED)
        raise HTTPException(status_code=500, detail=f"Audit engine error: {exc}")

    # --- Persist audit results ---
    new_audit_status = AuditStatus.APPROVED if audit_result.overall_pass else AuditStatus.FAILED

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Update deal audit_status
            cur.execute(
                "UPDATE deals SET audit_status = %s, updated_at = NOW() WHERE id = %s;",
                (new_audit_status.value, deal_id),
            )
            # Insert audit log record
            cur.execute(
                """
                INSERT INTO audit_logs (
                    deal_id, overall_pass, bounding_boxes, reasoning_log
                ) VALUES (%s, %s, %s::jsonb, %s::jsonb);
                """,
                (
                    deal_id,
                    audit_result.overall_pass,
                    json.dumps([b.model_dump() for b in audit_result.bounding_boxes]),
                    json.dumps(audit_result.reasoning_log),
                ),
            )
        conn.commit()
    except psycopg2.Error as exc:
        conn.rollback()
        logger.error("DB error saving audit result for deal %s: %s", deal_id, exc)
        # Non-fatal: audit ran successfully, just log the persistence failure
    finally:
        conn.close()

    logger.info(
        "Audit complete for deal %s: %s",
        deal_id,
        "PASSED" if audit_result.overall_pass else "FAILED",
    )
    return audit_result


def _update_audit_status(deal_id: str, new_status: AuditStatus) -> None:
    """Best-effort helper to update audit_status without raising."""
    try:
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE deals SET audit_status = %s, updated_at = NOW() WHERE id = %s;",
                    (new_status.value, deal_id),
                )
            conn.commit()
        finally:
            conn.close()
    except Exception as exc:
        logger.warning("Could not update audit_status for deal %s: %s", deal_id, exc)


@app.post("/api/audit/verify-sample/{deal_id}", response_model=AuditResponse, tags=["Audit", "Demo"])
async def verify_sample_document(deal_id: str):
    """Generate a signed sample PDF in memory and run the real OpenCV audit on it.

    This endpoint is available only when DEAL2PAY_ENABLE_DEMO_ENDPOINTS is enabled.
    """
    require_demo_routes()
    try:
        deal_uuid = UUID(deal_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid deal ID.")

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT validation_rules FROM deals WHERE id = %s;", (str(deal_uuid),))
            row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Deal not found.")
        raw_rules = row["validation_rules"] or []
        if isinstance(raw_rules, str):
            raw_rules = json.loads(raw_rules)
        rules = [ValidationRule(**rule) for rule in raw_rules]
    except psycopg2.Error as exc:
        logger.exception("Could not load demo audit rules for %s", deal_id)
        raise HTTPException(status_code=500, detail="Database error while preparing sample audit.") from exc
    finally:
        conn.close()

    # Build a simple signed delivery form without a filesystem asset. The image is
    # converted to PDF in memory, then passed through the same OpenCV analyzer used
    # by uploaded documents.
    image = Image.new("RGB", (1000, 1400), "white")
    draw = ImageDraw.Draw(image)
    draw.text((80, 70), "DEAL2PAY — DELIVERY ACCEPTANCE", fill="black")
    draw.text((80, 130), "Sample signed delivery document", fill="black")
    draw.text((80, 205), "Date: 2026-11-11", fill="black")
    checkbox_index = 0
    for rule in rules:
        if rule.rule_type.value == "checkbox":
            y = 300 + checkbox_index * 90
            draw.rectangle((82, y, 100, y + 18), outline="black", width=3)
            draw.line((85, y + 9, 90, y + 15, 98, y + 2), fill="black", width=3)
            draw.text((125, y + 1), rule.label[:70], fill="black")
            checkbox_index += 1
    draw.text((80, 1080), "Authorized signature", fill="black")
    signature_points = [(90, 1210), (140, 1165), (180, 1240), (235, 1150), (265, 1210), (320, 1170), (370, 1215), (430, 1160), (490, 1210), (545, 1175), (610, 1220), (680, 1160)]
    draw.line(signature_points, fill="black", width=5, joint="curve")
    sample_pdf = io.BytesIO()
    image.save(sample_pdf, format="PDF", resolution=150)

    audit_result = get_audit().analyze_document(
        pdf_bytes=sample_pdf.getvalue(), validation_rules=rules, deal_id=str(deal_uuid)
    )
    new_status = AuditStatus.APPROVED if audit_result.overall_pass else AuditStatus.FAILED
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE deals SET audit_status = %s, updated_at = NOW() WHERE id = %s;", (new_status.value, str(deal_uuid)))
            cur.execute(
                "INSERT INTO audit_logs (deal_id, overall_pass, bounding_boxes, reasoning_log) VALUES (%s, %s, %s::jsonb, %s::jsonb);",
                (str(deal_uuid), audit_result.overall_pass,
                 json.dumps([box.model_dump() for box in audit_result.bounding_boxes]),
                 json.dumps(audit_result.reasoning_log)),
            )
        conn.commit()
    except psycopg2.Error as exc:
        conn.rollback()
        logger.exception("Could not persist demo audit for %s", deal_id)
        raise HTTPException(status_code=500, detail="Could not save sample audit result.") from exc
    finally:
        conn.close()
    if not audit_result.overall_pass:
        raise HTTPException(status_code=422, detail="The generated sample document did not pass OpenCV validation.")
    return audit_result


@app.post("/api/webhooks/simulate-payment/{deal_id}", tags=["Demo", "Webhooks"])
async def simulate_payment_settlement(deal_id: str):
    """Apply the internal payment transition for a demo; does not call PayPal."""
    require_demo_routes()
    try:
        deal_uuid = str(UUID(deal_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid deal ID.")
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT audit_status, paypal_invoice_id FROM deals WHERE id = %s;", (deal_uuid,))
            deal = cur.fetchone()
            if not deal:
                raise HTTPException(status_code=404, detail="Deal not found.")
            if deal["audit_status"] != AuditStatus.APPROVED.value:
                raise HTTPException(status_code=409, detail="Payment simulation requires an approved audit.")
            if not deal["paypal_invoice_id"]:
                raise HTTPException(status_code=409, detail="Deal has no PayPal invoice to settle.")
            cur.execute(
                "UPDATE deals SET payment_status = %s, updated_at = NOW() WHERE id = %s;",
                (PaymentStatus.PAID.value, deal_uuid),
            )
        conn.commit()
    except psycopg2.Error as exc:
        conn.rollback()
        logger.exception("Could not simulate payment for %s", deal_uuid)
        raise HTTPException(status_code=500, detail="Could not apply demo payment settlement.") from exc
    finally:
        conn.close()
    logger.info("Demo payment settlement applied for deal %s", deal_uuid)
    return {"deal_id": deal_uuid, "event_type": "INVOICING.INVOICE.PAID", "payment_status": PaymentStatus.PAID.value, "simulated": True}


# ============================================================
# Route: Autonomous Invoice Send
# ============================================================

@app.post(
    "/api/paypal/send-invoice/{invoice_id}",
    tags=["PayPal"],
)
async def send_invoice(invoice_id: str, deal_id: str):
    """
    Autonomously send a PayPal DRAFT invoice to the client.
    Only allowed when audit_status == APPROVED.
    Updates payment_status to SENT on success.
    """
    paypal = get_paypal()

    # Verify deal exists and audit is approved
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT audit_status, payment_status
                FROM deals
                WHERE paypal_invoice_id = %s;
                """,
                (invoice_id,),
            )
            deal_row = cur.fetchone()
    except psycopg2.Error as exc:
        logger.error("DB error checking deal for invoice %s: %s", invoice_id, exc)
        raise HTTPException(status_code=500, detail="Database error.")
    finally:
        conn.close()

    if not deal_row:
        raise HTTPException(status_code=404, detail="Deal not found for this invoice ID.")

    audit_status = deal_row["audit_status"]
    if audit_status != AuditStatus.APPROVED.value:
        raise HTTPException(
            status_code=403,
            detail=(
                f"Invoice cannot be sent. Audit status is '{audit_status}'. "
                "Document must be APPROVED before release."
            ),
        )

    # Send via PayPal API
    try:
        await paypal.send_invoice(invoice_id)
    except PayPalServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    # Update payment_status to SENT
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE deals
                SET payment_status = %s, updated_at = NOW()
                WHERE paypal_invoice_id = %s;
                """,
                (PaymentStatus.SENT.value, invoice_id),
            )
        conn.commit()
    except psycopg2.Error as exc:
        conn.rollback()
        logger.error("DB error updating payment_status for invoice %s: %s", invoice_id, exc)
    finally:
        conn.close()

    logger.info("Invoice %s sent autonomously.", invoice_id)
    return {
        "message": f"Invoice {invoice_id} sent successfully.",
        "payment_status": PaymentStatus.SENT.value,
    }


# ============================================================
# Route: PayPal Webhook Listener
# ============================================================

@app.post("/api/webhooks/paypal", tags=["Webhooks"])
async def paypal_webhook(request: Request):
    """
    Receives and verifies PayPal webhook events.
    On INVOICING.INVOICE.PAID → updates deal payment_status to PAID.

    Configure in PayPal Developer Dashboard:
      URL: https://<your-ngrok>.ngrok.io/api/webhooks/paypal
      Events: INVOICING.INVOICE.PAID
    """
    paypal = get_paypal()

    raw_body_bytes = await request.body()

    # Verify signature using PayPal headers
    is_valid = await paypal.verify_webhook_signature(
        auth_algo=request.headers.get("PAYPAL-AUTH-ALGO", ""),
        cert_url=request.headers.get("PAYPAL-CERT-URL", ""),
        transmission_id=request.headers.get("PAYPAL-TRANSMISSION-ID", ""),
        transmission_sig=request.headers.get("PAYPAL-TRANSMISSION-SIG", ""),
        transmission_time=request.headers.get("PAYPAL-TRANSMISSION-TIME", ""),
        raw_body=json.loads(raw_body_bytes),
    )

    if not is_valid:
        logger.warning("Received webhook with invalid signature — rejecting.")
        raise HTTPException(status_code=401, detail="Invalid webhook signature.")

    event_data = json.loads(raw_body_bytes)
    event_type = event_data.get("event_type", "")
    logger.info("PayPal webhook received: %s", event_type)

    if event_type == "INVOICING.INVOICE.PAID":
        resource   = event_data.get("resource", {})
        invoice_id = resource.get("id", "")

        if invoice_id:
            conn = get_db_connection()
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        UPDATE deals
                        SET payment_status = %s, updated_at = NOW()
                        WHERE paypal_invoice_id = %s;
                        """,
                        (PaymentStatus.PAID.value, invoice_id),
                    )
                conn.commit()
                logger.info("Deal updated to PAID for invoice %s", invoice_id)
            except psycopg2.Error as exc:
                conn.rollback()
                logger.error(
                    "DB error marking invoice %s as PAID: %s", invoice_id, exc
                )
            finally:
                conn.close()

    return {"received": True, "event_type": event_type}
