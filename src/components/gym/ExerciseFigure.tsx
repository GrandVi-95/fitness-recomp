import type { ArmSpec, ExerciseDemo, Joint, LegSpec, Muscle, P, Pose, Pt, Shape } from "@/lib/exerciseDemos/types"

// Pure SVG renderer for exercise demo pictograms — no hooks, so it can also
// be rendered to static markup for previews.

const ACCENT = "#FF6A2B"
const PANEL_W = 160
const GAP = 20
const TOP = 20          // muscle tag row
const PANEL_H = 180

// Limb lengths and stroke widths — shared by every figure.
const L = { torso: 48, neckToHead: 15, upperArm: 29, forearm: 27, thigh: 37, shin: 36, foot: 11 }
const W = { torso: 16, frontTorso: 24, upperArm: 8, forearm: 6.5, thigh: 11, shin: 8.5, foot: 6 }
const HEAD_R = 9.5

type Joints = Record<Joint, Pt>

const dir = (deg: number): Pt => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)]
const add = (a: Pt, b: Pt, s = 1): Pt => [a[0] + b[0] * s, a[1] + b[1] * s]
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
/** Unit normal on the anatomical FRONT of a proximal→distal segment (figure faces right). */
const front = (a: Pt, b: Pt): Pt => {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1
  return [dy / len, -dx / len]
}

/** Middle joint of a two-bone limb, from angles or by IK towards `to`. */
function bendJoint(root: Pt, a: number, b: number, spec: { to?: Pt; bend?: 1 | -1 }, a1?: number, a2?: number): [Pt, Pt] {
  if (!spec.to) {
    const mid = add(root, dir(a1 ?? 90), a)
    return [mid, add(mid, dir(a2 ?? 90), b)]
  }
  const dx = spec.to[0] - root[0], dy = spec.to[1] - root[1]
  const d = Math.min(Math.max(Math.hypot(dx, dy), Math.abs(a - b) + 0.01), a + b - 0.01)
  const base = Math.atan2(dy, dx)
  const off = Math.acos((a * a + d * d - b * b) / (2 * a * d)) * (spec.bend ?? 1)
  const mid: Pt = [root[0] + Math.cos(base + off) * a, root[1] + Math.sin(base + off) * a]
  const end: Pt = [root[0] + Math.cos(base) * d, root[1] + Math.sin(base) * d]
  return [mid, end]
}

function solve(pose: Pose): Joints {
  const isFront = pose.view === "front"
  const t = dir(pose.torso ?? -90)
  const neck = add(pose.hip, t, L.torso)
  const head = add(neck, t, L.neckToHead)
  const j = { hip: pose.hip, neck, head } as Joints

  pose.arms.slice(0, 2).forEach((a: ArmSpec, i) => {
    const shoulder: Pt = isFront ? add(neck, [i === 0 ? -11 : 11, 3]) : add(neck, t, -3)
    const [elbow, wrist] = bendJoint(shoulder, L.upperArm, L.forearm, a, a.ua, a.fa)
    j[`shoulder${i}` as Joint] = shoulder
    j[`elbow${i}` as Joint] = elbow
    j[`wrist${i}` as Joint] = wrist
  })
  pose.legs.slice(0, 2).forEach((l: LegSpec, i) => {
    const hipJ: Pt = isFront ? add(pose.hip, [i === 0 ? -6 : 6, 0]) : pose.hip
    const [knee, ankle] = bendJoint(hipJ, L.thigh * (l.thighScale ?? 1), L.shin, l, l.th, l.sh)
    j[`knee${i}` as Joint] = knee
    j[`ankle${i}` as Joint] = ankle
    j[`toe${i}` as Joint] = isFront
      ? add(ankle, [i === 0 ? -6 : 6, 1])
      : add(ankle, dir(l.ft ?? 0), L.foot)
  })
  return j
}

function at(p: P, j: Joints): Pt {
  if (typeof p === "string") return j[p] ?? [0, 0]
  if (typeof p[0] === "string") {
    const base = j[p[0] as Joint] ?? [0, 0]
    return [base[0] + (p[1] as number), base[1] + (p[2] as number)]
  }
  return p as Pt
}

const path = (pts: Pt[]) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("")

function ShapeEl({ s, j }: { s: Shape; j: Joints }) {
  const tone = s.tone ?? "machine"
  const stroke = tone === "band" || tone === "accent" ? ACCENT : "currentColor"
  const opacity = tone === "machine" ? 0.32 : tone === "cable" ? 0.55 : 1
  if (s.k === "line") {
    const w = s.w ?? (tone === "cable" ? 1.5 : tone === "band" ? 2 : tone === "gear" ? 5 : 3)
    return (
      <path d={path(s.pts.map((p) => at(p, j)))} stroke={stroke} strokeOpacity={opacity}
        strokeWidth={w} strokeDasharray={tone === "band" ? "4 3" : undefined} fill="none" />
    )
  }
  if (s.k === "circle") {
    const c = at(s.c, j)
    // Solid circles get a halo so a hand-drawn head separates from the shoulders.
    return tone === "gear" || tone === "accent"
      ? <circle cx={c[0]} cy={c[1]} r={s.r} fill={stroke} stroke="var(--demo-halo, #fff)" strokeWidth={2.5} />
      : <circle cx={c[0]} cy={c[1]} r={s.r} stroke="currentColor" strokeOpacity={opacity} strokeWidth={3} fill="none" />
  }
  const c = at(s.c, j)
  return (
    <rect x={c[0] - s.w / 2} y={c[1] - s.h / 2} width={s.w} height={s.h} rx={Math.min(s.w, s.h) / 2}
      transform={s.rot ? `rotate(${s.rot} ${c[0]} ${c[1]})` : undefined}
      fill={stroke} fillOpacity={tone === "machine" ? 0.28 : 1} />
  )
}

/** Accent stripe along a segment, offset to its front (+1) or back (-1) side. */
function stripe(a: Pt, b: Pt, width: number, side: 1 | -1 | 0, t0 = 0, t1 = 1, key?: string) {
  const n = front(a, b)
  const off = side * width * 0.24
  const p0 = add(lerp(a, b, t0), n, off), p1 = add(lerp(a, b, t1), n, off)
  return <path key={key} d={path([p0, p1])} stroke={ACCENT} strokeWidth={width * 0.55} />
}

const TORSO_MUSCLES: Muscle[] = ["chest", "abs", "lats", "upperBack", "glutes"]

/** Filled patch on one half of the side-view torso, bulging outward so it
 *  reads as a muscle on the body rather than a limb. side 1 = front, -1 = back. */
function torsoPatch(j: Joints, side: 1 | -1, t0: number, t1: number, bulge: number, key: string) {
  const n = front(j.neck, j.hip)
  const e = W.torso / 2
  const at = (t: number, o: number) => add(lerp(j.neck, j.hip, t), n, side * o)
  const [a, b, c, d, m] = [at(t0, 1), at(t0, e), at(t1, e), at(t1, 1), at((t0 + t1) / 2, e + bulge * 2)]
  const f = (p: Pt) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`
  return <path key={key} d={`M${f(a)}L${f(b)}Q${f(m)} ${f(c)}L${f(d)}Z`} fill={ACCENT} stroke={ACCENT} strokeWidth={1.5} />
}

/** Chest/abs/back/glute highlights — drawn on the torso, beneath the near limbs. */
function TorsoHighlights({ muscles, pose, j }: { muscles: Muscle[]; pose: Pose; j: Joints }) {
  const isFront = pose.view === "front"
  const els: React.ReactNode[] = []
  const f = (p: Pt) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`
  for (const m of muscles) {
    switch (m) {
      case "chest":
        if (isFront) {
          for (const dx of [-6.5, 6.5]) {
            const c = add(j.neck, [dx, 11])
            els.push(<ellipse key={`${m}${dx}`} cx={c[0]} cy={c[1]} rx={6} ry={4.8} fill={ACCENT} />)
          }
        } else els.push(torsoPatch(j, 1, 0.1, 0.45, 2, m))
        break
      case "abs":
        if (isFront) els.push(stripe(j.neck, j.hip, 16, 0, 0.5, 0.9, m))
        else els.push(torsoPatch(j, 1, 0.5, 0.92, 0.6, m))
        break
      case "lats":
        if (isFront) {
          for (const sx of [-1, 1]) {
            const pts = [add(j.neck, [sx * 9, 9]), add(j.neck, [sx * 13, 13]), add(j.hip, [sx * 9, -14]), add(j.hip, [sx * 5, -16])]
            els.push(<path key={`${m}${sx}`} d={`M${f(pts[0])}L${f(pts[1])}L${f(pts[2])}L${f(pts[3])}Z`} fill={ACCENT} stroke={ACCENT} strokeWidth={1.5} strokeLinejoin="round" />)
          }
        } else els.push(torsoPatch(j, -1, 0.12, 0.72, 3, m))
        break
      case "upperBack":
        if (isFront) {
          const c = add(j.neck, [0, 12])
          els.push(<rect key={m} x={c[0] - 9} y={c[1] - 5} width={18} height={10} rx={4} fill={ACCENT} />)
        } else els.push(torsoPatch(j, -1, 0.05, 0.38, 1.5, m))
        break
      case "glutes": {
        const c = isFront ? j.hip : add(j.hip, front(j.neck, j.hip), -5)
        els.push(<circle key={m} cx={c[0]} cy={c[1]} r={6} fill={ACCENT} />)
        break
      }
    }
  }
  return <>{els}</>
}

/** Shoulder and limb highlights — drawn over the figure. */
function LimbHighlights({ muscles, pose, j }: { muscles: Muscle[]; pose: Pose; j: Joints }) {
  const isFront = pose.view === "front"
  const els: React.ReactNode[] = []
  const side = (anterior: boolean): 1 | -1 | 0 => (isFront ? 0 : anterior ? 1 : -1)
  const arms = pose.arms.slice(0, 2).map((a, i) => ({ i, far: !!a.far }))
  const legs = pose.legs.slice(0, 2).map((l, i) => ({ i, far: !!l.far }))

  for (const m of muscles) {
    switch (m) {
      case "delts":
      case "rearDelts":
        for (const a of arms) {
          const s = j[`shoulder${a.i}` as Joint]
          const n = front(j.neck, j.hip)
          const c = isFront ? s : add(s, n, m === "rearDelts" ? -3 : 2)
          els.push(<circle key={`${m}${a.i}`} cx={c[0]} cy={c[1]} r={5.5} fill={ACCENT} opacity={a.far ? 0.5 : 1} />)
        }
        break
      case "biceps":
      case "triceps":
        for (const a of arms) {
          els.push(
            <g key={`${m}${a.i}`} opacity={a.far ? 0.5 : 1}>
              {stripe(j[`shoulder${a.i}` as Joint], j[`elbow${a.i}` as Joint], W.upperArm + 2, side(m === "biceps"), 0.15, 0.9)}
            </g>,
          )
        }
        break
      case "quads":
      case "hamstrings":
        for (const l of legs) {
          const hipJ = isFront ? add(j.hip, [l.i === 0 ? -6 : 6, 0]) : j.hip
          els.push(
            <g key={`${m}${l.i}`} opacity={l.far ? 0.5 : 1}>
              {stripe(hipJ, j[`knee${l.i}` as Joint], W.thigh, side(m === "quads"), 0.12, 0.88)}
            </g>,
          )
        }
        break
      case "calves":
        for (const l of legs) {
          els.push(
            <g key={`${m}${l.i}`} opacity={l.far ? 0.5 : 1}>
              {stripe(j[`knee${l.i}` as Joint], j[`ankle${l.i}` as Joint], W.shin, side(false), 0.1, 0.6)}
            </g>,
          )
        }
        break
    }
  }
  return <>{els}</>
}

function Figure({ pose, j, muscles }: { pose: Pose; j: Joints; muscles: Muscle[] }) {
  const isFront = pose.view === "front"
  // Near arms get a halo in the card colour so they stay readable where
  // they cross the (same-coloured) torso.
  const limb = (pts: Pt[], widths: number[], key: string, far?: boolean, halo?: boolean) => (
    <g key={key} opacity={far ? 0.45 : 1}>
      {halo && !far && pts.slice(1).map((p, i) => (
        <path key={`h${i}`} d={path([pts[i], p])} stroke="var(--demo-halo, #fff)" strokeWidth={widths[i] + 3.5} />
      ))}
      {pts.slice(1).map((p, i) => (
        <path key={i} d={path([pts[i], p])} stroke="currentColor" strokeWidth={widths[i]} />
      ))}
    </g>
  )
  const arm = (i: number, far?: boolean) =>
    limb([j[`shoulder${i}` as Joint], j[`elbow${i}` as Joint], j[`wrist${i}` as Joint]], [W.upperArm, W.forearm], `arm${i}`, far, true)
  const leg = (i: number, far?: boolean) => {
    const hipJ = isFront ? add(j.hip, [i === 0 ? -6 : 6, 0]) : j.hip
    return limb([hipJ, j[`knee${i}` as Joint], j[`ankle${i}` as Joint], j[`toe${i}` as Joint]], [W.thigh, W.shin, W.foot], `leg${i}`, far)
  }
  const farLegs = pose.legs.map((l, i) => (l.far ? leg(i, true) : null))
  const farArms = pose.arms.map((a, i) => (a.far ? arm(i, true) : null))
  const nearLegs = pose.legs.map((l, i) => (l.far ? null : leg(i)))
  const nearArms = pose.arms.map((a, i) => (a.far ? null : arm(i)))

  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      {farLegs}
      {farArms}
      {isFront && <path d={path([add(j.neck, [-11, 3]), add(j.neck, [11, 3])])} stroke="currentColor" strokeWidth={W.upperArm} />}
      <path d={path([j.neck, j.hip])} stroke="currentColor" strokeWidth={isFront ? W.frontTorso : W.torso} />
      <circle cx={j.head[0]} cy={j.head[1]} r={HEAD_R} fill="currentColor" />
      <TorsoHighlights muscles={muscles.filter((m) => TORSO_MUSCLES.includes(m))} pose={pose} j={j} />
      {nearLegs}
      {nearArms}
    </g>
  )
}

function ArrowEl({ from, to, bend = 0 }: { from: Pt; to: Pt; bend?: number }) {
  const mid = lerp(from, to, 0.5)
  const n = front(from, to)
  const ctrl = add(mid, n, bend)
  // Arrowhead follows the curve's end tangent.
  const tx = to[0] - ctrl[0], ty = to[1] - ctrl[1], tl = Math.hypot(tx, ty) || 1
  const u: Pt = [tx / tl, ty / tl]
  const h1 = add(add(to, u, -6), [-u[1], u[0]], 4)
  const h2 = add(add(to, u, -6), [u[1], -u[0]], 4)
  return (
    <g stroke={ACCENT} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={`M${from[0]} ${from[1]}Q${ctrl[0]} ${ctrl[1]} ${to[0]} ${to[1]}`} />
      <path d={path([h1, to, h2])} />
    </g>
  )
}

function CueEl({ at: a, label, text }: { at: Pt; label: Pt; text: string }) {
  const w = Math.max(30, text.length * 5.4 + 12)
  const x = Math.min(Math.max(label[0], w / 2 + 1), PANEL_W - w / 2 - 1)
  return (
    <g>
      <path d={path([a, [x, label[1]]])} stroke={ACCENT} strokeWidth={1.2} />
      <circle cx={a[0]} cy={a[1]} r={2.6} fill={ACCENT} />
      <rect x={x - w / 2} y={label[1] - 8} width={w} height={16} rx={8} fill={ACCENT} />
      <text x={x} y={label[1] + 3.6} textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff">
        {text}
      </text>
    </g>
  )
}

function Panel({ demo, pose, x, caption }: { demo: ExerciseDemo; pose: Pose; x: number; caption: string }) {
  const j = solve(pose)
  return (
    <g transform={`translate(${x} ${TOP})`}>
      <g strokeLinecap="round" strokeLinejoin="round">
        {demo.scene?.map((s, i) => <ShapeEl key={`s${i}`} s={s} j={j} />)}
        {pose.props?.filter((s) => s.tone !== "gear" && s.tone !== "accent").map((s, i) => <ShapeEl key={`p${i}`} s={s} j={j} />)}
      </g>
      {pose.figure !== false && <Figure pose={pose} j={j} muscles={demo.muscles} />}
      <g strokeLinecap="round" strokeLinejoin="round">
        {pose.figure !== false && <LimbHighlights muscles={demo.muscles} pose={pose} j={j} />}
        {pose.props?.filter((s) => s.tone === "gear" || s.tone === "accent").map((s, i) => <ShapeEl key={`g${i}`} s={s} j={j} />)}
      </g>
      {pose.arrows?.map((a, i) => <ArrowEl key={`a${i}`} from={at(a.from, j)} to={at(a.to, j)} bend={a.bend} />)}
      {pose.cues?.map((c, i) => <CueEl key={`c${i}`} at={at(c.at, j)} label={c.label} text={c.text} />)}
      <text x={PANEL_W / 2} y={PANEL_H + 14} textAnchor="middle" fontSize={11} fontWeight={600} fill="currentColor">
        {caption}
      </text>
    </g>
  )
}

export default function ExerciseFigure({ demo, title, className }: { demo: ExerciseDemo; title: string; className?: string }) {
  const [first, second] = demo.poses
  const width = PANEL_W * 2 + GAP  // holds are centred in the same frame
  const height = TOP + PANEL_H + 20
  const tagW = demo.muscleLabel.length * 6 + 26
  return (
    // direction: ltr pins text-anchor to the coordinate layout; inheriting the
    // app's RTL flips "start"/"end" and pushes labels out of their pills.
    // letterSpacing: 0 — WebKit lays out spaced SVG text glyph by glyph and
    // skips bidi, so the body's tracking-tight drew Hebrew reversed on iOS.
    <svg style={{ direction: "ltr", letterSpacing: 0 }} viewBox={`0 0 ${width} ${height}`} className={className} role="img" aria-label={`איך מבצעים: ${title}`} fill="none">
      <g transform={`translate(${width - tagW} 2)`}>
        <rect width={tagW} height={16} rx={8} fill={ACCENT} fillOpacity={0.14} />
        <circle cx={tagW - 9} cy={8} r={3.2} fill={ACCENT} />
        <text x={tagW - 17} y={11.6} textAnchor="end" fontSize={10} fontWeight={700} fill={ACCENT}>
          {demo.muscleLabel}
        </text>
      </g>
      {!second ? (
        <Panel demo={demo} pose={first} x={(width - PANEL_W) / 2} caption="החזקה" />
      ) : (
        <>
          <Panel demo={demo} pose={first} x={0} caption="התחלה" />
          <g stroke={ACCENT} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d={`M${PANEL_W + 4} ${TOP + 90}h12M${PANEL_W + 12} ${TOP + 85}l4 5l-4 5`} />
          </g>
          <Panel demo={demo} pose={second} x={PANEL_W + GAP} caption="סיום" />
        </>
      )}
    </svg>
  )
}
