import * as THREE from 'three';

/**
 * 言葉にしない声の印（ゲーム脚本の序章: 番兵の叫び・売り子の呼び込み・家族の笑い声）。
 * 人形の頭上に、声の種類ごとの小さな絵（文字ではない）を短い間だけ出す。叫びはぎざぎざの線、呼び込みは広がる弧、笑いは小さな波。
 */
export type VoiceKind = 'shout' | 'call' | 'laugh';

export interface VoiceMarks {
  /** 頭の位置を返す関数の人物の頭上に、印を seconds 秒出す */
  show(headOf: () => THREE.Vector3 | undefined, kind: VoiceKind, seconds: number): void;
  /** 今出している印の数（自動テスト用） */
  readonly count: number;
  update(deltaSeconds: number, elapsedSeconds: number): void;
  dispose(): void;
}

const COLORS: Readonly<Record<VoiceKind, string>> = { shout: '#ff7a4a', call: '#ffd65a', laugh: '#ffe8b0' };

function drawIcon(kind: VoiceKind): THREE.CanvasTexture | undefined {
  if (typeof document === 'undefined') return undefined;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (!g) return undefined;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const stroke = (width: number, color: string, path: () => void) => {
    g.beginPath();
    path();
    g.lineWidth = width;
    g.strokeStyle = color;
    g.stroke();
  };
  const paint = (path: () => void) => {
    stroke(16, 'rgba(40,24,8,0.75)', path);
    stroke(8, COLORS[kind], path);
  };
  if (kind === 'shout') {
    // ぎざぎざの線を3本（放射状）
    for (const a of [-0.6, 0, 0.6]) {
      paint(() => {
        const cx = 64 + Math.sin(a) * 18;
        const cy = 92 - Math.cos(a) * 18;
        g.moveTo(cx, cy);
        for (let i = 1; i <= 4; i++) {
          const r = 18 + i * 10;
          const side = i % 2 ? 7 : -7;
          g.lineTo(64 + Math.sin(a) * r + Math.cos(a) * side, 92 - Math.cos(a) * r + Math.sin(a) * side);
        }
      });
    }
  } else if (kind === 'call') {
    // 広がる弧を3つ
    for (const r of [16, 32, 48]) paint(() => g.arc(64, 100, r, -Math.PI * 0.8, -Math.PI * 0.2));
  } else {
    // 小さな波を2段
    for (const y of [56, 84]) {
      paint(() => {
        g.moveTo(24, y);
        for (let x = 24; x <= 104; x += 4) g.lineTo(x, y + Math.sin((x - 24) / 8) * 7);
      });
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createVoiceMarks(scene: THREE.Scene): VoiceMarks {
  const textures = new Map<VoiceKind, THREE.CanvasTexture | undefined>();
  const live: { sprite: THREE.Sprite; headOf: () => THREE.Vector3 | undefined; left: number; total: number; phase: number }[] = [];
  return {
    show(headOf, kind, seconds) {
      if (!textures.has(kind)) textures.set(kind, drawIcon(kind));
      const map = textures.get(kind);
      const material = new THREE.SpriteMaterial({ ...(map ? { map } : { color: 0xffd65a }), depthTest: false, transparent: true });
      const sprite = new THREE.Sprite(material);
      sprite.scale.setScalar(0.34);
      sprite.renderOrder = 11;
      sprite.raycast = () => {};
      const p = headOf();
      if (p) sprite.position.set(p.x, p.y + 0.24, p.z);
      sprite.visible = p !== undefined;
      scene.add(sprite);
      live.push({ sprite, headOf, left: seconds, total: seconds, phase: live.length * 0.7 });
    },
    get count() {
      return live.length;
    },
    update(dt, elapsed) {
      for (let i = live.length - 1; i >= 0; i--) {
        const v = live[i]!;
        v.left -= dt;
        const p = v.headOf();
        v.sprite.visible = p !== undefined && v.left > 0;
        if (p) v.sprite.position.set(p.x, p.y + 0.24 + Math.sin(elapsed * 9 + v.phase) * 0.025, p.z);
        // 出はじめに少し大きくなり、終わりに薄くなる
        const t = 1 - v.left / v.total;
        v.sprite.scale.setScalar(0.3 + Math.min(1, t * 5) * 0.06);
        v.sprite.material.opacity = Math.min(1, v.left * 3);
        if (v.left <= 0) {
          scene.remove(v.sprite);
          v.sprite.material.dispose();
          live.splice(i, 1);
        }
      }
    },
    dispose() {
      for (const v of live) scene.remove(v.sprite);
      live.length = 0;
      for (const t of textures.values()) t?.dispose();
      textures.clear();
    },
  };
}
