import { highlightSql } from "@/lib/sql-highlight";

export function SqlBlock({ sql, className = "" }: { sql: string; className?: string }) {
  return (
    <pre
      className={`sql scrollbar-thin overflow-x-auto rounded-xl border border-border bg-bg p-4 font-mono text-[12.5px] leading-relaxed text-ink-2 ${className}`}
    >
      <code dangerouslySetInnerHTML={{ __html: highlightSql(sql.trim()) }} />
    </pre>
  );
}
