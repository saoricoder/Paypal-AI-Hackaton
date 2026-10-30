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
    <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-6 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-purple-400" />
        <h2 className="text-lg font-semibold text-white">Describe Your Deal</h2>
      </div>

      <div className="space-y-4">
        <div className="relative">
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Type or speak your deal description... e.g., 'Web audit for client@acme.com, 2hrs at $50, plus $50 security review. Total $150. Needs signed work order with 2 checkboxes.'"
            className="w-full h-32 bg-gray-950 border border-gray-700 rounded-lg p-4 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none"
          />
          <button
            onClick={startRecording}
            disabled={isRecording}
            className={`absolute bottom-3 right-3 p-2 rounded-lg transition-colors ${
              isRecording
                ? "bg-red-500/20 text-red-400 animate-pulse"
                : "bg-purple-500/20 text-purple-400 hover:bg-purple-500/30"
            }`}
            title="Start voice input"
          >
            <Mic className="w-4 h-4" />
          </button>
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleCreateDeal}
            disabled={!rawText.trim() || isProcessing}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm font-medium transition-colors"
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
