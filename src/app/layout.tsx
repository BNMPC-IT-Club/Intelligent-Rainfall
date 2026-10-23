import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Intelligent Rainfall — Rainwater Planning for Bangladesh",
  description: "Estimate rooftop rainwater harvesting potential, plan storage, and explore rainfall data with transparent assumptions and provenance.",
  applicationName: "Intelligent Rainfall",
  keywords: ["rainwater harvesting", "rainfall analysis", "Bangladesh", "water storage planner"],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
