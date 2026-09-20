import type { Metadata } from "next";
import { Geist, Lexend, Lora } from "next/font/google";
import { Suspense } from "react";
import { SiteNav, SiteNavFallback } from "@/components/SiteNav";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const lora = Lora({ variable: "--font-wb-serif", subsets: ["latin"] });
const lexend = Lexend({ variable: "--font-wb-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Cognito",
  description:
    "Tell us what you want to learn and get a personalized, editable roadmap with a weekly schedule in under 3 minutes. No sign-up.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={cn("h-full antialiased", geist.variable, lora.variable, lexend.variable)}>
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">
        <TooltipProvider delayDuration={200}>
          {/* usePathname can suspend while the pathname resolves; the fallback is the same nav without active state. */}
          <Suspense fallback={<SiteNavFallback />}>
            <SiteNav />
          </Suspense>
          {children}
        </TooltipProvider>
      </body>
    </html>
  );
}
