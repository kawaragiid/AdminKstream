import { redirect } from "next/navigation";
import NotificationCenter from "@/components/notifications/NotificationCenter";
import { listNotifications } from "@/lib/notificationsService";
import { getSessionUser } from "@/lib/session";

export const metadata = {
  title: "Notifikasi",
};

export default async function NotificationsPage() {
  const session = await getSessionUser();
  if (!session) {
    redirect("/login");
  }

  const notifications = await listNotifications({ limit: 25 });

  return <NotificationCenter initialNotifications={notifications} />;
}
