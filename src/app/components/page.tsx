"use client";

import { useMemo, useState } from "react";
import { ComponentCard } from "@/components/catalog/ComponentCard";
import {
  componentReadiness,
  publicComponentCategories,
  publicComponents,
  componentMaturity,
  orderComponents,
} from "@/data/components";

const capabilityFilters = ["All", "Sandbox", "Testnet"] as const;
type CapabilityFilter = (typeof capabilityFilters)[number];

export default function ComponentsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedCapability, setSelectedCapability] =
    useState<CapabilityFilter>("All");

  const filteredComponents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return publicComponents.filter((component) => {
      const matchesCategory =
        selectedCategory === "All" || component.category === selectedCategory;

      const matchesCapability =
        selectedCapability === "All" ||
        (selectedCapability === "Sandbox" && component.capabilities.sandbox) ||
        (selectedCapability === "Testnet" && component.capabilities.testnet);

      const matchesSearch =
        query.length === 0 ||
        component.name.toLowerCase().includes(query) ||
        component.shortDescription.toLowerCase().includes(query) ||
        component.description.toLowerCase().includes(query) ||
        component.category.toLowerCase().includes(query);

      return matchesCategory && matchesCapability && matchesSearch;
    });
  }, [searchQuery, selectedCategory, selectedCapability]);

  return (
    <main className="flex-1">
      <section className="mx-auto max-w-7xl px-6 py-16">
        <p className="mb-4 font-mono text-xs tracking-wide text-accent-stellar">
          COMPONENT CATALOG
        </p>

        <h1 className="font-display text-3xl font-medium text-text-primary sm:text-4xl">
          Soroban Components
        </h1>

        <p className="mt-4 max-w-2xl font-sans text-base leading-relaxed text-text-secondary">
          A focused set of components with explicit evidence boundaries. Each
          card separates catalog status, local sandbox execution, Testnet
          verification, and production readiness.
        </p>

        <div className="mt-5 rounded-default border border-border bg-surface p-4 text-sm text-text-secondary">
          <p className="font-mono text-xs uppercase tracking-wide text-accent-stellar">Readiness vocabulary</p>
          <p className="mt-2 leading-6">Catalogued means documented here. Sandbox-runnable means the real WASM runs locally. Testnet-verified requires fresh artifact and behavior evidence. Production-ready is reserved for a separately approved release gate.</p>
        </div>

        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search components..."
            aria-label="Search components"
            className="w-full rounded-default border border-border bg-surface px-4 py-2 font-sans text-sm text-text-primary placeholder:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-stellar sm:max-w-xs"
          />

          <div className="flex flex-wrap gap-2">
            {publicComponentCategories.map((category) => {
              const isSelected = selectedCategory === category;

              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => setSelectedCategory(category)}
                  aria-pressed={isSelected}
                  className={`rounded-default border px-3 py-1 font-mono text-xs transition-colors duration-200 motion-reduce:transition-none ${
                    isSelected
                      ? "border-accent-stellar text-accent-stellar"
                      : "border-border text-text-secondary hover:border-accent-stellar/60 hover:text-accent-stellar"
                  }`}
                >
                  {category}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {capabilityFilters.map((capability) => {
            const isSelected = selectedCapability === capability;

            return (
              <button
                key={capability}
                type="button"
                onClick={() => setSelectedCapability(capability)}
                aria-pressed={isSelected}
                className={`rounded-default border px-3 py-1 font-mono text-xs transition-colors duration-200 motion-reduce:transition-none ${
                  isSelected
                    ? "border-accent-stellar text-accent-stellar"
                    : "border-border text-text-secondary hover:border-accent-stellar/60 hover:text-accent-stellar"
                }`}
              >
                {capability === "Sandbox"
                  ? "Sandbox-ready"
                  : capability === "Testnet"
                    ? "Testnet-deployed"
                    : "All"}
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <p className="font-mono text-xs text-text-secondary">
            {filteredComponents.length}{" "}
            {filteredComponents.length === 1 ? "component" : "components"}
          </p>

          {(searchQuery ||
            selectedCategory !== "All" ||
            selectedCapability !== "All") && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("All");
                setSelectedCapability("All");
              }}
              className="font-mono text-xs text-text-secondary transition-colors hover:text-accent-stellar"
            >
              Clear filters
            </button>
          )}
        </div>

        {filteredComponents.length > 0 ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {orderComponents(filteredComponents).map((component) => (
              <ComponentCard
                key={component.slug}
                name={component.name}
                description={component.shortDescription}
                category={component.category}
                status={componentMaturity(component)}
                href={`/components/${component.slug}`}
                capabilities={component.capabilities}
                readiness={componentReadiness(component)}
                functionCount={component.interface?.length ?? 0}
                functions={component.interface}
                expandable
                playgroundSlug={component.slug}
              />
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-default border border-border bg-surface p-8 text-center">
            <p className="font-display text-lg font-medium text-text-primary">
              No components match this filter.
            </p>

            <p className="mt-2 font-sans text-sm text-text-secondary">
              Try another capability or category.
            </p>

            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("All");
                setSelectedCapability("All");
              }}
              className="mt-5 font-mono text-xs text-accent-stellar hover:underline"
            >
              Reset filters
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
