/* @dgreenheck/ez-tree 1.1.0 (MIT) — vendorizado pelo app.
   Mudança local: as 20 texturas, que vinham embutidas em base64 (3,9 MB de JS),
   saíram para ./tex/ e são carregadas só quando uma árvore que as usa é gerada. */
var F = Object.defineProperty;
var n = (D, C, A) => C in D ? F(D, C, { enumerable: !0, configurable: !0, writable: !0, value: A }) : D[C] = A;
var N = (D, C, A) => n(D, typeof C != "symbol" ? C + "" : C, A);
import * as B from "three";
class a {
  constructor(C) {
    N(this, "m_w", 123456789);
    N(this, "m_z", 987654321);
    N(this, "mask", 4294967295);
    this.m_w = 123456789 + C & this.mask, this.m_z = 987654321 - C & this.mask;
  }
  /**
   * Returns a random number between min and max
   */
  random(C = 1, A = 0) {
    this.m_z = 36969 * (this.m_z & 65535) + (this.m_z >> 16) & this.mask, this.m_w = 18e3 * (this.m_w & 65535) + (this.m_w >> 16) & this.mask;
    let E = (this.m_z << 16) + (this.m_w & 65535) >>> 0;
    return E /= 4294967296, (C - A) * E + A;
  }
}
class z {
  /**
   * Generates a new branch
   * @param {THREE.Vector3} origin The starting point of the branch
   * @param {THREE.Euler} orientation The starting orientation of the branch
   * @param {number} length The length of the branch
   * @param {number} radius The radius of the branch at its starting point
   */
  constructor(C = new B.Vector3(), A = new B.Euler(), E = 0, g = 0, Q = 0, w = 0, x = 0) {
    this.origin = C.clone(), this.orientation = A.clone(), this.length = E, this.radius = g, this.level = Q, this.sectionCount = w, this.segmentCount = x;
  }
}
const h = {
  Birch: "birch",
  Oak: "oak",
  Pine: "pine",
  Willow: "willow"
}, L = {
  Single: "single",
  Double: "double"
}, T = {
  Ash: "ash",
  Aspen: "aspen",
  Pine: "pine",
  Oak: "oak"
}, K = {
  Deciduous: "deciduous",
  Evergreen: "evergreen"
};
class e {
  constructor() {
    this.seed = 0, this.type = K.Deciduous, this.bark = {
      // The bark texture
      type: h.Oak,
      // Tint of the tree trunk
      tint: 16777215,
      // Use face normals for shading instead of vertex normals
      flatShading: !1,
      // Apply texture to bark
      textured: !0,
      // Scale for the texture
      textureScale: { x: 1, y: 1 }
    }, this.branch = {
      // Number of branch recursion levels. 0 = trunk only
      levels: 3,
      // Angle of the child branches relative to the parent branch (degrees)
      angle: {
        1: 70,
        2: 60,
        3: 60
      },
      // Number of children per branch level
      children: {
        0: 7,
        1: 7,
        2: 5
      },
      // External force encouraging tree growth in a particular direction
      force: {
        direction: { x: 0, y: 1, z: 0 },
        strength: 0.01
      },
      // Amount of curling/twisting at each branch level
      gnarliness: {
        0: 0.15,
        1: 0.2,
        2: 0.3,
        3: 0.02
      },
      // Length of each branch level
      length: {
        0: 20,
        1: 20,
        2: 10,
        3: 1
      },
      // Radius of each branch level
      radius: {
        0: 1.5,
        1: 0.7,
        2: 0.7,
        3: 0.7
      },
      // Number of sections per branch level
      sections: {
        0: 12,
        1: 10,
        2: 8,
        3: 6
      },
      // Number of radial segments per branch level
      segments: {
        0: 8,
        1: 6,
        2: 4,
        3: 3
      },
      // Defines where child branches start forming on the parent branch
      start: {
        1: 0.4,
        2: 0.3,
        3: 0.3
      },
      // Taper at each branch level
      taper: {
        0: 0.7,
        1: 0.7,
        2: 0.7,
        3: 0.7
      },
      // Amount of twist at each branch level
      twist: {
        0: 0,
        1: 0,
        2: 0,
        3: 0
      }
    }, this.leaves = {
      // Leaf texture to use
      type: T.Oak,
      // Whether to use single or double/perpendicular billboards
      billboard: L.Double,
      // Angle of leaves relative to parent branch (degrees)
      angle: 10,
      // Number of leaves
      count: 1,
      // Where leaves start to grow on the length of the branch (0 to 1)
      start: 0,
      // Size of the leaves
      size: 2.5,
      // Variance in leaf size between each instance
      sizeVariance: 0.7,
      // Tint color for the leaves
      tint: 16777215,
      // Controls transparency of leaf texture
      alphaTest: 0.5
    }, this.trellis = {
      // Whether trellis is enabled
      enabled: !1,
      // Position of trellis (z is distance from tree)
      position: { x: 0, y: 0, z: -2 },
      // Width of trellis grid (X direction)
      width: 10,
      // Height of trellis grid (Y direction)
      height: 20,
      // Distance between grid lines
      spacing: 2,
      // Force parameters
      force: {
        // How strongly branches bend toward trellis
        strength: 0.02,
        // Maximum distance at which trellis affects branches
        maxDistance: 3,
        // Distance falloff exponent (1 = linear, 2 = quadratic)
        falloff: 1
      },
      // Radius of trellis cylinders
      cylinderRadius: 0.05,
      // Whether to show trellis geometry
      visible: !0,
      // Color of trellis
      color: 9127187
    };
  }
  /**
   * Copies the values from source into this object
   * @param {TreeOptions} source 
   */
  copy(C, A = this) {
    for (let E in C)
      C.hasOwnProperty(E) && A.hasOwnProperty(E) && (typeof C[E] == "object" && C[E] !== null ? this.copy(C[E], A[E]) : A[E] = C[E]);
  }
}
const P = 26867, r = "deciduous", W = {
  type: "oak",
  tint: 13552830,
  flatShading: !1,
  textured: !0,
  textureScale: {
    x: 0.5,
    y: 5
  }
}, v = {
  levels: 2,
  angle: {
    1: 48,
    2: 75,
    3: 60
  },
  children: {
    0: 10,
    1: 3,
    2: 3
  },
  force: {
    direction: {
      x: 0,
      y: 1,
      z: 0
    },
    strength: -0.02
  },
  gnarliness: {
    0: 0.11,
    1: 0.09,
    2: 0.05,
    3: 0.09
  },
  length: {
    0: 23.87,
    1: 18,
    2: 5.59,
    3: 4.6
  },
  radius: {
    0: 0.81,
    1: 0.56,
    2: 0.76,
    3: 0.7
  },
  sections: {
    0: 12,
    1: 10,
    2: 10,
    3: 10
  },
  segments: {
    0: 8,
    1: 6,
    2: 4,
    3: 3
  },
  start: {
    1: 0.53,
    2: 0.33,
    3: 0
  },
  taper: {
    0: 0.7,
    1: 0.7,
    2: 0.7,
    3: 0.7
  },
  twist: {
    0: 0.3,
    1: -0.07,
    2: 0,
    3: 0
  }
}, k = {
  type: "ash",
  billboard: "double",
  angle: 55,
  count: 30,
  start: 0,
  size: 2.05,
  sizeVariance: 0.717,
  tint: 16777215,
  alphaTest: 0.5
}, S = {
  enabled: !1
}, V = {
  seed: P,
  type: r,
  bark: W,
  branch: v,
  leaves: k,
  trellis: S
}, p = 36330, X = "deciduous", b = {
  type: "oak",
  tint: 13552830,
  flatShading: !1,
  textured: !0,
  textureScale: {
    x: 0.5,
    y: 5
  }
}, u = {
  levels: 3,
  angle: {
    1: 48,
    2: 75,
    3: 60
  },
  children: {
    0: 7,
    1: 4,
    2: 3
  },
  force: {
    direction: {
      x: 0,
      y: 1,
      z: 0
    },
    strength: -0.06
  },
  gnarliness: {
    0: 0.03,
    1: 0.25,
    2: 0.2,
    3: 0.09
  },
  length: {
    0: 43.47,
    1: 27.14,
    2: 9.51,
    3: 4.6
  },
  radius: {
    0: 2,
    1: 0.63,
    2: 0.76,
    3: 0.7
  },
  sections: {
    0: 12,
    1: 8,
    2: 6,
    3: 4
  },
  segments: {
    0: 12,
    1: 6,
    2: 4,
    3: 3
  },
  start: {
    1: 0.23,
    2: 0.33,
    3: 0
  },
  taper: {
    0: 0.7,
    1: 0.7,
    2: 0.7,
    3: 0.7
  },
  twist: {
    0: 0.09,
    1: -0.07,
    2: 0,
    3: 0
  }
}, q = {
  type: "ash",
  billboard: "double",
  angle: 55,
  count: 16,
  start: 0,
  size: 2.67,
  sizeVariance: 0.72,
  tint: 16777215,
  alphaTest: 0.5
}, t = {
  enabled: !1
}, f = {
  seed: p,
  type: X,
  bark: b,
  branch: u,
  leaves: q,
  trellis: t
}, d = 29919, $ = "deciduous", _ = {
  type: "oak",
  tint: 13552830,
  flatShading: !1,
  textured: !0,
  textureScale: {
    x: 0.5,
    y: 5
  }
}, AA = {
  levels: 3,
  angle: {
    1: 39,
    2: 39,
    3: 51
  },
  children: {
    0: 10,
    1: 4,
    2: 3
  },
  force: {
    direction: {
      x: 0,
      y: 1,
      z: 0
    },
    strength: -0.010869565217391311
  },
  gnarliness: {
    0: -0.05,
    1: 0.2,
    2: 0.16,
    3: 0.049999999999999996
  },
  length: {
    0: 45,
    1: 29.42,
    2: 15.3,
    3: 4.6
  },
  radius: {
    0: 3.03,
    1: 0.53,
    2: 0.79,
    3: 1.11
  },
  sections: {
    0: 12,
    1: 8,
    2: 6,
    3: 4
  },
  segments: {
    0: 8,
    1: 6,
    2: 4,
    3: 3
  },
  start: {
    1: 0.32,
    2: 0.34,
    3: 0
  },
  taper: {
    0: 0.7,
    1: 0.6199999999999999,
    2: 0.7599999999999999,
    3: 0
  },
  twist: {
    0: 0.09,
    1: -0.07,
    2: 0,
    3: 0
  }
}, BA = {
  type: "ash",
  billboard: "double",
  angle: 30,
  count: 10,
  start: 0.01,
  size: 4.62,
  sizeVariance: 0.72,
  tint: 16777215,
  alphaTest: 0.5
}, EA = {
  enabled: !1
}, gA = {
  seed: d,
  type: $,
  bark: _,
  branch: AA,
  leaves: BA,
  trellis: EA
}, CA = 36330, MA = "deciduous", wA = {
  type: "birch",
  tint: 16777215,
  flatShading: !1,
  textured: !0,
  textureScale: {
    x: 1,
    y: 1
  }
}, cA = {
  levels: 2,
  angle: {
    1: 70,
    2: 35,
    3: 7
  },
  children: {
    0: 4,
    1: 3,
    2: 3
  },
  force: {
    direction: {
      x: 0,
      y: 1,
      z: 0
    },
    strength: 0.010869565217391311
  },
  gnarliness: {
    0: 0.04,
    1: -0.010000000000000007,
    2: 0.12,
    3: 0.02
  },
  length: {
    0: 23.99,
    1: 3.36,
    2: 7.699999999999999,
    3: 1
  },
  radius: {
    0: 0.36999999999999994,
    1: 0.41,
    2: 0.7,
    3: 0.7
  },
  sections: {
    0: 12,
    1: 10,
    2: 8,
    3: 6
  },
  segments: {
    0: 8,
    1: 6,
    2: 4,
    3: 3
  },
  start: {
    1: 0.44999999999999996,
    2: 0.32999999999999996,
    3: 0
  },
  taper: {
    0: 0.37,
    1: 0.13,
    2: 0.7,
    3: 0.7
  },
  twist: {
    0: 0,
    1: 0,
    2: 0,
    3: 0
  }
}, IA = {
  type: "aspen",
  billboard: "double",
  angle: 30,
  count: 13,
  start: 0.2,
  size: 2.5,
  sizeVariance: 0.7,
  tint: 16775778,
  alphaTest: 0.5
}, QA = {
  enabled: !1
}, xA = {
  seed: CA,
  type: MA,
  bark: wA,
  branch: cA,
  leaves: IA,
  trellis: QA
}, GA = 18020, jA = "deciduous", DA = {
  type: "birch",
  tint: 16777215,
  flatShading: !1,
  textured: !0,
  textureScale: {
    x: 1,
    y: 1
  }
}, iA = {
  levels: 2,
  angle: {
    1: 75,
    2: 32,
    3: 7
  },
  children: {
    0: 10,
    1: 3,
    2: 3
  },
  force: {
    direction: {
      x: 0,
      y: 1,
      z: 0
    },
    strength: 0.0148
  },
  gnarliness: {
    0: 0.05,
    1: 0.12,
    2: 0.12,
    3: 0.02
  },
  length: {
    0: 50,
    1: 6.07,
    2: 11.19,
    3: 1
  },
  radius: {
    0: 0.72,
    1: 0.41,
    2: 0.7,
    3: 0.7
  },
  sections: {
    0: 12,
    1: 10,
    2: 8,
    3: 6
  },
  segments: {
    0: 8,
    1: 6,
    2: 4,
    3: 3
  },
  start: {
    1: 0.59,
    2: 0.35,
    3: 0
  },
  taper: {
    0: 0.37,
    1: 0.13,
    2: 0.7,
    3: 0.7
  },
  twist: {
    0: 0,
    1: 0,
    2: 0,
    3: 0
  }
}, OA = {
  type: "aspen",
  billboard: "double",
  angle: 30,
  count: 11,
  start: 0.124,
  size: 2.5,
  sizeVariance: 0.7,
  tint: 16775778,
  alphaTest: 0.5
}, YA = {
  enabled: !1
}, UA = {
  seed: GA,
  type: jA,
  bark: DA,
  branch: iA,
  leaves: OA,
  trellis: YA
}, sA = 30631, RA = "deciduous", lA = {
  type: "birch",
  tint: 16777215,
  flatShading: !1,
  textured: !0,
  textureScale: {
    x: 1,
    y: 1
  }
}, HA = {
  levels: 2,
  angle: {
    1: 47,
    2: 63,
    3: 7
  },
  children: {
    0: 10,
    1: 6,
    2: 0
  },
  force: {
    direction: {
      x: 0,
      y: 1,
      z: 0
    },
    strength: 0.021739130434782622
  },
  gnarliness: {
    0: 0.05,
    1: -0.030000000000000006,
    2: 0.12,
    3: 0.02
  },
  length: {
    0: 69.60000000000001,
    1: 18.56,
    2: 11.19,
    3: 1
  },
  radius: {
    0: 1.11,
    1: 0.5800000000000001,
    2: 0.7,
    3: 0.7
  },
  sections: {
    0: 12,
    1: 10,
    2: 8,
    3: 6
  },
  segments: {
    0: 8,
    1: 6,
    2: 4,
    3: 3
  },
  start: {
    1: 0.62,
    2: 0.049999999999999975,
    3: 0
  },
  taper: {
    0: 0.7000000000000001,
    1: 0.13,
    2: 0.7,
    3: 0.7
  },
  twist: {
    0: 0,
    1: 0,
    2: 0,
    3: 0
  }
}, NA = {
  type: "aspen",
  billboard: "double",
  angle: 36,
  count: 20,
  start: 0.15217391304347827,
  size: 3.4782608695652173,
  sizeVariance: 0.7,
  tint: 16580390,
  alphaTest: 0.5
}, oA = {
  enabled: !1
}, KA = {
  seed: sA,
  type: RA,
  bark: lA,
  branch: HA,
  leaves: NA,
  trellis: oA
}, JA = 45590, zA = "deciduous", LA = {
  type: "oak",
  tint: 13552830,
  flatShading: !1,
  textured: !0,
  textureScale: {
    x: 0.5,
    y: 5
  }
}, eA = {
  levels: 3,
  angle: {
    1: 21.521739130434785,
    2: 62.608695652173914,
    3: 60
  },
  children: {
    0: 7,
    1: 3,
    2: 2
  },
  force: {
    direction: {
      x: 0,
      y: 1,
      z: 0
    },
    strength: -0.02
  },
  gnarliness: {
    0: 0.11,
    1: 0.09,
    2: 0.05,
    3: 0.09
  },
  length: {
    0: 0.1,
    1: 15.302173913043479,
    2: 5.59,
    3: 4.6
  },
  radius: {
    0: 0.5793478260869566,
    1: 0.9521739130434783,
    2: 0.76,
    3: 0.7
  },
  sections: {
    0: 6,
    1: 6,
    2: 10,
    3: 10
  },
  segments: {
    0: 4,
    1: 4,
    2: 4,
    3: 3
  },
  start: {
    1: 0.53,
    2: 0.33,
    3: 0
  },
  taper: {
    0: 0.7,
    1: 0.7,
    2: 0.7,
    3: 0.7
  },
  twist: {
    0: 0.3,
    1: -0.07,
    2: 0,
    3: 0
  }
}, ZA = {
  type: "ash",
  billboard: "double",
  angle: 55,
  count: 12,
  start: 0,
  size: 2.4456521739130435,
  sizeVariance: 0.717,
  tint: 14745557,
  alphaTest: 0.5
}, mA = {
  enabled: !1
}, yA = {
  seed: JA,
  type: zA,
  bark: LA,
  branch: eA,
  leaves: ZA,
  trellis: mA
}, FA = 45590, nA = "deciduous", aA = {
  type: "oak",
  tint: 13552830,
  flatShading: !1,
  textured: !0,
  textureScale: {
    x: 0.5,
    y: 5
  }
}, hA = {
  levels: 2,
  angle: {
    1: 19.565217391304348,
    2: 27.39130434782609,
    3: 60
  },
  children: {
    0: 10,
    1: 3,
    2: 2
  },
  force: {
    direction: {
      x: 0,
      y: 1,
      z: 0
    },
    strength: -0.02
  },
  gnarliness: {
    0: 0.021739130434782594,
    1: 0.10869565217391308,
    2: 0.05,
    3: 0.09
  },
  length: {
    0: 0.1,
    1: 19.645652173913046,
    2: 7.701086956521739,
    3: 4.6
  },
  radius: {
    0: 0.5793478260869566,
    1: 0.9521739130434783,
    2: 0.76,
    3: 0.7
  },
  sections: {
    0: 3,
    1: 4,
    2: 10,
    3: 10
  },
  segments: {
    0: 4,
    1: 4,
    2: 4,
    3: 3
  },
  start: {
    1: 0.6413043478260869,
    2: 0.7065217391304348,
    3: 0
  },
  taper: {
    0: 0.7,
    1: 0.7,
    2: 0.7,
    3: 0.7
  },
  twist: {
    0: 0.3586956521739131,
    1: -0.043478260869565244,
    2: 0,
    3: 0
  }
}, TA = {
  type: "aspen",
  billboard: "double",
  angle: 55,
  count: 7,
  start: 0,
  size: 2.4456521739130435,
  sizeVariance: 0.717,
  tint: 14745557,
  alphaTest: 0.5
}, PA = {
  enabled: !1
}, rA = {
  seed: FA,
  type: nA,
  bark: aA,
  branch: hA,
  leaves: TA,
  trellis: PA
}, WA = 31343, vA = "evergreen", kA = {
  type: "oak",
  tint: 13552830,
  flatShading: !1,
  textured: !0,
  textureScale: {
    x: 0.5,
    y: 5
  }
}, SA = {
  levels: 3,
  angle: {
    1: 66.52173913043478,
    2: 52.82608695652174,
    3: 0
  },
  children: {
    0: 13,
    1: 4,
    2: 4
  },
  force: {
    direction: {
      x: 0,
      y: 1,
      z: 0
    },
    strength: -7e-3
  },
  gnarliness: {
    0: 0.05434782608695654,
    1: 0.06521739130434778,
    2: 0.05,
    3: 0.09
  },
  length: {
    0: 10.958695652173914,
    1: 21.81739130434783,
    2: 13.130434782608695,
    3: 5.529347826086957
  },
  radius: {
    0: 0.5793478260869566,
    1: 0.9521739130434783,
    2: 0.6858695652173914,
    3: 0.7391304347826086
  },
  sections: {
    0: 4,
    1: 3,
    2: 3,
    3: 10
  },
  segments: {
    0: 3,
    1: 3,
    2: 3,
    3: 3
  },
  start: {
    1: 0.14130434782608695,
    2: 0.29347826086956524,
    3: 0
  },
  taper: {
    0: 0.7,
    1: 0.7,
    2: 0.7,
    3: 0.7
  },
  twist: {
    0: 0.3,
    1: -0.03260869565217389,
    2: 0,
    3: 0
  }
}, VA = {
  type: "pine",
  billboard: "double",
  angle: 54,
  count: 3,
  start: 0.15217391304347827,
  size: 3.0434782608695654,
  sizeVariance: 0.45652173913043476,
  tint: 10339327,
  alphaTest: 0.5
}, pA = {
  enabled: !1
}, XA = {
  seed: WA,
  type: vA,
  bark: kA,
  branch: SA,
  leaves: VA,
  trellis: pA
}, bA = 30895, uA = "deciduous", qA = {
  type: "oak",
  tint: 16774097,
  flatShading: !1,
  textured: !0,
  textureScale: {
    x: 1,
    y: 10
  }
}, tA = {
  levels: 3,
  angle: {
    1: 54,
    2: 58,
    3: 32
  },
  children: {
    0: 4,
    1: 2,
    2: 3
  },
  force: {
    direction: {
      x: 0,
      y: 1,
      z: 0
    },
    strength: -0.01
  },
  gnarliness: {
    0: 0.07,
    1: -0.08,
    2: 0.11,
    3: 0.09
  },
  length: {
    0: 28.08,
    1: 4.55,
    2: 9.78,
    3: 7.16
  },
  radius: {
    0: 1,
    1: 1.02,
    2: 0.69,
    3: 1.19
  },
  sections: {
    0: 16,
    1: 9,
    2: 8,
    3: 1
  },
  segments: {
    0: 7,
    1: 5,
    2: 3,
    3: 3
  },
  start: {
    1: 0.49,
    2: 0.06,
    3: 0.12
  },
  taper: {
    0: 0.73,
    1: 0.42,
    2: 0.69,
    3: 0.75
  },
  twist: {
    0: -0.23,
    1: 0.42,
    2: 0,
    3: 0
  }
}, fA = {
  type: "oak",
  billboard: "double",
  angle: 42,
  count: 14,
  start: 0.16,
  size: 1.38,
  sizeVariance: 0.7,
  tint: 14013901,
  alphaTest: 0.5
}, dA = {
  enabled: !1
}, $A = {
  seed: bA,
  type: uA,
  bark: qA,
  branch: tA,
  leaves: fA,
  trellis: dA
}, _A = 35729, AB = "deciduous", BB = {
  type: "oak",
  tint: 16774097,
  flatShading: !1,
  textured: !0,
  textureScale: {
    x: 1,
    y: 10
  }
}, EB = {
  levels: 3,
  angle: {
    1: 54,
    2: 58,
    3: 32
  },
  children: {
    0: 6,
    1: 4,
    2: 3
  },
  force: {
    direction: {
      x: 0,
      y: 1,
      z: 0
    },
    strength: -0.01
  },
  gnarliness: {
    0: 0,
    1: -0.1,
    2: -0.15,
    3: 0.09
  },
  length: {
    0: 37.24,
    1: 11.08,
    2: 12.39,
    3: 7.16
  },
  radius: {
    0: 1.41,
    1: 0.9,
    2: 0.69,
    3: 1.19
  },
  sections: {
    0: 8,
    1: 6,
    2: 3,
    3: 1
  },
  segments: {
    0: 7,
    1: 5,
    2: 3,
    3: 3
  },
  start: {
    1: 0.49,
    2: 0.06,
    3: 0.12
  },
  taper: {
    0: 0.73,
    1: 0.42,
    2: 0.69,
    3: 0.75
  },
  twist: {
    0: -0.23,
    1: 0.42,
    2: 0,
    3: 0
  }
}, gB = {
  type: "oak",
  billboard: "double",
  angle: 42,
  count: 18,
  start: 0.16,
  size: 2.5,
  sizeVariance: 0.7,
  tint: 14013901,
  alphaTest: 0.5
}, CB = {
  enabled: !1
}, MB = {
  seed: _A,
  type: AB,
  bark: BB,
  branch: EB,
  leaves: gB,
  trellis: CB
}, wB = 23399, cB = "deciduous", IB = {
  type: "oak",
  tint: 16774097,
  flatShading: !1,
  textured: !0,
  textureScale: {
    x: 1,
    y: 10
  }
}, QB = {
  levels: 3,
  angle: {
    1: 54,
    2: 43,
    3: 32
  },
  children: {
    0: 9,
    1: 5,
    2: 3
  },
  force: {
    direction: {
      x: 0,
      y: 1,
      z: 0
    },
    strength: -0.025
  },
  gnarliness: {
    0: -0.04,
    1: 0.16,
    2: -0.06,
    3: 0.09
  },
  length: {
    0: 47.7,
    1: 29.39,
    2: 17.62,
    3: 7.16
  },
  radius: {
    0: 3,
    1: 0.69,
    2: 0.69,
    3: 1.19
  },
  sections: {
    0: 16,
    1: 9,
    2: 8,
    3: 3
  },
  segments: {
    0: 12,
    1: 5,
    2: 3,
    3: 3
  },
  start: {
    1: 0.35,
    2: 0.1,
    3: 0
  },
  taper: {
    0: 0.73,
    1: 0.42,
    2: 0.69,
    3: 0.75
  },
  twist: {
    0: -0.23,
    1: 0.42,
    2: 0,
    3: 0
  }
}, xB = {
  type: "oak",
  billboard: "double",
  angle: 36,
  count: 10,
  start: 0.16,
  size: 4.5,
  sizeVariance: 0.7,
  tint: 14013901,
  alphaTest: 0.5
}, GB = {
  enabled: !1
}, jB = {
  seed: wB,
  type: cB,
  bark: IB,
  branch: QB,
  leaves: xB,
  trellis: GB
}, DB = 11744, iB = "evergreen", OB = {
  type: "pine",
  tint: 16777215,
  flatShading: !1,
  textured: !0,
  textureScale: {
    x: 1,
    y: 1
  }
}, YB = {
  levels: 1,
  angle: {
    1: 117,
    2: 60,
    3: 60
  },
  children: {
    0: 91,
    1: 7,
    2: 5
  },
  force: {
    direction: {
      x: 0,
      y: 1,
      z: 0
    },
    strength: 0
  },
  gnarliness: {
    0: 0.05,
    1: 0.08,
    2: 0,
    3: 0
  },
  length: {
    0: 39.55,
    1: 12.12,
    2: 10,
    3: 1
  },
  radius: {
    0: 0.55,
    1: 0.41,
    2: 0.7,
    3: 0.7
  },
  sections: {
    0: 12,
    1: 10,
    2: 8,
    3: 6
  },
  segments: {
    0: 8,
    1: 6,
    2: 4,
    3: 3
  },
  start: {
    1: 0.16,
    2: 0.3,
    3: 0.3
  },
  taper: {
    0: 0.7,
    1: 0.7,
    2: 0.7,
    3: 0.7
  },
  twist: {
    0: 0,
    1: 0,
    2: 0,
    3: 0
  }
}, UB = {
  type: "pine",
  billboard: "double",
  angle: 10,
  count: 21,
  start: 0,
  size: 0.965,
  sizeVariance: 0.7,
  tint: 16777215,
  alphaTest: 0.3
}, sB = {
  enabled: !1
}, RB = {
  seed: DB,
  type: iB,
  bark: OB,
  branch: YB,
  leaves: UB,
  trellis: sB
}, lB = 13977, HB = "evergreen", NB = {
  type: "pine",
  tint: 16777215,
  flatShading: !1,
  textured: !0,
  textureScale: {
    x: 1,
    y: 1
  }
}, oB = {
  levels: 1,
  angle: {
    1: 110,
    2: 16,
    3: 60
  },
  children: {
    0: 82,
    1: 3,
    2: 5
  },
  force: {
    direction: {
      x: 0,
      y: 1,
      z: 0
    },
    strength: -3e-3
  },
  gnarliness: {
    0: 0.05,
    1: 0.08,
    2: 0,
    3: 0
  },
  length: {
    0: 50,
    1: 23.87,
    2: 14.08,
    3: 1
  },
  radius: {
    0: 1.05,
    1: 0.36,
    2: 0.7,
    3: 0.7
  },
  sections: {
    0: 12,
    1: 10,
    2: 8,
    3: 6
  },
  segments: {
    0: 8,
    1: 6,
    2: 4,
    3: 3
  },
  start: {
    1: 0.27,
    2: 0.14,
    3: 0.3
  },
  taper: {
    0: 0.7,
    1: 0.7,
    2: 0.7,
    3: 0.7
  },
  twist: {
    0: 0,
    1: 0,
    2: 0,
    3: 0
  }
}, KB = {
  type: "pine",
  billboard: "double",
  angle: 39,
  count: 30,
  start: 0.09,
  size: 1.435,
  sizeVariance: 0.201,
  tint: 16777215,
  alphaTest: 0.3
}, JB = {
  enabled: !1
}, zB = {
  seed: lB,
  type: HB,
  bark: NB,
  branch: oB,
  leaves: KB,
  trellis: JB
}, LB = 44166, eB = "evergreen", ZB = {
  type: "pine",
  tint: 16777215,
  flatShading: !1,
  textured: !0,
  textureScale: {
    x: 1,
    y: 1
  }
}, mB = {
  levels: 1,
  angle: {
    1: 129.1304347826087,
    2: 16,
    3: 60
  },
  children: {
    0: 100,
    1: 3,
    2: 0
  },
  force: {
    direction: {
      x: 0,
      y: 1,
      z: 0
    },
    strength: 0.009000000000000001
  },
  gnarliness: {
    0: 0.05,
    1: 0.08,
    2: 0,
    3: 0
  },
  length: {
    0: 65.25217391304348,
    1: 34.84782608695652,
    2: 27.246739130434783,
    3: 1
  },
  radius: {
    0: 1.271739130434783,
    1: 0.366304347826087,
    2: 0.7,
    3: 0.7
  },
  sections: {
    0: 12,
    1: 10,
    2: 8,
    3: 6
  },
  segments: {
    0: 8,
    1: 6,
    2: 4,
    3: 3
  },
  start: {
    1: 0.29347826086956524,
    2: 0.14,
    3: 0.3
  },
  taper: {
    0: 0.7,
    1: 0.7,
    2: 0.7,
    3: 0.7
  },
  twist: {
    0: 0,
    1: 0,
    2: 0,
    3: 0
  }
}, yB = {
  type: "pine",
  billboard: "double",
  angle: 17,
  count: 18,
  start: 0.07608695652173914,
  size: 2.608695652173913,
  sizeVariance: 0.201,
  tint: 16777215,
  alphaTest: 0.3
}, FB = {
  enabled: !1
}, nB = {
  seed: LB,
  type: eB,
  bark: ZB,
  branch: mB,
  leaves: yB,
  trellis: FB
}, aB = 41563, hB = "deciduous", TB = {
  type: "oak",
  tint: 16777215,
  flatShading: !1,
  textured: !0,
  textureScale: {
    x: 1,
    y: 8
  }
}, PB = {
  levels: 3,
  angle: {
    1: 26,
    2: 79,
    3: 0
  },
  children: {
    0: 7,
    1: 5,
    2: 1
  },
  force: {
    direction: {
      x: 0,
      y: 1,
      z: 0
    },
    strength: 0.026
  },
  gnarliness: {
    0: 0,
    1: 0.02,
    2: -0.41,
    3: 0.09
  },
  length: {
    0: 4.8,
    1: 16.9,
    2: 11.3,
    3: 11.1
  },
  radius: {
    0: 0.27,
    1: 0.71,
    2: 0.84,
    3: 0.48
  },
  sections: {
    0: 6,
    1: 12,
    2: 10,
    3: 4
  },
  segments: {
    0: 3,
    1: 3,
    2: 3,
    3: 3
  },
  start: {
    1: 0.19,
    2: 0.1,
    3: 0.06
  },
  taper: {
    0: 0.6,
    1: 0.5,
    2: 0.5,
    3: 0.5
  },
  twist: {
    0: -0.02,
    1: -0.01,
    2: 0.09,
    3: 0
  }
}, rB = {
  type: "ash",
  billboard: "single",
  angle: 30,
  count: 13,
  start: 0,
  size: 1.7,
  sizeVariance: 0.5,
  tint: 15204310,
  alphaTest: 0.5
}, WB = {
  enabled: !0,
  position: {
    x: 0,
    y: 0,
    z: 1.3
  },
  width: 20,
  height: 32,
  spacing: 4,
  force: {
    strength: 0.014,
    maxDistance: 18.2,
    falloff: 1.3
  },
  cylinderRadius: 0.08,
  visible: !0,
  color: 5519173
}, vB = {
  seed: aB,
  type: hB,
  bark: TB,
  branch: PB,
  leaves: rB,
  trellis: WB
}, kB = {
  "Ash Small": V,
  "Ash Medium": f,
  "Ash Large": gA,
  "Aspen Small": xA,
  "Aspen Medium": UA,
  "Aspen Large": KA,
  "Bush 1": yA,
  "Bush 2": rA,
  "Bush 3": XA,
  "Oak Small": $A,
  "Oak Medium": MB,
  "Oak Large": jB,
  "Pine Small": RB,
  "Pine Medium": zB,
  "Pine Large": nB,
  Trellis: vB
};
function SB(D) {
  const C = kB[D];
  return C ? structuredClone(C) : new e();
}
const VB = new URL("./tex/birch_ao.jpg", import.meta.url).href, pB = new URL("./tex/birch_color.jpg", import.meta.url).href, XB = new URL("./tex/birch_normal.jpg", import.meta.url).href, bB = new URL("./tex/birch_roughness.jpg", import.meta.url).href, uB = new URL("./tex/oak_ao.jpg", import.meta.url).href, qB = new URL("./tex/oak_color.jpg", import.meta.url).href, tB = new URL("./tex/oak_normal.jpg", import.meta.url).href, fB = new URL("./tex/oak_roughness.jpg", import.meta.url).href, dB = new URL("./tex/pine_ao.jpg", import.meta.url).href, $B = new URL("./tex/pine_color.jpg", import.meta.url).href, _B = new URL("./tex/pine_normal.jpg", import.meta.url).href, AE = new URL("./tex/pine_roughness.jpg", import.meta.url).href, BE = new URL("./tex/willow_ao.jpg", import.meta.url).href, EE = new URL("./tex/willow_color.jpg", import.meta.url).href, gE = new URL("./tex/willow_normal.jpg", import.meta.url).href, CE = new URL("./tex/willow_roughness.jpg", import.meta.url).href, ME = new URL("./tex/leaf_ash.png", import.meta.url).href, wE = new URL("./tex/leaf_aspen.png", import.meta.url).href, cE = new URL("./tex/leaf_oak.png", import.meta.url).href, IE = new URL("./tex/leaf_pine.png", import.meta.url).href, QE = new B.TextureLoader();
function o(D, C, A = { x: 1, y: 1 }) {
  const E = Z.bark[D][C]();
  return E.wrapS = B.RepeatWrapping, E.wrapT = B.RepeatWrapping, E.repeat.x = A.x, E.repeat.y = 1 / A.y, E;
}
function xE(D) {
  return Z.leaves[D]();
}
const j0 = (D, C = !0) => {
  const A = QE.load(D);
  return A.premultiplyAlpha = !0, C && (A.colorSpace = B.SRGBColorSpace), A;
}, j = (D, C = !0) => {
  let t = null;
  return () => t || (t = j0(D, C));
}, Z = {
  bark: {
    birch: {
      ao: j(VB, !1),
      color: j(pB),
      normal: j(XB, !1),
      roughness: j(bB, !1)
    },
    oak: {
      ao: j(uB, !1),
      color: j(qB),
      normal: j(tB, !1),
      roughness: j(fB, !1)
    },
    pine: {
      ao: j(dB, !1),
      color: j($B),
      normal: j(_B, !1),
      roughness: j(AE, !1)
    },
    willow: {
      ao: j(BE, !1),
      color: j(EE),
      normal: j(gE, !1),
      roughness: j(CE, !1)
    }
  },
  leaves: {
    ash: j(ME),
    aspen: j(wE),
    oak: j(cE),
    pine: j(IE)
  }
};
class GE extends B.Group {
  /**
   * @param {Object} options Trellis configuration
   */
  constructor(C) {
    super(), this.name = "Trellis", this.options = C, this.material = null, this.hCylinderGeo = null, this.vCylinderGeo = null;
  }
  /**
   * Generate the trellis geometry
   */
  generate() {
    const C = this.options;
    this.dispose(), this.material = new B.MeshStandardMaterial({
      color: C.color,
      roughness: 0.8
    }), this.hCylinderGeo = new B.CylinderGeometry(
      C.cylinderRadius,
      C.cylinderRadius,
      C.width,
      8
    ), this.hCylinderGeo.rotateZ(Math.PI / 2), this.vCylinderGeo = new B.CylinderGeometry(
      C.cylinderRadius,
      C.cylinderRadius,
      C.height,
      8
    );
    const A = Math.floor(C.height / C.spacing) + 1;
    for (let g = 0; g < A; g++) {
      const Q = g * C.spacing, w = new B.Mesh(this.hCylinderGeo, this.material);
      w.position.set(C.position.x, C.position.y + Q, C.position.z), this.add(w);
    }
    const E = Math.floor(C.width / C.spacing) + 1;
    for (let g = 0; g < E; g++) {
      const Q = -C.width / 2 + g * C.spacing, w = new B.Mesh(this.vCylinderGeo, this.material);
      w.position.set(C.position.x + Q, C.position.y + C.height / 2, C.position.z), this.add(w);
    }
  }
  /**
   * Find the nearest point on the trellis grid to a given position
   * @param {THREE.Vector3} position
   * @returns {THREE.Vector3}
   */
  getNearestPoint(C) {
    const A = this.options, E = A.position.x, g = A.position.y, Q = A.position.z, w = E - A.width / 2, x = E + A.width / 2, M = g, I = g + A.height, c = Math.max(w, Math.min(x, C.x)), G = Math.max(M, Math.min(I, C.y)), O = Math.round((G - M) / A.spacing) * A.spacing + M, R = Math.max(M, Math.min(I, O)), l = Math.round((c - w) / A.spacing) * A.spacing + w, i = Math.max(w, Math.min(x, l)), Y = new B.Vector3(c, R, Q), U = new B.Vector3(i, G, Q), s = C.distanceTo(Y), H = C.distanceTo(U);
    return s < H ? Y : U;
  }
  /**
   * Clean up geometry and materials
   */
  dispose() {
    this.children.forEach((C) => {
      C.geometry && (C.geometry = null);
    }), this.clear(), this.hCylinderGeo && (this.hCylinderGeo.dispose(), this.hCylinderGeo = null), this.vCylinderGeo && (this.vCylinderGeo.dispose(), this.vCylinderGeo = null), this.material && (this.material.dispose(), this.material = null);
  }
}
class DE extends B.Group {
  /**
   * @param {TreeOptions} params
   */
  constructor(A = new e()) {
    super();
    /**
     * @type {RNG}
     */
    N(this, "rng");
    /**
     * @type {TreeOptions}
     */
    N(this, "options");
    /**
     * @type {Branch[]}
     */
    N(this, "branchQueue", []);
    this.name = "Tree", this.branchesMesh = new B.Mesh(), this.leavesMesh = new B.Mesh(), this.trellisMesh = null, this.add(this.branchesMesh), this.add(this.leavesMesh), this.options = A;
  }
  update(A) {
    const E = this.leavesMesh.material.userData.shader;
    E && (E.uniforms.uTime.value = A);
  }
  /**
   * Loads a preset tree from JSON 
   * @param {string} preset 
   */
  loadPreset(A) {
    const E = SB(A);
    this.loadFromJson(E);
  }
  /**
   * Loads a tree from JSON
   * @param {TreeOptions} json 
   */
  loadFromJson(A) {
    this.options.copy(A), this.generate();
  }
  /**
   * Generate a new tree
   */
  generate() {
    for (this.branches = {
      verts: [],
      normals: [],
      indices: [],
      uvs: [],
      windFactor: []
    }, this.leaves = {
      verts: [],
      normals: [],
      indices: [],
      uvs: []
    }, this.rng = new a(this.options.seed), this.branchQueue.push(
      new z(
        new B.Vector3(),
        new B.Euler(),
        this.options.branch.length[0],
        this.options.branch.radius[0],
        0,
        this.options.branch.sections[0],
        this.options.branch.segments[0]
      )
    ); this.branchQueue.length > 0; ) {
      const A = this.branchQueue.shift();
      this.generateBranch(A);
    }
    this.createBranchesGeometry(), this.createLeavesGeometry(), this.createTrellis();
  }
  /**
   * Generates a new branch
   * @param {Branch} branch
   * @returns
   */
  generateBranch(A) {
    const E = this.branches.verts.length / 3;
    let g = A.orientation.clone(), Q = A.origin.clone(), w = A.length / A.sectionCount / (this.options.type === "Deciduous" ? this.options.branch.levels - 1 : 1), x = [];
    for (let M = 0; M <= A.sectionCount; M++) {
      let I = A.radius;
      M === A.sectionCount && A.level === this.options.branch.levels ? I = 1e-3 : this.options.type === K.Deciduous ? I *= 1 - this.options.branch.taper[A.level] * (M / A.sectionCount) : this.options.type === K.Evergreen && (I *= 1 - M / A.sectionCount);
      let c;
      for (let i = 0; i < A.segmentCount; i++) {
        let Y = 2 * Math.PI * i / A.segmentCount;
        const U = new B.Vector3(Math.cos(Y), 0, Math.sin(Y)).multiplyScalar(I).applyEuler(g).add(Q), s = new B.Vector3(Math.cos(Y), 0, Math.sin(Y)).applyEuler(g).normalize(), H = new B.Vector2(
          i / A.segmentCount,
          M % 2 === 0 ? 0 : 1
        );
        this.branches.verts.push(...Object.values(U)), this.branches.normals.push(...Object.values(s)), this.branches.uvs.push(...Object.values(H)), i === 0 && (c = { vertex: U, normal: s, uv: H });
      }
      this.branches.verts.push(...Object.values(c.vertex)), this.branches.normals.push(...Object.values(c.normal)), this.branches.uvs.push(1, c.uv.y), x.push({
        origin: Q.clone(),
        orientation: g.clone(),
        radius: I
      }), Q.add(
        new B.Vector3(0, w, 0).applyEuler(g)
      );
      const G = Math.max(1, 1 / Math.sqrt(I)) * this.options.branch.gnarliness[A.level];
      g.x += this.rng.random(G, -G), g.z += this.rng.random(G, -G);
      const O = new B.Quaternion().setFromEuler(g), R = new B.Quaternion().setFromAxisAngle(
        new B.Vector3(0, 1, 0),
        this.options.branch.twist[A.level]
      ), l = new B.Quaternion().setFromUnitVectors(
        new B.Vector3(0, 1, 0),
        new B.Vector3().copy(this.options.branch.force.direction)
      );
      if (O.multiply(R), O.rotateTowards(
        l,
        this.options.branch.force.strength / I
      ), this.options.trellis.enabled) {
        const i = this.calculateTrellisForce(Q, I);
        if (i) {
          const Y = new B.Quaternion().setFromUnitVectors(
            new B.Vector3(0, 1, 0),
            i.direction
          );
          O.rotateTowards(Y, i.strength);
        }
      }
      g.setFromQuaternion(O);
    }
    if (this.generateBranchIndices(E, A), this.options.type === "deciduous") {
      const M = x[x.length - 1];
      A.level < this.options.branch.levels ? this.branchQueue.push(
        new z(
          M.origin,
          M.orientation,
          this.options.branch.length[A.level + 1],
          M.radius,
          A.level + 1,
          // Section count and segment count must be same as parent branch
          // since the child branch is growing from the end of the parent branch
          A.sectionCount,
          A.segmentCount
        )
      ) : this.generateLeaf(M.origin, M.orientation);
    }
    A.level === this.options.branch.levels ? this.generateLeaves(x) : A.level < this.options.branch.levels && this.generateChildBranches(
      this.options.branch.children[A.level],
      A.level + 1,
      x
    );
  }
  /**
   * Generate branches from a parent branch
   * @param {number} count The number of child branches to generate
   * @param {number} level The level of the child branches
   * @param {{
   *  origin: THREE.Vector3,
   *  orientation: THREE.Euler,
   *  radius: number
   * }[]} sections The parent branch's sections
   * @returns
   */
  generateChildBranches(A, E, g) {
    const Q = this.rng.random();
    for (let w = 0; w < A; w++) {
      let x = this.rng.random(1, this.options.branch.start[E]);
      const M = Math.floor(x * (g.length - 1));
      let I, c;
      I = g[M], M === g.length - 1 ? c = I : c = g[M + 1];
      const G = (x - M / (g.length - 1)) / (1 / (g.length - 1)), O = new B.Vector3().lerpVectors(
        I.origin,
        c.origin,
        G
      ), R = this.options.branch.radius[E] * ((1 - G) * I.radius + G * c.radius), l = new B.Quaternion().setFromEuler(I.orientation), i = new B.Quaternion().setFromEuler(c.orientation), Y = new B.Euler().setFromQuaternion(
        i.slerp(l, G)
      ), U = 2 * Math.PI * (Q + w / A), s = new B.Quaternion().setFromAxisAngle(
        new B.Vector3(1, 0, 0),
        this.options.branch.angle[E] / (180 / Math.PI)
      ), H = new B.Quaternion().setFromAxisAngle(
        new B.Vector3(0, 1, 0),
        U
      ), J = new B.Quaternion().setFromEuler(Y), m = new B.Euler().setFromQuaternion(
        J.multiply(H.multiply(s))
      );
      let y = this.options.branch.length[E] * (this.options.type === K.Evergreen ? 1 - x : 1);
      this.branchQueue.push(
        new z(
          O,
          m,
          y,
          R,
          E,
          this.options.branch.sections[E],
          this.options.branch.segments[E]
        )
      );
    }
  }
  /**
   * Logic for spawning child branches from a parent branch's section
   * @param {{
  *  origin: THREE.Vector3,
  *  orientation: THREE.Euler,
  *  radius: number
  * }[]} sections The parent branch's sections
  * @returns
  */
  generateLeaves(A) {
    const E = this.rng.random();
    for (let g = 0; g < this.options.leaves.count; g++) {
      let Q = this.rng.random(1, this.options.leaves.start);
      const w = Math.floor(Q * (A.length - 1));
      let x, M;
      x = A[w], w === A.length - 1 ? M = x : M = A[w + 1];
      const I = (Q - w / (A.length - 1)) / (1 / (A.length - 1)), c = new B.Vector3().lerpVectors(
        x.origin,
        M.origin,
        I
      ), G = new B.Quaternion().setFromEuler(x.orientation), O = new B.Quaternion().setFromEuler(M.orientation), R = new B.Euler().setFromQuaternion(
        O.slerp(G, I)
      ), l = 2 * Math.PI * (E + g / this.options.leaves.count), i = new B.Quaternion().setFromAxisAngle(
        new B.Vector3(1, 0, 0),
        this.options.leaves.angle / (180 / Math.PI)
      ), Y = new B.Quaternion().setFromAxisAngle(
        new B.Vector3(0, 1, 0),
        l
      ), U = new B.Quaternion().setFromEuler(R), s = new B.Euler().setFromQuaternion(
        U.multiply(Y.multiply(i))
      );
      this.generateLeaf(c, s);
    }
  }
  /**
  * Generates a leaves
  * @param {THREE.Vector3} origin The starting point of the branch
  * @param {THREE.Euler} orientation The starting orientation of the branch
  */
  generateLeaf(A, E) {
    let g = this.leaves.verts.length / 3, Q = this.options.leaves.size * (1 + this.rng.random(
      this.options.leaves.sizeVariance,
      -this.options.leaves.sizeVariance
    ));
    const w = Q, x = Q, M = (I) => {
      const c = [
        new B.Vector3(-w / 2, x, 0),
        new B.Vector3(-w / 2, 0, 0),
        new B.Vector3(w / 2, 0, 0),
        new B.Vector3(w / 2, x, 0)
      ].map(
        (O) => O.applyEuler(new B.Euler(0, I, 0)).applyEuler(E).add(A)
      );
      this.leaves.verts.push(
        c[0].x,
        c[0].y,
        c[0].z,
        c[1].x,
        c[1].y,
        c[1].z,
        c[2].x,
        c[2].y,
        c[2].z,
        c[3].x,
        c[3].y,
        c[3].z
      );
      const G = new B.Vector3(0, 0, 1).applyEuler(E);
      this.leaves.normals.push(
        G.x,
        G.y,
        G.z,
        G.x,
        G.y,
        G.z,
        G.x,
        G.y,
        G.z,
        G.x,
        G.y,
        G.z
      ), this.leaves.uvs.push(0, 1, 0, 0, 1, 0, 1, 1), this.leaves.indices.push(g, g + 1, g + 2, g, g + 2, g + 3), g += 4;
    };
    M(0), this.options.leaves.billboard === L.Double && M(Math.PI / 2);
  }
  /**
   * Generates the indices for branch geometry
   * @param {Branch} branch
   */
  generateBranchIndices(A, E) {
    let g, Q, w, x;
    const M = E.segmentCount + 1;
    for (let I = 0; I < E.sectionCount; I++)
      for (let c = 0; c < E.segmentCount; c++)
        g = A + I * M + c, Q = A + I * M + (c + 1), w = g + M, x = Q + M, this.branches.indices.push(g, w, Q, Q, w, x);
  }
  /**
   * Generates the geometry for the branches
   */
  createBranchesGeometry() {
    const A = new B.BufferGeometry();
    A.setAttribute(
      "position",
      new B.BufferAttribute(new Float32Array(this.branches.verts), 3)
    ), A.setAttribute(
      "normal",
      new B.BufferAttribute(new Float32Array(this.branches.normals), 3)
    ), A.setAttribute(
      "uv",
      new B.BufferAttribute(new Float32Array(this.branches.uvs), 2)
    ), A.setIndex(
      new B.BufferAttribute(new Uint16Array(this.branches.indices), 1)
    ), A.computeBoundingSphere();
    const E = new B.MeshPhongMaterial({
      name: "branches",
      flatShading: this.options.bark.flatShading,
      color: new B.Color(this.options.bark.tint)
    });
    this.options.bark.textured && (E.aoMap = o(this.options.bark.type, "ao", this.options.bark.textureScale), E.map = o(this.options.bark.type, "color", this.options.bark.textureScale), E.normalMap = o(this.options.bark.type, "normal", this.options.bark.textureScale), E.roughnessMap = o(this.options.bark.type, "roughness", this.options.bark.textureScale)), this.branchesMesh.geometry.dispose(), this.branchesMesh.geometry = A, this.branchesMesh.material.dispose(), this.branchesMesh.material = E, this.branchesMesh.castShadow = !0, this.branchesMesh.receiveShadow = !0;
  }
  /**
   * Generates the geometry for the leaves
   */
  createLeavesGeometry() {
    const A = new B.BufferGeometry();
    A.setAttribute(
      "position",
      new B.BufferAttribute(new Float32Array(this.leaves.verts), 3)
    ), A.setAttribute(
      "uv",
      new B.BufferAttribute(new Float32Array(this.leaves.uvs), 2)
    ), A.setIndex(
      new B.BufferAttribute(new Uint16Array(this.leaves.indices), 1)
    ), A.computeVertexNormals(), A.computeBoundingSphere();
    const E = new B.MeshPhongMaterial({
      name: "leaves",
      map: xE(this.options.leaves.type),
      color: new B.Color(this.options.leaves.tint),
      side: B.DoubleSide,
      alphaTest: this.options.leaves.alphaTest,
      dithering: !0
    });
    E.onBeforeCompile = (g) => {
      g.uniforms.uTime = { value: 0 }, g.uniforms.uWindStrength = { value: new B.Vector3(0.5, 0, 0.5) }, g.uniforms.uWindFrequency = { value: 0.5 }, g.uniforms.uWindScale = { value: 70 }, g.vertexShader = `
        uniform float uTime;
        uniform vec3 uWindStrength;
        uniform float uWindFrequency;
        uniform float uWindScale;
        ` + g.vertexShader, g.vertexShader = g.vertexShader.replace(
        "void main() {",
        `
        // GLSL Simplex Noise 3D
        // Source: https://github.com/ashima/webgl-noise

        vec3 mod289(vec3 x) {
            return x - floor(x * (1.0 / 289.0)) * 289.0;
        }

        vec4 mod289(vec4 x) {
            return x - floor(x * (1.0 / 289.0)) * 289.0;
        }

        vec4 permute(vec4 x) {
            return mod289(((x*34.0)+1.0)*x);
        }

        vec4 taylorInvSqrt(vec4 r) {
            return 1.79284291400159 - 0.85373472095314 * r;
        }

        vec3 fade(vec3 t) {
            return t*t*t*(t*(t*6.0-15.0)+10.0);
        }

        // Classic Simplex Noise 3D
        float simplex3(vec3 v) {
            const vec2  C = vec2(1.0/6.0, 1.0/3.0);
            const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

            // First corner
            vec3 i  = floor(v + dot(v, C.yyy) );
            vec3 x0 = v - i + dot(i, C.xxx);

            // Other corners
            vec3 g = step(x0.yzx, x0.xyz);
            vec3 l = 1.0 - g;
            vec3 i1 = min( g.xyz, l.zxy );
            vec3 i2 = max( g.xyz, l.zxy );

            //  x0 = x0 - 0. + 0.0 * C 
            vec3 x1 = x0 - i1 + C.xxx;
            vec3 x2 = x0 - i2 + C.yyy; // 2.0 * C.x = 1/3 = C.y
            vec3 x3 = x0 - D.yyy;      // -1.0 + 3.0 * C.x = -0.5

            // Permutations
            i = mod289(i);
            vec4 p = permute( permute( permute( 
                        i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                      + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
                      + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

            // Gradients: 7x7 points over a square, mapped onto an octahedron.
            // The ring size 17*17 = 289 is close to the mapping's singularity.
            float n_ = 0.142857142857; // 1.0/7.0
            vec3  ns = n_ * D.wyz - D.xzx;

            vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  //  mod(p,7*7)

            vec4 x_ = floor(j * ns.z);
            vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

            vec4 x = x_ *ns.x + ns.yyyy;
            vec4 y = y_ *ns.x + ns.yyyy;
            vec4 h = 1.0 - abs(x) - abs(y);

            vec4 b0 = vec4( x.xy, y.xy );
            vec4 b1 = vec4( x.zw, y.zw );

            vec4 s0 = floor(b0)*2.0 + 1.0;
            vec4 s1 = floor(b1)*2.0 + 1.0;
            vec4 sh = -step(h, vec4(0.0));

            vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
            vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

            vec3 g0 = vec3(a0.xy,h.x);
            vec3 g1 = vec3(a0.zw,h.y);
            vec3 g2 = vec3(a1.xy,h.z);
            vec3 g3 = vec3(a1.zw,h.w);

            // Normalise gradients
            vec4 norm = taylorInvSqrt(vec4(dot(g0,g0), dot(g1,g1), dot(g2,g2), dot(g3,g3)));
            g0 *= norm.x;
            g1 *= norm.y;
            g2 *= norm.z;
            g3 *= norm.w;

            // Mix contributions from the four corners
            vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
            m = m * m;
            return 42.0 * dot( m*m, vec4( dot(g0,x0), dot(g1,x1), 
                                          dot(g2,x2), dot(g3,x3) ) );
        }
          
        void main() {`
      ), g.vertexShader = g.vertexShader.replace(
        "#include <project_vertex>",
        `
        vec4 mvPosition = vec4(transformed, 1.0);

        float windOffset = 2.0 * 3.14 * simplex3(mvPosition.xyz / uWindScale);
        vec3 windSway = uv.y * uWindStrength * (
          0.5 * sin(uTime * uWindFrequency + windOffset) +
          0.3 * sin(2.0 * uTime * uWindFrequency + 1.3 * windOffset) +
          0.2 * sin(5.0 * uTime * uWindFrequency + 1.5 * windOffset)
        );
        mvPosition.xyz += windSway;

        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;
        `
      ), E.userData.shader = g;
    }, this.leavesMesh.geometry.dispose(), this.leavesMesh.geometry = A, this.leavesMesh.material.dispose(), this.leavesMesh.material = E, this.leavesMesh.castShadow = !0, this.leavesMesh.receiveShadow = !0;
  }
  /**
   * Create or update the trellis geometry
   */
  createTrellis() {
    this.trellisMesh && (this.remove(this.trellisMesh), this.trellisMesh.dispose(), this.trellisMesh = null), this.options.trellis.enabled && this.options.trellis.visible && (this.trellisMesh = new GE(this.options.trellis), this.trellisMesh.generate(), this.add(this.trellisMesh));
  }
  /**
   * Find the nearest point on the trellis grid to a given position
   * @param {THREE.Vector3} position
   * @returns {THREE.Vector3}
   */
  getNearestTrellisPoint(A) {
    const E = this.options.trellis, g = E.position.x, Q = E.position.y, w = E.position.z, x = g - E.width / 2, M = g + E.width / 2, I = Q, c = Q + E.height, G = Math.max(x, Math.min(M, A.x)), O = Math.max(I, Math.min(c, A.y)), R = Math.round((O - I) / E.spacing) * E.spacing + I, l = Math.max(I, Math.min(c, R)), i = Math.round((G - x) / E.spacing) * E.spacing + x, Y = Math.max(x, Math.min(M, i)), U = new B.Vector3(G, l, w), s = new B.Vector3(Y, O, w), H = A.distanceTo(U), J = A.distanceTo(s);
    return H < J ? U : s;
  }
  /**
   * Calculate the force vector toward the nearest trellis point
   * @param {THREE.Vector3} position Current section position
   * @param {number} radius Current section radius
   * @returns {{ direction: THREE.Vector3, strength: number } | null}
   */
  calculateTrellisForce(A, E) {
    const g = this.options.trellis, Q = this.getNearestTrellisPoint(A), w = A.distanceTo(Q);
    if (w > g.force.maxDistance || w < 1e-3) return null;
    const x = new B.Vector3().subVectors(Q, A).normalize(), M = 1 - Math.pow(
      w / g.force.maxDistance,
      g.force.falloff
    ), I = g.force.strength * M / E;
    return { direction: x, strength: I };
  }
  get vertexCount() {
    return (this.branches.verts.length + this.leaves.verts.length) / 3;
  }
  get triangleCount() {
    return (this.branches.indices.length + this.leaves.indices.length) / 3;
  }
}
export {
  h as BarkType,
  L as Billboard,
  T as LeafType,
  DE as Tree,
  kB as TreePreset,
  K as TreeType,
  GE as Trellis
};
//# sourceMappingURL=ez-tree.es.js.map
