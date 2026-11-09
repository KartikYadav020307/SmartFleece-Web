import { requireUser } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import { SmartFleeceLogo } from "@/components/icons";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const roleLabel =
    user.role === "OWNER" ? "Mill Owner" : user.role === "ACCOUNTANT" ? "Accountant" : "Worker";

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-cream">
      {/* Responsive Navigation: Desktop Icon Rail + Mobile Bottom Bar */}
      <Sidebar />

      {/* Main Viewport Container */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Compact, Solid White Header (No duplicate logout button) */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-white px-4 md:px-8 py-3.5 select-none shadow-xs">
          {/* Brand Identity & Mill Context */}
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile Brand Identity */}
            <div className="md:hidden flex items-center gap-2">
              <SmartFleeceLogo size={22} className="text-forest" />
              <span className="font-bold text-ink text-sm tracking-tight">SmartFleece</span>
            </div>

            {/* Desktop Mill Status & Context */}
            <div className="hidden md:block min-w-0">
              <p className="text-sm font-semibold text-ink leading-tight truncate">
                <span className="text-forest">Your Mill</span> · Fiber Processing Floor
              </p>
              <p className="text-xs text-muted truncate mt-0.5">
                Every gram of fiber has an authentic story
              </p>
            </div>
          </div>

          {/* User Profile & Role (Logout resides in Desktop Rail & Mobile More Menu) */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="text-right">
              <p className="text-xs sm:text-sm font-semibold text-ink leading-tight">{user.name}</p>
              <p className="text-[11px] text-muted leading-tight mt-0.5">{roleLabel}</p>
            </div>
            <div
              className="w-8 h-8 rounded-full bg-forest-soft border border-line flex items-center justify-center text-xs font-bold text-forest-dark uppercase tracking-wider"
              aria-hidden="true"
            >
              {user.name.slice(0, 2)}
            </div>
          </div>
        </header>

        {/* Content Frame with Safe Clearance for Mobile Bottom Bar */}
        <main className="flex-1 min-w-0 w-full max-w-[1440px] mx-auto p-4 md:p-6 lg:p-8 pb-24 md:pb-8">
          {children}
        </main>
      </div>
    </div>
  );
}
