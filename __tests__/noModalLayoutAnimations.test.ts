/**
 * Guard against a bug that has shipped twice (JoSheet, then the site-log
 * "Sign to complete" sheet, Oct 2026): Reanimated layout animations
 * (`entering=` / `exiting=`) on the contents of a React Native <Modal> leave
 * the sheet's buttons untouchable on Android — taps fall through to the
 * backdrop. Operators saw "Complete & sign does nothing".
 *
 * Animate sheets with the Modal's own `animationType` ("slide" / "fade")
 * instead. Layout animations outside a Modal are fine and not checked here.
 */
import fs from "fs";
import path from "path";

const ROOTS = ["app", "components"].map((d) => path.join(__dirname, "..", d));

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(tsx|ts)$/.test(entry.name) ? [full] : [];
  });
}

/** Strip comments so documentation mentioning the pattern doesn't count. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/** The JSX between each `<Modal` and its `</Modal>`. */
function modalBlocks(src: string): string[] {
  const blocks: string[] = [];
  const open = /<Modal\b/g;
  let m: RegExpExecArray | null;
  while ((m = open.exec(src))) {
    const end = src.indexOf("</Modal>", m.index);
    blocks.push(src.slice(m.index, end === -1 ? undefined : end));
  }
  return blocks;
}

const offenders = ROOTS.flatMap(sourceFiles)
  .filter((file) => {
    const src = code(fs.readFileSync(file, "utf8"));
    return modalBlocks(src).some((block) => /\b(entering|exiting)=\{/.test(block));
  })
  .map((file) => path.relative(path.join(__dirname, ".."), file));

it("no Modal contains Reanimated entering/exiting animations", () => {
  expect(offenders).toEqual([]);
});

it("would catch the pattern that broke Complete & sign", () => {
  const broken = `<Modal visible transparent animationType="none">
    <Animated.View entering={FadeIn.duration(180)}><Pressable /></Animated.View>
  </Modal>`;
  expect(modalBlocks(code(broken)).some((b) => /\b(entering|exiting)=\{/.test(b))).toBe(true);
});
