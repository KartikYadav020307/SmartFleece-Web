"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconLogout } from "@/components/icons";

/**
 * Two-step inline confirmation (no accidental destructive clicks, no modal
 * dependency).
 */
export function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = "Confirm?",
  className = "btn-danger btn-sm",
  disabled = false,
  title,
}: {
  onConfirm: () => Promise<void> | void;
  children: React.ReactNode;
  confirmLabel?: string;
  className?: string;
  disabled?: boolean;
  title?: string;
}) {
  const [arming, setArming] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      className={className}
      disabled={disabled || busy}
      title={title}
      onClick={async () => {
        if (!arming) {
          setArming(true);
          setTimeout(() => setArming(false), 4000);
          return;
        }
        setBusy(true);
        try {
          await onConfirm();
        } finally {
          setBusy(false);
          setArming(false);
        }
      }}
    >
      {busy ? "Working…" : arming ? confirmLabel : children}
    </button>
  );
}

export function LogoutButton({
  className = "btn-ghost btn-sm",
  children,
  iconOnly = false,
  title = "Sign out",
}: {
  className?: string;
  children?: React.ReactNode;
  iconOnly?: boolean;
  title?: string;
} = {}) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      aria-label={title}
      title={title}
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
        router.refresh();
      }}
    >
      {children ? (
        children
      ) : iconOnly ? (
        <IconLogout size={18} aria-hidden="true" />
      ) : (
        "Sign out"
      )}
    </button>
  );
}

export function CopyLink({ path, label }: { path: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn-secondary btn-sm"
      onClick={async () => {
        const url = `${window.location.origin}${path}`;
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          window.prompt("Copy this link:", url);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? "✓ Copied" : label ?? "Copy link"}
    </button>
  );
}

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button type="button" className="btn-secondary btn-sm" onClick={() => window.print()}>
      {label}
    </button>
  );
}
