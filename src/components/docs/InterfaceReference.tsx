import Link from "next/link";

import type { FunctionAuthorization, FunctionSpec } from "@/data/components";

function authorizationBadge(auth: FunctionAuthorization | undefined) {
  if (!auth || auth === "none") return null;

  if (auth === "admin") {
    return (
      <span
        title="Requires the contract admin (the sandbox deployer identity)."
        className="rounded-default border border-accent-forge/60 px-2 py-0.5 font-mono text-[11px] text-accent-forge"
      >
        admin only
      </span>
    );
  }

  return (
    <span
      title="The first address parameter is the authorized signer."
      className="rounded-default border border-accent-stellar/60 px-2 py-0.5 font-mono text-[11px] text-accent-stellar"
    >
      caller = first address
    </span>
  );
}

export function InterfaceReference({
  functions,
  compact = false,
  componentSlug,
  methodAction = false,
}: {
  functions: FunctionSpec[];
  compact?: boolean;
  componentSlug?: string;
  methodAction?: boolean;
}) {
  function tryMethodHref(name: string) {
    return `/playground?component=${encodeURIComponent(componentSlug ?? "")}&method=${encodeURIComponent(name)}`;
  }

  if (compact) {
    return (
      <ul className="mt-1 space-y-1 font-mono text-xs leading-relaxed">
        {functions.map((fn) => {
          const signature = fn.params
            .map((param) => `${param.name}: ${param.type}`)
            .join(", ");

          const isOp = fn.name !== "__constructor";

          return (
            <li
              key={fn.name}
              className="flex flex-wrap items-center gap-x-1 gap-y-1 break-words text-text-secondary"
            >
              <span
                className={
                  isOp ? "text-text-primary" : "text-accent-forge"
                }
              >
                {fn.name}
              </span>
              <span>({signature})</span>
              {fn.returns ? (
                <span className="text-accent-stellar"> → {fn.returns}</span>
              ) : null}
              {methodAction && componentSlug && isOp ? (
                <Link
                  href={tryMethodHref(fn.name)}
                  aria-label={`Try ${fn.name} in the playground`}
                  className="ml-1 font-sans text-accent-stellar hover:underline"
                >
                  Try →
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <ul className="mt-5 space-y-4">
      {functions.map((fn) => {
        const isConstructor = fn.name === "__constructor";
        const isOp = !isConstructor;

        return (
          <li
            key={fn.name}
            className="rounded-default border border-border p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3
                  className={`font-mono text-xs font-medium ${
                    isConstructor ? "text-accent-forge" : "text-text-primary"
                  }`}
                >
                  {fn.name}
                </h3>

                {authorizationBadge(fn.authorization)}
              </div>

              {isConstructor && (
                <span className="rounded-default border border-accent-forge/60 px-2 py-0.5 font-mono text-[11px] text-accent-forge">
                  constructor
                </span>
              )}
            </div>

            {methodAction && componentSlug && isOp ? (
              <Link
                href={tryMethodHref(fn.name)}
                aria-label={`Try ${fn.name} in the playground`}
                className="mt-2 inline-flex font-mono text-xs text-accent-stellar hover:underline"
              >
                Try {fn.name} →
              </Link>
            ) : null}

            <div className="mt-3 space-y-1">
              {fn.params.map((param) => (
                <p key={param.name} className="font-mono text-xs">
                  <span className="text-text-primary">{param.name}</span>

                  <span className="text-text-secondary">: {param.type}</span>
                </p>
              ))}

              {fn.returns ? (
                <p className="font-mono text-xs text-accent-stellar">
                  → {fn.returns}
                </p>
              ) : null}
            </div>

            {fn.description && (
              <p className="mt-3 font-sans text-sm leading-relaxed text-text-secondary">
                {fn.description}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}