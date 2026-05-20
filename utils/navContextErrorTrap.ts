/**
 * Dev-only diagnostic. When React/React Native logs an error whose message
 * contains "navigation context", we intercept it and print the FULL JS
 * stack — but via console.log (not console.error) so it appears cleanly in
 * the Metro terminal without spawning a redbox per line.
 *
 * Imported once from app/_layout.tsx; no-op in production.
 */

if (typeof __DEV__ !== "undefined" && __DEV__) {
  const origError = console.error.bind(console);
  const origLog = console.log.bind(console);
  let alreadyDumped = false;

  console.error = (...args: unknown[]) => {
    try {
      const msg = args
        .map((a) =>
          a instanceof Error ? `${a.message}\n${a.stack || ""}` : String(a),
        )
        .join(" ");
      // Dump only on first occurrence per session — avoids flooding the
      // terminal if the error repeats every render.
      if (!alreadyDumped && msg.includes("navigation context")) {
        alreadyDumped = true;
        const err = args.find((a) => a instanceof Error) as Error | undefined;
        const synthetic = new Error("nav-context-error-trap probe");
        const block =
          "\n=== NAV-CONTEXT ERROR TRAP (Metro terminal) ===\n" +
          "Message: " +
          (err?.message || msg) +
          "\n\nThrowing-error stack:\n" +
          (err?.stack || "(no stack on error object)") +
          "\n\nCaller stack at console.error:\n" +
          (synthetic.stack || "(no synthetic stack)") +
          "\n=== END NAV-CONTEXT ERROR TRAP ===\n";
        // console.log → Metro terminal, no redbox spam.
        origLog(block);
      }
    } catch {
      // never let the trap itself break logging
    }
    origError(...args);
  };
}

export {}; // ensure this is treated as a module
