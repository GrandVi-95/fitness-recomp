import type { ExerciseDemo } from "./types"

// Gym exercise demos — keyed by the exact Exercise.name from prisma/seed.ts.

export const GYM_DEMOS: Record<string, ExerciseDemo> = {
  "Lat Pulldown": {
    muscles: ["lats"],
    muscleLabel: "גב רחב",
    scene: [
      { k: "line", pts: [[118, 170], [118, 6], [62, 6]] },
      { k: "circle", c: [62, 10], r: 3.5 },
      { k: "rect", c: [52, 138], w: 38, h: 7 },
      { k: "line", pts: [[52, 141], [52, 170]] },
      { k: "line", pts: [[34, 170], [70, 170]] },
      { k: "rect", c: [94, 117], w: 18, h: 7 },
      { k: "line", pts: [[103, 117], [118, 117]] },
    ],
    poses: [
      {
        hip: [55, 128], torso: -100,
        arms: [{ ua: -80, fa: -78 }],
        legs: [{ th: -2, sh: 95 }],
        props: [
          { k: "line", pts: [[62, 13], ["wrist0", 0, -3]], tone: "cable" },
          { k: "rect", c: "wrist0", w: 24, h: 5, tone: "gear" },
        ],
        cues: [{ at: ["wrist0", 8, 0], label: [100, 40], text: "אחיזה רחבה" }],
      },
      {
        hip: [55, 128], torso: -100,
        arms: [{ ua: 110, fa: -48 }],
        legs: [{ th: -2, sh: 95 }],
        props: [
          { k: "line", pts: [[62, 13], ["wrist0", 0, -3]], tone: "cable" },
          { k: "rect", c: "wrist0", w: 24, h: 5, tone: "gear" },
        ],
        arrows: [{ from: ["wrist0", 12, -46], to: ["wrist0", 12, -10] }],
        cues: [
          { at: "elbow0", label: [40, 156], text: "מרפקים למטה ולאחור" },
          { at: ["neck", 9, 8], label: [112, 62], text: "חזה למעלה" },
        ],
      },
    ],
  },
  "Converging Chest Press (Machine)": {
    muscles: ["chest"],
    muscleLabel: "חזה",
    scene: [
      { k: "rect", c: [33, 102], w: 7, h: 56 },
      { k: "rect", c: [54, 137], w: 42, h: 7 },
      { k: "line", pts: [[54, 141], [54, 170]] },
      { k: "line", pts: [[34, 170], [74, 170]] },
    ],
    poses: [
      {
        hip: [50, 128], torso: -95,
        arms: [{ to: [58, 93], bend: 1 }],
        legs: [{ to: [86, 165], bend: -1 }],
        props: [
          { k: "line", pts: [[64, 12], "wrist0"], w: 4 },
          { k: "rect", c: "wrist0", w: 6, h: 15, tone: "gear" },
        ],
        cues: [{ at: ["neck", -8, 8], label: [62, 10], text: "שכמות לאחור ולמטה" }],
      },
      {
        hip: [50, 128], torso: -95,
        arms: [{ to: [101, 88], bend: 1 }],
        legs: [{ to: [86, 165], bend: -1 }],
        props: [
          { k: "line", pts: [[64, 12], "wrist0"], w: 4 },
          { k: "rect", c: "wrist0", w: 6, h: 15, tone: "gear" },
        ],
        arrows: [{ from: ["wrist0", -42, -14], to: ["wrist0", -8, -14] }],
        cues: [{ at: "elbow0", label: [112, 122], text: "לא לנעול מרפקים" }],
      },
    ],
  },

  "Smith Machine Incline Press": {
    muscles: ["chest"],
    muscleLabel: "חזה עליון",
    scene: [
      { k: "line", pts: [[43, 6], [43, 170]], w: 2.5 },
      { k: "line", pts: [[70, 137], [20, 110]], w: 7 },
      { k: "line", pts: [[66, 137], [92, 137]], w: 7 },
      { k: "line", pts: [[72, 140], [72, 170]] },
      { k: "line", pts: [[28, 116], [28, 170]] },
    ],
    poses: [
      {
        hip: [70, 128], torso: -150,
        arms: [{ to: [43, 96], bend: 1 }],
        legs: [{ to: [104, 165], bend: -1 }],
        props: [{ k: "rect", c: "wrist0", w: 24, h: 5, tone: "gear" }],
        cues: [
          { at: ["wrist0", 2, 4], label: [112, 72], text: "בר לחזה העליון" },
          { at: [45, 124], label: [112, 112], text: "שיפוע 30 מעלות" },
        ],
      },
      {
        hip: [70, 128], torso: -150,
        arms: [{ to: [43, 50], bend: 1 }],
        legs: [{ to: [104, 165], bend: -1 }],
        props: [{ k: "rect", c: "wrist0", w: 24, h: 5, tone: "gear" }],
        arrows: [{ from: ["wrist0", 18, 40], to: ["wrist0", 18, 6] }],
        cues: [{ at: "elbow0", label: [112, 92], text: "לא לנעול מרפקים" }],
      },
    ],
  },

  "Leg Press": {
    muscles: ["quads", "glutes"],
    muscleLabel: "ירך קדמית",
    scene: [
      { k: "line", pts: [[60, 166], [152, 74]], w: 2.5 },
      { k: "line", pts: [[58, 150], [16, 104]], w: 7 },
      { k: "line", pts: [[52, 150], [80, 150]], w: 7 },
      { k: "line", pts: [[16, 170], [152, 170]] },
      { k: "line", pts: [[56, 154], [56, 170]] },
    ],
    poses: [
      {
        hip: [60, 140], torso: -130,
        arms: [{ to: [66, 146], bend: -1 }],
        legs: [{ to: [108, 112], bend: -1, ft: -110 }],
        props: [
          { k: "rect", c: ["ankle0", 4, -4], w: 36, h: 6, rot: 45, tone: "gear" },
          { k: "line", pts: [["ankle0", 8, 0], ["ankle0", 22, 14]], w: 4 },
        ],
        cues: [
          { at: "knee0", label: [104, 30], text: "ברכיים בקו האצבעות" },
          { at: ["hip", -6, 6], label: [40, 166], text: "גב תחתון צמוד" },
        ],
      },
      {
        hip: [60, 140], torso: -130,
        arms: [{ to: [66, 146], bend: -1 }],
        legs: [{ to: [121, 99], bend: -1, ft: -110 }],
        props: [
          { k: "rect", c: ["ankle0", 4, -4], w: 36, h: 6, rot: 45, tone: "gear" },
          { k: "line", pts: [["ankle0", 8, 0], ["ankle0", 22, 14]], w: 4 },
        ],
        arrows: [{ from: ["ankle0", 10, 36], to: ["ankle0", 26, 20] }],
        cues: [{ at: "knee0", label: [60, 56], text: "לא לנעול ברכיים" }],
      },
    ],
  },

  "Leg Extensions": {
    muscles: ["quads"],
    muscleLabel: "ירך קדמית",
    scene: [
      { k: "rect", c: [38, 96], w: 7, h: 52 },
      { k: "rect", c: [66, 127], w: 50, h: 8 },
      { k: "line", pts: [[62, 131], [62, 170]] },
      { k: "line", pts: [[40, 170], [84, 170]] },
    ],
    poses: [
      {
        hip: [55, 118], torso: -95,
        arms: [{ to: [72, 126], bend: 1 }],
        legs: [{ th: 0, sh: 95 }],
        props: [
          { k: "line", pts: [[92, 120], ["ankle0", 4, 0]], w: 4 },
          { k: "rect", c: ["ankle0", 5, -2], w: 10, h: 10 },
        ],
        cues: [{ at: "knee0", label: [100, 34], text: "ברך בקו ציר המכונה" }],
      },
      {
        hip: [55, 118], torso: -95,
        arms: [{ to: [72, 126], bend: 1 }],
        legs: [{ th: 0, sh: 3 }],
        props: [
          { k: "line", pts: [[92, 120], ["ankle0", 0, 4]], w: 4 },
          { k: "rect", c: ["ankle0", -2, 6], w: 10, h: 10 },
        ],
        arrows: [{ from: [126, 160], to: [138, 132], bend: -10 }],
        cues: [
          { at: ["knee0", -10, -6], label: [100, 40], text: "שנייה בהחזקה למעלה" },
          { at: ["hip", -6, 4], label: [44, 156], text: "ישבן צמוד למושב" },
        ],
      },
    ],
  },

  "Seated DB Curls": {
    muscles: ["biceps"],
    muscleLabel: "יד קדמית",
    scene: [
      { k: "rect", c: [58, 137], w: 38, h: 7 },
      { k: "line", pts: [[58, 141], [58, 170]] },
      { k: "line", pts: [[40, 170], [76, 170]] },
    ],
    poses: [
      {
        hip: [58, 128],
        arms: [{ ua: 97, fa: 92 }],
        legs: [{ to: [92, 166], bend: -1 }],
        props: [{ k: "circle", c: "wrist0", r: 6.5, tone: "gear" }],
        cues: [{ at: "elbow0", label: [100, 34], text: "מרפקים צמודים לגוף" }],
      },
      {
        hip: [58, 128],
        arms: [{ ua: 92, fa: -72 }],
        legs: [{ to: [92, 166], bend: -1 }],
        props: [{ k: "circle", c: "wrist0", r: 6.5, tone: "gear" }],
        cues: [
          { at: ["neck", 7, 16], label: [112, 26], text: "בלי לנדנד את הגוף" },
          { at: "elbow0", label: [124, 100], text: "מרפק לא זז" },
        ],
      },
    ],
  },

  "Ab Machine": {
    muscles: ["abs"],
    muscleLabel: "בטן",
    scene: [
      { k: "rect", c: [52, 137], w: 40, h: 7 },
      { k: "line", pts: [[52, 141], [52, 170]] },
      { k: "line", pts: [[32, 170], [72, 170]] },
      { k: "rect", c: [98, 160], w: 10, h: 10 },
    ],
    poses: [
      {
        hip: [55, 128], torso: -95,
        arms: [{ to: [62, 80], bend: -1 }],
        legs: [{ to: [90, 158], bend: -1 }],
        props: [
          { k: "line", pts: [[36, 34], "wrist0"], w: 4 },
          { k: "circle", c: [36, 34], r: 4 },
          { k: "rect", c: "wrist0", w: 6, h: 14, tone: "gear" },
        ],
        cues: [{ at: "wrist0", label: [116, 104], text: "אחיזה רפויה בידיות" }],
      },
      {
        hip: [55, 128], torso: -50,
        arms: [{ to: [94, 86], bend: -1 }],
        legs: [{ to: [90, 158], bend: -1 }],
        props: [
          { k: "line", pts: [[36, 34], "wrist0"], w: 4 },
          { k: "circle", c: [36, 34], r: 4 },
          { k: "rect", c: "wrist0", w: 6, h: 14, tone: "gear" },
        ],
        cues: [
          { at: ["hip", 22, -22], label: [112, 116], text: "כיווץ בטן, לא ידיים" },
          { at: "head", label: [60, 26], text: "סנטר לחזה, גב מתגלגל" },
        ],
      },
    ],
  },

  "Chest-Supported Row": {
    muscles: ["lats", "upperBack"],
    muscleLabel: "גב",
    scene: [
      { k: "rect", c: [71, 100], w: 8, h: 36 },
      { k: "line", pts: [[75, 100], [96, 100], [96, 170]] },
      { k: "rect", c: [52, 139], w: 38, h: 7 },
      { k: "line", pts: [[52, 143], [52, 170]] },
      { k: "line", pts: [[32, 170], [118, 170]] },
    ],
    poses: [
      {
        hip: [50, 130], torso: -80,
        arms: [{ to: [106, 106], bend: 1 }],
        legs: [{ to: [86, 166], bend: -1 }],
        props: [
          { k: "line", pts: [[116, 36], "wrist0"], w: 4 },
          { k: "rect", c: "wrist0", w: 6, h: 15, tone: "gear" },
        ],
        cues: [{ at: ["neck", 9, 14], label: [104, 24], text: "חזה צמוד לכרית" }],
      },
      {
        hip: [50, 130], torso: -80,
        arms: [{ to: [64, 106], bend: 1 }],
        legs: [{ to: [86, 166], bend: -1 }],
        props: [
          { k: "line", pts: [[116, 36], "wrist0"], w: 4 },
          { k: "rect", c: "wrist0", w: 6, h: 15, tone: "gear" },
        ],
        arrows: [{ from: [128, 120], to: [96, 120] }],
        cues: [
          { at: "elbow0", label: [44, 24], text: "מרפקים לאחור" },
          { at: ["neck", -7, 8], label: [112, 50], text: "כיווץ שכמות" },
        ],
      },
    ],
  },

  "Seated Lateral Raises": {
    muscles: ["delts"],
    muscleLabel: "כתף אמצעית",
    scene: [
      { k: "rect", c: [80, 126], w: 52, h: 8 },
      { k: "line", pts: [[66, 130], [66, 170]] },
      { k: "line", pts: [[94, 130], [94, 170]] },
    ],
    poses: [
      {
        hip: [80, 120], view: "front",
        arms: [{ ua: 100, fa: 95 }, { ua: 80, fa: 85 }],
        legs: [{ th: 115, sh: 95, thighScale: 0.45 }, { th: 65, sh: 85, thighScale: 0.45 }],
        props: [
          { k: "rect", c: "wrist0", w: 7, h: 15, tone: "gear" },
          { k: "rect", c: "wrist1", w: 7, h: 15, tone: "gear" },
        ],
        cues: [{ at: ["neck", 0, 14], label: [80, 22], text: "גב זקוף, בלי תנופה" }],
      },
      {
        hip: [80, 120], view: "front",
        arms: [{ ua: 179, fa: 172 }, { ua: 1, fa: 8 }],
        legs: [{ th: 115, sh: 95, thighScale: 0.45 }, { th: 65, sh: 85, thighScale: 0.45 }],
        props: [
          { k: "rect", c: "wrist0", w: 7, h: 15, tone: "gear" },
          { k: "rect", c: "wrist1", w: 7, h: 15, tone: "gear" },
        ],
        arrows: [{ from: [128, 112], to: [140, 84], bend: -8 }],
        cues: [
          { at: "elbow1", label: [112, 40], text: "עד גובה הכתפיים" },
          { at: "elbow0", label: [36, 112], text: "מרפק מוביל" },
        ],
      },
    ],
  },

  "Reverse Pec Deck": {
    muscles: ["rearDelts"],
    muscleLabel: "כתף אחורית",
    scene: [
      { k: "rect", c: [80, 126], w: 52, h: 8 },
      { k: "line", pts: [[56, 170], [104, 170]] },
    ],
    poses: [
      {
        hip: [80, 120], view: "front",
        arms: [{ to: [74, 74], bend: -1, far: true }, { to: [86, 74], bend: 1, far: true }],
        legs: [{ th: 115, sh: 95, thighScale: 0.45 }, { th: 65, sh: 85, thighScale: 0.45 }],
        props: [
          { k: "line", pts: [[80, 22], [74, 74]], w: 4 },
          { k: "line", pts: [[80, 22], [86, 74]], w: 4 },
          { k: "rect", c: [80, 74], w: 16, h: 8, tone: "gear" },
        ],
        cues: [
          { at: [80, 74], label: [44, 150], text: "ידיות בגובה כתף" },
          { at: ["neck", 0, 24], label: [124, 150], text: "מבט מאחור" },
        ],
      },
      {
        hip: [80, 120], view: "front",
        arms: [{ ua: 180, fa: 180 }, { ua: 0, fa: 0 }],
        legs: [{ th: 115, sh: 95, thighScale: 0.45 }, { th: 65, sh: 85, thighScale: 0.45 }],
        props: [
          { k: "line", pts: [[80, 22], "wrist0"], w: 4 },
          { k: "line", pts: [[80, 22], "wrist1"], w: 4 },
          { k: "rect", c: "wrist0", w: 6, h: 15, tone: "gear" },
          { k: "rect", c: "wrist1", w: 6, h: 15, tone: "gear" },
        ],
        arrows: [{ from: [100, 108], to: [136, 108] }, { from: [60, 108], to: [24, 108] }],
        cues: [
          { at: "shoulder1", label: [112, 40], text: "כתפיים למטה" },
          { at: "wrist0", label: [44, 132], text: "ידיים בקו הכתפיים" },
        ],
      },
    ],
  },

  "Cable Tricep Pushdown": {
    muscles: ["triceps"],
    muscleLabel: "יד אחורית",
    scene: [
      { k: "line", pts: [[120, 170], [120, 4], [104, 4]] },
      { k: "circle", c: [104, 8], r: 3.5 },
    ],
    poses: [
      {
        hip: [58, 96], torso: -82,
        arms: [{ ua: 96, fa: -40 }],
        legs: [{ to: [61, 167], bend: -1 }],
        props: [
          { k: "line", pts: [[104, 11], "wrist0"], tone: "cable" },
          { k: "rect", c: "wrist0", w: 12, h: 5, tone: "gear" },
        ],
        cues: [{ at: "elbow0", label: [36, 120], text: "מרפקים צמודים" }],
      },
      {
        hip: [58, 96], torso: -82,
        arms: [{ ua: 96, fa: 86 }],
        legs: [{ to: [61, 167], bend: -1 }],
        props: [
          { k: "line", pts: [[104, 11], "wrist0"], tone: "cable" },
          { k: "rect", c: "wrist0", w: 12, h: 5, tone: "gear" },
        ],
        arrows: [{ from: [86, 62], to: [84, 104], bend: -14 }],
        cues: [
          { at: "wrist0", label: [116, 134], text: "יישור מלא למטה" },
          { at: "elbow0", label: [36, 40], text: "רק האמה זזה" },
        ],
      },
    ],
  },

  "Pallof Press": {
    muscles: ["abs"],
    muscleLabel: "בטן (נגד סיבוב)",
    scene: [
      { k: "line", pts: [[8, 30], [8, 100]] },
      { k: "circle", c: [13, 64], r: 3.5 },
    ],
    poses: [
      {
        hip: [80, 120], figure: false, arms: [], legs: [],
        props: [
          { k: "line", pts: [[16, 65], [80, 70]], tone: "cable" },
          { k: "line", pts: [[57, 96], [61, 78], [77, 70]], tone: "gear", w: 7 },
          { k: "line", pts: [[103, 96], [99, 78], [83, 70]], tone: "gear", w: 7 },
          { k: "rect", c: [80, 96], w: 54, h: 16, tone: "gear" },
          { k: "circle", c: [80, 94], r: 10, tone: "gear" },
          { k: "rect", c: [80, 70], w: 9, h: 9, tone: "gear" },
        ],
        cues: [
          { at: [13, 64], label: [60, 24], text: "כבל מהצד, בגובה החזה" },
          { at: [80, 106], label: [80, 150], text: "מבט מלמעלה" },
        ],
      },
      {
        hip: [80, 120], figure: false, arms: [], legs: [],
        props: [
          { k: "line", pts: [[16, 65], [80, 30]], tone: "cable" },
          { k: "line", pts: [[57, 96], [70, 60], [77, 32]], tone: "gear", w: 7 },
          { k: "line", pts: [[103, 96], [90, 60], [83, 32]], tone: "gear", w: 7 },
          { k: "rect", c: [80, 96], w: 54, h: 16, tone: "gear" },
          { k: "circle", c: [80, 94], r: 10, tone: "gear" },
          { k: "rect", c: [80, 30], w: 9, h: 9, tone: "gear" },
        ],
        arrows: [{ from: [118, 70], to: [118, 34] }],
        cues: [
          { at: [80, 106], label: [80, 140], text: "הגוף לא מסתובב" },
          { at: [80, 30], label: [36, 20], text: "החזקה 2 שניות" },
        ],
      },
    ],
  },

  "Seated Leg Curl": {
    muscles: ["hamstrings"],
    muscleLabel: "ירך אחורית",
    scene: [
      { k: "rect", c: [36, 96], w: 7, h: 50 },
      { k: "rect", c: [60, 129], w: 46, h: 8 },
      { k: "line", pts: [[56, 133], [56, 170]] },
      { k: "line", pts: [[34, 170], [80, 170]] },
      { k: "rect", c: [80, 108], w: 26, h: 7 },
    ],
    poses: [
      {
        hip: [52, 120], torso: -95,
        arms: [{ to: [70, 127], bend: 1 }],
        legs: [{ th: -1, sh: 0, ft: -80 }],
        props: [
          { k: "line", pts: [[90, 120], ["ankle0", 0, 8]], w: 4 },
          { k: "rect", c: ["ankle0", 0, 8], w: 11, h: 11 },
        ],
        cues: [{ at: "knee0", label: [100, 30], text: "ברך בקו ציר המכונה" }],
      },
      {
        hip: [52, 120], torso: -95,
        arms: [{ to: [70, 127], bend: 1 }],
        legs: [{ th: -1, sh: 100, ft: 10 }],
        props: [
          { k: "line", pts: [[90, 120], ["ankle0", -7, -2]], w: 4 },
          { k: "rect", c: ["ankle0", -7, -2], w: 11, h: 11 },
        ],
        arrows: [{ from: [132, 132], to: [104, 162], bend: 10 }],
        cues: [
          { at: [80, 108], label: [100, 30], text: "כרית צמודה לירכיים" },
          { at: "ankle0", label: [124, 110], text: "משיכה עד הסוף" },
        ],
      },
    ],
  },

  "High-Wide Leg Press": {
    muscles: ["glutes", "hamstrings"],
    muscleLabel: "ישבן וירך אחורית",
    scene: [
      { k: "line", pts: [[60, 166], [152, 74]], w: 2.5 },
      { k: "line", pts: [[58, 150], [16, 104]], w: 7 },
      { k: "line", pts: [[52, 150], [80, 150]], w: 7 },
      { k: "line", pts: [[16, 170], [152, 170]] },
      { k: "line", pts: [[56, 154], [56, 170]] },
    ],
    poses: [
      {
        hip: [60, 140], torso: -130,
        arms: [{ to: [66, 146], bend: -1 }],
        legs: [{ to: [100, 98], bend: -1, ft: -110 }],
        props: [
          { k: "rect", c: ["ankle0", 4, -4], w: 36, h: 6, rot: 45, tone: "gear" },
          { k: "line", pts: [["ankle0", 8, 0], ["ankle0", 22, 14]], w: 4 },
        ],
        cues: [
          { at: "ankle0", label: [100, 26], text: "רגליים גבוה ורחב" },
          { at: ["hip", -6, 6], label: [40, 166], text: "גב תחתון צמוד" },
        ],
      },
      {
        hip: [60, 140], torso: -130,
        arms: [{ to: [66, 146], bend: -1 }],
        legs: [{ to: [112, 88], bend: -1, ft: -110 }],
        props: [
          { k: "rect", c: ["ankle0", 4, -4], w: 36, h: 6, rot: 45, tone: "gear" },
          { k: "line", pts: [["ankle0", 8, 0], ["ankle0", 22, 14]], w: 4 },
        ],
        arrows: [{ from: ["ankle0", 10, 36], to: ["ankle0", 26, 20] }],
        cues: [
          { at: ["ankle0", 2, 4], label: [64, 26], text: "דחיפה מהעקבים" },
          { at: "knee0", label: [56, 62], text: "לא לנעול ברכיים" },
        ],
      },
    ],
  },

  "Pec Deck Fly": {
    muscles: ["chest"],
    muscleLabel: "חזה",
    scene: [
      { k: "rect", c: [80, 126], w: 52, h: 8 },
      { k: "line", pts: [[56, 170], [104, 170]] },
    ],
    poses: [
      {
        hip: [80, 120], view: "front",
        arms: [{ ua: 178, fa: 174 }, { ua: 2, fa: 6 }],
        legs: [{ th: 115, sh: 95, thighScale: 0.45 }, { th: 65, sh: 85, thighScale: 0.45 }],
        props: [
          { k: "line", pts: [[80, 22], "wrist0"], w: 4 },
          { k: "line", pts: [[80, 22], "wrist1"], w: 4 },
          { k: "rect", c: "wrist0", w: 6, h: 15, tone: "gear" },
          { k: "rect", c: "wrist1", w: 6, h: 15, tone: "gear" },
        ],
        cues: [{ at: ["neck", -9, 9], label: [52, 150], text: "מתיחה עדינה בחזה" }],
      },
      {
        hip: [80, 120], view: "front",
        arms: [{ to: [76, 90], bend: -1, far: true }, { to: [84, 90], bend: 1, far: true }],
        legs: [{ th: 115, sh: 95, thighScale: 0.45 }, { th: 65, sh: 85, thighScale: 0.45 }],
        props: [
          { k: "line", pts: [[80, 22], [76, 90]], w: 4 },
          { k: "line", pts: [[80, 22], [84, 90]], w: 4 },
          { k: "rect", c: [80, 90], w: 16, h: 8, tone: "gear" },
        ],
        arrows: [{ from: [20, 96], to: [50, 96] }, { from: [140, 96], to: [110, 96] }],
        cues: [
          { at: [80, 90], label: [40, 40], text: "לחיצה באמצע" },
          { at: "shoulder1", label: [124, 150], text: "כתפיים למטה" },
        ],
      },
    ],
  },

  "Pull-Ups / Assisted Pull-Ups": {
    muscles: ["lats"],
    muscleLabel: "גב רחב",
    scene: [
      { k: "line", pts: [[50, 22], [126, 22]], tone: "gear", w: 4 },
      { k: "line", pts: [[50, 22], [50, 8]] },
      { k: "line", pts: [[126, 22], [126, 8]] },
    ],
    poses: [
      {
        hip: [78, 125], torso: -88,
        arms: [{ to: [86, 24], bend: 1 }],
        legs: [{ th: 60, sh: 150 }],
        cues: [{ at: "shoulder0", label: [36, 60], text: "תלייה מלאה" }],
      },
      {
        hip: [76, 82], torso: -95,
        arms: [{ to: [92, 24], bend: 1 }],
        legs: [{ th: 60, sh: 150 }],
        arrows: [{ from: [132, 120], to: [132, 80] }],
        cues: [
          { at: ["head", 0, 6], label: [28, 64], text: "סנטר מעל המוט" },
          { at: "elbow0", label: [120, 150], text: "מרפקים לצלעות" },
        ],
      },
    ],
  },

  "Cable Pullover": {
    muscles: ["lats"],
    muscleLabel: "גב רחב",
    scene: [
      { k: "line", pts: [[140, 170], [140, 6], [128, 6]] },
      { k: "circle", c: [128, 10], r: 3.5 },
    ],
    poses: [
      {
        hip: [56, 97], torso: -70,
        arms: [{ ua: -40, fa: -36 }],
        legs: [{ to: [62, 166], bend: -1 }],
        props: [
          { k: "line", pts: [[128, 13], "wrist0"], tone: "cable" },
          { k: "rect", c: "wrist0", w: 12, h: 5, tone: "gear" },
        ],
        cues: [{ at: "elbow0", label: [40, 140], text: "ידיים כמעט ישרות" }],
      },
      {
        hip: [56, 97], torso: -70,
        arms: [{ ua: 80, fa: 82 }],
        legs: [{ to: [62, 166], bend: -1 }],
        props: [
          { k: "line", pts: [[128, 13], "wrist0"], tone: "cable" },
          { k: "rect", c: "wrist0", w: 12, h: 5, tone: "gear" },
        ],
        arrows: [{ from: [118, 40], to: [100, 104], bend: -18 }],
        cues: [
          { at: "wrist0", label: [116, 140], text: "משיכה עד הירכיים" },
          { at: ["neck", -10, 20], label: [34, 30], text: "גב ניטרלי" },
        ],
      },
    ],
  },

  "Cable Lateral Raises": {
    muscles: ["delts"],
    muscleLabel: "כתף אמצעית",
    scene: [
      { k: "line", pts: [[146, 170], [146, 24]] },
      { k: "circle", c: [140, 160], r: 3.5 },
    ],
    poses: [
      {
        hip: [80, 97], view: "front",
        arms: [{ to: [86, 104], bend: 1 }, { ua: 80, fa: 95 }],
        legs: [{ th: 95, sh: 92 }, { th: 85, sh: 88 }],
        props: [
          { k: "line", pts: [[137, 158], "wrist0"], tone: "cable" },
          { k: "rect", c: "wrist0", w: 8, h: 8, tone: "gear" },
        ],
        cues: [{ at: [140, 160], label: [118, 124], text: "כבל מהצד הנגדי" }],
      },
      {
        hip: [80, 97], view: "front",
        arms: [{ ua: 180, fa: 174 }, { ua: 80, fa: 95 }],
        legs: [{ th: 95, sh: 92 }, { th: 85, sh: 88 }],
        props: [
          { k: "line", pts: [[137, 158], "wrist0"], tone: "cable" },
          { k: "rect", c: "wrist0", w: 8, h: 8, tone: "gear" },
        ],
        arrows: [{ from: [26, 92], to: [16, 60], bend: -8 }],
        cues: [
          { at: "wrist0", label: [40, 24], text: "עד גובה הכתף" },
          { at: ["neck", 0, 24], label: [122, 120], text: "בלי להטות גוף" },
        ],
      },
    ],
  },

  "Preacher Curl": {
    muscles: ["biceps"],
    muscleLabel: "יד קדמית",
    scene: [
      { k: "line", pts: [[60, 93], [84, 117]], w: 9 },
      { k: "line", pts: [[84, 117], [84, 170]] },
      { k: "rect", c: [52, 137], w: 38, h: 7 },
      { k: "line", pts: [[52, 141], [52, 170]] },
      { k: "line", pts: [[32, 170], [96, 170]] },
    ],
    poses: [
      {
        hip: [50, 128], torso: -85,
        arms: [{ ua: 45, fa: 72 }],
        legs: [{ to: [72, 166], bend: -1 }],
        props: [
          { k: "line", pts: [[92, 112], "wrist0"], w: 4 },
          { k: "rect", c: "wrist0", w: 7, h: 14, tone: "gear" },
        ],
        cues: [{ at: ["elbow0", -6, -2], label: [116, 60], text: "זרוע צמודה לכרית" }],
      },
      {
        hip: [50, 128], torso: -85,
        arms: [{ ua: 45, fa: -62 }],
        legs: [{ to: [72, 166], bend: -1 }],
        props: [
          { k: "line", pts: [[92, 112], "wrist0"], w: 4 },
          { k: "rect", c: "wrist0", w: 7, h: 14, tone: "gear" },
        ],
        arrows: [{ from: [118, 130], to: [114, 84], bend: 14 }],
        cues: [
          { at: "elbow0", label: [124, 150], text: "מרפק לא מתרומם" },
          { at: "wrist0", label: [40, 24], text: "הורדה איטית" },
        ],
      },
    ],
  },

  "Overhead Cable Tricep Extension": {
    muscles: ["triceps"],
    muscleLabel: "יד אחורית",
    scene: [
      { k: "line", pts: [[6, 170], [6, 30]] },
      { k: "circle", c: [11, 40], r: 3.5 },
    ],
    poses: [
      {
        hip: [62, 100], torso: -65,
        arms: [{ ua: -55, fa: 165 }],
        legs: [{ to: [92, 166], bend: -1 }, { to: [36, 166], far: true }],
        props: [
          { k: "line", pts: [[14, 40], "wrist0"], tone: "cable" },
          { k: "rect", c: "wrist0", w: 8, h: 10, tone: "gear" },
        ],
        cues: [
          { at: "elbow0", label: [118, 70], text: "מרפקים ליד הראש" },
          { at: "wrist0", label: [44, 20], text: "מתיחה מאחורי הראש" },
        ],
      },
      {
        hip: [62, 100], torso: -65,
        arms: [{ ua: -55, fa: -50 }],
        legs: [{ to: [92, 166], bend: -1 }, { to: [36, 166], far: true }],
        props: [
          { k: "line", pts: [[14, 40], "wrist0"], tone: "cable" },
          { k: "rect", c: "wrist0", w: 8, h: 10, tone: "gear" },
        ],
        arrows: [{ from: [72, 32], to: [100, 14], bend: -8 }],
        cues: [
          { at: "wrist0", label: [118, 52], text: "יישור מלא קדימה" },
          { at: "elbow0", label: [118, 100], text: "מרפק לא זז" },
        ],
      },
    ],
  },

  "Hanging Leg Raises": {
    muscles: ["abs"],
    muscleLabel: "בטן",
    scene: [
      { k: "line", pts: [[44, 0], [104, 0]], tone: "gear", w: 4 },
    ],
    poses: [
      {
        hip: [72, 99],
        arms: [{ to: [74, 1], bend: 1 }],
        legs: [{ th: 92, sh: 92, ft: 20 }],
        cues: [{ at: "hip", label: [122, 110], text: "בלי תנופה" }],
      },
      {
        hip: [72, 99], torso: -95,
        arms: [{ to: [74, 1], bend: 1 }],
        legs: [{ th: -2, sh: -2, ft: -80 }],
        arrows: [{ from: [100, 160], to: [138, 116], bend: -16 }],
        cues: [
          { at: ["hip", -6, 4], label: [40, 150], text: "אגן מתגלגל למעלה" },
          { at: "ankle0", label: [116, 56], text: "רגליים ישרות לגובה המותן" },
        ],
      },
    ],
  },
}
