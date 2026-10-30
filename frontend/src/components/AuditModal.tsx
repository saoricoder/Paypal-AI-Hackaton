/**
 * AuditModal — Split-view modal for document audit with PDF + bounding box overlay.
 * Left: PDF viewer with detected elements overlay. Right: ReasoningTerminal + PayPalInvoicePanel.
 */

"use client";

import { useState, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { X, Upload, Check, X as XIcon } from "lucide-react";
import { DealRecord, AuditResponse, BoundingBox } from "@/types";
import { ReasoningTerminal } from "./ReasoningTerminal";
import { PayPalInvoicePanel } from "./PayPalInvoicePanel";

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface AuditModalProps {
  deal: DealRecord;
  onClose: () => void;
  onSendInvoice: (invoiceId: string) => void;
  onAuditComplete: (auditResult: AuditResponse) => void;
}

export function AuditModal({ deal, onClose, onSendInvoice, onAuditComplete }: AuditModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [auditResult, setAuditResult] = useState<AuditResponse | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === "application/pdf") {
      setFile(selectedFile);
      setAuditResult(null);
    }
  };

  const handleUploadAndAudit = async () => {
    if (!file) return;

    setIsAuditing(true);
    const formData = new FormData();
    formData.append("deal_id", deal.id);
    formData.append("file", file);

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await fetch(`${API_URL}/api/audit/verify-document`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Audit failed");
      }

      const result: AuditResponse = await response.json();
      setAuditResult(result);
      onAuditComplete(result);
    } catch (error) {
      console.error("Audit error:", error);
      alert("Failed to audit document. Please try again.");
    } finally {
      setIsAuditing(false);
    }
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-2xl border border-gray-800 w-full max-w-7xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <div>
            <h2 className="text-xl font-semibold text-white">Document Audit</h2>
            <p className="text-sm text-gray-400">Deal: {deal.client_name} — ${deal.total_amount.toFixed(2)}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 grid grid-cols-3 gap-4 p-4 overflow-hidden">
          {/* Left: PDF Viewer */}
          <div className="col-span-2 bg-gray-950 rounded-lg border border-gray-800 overflow-auto flex flex-col">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-300">Delivery Document</span>
              <label className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm cursor-pointer transition-colors">
                <Upload className="w-4 h-4" />
                Upload PDF
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>

            <div className="flex-1 p-4 flex items-center justify-center">
              {file ? (
                <div className="relative">
                  <Document
                    file={file}
                    onLoadSuccess={onDocumentLoadSuccess}
                    className="max-w-full"
                  >
                    <Page
                      pageNumber={1}
                      scale={1.2}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      className="border border-gray-700"
                    />
                  </Document>

                  {/* Bounding Box Overlay */}
                  {auditResult && (
                    <div className="absolute inset-0 pointer-events-none">
                      {auditResult.bounding_boxes.map((box, idx) => (
                        <div
                          key={idx}
                          className={`absolute border-2 ${
                            box.is_valid
                              ? "border-emerald-500 bg-emerald-500/10"
                              : "border-red-500 bg-red-500/10 animate-pulse"
                          }`}
                          style={{
                            left: `${box.x_percent}%`,
                            top: `${box.y_percent}%`,
                            width: `${box.width_percent}%`,
                            height: `${box.height_percent}%`,
                          }}
                        >
                          <div
                            className={`absolute -top-6 left-0 flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                              box.is_valid
                                ? "bg-emerald-500 text-white"
                                : "bg-red-500 text-white"
                            }`}
                          >
                            {box.is_valid ? <Check className="w-3 h-3" /> : <XIcon className="w-3 h-3" />}
                            {box.label}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center text-gray-500">
                  <Upload className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Upload a PDF delivery document to begin audit</p>
                </div>
              )}
            </div>

            {file && (
              <div className="p-4 border-t border-gray-800 flex justify-end">
                <button
                  onClick={handleUploadAndAudit}
                  disabled={isAuditing}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {isAuditing ? "Analyzing..." : "Run Audit"}
                </button>
              </div>
            )}
          </div>

          {/* Right: Reasoning + Invoice Panel */}
          <div className="col-span-1 flex flex-col gap-4 overflow-hidden">
            <ReasoningTerminal logs={auditResult?.reasoning_log || []} />
            <PayPalInvoicePanel deal={deal} onSendInvoice={onSendInvoice} />
          </div>
        </div>
      </div>
    </div>
  );
}
