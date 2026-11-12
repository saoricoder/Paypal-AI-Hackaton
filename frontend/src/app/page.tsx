/**
 * Main page for Deal2Pay AI — Neon cyber aesthetic
 */

"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useDeals } from "@/hooks/useDeals";
import { DealInputPanel } from "@/components/DealInputPanel";
import { DealTable } from "@/components/DealTable";
import { AuditResponse, CreateDealPayload } from "@/types";
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

  const handleCreateDeal = async (payload: CreateDealPayload) => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const response = await fetch(`${API_URL}/api/deals/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error("Failed to create deal");
    mutate();
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
    <div className="min-h-screen text-cyan-50">
      {/* Hero Header — Neon */}
      <header className="sticky top-0 z-40 border-b border-cyan-500/20 bg-[#020617]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-[0_0_20px_rgba(0,212,255,0.5)]">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="bg-gradient-to-r from-cyan-300 via-sky-200 to-blue-400 bg-clip-text text-2xl font-black tracking-tight text-transparent">
                Deal2Pay AI
              </h1>
              <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-300/70">
                Autonomous Deal-to-Invoice Agent
              </p>
            </div>
          </div>
          <div className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-4 py-1.5 text-xs font-semibold text-cyan-300 shadow-[0_0_15px_rgba(0,212,255,0.3)]">
            PayPal AI Hackathon 2026
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-7xl px-6 py-10">
        <DealInputPanel onCreateDeal={handleCreateDeal} />
        <DealTable deals={deals} onRunAudit={handleRunAudit} onSendInvoice={handleSendInvoice} />
        {isLoading && (
          <p className="mt-3 text-center text-xs text-cyan-400/70">Syncing live data…</p>
        )}
      </main>

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
