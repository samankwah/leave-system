import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/session";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  if (await getCurrentUser()) redirect("/dashboard");
  return <LoginForm justReset={(await searchParams).reset === "1"} />;
}
