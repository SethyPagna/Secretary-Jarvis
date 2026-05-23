import { KnowledgePage } from "@/components/KnowledgePage";
import { guideItems, guideSections } from "@/content/knowledge";

export default function GuidesPage() {
  return (
    <KnowledgePage
      title="Guides"
      subtitle="Short implementation guides for models, voice, souls, automation, and safety. Use the info buttons when you want depth."
      sections={guideSections}
      items={guideItems}
      slotName="guides"
    />
  );
}
