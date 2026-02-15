export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed] antialiased">
      {/* Nav skeleton */}
      <nav className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="h-3 w-24 animate-pulse rounded bg-[#1a1a1a]" />
          <span className="text-[11px] text-[#333]">/</span>
          <div className="h-3 w-20 animate-pulse rounded bg-[#1a1a1a]" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-pulse rounded-full bg-[#1a1a1a]" />
          <div className="h-3 w-16 animate-pulse rounded bg-[#1a1a1a]" />
        </div>
      </nav>

      <div className="mx-auto max-w-[1200px] px-6 pb-20">
        {/* Header skeleton */}
        <div className="pb-8 pt-4">
          <div className="h-3 w-40 animate-pulse rounded bg-[#1a1a1a]" />
          <div className="mt-2 h-7 w-32 animate-pulse rounded bg-[#1a1a1a]" />
        </div>

        {/* Metrics skeleton */}
        <div className="grid grid-cols-2 gap-x-10 gap-y-6 pb-10 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i}>
              <div className="h-2.5 w-14 animate-pulse rounded bg-[#1a1a1a]" />
              <div className="mt-2 h-6 w-20 animate-pulse rounded bg-[#1a1a1a]" />
            </div>
          ))}
        </div>

        <div className="h-px bg-[#1a1a1a]" />

        {/* Content skeleton */}
        <div className="grid gap-0 lg:grid-cols-12">
          {[5, 3, 4].map((span, i) => (
            <section
              key={i}
              className={`py-8 ${i === 0 ? "pr-8" : i === 1 ? "px-8" : "pl-8"} ${i < 2 ? "border-r border-[#1a1a1a]" : ""} lg:col-span-${span}`}
            >
              <div className="mb-5 h-3 w-20 animate-pulse rounded bg-[#1a1a1a]" />
              <div className="space-y-4">
                {[...Array(5)].map((_, j) => (
                  <div key={j} className="flex items-center justify-between">
                    <div className="h-3 w-24 animate-pulse rounded bg-[#1a1a1a]" />
                    <div className="h-3 w-8 animate-pulse rounded bg-[#1a1a1a]" />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
