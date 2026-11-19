"use client";

import {
  displayUser,
  setAppointmentStatus,
  useBookItState,
} from "@bookit/api-client";
import { appointmentStatus } from "@bookit/ui";
import { formatDateTime, formatMoney } from "@bookit/utils";
import Link from "next/link";
import { use } from "react";
import { Badge, Button, Empty } from "@/components/ui";
import { useAuth } from "@/lib/session";

export default function BookingDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const auth = useAuth();
  const state = useBookItState();
  const apt = state.appointments.find((a) => a.id === id);

  if (!apt || (auth.userId && apt.customerId !== auth.userId && !auth.user?.isPlatformAdmin)) {
    return <Empty title="Booking not found" body="Check your bookings list for active appointments." />;
  }

  const biz = state.businesses.find((b) => b.id === apt.businessId);
  const svc = state.services.find((s) => s.id === apt.serviceId);
  const emp = state.employees.find((e) => e.id === apt.employeeId);
  const st = appointmentStatus(apt.status);

  return (
    <div className="panel stack" style={{ maxWidth: 680 }}>
      <Link href="/bookings" className="tiny">
        ← Back to My Bookings
      </Link>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>{svc?.name ?? "Appointment"}</h1>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <div>
          <span className="muted">Business:</span>{" "}
          <Link href={`/business/${apt.businessId}`} style={{ fontWeight: 600 }}>
            {biz?.name}
          </Link>
        </div>
        <div>
          <span className="muted">Specialist:</span> {emp ? displayUser(state, emp.userId) : "Staff"}
        </div>
        <div className="tabular">
          <span className="muted">When:</span> {formatDateTime(apt.start)}
        </div>
        <div className="tabular">
          <span className="muted">Price:</span> {formatMoney(apt.price)} ({apt.paymentStatus})
        </div>
        <div className="tiny">{biz?.cancellationPolicy}</div>
      </div>
      {(apt.status === "pending" || apt.status === "confirmed") && auth.userId ? (
        <div className="row">
          <Button tone="danger" onClick={() => setAppointmentStatus(apt.id, "cancelled", auth.userId!)}>
            Cancel booking
          </Button>
          <Link href={`/book/${apt.businessId}`} className="btn ghost">
            Book again
          </Link>
        </div>
      ) : null}
    </div>
  );
}
