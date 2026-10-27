"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "🏡" },
  { href: "/customers", label: "Customers", icon: "👥" },
  { href: "/orders", label: "Orders", icon: "🧾" },
  { href: "/lots", label: "Fiber Lots", icon: "🧶" },
  { href: "/production", label: "Production", icon: "🏭" },
  { href: "/scan", label: "Scan QR", icon: "📷" },
  { href: "/quality", label: "Quality", icon: "🚩" },
  { href: "/invoices", label: "Invoices", icon: "💰" },
  { href: "/reports", label: "Reports", icon: "📈", soon: true },
  { href: "/settings", label: "Settings", icon: "🔧" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-56 md:shrink-0 flex-col border-r border-line bg-parchment">
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-line">
          <span className="text-2xl" aria-hidden>
            🐑
          </span>
          <div>
            <p className="font-bold text-ink leading-tight">SmartFleece</p>
            <p className="text-[11px] text-muted">Mill Operations</p>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active ? "bg-forest text-white" : "text-ink/80 hover:bg-cream"
                }`}
              >
                <span aria-hidden>{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {item.soon ? (
                  <span
                    className={`text-[10px] uppercase font-bold ${
                      active ? "text-white/70" : "text-muted"
                    }`}
                  >
                    soon
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <p className="px-4 py-3 text-[11px] text-muted border-t border-line">
          Every gram of fiber has a story.
        </p>
      </aside>

      {/* Mobile nav strip */}
      <nav className="md:hidden flex gap-1 overflow-x-auto border-b border-line bg-parchment px-2 py-1.5">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${
                active ? "bg-forest text-white" : "text-ink/80 hover:bg-cream"
              }`}
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
