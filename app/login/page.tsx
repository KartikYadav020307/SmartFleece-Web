import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <span className="text-4xl" aria-hidden>
            🐑
          </span>
          <h1 className="text-2xl font-bold text-ink mt-2">SmartFleece</h1>
          <p className="text-sm text-muted">Sign in to the mill operations platform</p>
        </div>
        <LoginForm />
        <div className="card mt-4 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
            Development seed accounts
          </p>
          <p className="text-xs text-muted leading-relaxed">
            Owner: <code className="text-ink">owner@smartfleece.local</code> · password{" "}
            <code className="text-ink">demo1234</code>
            <br />
            Worker: <code className="text-ink">worker@smartfleece.local</code> · password{" "}
            <code className="text-ink">demo1234</code>
          </p>
          <p className="text-[11px] text-muted mt-2">
            These are sample accounts created by the seed script — change or remove them before
            real use.
          </p>
        </div>
      </div>
    </div>
  );
}
