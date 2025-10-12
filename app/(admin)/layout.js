import { redirect } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { getSessionUser } from "@/lib/session";

export default async function AdminLayout({ children }) {
  const session = await getSessionUser();

  if (!session) {
    redirect("/login");
  }

  if (session.status === "suspend") {
    redirect("/login?error=suspended");
  }

  return (
    <div className="flex min-h-screen bg-slate-950">
      <Sidebar session={session} />
      <div className="flex flex-1 flex-col">
        <Header session={session} />
        <main className="flex-1 overflow-y-auto bg-slate-900 p-3 sm:p-4 md:p-6 lg:p-8 pb-20 md:pb-6">
          <div className="mx-auto max-w-[1920px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
