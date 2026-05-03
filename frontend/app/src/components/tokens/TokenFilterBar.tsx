import { useState } from "react";

interface Props {
  initialSearch: string;
  initialHasToken: "all" | "yes" | "no";
  onApply: (filters: { search: string; has_token: "all" | "yes" | "no" }) => void;
}

export function TokenFilterBar({ initialSearch, initialHasToken, onApply }: Props) {
  const [search, setSearch] = useState(initialSearch);
  const [hasToken, setHasToken] = useState<"all" | "yes" | "no">(initialHasToken);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onApply({ search: search.trim(), has_token: hasToken });
      }}
      style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
    >
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search username or email…"
        style={{ flex: 1, minWidth: 200 }}
      />
      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
        Token:
        <select
          value={hasToken}
          onChange={(e) => setHasToken(e.target.value as "all" | "yes" | "no")}
        >
          <option value="all">All</option>
          <option value="yes">Has token</option>
          <option value="no">No token</option>
        </select>
      </label>
      <button type="submit" className="btn primary">Apply</button>
      <button
        type="button"
        className="btn ghost"
        onClick={() => {
          setSearch("");
          setHasToken("all");
          onApply({ search: "", has_token: "all" });
        }}
      >
        Clear
      </button>
    </form>
  );
}
