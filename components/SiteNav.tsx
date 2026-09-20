"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ProfileMenu } from "./ProfileMenu";

const LINKS = [
  { href: "/", label: "Home", short: "Home", match: (path: string) => path === "/" },
  { href: "/onboarding?new=1", label: "New learning plan", short: "New plan", match: (path: string) => path.startsWith("/onboarding") },
  { href: "/topics", label: "Topics", short: "Topics", match: (path: string) => path.startsWith("/topics") },
];

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--wb-primary)";

function Nav({ pathname }: { pathname: string | null }) {
  return (
    <header className="wb sticky top-0 z-50 border-b border-(--wb-line) bg-(--wb-bg)/90 backdrop-blur">
      <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-3 sm:px-8">
        <Link href="/" className={`wb-serif text-xl font-medium sm:text-2xl tracking-tight ${focus}`}>
          Cognito
        </Link>
        <ul className="flex items-center gap-1 sm:gap-2">
          {LINKS.map((link) => {
            const active = pathname !== null && link.match(pathname);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex min-h-10 items-center whitespace-nowrap rounded-xl px-2.5 text-sm sm:px-4 ${focus} ${
                    active ? "bg-(--wb-primary) text-(--wb-card)" : "text-(--wb-muted) hover:bg-(--wb-hover) hover:text-(--wb-ink)"
                  }`}
                >
                  <span className="sm:hidden">{link.short}</span>
                  <span className="hidden sm:inline">{link.label}</span>
                </Link>
              </li>
            );
          })}
          <li>
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
