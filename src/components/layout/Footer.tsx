import Link from "next/link";

const GITHUB_URL = "https://github.com/StellarForgeDev/stellar-forge";

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface mt-auto">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 py-8 sm:flex-row sm:justify-between">
        <p className="font-sans text-xs text-text-secondary">
          Stellar-Forge is{" "}
          <a
            href="https://github.com/StellarForgeDev/stellar-forge/blob/main/LICENSE"
            target="_blank"
            rel="noreferrer"
            className="text-text-secondary underline decoration-border underline-offset-2 hover:text-accent-stellar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stellar"
          >
            MIT licensed
          </a>
        </p>

        <nav aria-label="Footer" className="flex gap-4">
          <Link
            href="/docs"
            className="rounded-default font-sans text-xs text-text-secondary transition-colors duration-150 ease-out hover:text-accent-stellar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stellar"
          >
            Docs
          </Link>
          <Link
            href="/components"
            className="rounded-default font-sans text-xs text-text-secondary transition-colors duration-150 ease-out hover:text-accent-stellar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stellar"
          >
            Components
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded-default font-sans text-xs text-text-secondary transition-colors duration-150 ease-out hover:text-accent-stellar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stellar"
          >
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}
