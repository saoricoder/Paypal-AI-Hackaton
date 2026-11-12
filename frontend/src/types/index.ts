/**
 * TypeScript types mirroring the backend Pydantic schemas.
 * Every type here corresponds to a model in backend/schemas.py.
 */

// ============================================================
// Enumerations
// ============================================================

export type AuditStatus = "PENDING" | "IN_PROGRESS" | "APPROVED" | "FAILED";
export type PaymentStatus = "DRAFT" | "DRAFT_LOCKED" | "SENT" | "PAID" | "CANCELLED";
export type RuleType = "checkbox" | "signature" | "date";

// ============================================================
// Deal / Contract Models
// ============================================================

export interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

export interface ValidationRule {
  label: string;
  rule_type: RuleType;
  required: boolean;
}

export interface CreateDealPayload {
  raw_text: string;
}

export interface DealCreateRequest {
  raw_text: string;
  client_email: string;
  client_name: string;
  line_items: LineItem[];
  total_amount: number;
  validation_rules: ValidationRule[];
}

export interface DealRecord {
  id: string;
  raw_text: string;
  client_email: string;
  client_name: string;
  line_items: LineItem[];
  total_amount: number;
  validation_rules: ValidationRule[];
  paypal_invoice_id: string | null;
  paypal_invoice_url: string | null;
  audit_status: AuditStatus;
  payment_status: PaymentStatus;
  created_at: string;
  updated_at: string;
}

export interface DealCreateResponse {
  deal_id: string;
  paypal_invoice_id: string;
  paypal_invoice_url: string | null;
  paypal_invoice_is_fallback?: boolean;
  payment_status: PaymentStatus;
  message: string;
}

// ============================================================
// Audit / Computer Vision Models
// ============================================================

export interface BoundingBox {
  label: string;
  x_percent: number;
  y_percent: number;
  width_percent: number;
  height_percent: number;
  is_valid: boolean;
  confidence: number;
  rule_type: RuleType;
}

export interface AuditResponse {
  deal_id: string;
  overall_pass: boolean;
  bounding_boxes: BoundingBox[];
  reasoning_log: string[];
  failed_rules: string[];
}

export interface AuditLogRecord {
  id: string;
  deal_id: string;
  pdf_storage_path: string | null;
  overall_pass: boolean;
  bounding_boxes: BoundingBox[];
  reasoning_log: string[];
  created_at: string;
}

// ============================================================
// API Response Wrappers
// ============================================================

export interface DealsListResponse {
  deals: DealRecord[];
}

export interface HealthResponse {
  status: string;
  version: string;
  service: string;
}

export interface ErrorResponse {
  detail: string;
  code?: string;
}
