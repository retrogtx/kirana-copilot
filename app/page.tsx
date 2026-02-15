import { redirect } from "next/navigation";
import { getSession } from "../lib/auth";

export default async function Home() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Hero ─────────────────────────────────────────── */}
      <header className="flex flex-col items-center px-6 pt-20 pb-16 sm:pt-28 sm:pb-20">
        <p className="fade-up text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
          Telegram Bot for Kirana Stores
        </p>
        <h1 className="fade-up fade-up-1 mt-4 max-w-xl text-center text-[36px] font-bold leading-[1.1] tracking-tight sm:text-[52px]">
          Your entire store, one conversation away
        </h1>
        <p className="fade-up fade-up-2 mt-4 max-w-md text-center text-base leading-relaxed text-muted sm:text-lg">
          Manage sales, inventory, and credit ledger through voice or text on Telegram. Powered by AI.
        </p>
        <div className="fade-up fade-up-3 mt-8 flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
          <a
            href="https://t.me/KhataCopilotBot"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2.5 rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90"
          >
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-[18px] w-[18px]"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.02-1.96 1.25-5.54 3.66-.52.36-1 .53-1.42.52-.47-.01-1.37-.26-2.03-.48-.82-.27-1.47-.42-1.42-.88.03-.24.37-.49 1.02-.75 3.99-1.74 6.65-2.89 7.99-3.44 3.81-1.58 4.6-1.86 5.12-1.87.11 0 .37.03.53.17.14.12.18.28.2.45-.01.06.01.24 0 .37z" />
            </svg>
            Open on Telegram
          </a>
          <a
            href="/dashboard"
            className="text-sm text-muted transition-colors hover:text-foreground"
          >
            Already using? View dashboard &rarr;
          </a>
        </div>
      </header>

      {/* ── How it works ─────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
        <p className="fade-up text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
          How it works
        </p>
        <h2 className="fade-up fade-up-1 mt-3 text-[22px] font-semibold tracking-tight sm:text-[28px]">
          Talk to it, and it gets done
        </h2>

        <div className="mt-12 grid gap-12 sm:grid-cols-3 sm:gap-8">
          {/* Step 1 */}
          <div className="fade-up fade-up-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-xs font-semibold text-muted">
              1
            </div>
            <h3 className="mt-4 text-[15px] font-semibold">
              Open the bot on Telegram
            </h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
              Search for @KhataCopilotBot and send /start. Setup takes 30 seconds.
            </p>
          </div>

          {/* Step 2 */}
          <div className="fade-up fade-up-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-xs font-semibold text-muted">
              2
            </div>
            <h3 className="mt-4 text-[15px] font-semibold">
              Send text or voice in any language
            </h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
              Type or speak naturally in Hindi, English, or Hinglish. The bot understands and confirms every action.
            </p>
          </div>

          {/* Step 3 */}
          <div className="fade-up fade-up-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-xs font-semibold text-muted">
              3
            </div>
            <h3 className="mt-4 text-[15px] font-semibold">
              Everything gets tracked automatically
            </h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
              Sales, stock, credit — all recorded automatically. View it anytime on the dashboard.
            </p>
          </div>
        </div>

        {/* Example conversations */}
        <div className="mt-16">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
            Real examples
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <ConversationExample
              user="Maggi 12 bik gayi 360 mein"
              bot="Sale recorded: Maggi x12 = ₹360"
            />
            <ConversationExample
              user="Ramesh ko 450 udhar likh do"
              bot="Udhar added: Ramesh ₹450. Total pending: ₹1,200"
            />
            <ConversationExample
              user="Kya khatam ho raha hai?"
              bot="Low stock: Maggi (2 left), Surf (1 left), Doodh (0)"
            />
            <ConversationExample
              user="Aaj ka hisaab dikhao"
              bot="Revenue: ₹4,230 | Sales: 47 items | New udhar: ₹450"
            />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-6">
        <div className="section-divider" />
      </div>

      {/* ── Features ─────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
        <p className="fade-up text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
          Features
        </p>
        <h2 className="fade-up fade-up-1 mt-3 text-[22px] font-semibold tracking-tight sm:text-[28px]">
          Everything you need, built in
        </h2>

        <div className="mt-10 grid gap-x-12 gap-y-8 sm:grid-cols-2">
          <Feature
            title="Voice notes"
            description="Send a voice note and the bot understands it. Works in Hindi, English, and Hinglish."
          />
          <Feature
            title="Inventory tracking"
            description="Real-time stock levels with low-stock alerts. Check what's running out anytime."
          />
          <Feature
            title="Credit ledger"
            description="Track who owes what and who has paid. Automatic payment reminders included."
          />
          <Feature
            title="Daily summary"
            description="End-of-day overview — revenue, sales count, credit, collections. Your whole day in one message."
          />
          <Feature
            title="Multi-user access"
            description="Share invite codes with your team. Everyone can manage the same store together."
          />
          <Feature
            title="Smart reorder"
            description="Get reorder suggestions based on stock levels and recent sales patterns."
          />
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-6">
        <div className="section-divider" />
      </div>

      {/* ── Built with ───────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-6 py-16 text-center sm:py-20">
        <p className="text-[12px] text-muted">
          Built for the Build India Hackathon. Powered by Claude AI.
        </p>
      </section>

      {/* ── Footer CTA ───────────────────────────────────── */}
      <footer className="border-t border-border px-6 py-12 sm:py-16">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-5">
          <h2 className="text-[20px] font-semibold tracking-tight sm:text-[24px]">
            Try it now — it&apos;s free
          </h2>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
            <a
              href="https://t.me/KhataCopilotBot"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90"
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-[18px] w-[18px]"
              >
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.02-1.96 1.25-5.54 3.66-.52.36-1 .53-1.42.52-.47-.01-1.37-.26-2.03-.48-.82-.27-1.47-.42-1.42-.88.03-.24.37-.49 1.02-.75 3.99-1.74 6.65-2.89 7.99-3.44 3.81-1.58 4.6-1.86 5.12-1.87.11 0 .37.03.53.17.14.12.18.28.2.45-.01.06.01.24 0 .37z" />
              </svg>
              Open on Telegram
            </a>
            <a
              href="/dashboard"
              className="text-sm text-muted transition-colors hover:text-foreground"
            >
              Sign in to dashboard &rarr;
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function ConversationExample({ user, bot }: { user: string; bot: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="chat-bubble self-start">
        <p className="font-mono text-[13px] text-foreground">{user}</p>
      </div>
      <div className="chat-reply self-end">
        <p className="text-[12px] text-muted">{bot}</p>
      </div>
    </div>
  );
}

function Feature({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h3 className="text-[14px] font-semibold">{title}</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        {description}
      </p>
    </div>
  );
}
