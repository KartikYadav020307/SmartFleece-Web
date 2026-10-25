import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, EmptyState, PageHeader, SampleBadge } from "@/components/ui";
import SearchBox from "@/components/SearchBox";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireUser();
  const { q } = await searchParams;
  const search = q?.trim() ?? "";

  const customers = await prisma.customer.findMany({
    where: search
      ? {
          OR: [
            { name: { contains: search } },
            { farmName: { contains: search } },
            { email: { contains: search } },
            { location: { contains: search } },
          ],
        }
      : {},
    orderBy: { name: "asc" },
    include: { _count: { select: { orders: true, lots: true } } },
  });

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Fiber profiles that persist across seasons and clips."
        actions={
          <Link href="/customers/new" className="btn-primary">
            + New Customer
          </Link>
        }
      />
      <Card padded={false}>
        <div className="p-3 border-b border-line">
          <SearchBox placeholder="Search by name, farm, email or location…" />
        </div>
        {customers.length === 0 ? (
          <EmptyState
            icon="👥"
            title={search ? `No customers match "${search}"` : "No customers yet"}
            description={
              search
                ? "Try a different search, or clear it to see all customers."
                : "Customers keep their fiber profile, preferences and full lot history across seasons."
            }
            action={
              !search ? (
                <Link href="/customers/new" className="btn-primary">
                  Add your first customer
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Name</th>
                  <th className="th">Farm</th>
                  <th className="th">Location</th>
                  <th className="th">Contact</th>
                  <th className="th">Orders</th>
                  <th className="th">Lots</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-cream/60">
                    <td className="td">
                      <Link href={`/customers/${c.id}`} className="font-semibold text-forest hover:underline">
                        {c.name}
                      </Link>
                      {c.isSample ? <span className="ml-2"><SampleBadge /></span> : null}
                    </td>
                    <td className="td text-muted">{c.farmName ?? "—"}</td>
                    <td className="td text-muted">{c.location ?? "—"}</td>
                    <td className="td text-muted">
                      {c.email ?? c.phone ?? "—"}
                    </td>
                    <td className="td">{c._count.orders}</td>
                    <td className="td">{c._count.lots}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
