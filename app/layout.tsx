import type { Metadata } from "next";
import { Inter, Lexend, Lora } from "next/font/google";
import { Suspense } from "react";
import { SiteNav, SiteNavFallback } from "@/components/SiteNav";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const lora = Lora({ variable: "--font-wb-serif", subsets: ["latin"] });
const lexend = Lexend({ variable: "--font-wb-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Cognito",
  description:
    "Tell us what you want to learn and get a personalized, editable roadmap with a weekly schedule in under 3 minutes. No sign-up.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${lora.variable} ${lexend.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {/* usePathname can suspend while the pathname resolves; the fallback is the same nav without active state. */}
        <Suspense fallback={<SiteNavFallback />}>
          <SiteNav />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
