/**
 * DealTable — Deals Ledger with AG Grid
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { ColDef, ModuleRegistry, AllCommunityModule, ValidationModule } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import { DealRecord } from "@/types";
import { StatusBadge } from "./StatusBadge";
import { FileText, Send, ExternalLink, CheckCircle } from "lucide-react";

ModuleRegistry.registerModules([AllCommunityModule, ValidationModule]);

interface DealTableProps {
  deals: DealRecord[];
  onRunAudit: (dealId: string) => void;
  onSendInvoice: (invoiceId: string) => void;
}

export function DealTable({ deals, onRunAudit, onSendInvoice }: DealTableProps) {
  const gridRef = useRef<AgGridReact>(null);
  const [columnDefs] = useState<ColDef<DealRecord>[]>([
    { field: "id", headerName: "Deal ID", width: 110, valueGetter: (p) => p.data ? p.data.id.slice(0, 8) + "…" : "" },
    { field: "client_name", headerName: "Client", width: 150 },
    { field: "client_email", headerName: "Email", width: 200 },
    { field: "total_amount", headerName: "Amount", width: 110, valueFormatter: (p) => `$${Number(p.value).toFixed(2)}` },
    { field: "audit_status", headerName: "Audit", width: 140, cellRenderer: (p: any) => <StatusBadge status={p.value} type="audit" /> },
    { field: "paypal_invoice_id", headerName: "Invoice", width: 130, valueGetter: (p) => p.data?.paypal_invoice_id || "—" },
    { field: "payment_status", headerName: "Payment", width: 140, cellRenderer: (p: any) => <StatusBadge status={p.value} type="payment" /> },
    { field: "created_at", headerName: "Created", width: 160, valueFormatter: (p) => new Date(p.value).toLocaleString() },
    {
      colId: "actions",
      headerName: "Actions",
      width: 160,
      cellRenderer: (params: { data?: DealRecord }) => {
        const data = params.data;
        if (!data) return null;
        return (
          <div className="flex items-center gap-1.5">
            <button onClick={() => onRunAudit(data.id)} className="rounded-lg bg-sky-500/15 p-1.5 text-sky-300 hover:bg-sky-500/25" title="Run Audit">
              <FileText className="h-4 w-4" />
            </button>
            {data.audit_status === "APPROVED" && data.payment_status !== "PAID" && (
              <button onClick={() => onSendInvoice(data.paypal_invoice_id!)} className="rounded-lg bg-emerald-500/15 p-1.5 text-emerald-300 hover:bg-emerald-500/25" title="Send">
                <Send className="h-4 w-4" />
              </button>
            )}
            {data.paypal_invoice_url && (
              <a href={data.paypal_invoice_url} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-slate-500/15 p-1.5 text-slate-300 hover:bg-slate-500/25" title="Open PayPal">
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            {data.payment_status === "PAID" && <CheckCircle className="h-4 w-4 text-emerald-400" />}
          </div>
        );
      },
    },
  ]);

  useEffect(() => {
    if (gridRef.current && deals.length > 0) {
      gridRef.current.api?.autoSizeColumns(columnDefs.map((c) => c.field!).filter(Boolean));
    }
  }, [deals, columnDefs]);

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold tracking-tight text-white">Deals Ledger</h2>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">Real-Time</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          PayPal Webhook Active
        </div>
      </div>

      <div className="ag-theme-alpine-dark w-full rounded-2xl overflow-hidden border border-slate-800/80 shadow-2xl" style={{ height: 500 }}>
        <AgGridReact
          ref={gridRef}
          rowData={deals}
          columnDefs={columnDefs}
          getRowId={(params) => String(params.data.id)}
          animateRows={true}
          pagination={true}
          paginationPageSize={10}
          paginationPageSizeSelector={[10, 20, 50, 100]}
          defaultColDef={{ flex: 1, minWidth: 110, resizable: true, sortable: true, filter: true }}
          theme="legacy"
          overlayNoRowsTemplate={`<div style="padding:48px;text-align:center;color:#94a3b8"><div style="font-size:36px;margin-bottom:8px">📄</div>No deals yet. Create your first one above.</div>`}
        />
      </div>
    </section>
  );
}
