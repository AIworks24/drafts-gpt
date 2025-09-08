import ClientSettings from "@/components/ClientSettings";
import TemplateManager from "@/components/TemplateManager";
import ManualDraft from "@/components/ManualDraft";

export default function Dashboard() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 960, margin: "0 auto" }}>
      <h1>Drafts-GPT Dashboard</h1>
      <p>Configure client tone/policies and templates. Drafts are created via webhook or manual test.</p>
      <ClientSettings />
      <TemplateManager />
      <ManualDraft />
    </main>
  );
}
