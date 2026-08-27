"use client";

import { useMemo, useState } from "react";
import { ComponentCard } from "@/components/catalog/ComponentCard";
import {
  componentCategories,
  stellarComponents,
  componentMaturity,
} from "@/data/components";

export default function ComponentsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  const filteredComponents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return stellarComponents.filter((component) => {
      const matchesCategory =
        selectedCategory === "All" ||
        component.category === selectedCategory;

      const matchesSearch =
        query.length === 0 ||
        component.name.toLowerCase().includes(query) ||
        component.shortDescription.toLowerCase().includes(query) ||
        component.description.toLowerCase().includes(query) ||
        component.category.toLowerCase().includes(query);

      return matchesCategory && matchesSearch;
    });
  }, [searchQuery, selectedCategory]);

  return (
    <main className="flex-1">
      <section className="mx-auto max-w-6xl px-6 py-16">
        <p className="mb-4 font-mono text-xs tracking-wide text-accent-stellar">
          COMPONENT CATALOG
        </p>

        <h1 className="font-display text-3xl font-medium text-text-primary sm:text-4xl">
          Reusable Stellar &amp; Soroban building blocks
        </h1>

        <p className="mt-4 max-w-2xl font-sans text-base leading-relaxed text-text-secondary">
          Each entry below outlines a common Soroban pattern: what it does
          and why you&apos;d reach for it. Every component ships with a real,
          tested Soroban contract in the contracts workspace and is executable
          in the local sandbox.
        </p>

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
            {componentCategories.map((category) => {
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

        <div className="mt-6 flex items-center justify-between">
          <p className="font-mono text-xs text-text-secondary">
            {filteredComponents.length}{" "}
            {filteredComponents.length === 1 ? "component" : "components"}
          </p>

          {(searchQuery || selectedCategory !== "All") && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("All");
              }}
              className="font-mono text-xs text-text-secondary transition-colors hover:text-accent-stellar"
            >
              Clear filters
            </button>
          )}
        </div>

        {filteredComponents.length > 0 ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredComponents.map((component) => (
              <ComponentCard
                key={component.slug}
                name={component.name}
                description={component.description}
                category={component.category}
                status={componentMaturity(component)}
                href={`/components/${component.slug}`}
              />
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-default border border-border bg-surface p-8 text-center">
            <p className="font-display text-lg font-medium text-text-primary">
              No components found.
            </p>

            <p className="mt-2 font-sans text-sm text-text-secondary">
              Try a different search term or category.
            </p>

            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("All");
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