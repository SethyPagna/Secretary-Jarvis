import { useLayoutEffect, useMemo, useState } from "react";
import { Copy, Info, Search } from "lucide-react";
import { Badge } from "@jarvis_managed-research/ui/ui/components/badge";
import { Button } from "@jarvis_managed-research/ui/ui/components/button";
import { Input } from "@/components/ui/input";
import { Typography } from "@/components/NouiTypography";
import { usePageHeader } from "@/contexts/usePageHeader";
import type { KnowledgeItem, KnowledgeSection } from "@/content/knowledge";
import { cn } from "@/lib/utils";
import { PluginSlot } from "@/plugins";

interface KnowledgePageProps {
  title: string;
  subtitle: string;
  sections: KnowledgeSection[];
  items: KnowledgeItem[];
  slotName?: string;
}

export function KnowledgePage({
  title,
  subtitle,
  sections,
  items,
  slotName,
}: KnowledgePageProps) {
  const [query, setQuery] = useState("");
  const [activeSection, setActiveSection] = useState(sections[0]?.id ?? "");
  const [selectedItem, setSelectedItem] = useState<KnowledgeItem | null>(null);
  const { setEnd } = usePageHeader();

  useLayoutEffect(() => {
    setEnd(
      <label className="relative flex w-[min(18rem,40vw)] items-center">
        <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-text-tertiary" />
        <Input
          aria-label={`Search ${title}`}
          className="h-8 pl-8 pr-3 text-xs"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          value={query}
        />
      </label>,
    );
    return () => setEnd(null);
  }, [query, setEnd, title]);

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      if (!normalizedQuery && activeSection && item.section !== activeSection) {
        return false;
      }
      if (!normalizedQuery) return true;
      const haystack = [
        item.title,
        item.summary,
        item.detail,
        item.command,
        item.source,
        ...(item.badges ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [activeSection, items, query]);

  const sectionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      counts.set(item.section, (counts.get(item.section) ?? 0) + 1);
    }
    return counts;
  }, [items]);

  const activeSectionMeta = sections.find((section) => section.id === activeSection);

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-col gap-4">
      {slotName ? <PluginSlot name={`${slotName}:top`} /> : null}

      <header className="grid gap-1">
        <Typography
          as="h1"
          className="text-display font-mondwest text-2xl uppercase tracking-[0.12em] text-text-primary"
        >
          {title}
        </Typography>
        <p className="max-w-3xl text-sm leading-6 text-text-secondary">{subtitle}</p>
      </header>

      <div className="grid min-h-0 gap-3 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <aside
          aria-label={`${title} sections`}
          className="min-h-0 overflow-x-auto border border-current/15 bg-background-base/45 p-2 lg:overflow-y-auto"
        >
          <div className="flex gap-1.5 lg:flex-col">
            {sections.map((section) => {
              const active = section.id === activeSection;
              return (
                <button
                  className={cn(
                    "group flex min-w-[10rem] items-center justify-between gap-2 px-3 py-2 text-left",
                    "font-mondwest text-display text-xs uppercase tracking-[0.1em]",
                    "transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-midground",
                    active
                      ? "bg-midground/10 text-midground"
                      : "text-text-secondary hover:bg-midground/5 hover:text-midground",
                  )}
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  title={section.summary}
                  type="button"
                >
                  <span className="truncate">{section.label}</span>
                  <span className="text-[0.65rem] text-text-tertiary">
                    {sectionCounts.get(section.id) ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="min-h-0 min-w-0">
          {activeSectionMeta ? (
            <div className="mb-3 flex items-start justify-between gap-3 border border-current/10 bg-background-base/30 px-3 py-2">
              <div className="min-w-0">
                <Typography className="font-mondwest text-display text-xs uppercase tracking-[0.12em] text-text-tertiary">
                  {activeSectionMeta.label}
                </Typography>
                <p className="mt-1 text-sm text-text-secondary">
                  {activeSectionMeta.summary}
                </p>
              </div>
              <Info
                aria-hidden
                className="mt-0.5 h-4 w-4 shrink-0 text-midground/80"
              />
            </div>
          ) : null}

          {visibleItems.length === 0 ? (
            <div className="border border-current/15 bg-background-base/35 px-4 py-8 text-center text-sm text-text-secondary">
              No matching entries.
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
              {visibleItems.map((item) => (
                <article
                  className={cn(
                    "group cursor-pointer border border-current/15 bg-card/45 p-3 transition-colors",
                    selectedItem?.id === item.id
                      ? "border-midground/60 bg-midground/10"
                      : "hover:border-midground/40 hover:bg-card/65",
                  )}
                  key={item.id}
                  onClick={() =>
                    setSelectedItem((current) => current?.id === item.id ? null : item)
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Typography
                        as="h2"
                        className="text-display font-mondwest text-sm uppercase tracking-[0.1em] text-text-primary"
                      >
                        {item.title}
                      </Typography>
                      <p className="mt-1 text-sm leading-5 text-text-secondary">
                        {item.summary}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-sm border border-current/10 px-2 py-1 text-[0.65rem] uppercase tracking-[0.1em] text-text-tertiary">
                      {selectedItem?.id === item.id ? "Hide" : "Details"}
                    </span>
                  </div>

                  {item.badges?.length ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {item.badges.map((badge) => (
                        <Badge key={badge} className="text-[0.62rem]">
                          {badge}
                        </Badge>
                      ))}
                    </div>
                  ) : null}

                  {item.command ? (
                    <div className="mt-3 flex items-center gap-2 border border-current/10 bg-background-base/40 px-2 py-1.5">
                      <code className="min-w-0 flex-1 truncate font-mono text-xs text-text-secondary">
                        {item.command}
                      </code>
                      <Button
                        ghost
                        size="icon"
                        aria-label={`Copy ${item.title}`}
                        className="h-6 w-6 text-text-tertiary hover:text-midground"
                        onClick={(event) => {
                          event.stopPropagation();
                          void navigator.clipboard?.writeText(item.command ?? "");
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : null}

                  {selectedItem?.id === item.id ? (
                    <div className="mt-3 border-t border-current/10 pt-3 text-sm leading-6 text-text-secondary">
                      <p>{item.detail}</p>
                      {item.source ? (
                        <code className="mt-3 block break-all bg-background-base/35 px-2 py-1.5 font-mono text-xs text-text-tertiary">
                          {item.source}
                        </code>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </main>
      </div>

      {slotName ? <PluginSlot name={`${slotName}:bottom`} /> : null}
    </div>
  );
}
