/**
 * DealInputPanel — Neon cyber input with voice + examples
 */

"use client";

import { useState } from "react";
import { Mic, Sparkles, Send } from "lucide-react";
import { CreateDealPayload } from "@/types";

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

    recognition.onstart = () => setIsRecording(true);
    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
      }
      if (finalTranscript) setRawText((prev) => prev + (prev ? " " : "") + finalTranscript);
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);
    recognition.start();
  };

  const handleCreateDeal = async () => {
    if (!rawText.trim()) return;
    setIsProcessing(true);
    try {
      await onCreateDeal({ raw_text: rawText });
      setRawText("");
    } catch (error) {
      console.error(error);
      alert("Failed to create deal.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="mb-10 rounded-2xl border border-cyan-500/30 bg-[#0a1224]/80 p-6 shadow-[0_0_30px_rgba(0,212,255,0.12)] backdrop-blur-sm">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-cyan-400" />
        <h2 className="text-lg font-bold tracking-tight text-cyan-100">Describe Your Deal</h2>
      </div>

      <textarea
        value={rawText}
        onChange={(e) => setRawText(e.target.value)}
        placeholder="Type or speak a deal... e.g. 'Web audit for client@acme.com, 2hrs at $50 + $50 security. Needs signed work order with 2 checkboxes.'"
        className="h-28 w-full resize-none rounded-xl border border-cyan-500/30 bg-[#020617]/70 p-4 text-sm text-cyan-50 placeholder:text-cyan-700/60 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
      />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={startRecording}
            disabled={isRecording}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-medium transition ${
              isRecording
                ? "animate-pulse border-red-400 bg-red-500/20 text-red-300"
                : "border-cyan-500/40 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
            }`}
          >
            <Mic className="h-4 w-4" />
            {isRecording ? "Listening…" : "Speak"}
          </button>

          <span className="text-xs text-cyan-400/70">Examples:</span>
          {EXAMPLE_DEALS.map((ex, i) => (
            <button
              key={i}
              onClick={() => setRawText(ex)}
              className="rounded-full border border-cyan-500/30 bg-cyan-500/5 px-3 py-1 text-xs text-cyan-200 hover:bg-cyan-500/15"
            >
              {i + 1}
            </button>
          ))}
        </div>

        <button
          onClick={handleCreateDeal}
          disabled={!rawText.trim() || isProcessing}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-6 py-2.5 text-sm font-bold text-white shadow-[0_0_20px_rgba(0,212,255,0.4)] transition hover:brightness-110 disabled:opacity-50"
        >
          {isProcessing ? "Processing…" : (
            <>
              <Send className="h-4 w-4" />
              Extract & Create Invoice
            </>
          )}
        </button>
      </div>
    </div>
  );
}
