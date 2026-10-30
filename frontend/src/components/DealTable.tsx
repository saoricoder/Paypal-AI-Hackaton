/**
 * DealTable — AG Grid table displaying all deals with status badges and actions.
 * Uses legacy theme with custom CSS variables for dark mode support.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { ColDef } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";
import { DealRecord } from "@/types";
import { StatusBadge } from "./StatusBadge";
import { FileText, Send, ExternalLink, CheckCircle } from "lucide-react";

interface DealTableProps {
  deals: DealRecord[];
  onRunAudit: (dealId: string) => void;
  onSendInvoice: (invoiceId: string) => void;
}

export function DealTable({ deals, onRunAudit, onSendInvoice }: DealTableProps) {
  const gridRef = useRef<AgGridReact>(null);
  const [columnDefs] = useState<ColDef<DealRecord>[]>([
    {
      field: "id",
      headerName: "Deal ID",
      width: 100,
      valueGetter: (params) => params.data.id.slice(0, 8) + "...",
    },
    {
      field: "client_name",
      headerName: "Client",
      width: 150,
    },
    {
      field: "client_email",
      headerName: "Email",
      width: 200,
    },
    {
      field: "total_amount",
      headerName: "Amount",
      width: 100,
      valueFormatter: (params) => `$${params.value.toFixed(2)}`,
    },
    {
      field: "audit_status",
      headerName: "Audit Status",
      width: 130,
      cellRenderer: (params: { value: string }) => (
        <StatusBadge status={params.value} type="audit" />
      ),
    },
    {
      field: "paypal_invoice_id",
      headerName: "Invoice ID",
      width: 120,
      valueGetter: (params) => params.data.paypal_invoice_id || "—",
    },
    {
      field: "payment_status",
      headerName: "Payment Status",
      width: 140,
      cellRenderer: (params: { value: string }) => (
        <StatusBadge status={params.value} type="payment" />
      ),
    },
    {
      field: "created_at",
      headerName: "Created",
      width: 150,
      valueFormatter: (params) => new Date(params.value).toLocaleString(),
    },
    {
      field: "actions",
      headerName: "Actions",
      width: 160,
      cellRenderer: (params: { data: DealRecord }) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onRunAudit(params.data.id)}
            className="p-1.5 rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
            title="Run Audit"
          >
            <FileText className="w-4 h-4" />
          </button>
          {params.data.audit_status === "APPROVED" && params.data.payment_status !== "PAID" && (
            <button
              onClick={() => onSendInvoice(params.data.paypal_invoice_id!)}
              className="p-1.5 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
              title="Send Invoice"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
          {params.data.paypal_invoice_url && (
            <a
              href={params.data.paypal_invoice_url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded bg-gray-500/20 text-gray-400 hover:bg-gray-500/30 transition-colors"
              title="Open in PayPal"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          {params.data.payment_status === "PAID" && (
            <CheckCircle className="w-4 h-4 text-emerald-400" title="Paid" />
          )}
        </div>
      ),
    },
  ]);

  const getRowClass = (params: { data: DealRecord }) => {
    return params.data.payment_status === "PAID" ? "bg-emerald-950/40" : "";
  };

  // Auto-size columns on first data render
  useEffect(() => {
    if (gridRef.current && deals.length > 0) {
      gridRef.current.api?.autoSizeColumns(columnDefs.map((col) => col.field!));
    }
  }, [deals, columnDefs]);

  return (
    <div className="ag-theme-alpine-dark w-full h-[500px] rounded-lg border border-gray-800">
      <AgGridReact
        ref={gridRef}
        rowData={deals}
        columnDefs={columnDefs}
        defaultColDef={{
          resizable: true,
          sortable: true,
          filter: true,
        }}
        getRowClass={getRowClass}
        domLayout="autoHeight"
        rowSelection="single"
      />
    </div>
  );
}
