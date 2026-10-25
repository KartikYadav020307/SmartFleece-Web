import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center">
        <p className="text-4xl mb-3" aria-hidden>
          🐑
        </p>
        <h1 className="text-xl font-bold text-ink">Page not found</h1>
        <p className="text-sm text-muted mt-1">The page you're looking for doesn't exist or was moved.</p>
        <Link href="/dashboard" className="btn-primary inline-flex mt-4">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
