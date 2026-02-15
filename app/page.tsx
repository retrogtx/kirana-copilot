import { redirect } from "next/navigation";
import { getSession } from "../lib/auth";
import { TelegramLoginWidget } from "./telegram-login-widget";

export default async function Home() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <main className="flex flex-col items-center gap-8 px-6 py-16 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 text-2xl text-white dark:bg-white dark:text-zinc-900">
            K
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Kirana Copilot
          </h1>
          <p className="max-w-sm text-base text-zinc-500 dark:text-zinc-400">
            Your AI-powered kirana store assistant. Manage sales, inventory,
            udhar, and daily hisaab — all from Telegram.
          </p>
        </div>

        <div className="flex flex-col items-center gap-4">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Log in to view your dashboard
          </p>
          <TelegramLoginWidget />
        </div>

        <p className="max-w-xs text-xs text-zinc-400 dark:text-zinc-500">
          Start by chatting with the bot on Telegram. Your dashboard data will
          appear here once you log in.
        </p>
      </main>
    </div>
  );
}
