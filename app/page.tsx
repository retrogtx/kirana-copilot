import { redirect } from "next/navigation";
import { getSession } from "../lib/auth";
import { TelegramLoginWidget } from "./telegram-login-widget";

export default async function Home() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <div className="noise-bg relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background">
      {/* Background gradient orbs */}
      <div className="pointer-events-none absolute -top-40 right-0 h-[500px] w-[500px] rounded-full bg-amber-500/5 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-20 -left-20 h-[400px] w-[400px] rounded-full bg-orange-500/5 blur-[100px]" />

      <main className="relative z-10 flex flex-col items-center gap-12 px-6 py-20">
        {/* Logo mark */}
        <div className="fade-up flex flex-col items-center gap-6">
          <div className="glow-amber flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-2xl font-bold text-white shadow-lg">
            K
          </div>
          <div className="flex flex-col items-center gap-2">
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              Kirana Copilot
            </h1>
            <p className="max-w-md text-center text-lg leading-relaxed text-muted">
              Apni dukaan ka hisaab-kitaab, <span className="text-accent">AI ke saath</span>.
              Voice ya text — dono se chalao.
            </p>
          </div>
        </div>

        {/* Features */}
        <div className="fade-up fade-up-2 grid max-w-lg grid-cols-2 gap-3 text-sm">
          <FeaturePill icon="📦" text="Inventory tracking" />
          <FeaturePill icon="📊" text="Sales analytics" />
          <FeaturePill icon="📒" text="Udhar ledger" />
          <FeaturePill icon="🎤" text="Voice commands" />
        </div>

        {/* Login */}
        <div className="fade-up fade-up-3 flex flex-col items-center gap-3">
          <p className="text-xs font-medium uppercase tracking-widest text-muted">
            Sign in with Telegram
          </p>
          <TelegramLoginWidget />
        </div>

        {/* Footer hint */}
        <p className="fade-up fade-up-4 max-w-xs text-center text-xs leading-relaxed text-muted/60">
          Pehle Telegram pe bot se baat karo, phir yahan login karke apna dashboard dekho.
        </p>
      </main>
    </div>
  );
}

function FeaturePill({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-muted">
      <span>{icon}</span>
      <span>{text}</span>
    </div>
  );
}
