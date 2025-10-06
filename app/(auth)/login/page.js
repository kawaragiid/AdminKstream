import { redirect } from "next/navigation";
import LoginForm from "@/components/auth/LoginForm";
import { getSessionUser } from "@/lib/session";

export const metadata = {
  title: "Masuk",
};

export default async function LoginPage({ searchParams }) {
  const session = await getSessionUser();
  if (session) {
    redirect("/");
  }

  return <LoginForm errorCode={searchParams?.error} />;
}
