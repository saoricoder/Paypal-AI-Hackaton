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
    <div className="bg-[#151D2C] border border-slate-700/80 rounded-xl p-6 mb-6 shadow-xl">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-blue-400" />
        <h2 className="text-lg font-semibold text-white tracking-tight">
          Describe Your Deal
        </h2>
      </div>

      <div className="space-y-4">
        <div className="relative">
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Type or speak your deal description... e.g., 'Web audit for client@acme.com, 2hrs at $50, plus $50 security review. Total $150. Needs signed work order with 2 checkboxes.'"
            className="w-full h-32 bg-[#0B0F17] text-slate-100 border border-slate-700 rounded-lg p-4 text-sm leading-relaxed placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
          <button
            onClick={startRecording}
            disabled={isRecording}
            className={`absolute bottom-3 right-3 p-2.5 rounded-lg transition-colors ${
              isRecording
                ? "bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse"
                : "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600"
            }`}
            title="Start voice input"
          >
            <Mic className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-slate-500 self-center">Try an example:</span>
          {EXAMPLE_DEALS.map((example, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setRawText(example)}
              title={example}
              className="text-xs px-2.5 py-1 rounded-full border border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-colors"
            >
              Example {i + 1}
            </button>
          ))}
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleCreateDeal}
            disabled={!rawText.trim() || isProcessing}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 text-white font-semibold rounded-lg text-sm shadow-md transition-all"
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
