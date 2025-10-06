import { redirect } from "next/navigation";
import AuditLogTable from "@/components/logs/AuditLogTable";
import { listAuditLogs } from "@/lib/auditService";
import { getSessionUser } from "@/lib/session";

export const metadata = {
  title: "Audit Log",
};

export default async function LogsPage() {
  const session = await getSessionUser();
  if (!session) {
    redirect("/login");
  }

  if (!["super-admin", "admin"].includes(session.role)) {
    redirect("/");
  }

  const logs = await listAuditLogs({ limit: 100 });

  return <AuditLogTable initialLogs={logs} />;
}
