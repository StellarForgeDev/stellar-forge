import type { StellarComponent } from "@/data/components";

export type IntegrationLanguage = "rust" | "typescript";

export interface IntegrationLanguageOption {
  value: IntegrationLanguage;
  label: string;
}

export const INTEGRATION_LANGUAGES: IntegrationLanguageOption[] = [
  { value: "rust", label: "Rust" },
  { value: "typescript", label: "TypeScript" },
];

export interface IntegrationContext {
  component: StellarComponent;
  configValues: Record<string, string>;
}