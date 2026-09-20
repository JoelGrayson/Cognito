"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ProfileMenu } from "./ProfileMenu";

const LINKS = [
  { href: "/", label: "Home", match: (path: string) => path === "/" },
  { href: "/onboarding?new=1", label: "New learning plan", match: (path: string) => path.startsWith("/onboarding") },
  { href: "/topics", label: "Topics", match: (path: string) => path.startsWith("/topics") },
];

function Nav({ pathname }: { pathname: string | null }) {
  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-2.5 sm:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-md text-base font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="inline-flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-4" aria-hidden="true" />
          </span>
          Cognito
        </Link>
        <ul className="flex items-center gap-1">
          {LINKS.map((link) => {
            const active = pathname !== null && link.match(pathname);
            return (
              <li key={link.href}>
                <Button
                  asChild
                  variant="ghost"
                  className={cn(
                    "text-muted-foreground",
                    active && "bg-brand-soft text-primary hover:bg-brand-soft hover:text-primary",
                  )}
                >
                  <Link href={link.href} aria-current={active ? "page" : undefined}>
                    {link.label}
                  </Link>
                </Button>
              </li>
            );
          })}
          <li className="ml-1">
            <ProfileMenu active={pathname?.startsWith("/settings") ?? false} />
          </li>
        </ul>
      </nav>
    </header>
  );
}

export function SiteNav() {
  const pathname = usePathname();
  return <Nav pathname={pathname} />;
}

/** Same links without active highlighting — rendered while the pathname resolves. */
export function SiteNavFallback() {
  return <Nav pathname={null} />;
}
