"use client";

import { CustomerShell } from "@/components/shell";

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return <CustomerShell>{children}</CustomerShell>;
}
