import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { fetchFlag } from "../api";
import type { Flag } from "../types";

export function FlagDetail() {
  const { key } = useParams<{ key: string }>();
  const [flag, setFlag] = useState<Flag | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!key) return;
    setLoading(true);
    fetchFlag(key)
      .then((f) => {
        setFlag(f);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [key]);

  if (loading) return <div className="loading">Loading...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!flag) return <div className="error">Flag not found</div>;

  const description =
    flag.metadata && typeof flag.metadata === "object"
      ? (flag.metadata as Record<string, unknown>).description
      : null;

  const variants = Object.entries(flag.variants);

  // Strip description from metadata so it's not shown twice
  const extraMetadata = flag.metadata
    ? Object.fromEntries(
        Object.entries(flag.metadata).filter(([k]) => k !== "description")
      )
    : null;
  const hasExtraMetadata =
    extraMetadata && Object.keys(extraMetadata).length > 0;

  return (
    <div>
      <Link to="/" className="flag-detail-back">
        &larr; All flags
      </Link>

      <div className="flag-detail-header">
        <h1>{flag.key}</h1>
        <span
          className={`badge ${
            flag.state === "ENABLED" ? "badge-enabled" : "badge-disabled"
          }`}
        >
          {flag.state.toLowerCase()}
        </span>
      </div>

      {description && (
        <p className="flag-description">{String(description)}</p>
      )}

      <div className="detail-section">
        <h2>Overview</h2>
        <div className="detail-card">
          <div className="detail-grid">
            <div className="detail-field">
              <label>State</label>
              <div className="value">{flag.state}</div>
            </div>
            <div className="detail-field">
              <label>Default Variant</label>
              <div className="value">
                <code>{flag.defaultVariant}</code>
              </div>
            </div>
            <div className="detail-field">
              <label>Source</label>
              <div className="value">
                <span className="badge badge-source">{flag.source}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="detail-section">
        <h2>Variants ({variants.length})</h2>
        <div className="detail-card">
          <table className="variant-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {variants.map(([name, value]) => (
                <tr key={name} className={name === flag.defaultVariant ? "is-default-row" : ""}>
                  <td className="variant-name-cell">
                    <code>{name}</code>
                    {name === flag.defaultVariant && (
                      <span className="badge badge-enabled">default</span>
                    )}
                  </td>
                  <td className="variant-value-cell">
                    <code>
                      {typeof value === "object"
                        ? JSON.stringify(value)
                        : String(value)}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {flag.targeting && (
        <div className="detail-section">
          <h2>Targeting Rules</h2>
          <div className="detail-card">
            <pre>{JSON.stringify(flag.targeting, null, 2)}</pre>
          </div>
        </div>
      )}

      {hasExtraMetadata && (
        <details className="detail-section">
          <summary className="detail-summary"><h2>Metadata</h2></summary>
          <div className="detail-card">
            <pre>{JSON.stringify(extraMetadata, null, 2)}</pre>
          </div>
        </details>
      )}
    </div>
  );
}
