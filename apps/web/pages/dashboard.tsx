// apps/web/pages/dashboard.tsx
import { useState } from "react";
import type { GetServerSideProps } from "next";
import Link from "next/link";
import { getSession } from "@/lib/session";

type Props = { signedIn: boolean };

export const getServerSideProps: GetServerSideProps<Props> = async ({ req }) => {
  // Normalize just the cookie header for our getSession() helper
  const cookieHeader =
    Array.isArray(req.headers.cookie) ? req.headers.cookie.join('; ') : (req.headers.cookie || '');

  const sess = getSession({ headers: { cookie: cookieHeader } });
  return { props: { signedIn: !!sess?.upn } }; // we store `upn`, not `userId`
};

export default function Dashboard({ signedIn }: Props) {
  const [subStatus, setSubStatus] = useState<null | string>(null);

  async function subscribe() {
    try {
      setSubStatus("Subscribing…");
      const res = await fetch("/api/graph/subscribe", { method: "POST" });
      const data = await res.json();
      setSubStatus(res.ok ? "Subscribed ✅" : `Failed: ${data?.error || "unknown"}`);
    } catch (e: any) {
      setSubStatus(`Failed: ${e?.message || e}`);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 880, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 8 }}>Drafts-GPT Dashboard</h1>
      <p style={{ marginTop: 0, color: "#666" }}>
        Configure client tone/policies and templates. Drafts are created via webhook or manual test.
      </p>

      {/* Auth header */}
      <section
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#f7f7f8",
          border: "1px solid #e7e7ea",
          borderRadius: 12,
          padding: "12px 16px",
          margin: "16px 0 24px",
        }}
      >
        {signedIn ? (
          <>
            <div><strong>Microsoft 365</strong> — Signed in</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={subscribe} style={btnStyle}>Subscribe to mailbox webhook</button>
              <a href="/api/auth/logout" style={secondaryBtnStyle}>Log out</a>
            </div>
          </>
        ) : (
          <>
            <div><strong>Microsoft 365</strong> — Not signed in</div>
            <a href="/api/auth/login" style={btnStyle}>Sign in</a>
          </>
        )}
      </section>

      {subStatus && (
        <div style={{ marginBottom: 24, color: subStatus.startsWith("Subscribed") ? "#067d3f" : "#b00020" }}>
          {subStatus}
        </div>
      )}

      {/* Client Settings */}
      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Client Settings</h2>
        <div style={grid2}>
          <label>
            <div>Name</div>
            <input placeholder="e.g. Acme Dental" style={inputStyle} />
          </label>
          <label>
            <div>Tone (voice)</div>
            <input placeholder="e.g. friendly, concise" style={inputStyle} />
          </label>
        </div>
        <label style={{ display: "block", marginTop: 12 }}>
          <div>Policies / Instructions</div>
          <textarea placeholder="House rules for replies…" rows={5} style={textareaStyle} />
        </label>
        <div style={{ marginTop: 12 }}>
          <button style={btnStyle}>Save</button>
        </div>
      </section>

      {/* Templates */}
      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Templates</h2>
        <div style={grid2}>
          <label>
            <div>Name</div>
            <input placeholder="e.g. New Inquiry" style={inputStyle} />
          </label>
          <div />
        </div>
        <label style={{ display: "block", marginTop: 12 }}>
          <div>Body (HTML or text)</div>
          <textarea placeholder="<p>Thanks for reaching out…</p>" rows={6} style={textareaStyle} />
        </label>
        <div style={{ marginTop: 12 }}>
          <button style={btnStyle}>Save Template</button>
        </div>
      </section>

      {/* Manual Draft */}
      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Manual Draft (Test)</h2>
        {!signedIn && (
          <p style={{ color: "#b00020", marginTop: 0 }}>
            Sign in with Microsoft to enable manual draft creation.
          </p>
        )}
        <div style={grid2}>
          <label>
            <div>Message ID</div>
            <input placeholder="Outlook message id" style={inputStyle} disabled={!signedIn} />
          </label>
          <label>
            <div>Time zone</div>
            <input defaultValue="America/New_York" style={inputStyle} disabled={!signedIn} />
          </label>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" disabled={!signedIn} /> Suggest meeting times
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" disabled={!signedIn} /> Reply all
          </label>
        </div>
        <div style={{ marginTop: 12 }}>
          <button style={btnStyle} disabled={!signedIn}>Create Draft</button>
        </div>
      </section>

      <p style={{ marginTop: 24, color: "#888" }}>
        Tip: You can also create drafts automatically via the Outlook webhook when new mail arrives.
      </p>
    </main>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #e7e7ea",
  borderRadius: 12,
  padding: 16,
  marginBottom: 20,
  background: "#fff",
};

const grid2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #d7d7db",
  outline: "none",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #d7d7db",
  outline: "none",
};

const btnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #0a68ff",
  background: "#0a68ff",
  color: "#fff",
  textDecoration: "none",
  cursor: "pointer",
};

const secondaryBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: "#fff",
  color: "#0a68ff",
};
