"use client";

import { usePathname } from "next/navigation";
import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const cse115a = pathname.startsWith("/cse115a");
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      forcedTheme={cse115a ? "light" : undefined}
    >
      {children}
    </NextThemesProvider>
  );
}
