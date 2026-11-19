"use client";

import { use } from "react";
import { BusinessProfileView } from "@/components/BusinessProfileView";

export default function ExploreBusinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <BusinessProfileView id={id} />;
}
