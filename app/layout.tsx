import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Due Diligence VTEX",
  description:
    "Sistema SaaS para gestão de due diligence de vendors e partners com foco em governança, risco e compliance.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
