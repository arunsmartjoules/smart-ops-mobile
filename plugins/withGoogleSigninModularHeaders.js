const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * GoogleSignIn 9.x (pulled in by @react-native-google-signin) depends on the
 * Swift pod AppCheckCore, which imports the non-modular Obj-C pods
 * GoogleUtilities and RecaptchaInterop. Under CocoaPods static libraries those
 * dependencies must emit module maps, otherwise `pod install` fails with:
 *
 *   The Swift pod `AppCheckCore` depends upon `GoogleUtilities` and
 *   `RecaptchaInterop`, which do not define modules.
 *
 * ios/ is prebuild-managed (gitignored), so this plugin re-applies the
 * :modular_headers => true declarations to the generated Podfile on every
 * `expo prebuild`. Idempotent — skips if already present.
 */
const MARKER = "GoogleSignIn modular headers (withGoogleSigninModularHeaders)";
const SNIPPET = [
  `  # ${MARKER}`,
  "  pod 'GoogleUtilities', :modular_headers => true",
  "  pod 'RecaptchaInterop', :modular_headers => true",
].join("\n");

module.exports = function withGoogleSigninModularHeaders(config) {
  return withDangerousMod(config, [
    "ios",
    (cfg) => {
      const podfilePath = path.join(
        cfg.modRequest.platformProjectRoot,
        "Podfile"
      );
      let contents = fs.readFileSync(podfilePath, "utf8");

      if (contents.includes(MARKER)) {
        return cfg;
      }

      // Insert right after `use_expo_modules!` inside the app target.
      const anchor = "use_expo_modules!";
      const idx = contents.indexOf(anchor);
      if (idx === -1) {
        throw new Error(
          "[withGoogleSigninModularHeaders] could not find `use_expo_modules!` anchor in Podfile"
        );
      }
      const insertAt = contents.indexOf("\n", idx) + 1;
      contents =
        contents.slice(0, insertAt) + "\n" + SNIPPET + "\n" + contents.slice(insertAt);

      fs.writeFileSync(podfilePath, contents);
      return cfg;
    },
  ]);
};
