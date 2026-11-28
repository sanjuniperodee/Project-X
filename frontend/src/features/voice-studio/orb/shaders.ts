/**
 * Shaders of the voice orb: a sphere of nerve endings (points joined to their neighbours)
 * around a smaller core turning the other way, displaced by simplex noise and by the voice
 * that is speaking; behind it, a halo with a ring that swells with the level.
 */

/** Ashima 3D simplex noise (MIT, Ian McEwan). */
const SIMPLEX = `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

/** Points and lines share this vertex shader, so the web moves with its nodes. */
export const MESH_VERTEX = `
attribute vec3 aPos;
attribute vec2 aInfo; // x: random seed 0..1, y: 0 shell, 1 core
uniform float uTime, uLevel, uSpeak, uThink, uScale, uAspect, uDpr, uPoint;
varying float vDepth, vEnergy, vLayer;
${SIMPLEX}
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
void main(){
  float layer = aInfo.y;
  float speed = 1.0 + 1.6 * uThink;
  vec3 p = aPos;
  float n = snoise(p * mix(1.35, 2.3, layer) + vec3(0.0, uTime * 0.22 * speed, uTime * 0.09));
  // A wave running down the sphere while the assistant speaks.
  float wave = sin(p.y * 6.5 - uTime * 3.0) * uSpeak * (0.25 + uLevel);
  float disp = 0.018 * sin(uTime * 0.9) + n * (0.045 + 0.24 * uLevel) + wave * 0.05;
  p *= mix(1.0, 0.4, layer) * (1.0 + disp * mix(1.0, 1.8, layer));
  p.xz = rot(uTime * 0.11 * speed * mix(1.0, -1.9, layer)) * p.xz;
  p.yz = rot(0.38) * p.yz;
  float persp = 1.0 / (2.8 - p.z);
  vec2 xy = p.xy * persp * 2.2 * uScale;
  gl_Position = vec4(xy.x / uAspect, xy.y, 0.0, 1.0);
  vDepth = p.z;
  vLayer = layer;
  vEnergy = clamp(abs(n) * (0.35 + 1.5 * uLevel) + 0.25 * uThink, 0.0, 1.0);
  float twinkle = 0.6 + 0.4 * sin(uTime * (1.0 + aInfo.x * 3.0) + aInfo.x * 40.0);
  gl_PointSize = uPoint * uDpr * persp * 2.8 * mix(1.0, 1.5, layer) * (0.6 + 0.6 * twinkle + 1.4 * uLevel * aInfo.x);
}`;

export const MESH_FRAGMENT = `
precision mediump float;
uniform vec3 uCool, uHot;
uniform float uAlpha, uLine;
varying float vDepth, vEnergy, vLayer;
void main(){
  float a = 1.0;
  if (uLine < 0.5) {
    float d = length(gl_PointCoord - 0.5);
    a = smoothstep(0.5, 0.0, d);
    a *= a;
  }
  // The far side of the sphere is dimmer: it reads as a volume, not a disc.
  float front = smoothstep(-1.0, 1.0, vDepth);
  // Cool at rest with the accent already showing through; the accent takes over with the voice.
  vec3 col = mix(uCool, uHot, clamp(0.22 + vEnergy + vLayer * 0.5, 0.0, 1.0));
  col = mix(col, vec3(1.0), vLayer * 0.4 + vEnergy * vEnergy * 0.45);
  float alpha = a * uAlpha * (0.22 + 0.78 * front);
  gl_FragColor = vec4(col * alpha, alpha);
}`;

export const HALO_VERTEX = `
attribute vec2 aCorner;
void main(){ gl_Position = vec4(aCorner, 0.0, 1.0); }`;

export const HALO_FRAGMENT = `
precision mediump float;
uniform vec2 uRes;
uniform float uTime, uLevel, uSpeak, uThink, uScale;
uniform vec3 uCool, uHot;
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * uRes.y);
  float r = length(uv) / (0.786 * uScale); // 1.0 at the sphere's edge
  float ang = atan(uv.y, uv.x);
  float core = exp(-r * r * 4.0) * (0.24 + 0.55 * uLevel);
  float glow = 0.14 / (1.0 + pow(r * 1.05, 4.0));
  float ringAt = 1.13 + 0.03 * sin(uTime * 0.8) + 0.14 * uLevel;
  float ring = smoothstep(0.012 + 0.03 * uLevel, 0.0, abs(r - ringAt)) * (0.10 + 0.55 * uLevel);
  float arcs = 0.5 + 0.5 * sin(ang * 3.0 + uTime * (0.35 + uThink * 2.2));
  float outer = smoothstep(0.006, 0.0, abs(r - 1.3)) * 0.16 * arcs;
  float rays = (0.5 + 0.5 * sin(ang * 11.0 + uTime * 0.6 + sin(ang * 3.0 - uTime) * 2.0)) * exp(-abs(r - 1.0) * 6.0) * 0.07 * (0.3 + uSpeak + uLevel);
  vec3 col = mix(uCool, uHot, clamp(0.15 + core * 2.2 + uSpeak * 0.45 + ring, 0.0, 1.0));
  float a = core + glow + ring + outer + rays;
  gl_FragColor = vec4(col * a, a);
}`;
