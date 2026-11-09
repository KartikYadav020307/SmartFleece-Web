"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/controls";
import {
  SmartFleeceLogo,
  IconDashboard,
  IconProduction,
  IconLots,
  IconScan,
  IconCustomers,
  IconOrders,
  IconQuality,
  IconInvoices,
  IconReports,
  IconSettings,
  IconMore,
  IconClose,
} from "@/components/icons";

interface NavItem {
  href: string;
  label: string;
  icon: (props: { size?: number; className?: string }) => React.JSX.Element;
  soon?: boolean;
}

const ALL_DESTINATIONS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: IconDashboard },
  { href: "/production", label: "Production Floor", icon: IconProduction },
  { href: "/lots", label: "Fiber Lots", icon: IconLots },
  { href: "/scan", label: "Scan QR", icon: IconScan },
  { href: "/customers", label: "Customers", icon: IconCustomers },
  { href: "/orders", label: "Orders", icon: IconOrders },
  { href: "/quality", label: "Quality & QC", icon: IconQuality },
  { href: "/invoices", label: "Invoices", icon: IconInvoices },
  { href: "/reports", label: "Reports", icon: IconReports, soon: true },
  { href: "/settings", label: "Settings", icon: IconSettings },
];

// Primary 4 mobile tabs (excluding More)
const MOBILE_PRIMARY: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: IconDashboard },
  { href: "/production", label: "Production", icon: IconProduction },
  { href: "/scan", label: "Scan", icon: IconScan },
  { href: "/lots", label: "Lots", icon: IconLots },
];

// Destinations placed in the mobile More sheet
const MOBILE_MORE_DESTINATIONS: NavItem[] = [
  { href: "/customers", label: "Customers", icon: IconCustomers },
  { href: "/orders", label: "Orders", icon: IconOrders },
  { href: "/quality", label: "Quality & QC", icon: IconQuality },
  { href: "/invoices", label: "Invoices", icon: IconInvoices },
  { href: "/reports", label: "Reports", icon: IconReports, soon: true },
  { href: "/settings", label: "Settings", icon: IconSettings },
];

function isRouteActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function Sidebar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const sheetCloseRef = useRef<HTMLButtonElement>(null);

  // Close More menu when route changes
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  // Handle Escape key to dismiss More sheet and restore focus
  useEffect(() => {
    if (!moreOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMoreOpen(false);
        moreTriggerRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    // Focus close button on open
    sheetCloseRef.current?.focus();

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [moreOpen]);

  // Close handler with focus restoration
  const handleCloseMore = () => {
    setMoreOpen(false);
    moreTriggerRef.current?.focus();
  };

  return (
    <>
      {/* ============================================================== */}
      {/* DESKTOP & TABLET VERTICAL ICON RAIL (>= 768px)                */}
      {/* Compact ~72px wide rail matching reference UI                 */}
      {/* ============================================================== */}
      <aside
        className="hidden md:flex md:w-18 md:shrink-0 flex-col items-center justify-between border-r border-line bg-white py-4 select-none z-30"
        aria-label="Main Navigation"
      >
        {/* Brand Mark at Top */}
        <div className="flex flex-col items-center gap-1 mb-4">
          <Link
            href="/dashboard"
            className="flex items-center justify-center w-11 h-11 rounded-2xl hover:bg-cream transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest/40"
            title="SmartFleece Home"
            aria-label="SmartFleece Home"
          >
            <SmartFleeceLogo size={28} className="text-forest" />
          </Link>
        </div>

        {/* Scrollable Navigation Destination Icons */}
        <nav className="flex-1 w-full px-2 flex flex-col items-center gap-2 overflow-y-auto py-1">
          {ALL_DESTINATIONS.filter((d) => d.href !== "/settings").map((item) => {
            const active = isRouteActive(pathname, item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label + (item.soon ? " (Coming Soon)" : "")}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={`group relative flex items-center justify-center w-11 h-11 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest/40 ${
                  active
                    ? "bg-dark-accent text-white rounded-full shadow-xs"
                    : "text-muted hover:text-ink hover:bg-cream rounded-xl"
                }`}
              >
                <Icon size={20} className={active ? "text-white" : "text-muted group-hover:text-ink"} />
                {item.soon && !active ? (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber" title="Coming soon" />
                ) : null}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Rail Section: Settings & Desktop Sign Out */}
        <div className="w-full px-2 pt-3 border-t border-line flex flex-col items-center gap-2">
          {/* Settings */}
          {(() => {
            const active = isRouteActive(pathname, "/settings");
            return (
              <Link
                href="/settings"
                title="Settings"
                aria-label="Settings"
                aria-current={active ? "page" : undefined}
                className={`flex items-center justify-center w-11 h-11 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest/40 ${
                  active
                    ? "bg-dark-accent text-white rounded-full shadow-xs"
                    : "text-muted hover:text-ink hover:bg-cream rounded-xl"
                }`}
              >
                <IconSettings size={20} className={active ? "text-white" : "text-muted"} />
              </Link>
            );
          })()}

          {/* Sign Out (Desktop Only) */}
          <LogoutButton
            iconOnly
            title="Sign out of SmartFleece"
            className="flex items-center justify-center w-11 h-11 rounded-xl text-muted hover:text-clay hover:bg-clay-soft transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay/40 cursor-pointer"
          />
        </div>
      </aside>

      {/* ============================================================== */}
      {/* MOBILE FIXED BOTTOM NAVIGATION BAR (< 768px)                  */}
      {/* 5 Ergonomic Touchpoints with Elevated Center Scan Action      */}
      {/* ============================================================== */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-line px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 shadow-lg flex items-center justify-around"
        aria-label="Mobile Navigation"
      >
        {MOBILE_PRIMARY.map((item) => {
          const active = isRouteActive(pathname, item.href);
          const Icon = item.icon;
          const isScan = item.href === "/scan";

          if (isScan) {
            return (
              <Link
                key={item.href}
                href="/scan"
                aria-label="Scan QR Code"
                aria-current={active ? "page" : undefined}
                className="group relative flex flex-col items-center justify-center -mt-5 min-h-[52px] min-w-[52px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest/40"
              >
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center shadow-md transition-transform active:scale-95 ${
                    active ? "bg-dark-accent text-white ring-2 ring-forest" : "bg-forest text-white"
                  }`}
                >
                  <IconScan size={22} className="text-white" />
                </div>
                <span className="text-[10px] font-semibold text-ink mt-0.5 tracking-tight">Scan</span>
              </Link>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center justify-center min-h-[48px] min-w-[56px] px-2 py-1 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest/40 ${
                active ? "text-forest font-semibold" : "text-muted hover:text-ink active:bg-cream"
              }`}
            >
              <Icon size={20} className={active ? "text-forest" : "text-muted"} />
              <span className="text-[11px] mt-0.5 leading-tight">{item.label}</span>
            </Link>
          );
        })}

        {/* 5th Button: More Destinations Trigger */}
        <button
          ref={moreTriggerRef}
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          aria-label="More navigation options"
          className={`flex flex-col items-center justify-center min-h-[48px] min-w-[56px] px-2 py-1 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest/40 cursor-pointer ${
            moreOpen ? "text-forest font-semibold" : "text-muted hover:text-ink active:bg-cream"
          }`}
        >
          <IconMore size={20} className={moreOpen ? "text-forest" : "text-muted"} />
          <span className="text-[11px] mt-0.5 leading-tight">More</span>
        </button>
      </nav>

      {/* ============================================================== */}
      {/* MOBILE ACCESSIBLE "MORE" SLIDE-UP SHEET                       */}
      {/* Contains remaining destinations and mobile logout             */}
      {/* ============================================================== */}
      {moreOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="All Mill Destinations"
          className="md:hidden fixed inset-0 z-50 flex flex-col justify-end"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 transition-opacity"
            onClick={handleCloseMore}
            aria-hidden="true"
          />

          {/* Sheet Surface */}
          <div className="relative z-10 w-full bg-white rounded-t-3xl border-t border-line shadow-2xl p-5 pb-[max(1.5rem,calc(env(safe-area-inset-bottom)+1rem))] max-h-[85vh] flex flex-col">
            {/* Sheet Header */}
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <SmartFleeceLogo size={20} className="text-forest" />
                <h2 className="text-base font-bold text-ink">Mill Operations Menu</h2>
              </div>
              <button
                ref={sheetCloseRef}
                type="button"
                onClick={handleCloseMore}
                aria-label="Close menu"
                className="w-10 h-10 rounded-xl flex items-center justify-center text-muted hover:text-ink hover:bg-cream transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest/40 cursor-pointer"
              >
                <IconClose size={20} />
              </button>
            </div>

            {/* Destination Grid / List */}
            <div className="overflow-y-auto py-3 space-y-1">
              {MOBILE_MORE_DESTINATIONS.map((item) => {
                const active = isRouteActive(pathname, item.href);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={handleCloseMore}
                    className={`flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-sm font-medium transition-colors min-h-[48px] ${
                      active
                        ? "bg-forest-soft text-forest-dark font-semibold"
                        : "text-ink hover:bg-cream active:bg-cream"
                    }`}
                  >
                    <Icon size={20} className={active ? "text-forest-dark" : "text-muted"} />
                    <span className="flex-1">{item.label}</span>
                    {item.soon ? (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-soft text-amber">
                        soon
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>

            {/* Sheet Footer: Mobile Sign Out */}
            <div className="pt-3 border-t border-line mt-auto">
              <LogoutButton
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-clay bg-clay-soft hover:bg-clay/20 transition-colors min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay/40 cursor-pointer"
              >
                Sign out of SmartFleece
              </LogoutButton>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
