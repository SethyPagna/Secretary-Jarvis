import { KnowledgePage } from "@/components/KnowledgePage";
import { setupItems, setupSections } from "@/content/knowledge";

export default function SetupPage() {
  return (
    <KnowledgePage
      title="Setup"
      subtitle="Production setup checkpoints for dependencies, local models, desktop behavior, Docker/WSL, and packaging."
      sections={setupSections}
      items={setupItems}
      slotName="setup"
    />
  );
}
