import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import Navigation from "@/components/Navigation";
import Chatbot from "@/components/Chatbot";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk" });

export const metadata: Metadata = {
  title: "VoltAgg • Sub-ms Volatility Detection in HFT",
  description: "High-Throughput Non-Blocking Temporal Aggregation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${spaceGrotesk.variable} antialiased bg-slate-950 text-slate-100`}>
        <Navigation />
        {children}
        <Chatbot />
        <footer className="bg-black py-12 border-t border-slate-800 mt-20">
          <div className="max-w-screen-2xl mx-auto px-8 text-xs text-slate-400 flex justify-between items-end">
            <div>
              Real-time prices powered by Binance WS + Groq AI API.<br />
              Comprehensive JS data structures for Sub-ms Tracking.
            </div>
            <div className="text-right">VoltAgg Advanced Agentic Build.</div>
          </div>
        </footer>
      </body>
    </html>
  );
}
