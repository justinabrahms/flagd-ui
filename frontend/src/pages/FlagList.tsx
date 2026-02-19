import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { fetchFlags } from "../api";
import type { Flag } from "../types";

function variantType(variants: Record<string, unknown>): string {
  const values = Object.values(variants);
  if (values.length === 0) return "empty";
  const first = values[0];
  if (typeof first === "boolean") return "boolean";
  if (typeof first === "number") return "number";
  if (typeof first === "string") return "string";
  if (Array.isArray(first)) return "array";
  if (typeof first === "object") return "object";
  return typeof first;
}

export function FlagList() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchFlags(query || undefined)
      .then((res) => {
        setFlags(res.flags);
        setTotal(res.total);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [query]);

  const filtered =
    stateFilter === "all"
      ? flags
      : flags.filter((f) => f.state === stateFilter);

  return (
    <div>
      <div className="flag-list-header">
        <div>
          <h1>Flags</h1>
          <span className="flag-count">{total} flags loaded</span>
        </div>
        <input
          ref={searchRef}
          className="search-input"
          type="text"
          placeholder="Search flags…  (/)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="flag-filters">
        {["all", "ENABLED", "DISABLED"].map((state) => (
          <button
            key={state}
            className={`filter-btn ${stateFilter === state ? "active" : ""}`}
            onClick={() => setStateFilter(state)}
          >
            {state === "all" ? "All" : state.toLowerCase()}
          </button>
        ))}
      </div>

      {loading && <div className="loading">Loading flags...</div>}
      {error && <div className="error">{error}</div>}
      {!loading && !error && filtered.length === 0 && (
        <div className="empty-state">No flags found</div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <table className="flag-table">
          <thead>
            <tr>
              <th>Flag Key</th>
              <th>State</th>
              <th>Type</th>
              <th>Default</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((flag) => (
              <tr key={flag.key}>
                <td>
                  <Link to={`/flags/${encodeURIComponent(flag.key)}`}>
                    {flag.key}
                  </Link>
                </td>
                <td>
                  <span
                    className={`badge ${
                      flag.state === "ENABLED"
                        ? "badge-enabled"
                        : "badge-disabled"
                    }`}
                  >
                    {flag.state.toLowerCase()}
                  </span>
                </td>
                <td>
                  <span className="variant-type">
                    {variantType(flag.variants)}
                  </span>
                </td>
                <td>
                  <code>{flag.defaultVariant}</code>
                </td>
                <td>
                  <span className="badge badge-source">{flag.source}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
