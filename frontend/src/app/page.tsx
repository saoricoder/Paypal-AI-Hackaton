/**
 * Main page for Deal2Pay AI — Assembles all components.
 * Hero header + DealInputPanel + DealTable + AuditModal.
 */

"use client";

import { useState } from "react";
import { useDeals } from "@/hooks/useDeals";
import { DealInputPanel } from "@/components/DealInputPanel";
import { DealTable } from "@/components/DealTable";
import { AuditModal } from "@/components/AuditModal";
import { DealRecord, AuditResponse, CreateDealPayload } from "@/types";
import { Sparkles } from "lucide-react";

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
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Hero Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                Deal2Pay AI
              </h1>
              <p className="text-xs text-gray-500">Autonomous Deal-to-Invoice Agent</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-gray-400">PayPal AI Hackathon 2026</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <DealInputPanel onCreateDeal={handleCreateDeal} />

        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Deals Dashboard</h2>
          {isLoading && <span className="text-sm text-gray-500">Loading...</span>}
        </div>

        <DealTable
          deals={deals}
          onRunAudit={handleRunAudit}
          onSendInvoice={handleSendInvoice}
        />
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
