/**
 * StatusBadge — Neon cyber status indicators
 */

import { AuditStatus, PaymentStatus } from "@/types";
import { Check, X, Clock, Send, DollarSign } from "lucide-react";

interface StatusBadgeProps {
  status: AuditStatus | PaymentStatus | string;
  type?: "audit" | "payment";
}

export function StatusBadge({ status, type = "audit" }: StatusBadgeProps) {
  const getConfig = () => {
    if (type === "audit") {
      switch (status) {
        case "PENDING":
          return { color: "bg-amber-500/15 text-amber-300 border-amber-400/40", icon: <Clock className="h-3 w-3" />, label: "Pending" };
        case "IN_PROGRESS":
          return { color: "bg-cyan-500/15 text-cyan-300 border-cyan-400/40", icon: <Clock className="h-3 w-3 animate-pulse" />, label: "Auditing" };
        case "APPROVED":
          return { color: "bg-emerald-500/15 text-emerald-300 border-emerald-400/40", icon: <Check className="h-3 w-3" />, label: "Approved" };
        case "FAILED":
          return { color: "bg-rose-500/15 text-rose-300 border-rose-400/40", icon: <X className="h-3 w-3" />, label: "Failed" };
        default:
          return { color: "bg-slate-500/15 text-slate-300 border-slate-400/40", icon: null, label: status };
      }
    }
    switch (status) {
      case "DRAFT":
      case "DRAFT_LOCKED":
        return { color: "bg-amber-500/15 text-amber-300 border-amber-400/40", icon: <Clock className="h-3 w-3" />, label: status === "DRAFT_LOCKED" ? "Locked" : "Draft" };
      case "SENT":
        return { color: "bg-cyan-500/15 text-cyan-300 border-cyan-400/40", icon: <Send className="h-3 w-3" />, label: "Sent" };
      case "PAID":
        return { color: "bg-emerald-500/15 text-emerald-300 border-emerald-400/40", icon: <DollarSign className="h-3 w-3" />, label: "Paid" };
      case "CANCELLED":
        return { color: "bg-rose-500/15 text-rose-300 border-rose-400/40", icon: <X className="h-3 w-3" />, label: "Cancelled" };
      default:
        return { color: "bg-slate-500/15 text-slate-300 border-slate-400/40", icon: null, label: status };
    }
  };

  const cfg = getConfig();

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}
