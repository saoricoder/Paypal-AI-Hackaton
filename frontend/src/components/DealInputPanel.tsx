/** Deal input, browser dictation, and the guided full-flow demo runner. */

"use client";

import { useRef, useState } from "react";
import { Check, Circle, LoaderCircle, Mic, Send, Sparkles, X } from "lucide-react";
import { CreateDealPayload, DealCreateResponse } from "@/types";

interface DealInputPanelProps {
  onCreateDeal: (deal: CreateDealPayload) => Promise<DealCreateResponse>;
  onRefreshLedger: () => Promise<unknown> | void;
}

type StepStatus = "idle" | "running" | "completed" | "failed";
interface PipelineStep { label: string; detail: string; status: StepStatus }

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const EXAMPLES = [
  "Web security audit for client@acme.com — 2 hours at $75/hr plus a $50 compliance review. Total $200. Requires a signed statement of work with 2 checkboxes.",
  "Penetration testing engagement for security@globex.com — 1 day at $1,200. Total $1,200. Needs signed contract and delivery report with signature and date fields.",
  "SOC 2 readiness consultation for dev@initech.com — 3 hours at $150/hr. Total $450. Requires signed NDA and checklist with 3 required items.",
];
const INITIAL_STEPS: PipelineStep[] = [
  { label: "Gemini Multimodal Parsing & PayPal Invoice Creation", detail: "Waiting to start", status: "idle" },
  { label: "OpenCV Signed Act & Checkbox Visual Audit", detail: "Waiting to start", status: "idle" },
  { label: "PayPal Webhook INVOICING.INVOICE.PAID Settlement", detail: "Waiting to start", status: "idle" },
];

type Recognition = {
  continuous: boolean; interimResults: boolean; lang: string;
  start: () => void; stop: () => void;
  onstart: (() => void) | null; onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null; onend: (() => void) | null;
};

export function DealInputPanel({ onCreateDeal, onRefreshLedger }: DealInputPanelProps) {
  const [rawText, setRawText] = useState("");
  const [interim, setInterim] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRunningTest, setIsRunningTest] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [steps, setSteps] = useState(INITIAL_STEPS);
  const recognitionRef = useRef<Recognition | null>(null);
  const finalTextRef = useRef("");

  const setStep = (index: number, status: StepStatus, detail: string) => {
    setSteps((current) => current.map((step, i) => i === index ? { ...step, status, detail } : step));
  };

  const startRecording = async () => {
    const browser = window as Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const SpeechRecognition = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setTestError("Voice dictation is not supported here. Use Chrome or Edge, or type your deal.");
      return;
    }
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      }
      setTestError(null);
      finalTextRef.current = rawText;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      recognition.onstart = () => setIsRecording(true);
      recognition.onresult = (event) => {
        let finalTranscript = "";
        let interimTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) finalTranscript += transcript;
          else interimTranscript += transcript;
        }
        if (finalTranscript) {
          finalTextRef.current = `${finalTextRef.current}${finalTextRef.current ? " " : ""}${finalTranscript.trim()}`;
          setRawText(finalTextRef.current);
        }
        setInterim(interimTranscript);
      };
      recognition.onerror = (event) => {
        setIsRecording(false);
        setInterim("");
        setTestError(event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone permission was denied. Allow microphone access in your browser settings and try again."
          : `Voice dictation stopped (${event.error}). You can continue typing your deal.`);
      };
      recognition.onend = () => { setIsRecording(false); setInterim(""); };
      recognitionRef.current = recognition;
      recognition.start();
    } catch (error) {
      const denied = error instanceof DOMException && error.name === "NotAllowedError";
      setTestError(denied
        ? "Microphone permission was denied. Allow microphone access in your browser settings and try again."
        : "Could not start microphone dictation. You can continue typing your deal.");
    }
  };

  const runFullE2ETest = async (scenario: string) => {
    if (isRunningTest) return;
    setRawText(scenario);
    setInterim("");
    setSteps(INITIAL_STEPS);
    setTestError(null);
    setIsRunningTest(true);
    try {
      setStep(0, "running", "Extracting the deal with Gemini and creating a PayPal Sandbox draft…");
      const deal: DealCreateResponse = await onCreateDeal({ raw_text: scenario });
      setStep(0, "completed", `Draft invoice ${deal.paypal_invoice_id} created`);
      await onRefreshLedger();

      setStep(1, "running", "Running the sample document through the OpenCV audit…");
      const audit = await fetch(`${API_URL}/api/audit/verify-sample/${deal.deal_id}`, { method: "POST" });
      const auditBody = await audit.json().catch(() => ({}));
      if (!audit.ok) throw new Error(auditBody.detail || "Sample document audit failed");
      setStep(1, "completed", "Sample delivery document passed the visual audit");
      await onRefreshLedger();

      setStep(2, "running", "Applying the demo INVOICING.INVOICE.PAID settlement…");
      const payment = await fetch(`${API_URL}/api/webhooks/simulate-payment/${deal.deal_id}`, { method: "POST" });
      const paymentBody = await payment.json().catch(() => ({}));
      if (!payment.ok) throw new Error(paymentBody.detail || "Payment simulation failed");
      setStep(2, "completed", "Payment settled; deal lifecycle is complete");
      await onRefreshLedger();
    } catch (error) {
      const message = error instanceof Error ? error.message : "The demo pipeline failed";
      setTestError(message);
      setSteps((current) => {
        const runningIndex = current.findIndex((step) => step.status === "running");
        return runningIndex < 0 ? current : current.map((step, i) => i === runningIndex ? { ...step, status: "failed", detail: message } : step);
      });
      await onRefreshLedger();
    } finally {
      setIsRunningTest(false);
    }
  };

  const handleCreateDeal = async () => {
    if (!rawText.trim() || isProcessing) return;
    setIsProcessing(true);
    setTestError(null);
    try {
      await onCreateDeal({ raw_text: rawText });
      setRawText("");
    } catch (error) {
      setTestError(error instanceof Error ? error.message : "Failed to create deal.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <section className="mb-8 space-y-4 rounded-2xl border border-slate-700/60 bg-[#131B2E] p-6 shadow-2xl">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-blue-400" />
          <h2 className="text-lg font-bold text-white">Describe Your Deal</h2>
        </div>
        <textarea
          value={`${rawText}${interim ? `${rawText ? " " : ""}${interim}` : ""}`}
          onChange={(event) => { setRawText(event.target.value); finalTextRef.current = event.target.value; }}
          placeholder="Type or dictate your deal description…"
          className="h-28 w-full resize-none rounded-xl border border-slate-700 bg-[#0B0F19] p-4 text-sm leading-relaxed text-slate-100 shadow-inner placeholder:text-slate-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500/60"
        />
        {interim && <p className="-mt-3 text-xs text-sky-300" aria-live="polite">Hearing: {interim}</p>}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <button type="button" onClick={isRecording ? () => recognitionRef.current?.stop() : startRecording}
              className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-medium transition ${isRecording ? "animate-pulse border-red-400 bg-red-500/20 text-red-200 ring-2 ring-red-500 shadow-[0_0_18px_rgba(239,68,68,0.55)]" : "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"}`}>
              <Mic className="h-4 w-4" /> {isRecording ? "Stop dictation" : "Voice Dictate"}
            </button>
            <span className="px-1 text-xs text-slate-400">Examples:</span>
            {EXAMPLES.map((example, index) => (
              <button key={index} type="button" onClick={() => void runFullE2ETest(example)} disabled={isRunningTest}
                className="rounded-full border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-blue-900/40 hover:text-blue-300 disabled:opacity-50"
                title="Run this example through the full demo lifecycle">Example {index + 1}</button>
            ))}
            <button type="button" onClick={() => void runFullE2ETest(EXAMPLES[0])} disabled={isRunningTest}
              className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3.5 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-400/20 disabled:opacity-50">
              ⚡ One-Click Full Test
            </button>
          </div>
          <button type="button" onClick={() => void handleCreateDeal()} disabled={!rawText.trim() || isProcessing || isRunningTest}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#0070BA] to-[#003087] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition-all hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50">
            {isProcessing ? "Processing…" : <><Send className="h-4 w-4" /> Extract & Create Invoice</>}
          </button>
        </div>
        {testError && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{testError}</p>}
      </section>

      {(isRunningTest || steps.some((step) => step.status !== "idle")) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="demo-title">
          <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-[#111B2E] p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">Live demo runner</p><h3 id="demo-title" className="mt-1 text-xl font-bold text-white">Full deal lifecycle</h3></div>
              {!isRunningTest && <button type="button" onClick={() => { setSteps(INITIAL_STEPS); setTestError(null); }} aria-label="Close progress" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="h-4 w-4" /></button>}
            </div>
            <ol className="space-y-3">
              {steps.map((step, index) => <li key={step.label} className="flex gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                <span className="mt-0.5 text-slate-500">{step.status === "completed" ? <Check className="h-5 w-5 text-emerald-400" /> : step.status === "running" ? <LoaderCircle className="h-5 w-5 animate-spin text-sky-300" /> : step.status === "failed" ? <X className="h-5 w-5 text-rose-400" /> : <Circle className="h-5 w-5" />}</span>
                <div><p className="text-sm font-semibold text-slate-100">{index + 1}. {step.label}</p><p className={`mt-1 text-xs ${step.status === "failed" ? "text-rose-300" : step.status === "completed" ? "text-emerald-300" : "text-slate-400"}`}>{step.detail}</p></div>
              </li>)}
            </ol>
            {testError && <p className="mt-4 text-sm text-rose-300">{testError}</p>}
          </div>
        </div>
      )}
    </>
  );
}
