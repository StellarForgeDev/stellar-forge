import Link from "next/link";
import { ComponentCard } from "@/components/catalog/ComponentCard";
import { LinkButton } from "@/components/ui/LinkButton";
import { stellarComponents, orderComponents } from "@/data/components";

const textLink =
  "inline-flex font-mono text-xs text-accent-stellar hover:underline";

function Step({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-4">
      <span className="mt-0.5 font-mono text-xs text-accent-stellar">
        {number}
      </span>

      <div>
        <h3 className="font-display text-lg font-medium text-text-primary">
          {title}
        </h3>

        <div className="mt-2 space-y-2 font-sans text-sm leading-7 text-text-secondary">
          {children}
        </div>
      </div>
    </li>
  );
}

export default function DocsPage() {
  const implemented = stellarComponents.filter(
    (component) => component.capabilities.implemented,
  );
  const concepts = stellarComponents.length - implemented.length;

  return (
    <main className="min-w-0 flex-1">
      <header>
        <p className="font-mono text-xs tracking-[0.18em] text-accent-stellar">
          STELLAR-FORGE / DOCUMENTATION
        </p>

        <h1 className="mt-4 font-display text-4xl font-medium leading-tight text-text-primary sm:text-5xl">
          Build with understanding.
        </h1>

        <p className="mt-5 max-w-2xl font-sans text-base leading-7 text-text-secondary sm:text-lg">
          Documentation for discovering, understanding, experimenting with,
          and reusing Stellar and Soroban building blocks, from the catalog
          to the playground.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <LinkButton href="/components" variant="secondary">
            Browse components →
          </LinkButton>

          <LinkButton href="/playground" variant="secondary">
            Open the playground →
          </LinkButton>
        </div>
      </header>

      <section id="getting-started" className="mt-16">
        <h2 className="font-mono text-xs uppercase tracking-wide text-accent-stellar">
          01 / Getting started
        </h2>

        <p className="mt-3 max-w-2xl font-sans text-sm leading-7 text-text-secondary">
          Stellar-Forge helps you find common Stellar and Soroban building
          blocks, understand the pattern behind them, and experiment with
          their configuration before writing them into a project.
        </p>

        <ol className="mt-8 max-w-2xl space-y-7">
          <Step number="01" title="What Stellar-Forge is">
            <p>
              A developer platform where reusable Soroban building blocks are
              documented as components. Every component carries shared,
              structured metadata: its purpose, use cases, configuration, and
              — when implemented — its real contract interface and source
              location.
            </p>
          </Step>

          <Step number="02" title="What Soroban components are">
            <p>
              Soroban components are Rust smart contracts (or contract
              patterns) built with{" "}
              <span className="font-mono text-xs">soroban-sdk</span>. Tokens,
              payments, and access control are all common building blocks that
              can be adapted rather than written from scratch.
            </p>
          </Step>

          <Step number="03" title="How the catalog works">
            <p>
              The catalog lists every component in one place. Search by name,
              summary, description, or category, and filter by category to
              narrow the field.
            </p>

            <Link href="/components" className={textLink}>
              Browse the catalog →
            </Link>
          </Step>

          <Step number="04" title="Inspect a component">
            <p>
              Each component has a catalog page and a dedicated documentation
              page. Implemented components show real interface signatures,
              parameter and return types, configuration defaults, and build
              information.
            </p>

            <Link href="/docs/components/token" className={textLink}>
              Read the Token documentation →
            </Link>
          </Step>

          <Step number="05" title="Open it in the Playground">
            <p>
              Any component can be opened in the Playground with its
              configuration preselected, using the{" "}
              <span className="font-mono text-xs">?component=slug</span> URL.
              Implemented components can also be executed locally in the
              sandbox.
            </p>

            <Link href="/playground?component=token" className={textLink}>
              Open the Playground with Token →
            </Link>
          </Step>

          <Step number="06" title="Generate an integration example">
            <p>
              The Playground&apos;s Integration section generates a Rust or
              TypeScript example from the selected component&apos;s interface
              and your configuration, an honest starting point to adapt, not an
              opaque abstraction.
            </p>

            <Link href="/docs#integration" className={textLink}>
              Jump to the Integration section ↓
            </Link>
          </Step>

          <Step number="07" title="Go on-chain with the Transaction Builder">
            <p>
              When you are ready to execute, the Transaction Builder takes a
              component from simulation to a real Stellar Testnet transaction:
              build and simulate, sign with Freighter, then submit. It covers
              funding, signing, fees, authorization, and common failures.
            </p>

            <Link href="/docs/transactions" className={textLink}>
              Read the Transactions guide →
            </Link>
          </Step>
        </ol>

        <p className="mt-10 max-w-2xl font-sans text-sm leading-7 text-text-secondary">
          Currently implemented:{" "}
          {implemented.map((component, index) => (
            <span key={component.slug}>
              <Link
                href={`/docs/components/${component.slug}`}
                className="font-mono text-xs text-accent-stellar hover:underline"
              >
                {component.name}
              </Link>
              {index < implemented.length - 1 ? ", " : ""}
            </span>
          ))}
          {concepts > 0 ? (
            <>
              . The remaining {concepts}{" "}
              {concepts === 1 ? "entry is" : "entries are"} documented as
              catalog concepts until their contract implementation lands.
            </>
          ) : (
            ". All components are implemented and executable in the local sandbox."
          )}
        </p>
      </section>

      <section id="components" className="mt-16">
        <h2 className="font-mono text-xs uppercase tracking-wide text-accent-stellar">
          02 / Component library
        </h2>

        <p className="mt-3 max-w-2xl font-sans text-sm leading-7 text-text-secondary">
          Every component below has dedicated documentation. Implemented
          components include their real contract interface and configuration.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orderComponents(stellarComponents).map((component) => (
            <ComponentCard
              key={component.slug}
              name={component.name}
              description={component.shortDescription}
              category={component.category}
              href={`/docs/components/${component.slug}`}
              cta="View documentation"
              capabilities={component.capabilities}
              functionCount={component.interface?.length ?? 0}
            />
          ))}
        </div>

        <Link href="/components" className={`${textLink} mt-6`}>
          Browse all components in the catalog →
        </Link>
      </section>

      <section id="playground" className="mt-16">
        <h2 className="font-mono text-xs uppercase tracking-wide text-accent-stellar">
          03 / Playground
        </h2>

        <p className="mt-3 max-w-2xl font-sans text-sm leading-7 text-text-secondary">
          The Playground is the experimental space of Stellar-Forge. Open a
          component with its configuration preselected, edit the fields, and
          inspect the structure it produces. For implemented components, the
          sandbox runs the real contract locally with deterministic mock
          results: no network, no wallet, no gas costs.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <LinkButton href="/playground" variant="secondary">
            Open the Playground →
          </LinkButton>

          <LinkButton href="/playground?component=token" variant="secondary">
            Start with Token →
          </LinkButton>
        </div>
      </section>

      <section id="integration" className="mt-16">
        <h2 className="font-mono text-xs uppercase tracking-wide text-accent-stellar">
          04 / Integration
        </h2>

        <p className="mt-3 max-w-2xl font-sans text-sm leading-7 text-text-secondary">
          When a component makes sense for your project, the Integration
          section of the Playground generates a Rust or TypeScript example that
          ties the component&apos;s interface together with your configuration:
          SDK imports, deployment, and callable examples for every function.
          Integration code is generated for every implemented component, in both
          languages.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <LinkButton href="/playground?component=token" variant="secondary">
            Try it with Token →
          </LinkButton>

          <LinkButton href="/playground" variant="secondary">
            Open the Playground →
          </LinkButton>
        </div>
      </section>

      <section id="on-chain" className="mt-16">
        <h2 className="font-mono text-xs uppercase tracking-wide text-accent-stellar">
          05 / On-chain transactions
        </h2>

        <p className="mt-3 max-w-2xl font-sans text-sm leading-7 text-text-secondary">
          Once you understand a component, the Transaction Builder takes it the
          rest of the way: build and simulate against Stellar Testnet, sign with
          Freighter, and submit. It documents the full lifecycle — funding with
          Friendbot, read-only vs state-changing calls, authorization, fees,
          expiration, and common failures.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <LinkButton href="/docs/transactions" variant="secondary">
            Read the Transactions guide →
          </LinkButton>

          <LinkButton href="/transactions" variant="secondary">
            Open the Transaction Builder →
          </LinkButton>
        </div>
      </section>
    </main>
  );
}