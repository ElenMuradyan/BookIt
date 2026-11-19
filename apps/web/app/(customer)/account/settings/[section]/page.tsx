"use client";

import { use } from "react";
import { AccountView } from "@/components/AccountView";

export default function AccountSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = use(params);
  return <AccountView initialSection={section} />;
}
