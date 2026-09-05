"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { LinkButton } from "@/components/ui/LinkButton";

const navLinks = [
  { href: "/components", label: "Components" },
  { href: "/playground", label: "Playground" },
  { href: "/transactions", label: "Transactions" },
  { href: "/testnet/deploy", label: "Testnet Deploy" },
  { href: "/docs", label: "Docs" },
];

const GITHUB_URL = "https://github.com/StellarForgeDev/stellar-forge";

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const desktopLinkClass = (active: boolean) =>
  `rounded-default font-sans text-sm transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stellar motion-reduce:transition-none ${
    active ? "text-accent-stellar" : "text-text-secondary hover:text-accent-stellar"
  }`;

const mobileLinkClass = (active: boolean) =>
  `block rounded-default px-3 py-2 font-sans text-sm transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stellar motion-reduce:transition-none ${
    active ? "text-accent-stellar" : "text-text-secondary hover:text-accent-stellar"
  }`;

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          aria-current={isActive(pathname, "/") ? "page" : undefined}
          className="rounded-default font-display text-base font-medium text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stellar"
        >
          Stellar-Forge
        </Link>

        <nav
          aria-label="Primary"
          className="hidden items-center gap-6 md:flex"
        >
          {navLinks.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={desktopLinkClass(active)}
              >
                {link.label}
              </Link>
            );
          })}

          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className={desktopLinkClass(false)}
          >
            GitHub
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Toggle navigation menu"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((value) => !value)}
            className="rounded-default p-2 text-text-secondary transition-colors duration-150 ease-out hover:text-accent-stellar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stellar motion-reduce:transition-none md:hidden"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              {open ? (
                <>
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="6" y1="18" x2="18" y2="6" />
                </>
              ) : (
                <>
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              )}
            </svg>
          </button>

          <LinkButton href="/docs" variant="primary">
            Get Started
          </LinkButton>
        </div>
      </div>

      {open && (
        <div id="mobile-nav" className="border-t border-border bg-surface md:hidden">
          <nav
            aria-label="Mobile"
            className="mx-auto flex max-w-6xl flex-col gap-1 px-6 py-4"
          >
            {navLinks.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={mobileLinkClass(active)}
                >
                  {link.label}
                </Link>
              );
            })}

            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className={mobileLinkClass(false)}
            >
              GitHub
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}
