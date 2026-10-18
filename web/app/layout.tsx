import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tickler, never miss a lease date",
  description: "An agent that reads your leases, remembers the deadlines hiding in them, and never lets one slip.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
