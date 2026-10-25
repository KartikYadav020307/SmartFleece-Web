import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SmartFleece — Fiber Mill Operations",
  description:
    "QR-based production, lot traceability and customer visibility for small-scale fiber mills.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
