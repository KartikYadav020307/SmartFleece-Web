"use client";

import { useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

/** Updates the `q` query param for the current page (server-side filtering). */
export default function SearchBox({ placeholder = "Search…" }: { placeholder?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");

  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const next = new URLSearchParams(params.toString());
        if (value.trim()) next.set("q", value.trim());
        else next.delete("q");
        router.push(`${pathname}?${next.toString()}`);
      }}
    >
      <input
        className="input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label="Search"
      />
      <button type="submit" className="btn-secondary">
        Search
      </button>
      {params.get("q") ? (
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            setValue("");
            const next = new URLSearchParams(params.toString());
            next.delete("q");
            router.push(`${pathname}?${next.toString()}`);
          }}
        >
          Clear
        </button>
      ) : null}
    </form>
  );
}
