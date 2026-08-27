import Link from "next/link";
import { notFound } from "next/navigation";
import { InterfaceReference } from "@/components/docs/InterfaceReference";
import { Card } from "@/components/ui/Card";
import {
  getComponentBySlug,
  stellarComponents,
  componentMaturity,
} from "@/data/components";

interface ComponentDetailPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export function generateStaticParams() {
  return stellarComponents.map((component) => ({
    slug: component.slug,
  }));
}

export default async function ComponentDetailPage({
  params,
}: ComponentDetailPageProps) {
  const { slug } = await params;
  const component = getComponentBySlug(slug);

  if (!component) {
    notFound();
  }

  const interfaceFns = component.interface ?? [];
  const implementation = component.implementation;
  const hasInterface = interfaceFns.length > 0;
  const hasImplementation = implementation !== undefined;

  return (
    <main className="flex-1">
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/components"
            className="font-mono text-xs text-text-secondary transition-colors hover:text-accent-stellar"
          >
            ← Back to components
          </Link>

          <Link
            href={`/docs/components/${component.slug}`}
            className="font-mono text-xs text-text-secondary transition-colors hover:text-accent-stellar"
          >
            View documentation →
          </Link>
        </div>

        <div className="mt-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-xs uppercase tracking-wide text-accent-stellar">
              {component.category}
            </span>

            <span
              className={`rounded-default border px-2 py-1 font-mono text-xs ${
                component.capabilities.implemented
                  ? "border-accent-stellar/60 text-accent-stellar"
                  : "border-border text-text-secondary"
              }`}
            >
              {componentMaturity(component)}
            </span>
          </div>

          <h1 className="mt-4 font-display text-4xl font-medium leading-tight text-text-primary sm:text-5xl">
            {component.name}
          </h1>

          <p className="mt-5 max-w-2xl font-sans text-base leading-7 text-text-secondary sm:text-lg">
            {component.description}
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)]">
          <Card>
            <h2 className="font-mono text-xs uppercase tracking-wide text-accent-stellar">
              Overview
            </h2>

            <h3 className="mt-3 font-display text-2xl font-medium text-text-primary">
              Understand the pattern
            </h3>

            <p className="mt-4 font-sans text-sm leading-7 text-text-secondary">
              {component.overview}
            </p>
          </Card>

          <Card>
            <h2 className="font-mono text-xs uppercase tracking-wide text-text-secondary">
              Component status
            </h2>

            <div className="mt-4">
              <p className="font-display text-lg font-medium text-text-primary">
                {componentMaturity(component)}
              </p>

              <p className="mt-2 font-sans text-sm leading-relaxed text-text-secondary">
                {component.capabilities.implemented
                  ? "This component has a real, tested Soroban contract in the Stellar-Forge contracts workspace."
                  : "This component is currently represented as a reusable pattern in the Stellar-Forge catalog."}
              </p>
            </div>
          </Card>
        </div>

        <section className="mt-6">
          <Card>
            <h2 className="font-mono text-xs uppercase tracking-wide text-accent-stellar">
              Use cases
            </h2>

            <ol className="mt-5 grid gap-4 sm:grid-cols-2">
              {component.useCases.map((useCase, index) => (
                <li
                  key={useCase}
                  className="flex items-start gap-3 rounded-default border border-border p-4"
                >
                  <span className="mt-0.5 font-mono text-xs text-accent-stellar">
                    {String(index + 1).padStart(2, "0")}
                  </span>

                  <p className="font-sans text-sm leading-relaxed text-text-secondary">
                    {useCase}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </section>

        {hasInterface || hasImplementation ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)]">
            {hasInterface && (
              <Card>
                <h2 className="font-mono text-xs uppercase tracking-wide text-accent-stellar">
                  Contract interface
                </h2>

                <p className="mt-3 font-sans text-sm leading-relaxed text-text-secondary">
                  The interface exposed by the implementation.{" "}
                  <span className="font-mono text-xs">__constructor</span> runs
                  once at deployment to initialize the contract; every other
                  function is a callable operation.
                </p>

                <InterfaceReference functions={interfaceFns} />
              </Card>
            )}

            {hasImplementation && (
              <Card>
                <h2 className="font-mono text-xs uppercase tracking-wide text-text-secondary">
                  Implementation
                </h2>

                <dl className="mt-4 space-y-4">
                  <div>
                    <dt className="font-sans text-sm text-text-primary">
                      Language
                    </dt>
                    <dd className="mt-1 font-mono text-xs text-text-secondary">
                      {implementation.language}
                    </dd>
                  </div>

                  <div>
                    <dt className="font-sans text-sm text-text-primary">
                      Package
                    </dt>
                    <dd className="mt-1 font-mono text-xs text-text-secondary">
                      {implementation.package}
                    </dd>
                  </div>

                  <div>
                    <dt className="font-sans text-sm text-text-primary">
                      Source
                    </dt>
                    <dd>
                      <code className="mt-1 block overflow-x-auto whitespace-pre rounded-default border border-border bg-canvas/60 px-3 py-2 font-mono text-xs text-text-primary">
                        {implementation.sourcePath}
                      </code>
                    </dd>
                  </div>

                  <div>
                    <dt className="font-sans text-sm text-text-primary">
                      Build target
                    </dt>
                    <dd className="mt-1 font-mono text-xs text-text-secondary">
                      {implementation.buildTarget}
                    </dd>
                  </div>
                </dl>
              </Card>
            )}
          </div>
        ) : (
          <section className="mt-6">
            <Card>
              <p className="font-mono text-xs uppercase tracking-wide text-text-secondary">
                Implementation &amp; interface
              </p>

              <h2 className="mt-3 font-display text-2xl font-medium text-text-primary">
                A catalog concept for now
              </h2>

              <p className="mt-4 font-sans text-sm leading-7 text-text-secondary">
                {component.name} is currently documented as a reusable pattern
                only. There is no contract implementation or interface spec to
                show yet. When the real contract lands, its interface and
                sandbox support will appear here automatically.
              </p>
            </Card>
          </section>
        )}

        {component.dependencies && component.dependencies.length > 0 && (
          <section className="mt-6">
            <Card>
              <h2 className="font-mono text-xs uppercase tracking-wide text-accent-stellar">
                Dependencies
              </h2>

              <p className="mt-3 font-sans text-sm leading-relaxed text-text-secondary">
                Contracts the sandbox provisions alongside this component so it
                can be exercised end to end, deployed from their own catalog
                records.
              </p>

              <ul className="mt-4 space-y-4">
                {component.dependencies.map((dependency) => (
                  <li
                    key={dependency.alias}
                    className="border-b border-border pb-4 last:border-0 last:pb-0"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="font-mono text-xs text-text-primary">
                        {dependency.alias}
                      </code>

                      <span className="font-sans text-xs text-text-secondary">
                        &rarr; {dependency.package}
                      </span>
                    </div>

                    {dependency.constructorArgs && (
                      <p className="mt-2 font-mono text-xs text-text-secondary">
                        constructor:{" "}
                        {Object.entries(dependency.constructorArgs)
                          .map(([key, value]) => `${key}: ${value}`)
                          .join(", ")}
                      </p>
                    )}

                    {dependency.setup && (
                      <p className="mt-1 font-mono text-xs text-text-secondary">
                        setup:{" "}
                        {dependency.setup
                          .map((call) => `${call.fn}(${call.args.join(", ")})`)
                          .join(", ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        )}

        {component.constructorArgs &&
          Object.keys(component.constructorArgs).length > 0 && (
            <section className="mt-6">
              <Card>
                <h2 className="font-mono text-xs uppercase tracking-wide text-accent-stellar">
                  Constructor arguments
                </h2>

                <p className="mt-3 font-sans text-sm leading-relaxed text-text-secondary">
                  The primary constructor is seeded from the configuration above.
                  Values may reference a configuration field, an identity name, a
                  dependency alias, or a literal.
                </p>

                <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                  {Object.entries(component.constructorArgs).map(([key, value]) => (
                    <div key={key}>
                      <dt className="font-sans text-sm text-text-primary">
                        {key}
                      </dt>

                      <dd className="mt-1 font-mono text-xs text-accent-stellar">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Card>
            </section>
          )}

        <section className="mt-6">
          <Card>
            <h2 className="font-mono text-xs uppercase tracking-wide text-accent-stellar">
              Availability
            </h2>

            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="font-sans text-sm text-text-primary">
                  Local sandbox
                </dt>

                <dd className="mt-1 font-mono text-xs text-text-secondary">
                  {component.capabilities.sandbox ? "Available" : "Not available"}
                </dd>
              </div>

              <div>
                <dt className="font-sans text-sm text-text-primary">
                  Stellar Testnet
                </dt>

                <dd className="mt-1 font-mono text-xs text-text-secondary">
                  {component.capabilities.testnet ? "Available" : "Not deployed"}
                </dd>
              </div>
            </dl>
          </Card>
        </section>

        <section className="mt-6">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-wide text-text-secondary">
                  Next step
                </p>

                <h2 className="mt-2 font-display text-xl font-medium text-text-primary">
                  Experiment with this pattern
                </h2>

                <p className="mt-2 max-w-xl font-sans text-sm leading-relaxed text-text-secondary">
                  {component.capabilities.implemented
                    ? "Open the playground with this component preselected, execute it locally in the sandbox, and inspect its generated structure before integrating it into a project."
                    : "Open the playground with this pattern preselected to configure it and inspect its generated structure before integrating it into a project."}
                </p>
              </div>

              <Link
                href={`/playground?component=${encodeURIComponent(component.slug)}`}
                className="rounded-default border border-accent-stellar px-4 py-2 font-mono text-xs text-accent-stellar transition-colors hover:bg-accent-stellar/10"
              >
                Open Playground →
              </Link>
            </div>
          </Card>
        </section>
      </section>
    </main>
  );
}
