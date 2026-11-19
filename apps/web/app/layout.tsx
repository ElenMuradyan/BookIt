import type { Metadata } from "next";
import { AuthProvider } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "BookIt",
  description: "Book appointments and shop local businesses.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
