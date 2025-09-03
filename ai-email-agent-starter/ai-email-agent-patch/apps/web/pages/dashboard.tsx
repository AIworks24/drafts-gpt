import DraftPreview from "@/components/DraftPreview";

export default function Dashboard() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Drafts Dashboard</h1>
      <DraftPreview />
    </div>
  );
}