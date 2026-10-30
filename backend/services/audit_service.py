"""
services/audit_service.py — Deal2Pay AI
Computer vision pipeline using OpenCV + pdf2image.
Detects checkboxes (with fill analysis) and signatures in PDF delivery documents.
Returns bounding boxes as percentage coordinates for frontend overlay rendering.
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass
from typing import NamedTuple

import cv2
import numpy as np
from pdf2image import convert_from_bytes
from PIL import Image

from schemas import AuditResponse, BoundingBox, RuleType, ValidationRule

logger = logging.getLogger(__name__)


# ============================================================
# Internal data structures
# ============================================================

@dataclass
class DetectedRegion:
    x: int
    y: int
    w: int
    h: int
    confidence: float
    label: str
    rule_type: RuleType


class PageDimensions(NamedTuple):
    width: int
    height: int


# ============================================================
# Audit Service
# ============================================================

class AuditService:
    """
    Runs a multi-stage OpenCV pipeline on a PDF delivery document to verify:
    1. Checkbox presence and fill (is it marked [X]?)
    2. Signature ink blob presence in the expected page region
    3. Date text presence (basic contour heuristic)

    All spatial results are normalized to percentage coordinates (0–100)
    so the frontend can apply them directly as CSS `left`, `top`, etc.
    """

    # Tuning constants
    CHECKBOX_MIN_AREA   = 150     # px² — ignore tiny noise squares
    CHECKBOX_MAX_AREA   = 3500    # px² — ignore large section boxes
    CHECKBOX_ASPECT_LO  = 0.65    # min width/height ratio for a "square"
    CHECKBOX_ASPECT_HI  = 1.45    # max width/height ratio for a "square"
    CHECKBOX_FILL_THRESH = 0.12   # ink pixel density > this → checked [X]
    SIGNATURE_MIN_AREA  = 400     # px² — minimum ink blob for a signature
    SIGNATURE_ZONE_Y    = 0.65    # signatures are expected below 65% of page height

    def __init__(self) -> None:
        pass

    # ----------------------------------------------------------
    # Public entry point
    # ----------------------------------------------------------

    def analyze_document(
        self,
        pdf_bytes:        bytes,
        validation_rules: list[ValidationRule],
        deal_id:          str = "",
    ) -> AuditResponse:
        """
        Main entry point. Converts the first PDF page to an image and
        runs the full detection pipeline against the provided validation rules.

        Args:
            pdf_bytes:        Raw PDF bytes from the uploaded file.
            validation_rules: Rules extracted from the deal (checkbox, signature, date).
            deal_id:          Deal UUID for response tagging.

        Returns:
            AuditResponse with per-element bounding boxes and a reasoning log.
        """
        reasoning: list[str] = []
        reasoning.append("◉ Initializing Deal2Pay AI audit engine...")

        # Step 1 — Rasterize PDF to image
        try:
            image_pil = self._pdf_to_image(pdf_bytes)
            reasoning.append("✓ PDF rasterized successfully (300 DPI, page 1).")
        except Exception as exc:
            logger.exception("PDF rasterization failed: %s", exc)
            reasoning.append(f"✗ PDF rasterization failed: {exc}")
            return AuditResponse(
                deal_id=deal_id,
                overall_pass=False,
                bounding_boxes=[],
                reasoning_log=reasoning,
                failed_rules=[r.label for r in validation_rules if r.required],
            )

        # Step 2 — Convert PIL image to OpenCV BGR array
        image_cv = cv2.cvtColor(np.array(image_pil), cv2.COLOR_RGB2BGR)
        dims = PageDimensions(width=image_cv.shape[1], height=image_cv.shape[0])
        reasoning.append(f"◉ Page dimensions: {dims.width}×{dims.height}px")

        # Step 3 — Run detectors per rule type
        checkbox_rules  = [r for r in validation_rules if r.rule_type == RuleType.CHECKBOX]
        signature_rules = [r for r in validation_rules if r.rule_type == RuleType.SIGNATURE]
        date_rules      = [r for r in validation_rules if r.rule_type == RuleType.DATE]

        bounding_boxes: list[BoundingBox] = []

        # --- Checkbox detection ---
        if checkbox_rules:
            reasoning.append(f"◉ Scanning for {len(checkbox_rules)} checkbox(es)...")
            detected_boxes = self._detect_checkboxes(image_cv, dims)
            reasoning.append(
                f"◉ Found {len(detected_boxes)} candidate square region(s) in document."
            )
            boxes, logs = self._match_checkboxes_to_rules(
                detected_boxes, checkbox_rules, dims
            )
            bounding_boxes.extend(boxes)
            reasoning.extend(logs)

        # --- Signature detection ---
        if signature_rules:
            reasoning.append("◉ Scanning for signature ink blobs...")
            sig_boxes, sig_logs = self._detect_signatures(
                image_cv, dims, signature_rules
            )
            bounding_boxes.extend(sig_boxes)
            reasoning.extend(sig_logs)

        # --- Date detection (contour heuristic) ---
        if date_rules:
            reasoning.append("◉ Scanning for date fields...")
            date_boxes, date_logs = self._detect_dates(image_cv, dims, date_rules)
            bounding_boxes.extend(date_boxes)
            reasoning.extend(date_logs)

        # Step 4 — Determine overall pass/fail
        required_boxes  = [b for b in bounding_boxes if True]  # All rules are required
        failed_labels   = [b.label for b in bounding_boxes if not b.is_valid]
        overall_pass    = len(failed_labels) == 0 and len(bounding_boxes) > 0

        if overall_pass:
            reasoning.append(
                f"✓ AUDIT PASSED — All {len(bounding_boxes)} required element(s) verified."
            )
            reasoning.append("✓ Invoice is cleared for autonomous release.")
        else:
            reasoning.append(
                f"✗ AUDIT FAILED — {len(failed_labels)} unresolved issue(s): "
                + ", ".join(failed_labels)
            )
            reasoning.append("✗ Invoice remains locked. Upload a compliant document.")

        return AuditResponse(
            deal_id=deal_id,
            overall_pass=overall_pass,
            bounding_boxes=bounding_boxes,
            reasoning_log=reasoning,
            failed_rules=failed_labels,
        )

    # ----------------------------------------------------------
    # PDF → PIL Image
    # ----------------------------------------------------------

    def _pdf_to_image(self, pdf_bytes: bytes) -> Image.Image:
        """Convert the first page of a PDF to a PIL Image at 300 DPI."""
        pages = convert_from_bytes(pdf_bytes, dpi=300, first_page=1, last_page=1)
        if not pages:
            raise ValueError("pdf2image returned no pages.")
        return pages[0]

    # ----------------------------------------------------------
    # Checkbox Detection
    # ----------------------------------------------------------

    def _detect_checkboxes(
        self, image: np.ndarray, dims: PageDimensions
    ) -> list[DetectedRegion]:
        """
        Find all square-ish contours in the image that could be checkboxes.
        Returns a list of detected regions sorted by vertical position (top → bottom).
        """
        gray      = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        blurred   = cv2.GaussianBlur(gray, (3, 3), 0)
        _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

        contours, _ = cv2.findContours(thresh, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

        candidates: list[DetectedRegion] = []
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if not (self.CHECKBOX_MIN_AREA < area < self.CHECKBOX_MAX_AREA):
                continue

            x, y, w, h = cv2.boundingRect(cnt)
            aspect = w / h if h > 0 else 0
            if not (self.CHECKBOX_ASPECT_LO < aspect < self.CHECKBOX_ASPECT_HI):
                continue

            # Measure fill density inside the bounding box
            roi          = thresh[y : y + h, x : x + w]
            fill_density = np.count_nonzero(roi) / (w * h) if (w * h) > 0 else 0
            is_checked   = fill_density > self.CHECKBOX_FILL_THRESH
            confidence   = min(fill_density / 0.5, 1.0)  # Normalized confidence

            candidates.append(DetectedRegion(
                x=x, y=y, w=w, h=h,
                confidence=round(confidence, 3),
                label="_candidate",
                rule_type=RuleType.CHECKBOX,
            ))

        # Sort top-to-bottom
        candidates.sort(key=lambda r: r.y)
        return candidates

    def _match_checkboxes_to_rules(
        self,
        detected:   list[DetectedRegion],
        rules:      list[ValidationRule],
        dims:       PageDimensions,
    ) -> tuple[list[BoundingBox], list[str]]:
        """
        Match detected checkbox candidates to validation rules (by order found).
        If fewer checkboxes found than rules, remaining rules are marked as missing.
        """
        boxes: list[BoundingBox] = []
        logs:  list[str]         = []

        # Re-analyze each detected candidate to determine if it's checked
        # (we re-run here because DetectedRegion doesn't carry the image)
        # In practice, confidence > CHECKBOX_FILL_THRESH means checked.
        for i, rule in enumerate(rules):
            if i < len(detected):
                region = detected[i]
                # Confidence encodes fill density; > threshold means checked
                is_valid   = region.confidence > (self.CHECKBOX_FILL_THRESH / 0.5)
                fill_pct   = round(region.confidence * 50, 1)  # Back-convert approx
                status_glyph = "✓" if is_valid else "✗"
                logs.append(
                    f"{status_glyph} {rule.label}: detected at "
                    f"({region.x_pct(dims):.1f}%, {region.y_pct(dims):.1f}%) — "
                    f"fill density ≈{fill_pct:.0f}% → {'CHECKED' if is_valid else 'EMPTY'}"
                )
                boxes.append(BoundingBox(
                    label=rule.label,
                    x_percent=region.x_pct(dims),
                    y_percent=region.y_pct(dims),
                    width_percent=region.w_pct(dims),
                    height_percent=region.h_pct(dims),
                    is_valid=is_valid,
                    confidence=region.confidence,
                    rule_type=RuleType.CHECKBOX,
                ))
            else:
                # Rule required but no checkbox found at this index
                logs.append(f"✗ {rule.label}: No checkbox detected — MISSING")
                boxes.append(BoundingBox(
                    label=rule.label,
                    x_percent=5.0,
                    y_percent=5.0 + i * 10.0,
                    width_percent=3.0,
                    height_percent=3.0,
                    is_valid=False,
                    confidence=0.0,
                    rule_type=RuleType.CHECKBOX,
                ))

        return boxes, logs

    # ----------------------------------------------------------
    # Signature Detection
    # ----------------------------------------------------------

    def _detect_signatures(
        self,
        image:  np.ndarray,
        dims:   PageDimensions,
        rules:  list[ValidationRule],
    ) -> tuple[list[BoundingBox], list[str]]:
        """
        Detect ink blobs in the lower portion of the page (signature zone).
        Uses adaptive thresholding + contour analysis.
        """
        sig_zone_y = int(dims.height * self.SIGNATURE_ZONE_Y)
        roi        = image[sig_zone_y:, :]  # Crop to lower zone

        gray    = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        thresh  = cv2.adaptiveThreshold(
            gray, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            blockSize=11, C=8,
        )

        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        # Filter meaningful ink blobs
        blobs = [
            cv2.boundingRect(cnt)
            for cnt in contours
            if cv2.contourArea(cnt) > self.SIGNATURE_MIN_AREA
        ]

        boxes: list[BoundingBox] = []
        logs:  list[str]         = []

        for rule in rules:
            if blobs:
                # Use the largest blob as the primary signature region
                bx, by, bw, bh = max(blobs, key=lambda b: b[2] * b[3])
                # Offset y back to full-page coordinates
                abs_y      = sig_zone_y + by
                confidence = min((bw * bh) / 8000.0, 1.0)

                x_pct  = round(bx / dims.width * 100, 2)
                y_pct  = round(abs_y / dims.height * 100, 2)
                w_pct  = round(bw / dims.width * 100, 2)
                h_pct  = round(bh / dims.height * 100, 2)

                logs.append(
                    f"✓ {rule.label}: Ink blob detected at ({x_pct:.1f}%, {y_pct:.1f}%) "
                    f"— {round(bw * bh / 1000, 1)}k px² — VALID SIGNATURE"
                )
                boxes.append(BoundingBox(
                    label=rule.label,
                    x_percent=x_pct,
                    y_percent=y_pct,
                    width_percent=w_pct,
                    height_percent=h_pct,
                    is_valid=True,
                    confidence=round(confidence, 3),
                    rule_type=RuleType.SIGNATURE,
                ))
            else:
                logs.append(f"✗ {rule.label}: No signature ink detected in lower 35% of page — MISSING")
                boxes.append(BoundingBox(
                    label=rule.label,
                    x_percent=10.0,
                    y_percent=80.0,
                    width_percent=30.0,
                    height_percent=5.0,
                    is_valid=False,
                    confidence=0.0,
                    rule_type=RuleType.SIGNATURE,
                ))

        return boxes, logs

    # ----------------------------------------------------------
    # Date Detection (Heuristic)
    # ----------------------------------------------------------

    def _detect_dates(
        self,
        image:  np.ndarray,
        dims:   PageDimensions,
        rules:  list[ValidationRule],
    ) -> tuple[list[BoundingBox], list[str]]:
        """
        Heuristic: look for dense horizontal text-like regions in the upper
        portion of the page that resemble date fields.
        """
        upper_zone = image[: int(dims.height * 0.4), :]
        gray       = cv2.cvtColor(upper_zone, cv2.COLOR_BGR2GRAY)
        _, thresh  = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)

        # Dilate horizontally to merge text characters into words/lines
        kernel   = cv2.getStructuringElement(cv2.MORPH_RECT, (25, 3))
        dilated  = cv2.dilate(thresh, kernel)
        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        # Pick contours with a date-like aspect ratio
        date_candidates = [
            cv2.boundingRect(c) for c in contours
            if 80 < cv2.boundingRect(c)[2] < 500 and 10 < cv2.boundingRect(c)[3] < 60
        ]

        boxes: list[BoundingBox] = []
        logs:  list[str]         = []

        for rule in rules:
            if date_candidates:
                dx, dy, dw, dh = date_candidates[0]
                x_pct = round(dx / dims.width * 100, 2)
                y_pct = round(dy / dims.height * 100, 2)
                w_pct = round(dw / dims.width * 100, 2)
                h_pct = round(dh / dims.height * 100, 2)

                logs.append(f"✓ {rule.label}: Date-like field detected at ({x_pct:.1f}%, {y_pct:.1f}%)")
                boxes.append(BoundingBox(
                    label=rule.label,
                    x_percent=x_pct,
                    y_percent=y_pct,
                    width_percent=w_pct,
                    height_percent=h_pct,
                    is_valid=True,
                    confidence=0.75,
                    rule_type=RuleType.DATE,
                ))
            else:
                logs.append(f"✗ {rule.label}: No date field detected — MISSING")
                boxes.append(BoundingBox(
                    label=rule.label,
                    x_percent=5.0, y_percent=5.0,
                    width_percent=20.0, height_percent=3.0,
                    is_valid=False, confidence=0.0,
                    rule_type=RuleType.DATE,
                ))

        return boxes, logs


# ============================================================
# Monkey-patch DetectedRegion with percentage helpers
# ============================================================

def _x_pct(self: DetectedRegion, dims: PageDimensions) -> float:
    return round(self.x / dims.width * 100, 2)

def _y_pct(self: DetectedRegion, dims: PageDimensions) -> float:
    return round(self.y / dims.height * 100, 2)

def _w_pct(self: DetectedRegion, dims: PageDimensions) -> float:
    return round(self.w / dims.width * 100, 2)

def _h_pct(self: DetectedRegion, dims: PageDimensions) -> float:
    return round(self.h / dims.height * 100, 2)

DetectedRegion.x_pct = _x_pct
DetectedRegion.y_pct = _y_pct
DetectedRegion.w_pct = _w_pct
DetectedRegion.h_pct = _h_pct
