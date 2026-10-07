import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

interface IgrisModelProps {
  /** Render size in px (square). */
  size?: number;
  /** Revolutions per second. */
  spin?: number;
  className?: string;
  fallback?: React.ReactNode;
}

/** Resolve the bundled model URL in both vite-dev (http) and packaged (file://). */
function modelUrl(): string {
  if (window.location.protocol === "file:") {
    return new URL("model/igris/igris.gltf", window.location.href).href;
  }
  return "/model/igris/igris.gltf";
}

/**
 * The Igris 3D core (public/model/igris). Plain three.js — no extra deps.
 *
 * The source file is a full studio scene (backdrop, two characters,
 * headphones). We isolate ONE character — the sunglasses blob — hide the
 * set, and give it a procedural idle life: breathing squash-and-stretch
 * planted on its feet, a gentle curious sway (no 360 turntable), a soft
 * bob, and a slight rock on the glasses. Falls back when unavailable.
 */
export const IgrisModel: React.FC<IgrisModelProps> = ({
  size = 24,
  spin = 0.3,
  className = "",
  fallback = null,
}) => {
  const mountRef = useRef<HTMLSpanElement>(null);
  const [failed, setFailed] = React.useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let renderer: THREE.WebGLRenderer | null = null;

    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      setFailed(true);
      return;
    }

    const px = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(px);
    renderer.setSize(size, size);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);

    // Soft studio: environment reflections + key/fill lights.
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(2.5, 3, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x88aaff, 0.8);
    rim.position.set(-3, 1, -2);
    scene.add(rim);

    const group = new THREE.Group();
    scene.add(group);

    new GLTFLoader().load(
      modelUrl(),
      (gltf) => {
        if (disposed) return;
        isolateSpecsCharacter(gltf.scene);
        group.add(bodyGroup);
        frameCamera();
      },
      undefined,
      () => {
        if (!disposed) setFailed(true);
      },
    );

    // Character rig ------------------------------------------------------
    // bodyGroup origin sits at the feet so squash-and-stretch stays planted.
    const bodyGroup = new THREE.Group();
    let glasses: THREE.Object3D | null = null;
    let fitDist = 8;
    let focusY = 1;

    function isolateSpecsCharacter(scene: THREE.Group) {
      scene.updateMatrixWorld(true);

      // The sunglasses ("Lens") mark our character; its egg body is the
      // white-cotton mesh closest to it. Everything else is set dressing.
      let lensNode: THREE.Object3D | null = null;
      scene.traverse((o) => {
        if ((o.name || "").toLowerCase().includes("lens")) lensNode = o;
      });

      const lensPos = new THREE.Vector3();
      if (lensNode) lensNode.getWorldPosition(lensPos);

      let eggMesh: THREE.Object3D | null = null;
      let eggDist = Number.POSITIVE_INFINITY;
      const tmp = new THREE.Vector3();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        const names = mats.map((m) => (m?.name || "").toLowerCase());
        // Backdrop / floor always go.
        if (names.some((n) => n.includes("floor"))) {
          mesh.visible = false;
          return;
        }
        if (lensNode && names.some((n) => n.includes("cotton"))) {
          new THREE.Box3().setFromObject(mesh).getCenter(tmp);
          const d = tmp.distanceTo(lensPos);
          if (d < eggDist) {
            eggDist = d;
            eggMesh = mesh;
          }
        }
      });

      // Keep only the specs assembly; hide the rest of the set.
      scene.traverse((o) => {
        if (!((o as THREE.Mesh).isMesh)) return;
        if (o === lensNode || o === eggMesh) {
          o.visible = true;
        } else {
          o.visible = false;
        }
      });
      if (lensNode) glasses = lensNode;

      // Replant: feet at y=0, centred on XZ.
      const box = new THREE.Box3();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && mesh.visible) {
          mesh.updateWorldMatrix(true, false);
          box.expandByObject(mesh);
        }
      });
      if (box.isEmpty()) {
        // Isolation found nothing recognisable — show the whole scene
        // rather than a blank canvas.
        scene.traverse((o) => {
          o.visible = true;
        });
        box.setFromObject(scene);
      }
      const centre = box.getCenter(new THREE.Vector3());
      bodyGroup.position.set(centre.x, box.min.y, centre.z);
      if (eggMesh) bodyGroup.attach(eggMesh);
      if (lensNode) bodyGroup.attach(lensNode);
      // Recentre the assembly on the group origin (feet at y=0): attach kept
      // world transforms, so shifting the body origin plants the character
      // dead-centre in front of the camera.
      bodyGroup.position.set(0, 0, 0);
      // Fit the FULL height with breathing room: a full-bleed egg reads as
      // a white blob at 22px. Straight-on camera at the character midline.
      const fullH = Math.max(box.max.y - box.min.y, 0.001);
      fitDist =
        fullH / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / 0.78;
      // Feet now sit at group y=0, so the midline is half the height.
      focusY = fullH / 2;
    }

    function frameCamera() {
      camera.position.set(0, focusY, fitDist);
      camera.lookAt(0, focusY, 0);
    }

    // Default framing until the model lands.
    camera.position.set(0, 0.4, 3);
    camera.lookAt(0, 0, 0);

    const clock = new THREE.Clock();
    let raf = 0;
    let feetY: number | null = null;
    const tick = () => {
      if (disposed) return;
      raf = requestAnimationFrame(tick);
      const t = clock.elapsedTime;
      if (feetY === null) feetY = bodyGroup.position.y;

      // Curious sway — looks around instead of spinning like a turntable.
      group.rotation.y = Math.sin(t * 0.55 * (spin / 0.3 + 0.4)) * 0.5;
      group.rotation.z = Math.sin(t * 0.4) * 0.05;

      // Breathing squash-and-stretch, planted on the feet (body origin),
      // plus a small hop layered on top.
      const breath = Math.sin(t * 2.1);
      bodyGroup.scale.set(1 - 0.032 * breath, 1 + 0.045 * breath, 1 - 0.032 * breath);
      bodyGroup.position.y = feetY + Math.max(0, Math.sin(t * 2.1 + 0.6)) * 0.05;

      // The shades rock a touch on their own — alive, not rigid.
      if (glasses) {
        glasses.rotation.x =
          Math.sin(t * 0.55 * (spin / 0.3 + 0.4) + 1.1) * 0.05;
        glasses.rotation.z = Math.sin(t * 0.8) * 0.03;
      }

      renderer?.render(scene, camera);
    };
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      pmrem.dispose();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry?.dispose();
          const mat = mesh.material as THREE.Material | THREE.Material[];
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat?.dispose();
        }
      });
      renderer?.dispose();
      if (renderer?.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [size, spin]);

  if (failed) return <>{fallback}</>;

  return (
    <span
      ref={mountRef}
      style={{ width: size, height: size }}
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden ${className}`}
    />
  );
};
