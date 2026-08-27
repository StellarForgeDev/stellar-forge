import Link from "next/link";

const navLinks = [
  { href: "/components", label: "Components" },
  { href: "/playground", label: "Playground" },
  { href: "/transactions", label: "Transactions" },
  { href: "/docs", label: "Docs" },
];

export function Navbar() {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="rounded-default font-display text-base font-medium text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stellar"
        >
          Stellar-Forge
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-6 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-default font-sans text-sm text-text-secondary transition-colors duration-150 ease-out hover:text-accent-stellar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stellar motion-reduce:transition-none"
            >
              {link.label}
            </Link>
          ))}

          <a
            href="https://github.com/StellarForgeDev/stellar-forge"
            target="_blank"
            rel="noreferrer"
            className="rounded-default font-sans text-sm text-text-secondary transition-colors duration-150 ease-out hover:text-accent-stellar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stellar motion-reduce:transition-none"
          >
            GitHub
          </a>
        </nav>

        <Link
          href="/docs"
          className="rounded-default bg-accent-forge px-4 py-2 font-sans text-sm font-medium text-canvas transition-colors duration-150 ease-out hover:bg-accent-forge/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stellar focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
        >
          Get Started
        </Link>
      </div>
    </header>
  );
}