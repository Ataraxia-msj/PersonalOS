"use client";

import {
  IconHome,
  IconSearch,
  IconSettings,
  IconWallet,
  type Icon,
} from "@tabler/icons-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import styles from "./app-header.module.css";

interface CommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Destination {
  href: string;
  label: string;
  hint: string;
  icon: Icon;
}

const destinations: Destination[] = [
  { href: "/", label: "首页", hint: "Agent 对话", icon: IconHome },
  { href: "/finance", label: "财务", hint: "查看财务数据", icon: IconWallet },
  { href: "/settings", label: "设置", hint: "偏好与账户", icon: IconSettings },
];

export function CommandMenu({ open, onOpenChange }: CommandMenuProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    inputRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const visibleDestinations = destinations.filter((destination) =>
    `${destination.label}${destination.hint}`.toLocaleLowerCase("zh-CN").includes(normalizedQuery),
  );

  return (
    <div className={styles.commandBackdrop} onMouseDown={() => onOpenChange(false)}>
      <section
        aria-label="快速导航"
        aria-modal="true"
        className={styles.commandPanel}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <label className={styles.commandSearch}>
          <IconSearch aria-hidden="true" size={20} stroke={1.7} />
          <span className="sr-only">搜索命令</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索页面或命令…"
            ref={inputRef}
            value={query}
          />
          <kbd>Esc</kbd>
        </label>

        <div className={styles.commandGroup}>
          <p>快速前往</p>
          {visibleDestinations.map((destination) => {
            const DestinationIcon = destination.icon;
            return (
              <Link
                className={styles.commandItem}
                href={destination.href}
                key={destination.href}
                onClick={() => onOpenChange(false)}
              >
                <DestinationIcon aria-hidden="true" size={20} stroke={1.6} />
                <span>
                  <strong>{destination.label}</strong>
                  <small>{destination.hint}</small>
                </span>
              </Link>
            );
          })}
          {visibleDestinations.length === 0 ? (
            <p className={styles.commandEmpty}>没有匹配的命令</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
