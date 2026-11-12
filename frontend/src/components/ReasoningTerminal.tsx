/**
 * ReasoningTerminal — Dark terminal UI that streams the agent's reasoning log.
 * Displays each line with a typewriter effect and colored status glyphs.
 */

import { useEffect, useState } from "react";
import { Check, X, Circle } from "lucide-react";

interface ReasoningTerminalProps {
  logs: string[];
}

export function ReasoningTerminal({ logs }: ReasoningTerminalProps) {
  const [visibleLogs, setVisibleLogs] = useState<string[]>([]);

  // Staggered reveal with typewriter effect
  useEffect(() => {
    let index = 0;
    setVisibleLogs([]);

    const interval = setInterval(() => {
      if (index < logs.length) {
        setVisibleLogs((prev) => [...prev, logs[index]]);
        index++;
      } else {
        clearInterval(interval);
      }
    }, 150); // 150ms delay between lines

    return () => clearInterval(interval);
  }, [logs]);

  const getGlyph = (log: string) => {
    if (log.startsWith("✓") || /^\[(OpenCV|Gemini Audit|PayPal Gate)\]/.test(log)) return <Check className="w-3 h-3 text-emerald-400" />;
    if (log.startsWith("✗")) return <X className="w-3 h-3 text-red-400" />;
    return <Circle className="w-3 h-3 text-yellow-400" />;
  };

  const getLineClass = (log: string) => {
    if (log.startsWith("✓") || /^\[(OpenCV|Gemini Audit|PayPal Gate)\]/.test(log)) return "text-emerald-400";
    if (log.startsWith("✗")) return "text-red-400";
    return "text-yellow-400";
  };

  return (
    <div className="bg-gray-950 rounded-lg border border-gray-800 p-4 h-64 overflow-y-auto">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-800">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-xs font-mono text-gray-400">Agent Reasoning Log</span>
      </div>
      <div className="space-y-1.5 font-mono text-xs">
        {visibleLogs.map((log, idx) => (
          <div key={idx} className="flex items-start gap-2 opacity-0 animate-fade-in" style={{ animationDelay: `${idx * 50}ms`, animationFillMode: "forwards" }}>
            <span className="mt-0.5 flex-shrink-0">{getGlyph(log)}</span>
            <span className={getLineClass(log)}>{log.startsWith("✓") || log.startsWith("✗") ? log.substring(2) : log}</span>
          </div>
        ))}
        {visibleLogs.length === 0 && (
          <div className="text-gray-600 italic">Waiting for audit results...</div>
        )}
      </div>
    </div>
  );
}
