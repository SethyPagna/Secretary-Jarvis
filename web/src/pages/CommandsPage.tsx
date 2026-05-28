import { KnowledgePage } from "@/components/KnowledgePage";
import { commandItems, commandSections } from "@/content/knowledge";

export default function CommandsPage() {
  return (
    <KnowledgePage
      title="Commands"
      subtitle="Compact Home terminal prompts and operational checks for JARVIS. Details stay behind hover and the more button."
      sections={commandSections}
      items={commandItems}
      slotName="commands"
    />
  );
}
