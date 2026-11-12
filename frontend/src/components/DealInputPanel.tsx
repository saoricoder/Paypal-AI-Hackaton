/**
 * DealInputPanel — Elevated glassmorphic prompt workspace
 */

"use client";

import { useState } from "react";
import { Mic, Sparkles, Send } from "lucide-react";
import { CreateDealPayload } from "@/types";

interface DealInputPanelProps {
  onCreateDeal: (deal: CreateDealPayload) => Promise<void>;
}

const EXAMPLE_DEALS = [
  {
    label: "Example 1",
    text: "Web security audit for client@acme.com — 2 hours at $75/hr plus a $50 compliance review. Total $200. Requires a signed statement of work with 2 checkboxes.",
  },
  {
    label: "Example 2",
    text: "Penetration testing engagement for security@globex.com — 1 day at $1,200. Total $1,200. Needs signed contract and delivery report with signature and date fields.",
  },
  {
    label: "Example 3",
    text: "SOC 2 readiness consultation for dev@initech.com — 3 hours at $150/hr. Total $450. Requires signed NDA and checklist with 3 required items.",
  },
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
    <div className="relative rounded-2xl border border-slate-800 bg-gradient-to-b from-[#131927] to-[#0E131F] p-6 shadow-2xl overflow-hidden">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-sky-400" />
        <h2 className="text-lg font-bold text-slate-100">Describe Your Deal</h2>
      </div>

      <textarea
        value={rawText}
        onChange={(e) => setRawText(e.target.value)}
        placeholder="Type or speak your deal description… e.g., 'Web audit for client@acme.com, 2hrs at $50, plus $50 security review. Total $150. Needs signed work order with 2 checkboxes.'"
        className="w-full h-28 bg-[#0A0D16] border border-slate-700/70 rounded-xl p-4 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500/50 transition-all resize-none shadow-inner"
      />

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 pt-2">
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={startRecording}
            disabled={isRecording}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all border ${
              isRecording
                ? "bg-red-500/20 text-red-300 border-red-500/50 animate-pulse"
                : "bg-slate-800/90 hover:bg-slate-800 text-slate-200 border-slate-700 hover:border-slate-600 shadow-sm"
            }`}
          >
            <Mic className="w-4 h-4" />
            {isRecording ? "Listening..." : "Voice Dictate"}
          </button>

          <div className="flex items-center gap-1.5 text-xs text-slate-400 ml-1">
            <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mr-1">Examples:</span>
            {EXAMPLE_DEALS.map((ex, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setRawText(ex.text)}
                className="px-2.5 py-1 rounded-lg bg-slate-800/60 hover:bg-sky-950/60 hover:text-sky-300 hover:border-sky-700/60 text-slate-300 border border-slate-700/50 text-xs transition"
              >
                {ex.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={handleCreateDeal}
          disabled={isProcessing || !rawText.trim()}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-[#0070BA] to-[#003087] hover:brightness-110 active:scale-[0.98] transition-all shadow-[0_0_20px_rgba(0,112,186,0.35)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send className="w-4 h-4" />
          {isProcessing ? "Parsing Deal..." : "Extract & Create Invoice"}
        </button>
      </div>
    </div>
  );
}
