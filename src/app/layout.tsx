import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { AppHeader } from "@/components/shell/app-header";

import "./globals.css";

export const metadata: Metadata = {
  title: "Personal OS",
  description: "A private, agent-first operating system for personal finance.",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#181715",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <AppHeader />
        {children}
      </body>
    </html>
  );
}
