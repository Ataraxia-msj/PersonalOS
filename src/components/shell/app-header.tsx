"use client";

import { IconCommand } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { CommandMenu } from "./command-menu";
import styles from "./app-header.module.css";

const primaryLinks = [
  { href: "/", label: "首页" },
  { href: "/finance", label: "财务" },
] as const;

export function AppHeader() {
  const pathname = usePathname();

  if (pathname === "/login") return null;

  return <AuthenticatedHeader pathname={pathname} />;
}

function AuthenticatedHeader({ pathname }: Readonly<{ pathname: string }>) {
  const [commandOpen, setCommandOpen] = useState(false);

  const handleCommand = useCallback(() => {
    if (pathname === "/") {
      const agentInput = document.querySelector<HTMLTextAreaElement>("[data-agent-input]");
      if (agentInput) {
        agentInput.focus();
        return;
      }
    }
    setCommandOpen(true);
  }, [pathname]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        handleCommand();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleCommand]);

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link aria-label="Personal OS 首页" className={styles.brand} href="/">
            Personal OS
          </Link>

          <nav aria-label="主导航" className={styles.primaryNav}>
            {primaryLinks.map((link) => {
              const active =
                link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={active ? styles.navLinkActive : styles.navLink}
                  href={link.href}
                  key={link.href}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className={styles.utilities}>
            <button
              aria-label="打开命令菜单"
              className={styles.commandButton}
              onClick={handleCommand}
              type="button"
            >
              <IconCommand aria-hidden="true" size={17} stroke={1.7} />
              <span>K</span>
            </button>
            <span aria-hidden="true" className={styles.utilityDivider} />
            <Link
              aria-current={pathname === "/settings" ? "page" : undefined}
              className={pathname === "/settings" ? styles.settingsActive : styles.settingsLink}
              href="/settings"
            >
              设置
            </Link>
          </div>
        </div>
      </header>
      <CommandMenu onOpenChange={setCommandOpen} open={commandOpen} />
    </>
  );
}
