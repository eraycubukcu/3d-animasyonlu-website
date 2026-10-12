// Model coordinates: metres, Y up, car front towards +Z, car's left side
// (driver side) towards +X. Measured from the GLB node bounding boxes.
//
// shift: horizontal framing offset (fraction of screen width, + = car moves
// right) so the car does not sit behind the text panel.
export const SHOTS = {
  hero: { title: 'Giriş', pos: [5.0, 1.55, 5.9], target: [0, 0.5, 0.1], fov: 35, shift: 0.2 },
  front: { title: 'Farlar', pos: [-1.9, 0.9, 4.2], target: [-0.45, 0.6, 1.7], fov: 35, shift: -0.16 },
  wheel: { title: 'Tekerlek', pos: [2.35, 0.48, 1.95], target: [0.84, 0.33, 1.27], fov: 35, shift: 0.17 },
  side: { title: 'Profil', pos: [6.6, 0.85, -0.15], target: [0, 0.6, 0.05], fov: 35, shift: -0.14 },
  cockpit: { title: 'Kokpit', pos: [0.05, 1.05, -0.1], target: [0.36, 0.8, 0.4], fov: 50, shift: 0.12 },
  wing: { title: 'Kanat', pos: [-2.7, 2.15, -3.6], target: [0, 1.15, -1.6], fov: 35, shift: -0.15 },
  rear: { title: 'Arka', pos: [-1.45, 0.55, -3.7], target: [-0.25, 0.42, -1.8], fov: 35, shift: 0.16 },
  explore: { title: 'Serbest', pos: [-5.4, 2.3, 5.2], target: [0, 0.35, 0], fov: 35, shift: 0, mobileLift: 0 },
};

// Clickable 3D markers. `shot` = chapter to scroll to in tour mode,
// `focus`/`size` = what the free-mode camera centres on.
export const HOTSPOTS = [
  { label: 'Far', shot: 'front', pos: [-0.63, 0.62, 1.92], focus: [-0.6, 0.6, 1.75], size: 0.5 },
  { label: 'Far', shot: 'front', pos: [0.63, 0.62, 1.92], focus: [0.6, 0.6, 1.75], size: 0.5 },
  { label: 'Ön tekerlek', shot: 'wheel', pos: [0.95, 0.33, 1.27], focus: [0.82, 0.32, 1.27], size: 0.64 },
  { label: 'Ön tekerlek', shot: 'wheel', pos: [-0.95, 0.33, 1.27], focus: [-0.82, 0.32, 1.27], size: 0.64 },
  { label: 'Arka tekerlek', shot: 'side', pos: [0.95, 0.33, -1.28], focus: [0.82, 0.32, -1.28], size: 0.64 },
  { label: 'Arka tekerlek', shot: 'side', pos: [-0.95, 0.33, -1.28], focus: [-0.82, 0.32, -1.28], size: 0.64 },
  { label: 'Kokpit', shot: 'cockpit', pos: [0.45, 1.2, 0.15], focus: [0.35, 0.8, 0.17], size: 0.5 },
  { label: 'Arka kanat', shot: 'wing', pos: [0, 1.4, -1.75], focus: [0, 1.23, -1.7], size: 1.4 },
  { label: 'Egzoz', shot: 'rear', pos: [-0.31, 0.3, -1.96], focus: [-0.31, 0.3, -1.75], size: 0.45 },
];

const PART_NAMES = [
  [/^(WHEEL|tire|rim|disc)/, 'Tekerlek'],
  [/^(SUSP|caliper)/, 'Fren kaliperi'],
  [/^suspension/, 'Süspansiyon'],
  [/^(hlight|LIGHT_FRONT)/, 'Far'],
  [/^(rlight|LIGHT_REAR)/, 'Stop lambası'],
  [/^rwing/, 'Arka kanat'],
  [/^mirror/, 'Yan ayna'],
  [/^door/, 'Kapı'],
  [/^hood/, 'Motor kaputu'],
  [/^engine/, 'Motor'],
  [/^exhaust/, 'Egzoz'],
  [/^STEER/, 'Direksiyon'],
  [/^shift_paddle/, 'Vites kulakçığı'],
  [/^(COCKPIT|handbrake|led)/, 'Kokpit'],
  [/^(LCD|LED)/, 'Gösterge'],
  [/^window/, 'Cam'],
  [/^bumper_f/, 'Ön tampon'],
  [/^bumper_r/, 'Arka tampon'],
  [/^trunk/, 'Bagaj kapağı'],
  [/^fender/, 'Çamurluk'],
  [/^wipers/, 'Silecek'],
  [/^wheel_replace/, 'Yedek lastik'],
  [/^(body|chassis)/, 'Gövde'],
];

export function partLabel(name) {
  for (const [re, label] of PART_NAMES) if (re.test(name)) return label;
  return name.replace(/_\d+$/, '');
}
