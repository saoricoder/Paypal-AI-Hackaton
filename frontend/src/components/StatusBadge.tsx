/**
 * StatusBadge — Polymorphic badge component for audit and payment statuses.
 * Maps status strings to Tailwind color classes with appropriate animations.
 */

import { AuditStatus, PaymentStatus } from "@/types";
import { Check, X, Clock, Send, DollarSign } from "lucide-react";

interface StatusBadgeProps {
  status: AuditStatus | PaymentStatus | string;
  type?: "audit" | "payment";
}

export function StatusBadge({ status, type = "audit" }: StatusBadgeProps) {
  const getStatusConfig = () => {
    if (type === "audit") {
      switch (status) {
        case "PENDING":
          return {
            color: "bg-amber-500/20 text-amber-400 border-amber-500/30",
            icon: <Clock className="w-3 h-3" />,
            label: "Pending",
          };
        case "IN_PROGRESS":
          return {
            color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
            icon: <Clock className="w-3 h-3 animate-pulse" />,
            label: "In Progress",
          };
        case "APPROVED":
          return {
            color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
            icon: <Check className="w-3 h-3" />,
            label: "Approved",
          };
        case "FAILED":
          return {
            color: "bg-rose-500/20 text-rose-400 border-rose-500/30",
            icon: <X className="w-3 h-3" />,
            label: "Failed",
          };
        default:
          return {
            color: "bg-gray-500/20 text-gray-400 border-gray-500/30",
            icon: null,
            label: status,
          };
      }
    } else {
      // Payment status
      switch (status) {
        case "DRAFT":
        case "DRAFT_LOCKED":
          return {
            color: "bg-amber-500/20 text-amber-400 border-amber-500/30",
            icon: <Clock className="w-3 h-3" />,
            label: status === "DRAFT_LOCKED" ? "Draft (Locked)" : "Draft",
          };
        case "SENT":
          return {
            color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
            icon: <Send className="w-3 h-3" />,
            label: "Sent",
          };
        case "PAID":
          return {
            color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
            icon: <DollarSign className="w-3 h-3" />,
            label: "Paid",
          };
        case "CANCELLED":
          return {
            color: "bg-rose-500/20 text-rose-400 border-rose-500/30",
            icon: <X className="w-3 h-3" />,
            label: "Cancelled",
          };
        default:
          return {
            color: "bg-gray-500/20 text-gray-400 border-gray-500/30",
            icon: null,
            label: status,
          };
      }
    }
  };

  const config = getStatusConfig();

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.color}`}
    >
      {config.icon}
      {config.label}
    </span>
  );
}
