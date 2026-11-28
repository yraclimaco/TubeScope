import Link from "next/link";
import type { Query } from "@/lib/queries";
import { SqlBlock } from "./sql-block";
import { SqlDrawer } from "./sql-drawer";

export function Panel({
  title,
  subtitle,
  query,
  children,
  className = "",
}: {
  title: string;
  subtitle?: React.ReactNode;
  query?: Pick<Query<unknown[]>, "text" | "views">;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      data-reveal
      className={`card p-5 sm:p-7 ${className}`}
    >
      <div className="grid grid-cols-[1fr_auto] items-start gap-x-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>
          {subtitle && <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-ink-3">{subtitle}</p>}
        </div>
        {query && (
          <SqlDrawer>
            <SqlBlock sql={query.text} />
            {query.views.length > 0 && (
              <p className="mt-3 text-xs text-ink-3">
                Reads{" "}
                {query.views.map((v, i) => (
                  <span key={v}>
                    {i > 0 && ", "}
                    <Link href={`/sql#${v}`} className="font-mono text-ink-2 underline decoration-border underline-offset-4 hover:decoration-accent">
                      {v}
                    </Link>
                  </span>
                ))}
                . Open it in the SQL lab to see how it is built.
              </p>
            )}
          </SqlDrawer>
        )}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <header data-reveal className="mb-8 mt-4 max-w-3xl">
      <p className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-3">
        <span className="h-px w-6 bg-[linear-gradient(90deg,var(--accent),var(--accent-2))]" />
        {eyebrow}
      </p>
      <h1 className="mt-3 text-3xl font-bold leading-tight tracking-[-0.02em] text-ink sm:text-4xl">{title}</h1>
      {children && <div className="mt-3 text-[15px] leading-relaxed text-ink-2">{children}</div>}
    </header>
  );
}
