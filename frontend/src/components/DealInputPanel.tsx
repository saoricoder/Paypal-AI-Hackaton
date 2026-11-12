/**
 * DealInputPanel — Text input panel with Web Speech API voice input.
 * Allows users to type or speak deal descriptions and preview extracted data.
 */

"use client";

import { useState } from "react";
import { Mic, Sparkles, Send } from "lucide-react";
import { DealCreateRequest, CreateDealPayload } from "@/types";

interface DealInputPanelProps {
  onCreateDeal: (deal: CreateDealPayload) => Promise<void>;
}

const EXAMPLE_DEALS = [
  "Web security audit for client@acme.com — 2 hours at $75/hr plus a $50 compliance review. Total $200. Requires a signed statement of work with 2 checkboxes.",
  "Penetration testing engagement for security@globex.com — 1 day at $1,200. Total $1,200. Needs signed contract and delivery report with signature and date fields.",
  "SOC 2 readiness consultation for dev@initech.com — 3 hours at $150/hr. Total $450. Requires signed NDA and checklist with 3 required items.",
];

export function DealInputPanel({ onCreateDeal }: DealInputPanelProps) {
  const [rawText, setRawText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedDeal, setExtractedDeal] = useState<DealCreateRequest | null>(null);

  const startRecording = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsRecording(true);
    };

    recognition.onresult = (event: any) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript) {
        setRawText((prev) => prev + (prev ? " " : "") + finalTranscript);
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.start();
  };

  const handleCreateDeal = async () => {
    if (!rawText.trim()) return;

    setIsProcessing(true);
    try {
      await onCreateDeal({ raw_text: rawText });
      setRawText("");
      setExtractedDeal(null);
    } catch (error) {
      console.error("Failed to create deal:", error);
      alert("Failed to create deal. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="mb-8 space-y-4 rounded-2xl border border-slate-700/60 bg-[#131B2E] p-6 shadow-2xl">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-blue-400" />
        <h2 className="text-lg font-bold text-white tracking-tight">
          Describe Your Deal
        </h2>
      </div>

      <div className="space-y-4">
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Type or speak your deal description... e.g., 'Web audit for client@acme.com, 2hrs at $50, plus $50 security review. Total $150. Needs signed work order with 2 checkboxes.'"
            className="h-28 w-full resize-none rounded-xl border border-slate-700 bg-[#0B0F19] p-4 text-sm leading-relaxed text-slate-100 shadow-inner transition-all placeholder:text-slate-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500/60"
          />
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
          <button
            onClick={startRecording}
            disabled={isRecording}
            className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-medium shadow-sm transition ${
              isRecording
                ? "animate-pulse border-red-500/40 bg-red-500/20 text-red-300"
                : "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
            }`}
            title="Start voice input"
          >
            <Mic className="h-4 w-4" /> {isRecording ? "Listening…" : "Speak deal"}
          </button>
          <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400">Try an example:</span>
          {EXAMPLE_DEALS.map((example, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setRawText(example)}
              title={example}
              className="rounded-full border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-blue-900/40 hover:text-blue-300"
            >
              Example {i + 1}
            </button>
          ))}
          </div>
        </div>
          <button
            onClick={handleCreateDeal}
            disabled={!rawText.trim() || isProcessing}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#0070BA] to-[#003087] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition-all hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isProcessing ? (
              "Processing..."
            ) : (
              <>
                <Send className="w-4 h-4" />
                Extract & Create Invoice
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
