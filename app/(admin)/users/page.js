import { redirect } from "next/navigation";
import UserTable from "@/components/users/UserTable";
import { listUsers } from "@/lib/usersService";
import { getSessionUser } from "@/lib/session";

export const metadata = {
  title: "Pengguna",
};

export default async function UsersPage() {
  const session = await getSessionUser();
  if (!session) {
    redirect("/login");
  }

  if (!["super-admin", "admin"].includes(session.role)) {
    redirect("/");
  }

  const { users } = await listUsers({ limit: 100 });

  return <UserTable initialUsers={users} />;
}
