import type { ArmSpec, Cue, ExerciseDemo, LegSpec, Pose, Pt, Shape } from "./types"

// Home demos use the renderer's fixed lengths. Solve contact points rather
// than changing proportions: hands stay on bars and heels stay on supports.
function arm(_hip: Pt, _torso: number, hand: Pt, bend: 1 | -1 = 1): ArmSpec {
  return { to: hand, bend }
}
function leg(_hip: Pt, heel: Pt, bend: 1 | -1 = -1, ft = 0): LegSpec {
  return { to: heel, bend, ft }
}
const cue = (at: Cue["at"], label: Pt, text: string): Cue => ({ at, label, text })
const floor: Shape = { k: "line", pts: [[8, 170], [152, 170]], w: 1 }
const chair: Shape[] = [
  { k: "rect", c: [20, 114], w: 32, h: 6 },
  { k: "line", pts: [[7, 117], [7, 170]] },
  { k: "line", pts: [[33, 117], [33, 170]] },
]
function push(hip: Pt, torso: number, heel: Pt, lowered: boolean, diamond = false, handX = 110): Pose {
  return { hip, torso, arms: [arm(hip, torso, [handX, 166], 1)],
    legs: [leg(hip, heel, -1, heel[1] < 120 ? (heel[0] > 20 ? 25 : 0) : heel[1] > 160 ? 0 : 65)],
    props: diamond ? [{ k: "line", pts: [[handX-5,166],[handX,161],[handX+5,166],[handX,169],[handX-5,166]], tone: "gear", w: 1.5 }] : [],
    cues: lowered
      ? [cue("elbow0", [65, 65], diamond ? "מרפקים צמודים" : "מרפקים קרוב לגוף")]
      : [cue("hip", [62, 40], "גוף בקו ישר"), ...(diamond ? [cue("wrist0", [95, 77], "ידיים ביהלום")] : [])] }
}
const bar: Shape[] = [{ k: "line", pts: [[15,28],[145,28]], tone: "gear", w: 5 }]
function pull(wide: boolean, up: boolean): Pose {
  const barY = 28
  const grip = wide ? 42 : 18
  const shoulderY = up ? barY + 3 : barY + Math.sqrt(56 * 56 - (grip - 11) ** 2)
  return { hip: [80, shoulderY + 45], view: "front",
    arms: [{to:[80-grip,barY],bend:-1},{to:[80+grip,barY],bend:1}],
    legs: [{th:95,sh:155},{th:85,sh:165}],
    cues: [cue(up ? "elbow0" : "wrist0", [80, up ? 143 : 158], up ? "סנטר מעל המוט" : wide ? "תלייה בידיים ישרות" : "כפות ידיים אליך")] }
}
const seatedChair: Shape[] = [{k:"rect",c:[48,132],w:34,h:6},{k:"line",pts:[[35,135],[35,170]]},{k:"line",pts:[[61,135],[61,170]]}]

export const HOME_DEMOS: Record<string, ExerciseDemo> = {
  "שכיבות סמיכה קלאסיות": {
    muscles:["chest"], muscleLabel:"חזה", scene:[floor],
    poses:[push([70.27,131.13],-28,[5.82,165.4],false),push([85.3,158],2.6,[12.4,154.7],true)],
  },
  "ישיבת קיר (Wall Sit)": {
    muscles:["quads"], muscleLabel:"ירך קדמית",
    scene:[floor,{k:"line",pts:[[42,25],[42,170]],w:5}],
    poses:[{hip:[50,130],arms:[{ua:35,fa:0}],legs:[{th:0,sh:90}],
      cues:[cue("hip",[96,31],"גב צמוד לקיר"),cue("knee0",[103,103],"ברך מעל קרסול")]}],
  },
  "שכיבות סמיכה בשיפוע שלילי": {
    muscles:["chest"], muscleLabel:"חזה", scene:[floor,...chair],
    poses:[push([76,110],0,[3,110],false,false,118),{ ...push([90.5,138.2],24.4,[24,108],true,false,118), legs:[{th:204.4,sh:204.4,ft:30}] }],
  },
  "סקוואט בולגרי (Bulgarian Split Squat)": {
    muscles:["quads","glutes"], muscleLabel:"ירך קדמית",scene:[floor,{k:"rect",c:[45,132],w:32,h:6},{k:"line",pts:[[32,135],[32,170]]},{k:"line",pts:[[58,135],[58,170]]}],
    poses:([false,true] as const).map(low=>{
      const hip: Pt = low ? [76,129] : [73,104]
      return {hip,torso:-82,arms:[{ua:45,fa:-75}],
        legs:[leg(hip,[109,166],-1),{...leg(hip,[48,128],-1,0),far:true}],
        cues:[cue(low ? "knee0" : "ankle1", low ? [80,24] : [95,14],low ? "ברך בכיוון האצבעות" : "רגל אחורית נתמכת")]}
    }) as [Pose,Pose],
  },
  "כפיפת מרפקים בישיבה עם גומייה (Band Seated Curls)": {
    muscles:["biceps"],muscleLabel:"יד קדמית",scene:[floor,...seatedChair],
    poses:([false,true] as const).map(up=>({hip:[48,124],arms:[{ua:85,fa:up ? -65 : 65}],legs:[leg([48,124],[101,166],-1)],
      props:[{k:"line",pts:["toe0","wrist0"],tone:"band"}],
      cues:[cue(up ? "elbow0" : "toe0",[90,up ? 40 : 25],up ? "מרפקים במקום" : "גומייה תחת כף רגל")]})) as [Pose,Pose],
  },
  "חרק מת (Dead Bug)": {
    muscles:["abs"],muscleLabel:"בטן",scene:[floor],
    poses:[
      {hip:[104,158],torso:180,arms:[{ua:-90,fa:-90},{ua:-80,fa:-90,far:true}],legs:[{th:-90,sh:0},{th:-80,sh:0,far:true}],
        cues:[cue("hip",[84,83],"גב צמוד לרצפה")]},
      {hip:[103,158],torso:180,arms:[{ua:-90,fa:-90},{ua:180,fa:180,far:true}],legs:[{th:0,sh:0,thighScale:0.4,ft:-80},{th:-90,sh:0,far:true}],
        cues:[cue("ankle0",[80,97],"יד ורגל נגדית")]},
    ],
  },
  "מתח אחיזה רחבה (Pull-ups)": {muscles:["lats"],muscleLabel:"גב רחב",scene:bar,poses:[pull(true,false),pull(true,true)]},
  "חתירה בישיבה עם גומייה (Band Seated Row)": {
    muscles:["lats","upperBack"],muscleLabel:"גב רחב",scene:[floor],
    poses:([false,true] as const).map(back=>({hip:[41,158],torso:-95,arms:[{to:back ? [49,131] : [92,123],bend:1}],
      legs:[{th:-8,sh:8,ft:-80}],props:[{k:"line",pts:["toe0","wrist0"],tone:"band"}],
      cues:[cue(back ? "elbow0" : "neck",[91,back ? 88 : 65],back ? "מרפקים לאחור" : "גב ארוך")]})) as [Pose,Pose],
  },
  "הרחקת כתפיים עם גומייה / בקבוקי מים (Band/Bottle Lateral Raises)": {
    muscles:["delts"],muscleLabel:"כתפיים",scene:[floor],
    poses:([false,true] as const).map(up=>({hip:[80,96],view:"front",arms:[{ua:up ? 180 : 105,fa:up ? 170 : 95},{ua:up ? 0 : 75,fa:up ? 10 : 85}],
      legs:[{th:100,sh:90},{th:80,sh:90}],props:[{k:"rect",c:["wrist0",0,5],w:11,h:20,tone:"gear"},{k:"rect",c:["wrist1",0,5],w:11,h:20,tone:"gear"},{k:"rect",c:["wrist0",0,5],w:11,h:4,tone:"accent"},{k:"rect",c:["wrist1",0,5],w:11,h:4,tone:"accent"},{k:"rect",c:["wrist0",0,-7],w:5,h:4,tone:"gear"},{k:"rect",c:["wrist1",0,-7],w:5,h:4,tone:"gear"}],
      cues:[cue(up ? "elbow0" : "neck",[80,up ? 137 : 123],up ? "עד גובה הכתפיים" : "כתפיים למטה")]})) as [Pose,Pose],
  },
  "שכיבות סמיכה יהלום (Diamond Push-ups)": {
    muscles:["triceps"],muscleLabel:"יד אחורית",scene:[floor],
    poses:[push([70.27,131.13],-28,[5.82,165.4],false,true),push([85.3,158],2.6,[12.4,154.7],true,true)],
  },
  "פאלוף פרס עם גומייה (Band Pallof Press)": {
    muscles:["abs"],muscleLabel:"בטן",scene:[{k:"line",pts:[[12,40],[12,110]]}],
    poses:([false,true] as const).map((out): Pose=>({
      hip:[80,120],figure:false,arms:[],legs:[],
      props:[
        {k:"line",pts:[[12,64],[80,out ? 30 : 70]],tone:"band"},
        {k:"line",pts:out ? [[57,96],[70,60],[77,30]] : [[57,96],[61,78],[77,70]],tone:"gear",w:7},
        {k:"line",pts:out ? [[103,96],[90,60],[83,30]] : [[103,96],[99,78],[83,70]],tone:"gear",w:7},
        {k:"rect",c:[80,96],w:54,h:16,tone:"gear"},
        {k:"rect",c:[80,99],w:15,h:8,tone:"accent"},
        {k:"circle",c:[80,94],r:10,tone:"gear"},
        {k:"rect",c:[80,out ? 30 : 70],w:9,h:9,tone:"gear"},
      ],
      cues:[cue([80,106],[80,145],"מבט מלמעלה"),cue([12,64],[80,12],"גומייה מהצד בגובה החזה")],
    })) as [Pose,Pose],
  },
  "החלקת רגליים על רצפה (Sliding Leg Curls)": {
    muscles:["hamstrings"],muscleLabel:"ירך אחורית",scene:[floor],
    poses:([false,true] as const).map(curl=>{
      const hip: Pt=curl ? [75,139] : [77,140],torso=curl ? 156 : 158
      return {hip,torso,arms:[arm(hip,torso,[63,166],-1)],legs:[leg(hip,curl ? [115,166] : [145,166],-1,-75)],
        props:[{k:"rect",c:["ankle0",0,3],w:20,h:4,tone:"gear"}],
        cues:[cue(curl ? "ankle0" : "hip",[88,86],curl ? "עקבים לכיוון הישבן" : "אגן מורם")]}
    }) as [Pose,Pose],
  },
  "חתירה הפוכה תחת שולחן (Inverted Row)": {
    muscles:["lats","upperBack"],muscleLabel:"גב רחב",
    // Hands grip the table edge; the head clears the edge at the top.
    scene:[floor,{k:"rect",c:[106,60],w:84,h:7},{k:"line",pts:[[144,64],[144,170]]}],
    poses:([false,true] as const).map(up=>{
      const hip: Pt=up ? [93,112.9] : [77.4,134],torso=up ? -133.3 : -154
      return {hip,torso,arms:[arm(hip,torso,[62,64],-1)],legs:[leg(hip,[143,166],-1,-75)],
        cues:[cue(up ? "neck" : "hip",[73,up ? 30 : 95],up ? "חזה אל קצה השולחן" : "גוף בקו ישר")]}
    }) as [Pose,Pose],
  },
  "פרפר חזה עם גומייה (Band Chest Fly)": {
    muscles:["chest"],muscleLabel:"חזה",scene:[floor],
    poses:([false,true] as const).map(close=>({hip:[80,96],view:"front",arms:[{to:close ? [80,72] : [14.73,62.76],bend:1},{to:close ? [80,72] : [145.27,62.76],bend:-1}],
      legs:[{th:102,sh:90},{th:78,sh:90}],props:[{k:"line",pts:["wrist0",["wrist0",0,9],[48,74],[50,58],[80,63],[110,58],[112,74],["wrist1",0,9],"wrist1"],tone:"band"}],
      cues:[cue(close ? "wrist0" : "elbow0",[80,close ? 121 : 26],close ? "סגירה מול החזה" : "מרפקים רכים")]})) as [Pose,Pose],
  },
  "מתח באחיזה הפוכה (Chin-ups)": {muscles:["lats","biceps"],muscleLabel:"גב רחב",scene:[{k:"line",pts:[[15,28],[145,28]],tone:"gear",w:5}],poses:[pull(false,false),pull(false,true)]},
  "הרמת ברכיים בתלייה (בית)": {
    muscles:["abs"],muscleLabel:"בטן",scene:[{k:"line",pts:[[20,-4],[118,-4]],tone:"gear",w:5}],
    poses:([false,true] as const).map(up=>({hip:[70,97],arms:[{ua:-90,fa:-90}],
      legs:up ? [{th:-12,sh:90},{th:-20,sh:90,far:true}] : [{th:80,sh:110},{th:85,sh:105,far:true}],
      cues:[cue(up ? "hip" : "neck",[93,up ? 33 : 45],up ? "גלגול אגן פנימה" : "ללא תנופה")]})) as [Pose,Pose],
  },
}
