"use client";

import type { Tone } from "@bookit/design-system";
import { formatMoney } from "@bookit/utils";

export function Mark() {
  return (
    <span className="mark" aria-hidden>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M5 7.5 12 4l7 3.5v9L12 20l-7-3.5v-9Z" stroke="white" strokeWidth="1.8" />
        <path d="m8 12 2.5 2.5L16 9" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </span>
  );
}

const icons: Record<string, string> = {
  home: "M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z",
  compass: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm3.2-12.2-1.4 4.4-4.4 1.4 1.4-4.4 4.4-1.4Z",
  calendar: "M7 3v3M17 3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z",
  heart: "M12 20s-7-4.4-7-9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 4.6-7 9-7 9Z",
  user: "M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-7 8a7 7 0 0 1 14 0",
  bag: "M6 8h12l-1 12H7L6 8Zm3 0a3 3 0 0 1 6 0",
  package: "M3 8l9-4 9 4-9 4-9-4Zm0 0v8l9 4 9-4V8",
  chart: "M4 19V5M4 19h16M8 15l3-4 3 2 4-6",
  bell: "M6 16h12l-1.2-2.2A6 6 0 0 1 16 9.5V9a4 4 0 0 0-8 0v.5a6 6 0 0 1-.8 4.3L6 16Zm4 2a2 2 0 0 0 4 0",
  clipboard: "M9 4h6a2 2 0 0 1 2 2v1H7V6a2 2 0 0 1 2-2Zm-2 3h10v13H7V7Z",
  spark: "M12 3l1.6 5.2L19 10l-5.4 1.8L12 17l-1.6-5.2L5 10l5.4-1.8L12 3Z",
  users: "M9 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm7-1a2.5 2.5 0 1 0-2.5-2.5A2.5 2.5 0 0 0 16 10ZM4 19a5 5 0 0 1 10 0M14 19a4 4 0 0 1 6 0",
  megaphone: "M4 10v4l10 3V7L4 10Zm10 1.2V16a3 3 0 0 1-2 2.8",
  settings: "M12 15.5A3.5 3.5 0 1 0 8.5 12 3.5 3.5 0 0 0 12 15.5ZM4 12h2M18 12h2M12 4v2M12 18v2",
  inbox: "M3 12h5l2 3h4l2-3h5v7H3v-7Zm0 0 2-7h14l2 7",
  store: "M4 10h16l-1 10H5L4 10Zm1-3h14l1 3H4l1-3Zm3 6v4",
  layers: "M12 3 3 8l9 5 9-5-9-5Zm-9 8 9 5 9-5M3 16l9 5 9-5",
  card: "M3 7h18v10H3V7Zm0 3h18",
  wallet: "M3 7h16a2 2 0 0 1 2 2v8H5a2 2 0 0 1-2-2V7Zm12 5h4",
  flag: "M5 4v16M5 5h10l-1.5 3L15 11H5",
  star: "m12 3 2.4 5.2 5.6.6-4.2 3.8 1.2 5.5L12 15.8 6.9 18.1 8.1 12.6 4 8.8l5.6-.6L12 3Z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 4 4",
};

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const d = icons[name] ?? icons.spark;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d={d} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function Button({
  children,
  tone = "primary",
  small,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "ghost" | "soft" | "danger"; small?: boolean }) {
  return (
    <button type={type} className={`btn ${tone === "primary" ? "" : tone} ${small ? "small" : ""}`} {...props}>
      {children}
    </button>
  );
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`badge tone-${tone}`}>{children}</span>;
}

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error ? <small>{error}</small> : null}
    </label>
  );
}

export function Money({ amount }: { amount: number }) {
  return <span>{formatMoney(amount)}</span>;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-back" role="presentation" onClick={onClose}>
      <div className="panel modal" role="dialog" aria-modal aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <Button tone="ghost" small onClick={onClose}>
            Close
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Bars({ points }: { points: { label: string; value: number }[] }) {
  const max = Math.max(...points.map((point) => point.value), 1);
  return (
    <div>
      <div className="bars" aria-hidden>
        {points.map((point) => (
          <div key={point.label} className="bar" style={{ height: `${Math.max(8, (point.value / max) * 100)}%` }} title={`${point.label}: ${point.value}`} />
        ))}
      </div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        {points.map((point) => (
          <span key={point.label} className="tiny">
            {point.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <p className="muted">{body}</p>
    </div>
  );
}
