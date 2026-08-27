"use client";

import { useRef, useState } from "react";

/**
 * Shared copy-to-clipboard feedback state.
 *
 * Returns `copied`/`failed` flags and a `copy(text)` action. The flags auto-reset
 * after `timeout` ms. All three UI surfaces that copy (CodeBlock, IntegrationPanel,
 * transaction XDR) route through this so the feedback language is identical.
 */
export function useCopyFeedback(timeout = 2000) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<number | null>(null);

  function clear() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }

  async function copy(text: string): Promise<boolean> {
    clear();
    try {
      await navigator.clipboard.writeText(text);
      setFailed(false);
      setCopied(true);
      timer.current = window.setTimeout(() => setCopied(false), timeout);
      return true;
    } catch {
      setCopied(false);
      setFailed(true);
      timer.current = window.setTimeout(() => setFailed(false), timeout);
      return false;
    }
  }

  return { copied, failed, copy };
}
