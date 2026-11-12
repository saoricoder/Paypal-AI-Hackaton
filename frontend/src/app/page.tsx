/**
 * Main page for Deal2Pay AI — Assembles all components.
 * Hero header + DealInputPanel + DealTable + AuditModal.
 */

"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useDeals } from "@/hooks/useDeals";
import { DealInputPanel } from "@/components/DealInputPanel";
import { DealTable } from "@/components/DealTable";
import { DealRecord, AuditResponse, CreateDealPayload } from "@/types";

// react-pdf/pdfjs requires DOM APIs — load AuditModal client-side only
const AuditModal = dynamic(
  () => import("@/components/AuditModal").then((m) => m.AuditModal),
  { ssr: false }
);

export default function Home() {
  const { deals, isLoading, mutate } = useDeals();
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [auditResult, setAuditResult] = useState<AuditResponse | null>(null);

  const selectedDeal = deals.find((d) => d.id === selectedDealId) || null;

  const handleCreateDeal = async (payload: CreateDealPayload) => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const response = await fetch(`${API_URL}/api/deals/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error("Failed to create deal");
    }

    mutate(); // Refresh the deals list
  };

  const handleRunAudit = (dealId: string) => {
    setSelectedDealId(dealId);
  };

  const handleSendInvoice = async (invoiceId: string) => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const response = await fetch(`${API_URL}/api/paypal/send-invoice/${invoiceId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deal_id: selectedDealId }),
    });

    if (!response.ok) {
      throw new Error("Failed to send invoice");
    }

    mutate(); // Refresh the deals list
  };

  const handleAuditComplete = (result: AuditResponse) => {
    setAuditResult(result);
    mutate(); // Refresh the deals list to show updated audit status
  };

  return (
    <div className="min-h-screen bg-[#0B0F19] font-sans text-slate-100">
      {/* Hero Header */}
      <header
        className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#0F172A]/70 px-8 py-4 backdrop-blur-md"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div>
              <h1 className="bg-gradient-to-r from-blue-400 via-sky-300 to-indigo-400 bg-clip-text text-2xl font-black tracking-tight text-transparent">
                Deal2Pay AI
              </h1>
              <p className="text-xs text-slate-400 font-medium">
                Autonomous Deal-to-Invoice Agent &amp; Physical Delivery Audit
              </p>
          </div>
          <div className="rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-400">
              PayPal AI Hackathon 2026
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <DealInputPanel onCreateDeal={handleCreateDeal} />

        <DealTable
          deals={deals}
          onRunAudit={handleRunAudit}
          onSendInvoice={handleSendInvoice}
        />
        {isLoading && <p className="mt-3 text-xs text-slate-500">Refreshing deals…</p>}
      </main>

      {/* Audit Modal */}
      {selectedDeal && (
        <AuditModal
          deal={selectedDeal}
          onClose={() => {
            setSelectedDealId(null);
            setAuditResult(null);
          }}
          onSendInvoice={handleSendInvoice}
          onAuditComplete={handleAuditComplete}
        />
      )}
    </div>
  );
}
