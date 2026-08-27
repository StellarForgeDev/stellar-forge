import Link from "next/link";
import { CodeBlock } from "@/components/docs/CodeBlock";
import { InterfaceReference } from "@/components/docs/InterfaceReference";
import { Card } from "@/components/ui/Card";
import { StateBadge } from "@/components/ui/StateBadge";
import { LinkButton } from "@/components/ui/LinkButton";
import type { StellarComponent } from "@/data/components";
import { buildConfigSnippet } from "@/lib/docs/snippets";

export function ComponentDocs({
  component,
}: {
  component: StellarComponent;
}) {
  const interfaceFns = component.interface ?? [];
  const implementation = component.implementation;
  const hasInterface = interfaceFns.length > 0;
  const hasImplementation = implementation !== undefined;
  const isImplemented = hasInterface || hasImplementation;
  const config = component.config ?? [];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/docs"
          className="font-mono text-xs text-text-secondary transition-colors hover:text-accent-stellar"
        >
          ← Docs
        </Link>

        <Link
          href={`/components/${component.slug}`}
          className="font-mono text-xs text-text-secondary transition-colors hover:text-accent-stellar"
        >
          View component page →
        </Link>
      </div>

      <div className="mt-8">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-xs uppercase tracking-wide text-accent-stellar">
            {component.category}
          </span>

          <div className="flex flex-wrap gap-1.5">
            <StateBadge
              tone={component.capabilities.sandbox ? "local" : "neutral"}
            >
              Sandbox
            </StateBadge>
            <StateBadge
              tone={component.capabilities.testnet ? "testnet" : "neutral"}
            >
              Testnet
            </StateBadge>
            {component.interface?.length ? (
              <StateBadge tone="neutral">
                {component.interface.length} fns
              </StateBadge>
            ) : null}
          </div>
        </div>

        <h1 className="mt-4 font-display text-4xl font-medium leading-tight text-text-primary sm:text-5xl">
          {component.name}
        </h1>

        <p className="mt-5 max-w-2xl font-sans text-base leading-7 text-text-secondary sm:text-lg">
          {component.description}
        </p>
      </div>

      {(() => {
        const sections = [
          { id: "overview", label: "Overview", show: true },
          {
            id: "use-cases",
            label: "Use cases",
            show: component.useCases.length > 0,
          },
          { id: "implementation", label: "Implementation", show: hasImplementation },
          { id: "contract-interface", label: "Contract interface", show: hasInterface },
          {
            id: "dependencies",
            label: "Dependencies",
            show: (component.dependencies?.length ?? 0) > 0,
          },
          {
            id: "constructor-arguments",
            label: "Constructor arguments",
            show:
              component.constructorArgs != null &&
              Object.keys(component.constructorArgs).length > 0,
          },
          { id: "availability", label: "Availability", show: true },
          { id: "configuration", label: "Configuration", show: config.length > 0 },
        ].filter((section) => section.show);

        if (sections.length < 2) return null;

        return (
          <nav aria-label="On this page" className="mt-10">
            <Card>
              <p className="font-mono text-xs uppercase tracking-wide text-text-secondary">
                On this page
              </p>

              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                {sections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="font-sans text-sm text-text-secondary transition-colors hover:text-accent-stellar"
                    >
                      {section.label}
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          </nav>
        );
      })()}

      <section id="overview" className="mt-12">
        <h2 className="font-mono text-xs uppercase tracking-wide text-accent-stellar">
          Overview
        </h2>

        <p className="mt-3 max-w-2xl font-sans text-sm leading-7 text-text-secondary">
          {component.overview}
        </p>
      </section>

      {component.useCases.length > 0 && (
          <section id="use-cases" className="mt-10">
            <h2 className="font-mono text-xs uppercase tracking-wide text-accent-stellar">
              Use cases
            </h2>

          <ol className="mt-4 space-y-2">
            {component.useCases.map((useCase, index) => (
              <li key={useCase} className="flex items-start gap-3">
                <span className="mt-0.5 font-mono text-xs text-accent-stellar">
                  {String(index + 1).padStart(2, "0")}
                </span>

                <p className="font-sans text-sm leading-relaxed text-text-secondary">
                  {useCase}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {isImplemented ? (
        <>
          {hasImplementation && (
              <section id="implementation" className="mt-10">
                <h2 className="font-mono text-xs uppercase tracking-wide text-accent-stellar">
                  Implementation
                </h2>

              <Card className="mt-4">
                <dl className="grid gap-4 sm:grid-cols-2">
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
                      Build target
                    </dt>
                    <dd className="mt-1 font-mono text-xs text-text-secondary">
                      {implementation.buildTarget}
                    </dd>
                  </div>
                </dl>

                <p className="mt-6 font-sans text-sm text-text-primary">
                  Source
                </p>
                <CodeBlock
                  code={implementation.sourcePath}
                  label="contracts workspace"
                />
              </Card>
            </section>
          )}

          {hasInterface && (
              <section id="contract-interface" className="mt-10">
                <h2 className="font-mono text-xs uppercase tracking-wide text-accent-stellar">
                  Contract interface
                </h2>

              <p className="mt-3 max-w-2xl font-sans text-sm leading-relaxed text-text-secondary">
                The interface exposed by the implementation.{" "}
                <span className="font-mono text-xs">__constructor</span> runs
                once at deployment to initialize the contract; every other
                function is a callable operation.
              </p>

              <Card className="mt-4">
                <InterfaceReference
                  functions={interfaceFns}
                  componentSlug={component.slug}
                  methodAction
                />
              </Card>
            </section>
          )}
        </>
      ) : (
        <section className="mt-10">
          <h2 className="font-mono text-xs uppercase tracking-wide text-accent-stellar">
            Implementation
          </h2>

          <Card className="mt-4">
            <h3 className="font-display text-2xl font-medium text-text-primary">
              A catalog concept for now
            </h3>

            <p className="mt-4 font-sans text-sm leading-7 text-text-secondary">
              This component is currently a catalog concept. Contract
              implementation and executable playground support will be added
              when it lands.
            </p>
          </Card>
        </section>
      )}

      {component.dependencies && component.dependencies.length > 0 && (
          <section id="dependencies" className="mt-10">
            <h2 className="font-mono text-xs uppercase tracking-wide text-accent-stellar">
              Dependencies
            </h2>

          <p className="mt-3 max-w-2xl font-sans text-sm leading-relaxed text-text-secondary">
            Contracts the sandbox provisions alongside this component so it can
            be exercised end to end. Each is deployed from its own catalog
            record; the values below seed its constructor and any setup calls
            before this component runs.
          </p>

          <Card className="mt-4">
            <ul className="space-y-4">
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
          <section id="constructor-arguments" className="mt-10">
            <h2 className="font-mono text-xs uppercase tracking-wide text-accent-stellar">
              Constructor arguments
            </h2>

            <p className="mt-3 max-w-2xl font-sans text-sm leading-relaxed text-text-secondary">
              The primary constructor is seeded from the configuration above.
              Values may reference a configuration field, an identity name (e.g.{" "}
              <span className="font-mono text-xs">admin</span>), a dependency
              alias (e.g. <span className="font-mono text-xs">asset</span>), or
              a literal.
            </p>

            <Card className="mt-4">
              <dl className="grid gap-4 sm:grid-cols-2">
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

      <section id="availability" className="mt-10">
        <h2 className="font-mono text-xs uppercase tracking-wide text-accent-stellar">
          Availability
        </h2>

        <Card className="mt-4">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="font-sans text-sm text-text-primary">
                Local sandbox
              </dt>

              <dd className="mt-1 font-mono text-xs text-text-secondary">
                {component.capabilities.sandbox
                  ? "Available — runs the real contract locally"
                  : "Not available"}
              </dd>
            </div>

            <div>
              <dt className="font-sans text-sm text-text-primary">
                Stellar Testnet
              </dt>

              <dd className="mt-1 font-mono text-xs text-text-secondary">
                {component.capabilities.testnet
                  ? "Available — deployed on Testnet"
                  : "Not deployed — sandbox only"}
              </dd>
            </div>
          </dl>
        </Card>
      </section>

      {config.length > 0 && (
          <section id="configuration" className="mt-10">
            <h2 className="font-mono text-xs uppercase tracking-wide text-accent-stellar">
              Configuration
            </h2>

          <p className="mt-3 max-w-2xl font-sans text-sm leading-relaxed text-text-secondary">
            The configuration fields this component accepts, with their default
            values. The Playground lets you edit these before generating code.
          </p>

          <Card className="mt-4">
            <dl className="grid gap-4 sm:grid-cols-2">
              {config.map((field) => (
                <div key={field.key}>
                  <dt className="font-sans text-sm text-text-primary">
                    {field.label}
                  </dt>
                  <dd className="mt-1 font-mono text-xs text-text-secondary">
                    {field.key}
                    <span className="text-text-secondary">
                      : {field.type}
                    </span>
                    {field.options ? (
                      <span className="ml-2 text-text-secondary">
                        {" "}
                        ({field.options.join(" | ")})
                      </span>
                    ) : null}
                  </dd>
                  <dd className="mt-1 font-mono text-xs text-accent-stellar">
                    default: {String(field.default)}
                  </dd>
                </div>
              ))}
            </dl>

            <CodeBlock
              code={buildConfigSnippet(component)}
              label="configuration snippet"
            />
          </Card>
        </section>
      )}

      <section className="mt-10">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-wide text-text-secondary">
                Next step
              </p>

              <h2 className="mt-2 font-display text-xl font-medium text-text-primary">
                Experiment with this component
              </h2>

              <p className="mt-2 max-w-xl font-sans text-sm leading-relaxed text-text-secondary">
                {isImplemented
                  ? "Open the playground with this component preselected, execute it locally in the sandbox, and inspect its generated structure before integrating it into a project."
                  : "Open the playground with this pattern preselected to configure it and inspect its generated structure before integrating it into a project."}
              </p>
            </div>

            <LinkButton
              href={`/playground?component=${encodeURIComponent(component.slug)}`}
              variant="secondary"
            >
              Open in Playground →
            </LinkButton>
          </div>
        </Card>
      </section>
    </>
  );
}