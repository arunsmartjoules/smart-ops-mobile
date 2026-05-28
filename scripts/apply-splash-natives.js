#!/usr/bin/env node
/**
 * Regenerates the native splash assets in android/ and ios/ from the canonical
 * source at assets/images/jouleops-splash.png (transparent square logo) so the
 * pre-built native projects match app.json.
 *
 * Run after editing the source splash image. Idempotent.
 *
 * What it does:
 *   - Resizes the source PNG into every Android drawable-*dpi splashscreen_logo.png
 *     (light + dark variants).
 *   - Resizes the source PNG into the iOS SplashScreenLogo.imageset 1x/2x/3x files
 *     (light + dark variants).
 *   - Rewrites the splash background color in:
 *       android/app/src/main/res/values/colors.xml
 *       android/app/src/main/res/values-night/colors.xml
 *       ios/smartops/Images.xcassets/SplashScreenBackground.colorset/Contents.json
 *       ios/smartops/SplashScreen.storyboard (namedColor SplashScreenBackground)
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "assets/images/jouleops-splash.png");

// Hex must match the value in app.json -> expo-splash-screen.backgroundColor.
const BG_HEX = "#E11111";
const BG_R = 225 / 255;
const BG_G = 17 / 255;
const BG_B = 17 / 255;

if (!fs.existsSync(SRC)) {
  console.error(`Missing source splash: ${SRC}`);
  console.error("Run scripts/build-splash-image.js first.");
  process.exit(1);
}

function resize(outPath, size) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  execFileSync("sips", ["-z", String(size), String(size), SRC, "--out", outPath], {
    stdio: "pipe",
  });
  console.log(`  ${outPath} -> ${size}x${size}`);
}

// Android drawable densities (mdpi=baseline 1x).
const ANDROID_DENSITIES = [
  ["mdpi", 288],
  ["hdpi", 432],
  ["xhdpi", 576],
  ["xxhdpi", 864],
  ["xxxhdpi", 1152],
];

console.log("Android splashscreen_logo.png:");
for (const [dpi, size] of ANDROID_DENSITIES) {
  resize(
    path.join(ROOT, `android/app/src/main/res/drawable-${dpi}/splashscreen_logo.png`),
    size
  );
  resize(
    path.join(
      ROOT,
      `android/app/src/main/res/drawable-night-${dpi}/splashscreen_logo.png`
    ),
    size
  );
}

// iOS imageset. 1x bitmap size = the storyboard frame size in points, so a
// 220x220 logo renders crisply at @3x = 660px. Keep this in sync with the
// imageView frame in SplashScreen.storyboard and `imageWidth` in app.json.
const IOS_LOGO_PT = 220;
const IOS_SCALES = [
  ["image.png", IOS_LOGO_PT],
  ["image@2x.png", IOS_LOGO_PT * 2],
  ["image@3x.png", IOS_LOGO_PT * 3],
  ["dark_image.png", IOS_LOGO_PT],
  ["dark_image@2x.png", IOS_LOGO_PT * 2],
  ["dark_image@3x.png", IOS_LOGO_PT * 3],
];

console.log("iOS SplashScreenLogo imageset:");
for (const [name, size] of IOS_SCALES) {
  resize(
    path.join(ROOT, `ios/smartops/Images.xcassets/SplashScreenLogo.imageset/${name}`),
    size
  );
}

// ---------- color updates ----------

function replaceInFile(filePath, replacer) {
  const orig = fs.readFileSync(filePath, "utf8");
  const next = replacer(orig);
  if (orig !== next) {
    fs.writeFileSync(filePath, next);
    console.log(`updated ${path.relative(ROOT, filePath)}`);
  } else {
    console.log(`unchanged ${path.relative(ROOT, filePath)}`);
  }
}

// Android colors.xml — replace the splashscreen_background value.
const androidColorFiles = [
  path.join(ROOT, "android/app/src/main/res/values/colors.xml"),
  path.join(ROOT, "android/app/src/main/res/values-night/colors.xml"),
];
for (const f of androidColorFiles) {
  replaceInFile(f, (s) =>
    s.replace(
      /(<color\s+name="splashscreen_background">)[^<]+(<\/color>)/,
      `$1${BG_HEX}$2`
    )
  );
}

// iOS colorset.
const colorsetPath = path.join(
  ROOT,
  "ios/smartops/Images.xcassets/SplashScreenBackground.colorset/Contents.json"
);
{
  const json = JSON.parse(fs.readFileSync(colorsetPath, "utf8"));
  for (const c of json.colors ?? []) {
    if (c?.color?.components) {
      c.color.components.red = BG_R.toFixed(14);
      c.color.components.green = BG_G.toFixed(14);
      c.color.components.blue = BG_B.toFixed(14);
      c.color.components.alpha = "1.000";
    }
  }
  fs.writeFileSync(colorsetPath, JSON.stringify(json, null, 2));
  console.log(`updated ${path.relative(ROOT, colorsetPath)}`);
}

// iOS storyboard — patch the inline namedColor + the imageView/image frame
// so the rendered logo size matches the imageset's intrinsic 1x size.
const storyboardPath = path.join(ROOT, "ios/smartops/SplashScreen.storyboard");
replaceInFile(storyboardPath, (s) => {
  let out = s.replace(
    /(<namedColor name="SplashScreenBackground">\s*<color\s+alpha="[^"]+"\s+)blue="[^"]+"\s+green="[^"]+"\s+red="[^"]+"/,
    `$1blue="${BG_B.toFixed(14)}" green="${BG_G.toFixed(14)}" red="${BG_R.toFixed(14)}"`
  );
  // Resize the SplashScreenLogo imageView frame. The constraints center the
  // view, so we also re-center x/y for an iPhone 14-ish reference frame; the
  // values are recomputed at runtime by Auto Layout anyway.
  const w = IOS_LOGO_PT;
  const h = IOS_LOGO_PT;
  out = out.replace(
    /(<rect key="frame")\s+x="[^"]+"\s+y="[^"]+"\s+width="\d+"\s+height="\d+"(\/>\s*<\/imageView>)/,
    (_m, head, tail) => `${head} x="0" y="0" width="${w}" height="${h}"${tail}`
  );
  // Update the <image> resource declaration so the storyboard preview uses
  // the new intrinsic size.
  out = out.replace(
    /(<image name="SplashScreenLogo")\s+width="\d+"\s+height="\d+"(\/>)/,
    `$1 width="${w}" height="${h}"$2`
  );
  return out;
});

console.log("done.");
