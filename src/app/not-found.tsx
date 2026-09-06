import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-20">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent-stellar">
        404
      </p>

      <h1 className="mt-4 font-display text-3xl font-medium text-text-primary sm:text-4xl">
        Page not found
      </h1>

      <p className="mt-4 max-w-md text-center font-sans text-sm text-text-secondary">
        The page you are looking for does not exist or has been moved.
      </p>

      <div className="mt-8 flex gap-4">
        <Link
          href="/"
          className="rounded-default bg-accent-forge px-5 py-2.5 font-sans text-sm font-medium text-white transition-colors duration-150 ease-out hover:bg-accent-forge/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stellar"
        >
          Go home
        </Link>

        <Link
          href="/components"
          className="rounded-default border border-accent-stellar px-5 py-2.5 font-sans text-sm font-medium text-accent-stellar transition-colors duration-150 ease-out hover:bg-accent-stellar/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stellar"
        >
          Browse components
        </Link>
      </div>
    </div>
  );
}
