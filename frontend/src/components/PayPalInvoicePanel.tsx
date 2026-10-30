/**
 * PayPalInvoicePanel — Invoice summary card with send/view actions.
 * Disabled when audit is not approved, with tooltip explaining why.
 */

import { DealRecord } from "@/types";
import { Send, ExternalLink, Lock } from "lucide-react";

interface PayPalInvoicePanelProps {
  deal: DealRecord;
  onSendInvoice: (invoiceId: string) => void;
}

export function PayPalInvoicePanel({ deal, onSendInvoice }: PayPalInvoicePanelProps) {
  const canSend = deal.audit_status === "APPROVED" && deal.payment_status !== "PAID";

  return (
    <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
          <span className="text-blue-400 font-bold text-sm">P</span>
        </div>
        <h3 className="text-sm font-semibold text-white">PayPal Invoice</h3>
      </div>

      <div className="space-y-3 mb-4">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Invoice ID</span>
          <span className="text-gray-200 font-mono">
            {deal.paypal_invoice_id || "—"}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Client</span>
          <span className="text-gray-200">{deal.client_name}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Amount</span>
          <span className="text-gray-200 font-semibold">${deal.total_amount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Status</span>
          <span className="text-gray-200">{deal.payment_status}</span>
        </div>
      </div>

      <div className="space-y-2">
        <button
          onClick={() => onSendInvoice(deal.paypal_invoice_id!)}
          disabled={!canSend}
          className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            canSend
              ? "bg-blue-600 hover:bg-blue-700 text-white"
              : "bg-gray-800 text-gray-500 cursor-not-allowed"
          }`}
          title={!canSend ? "Audit must be APPROVED before sending" : "Send invoice to client"}
        >
          {canSend ? (
            <>
              <Send className="w-4 h-4" />
              Send Invoice
            </>
          ) : (
            <>
              <Lock className="w-4 h-4" />
              Locked Pending Audit
            </>
          )}
        </button>

        {deal.paypal_invoice_url && (
          <a
            href={deal.paypal_invoice_url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Open in PayPal Sandbox
          </a>
        )}
      </div>
    </div>
  );
}
