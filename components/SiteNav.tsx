"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ProfileMenu } from "./ProfileMenu";

const LINKS = [
  { href: "/", label: "Home", match: (path: string) => path === "/" },
  { href: "/onboarding?new=1", label: "New learning plan", match: (path: string) => path.startsWith("/onboarding") },
  { href: "/topics", label: "Topics", match: (path: string) => path.startsWith("/topics") },
];

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong";

function Nav({ pathname }: { pathname: string | null }) {
  return (
    <header className="sticky top-0 z-50 border-b border-[#ecebe7] bg-white/90 backdrop-blur">
      <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-3 sm:px-8">
        <Link href="/" className={`text-base font-semibold tracking-tight ${focus}`}>
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
                  className={`inline-flex min-h-10 items-center rounded-full px-3 text-sm font-medium sm:px-4 ${focus} ${
                    active ? "bg-[#ecebfb] text-[#3b3499]" : "text-neutral-600 hover:bg-[#f0f0ee] hover:text-neutral-900"
                  }`}
                >
                  {link.label}
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
