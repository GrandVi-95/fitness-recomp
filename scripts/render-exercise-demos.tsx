// Renders every exercise demo pictogram to standalone SVG files plus a
// contact sheet, for visual review.  Usage: npx tsx scripts/render-exercise-demos.tsx <outDir>
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import ExerciseFigure from "../src/components/gym/ExerciseFigure"
import { DEMO_NAMES, getExerciseDemo } from "../src/lib/exerciseDemos"

const out = process.argv[2] ?? "demo-preview"
mkdirSync(out, { recursive: true })

const cards = DEMO_NAMES.map((name, i) => {
  const svg = renderToStaticMarkup(<ExerciseFigure demo={getExerciseDemo(name)!} title={name} />)
    .replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif"')
  const file = `${String(i + 1).padStart(2, "0")}.svg`
  writeFileSync(join(out, file), svg)
  return `<figure data-file="${file}"><figcaption>${i + 1}. ${name}</figcaption>${svg}</figure>`
})

writeFileSync(
  join(out, "index.html"),
  `<!doctype html><meta charset="utf-8"><style>
body{font-family:system-ui,sans-serif;margin:16px;background:#fff;color:#1f2937}
figure{margin:0 0 18px;width:680px;border:1px solid #e5e7eb;border-radius:12px;padding:10px}
figcaption{font-weight:700;margin-bottom:6px}svg{width:100%;height:auto}
</style>${cards.join("\n")}`,
)
console.log(`${DEMO_NAMES.length} demos → ${out}`)
