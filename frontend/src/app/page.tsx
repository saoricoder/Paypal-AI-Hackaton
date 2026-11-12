/**
 * Main page for Deal2Pay AI — Modern fintech dark canvas
 */

"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useDeals } from "@/hooks/useDeals";
import { DealInputPanel } from "@/components/DealInputPanel";
import { DealTable } from "@/components/DealTable";
import { AuditResponse, CreateDealPayload, DealCreateResponse } from "@/types";
import { Sparkles } from "lucide-react";

const AuditModal = dynamic(
  () => import("@/components/AuditModal").then((m) => m.AuditModal),
  { ssr: false }
);

export default function Home() {
  const { deals, isLoading, mutate } = useDeals();
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [auditResult, setAuditResult] = useState<AuditResponse | null>(null);

  const selectedDeal = deals.find((d) => d.id === selectedDealId) || null;

  const handleCreateDeal = async (payload: CreateDealPayload): Promise<DealCreateResponse> => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const response = await fetch(`${API_URL}/api/deals/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.detail || "Failed to create deal");
    }
    const created = await response.json() as DealCreateResponse;
    await mutate();
    return created;
  };

  const handleRunAudit = (dealId: string) => setSelectedDealId(dealId);

  const handleSendInvoice = async (invoiceId: string) => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const response = await fetch(`${API_URL}/api/paypal/send-invoice/${invoiceId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deal_id: selectedDealId }),
    });
    if (!response.ok) throw new Error("Failed to send invoice");
    mutate();
  };

  const handleAuditComplete = (result: AuditResponse) => {
    setAuditResult(result);
    mutate();
  };

  return (
    <main className="min-h-screen bg-[#090C15] bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(0,112,186,0.15),rgba(255,255,255,0))] text-slate-100 antialiased p-6 md:p-10 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 shadow-lg shadow-blue-500/20">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="bg-gradient-to-r from-sky-400 via-blue-400 to-indigo-300 bg-clip-text text-3xl font-black tracking-tight text-transparent">
                Deal2Pay AI
              </h1>
              <p className="text-xs font-medium tracking-wider uppercase text-slate-400">
                Autonomous Deal-to-Invoice Agent & Physical Delivery Audit
              </p>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-blue-500/10 text-sky-300 border border-blue-500/30 shadow-[0_0_15px_rgba(0,112,186,0.3)]">
            PayPal AI Hackathon 2026
          </div>
        </header>

        {/* Deal Input Card */}
        <DealInputPanel onCreateDeal={handleCreateDeal} onRefreshLedger={mutate} />

        {/* Deals Dashboard Grid */}
        <DealTable deals={deals} onRunAudit={handleRunAudit} onSendInvoice={handleSendInvoice} />

        {isLoading && (
          <p className="text-center text-xs text-slate-500">Refreshing deals…</p>
        )}
      </div>

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
    </main>
  );
}
