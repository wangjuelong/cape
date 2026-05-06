import { useState } from "react";

interface Props {
  initialSearch: string;
  onApply: (filters: { search: string }) => void;
}

export function TokenFilterBar({ initialSearch, onApply }: Props) {
  const [search, setSearch] = useState(initialSearch);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onApply({ search: search.trim() });
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
      <button type="submit" className="btn primary">
        Apply
      </button>
      <button
        type="button"
        className="btn ghost"
        onClick={() => {
          setSearch("");
          onApply({ search: "" });
        }}
      >
        Clear
      </button>
    </form>
  );
}
