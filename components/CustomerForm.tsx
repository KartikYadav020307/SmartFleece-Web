"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui";

export type CustomerInitial = {
  id?: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  farmName?: string | null;
  location?: string | null;
  preferences?: string | null;
  notes?: string | null;
};

export default function CustomerForm({ initial }: { initial?: CustomerInitial }) {
  const router = useRouter();
  const editing = Boolean(initial?.id);
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    farmName: initial?.farmName ?? "",
    location: initial?.location ?? "",
    preferences: initial?.preferences ?? "",
    notes: initial?.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <form
      className="card p-5 space-y-4 max-w-2xl"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setBusy(true);
        try {
          const res = await fetch(editing ? `/api/customers/${initial!.id}` : "/api/customers", {
            method: editing ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
          });
          const data = await res.json();
          if (!res.ok) {
            setError(data.error ?? "Save failed");
            return;
          }
          router.push(`/customers/${data.customer.id}`);
          router.refresh();
        } catch {
          setError("Network error — please retry.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Name *">
          <input className="input" value={form.name} onChange={set("name")} required maxLength={120} />
        </Field>
        <Field label="Email">
          <input className="input" type="email" value={form.email} onChange={set("email")} />
        </Field>
        <Field label="Phone">
          <input className="input" value={form.phone} onChange={set("phone")} />
        </Field>
        <Field label="Farm Name">
          <input className="input" value={form.farmName} onChange={set("farmName")} />
        </Field>
        <Field label="Location">
          <input className="input" value={form.location} onChange={set("location")} placeholder="Town, region" />
        </Field>
      </div>
      <Field label="Processing Preferences" hint="Saved as a template for future orders (e.g. '2-ply fingering, no wash additive')">
        <textarea className="input min-h-20" value={form.preferences} onChange={set("preferences")} />
      </Field>
      <Field label="Internal Notes" hint="Mill-owner observations, not visible to the customer">
        <textarea className="input min-h-20" value={form.notes} onChange={set("notes")} />
      </Field>
      {error ? (
        <p className="text-sm text-clay bg-clay-soft rounded-lg px-3 py-2" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Saving…" : editing ? "Save changes" : "Create customer"}
        </button>
        <button type="button" className="btn-secondary" onClick={() => router.back()}>
          Cancel
        </button>
      </div>
    </form>
  );
}
