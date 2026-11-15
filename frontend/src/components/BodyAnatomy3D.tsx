import { useEffect, useRef } from 'react';
import type * as ThreeTypes from 'three';
import type { BodyRegionAssessment, BodySystemId, OrganStatus } from '../services/bodyHealthModel';

export interface CameraPresetRequest {
  azimuthDeg: number;
  polarRad?: number;
  targetY?: number;
  distance?: number;
  seq: number;
}

interface LoftSlice {
  y: number;
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  backCurve?: number;
  chestPect?: number;
  spineGroove?: number;
  faceSculpt?: number;
  nosePeak?: number;
  orbitIndent?: number;
}

interface OrganVisualMeta {
  group: ThreeTypes.Group;
  materials: ThreeTypes.MeshStandardMaterial[];
  baseEmissive: number;
  anchorLocal: ThreeTypes.Vector3;
}

const STATUS_HEX: Record<OrganStatus, number> = {
  nominal: 0x34d399,
  warning: 0xf59e0b,
  critical: 0xfb7185,
};

const ORGAN_BASE_HEX: Record<BodySystemId, number> = {
  neuro_ocular: 0x67e8f9,
  cardiovascular: 0xf43f5e,
  respiratory: 0x38bdf8,
  metabolic: 0xfb923c,
  musculoskeletal: 0x60a5fa,
  dermal_immune: 0x2dd4bf,
};

const HOLOGRAM_VERTEX_SHADER = `
  varying vec3 vNormalView;
  varying vec3 vViewPos;
  varying float vWorldY;
  void main() {
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewPos = -mvPos.xyz;
    vNormalView = normalize(normalMatrix * normal);
    vWorldY = position.y;
    gl_Position = projectionMatrix * mvPos;
  }
`;

const HOLOGRAM_FRAGMENT_SHADER = `
  uniform vec3 uRimColor;
  uniform vec3 uDeepColor;
  uniform float uRimPower;
  uniform float uCoreOpacity;
  uniform float uRimOpacity;
  varying vec3 vNormalView;
  varying vec3 vViewPos;
  varying float vWorldY;
  void main() {
    vec3 n = normalize(vNormalView);
    vec3 v = normalize(vViewPos);
    float ndotv = clamp(abs(dot(n, v)), 0.0, 1.0);
    float fresnel = pow(1.0 - ndotv, uRimPower);
    float scanBand = 0.04 * sin(vWorldY * 95.0);
    vec3 color = mix(uDeepColor, uRimColor, clamp(fresnel * 1.18 + scanBand, 0.0, 1.0));
    float alpha = clamp(uCoreOpacity + fresnel * uRimOpacity, 0.0, 0.90);
    gl_FragColor = vec4(color, alpha);
  }
`;

function averageSeamNormals(
  geom: ThreeTypes.BufferGeometry,
  ringCount: number,
  radialSegs: number,
): void {
  const stride = radialSegs + 1;
  const normals = geom.getAttribute('normal') as ThreeTypes.BufferAttribute;
  for (let i = 0; i < ringCount; i++) {
    const startIdx = i * stride;
    const endIdx = i * stride + radialSegs;
    const nx = (normals.getX(startIdx) + normals.getX(endIdx)) * 0.5;
    const ny = (normals.getY(startIdx) + normals.getY(endIdx)) * 0.5;
    const nz = (normals.getZ(startIdx) + normals.getZ(endIdx)) * 0.5;
    const len = Math.hypot(nx, ny, nz) || 1;
    normals.setXYZ(startIdx, nx / len, ny / len, nz / len);
    normals.setXYZ(endIdx, nx / len, ny / len, nz / len);
  }
  normals.needsUpdate = true;
}

function buildLoftedMesh(
  THREE: typeof ThreeTypes,
  slices: LoftSlice[],
  radialSegs = 40,
  capEnds = true,
): ThreeTypes.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const stride = radialSegs + 1;

  for (let i = 0; i < slices.length; i++) {
    const s = slices[i];
    for (let j = 0; j <= radialSegs; j++) {
      const theta = (j / radialSegs) * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      let rxLocal = s.rx;
      let rzLocal = s.rz;

      // Sculpt bilateral pectoral/ribcage relief and subtle midline sternum groove on anterior side
      if (sinT > 0 && s.chestPect) {
        const midGroove = Math.exp(-Math.pow(cosT * 4.4, 2));
        const pectDome = Math.exp(-Math.pow((Math.abs(cosT) - 0.50) * 3.0, 2));
        rzLocal *= 1 + (pectDome * 0.16 - midGroove * 0.11) * s.chestPect * sinT;
      }

      // Sculpt dorsal spinal furrow, shoulder blade fullness, and gluteal lobes on posterior side
      if (sinT < 0 && s.spineGroove) {
        const spineDip = Math.exp(-Math.pow(cosT * 4.2, 2));
        const paraspinalDome = Math.exp(-Math.pow((Math.abs(cosT) - 0.46) * 2.8, 2));
        rzLocal *= 1 + (paraspinalDome * 0.16 - spineDip * 0.22) * s.spineGroove * Math.abs(sinT);
      }

      // Sculpt facial brow, orbital sockets, nasal bridge, zygomatic cheeks, and cranium occiput
      if (sinT > 0 && s.faceSculpt) {
        const cheekFlare = Math.exp(-Math.pow((Math.abs(cosT) - 0.62) * 3.4, 2));
        rxLocal *= 1 + cheekFlare * 0.06 * s.faceSculpt;
        const noseLobe = s.nosePeak ? Math.exp(-Math.pow(cosT * 5.6, 2)) * s.nosePeak : 0;
        const eyeSocket = s.orbitIndent ? Math.exp(-Math.pow((Math.abs(cosT) - 0.36) * 5.0, 2)) * s.orbitIndent : 0;
        rzLocal *= 1 + (noseLobe - eyeSocket) * sinT;
      }

      const backMod = sinT < 0 && s.backCurve ? 1 + s.backCurve * Math.abs(sinT) : 1;
      const x = s.cx + rxLocal * cosT;
      const z = s.cz + rzLocal * sinT * backMod;
      positions.push(x, s.y, z);
    }
  }

  for (let i = 0; i < slices.length - 1; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + (j + 1);
      const d = i * stride + (j + 1);
      indices.push(a, b, c, a, c, d);
    }
  }

  if (capEnds && slices.length >= 2) {
    const bottomCenterIdx = positions.length / 3;
    const first = slices[0];
    positions.push(first.cx, first.y, first.cz);
    for (let j = 0; j < radialSegs; j++) {
      indices.push(bottomCenterIdx, j + 1, j);
    }
    const topCenterIdx = positions.length / 3;
    const last = slices[slices.length - 1];
    const topStart = (slices.length - 1) * stride;
    positions.push(last.cx, last.y, last.cz);
    for (let j = 0; j < radialSegs; j++) {
      indices.push(topCenterIdx, topStart + j, topStart + j + 1);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  averageSeamNormals(geom, slices.length, radialSegs);
  return geom;
}

function buildCurveLimbMesh(
  THREE: typeof ThreeTypes,
  points: ThreeTypes.Vector3[],
  radii: Array<[number, number]>,
  tubularSegs = 32,
  radialSegs = 22,
): ThreeTypes.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const positions: number[] = [];
  const indices: number[] = [];
  const stride = radialSegs + 1;

  // Rotation-minimizing Bishop frame prevents inflection twisting across knee/calf & elbow S-curves
  const t0 = curve.getTangentAt(0).normalize();
  const zRef = new THREE.Vector3(0, 0, 1);
  if (Math.abs(t0.dot(zRef)) > 0.92) zRef.set(1, 0, 0);
  const right = new THREE.Vector3().crossVectors(zRef, t0).normalize();
  const fwd = new THREE.Vector3().crossVectors(right, t0).normalize();

  for (let i = 0; i <= tubularSegs; i++) {
    const tFrac = i / tubularSegs;
    const pt = curve.getPointAt(tFrac);
    const tangent = curve.getTangentAt(tFrac).normalize();

    if (i > 0) {
      right.addScaledVector(tangent, -right.dot(tangent)).normalize();
      fwd.crossVectors(right, tangent).normalize();
    }

    const scaledIdx = tFrac * (radii.length - 1);
    const lo = Math.floor(scaledIdx);
    const hi = Math.min(radii.length - 1, lo + 1);
    const frac = scaledIdx - lo;
    const rx = radii[lo][0] * (1 - frac) + radii[hi][0] * frac;
    const rz = radii[lo][1] * (1 - frac) + radii[hi][1] * frac;

    for (let j = 0; j <= radialSegs; j++) {
      const theta = (j / radialSegs) * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const vx = pt.x + (right.x * cosT * rx) + (fwd.x * sinT * rz);
      const vy = pt.y + (right.y * cosT * rx) + (fwd.y * sinT * rz);
      const vz = pt.z + (right.z * cosT * rx) + (fwd.z * sinT * rz);
      positions.push(vx, vy, vz);
    }
  }

  for (let i = 0; i < tubularSegs; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + (j + 1);
      const d = i * stride + (j + 1);
      indices.push(a, b, c, a, c, d);
    }
  }

  const endCapOffset = positions.length / 3;
  const p0 = curve.getPointAt(0);
  const p1 = curve.getPointAt(1);
  positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
  for (let j = 0; j < radialSegs; j++) {
    indices.push(endCapOffset, j + 1, j);
    const lastRing = tubularSegs * stride;
    indices.push(endCapOffset + 1, lastRing + j, lastRing + j + 1);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  averageSeamNormals(geom, tubularSegs + 1, radialSegs);
  return geom;
}

function createMultidimensionalBackdrop(
  THREE: typeof ThreeTypes,
  scene: ThreeTypes.Scene,
): { elevationRingMat: ThreeTypes.LineBasicMaterial; elevationRing: ThreeTypes.LineLoop } {
  const backdrop = new THREE.Group();
  scene.add(backdrop);

  const floorY = -0.848;
  const minorStep = 0.25;
  const gridCount = 16;
  const halfExtent = gridCount * minorStep;
  const minorVerts: number[] = [];
  const majorVerts: number[] = [];

  for (let k = -gridCount; k <= gridCount; k++) {
    if (k === 0) continue;
    const d = k * minorStep;
    const target = k % 4 === 0 ? majorVerts : minorVerts;
    target.push(-halfExtent, floorY, d, halfExtent, floorY, d);
    target.push(d, floorY, -halfExtent, d, floorY, halfExtent);
  }

  const addFloorSegments = (verts: number[], color: number, opacity: number) => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    backdrop.add(
      new THREE.LineSegments(
        geom,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity, fog: true }),
      ),
    );
  };

  addFloorSegments(minorVerts, 0x163d59, 0.34);
  addFloorSegments(majorVerts, 0x225a82, 0.52);
  addFloorSegments([-halfExtent, floorY + 0.001, 0, halfExtent, floorY + 0.001, 0], 0x9e424e, 0.42);
  addFloorSegments([0, floorY + 0.001, -halfExtent, 0, floorY + 0.001, halfExtent], 0x468854, 0.42);

  // Subtle floor stance anchor ring beneath the feet without any enclosing box or sphere lines
  const stancePts: ThreeTypes.Vector3[] = [];
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2;
    stancePts.push(new THREE.Vector3(Math.cos(a) * 0.34, floorY + 0.002, Math.sin(a) * 0.34));
  }
  backdrop.add(
    new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(stancePts),
      new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.24, fog: true }),
    ),
  );

  // Dynamic axial scan plane ring that smoothly tracks active selected system elevation
  const scanPts: ThreeTypes.Vector3[] = [];
  for (let k = 0; k < 56; k++) {
    const a = (k / 56) * Math.PI * 2;
    scanPts.push(new THREE.Vector3(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.28));
  }
  const elevationRingMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.42, fog: false });
  const elevationRing = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(scanPts), elevationRingMat);
  elevationRing.position.y = 0.74;
  backdrop.add(elevationRing);

  return { elevationRingMat, elevationRing };
}

function buildHumanShellGeometry(
  THREE: typeof ThreeTypes,
  anatomyGroup: ThreeTypes.Group,
  shellMat: ThreeTypes.ShaderMaterial,
  wireContourMat: ThreeTypes.MeshBasicMaterial,
): void {
  const addLayeredSurface = (geom: ThreeTypes.BufferGeometry) => {
    anatomyGroup.add(new THREE.Mesh(geom, shellMat));
    anatomyGroup.add(new THREE.Mesh(geom, wireContourMat));
  };

  // Sculpted torso from pelvic base to upper trapezius/neck with anatomical front/back topology
  const torsoSlices: LoftSlice[] = [
    { y: -0.075, cx: 0, cz: 0.002, rx: 0.112, rz: 0.088 },
    { y: 0.005, cx: 0, cz: -0.015, rx: 0.158, rz: 0.106, backCurve: 0.22, spineGroove: 0.9 },
    { y: 0.095, cx: 0, cz: 0.004, rx: 0.138, rz: 0.096, spineGroove: 0.65 },
    { y: 0.19, cx: 0, cz: 0.010, rx: 0.125, rz: 0.090, chestPect: 0.35, spineGroove: 0.65 },
    { y: 0.285, cx: 0, cz: 0.009, rx: 0.146, rz: 0.105, chestPect: 0.55, spineGroove: 0.72, backCurve: 0.08 },
    { y: 0.395, cx: 0, cz: 0.004, rx: 0.178, rz: 0.116, chestPect: 1.0, spineGroove: 0.95, backCurve: 0.12 },
    { y: 0.48, cx: 0, cz: -0.004, rx: 0.194, rz: 0.098, chestPect: 0.55, spineGroove: 0.70 },
    { y: 0.525, cx: 0, cz: -0.008, rx: 0.115, rz: 0.078, spineGroove: 0.45 },
    { y: 0.558, cx: 0, cz: -0.009, rx: 0.064, rz: 0.062 },
  ];
  addLayeredSurface(buildLoftedMesh(THREE, torsoSlices, 42, true));

  // Sculpted neck, jaw, facial plane, nose bridge, brow, cheekbones & cranium vault
  const headSlices: LoftSlice[] = [
    { y: 0.548, cx: 0, cz: -0.008, rx: 0.060, rz: 0.060 },
    { y: 0.618, cx: 0, cz: 0.002, rx: 0.052, rz: 0.056 },
    { y: 0.648, cx: 0, cz: 0.024, rx: 0.048, rz: 0.068, faceSculpt: 0.4 },
    { y: 0.680, cx: 0, cz: 0.022, rx: 0.064, rz: 0.082, faceSculpt: 0.85, nosePeak: 0.07 },
    { y: 0.718, cx: 0, cz: 0.016, rx: 0.074, rz: 0.088, faceSculpt: 1.0, nosePeak: 0.14, orbitIndent: 0.07 },
    { y: 0.748, cx: 0, cz: 0.012, rx: 0.078, rz: 0.094, faceSculpt: 0.85, nosePeak: 0.08, orbitIndent: 0.04 },
    { y: 0.790, cx: 0, cz: 0.002, rx: 0.078, rz: 0.098 },
    { y: 0.835, cx: 0, cz: -0.006, rx: 0.062, rz: 0.078 },
    { y: 0.864, cx: 0, cz: -0.008, rx: 0.026, rz: 0.032 },
  ];
  addLayeredSurface(buildLoftedMesh(THREE, headSlices, 36, true));

  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 12), shellMat);
    ear.scale.set(0.42, 1.32, 0.74);
    ear.position.set(side * 0.079, 0.725, -0.006);
    anatomyGroup.add(ear);

    // Muscular deltoid shoulder cap bridging upper torso and arm cleanly without gap
    const deltoid = new THREE.Mesh(new THREE.SphereGeometry(0.062, 18, 16), shellMat);
    deltoid.scale.set(0.92, 1.15, 0.88);
    deltoid.position.set(side * 0.194, 0.456, -0.005);
    anatomyGroup.add(deltoid);

    const armPts = [
      new THREE.Vector3(side * 0.186, 0.458, -0.005),
      new THREE.Vector3(side * 0.232, 0.415, -0.004),
      new THREE.Vector3(side * 0.258, 0.280, 0.0),
      new THREE.Vector3(side * 0.278, 0.140, -0.010),
      new THREE.Vector3(side * 0.304, 0.018, 0.012),
      new THREE.Vector3(side * 0.324, -0.105, 0.024),
    ];
    const armRadii: Array<[number, number]> = [
      [0.056, 0.054],
      [0.055, 0.052],
      [0.046, 0.045],
      [0.036, 0.034],
      [0.041, 0.036],
      [0.024, 0.022],
    ];
    addLayeredSurface(buildCurveLimbMesh(THREE, armPts, armRadii, 30, 22));

    // Articulated flattened hand + thumb + 4 finger rays for authentic silhouette
    const handGroup = new THREE.Group();
    handGroup.position.set(side * 0.328, -0.125, 0.025);
    handGroup.rotation.set(0.06, side * -0.18, side * 0.10);
    anatomyGroup.add(handGroup);

    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.028, 14, 12), shellMat);
    palm.scale.set(0.56, 1.35, 1.05);
    palm.position.set(0, -0.024, 0.002);
    handGroup.add(palm);

    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.0065, 0.026, 6, 8), shellMat);
    thumb.position.set(side * -0.008, -0.018, 0.024);
    thumb.rotation.set(0.45, 0, side * -0.25);
    handGroup.add(thumb);

    const fingerOffsets = [0.017, 0.006, -0.005, -0.016];
    const fingerLengths = [0.038, 0.044, 0.040, 0.032];
    fingerOffsets.forEach((fz, fIdx) => {
      const fLen = fingerLengths[fIdx];
      const digit = new THREE.Mesh(new THREE.CapsuleGeometry(0.0052, fLen, 6, 8), shellMat);
      digit.position.set(side * 0.003, -0.056 - fLen * 0.45, fz + 0.002);
      handGroup.add(digit);
    });

    // Articulated leg with quadriceps fullness, knee taper, rearward calf bulge, ankle, and arched foot
    const legPts = [
      new THREE.Vector3(side * 0.088, -0.015, 0.0),
      new THREE.Vector3(side * 0.112, -0.18, 0.008),
      new THREE.Vector3(side * 0.108, -0.425, 0.008),
      new THREE.Vector3(side * 0.105, -0.575, -0.018),
      new THREE.Vector3(side * 0.102, -0.775, -0.008),
      new THREE.Vector3(side * 0.102, -0.828, 0.006),
    ];
    const legRadii: Array<[number, number]> = [
      [0.084, 0.088],
      [0.072, 0.078],
      [0.050, 0.054],
      [0.052, 0.060],
      [0.032, 0.036],
      [0.033, 0.044],
    ];
    addLayeredSurface(buildCurveLimbMesh(THREE, legPts, legRadii, 34, 24));

    const footGroup = new THREE.Group();
    footGroup.position.set(side * 0.103, -0.822, 0.008);
    footGroup.rotation.y = side * 0.08;
    anatomyGroup.add(footGroup);

    const instep = new THREE.Mesh(new THREE.SphereGeometry(0.038, 16, 12), shellMat);
    instep.scale.set(0.95, 0.52, 2.25);
    instep.position.set(0, -0.002, 0.045);
    footGroup.add(instep);

    const heel = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 10), shellMat);
    heel.scale.set(0.92, 0.72, 1.05);
    heel.position.set(0, -0.004, -0.015);
    footGroup.add(heel);
  }
}

type BodyControlsHandle = {
  update: () => void;
  dispose: () => void;
  target: ThreeTypes.Vector3;
  getAzimuthalAngle: () => number;
  getPolarAngle: () => number;
  enableDamping: boolean;
  dampingFactor: number;
  enableRotate: boolean;
  enableZoom: boolean;
  zoomToCursor: boolean;
  enablePan: boolean;
  screenSpacePanning: boolean;
  minDistance: number;
  maxDistance: number;
  minPolarAngle: number;
  maxPolarAngle: number;
  mouseButtons: {
    LEFT?: ThreeTypes.MOUSE | null | undefined;
    MIDDLE?: ThreeTypes.MOUSE | null | undefined;
    RIGHT?: ThreeTypes.MOUSE | null | undefined;
  };
  touches: { ONE?: ThreeTypes.TOUCH | null | undefined; TWO?: ThreeTypes.TOUCH | null | undefined };
  addEventListener: (name: string, fn: () => void) => void;
  removeEventListener: (name: string, fn: () => void) => void;
};

export default function BodyAnatomy3D({
  systems,
  selectedId,
  onSelect,
  heartRate,
  respirationRate,
  presetRequest,
  pinRefs,
  azimuthLabelRef,
  onWebglReady,
}: {
  systems: BodyRegionAssessment[];
  selectedId: BodySystemId;
  onSelect: (id: BodySystemId) => void;
  heartRate: number;
  respirationRate: number;
  presetRequest: CameraPresetRequest | null;
  pinRefs: React.MutableRefObject<Partial<Record<BodySystemId, HTMLButtonElement | null>>>;
  azimuthLabelRef: React.MutableRefObject<HTMLSpanElement | null>;
  onWebglReady: (ready: boolean) => void;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const latestStateRef = useRef({ systems, selectedId, heartRate, respirationRate, onSelect });
  latestStateRef.current = { systems, selectedId, heartRate, respirationRate, onSelect };

  const glideRef = useRef<{
    azimuthRad: number;
    polarRad: number;
    targetY: number;
    distance?: number;
    active: boolean;
    needsReset?: boolean;
  }>({ azimuthRad: 0.22, polarRad: 1.46, targetY: -0.02, active: false, needsReset: false });

  useEffect(() => {
    if (!presetRequest) return;
    glideRef.current = {
      azimuthRad: (presetRequest.azimuthDeg * Math.PI) / 180,
      polarRad: presetRequest.polarRad ?? 1.46,
      targetY: presetRequest.targetY ?? -0.02,
      distance: presetRequest.distance,
      active: true,
      needsReset: true,
    };
  }, [presetRequest]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container || typeof window === 'undefined') return;

    let disposed = false;
    let frameId = 0;
    let renderer: ThreeTypes.WebGLRenderer | null = null;
    let controls: BodyControlsHandle | null = null;

    const cleanups: Array<() => void> = [];

    async function initScene() {
      let THREE: typeof ThreeTypes;
      let OrbitControlsCtor: new (
        camera: ThreeTypes.Camera,
        domElement: HTMLElement,
      ) => NonNullable<typeof controls>;

      try {
        const [threeMod, orbitMod] = await Promise.all([
          import('three'),
          import('three/examples/jsm/controls/OrbitControls.js'),
        ]);
        THREE = threeMod;
        OrbitControlsCtor = orbitMod.OrbitControls as unknown as typeof OrbitControlsCtor;
      } catch {
        onWebglReady(false);
        return;
      }

      if (disposed || !container) return;

      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      } catch {
        onWebglReady(false);
        return;
      }

      const initWidth = Math.max(container.clientWidth, 240);
      const initHeight = Math.max(container.clientHeight, 320);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(initWidth, initHeight);
      renderer.setClearColor(0x051322, 1);
      renderer.domElement.className = 'body-3d-canvas';
      renderer.domElement.tabIndex = 0;
      renderer.domElement.style.cursor = 'grab';
      renderer.domElement.setAttribute(
        'aria-label',
        'Interactive 3D astronaut anatomical model: drag to rotate 360 degrees, right-drag or Space plus drag or two-finger drag or Arrow keys to move in any direction, scroll to zoom into hovered region, double-click or press C to center',
      );
      container.innerHTML = '';
      container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x051322, 0.16);

      const camera = new THREE.PerspectiveCamera(36, initWidth / initHeight, 0.03, 20);
      // Frame the full head-to-feet astronaut figure symmetrically with top HUD and floor clearance.
      camera.position.set(0.72, 0.24, 3.68);

      const controlsInstance = new OrbitControlsCtor(camera, renderer.domElement);
      controls = controlsInstance;
      controlsInstance.enableDamping = true;
      controlsInstance.dampingFactor = 0.08;
      controlsInstance.enableRotate = true;
      controlsInstance.enableZoom = true;
      // Combine direct multi-gesture Orbit (left-drag), Move (right/middle/Space/Shift/2-finger/arrows), and Center (double-click/C) without UI buttons
      controlsInstance.zoomToCursor = false;
      controlsInstance.enablePan = false;
      controlsInstance.screenSpacePanning = true;
      controlsInstance.minDistance = 0.45;
      controlsInstance.maxDistance = 5.4;
      controlsInstance.minPolarAngle = 1.10;
      controlsInstance.maxPolarAngle = 1.75;
      controlsInstance.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: null, RIGHT: null };
      controlsInstance.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
      controlsInstance.target.set(0, -0.02, 0);
      controlsInstance.update();

      scene.add(new THREE.AmbientLight(0x9bdaf3, 0.72));
      const keyLight = new THREE.DirectionalLight(0x67e8f9, 1.35);
      keyLight.position.set(1.8, 2.6, 2.4);
      scene.add(keyLight);
      const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.9);
      rimLight.position.set(-2.2, 1.0, -2.0);
      scene.add(rimLight);
      const warmCoreLight = new THREE.PointLight(0xfb7185, 0.7, 2.4);
      warmCoreLight.position.set(0.05, 0.32, 0.22);
      scene.add(warmCoreLight);

      const { elevationRingMat, elevationRing } = createMultidimensionalBackdrop(THREE, scene);

      const anatomyGroup = new THREE.Group();
      scene.add(anatomyGroup);

      // Keep human body & organs un-fogged so anatomical visualization stays crisp behind depth grid lines
      const shellUniforms = {
        uRimColor: { value: new THREE.Color(0x67e8f9) },
        uDeepColor: { value: new THREE.Color(0x09243c) },
        uRimPower: { value: 1.95 },
        uCoreOpacity: { value: 0.06 },
        uRimOpacity: { value: 0.84 },
      };
      const shellMaterial = new THREE.ShaderMaterial({
        uniforms: shellUniforms,
        vertexShader: HOLOGRAM_VERTEX_SHADER,
        fragmentShader: HOLOGRAM_FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        side: THREE.FrontSide,
        fog: false,
      });
      const wireContourMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        wireframe: true,
        transparent: true,
        opacity: 0.055,
        depthWrite: false,
        fog: false,
      });

      buildHumanShellGeometry(THREE, anatomyGroup, shellMaterial, wireContourMat);

      // Internal skeletal structure (vertebrae, scapulae, ribcage, sternum, clavicles, pelvis, long bones)
      const boneMat = new THREE.MeshBasicMaterial({
        color: 0x7dd3fc,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
        fog: false,
      });

      const spinePts = [
        new THREE.Vector3(0, 0.62, -0.012),
        new THREE.Vector3(0, 0.48, -0.046),
        new THREE.Vector3(0, 0.34, -0.064),
        new THREE.Vector3(0, 0.18, -0.036),
        new THREE.Vector3(0, 0.02, -0.048),
      ];
      const spineCurve = new THREE.CatmullRomCurve3(spinePts);
      for (let k = 0; k < 22; k++) {
        const pt = spineCurve.getPointAt(k / 21);
        const vertebra = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.017, 0.018, 12), boneMat);
        vertebra.position.copy(pt);
        anatomyGroup.add(vertebra);
      }

      for (let r = 0; r < 9; r++) {
        const frac = r / 8;
        const yBack = 0.48 - frac * 0.195;
        const yFront = yBack - 0.022;
        const widthFactor = Math.sin(0.38 + frac * 2.15);
        const ribW = 0.090 + widthFactor * 0.052;
        for (const side of [-1, 1]) {
          const ribCurve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(side * 0.014, yBack, -0.056),
            new THREE.Vector3(side * ribW, yBack - 0.010, -0.005),
            new THREE.Vector3(side * (ribW * 0.72), yFront - 0.005, 0.068),
            new THREE.Vector3(side * 0.014, yFront, 0.080),
          ]);
          anatomyGroup.add(new THREE.Mesh(new THREE.TubeGeometry(ribCurve, 18, 0.0048, 7, false), boneMat));
        }
      }
      const sternum = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.008, 0.168, 8), boneMat);
      sternum.position.set(0, 0.38, 0.082);
      anatomyGroup.add(sternum);

      for (const side of [-1, 1]) {
        const clavicleCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(side * 0.016, 0.485, 0.068),
          new THREE.Vector3(side * 0.088, 0.502, 0.042),
          new THREE.Vector3(side * 0.178, 0.478, 0.002),
        ]);
        anatomyGroup.add(new THREE.Mesh(new THREE.TubeGeometry(clavicleCurve, 12, 0.0058, 6, false), boneMat));

        // Posterior scapular wing visible on 180-deg back orbit
        const scapula = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.11, 4), boneMat);
        scapula.position.set(side * 0.088, 0.41, -0.072);
        scapula.rotation.set(Math.PI + 0.15, side * 0.25, side * -0.18);
        scapula.scale.set(1.0, 1.0, 0.25);
        anatomyGroup.add(scapula);

        const iliacRing = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.010, 8, 22, Math.PI * 1.15), boneMat);
        iliacRing.position.set(side * 0.062, 0.03, -0.006);
        iliacRing.rotation.set(Math.PI / 2.2, side * 0.35, 0);
        anatomyGroup.add(iliacRing);

        const humerusCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(side * 0.19, 0.456, -0.004),
          new THREE.Vector3(side * 0.274, 0.145, -0.010),
          new THREE.Vector3(side * 0.322, -0.10, 0.022),
        ]);
        anatomyGroup.add(new THREE.Mesh(new THREE.TubeGeometry(humerusCurve, 16, 0.010, 8, false), boneMat));

        const femurCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(side * 0.095, -0.02, 0.0),
          new THREE.Vector3(side * 0.108, -0.425, 0.006),
          new THREE.Vector3(side * 0.102, -0.78, -0.006),
        ]);
        anatomyGroup.add(new THREE.Mesh(new THREE.TubeGeometry(femurCurve, 18, 0.013, 8, false), boneMat));
      }

      const organMetaMap = new Map<BodySystemId, OrganVisualMeta>();
      const pickables: ThreeTypes.Object3D[] = [];

      const createOrganGroup = (
        id: BodySystemId,
        anchorLocal: ThreeTypes.Vector3,
        baseEmissive = 0.72,
      ) => {
        const group = new THREE.Group();
        group.userData = { systemId: id };
        anatomyGroup.add(group);
        const meta: OrganVisualMeta = { group, materials: [], baseEmissive, anchorLocal };
        organMetaMap.set(id, meta);
        return meta;
      };

      const addOrganMesh = (
        meta: OrganVisualMeta,
        geom: ThreeTypes.BufferGeometry,
        baseHex: number,
        opacity = 0.78,
        pos?: ThreeTypes.Vector3,
        rot?: ThreeTypes.Euler,
        scale?: ThreeTypes.Vector3,
      ) => {
        const mat = new THREE.MeshStandardMaterial({
          color: baseHex,
          emissive: baseHex,
          emissiveIntensity: meta.baseEmissive,
          roughness: 0.35,
          metalness: 0.1,
          transparent: true,
          opacity,
          fog: false,
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.userData = { systemId: meta.group.userData.systemId };
        if (pos) mesh.position.copy(pos);
        if (rot) mesh.rotation.copy(rot);
        if (scale) mesh.scale.copy(scale);
        meta.group.add(mesh);
        meta.materials.push(mat);
        pickables.push(mesh);
        return mesh;
      };

      // 1. Brain & Ocular (Neuro-Ocular SANS)
      const neuroMeta = createOrganGroup('neuro_ocular', new THREE.Vector3(0, 0.745, 0.022), 0.78);
      for (const side of [-1, 1]) {
        const lobe = addOrganMesh(
          neuroMeta,
          new THREE.SphereGeometry(0.035, 18, 16),
          ORGAN_BASE_HEX.neuro_ocular,
          0.62,
          new THREE.Vector3(side * 0.025, 0.775, -0.004),
          undefined,
          new THREE.Vector3(0.88, 1.08, 1.48),
        );
        // Folded cortical gyri wireframe accentuates cerebral structure through skull shell
        const gyri = new THREE.Mesh(
          lobe.geometry,
          new THREE.MeshBasicMaterial({ color: 0xe0f2fe, wireframe: true, transparent: true, opacity: 0.18, fog: false }),
        );
        gyri.position.copy(lobe.position);
        gyri.scale.copy(lobe.scale);
        neuroMeta.group.add(gyri);

        addOrganMesh(
          neuroMeta,
          new THREE.SphereGeometry(0.011, 12, 12),
          0xe0f2fe,
          0.92,
          new THREE.Vector3(side * 0.025, 0.735, 0.068),
        );
      }

      // 2. Heart & Major Systemic Vasculature (Cardiovascular)
      const cardioMeta = createOrganGroup('cardiovascular', new THREE.Vector3(0.024, 0.368, 0.024), 0.85);
      const heartCluster = new THREE.Group();
      heartCluster.position.set(0.020, 0.372, 0.025);
      heartCluster.rotation.set(0.18, 0.12, -0.35);
      cardioMeta.group.add(heartCluster);
      const heartMat = new THREE.MeshStandardMaterial({
        color: ORGAN_BASE_HEX.cardiovascular,
        emissive: ORGAN_BASE_HEX.cardiovascular,
        emissiveIntensity: 0.9,
        roughness: 0.28,
        transparent: true,
        opacity: 0.88,
        fog: false,
      });
      cardioMeta.materials.push(heartMat);
      const ventricle = new THREE.Mesh(new THREE.SphereGeometry(0.032, 18, 16), heartMat);
      ventricle.scale.set(0.95, 1.32, 0.85);
      ventricle.userData = { systemId: 'cardiovascular' };
      const atrium = new THREE.Mesh(new THREE.SphereGeometry(0.022, 14, 12), heartMat);
      atrium.position.set(-0.015, 0.022, -0.004);
      atrium.userData = { systemId: 'cardiovascular' };
      heartCluster.add(ventricle, atrium);
      pickables.push(ventricle, atrium);

      const aortaCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.015, 0.395, 0.022),
        new THREE.Vector3(0.005, 0.445, 0.005),
        new THREE.Vector3(-0.008, 0.420, -0.022),
        new THREE.Vector3(-0.005, 0.050, -0.022),
      ]);
      addOrganMesh(cardioMeta, new THREE.TubeGeometry(aortaCurve, 26, 0.007, 8, false), ORGAN_BASE_HEX.cardiovascular, 0.65);

      for (const side of [-1, 1]) {
        const femoralVessel = new THREE.CatmullRomCurve3([
          new THREE.Vector3(side * 0.02, 0.06, -0.01),
          new THREE.Vector3(side * 0.09, -0.04, 0.01),
          new THREE.Vector3(side * 0.105, -0.42, 0.015),
        ]);
        addOrganMesh(cardioMeta, new THREE.TubeGeometry(femoralVessel, 16, 0.0038, 6, false), ORGAN_BASE_HEX.cardiovascular, 0.42);
      }

      // 3. Lungs & Bronchial Trachea (Respiratory)
      const respMeta = createOrganGroup('respiratory', new THREE.Vector3(-0.074, 0.392, 0.008), 0.68);
      const lungGroup = new THREE.Group();
      respMeta.group.add(lungGroup);
      const trachea = new THREE.Mesh(
        new THREE.CylinderGeometry(0.009, 0.009, 0.145, 12),
        new THREE.MeshStandardMaterial({
          color: 0x7dd3fc,
          emissive: 0x38bdf8,
          emissiveIntensity: 0.55,
          transparent: true,
          opacity: 0.62,
          fog: false,
        }),
      );
      trachea.position.set(0, 0.525, 0.008);
      trachea.userData = { systemId: 'respiratory' };
      lungGroup.add(trachea);
      respMeta.materials.push(trachea.material as ThreeTypes.MeshStandardMaterial);
      pickables.push(trachea);

      for (const side of [-1, 1]) {
        const lungMat = new THREE.MeshStandardMaterial({
          color: ORGAN_BASE_HEX.respiratory,
          emissive: ORGAN_BASE_HEX.respiratory,
          emissiveIntensity: 0.62,
          roughness: 0.4,
          transparent: true,
          opacity: 0.46,
          fog: false,
        });
        const lung = new THREE.Mesh(new THREE.SphereGeometry(0.062, 18, 16), lungMat);
        lung.position.set(side * 0.072, 0.392, 0.004);
        lung.scale.set(0.84, 1.55, 0.92);
        lung.rotation.z = side * -0.14;
        lung.userData = { systemId: 'respiratory' };
        lungGroup.add(lung);
        respMeta.materials.push(lungMat);
        pickables.push(lung);
      }

      // 4. Metabolic (Liver, Stomach & Visceral GI Core)
      const metMeta = createOrganGroup('metabolic', new THREE.Vector3(0.028, 0.195, 0.028), 0.72);
      addOrganMesh(
        metMeta,
        new THREE.SphereGeometry(0.044, 16, 14),
        0xfb7185,
        0.58,
        new THREE.Vector3(-0.045, 0.258, 0.026),
        new THREE.Euler(0, 0, -0.35),
        new THREE.Vector3(1.25, 0.72, 0.85),
      );
      addOrganMesh(
        metMeta,
        new THREE.SphereGeometry(0.034, 16, 14),
        0x2dd4bf,
        0.64,
        new THREE.Vector3(0.042, 0.232, 0.030),
        new THREE.Euler(0.15, 0, 0.45),
        new THREE.Vector3(1.05, 1.25, 0.88),
      );
      const giCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.045, 0.175, 0.034),
        new THREE.Vector3(0.045, 0.160, 0.036),
        new THREE.Vector3(-0.042, 0.125, 0.032),
        new THREE.Vector3(0.040, 0.095, 0.030),
        new THREE.Vector3(0.0, 0.055, 0.025),
      ]);
      addOrganMesh(metMeta, new THREE.TubeGeometry(giCurve, 32, 0.014, 10, false), 0x34d399, 0.56);

      // 5. Musculoskeletal (Lumbar Spine + Femoral Quadriceps Load Cores)
      const muscMeta = createOrganGroup('musculoskeletal', new THREE.Vector3(-0.108, -0.235, 0.010), 0.65);
      for (const side of [-1, 1]) {
        const quadCore = new THREE.CatmullRomCurve3([
          new THREE.Vector3(side * 0.098, -0.07, 0.005),
          new THREE.Vector3(side * 0.110, -0.24, 0.010),
          new THREE.Vector3(side * 0.106, -0.40, 0.008),
        ]);
        addOrganMesh(muscMeta, new THREE.TubeGeometry(quadCore, 16, 0.024, 12, false), ORGAN_BASE_HEX.musculoskeletal, 0.46);
      }
      addOrganMesh(
        muscMeta,
        new THREE.CylinderGeometry(0.020, 0.024, 0.15, 12),
        ORGAN_BASE_HEX.musculoskeletal,
        0.54,
        new THREE.Vector3(0, 0.12, -0.045),
      );

      // 6. Dermal & Immune (Biometric Forearm Band + Cervical/Axillary Lymph Nodes)
      const dermalMeta = createOrganGroup('dermal_immune', new THREE.Vector3(-0.312, 0.005, 0.012), 0.78);
      addOrganMesh(
        dermalMeta,
        new THREE.TorusGeometry(0.044, 0.007, 10, 24),
        ORGAN_BASE_HEX.dermal_immune,
        0.88,
        new THREE.Vector3(-0.308, -0.005, 0.012),
        new THREE.Euler(Math.PI / 2, -0.18, 0.15),
      );
      for (const pt of [
        new THREE.Vector3(-0.045, 0.59, 0.015),
        new THREE.Vector3(0.045, 0.59, 0.015),
        new THREE.Vector3(-0.155, 0.40, 0.022),
        new THREE.Vector3(0.155, 0.40, 0.022),
      ]) {
        addOrganMesh(dermalMeta, new THREE.SphereGeometry(0.012, 10, 10), ORGAN_BASE_HEX.dermal_immune, 0.72, pt);
      }

      const raycaster = new THREE.Raycaster();
      const focusPlane = new THREE.Plane();
      const focusPlaneNormal = new THREE.Vector3();
      const focusPlaneHit = new THREE.Vector3();
      const focusNdc = new THREE.Vector2();

      let viewportW = initWidth;
      let viewportH = initHeight;
      let focusGoalY = -0.02;
      let viewPanX = 0;
      let viewPanY = 0;
      let viewPanGoalX = 0;
      let viewPanGoalY = 0;
      let spaceHeld = false;
      let canvasHovered = false;
      let isCanvasPanning = false;
      let panPointerId: number | null = null;
      const panLast = { x: 0, y: 0 };
      const touchCoords = new Map<number, { x: number; y: number }>();
      let prevTwoFingerMid: { x: number; y: number } | null = null;

      const recenterView = () => {
        glideRef.current = {
          azimuthRad: (13 * Math.PI) / 180,
          polarRad: 1.46,
          targetY: -0.02,
          distance: 3.68,
          active: true,
          needsReset: true,
        };
      };

      const syncViewOffset = () => {
        camera.aspect = viewportW / viewportH;
        if (Math.abs(viewPanX) < 0.05 && Math.abs(viewPanY) < 0.05) {
          if (camera.view?.enabled) camera.clearViewOffset();
          camera.updateProjectionMatrix();
          return;
        }
        camera.setViewOffset(viewportW, viewportH, -viewPanX, -viewPanY, viewportW, viewportH);
      };

      const applyCanvasPan = (dx: number, dy: number) => {
        if (!controls) return;
        const dist = camera.position.distanceTo(controls.target);
        const worldUnitsPerPx = (2 * dist * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(viewportH, 1);
        const rawNextY = focusGoalY + dy * worldUnitsPerPx;
        const clampedNextY = Math.max(-0.84, Math.min(0.82, rawNextY));
        const leftoverPx = (rawNextY - clampedNextY) / Math.max(worldUnitsPerPx, 1e-5);
        focusGoalY = clampedNextY;
        const maxPanX = viewportW * 0.34;
        const maxPanY = viewportH * 0.24;
        viewPanGoalX = Math.max(-maxPanX, Math.min(maxPanX, viewPanGoalX + dx));
        viewPanGoalY = Math.max(-maxPanY, Math.min(maxPanY, viewPanGoalY + leftoverPx));
      };

      const cancelGlide = () => {
        glideRef.current.active = false;
      };
      controlsInstance.addEventListener('start', cancelGlide);
      cleanups.push(() => controlsInstance.removeEventListener('start', cancelGlide));

      const pointerDownPos = { x: 0, y: 0 };
      const handlePointerDown = (ev: PointerEvent) => {
        if (ev.pointerType === 'touch') {
          touchCoords.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
          if (touchCoords.size === 2) {
            const pts = Array.from(touchCoords.values());
            prevTwoFingerMid = { x: (pts[0].x + pts[1].x) * 0.5, y: (pts[0].y + pts[1].y) * 0.5 };
          }
        }
        pointerDownPos.x = ev.clientX;
        pointerDownPos.y = ev.clientY;
        glideRef.current.active = false;
        renderer?.domElement.focus({ preventScroll: true });

        if (touchCoords.size > 1) {
          isCanvasPanning = false;
          panPointerId = null;
          if (controls) controls.enableRotate = true;
          return;
        }

        const panModifier = spaceHeld || ev.shiftKey || ev.altKey || ev.ctrlKey || ev.metaKey;
        const shouldPan = ev.button === 1 || ev.button === 2 || (ev.button === 0 && panModifier);

        if (shouldPan) {
          if (controls && ev.button === 0) controls.enableRotate = false;
          isCanvasPanning = true;
          panPointerId = ev.pointerId;
          panLast.x = ev.clientX;
          panLast.y = ev.clientY;
          try {
            renderer?.domElement.setPointerCapture(ev.pointerId);
          } catch {
            // Pointer capture may fail in synthetic event environments
          }
          if (renderer) renderer.domElement.style.cursor = 'grabbing';
        }
      };

      const stopCanvasPan = (ev: PointerEvent) => {
        if (ev.pointerType === 'touch') {
          touchCoords.delete(ev.pointerId);
          if (touchCoords.size < 2) prevTwoFingerMid = null;
        }
        if (isCanvasPanning && panPointerId === ev.pointerId) {
          isCanvasPanning = false;
          panPointerId = null;
          if (controls) controls.enableRotate = true;
          try {
            if (renderer?.domElement.hasPointerCapture(ev.pointerId)) {
              renderer.domElement.releasePointerCapture(ev.pointerId);
            }
          } catch {
            // Ignore release errors for non-captured pointers
          }
          if (renderer) renderer.domElement.style.cursor = 'grab';
        }
      };

      const handlePointerUp = (ev: PointerEvent) => {
        stopCanvasPan(ev);
        if (!renderer || ev.button !== 0 || ev.shiftKey || ev.altKey || ev.ctrlKey || ev.metaKey) return;
        const moveDist = Math.hypot(ev.clientX - pointerDownPos.x, ev.clientY - pointerDownPos.y);
        if (moveDist > 6) return;
        const rect = renderer.domElement.getBoundingClientRect();
        focusNdc.set(
          ((ev.clientX - rect.left) / rect.width) * 2 - 1,
          -((ev.clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(focusNdc, camera);
        const hits = raycaster.intersectObjects(pickables, false);
        if (hits.length > 0) {
          const hitId = hits[0].object.userData?.systemId as BodySystemId | undefined;
          if (hitId) latestStateRef.current.onSelect(hitId);
        }
      };

      const handlePointerMove = (ev: PointerEvent) => {
        if (!renderer) return;
        if (ev.pointerType === 'touch' && touchCoords.has(ev.pointerId)) {
          touchCoords.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
          if (touchCoords.size === 2 && prevTwoFingerMid) {
            const pts = Array.from(touchCoords.values());
            const midX = (pts[0].x + pts[1].x) * 0.5;
            const midY = (pts[0].y + pts[1].y) * 0.5;
            applyCanvasPan(midX - prevTwoFingerMid.x, midY - prevTwoFingerMid.y);
            prevTwoFingerMid = { x: midX, y: midY };
            return;
          }
        }
        if (isCanvasPanning && panPointerId === ev.pointerId) {
          const dx = ev.clientX - panLast.x;
          const dy = ev.clientY - panLast.y;
          panLast.x = ev.clientX;
          panLast.y = ev.clientY;
          applyCanvasPan(dx, dy);
          renderer.domElement.style.cursor = 'grabbing';
          return;
        }
        if (spaceHeld || ev.shiftKey) {
          renderer.domElement.style.cursor = 'grab';
          return;
        }
        const rect = renderer.domElement.getBoundingClientRect();
        focusNdc.set(
          ((ev.clientX - rect.left) / rect.width) * 2 - 1,
          -((ev.clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(focusNdc, camera);
        const hits = raycaster.intersectObjects(pickables, false);
        renderer.domElement.style.cursor = hits.length > 0 ? 'pointer' : 'grab';
      };

      const handleWheel = (ev: WheelEvent) => {
        if (!renderer || !controls) return;
        glideRef.current.active = false;
        // Horizontal trackpad swipe or Shift+wheel pans left/right; regular wheel zooms toward target height
        if (Math.abs(ev.deltaX) > Math.abs(ev.deltaY) && Math.abs(ev.deltaX) > 0) {
          applyCanvasPan(-ev.deltaX * 0.65, 0);
          return;
        }
        if (ev.shiftKey && Math.abs(ev.deltaY) > 0) {
          applyCanvasPan(-ev.deltaY * 0.55, 0);
          return;
        }
        if (ev.deltaY < 0) {
          const rect = renderer.domElement.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return;
          focusNdc.set(
            ((ev.clientX - rect.left) / rect.width) * 2 - 1,
            -((ev.clientY - rect.top) / rect.height) * 2 + 1,
          );
          raycaster.setFromCamera(focusNdc, camera);
          const organHits = raycaster.intersectObjects(pickables, false);
          const hit = organHits[0] ?? raycaster.intersectObjects(anatomyGroup.children, true)[0];
          let targetY = controls.target.y;
          if (hit) {
            targetY = hit.point.y;
          } else {
            camera.getWorldDirection(focusPlaneNormal);
            focusPlane.setFromNormalAndCoplanarPoint(focusPlaneNormal, controls.target);
            if (raycaster.ray.intersectPlane(focusPlane, focusPlaneHit)) {
              targetY = focusPlaneHit.y;
            }
          }
          // Lock zoom pivot along the central spinal axis (0, focusY, 0) and recenter view offset so model stays in middle
          focusGoalY = Math.max(-0.84, Math.min(0.82, targetY));
          viewPanGoalX *= 0.55;
          viewPanGoalY *= 0.55;
        } else if (ev.deltaY > 0) {
          const dist = camera.position.distanceTo(controls.target);
          if (dist > 1.75) {
            focusGoalY += (-0.02 - focusGoalY) * 0.25;
            viewPanGoalX *= 0.6;
            viewPanGoalY *= 0.6;
          }
        }
      };

      const handleCanvasKeyDown = (ev: KeyboardEvent) => {
        const stepPx = 28;
        if (ev.code === 'ArrowLeft' || ev.code === 'KeyA') {
          ev.preventDefault();
          cancelGlide();
          applyCanvasPan(stepPx, 0);
        } else if (ev.code === 'ArrowRight' || ev.code === 'KeyD') {
          ev.preventDefault();
          cancelGlide();
          applyCanvasPan(-stepPx, 0);
        } else if (ev.code === 'ArrowUp' || ev.code === 'KeyW') {
          ev.preventDefault();
          cancelGlide();
          applyCanvasPan(0, stepPx);
        } else if (ev.code === 'ArrowDown' || ev.code === 'KeyS') {
          ev.preventDefault();
          cancelGlide();
          applyCanvasPan(0, -stepPx);
        } else if (ev.code === 'KeyC' || ev.code === 'KeyR' || ev.code === 'Home' || ev.code === 'Digit0') {
          ev.preventDefault();
          recenterView();
        }
      };

      const isTypingTarget = (target: EventTarget | null) =>
        target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;

      const handleSpaceKeyDown = (ev: KeyboardEvent) => {
        if (ev.code !== 'Space' || ev.repeat) return;
        if (!canvasHovered && document.activeElement !== renderer?.domElement) return;
        if (isTypingTarget(ev.target)) return;
        ev.preventDefault();
        spaceHeld = true;
        if (controls) controls.enableRotate = false;
        if (renderer && !isCanvasPanning) renderer.domElement.style.cursor = 'grab';
      };

      const handleSpaceKeyUp = (ev: KeyboardEvent) => {
        if (ev.code !== 'Space') return;
        spaceHeld = false;
        if (controls) controls.enableRotate = true;
        if (renderer && !isCanvasPanning) renderer.domElement.style.cursor = 'grab';
      };

      const handlePointerEnter = () => {
        canvasHovered = true;
      };
      const handlePointerLeave = () => {
        canvasHovered = false;
      };
      const handleContextMenu = (ev: MouseEvent) => {
        ev.preventDefault();
      };

      renderer.domElement.addEventListener('pointerdown', handlePointerDown, { capture: true });
      renderer.domElement.addEventListener('pointerup', handlePointerUp);
      renderer.domElement.addEventListener('pointercancel', stopCanvasPan);
      renderer.domElement.addEventListener('pointermove', handlePointerMove);
      renderer.domElement.addEventListener('pointerenter', handlePointerEnter);
      renderer.domElement.addEventListener('pointerleave', handlePointerLeave);
      renderer.domElement.addEventListener('contextmenu', handleContextMenu);
      renderer.domElement.addEventListener('wheel', handleWheel, { passive: true });
      renderer.domElement.addEventListener('keydown', handleCanvasKeyDown);
      renderer.domElement.addEventListener('dblclick', recenterView);
      window.addEventListener('keydown', handleSpaceKeyDown);
      window.addEventListener('keyup', handleSpaceKeyUp);
      cleanups.push(() => {
        renderer?.domElement.removeEventListener('pointerdown', handlePointerDown, { capture: true });
        renderer?.domElement.removeEventListener('pointerup', handlePointerUp);
        renderer?.domElement.removeEventListener('pointercancel', stopCanvasPan);
        renderer?.domElement.removeEventListener('pointermove', handlePointerMove);
        renderer?.domElement.removeEventListener('pointerenter', handlePointerEnter);
        renderer?.domElement.removeEventListener('pointerleave', handlePointerLeave);
        renderer?.domElement.removeEventListener('contextmenu', handleContextMenu);
        renderer?.domElement.removeEventListener('wheel', handleWheel);
        renderer?.domElement.removeEventListener('keydown', handleCanvasKeyDown);
        renderer?.domElement.removeEventListener('dblclick', recenterView);
        window.removeEventListener('keydown', handleSpaceKeyDown);
        window.removeEventListener('keyup', handleSpaceKeyUp);
      });

      const handleResize = () => {
        if (!container || !renderer) return;
        viewportW = Math.max(container.clientWidth, 200);
        viewportH = Math.max(container.clientHeight, 260);
        syncViewOffset();
        renderer.setSize(viewportW, viewportH);
      };
      let ro: ResizeObserver | null = null;
      if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(handleResize);
        ro.observe(container);
        cleanups.push(() => ro?.disconnect());
      } else {
        window.addEventListener('resize', handleResize);
        cleanups.push(() => window.removeEventListener('resize', handleResize));
      }

      onWebglReady(true);

      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      const clock = new THREE.Clock();
      const projVec = new THREE.Vector3();
      const camDir = new THREE.Vector3();
      const bodyToPin = new THREE.Vector3();
      const spherical = new THREE.Spherical();
      const offsetVec = new THREE.Vector3();
      const prevColor = new THREE.Color();

      const animate = () => {
        if (disposed || !renderer || !controls) return;
        frameId = window.requestAnimationFrame(animate);
        const t = clock.getElapsedTime();
        const state = latestStateRef.current;

        if (glideRef.current.active) {
          if (glideRef.current.needsReset) {
            focusGoalY = glideRef.current.targetY;
            viewPanGoalX = 0;
            viewPanGoalY = 0;
            glideRef.current.needsReset = false;
          }
          offsetVec.copy(camera.position).sub(controls.target);
          spherical.setFromVector3(offsetVec);
          let dTheta = glideRef.current.azimuthRad - spherical.theta;
          while (dTheta > Math.PI) dTheta -= Math.PI * 2;
          while (dTheta < -Math.PI) dTheta += Math.PI * 2;
          spherical.theta += dTheta * 0.12;
          spherical.phi += (glideRef.current.polarRad - spherical.phi) * 0.12;
          if (glideRef.current.distance !== undefined) {
            spherical.radius += (glideRef.current.distance - spherical.radius) * 0.12;
          }
          controls.target.set(0, controls.target.y + (glideRef.current.targetY - controls.target.y) * 0.12, 0);
          offsetVec.setFromSpherical(spherical);
          camera.position.copy(controls.target).add(offsetVec);
          viewPanX += (0 - viewPanX) * 0.16;
          viewPanY += (0 - viewPanY) * 0.16;
          syncViewOffset();
          if (
            Math.abs(dTheta) < 0.01 &&
            Math.abs(glideRef.current.polarRad - spherical.phi) < 0.01 &&
            Math.abs(glideRef.current.targetY - controls.target.y) < 0.01 &&
            Math.abs(viewPanX) < 0.25 &&
            Math.abs(viewPanY) < 0.25 &&
            (glideRef.current.distance === undefined || Math.abs(glideRef.current.distance - spherical.radius) < 0.02)
          ) {
            viewPanX = 0;
            viewPanY = 0;
            syncViewOffset();
            glideRef.current.active = false;
          }
        } else {
          const prevY = controls.target.y;
          const nextY = prevY + (focusGoalY - prevY) * 0.22;
          controls.target.set(0, nextY, 0);
          camera.position.y += nextY - prevY;

          const prevPanX = viewPanX;
          const prevPanY = viewPanY;
          viewPanX += (viewPanGoalX - viewPanX) * 0.24;
          viewPanY += (viewPanGoalY - viewPanY) * 0.24;
          if (
            Math.abs(viewPanX - prevPanX) > 0.01 ||
            Math.abs(viewPanY - prevPanY) > 0.01 ||
            ((Math.abs(viewPanX) > 0.05 || Math.abs(viewPanY) > 0.05) && camera.view?.enabled)
          ) {
            syncViewOffset();
          }
        }

        controls.update();

        if (!reducedMotion) {
          const beatsPerSec = Math.max(0.6, Math.min(3.2, (state.heartRate || 72) / 60));
          const beatPhase = (t * beatsPerSec) % 1;
          const systole = beatPhase < 0.22 ? Math.sin((beatPhase / 0.22) * Math.PI) : 0;
          heartCluster.scale.setScalar(1 + 0.11 * systole);

          const respFreq = Math.max(0.14, Math.min(0.65, (state.respirationRate || 15) / 60));
          const breath = 1 + 0.045 * Math.sin(t * respFreq * Math.PI * 2);
          lungGroup.scale.set(breath, 1 + 0.02 * Math.sin(t * respFreq * Math.PI * 2), breath);
        }

        for (const region of state.systems) {
          const meta = organMetaMap.get(region.id);
          if (!meta) continue;
          const isSelected = region.id === state.selectedId;
          const baseColor = region.status === 'nominal' ? ORGAN_BASE_HEX[region.id] : STATUS_HEX[region.status];
          const targetEmissive = isSelected ? meta.baseEmissive + 0.65 : region.status === 'nominal' ? meta.baseEmissive * 0.68 : meta.baseEmissive + 0.28;
          prevColor.setHex(baseColor);
          for (const mat of meta.materials) {
            mat.color.lerp(prevColor, 0.2);
            mat.emissive.lerp(prevColor, 0.2);
            mat.emissiveIntensity += (targetEmissive - mat.emissiveIntensity) * 0.2;
          }
          if (isSelected) {
            elevationRing.position.y += (meta.anchorLocal.y - elevationRing.position.y) * 0.14;
            elevationRingMat.color.lerp(prevColor, 0.2);
          }
        }

        const dermalStatus = state.systems.find(s => s.id === 'dermal_immune')?.status ?? 'nominal';
        shellUniforms.uRimColor.value.lerp(
          prevColor.setHex(dermalStatus === 'critical' ? 0xfb7185 : dermalStatus === 'warning' ? 0xfbbf24 : 0x67e8f9),
          0.1,
        );

        renderer.render(scene, camera);

        camera.getWorldDirection(camDir);
        for (const region of state.systems) {
          const btn = pinRefs.current[region.id];
          const meta = organMetaMap.get(region.id);
          if (!btn || !meta) continue;

          projVec.copy(meta.anchorLocal).applyMatrix4(anatomyGroup.matrixWorld);
          bodyToPin.copy(projVec).sub(anatomyGroup.position);
          const cameraSideDot = -(bodyToPin.x * camDir.x + bodyToPin.z * camDir.z);
          projVec.project(camera);

          const xPct = (projVec.x * 0.5 + 0.5) * 100;
          const yPct = (-projVec.y * 0.5 + 0.5) * 100;
          const isBackSide = cameraSideDot < -0.02;
          const isBehindCamera = projVec.z > 1;
          const isOutOfView = isBehindCamera || projVec.x < -1.15 || projVec.x > 1.15 || projVec.y < -1.15 || projVec.y > 1.15;

          btn.style.left = `${Math.max(-10, Math.min(110, xPct)).toFixed(2)}%`;
          btn.style.top = `${Math.max(-10, Math.min(110, yPct)).toFixed(2)}%`;
          btn.style.opacity = isOutOfView ? '0' : isBackSide && region.id !== state.selectedId ? '0.45' : '1';
          btn.style.pointerEvents = isOutOfView ? 'none' : 'auto';
          btn.dataset.side = xPct > 50 ? 'right' : 'left';
        }

        if (azimuthLabelRef.current) {
          const deg = Math.round(((controls.getAzimuthalAngle() * 180) / Math.PI + 360) % 360);
          azimuthLabelRef.current.textContent = `${deg} deg`;
        }
      };

      animate();

      cleanups.push(() => {
        scene.traverse(obj => {
          if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.LineSegments) {
            obj.geometry.dispose();
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            for (const m of mats) m.dispose();
          }
        });
      });
    }

    void initScene();

    return () => {
      disposed = true;
      if (frameId) window.cancelAnimationFrame(frameId);
      for (const fn of cleanups) fn();
      controls?.dispose();
      renderer?.dispose();
    };
  }, [onWebglReady, pinRefs, azimuthLabelRef]);

  return <div ref={mountRef} className="body-3d-host" />;
}
