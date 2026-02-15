import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Palmas Lake CRM",
  description: "Sistema de CRM Palmas Lake",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
