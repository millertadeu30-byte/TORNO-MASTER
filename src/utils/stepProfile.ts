/* =====================================================================================
 * LEITOR DE STEP PARA TORNO (sem biblioteca externa, sem IA)
 * -------------------------------------------------------------------------------------
 * Lê o arquivo .stp/.step (texto) e tira dele o PERFIL DE TORNEAMENTO da peça:
 *  1. Encontra o eixo de giro (o eixo comum dos cilindros, cones e raios da peça).
 *  2. Cada face "de torno" vira uma linha no perfil (meia seção, X em raio):
 *     - Cilindro  -> linha reta horizontal (diâmetro constante)
 *     - Plano     -> linha vertical (face / ressalto)
 *     - Cone      -> linha inclinada (chanfro / cone)
 *     - Toro      -> arco (raio de concordância)
 *     - Esfera    -> arco
 *  3. Faces que não giram em torno do eixo (rasgos, sextavados, furos fora de centro)
 *     são ignoradas no perfil e contadas como "outras faces".
 * Tudo é medida exata do CAD (não é aproximação de malha).
 * ===================================================================================== */

export interface ProfilePt {
  a: number; // posição ao longo do eixo (mm)
  r: number; // raio (mm)
}

export interface PartProfile {
  name: string;
  /** Cada item é uma linha/arco do perfil, já em pontos (meia seção, coordenadas do CAD ao longo do eixo) */
  curves: ProfilePt[][];
  aMin: number;
  aMax: number;
  rMax: number;
  rMinBore: number | null; // menor raio de furo interno (se tiver)
  facesTotal: number;
  facesUsed: number;
  axis?: { o: [number, number, number]; z: [number, number, number] }; // eixo de giro achado no STEP (para montar a peça REAL no 3D)
}

type Arg = string | number | null | Arg[];
interface Ent {
  type: string;
  args: Arg[];
  raw: string;
}

// ---------------------------------------------------------------- leitura do texto STEP
function splitArgs(s: string): Arg[] {
  const out: Arg[] = [];
  let i = 0;
  const parseValue = (): Arg => {
    while (s[i] === " " || s[i] === "\n" || s[i] === "\r" || s[i] === "\t") i++;
    const c = s[i];
    if (c === "(") {
      i++;
      const list: Arg[] = [];
      while (i < s.length) {
        while (s[i] === " " || s[i] === "\n" || s[i] === "\r" || s[i] === "\t" || s[i] === ",") i++;
        if (s[i] === ")") {
          i++;
          break;
        }
        list.push(parseValue());
      }
      return list;
    }
    if (c === "'") {
      let j = i + 1;
      let str = "";
      while (j < s.length) {
        if (s[j] === "'" && s[j + 1] === "'") {
          str += "'";
          j += 2;
          continue;
        }
        if (s[j] === "'") break;
        str += s[j];
        j++;
      }
      i = j + 1;
      return "'" + str;
    }
    // token simples: #123, número, .ENUM., $, *, ou NOME(...) tipado
    let j = i;
    while (j < s.length && s[j] !== "," && s[j] !== ")" && s[j] !== "(") j++;
    let tok = s.slice(i, j).trim();
    if (s[j] === "(") {
      // valor tipado ex.: LENGTH_MEASURE(1.0)
      i = j;
      const inner = parseValue();
      return Array.isArray(inner) && inner.length === 1 ? inner[0] : inner;
    }
    i = j;
    if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(tok)) return parseFloat(tok);
    if (tok === "$" || tok === "*") return null;
    return tok;
  };
  // s começa com "(" ... ")"
  const v = parseValue();
  if (Array.isArray(v)) out.push(...v);
  return out;
}

function parseStep(text: string): Map<number, Ent> {
  const map = new Map<number, Ent>();
  const dataIdx = text.indexOf("DATA;");
  const body = dataIdx >= 0 ? text.slice(dataIdx + 5) : text;
  // remove comentários /* */
  const clean = body.replace(/\/\*[\s\S]*?\*\//g, "");
  const re = /#(\d+)\s*=\s*([\s\S]*?);\s*(?=#\d+\s*=|ENDSEC)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    const id = parseInt(m[1], 10);
    const rest = m[2].trim();
    const tm = rest.match(/^([A-Z0-9_]+)\s*\(/);
    if (tm) {
      const argStr = rest.slice(tm[1].length).trim();
      try {
        map.set(id, { type: tm[1], args: splitArgs(argStr), raw: rest });
      } catch {
        map.set(id, { type: tm[1], args: [], raw: rest });
      }
    } else {
      map.set(id, { type: "COMPLEX", args: [], raw: rest });
    }
  }
  return map;
}

// ---------------------------------------------------------------- vetores
type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3) => Math.sqrt(dot(a, a));
const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * Lê o STEP e devolve o perfil de torneamento.
 * Lança erro com mensagem em português se não conseguir.
 */
export function extractLatheProfile(text: string, fileName = "peca.stp"): PartProfile {
  if (!/ISO-10303-21/.test(text)) throw new Error("Este arquivo não parece ser um STEP (.stp / .step).");
  const E = parseStep(text);
  const ref = (a: Arg): number | null => (typeof a === "string" && a.startsWith("#") ? parseInt(a.slice(1), 10) : null);
  const get = (a: Arg): Ent | undefined => {
    const id = ref(a);
    return id !== null ? E.get(id) : undefined;
  };

  // ---- unidade de comprimento
  let unit = 1;
  const guac = text.match(/GLOBAL_UNIT_ASSIGNED_CONTEXT\s*\(\s*\(([^)]*)\)\s*\)/);
  if (guac) {
    const ids = guac[1].split(",").map((x) => parseInt(x.replace("#", "").trim(), 10));
    for (const id of ids) {
      const e = E.get(id);
      if (!e || !/LENGTH_UNIT/.test(e.raw)) continue;
      if (/INCH/i.test(e.raw)) unit = 25.4;
      else if (/SI_UNIT\s*\(\s*\.MILLI\./.test(e.raw)) unit = 1;
      else if (/SI_UNIT\s*\(\s*\.CENTI\./.test(e.raw)) unit = 10;
      else if (/SI_UNIT\s*\(\s*\$\s*,\s*\.METRE\./.test(e.raw)) unit = 1000;
    }
  }

  const point = (a: Arg): V3 | null => {
    const e = get(a);
    if (!e || e.type !== "CARTESIAN_POINT") return null;
    const c = e.args[1] as number[];
    return [(c[0] || 0) * unit, (c[1] || 0) * unit, (c[2] || 0) * unit];
  };
  const dir = (a: Arg): V3 | null => {
    const e = get(a);
    if (!e || e.type !== "DIRECTION") return null;
    const c = e.args[1] as number[];
    return norm([c[0] || 0, c[1] || 0, c[2] || 0]);
  };
  const placement = (a: Arg): { o: V3; z: V3 } | null => {
    const e = get(a);
    if (!e || e.type !== "AXIS2_PLACEMENT_3D") return null;
    const o = point(e.args[1]);
    const z = dir(e.args[2]) || [0, 0, 1];
    return o ? { o, z } : null;
  };

  // ---- 1) eixo de giro: o eixo mais comum entre as superfícies de revolução
  const revTypes = ["CYLINDRICAL_SURFACE", "CONICAL_SURFACE", "TOROIDAL_SURFACE", "SPHERICAL_SURFACE"];
  const faces: { surf: Ent; bounds: Ent[] }[] = [];
  E.forEach((e) => {
    if (e.type !== "ADVANCED_FACE" && e.type !== "FACE_SURFACE") return;
    const surf = get(e.args[2]);
    const bl = (e.args[1] as Arg[]) || [];
    const bounds = bl.map((b) => get(b)).filter((x): x is Ent => !!x);
    if (surf) faces.push({ surf, bounds });
  });
  if (!faces.length) throw new Error("Não encontrei faces sólidas no STEP (o arquivo pode ser só de linhas ou de malha).");

  const axes: { o: V3; z: V3; w: number }[] = [];
  for (const f of faces) {
    if (!revTypes.includes(f.surf.type)) continue;
    const p = placement(f.surf.args[1]);
    if (!p) continue;
    const found = axes.find((ax) => {
      const par = Math.abs(dot(ax.z, p.z)) > 0.99999;
      if (!par) return false;
      const d = sub(p.o, ax.o);
      return len(cross(d, ax.z)) < 1e-3;
    });
    if (found) found.w++;
    else axes.push({ o: p.o, z: p.z, w: 1 });
  }
  if (!axes.length) throw new Error("Não encontrei cilindros ou cones: esta peça não parece ser de torno.");
  axes.sort((a, b) => b.w - a.w);
  const AX = axes[0];
  const toAR = (p: V3): ProfilePt => {
    const d = sub(p, AX.o);
    const a = dot(d, AX.z);
    const radial = sub(d, [AX.z[0] * a, AX.z[1] * a, AX.z[2] * a]);
    return { a, r: len(radial) };
  };
  const onAxis = (p: { o: V3; z: V3 }) => Math.abs(dot(p.z, AX.z)) > 0.99999 && len(cross(sub(p.o, AX.o), AX.z)) < 1e-3;

  // ---- arestas de uma face: círculos coaxiais (a, r) e vértices
  const faceEdges = (bounds: Ent[]) => {
    const circles: ProfilePt[] = [];
    const verts: ProfilePt[] = [];
    let loops = 0;
    for (const b of bounds) {
      const loop = get(b.args[1]);
      if (!loop) continue;
      loops++;
      if (loop.type === "VERTEX_LOOP") {
        const v = get(loop.args[1]);
        const p = v ? point(v.args[1]) : null;
        if (p) verts.push(toAR(p));
        continue;
      }
      const oes = (loop.args[1] as Arg[]) || [];
      for (const oeRef of oes) {
        const oe = get(oeRef);
        const ec = oe ? get(oe.args[3]) : undefined;
        if (!ec) continue;
        for (const vr of [ec.args[1], ec.args[2]]) {
          const v = get(vr);
          const p = v ? point(v.args[1]) : null;
          if (p) verts.push(toAR(p));
        }
        const curve = get(ec.args[3]);
        if (curve && curve.type === "CIRCLE") {
          const pl = placement(curve.args[1]);
          const rad = (curve.args[2] as number) * unit;
          if (pl && onAxis(pl)) circles.push({ a: toAR(pl.o).a, r: rad });
        }
      }
    }
    return { circles, verts, loops };
  };

  const curves: ProfilePt[][] = [];
  let used = 0;
  const pushSeg = (p1: ProfilePt, p2: ProfilePt) => {
    if (Math.abs(p1.a - p2.a) < 1e-6 && Math.abs(p1.r - p2.r) < 1e-6) return;
    curves.push([p1, p2]);
  };
  const pts = (list: ProfilePt[]) => (list.length ? list : []);

  for (const f of faces) {
    const t = f.surf.type;
    const { circles, verts, loops } = faceEdges(f.bounds);
    const all = pts(circles.length ? circles : verts);
    if (t === "CYLINDRICAL_SURFACE" || t === "CONICAL_SURFACE") {
      const pl = placement(f.surf.args[1]);
      if (!pl || !onAxis(pl)) continue;
      const src = circles.length >= 2 ? circles : verts;
      if (src.length < 2) continue;
      let lo = src[0];
      let hi = src[0];
      for (const p of src) {
        if (p.a < lo.a) lo = p;
        if (p.a > hi.a) hi = p;
      }
      if (t === "CYLINDRICAL_SURFACE") {
        const r = (f.surf.args[2] as number) * unit;
        pushSeg({ a: lo.a, r }, { a: hi.a, r });
      } else {
        // cone: usa os raios reais nas duas pontas (círculos); se faltar, calcula pela geometria
        const r0 = (f.surf.args[2] as number) * unit;
        const semi = f.surf.args[3] as number;
        const a0 = toAR(pl.o).a;
        const sgn = dot(pl.z, AX.z) > 0 ? 1 : -1;
        const rAt = (a: number) => Math.max(0, r0 + Math.tan(semi) * (a - a0) * sgn);
        const c1 = circles.find((c) => Math.abs(c.a - lo.a) < 1e-6);
        const c2 = circles.find((c) => Math.abs(c.a - hi.a) < 1e-6);
        pushSeg({ a: lo.a, r: c1 ? c1.r : rAt(lo.a) }, { a: hi.a, r: c2 ? c2.r : rAt(hi.a) });
      }
      used++;
    } else if (t === "PLANE") {
      const pl = placement(f.surf.args[1]);
      if (!pl || Math.abs(dot(pl.z, AX.z)) < 0.99999) continue; // só faces perpendiculares ao eixo
      const a = toAR(pl.o).a;
      const rs = all.map((p) => p.r);
      if (!rs.length) continue;
      const rMax = Math.max(...rs);
      const rMin = loops <= 1 && circles.length <= 1 ? 0 : Math.min(...rs);
      pushSeg({ a, r: rMin }, { a, r: rMax });
      used++;
    } else if (t === "TOROIDAL_SURFACE" || t === "SPHERICAL_SURFACE") {
      const pl = placement(f.surf.args[1]);
      if (!pl || !onAxis(pl)) continue;
      const ca = toAR(pl.o).a;
      const big = t === "TOROIDAL_SURFACE" ? (f.surf.args[2] as number) * unit : 0;
      const small = (t === "TOROIDAL_SURFACE" ? (f.surf.args[3] as number) : (f.surf.args[2] as number)) * unit;
      const src = circles.length >= 2 ? circles : all;
      if (src.length < 1) continue;
      let p1 = src[0];
      let p2 = src[src.length - 1];
      for (const p of src) {
        if (p.a < p1.a) p1 = p;
        if (p.a > p2.a) p2 = p;
      }
      if (src.length === 1) p2 = { a: ca + (p1.a > ca ? -small : small), r: 0 };
      // arco com centro (ca, big) e raio small, ligando p1 a p2 pelo lado mais curto
      const ang1 = Math.atan2(p1.r - big, p1.a - ca);
      let ang2 = Math.atan2(p2.r - big, p2.a - ca);
      let d = ang2 - ang1;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      ang2 = ang1 + d;
      const n = Math.max(4, Math.ceil(Math.abs(d) / (Math.PI / 24)));
      const arc: ProfilePt[] = [];
      for (let i = 0; i <= n; i++) {
        const ang = ang1 + ((ang2 - ang1) * i) / n;
        arc.push({ a: ca + small * Math.cos(ang), r: Math.max(0, big + small * Math.sin(ang)) });
      }
      curves.push(arc);
      used++;
    }
  }

  if (!curves.length) throw new Error("Não consegui montar o perfil de torno desta peça.");
  let aMin = Infinity;
  let aMax = -Infinity;
  let rMax = 0;
  curves.forEach((c) =>
    c.forEach((p) => {
      aMin = Math.min(aMin, p.a);
      aMax = Math.max(aMax, p.a);
      rMax = Math.max(rMax, p.r);
    })
  );
  // furo interno: menor raio de cilindro que não toca o eixo e fica "por dentro" de outro na mesma posição
  let rMinBore: number | null = null;
  curves.forEach((c) => {
    if (c.length === 2 && Math.abs(c[0].r - c[1].r) < 1e-6 && c[0].r > 0.01) {
      const mid = (c[0].a + c[1].a) / 2;
      const outer = curves.some((o) => o !== c && o.length === 2 && Math.abs(o[0].r - o[1].r) < 1e-6 && o[0].r > c[0].r + 0.01 && Math.min(o[0].a, o[1].a) <= mid && Math.max(o[0].a, o[1].a) >= mid);
      if (outer) rMinBore = rMinBore === null ? c[0].r : Math.min(rMinBore, c[0].r);
    }
  });

  const nameMatch = text.match(/FILE_NAME\s*\(\s*(?:\/\*[^*]*\*\/\s*)?'([^']*)'/);
  return {
    name: (nameMatch && nameMatch[1]) || fileName,
    curves,
    aMin,
    aMax,
    rMax,
    rMinBore,
    facesTotal: faces.length,
    facesUsed: used,
    axis: { o: AX.o, z: AX.z },
  };
}

/** Configuração do ponto zero da peça no programa */
export interface PartZeroConfig {
  face: "direita" | "esquerda"; // qual face da peça fica em Z0
  offsetZ: number; // deslocamento extra (ex.: sobremetal de face)
}

/**
 * Converte o perfil do CAD para coordenadas do torno: X em DIÂMETRO e Z com o zero escolhido
 * (peça para o lado Z-, como no programa).
 */
export function profileToLathe(p: PartProfile, zero: PartZeroConfig): { x: number; z: number }[][] {
  return p.curves.map((c) =>
    c.map((pt) => {
      const z = zero.face === "direita" ? pt.a - p.aMax : p.aMin - pt.a;
      return { x: pt.r * 2, z: z + zero.offsetZ };
    })
  );
}
