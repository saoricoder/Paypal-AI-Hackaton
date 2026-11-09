import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Deal2Pay AI — Autonomous Deal-to-Invoice Agent",
  description: "AI-powered deal extraction, document audit, and PayPal invoicing for the PayPal AI Hackathon 2026",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[#0B0F17] text-slate-100">
        {children}
      </body>
    </html>
  );
}
