import { KnowledgePage } from "@/components/KnowledgePage";
import { referenceItems, referenceSections } from "@/content/knowledge";

export default function DocsPage() {
  return (
    <KnowledgePage
      title="Reference"
      subtitle="Local JARVIS reference files for architecture, memory, tools, MCP, platforms, scheduling, security, and environment variables."
      sections={referenceSections}
      items={referenceItems}
      slotName="docs"
    />
  );
}
