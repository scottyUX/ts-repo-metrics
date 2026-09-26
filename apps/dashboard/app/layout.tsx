import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Header } from "@/components/Header";
import { ThemeProvider } from "@/components/ThemeProvider";
import { SiteFooter } from "@/components/SiteFooter";
import { Cse115aMain } from "@/components/cse115a/Cse115aMain";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export function generateMetadata(): Metadata {
  return process.env.CSE115A_SITE === "true"
    ? {
        title: "CSE 115A Repo Metrics",
        description: "Analyze your merged CSE 115A sprint task pull requests.",
      }
    : {
        title: "Repo Metrics Dashboard",
        description:
          "Analyze GitHub repositories — TypeScript, Python, and more — with code and git metrics",
      };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cse115aSite = process.env.CSE115A_SITE === "true";
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="https://mcp.figma.com/mcp/html-to-design/capture.js" async></script>
      </head>
      <body
        className={`${geistMono.variable} font-sans antialiased min-h-screen flex flex-col`}
      >
        <ThemeProvider>
          <Header />
          {cse115aSite ? (
            <Cse115aMain><TooltipProvider>{children}</TooltipProvider></Cse115aMain>
          ) : (
            <main className="flex-1 flex flex-col items-center justify-start py-6 px-4 sm:px-6 min-h-[calc(100vh-4rem)] bg-background">
              <TooltipProvider>{children}</TooltipProvider>
            </main>
          )}
          {cse115aSite ? (
            <footer className="border-t border-slate-200 bg-white px-6 py-6 text-center text-xs text-slate-500">
              CSE 115A Repo Metrics · <a href="/privacy" className="underline">Privacy</a> · <a href="/terms" className="underline">Terms</a>
            </footer>
          ) : <SiteFooter />}
          <Toaster richColors position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
