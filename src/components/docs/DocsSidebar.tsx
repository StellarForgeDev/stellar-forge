"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { stellarComponents, orderComponents } from "@/data/components";

const itemBase =
  "block shrink-0 rounded-default border px-3 py-1.5 font-mono text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stellar";
const itemIdle =
  "border-transparent text-text-secondary hover:border-border hover:bg-surface hover:text-accent-stellar";
const itemActive = "border-accent-stellar text-accent-stellar";

function NavItem({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`${itemBase} ${active ? itemActive : itemIdle}`}
      >
        {label}
      </Link>
    </li>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <li className="pt-5 pl-3 font-mono text-[11px] uppercase tracking-wide text-text-secondary">
      {children}
    </li>
  );
}

export function DocsSidebar() {
  const pathname = usePathname();

  const componentItems = orderComponents(stellarComponents).map((component) => ({
    href: `/docs/components/${component.slug}`,
    label: component.name,
  }));

  const items = (
    <>
      <NavItem href="/docs" label="Getting Started" active={pathname === "/docs"} />

      <GroupLabel>Components</GroupLabel>
      {componentItems.map((item) => (
        <NavItem
          key={item.href}
          href={item.href}
          label={item.label}
          active={pathname === item.href}
        />
      ))}

      <GroupLabel>Tools</GroupLabel>
      <NavItem
        href="/playground"
        label="Playground"
        active={pathname.startsWith("/playground")}
      />
      <NavItem
        href="/transactions"
        label="Transaction Builder"
        active={pathname.startsWith("/transactions")}
      />
      <NavItem
        href="/docs/transactions"
        label="Transactions Guide"
        active={pathname === "/docs/transactions"}
      />
      <NavItem href="/docs#integration" label="Integration" active={false} />
    </>
  );

  return (
    <>
      <nav
        aria-label="Documentation"
        className="flex gap-2 overflow-x-auto pb-2 lg:hidden"
      >
        <ul className="flex shrink-0 items-center gap-2">{items}</ul>
      </nav>

      <aside
        aria-label="Documentation"
        className="hidden w-52 shrink-0 lg:block"
      >
        <div className="sticky top-8">
          <ul className="space-y-1">{items}</ul>
        </div>
      </aside>
    </>
  );
}