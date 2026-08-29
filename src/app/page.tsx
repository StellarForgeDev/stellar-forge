import Link from "next/link";
import { LinkButton } from "@/components/ui/LinkButton";
import { Card } from "@/components/ui/Card";
import { StateBadge } from "@/components/ui/StateBadge";
import { ComponentCard } from "@/components/catalog/ComponentCard";
import { HomeSandboxPreview } from "@/components/home/HomeSandboxPreview";
import { stellarComponents, orderComponents } from "@/data/components";

const showcase = orderComponents(stellarComponents).slice(0, 6);

const lifecycle = [
  {
    step: "01",
    title: "Discover",
    body: "Browse reusable Soroban building blocks and read how each pattern works.",
    tone: "neutral" as const,
    dot: "bg-text-secondary",
    href: "/components",
  },
  {
    step: "02",
    title: "Configure",
    body: "Set parameters, dependencies, and a constructor from catalog metadata.",
    tone: "local" as const,
    dot: "bg-tone-local",
    href: "/playground",
  },
  {
    step: "03",
    title: "Run",
    body: "Execute the real contract locally in an isolated Soroban sandbox.",
    tone: "local" as const,
    dot: "bg-tone-local",
    href: "/playground",
  },
  {
    step: "04",
    title: "Integrate",
    body: "Generate Rust or TypeScript code and take the pattern into your project.",
    tone: "testnet" as const,
    dot: "bg-tone-onchain",
    href: "/docs#integration",
  },
];

export default function Home() {
  return (
    <main className="flex-1">
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 py-20 lg:py-24">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="mb-5 font-mono text-xs tracking-[0.18em] text-accent-stellar">
              STELLAR-FORGE / SOROBAN TOOLING
            </p>

            <h1 className="max-w-2xl font-display text-4xl font-medium leading-[1.08] tracking-tight text-text-primary sm:text-5xl lg:text-6xl">
              Reusable Soroban building blocks for developers.
            </h1>

            <p className="mt-6 max-w-xl font-sans text-base leading-7 text-text-secondary sm:text-lg">
              Explore components, configure them, run real contracts locally in
              the sandbox, and generate integration code — without leaving your
              browser.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-4">
              <LinkButton href="/components" variant="primary">
                Explore Components
              </LinkButton>

              <LinkButton href="/playground" variant="secondary">
                Open Playground
              </LinkButton>
            </div>

            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs text-text-secondary">
              <span>Open source</span>
              <span>Soroban</span>
              <span>Local sandbox</span>
              <span>Developer-first</span>
            </div>
          </div>

          <HomeSandboxPreview />
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="mb-8">
          <p className="font-mono text-xs tracking-[0.18em] text-accent-stellar">
            HOW IT WORKS
          </p>

          <h2 className="mt-2 font-display text-2xl font-medium text-text-primary sm:text-3xl">
            Discover, configure, run, integrate.
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {lifecycle.map((item) => (
            <Link key={item.step} href={item.href} className="group block">
              <Card className="flex h-full flex-col border-t-2 transition-transform duration-150 ease-out hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stellar motion-reduce:transition-none">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-text-secondary">
                    {item.step}
                  </span>
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${item.dot}`}
                    aria-hidden="true"
                  />
                </div>

                <h3 className="mt-3 font-display text-lg font-medium text-text-primary">
                  {item.title}
                </h3>

                <p className="mt-2 font-sans text-sm leading-6 text-text-secondary">
                  {item.body}
                </p>

                <div className="mt-4">
                  <StateBadge tone={item.tone}>{item.title}</StateBadge>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* Component showcase */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs tracking-[0.18em] text-accent-stellar">
              COMPONENT CATALOG
            </p>

            <h2 className="mt-2 font-display text-2xl font-medium text-text-primary sm:text-3xl">
              Start with a building block.
            </h2>
          </div>

          <LinkButton href="/components" variant="secondary">
            View all components →
          </LinkButton>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {showcase.map((component) => (
            <ComponentCard
              key={component.slug}
              name={component.name}
              description={component.shortDescription}
              category={component.category}
              href={`/components/${component.slug}`}
              capabilities={component.capabilities}
              functionCount={component.interface?.length ?? 0}
            />
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <Card className="flex flex-col items-start justify-between gap-6 bg-surface/60 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-display text-2xl font-medium text-text-primary">
              Ready to build on Stellar?
            </h2>
            <p className="mt-2 max-w-xl font-sans text-sm leading-7 text-text-secondary">
              Open the catalog to discover components, or jump straight into the
              Playground and run a real contract locally.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <LinkButton href="/components" variant="primary">
              Explore Components
            </LinkButton>
            <LinkButton href="/playground" variant="secondary">
              Open Playground
            </LinkButton>
          </div>
        </Card>
      </section>
    </main>
  );
}
