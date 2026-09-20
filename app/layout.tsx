import type { Metadata } from "next";
import {
  ClerkProvider,
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { ScanLine } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AccessiScan | Website accessibility and performance scans",
  description: "Scan your website for accessibility, performance, SEO, and best-practice issues with plain-English guidance.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ClerkProvider>
          <a href="#main-content" className="sr-only z-50 rounded-lg bg-white p-3 text-primary focus:not-sr-only focus:absolute focus:left-4 focus:top-4">Skip to content</a>
          <header className="border-b border-border bg-white">
          <nav aria-label="Main navigation" className="mx-auto flex min-h-20 max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8 lg:px-12">
            <Link href="/" className="flex items-center gap-2.5 text-base font-semibold tracking-tight text-primary sm:text-lg">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-[#d8f36a]"><ScanLine aria-hidden="true" className="size-5" /></span>
              AccessiScan
            </Link>
            <div className="flex items-center gap-2 sm:gap-3">
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button className={buttonVariants({ variant: "ghost" })} type="button">
                  Sign in
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className={buttonVariants()} type="button">
                  Get started
                </button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <Link className={buttonVariants({ variant: "outline" })} href="/dashboard">Dashboard</Link>
              <UserButton />
            </Show>
            </div>
          </nav>
          </header>
          <TooltipProvider>{children}</TooltipProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
