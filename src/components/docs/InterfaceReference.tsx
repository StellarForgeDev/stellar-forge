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
}: {
  functions: FunctionSpec[];
}) {
  return (
    <ul className="mt-5 space-y-4">
      {functions.map((fn) => {
        const isConstructor = fn.name === "__constructor";

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