"use client";

import { PublicHeader } from "@/components/shell";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicHeader />
      {children}
    </>
  );
}
