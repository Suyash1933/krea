import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function Home() {
  const { userId } = await auth(); // ✅ await added

  if (!userId) {
    redirect("/sign-in");
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Welcome to NextFlow</h1>
      <Link href="/workflow">Go to Workflow</Link>
    </div>
  );
}