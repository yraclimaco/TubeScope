// Tiny tokenizer for displaying SQL. Output is escaped before wrapping in spans.
const KEYWORDS = new Set(
  (
    "select from where and or not as with join left right inner outer on using group by order " +
    "limit having case when then else end over partition rows range between preceding following " +
    "current row in is null distinct union all create view function returns language immutable " +
    "filter within desc asc interval true false coalesce nullif exists lateral cross values " +
    "insert into update set delete table primary key references default drop schema cascade"
  ).split(" "),
);

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function highlightSql(sql: string): string {
  const token = /(--[^\n]*)|('(?:[^']|'')*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)(\s*\()?|([\s\S])/g;
  let out = "";
  for (const m of sql.matchAll(token)) {
    const [, comment, str, number, word, paren, other] = m;
    if (comment) out += `<span class="cm">${escape(comment)}</span>`;
    else if (str) out += `<span class="str">${escape(str)}</span>`;
    else if (number) out += `<span class="num">${number}</span>`;
    else if (word) {
      const lower = word.toLowerCase();
      if (KEYWORDS.has(lower)) out += `<span class="kw">${escape(word)}</span>${paren ?? ""}`;
      else if (paren) out += `<span class="fn">${escape(word)}</span>${escape(paren)}`;
      else out += escape(word);
    } else if (other) out += escape(other);
  }
  return out;
}
