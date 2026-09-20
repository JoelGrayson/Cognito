"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Mascot } from "./Mascot";
import { ProfileMenu } from "./ProfileMenu";

const LINKS = [
  { href: "/", label: "Home", short: "Home", match: (path: string) => path === "/" },
  { href: "/onboarding?new=1", label: "New learning plan", short: "New plan", match: (path: string) => path.startsWith("/onboarding") },
  { href: "/topics", label: "Topics", short: "Topics", match: (path: string) => path.startsWith("/topics") },
];

function Nav({ pathname }: { pathname: string | null }) {
  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-2.5 sm:px-8">
        <Link
          href="/"
          className="wb-serif inline-flex items-center gap-2 rounded-md text-xl font-medium tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-2xl"
        >
          <Mascot size={30} />
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
                    "px-2.5 text-muted-foreground sm:px-4",
                    active && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                  )}
                >
                  <Link href={link.href} aria-current={active ? "page" : undefined}>
                    <span className="sm:hidden">{link.short}</span>
                    <span className="hidden sm:inline">{link.label}</span>
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
