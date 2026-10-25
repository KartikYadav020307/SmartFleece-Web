import { requireUser } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import { LogoutButton } from "@/components/controls";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const roleLabel = user.role === "OWNER" ? "Mill Owner" : user.role === "ACCOUNTANT" ? "Accountant" : "Worker";

  return (
    <div className="min-h-screen flex md:flex-row flex-col">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-line bg-parchment px-4 py-2.5">
          <p className="text-sm text-muted">
            <span className="font-semibold text-ink">Your Mill</span> · fiber processing floor
          </p>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-semibold text-ink leading-tight">{user.name}</p>
              <p className="text-[11px] text-muted">{roleLabel}</p>
            </div>
            <LogoutButton />
          </div>
        </header>
        <main className="flex-1 w-full max-w-[1440px] mx-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
