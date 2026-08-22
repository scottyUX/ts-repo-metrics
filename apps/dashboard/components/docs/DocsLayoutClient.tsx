"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DOC_GROUPS, DEFAULT_DOC_SLUG } from "@/components/docs/docsNav";

function slugFromPath(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 1 && segments[0] === "docs") return DEFAULT_DOC_SLUG;
  if (segments[0] === "docs" && segments[1]) return segments[1]!;
  return DEFAULT_DOC_SLUG;
}

function DocsSidebarLinks({
  activeSlug,
  onNavigate,
}: {
  activeSlug: string;
  /** Called after selecting a section (e.g. close mobile sheet). */
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Documentation sections" className="flex flex-col gap-6">
      {DOC_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.label}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const href = `/docs/${item.slug}`;
              const active = item.slug === activeSlug;
              return (
                <li key={item.slug}>
                  <Link
                    href={href}
                    onClick={() => onNavigate?.()}
                    className={cn(
                      "block rounded-md px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-muted/60 font-medium text-foreground"
                        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                    )}
                  >
                    {item.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function DocsLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const activeSlug = slugFromPath(pathname ?? "");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex w-full max-w-[1400px] gap-8 lg:gap-10">
      <aside className="hidden w-56 shrink-0 lg:block">
        <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-2 pb-8 [-webkit-overflow-scrolling:touch]">
          <p className="mb-4 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Documentation
          </p>
          <DocsSidebarLinks activeSlug={activeSlug} />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="mb-6 flex items-center gap-3 lg:hidden">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Menu className="size-4" aria-hidden />
                Sections
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[min(100vw-2rem,20rem)]">
              <SheetHeader>
                <SheetTitle className="text-left">Documentation</SheetTitle>
              </SheetHeader>
              <div className="mt-4 px-1">
                <DocsSidebarLinks
                  activeSlug={activeSlug}
                  onNavigate={() => setMobileNavOpen(false)}
                />
              </div>
            </SheetContent>
          </Sheet>
          <span className="truncate text-sm text-muted-foreground">
            Repo Metrics — contributor docs
          </span>
        </div>

        {children}
      </div>
    </div>
  );
}
