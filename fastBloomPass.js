import {
  ShaderMaterial,
  UniformsUtils,
  Vector2,
  Vector4,
  WebGLRenderTarget,
  LinearMipMapLinearFilter,
  FloatType,
  LinearFilter,
  Texture,
  RGBAFormat,
  HalfFloatType,
} from "three";
import {
  Pass,
  FullScreenQuad,
} from "three/examples/jsm/postprocessing/Pass.js";

const leanpsrdnoise = `
const float alpha = 1.;
const vec2 period = vec2(PI);
float psrdnoise(vec2 x){
  vec2 uv = vec2(x.x+x.y*0.5, x.y);
  vec2 i0 = floor(uv), f0 = fract(uv);
  float cmp = step(f0.y, f0.x);
  vec2 o1 = vec2(cmp, 1.0-cmp);
  vec2 i1 = i0 + o1, i2 = i0 + 1.0;
  vec2 v0 = vec2(i0.x - i0.y*0.5, i0.y);
  vec2 v1 = vec2(v0.x + o1.x - o1.y*0.5, v0.y + o1.y);
  vec2 v2 = vec2(v0.x + 0.5, v0.y + 1.0);
  vec2 x0 = x - v0, x1 = x - v1, x2 = x - v2;
  vec3 iu, iv, xw, yw;
  if(any(greaterThan(period, vec2(0.0)))) {
    xw = vec3(v0.x, v1.x, v2.x);
    yw = vec3(v0.y, v1.y, v2.y);
    if(period.x > 0.0)
    xw = mod(vec3(v0.x, v1.x, v2.x), period.x);
    if(period.y > 0.0)
      yw = mod(vec3(v0.y, v1.y, v2.y), period.y);
    iu = floor(xw + 0.5*yw + 0.5); iv = floor(yw + 0.5);
  } else {
    iu = vec3(i0.x, i1.x, i2.x); iv = vec3(i0.y, i1.y, i2.y);
  }
  vec3 hash = mod(iu, 289.0);
  hash = mod((hash*51.0 + 2.0)*hash + iv, 289.0);
  hash = mod((hash*34.0 + 10.0)*hash, 289.0);
  vec3 psi = hash*0.07482 + alpha;
  vec3 gx = cos(psi); vec3 gy = sin(psi);
  vec2 g0 = vec2(gx.x, gy.x);
  vec2 g1 = vec2(gx.y, gy.y);
  vec2 g2 = vec2(gx.z, gy.z);
  vec3 w = 0.8 - vec3(dot(x0, x0), dot(x1, x1), dot(x2, x2));
  w = max(w, 0.0); vec3 w2 = w*w; vec3 w4 = w2*w2;
  vec3 gdotx = vec3(dot(g0, x0), dot(g1, x1), dot(g2, x2));
  float n = dot(w4, gdotx);
  //vec3 w3 = w2*w; vec3 dw = -8.0*w3*gdotx;
  //vec2 dn0 = w4.x*g0 + dw.x*x0;
  //vec2 dn1 = w4.y*g1 + dw.y*x1;
  //vec2 dn2 = w4.z*g2 + dw.z*x2;
  //gradient = 10.9*(dn0 + dn1 + dn2);
  return 10.9*n;
}
`;

// Helper function to generate mipmaps
function generateMipmaps(gl, renderer, texture) {
  // Ensure we're working with a WebGL2 context
  if (!(gl instanceof WebGL2RenderingContext)) {
    console.error("WebGL2 is required for this operation");
    return;
  }

  const glTexture = renderer.properties.get(texture).__webglTexture;
  // console.log(glTexture);
  gl.bindTexture(gl.TEXTURE_2D, glTexture);
  gl.generateMipmap(gl.TEXTURE_2D);
  // Set texture format to RGBA float
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA32F,
    texture.image.width,
    texture.image.height,
    0,
    gl.RGBA,
    gl.HALF_FLOAT,
    null
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    gl.LINEAR_MIPMAP_LINEAR
  );
  // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  gl.bindTexture(gl.TEXTURE_2D, null);
}

class FastBloomPass extends Pass {
  constructor(renderer, strength = 1, disk = 100, samples = 16, options = {}) {
    super();
    this.clear = false;
    this.textureID = "tDiffuse";
    this.pixelSize = 1;
    this.resolution = new Vector2();
    this.renderResolution = new Vector2();
    this.fastBloomMaterial = this.createFastBloomMaterial();
    this.luminanceMaterial = this.createLuminanceMaterial();
    this.fsQuad = new FullScreenQuad(this.fastBloomMaterial);
    this.renderToScreen = false;
    this.luminanceRenderTarget = new WebGLRenderTarget(1, 1, {
      format: RGBAFormat,
      type: HalfFloatType,
      generateMipmaps: false,
    });
    this.luminanceRenderTarget.texture.name = "FastBloomPass.luminance";
    this.luminanceRenderTarget.depthBuffer = false;
    this.gl = null;
  }

  dispose() {
    this.luminanceRenderTarget.dispose();
    this.fastBloomMaterial.dispose();
    this.luminanceMaterial.dispose();
    this.fsQuad.dispose();
  }

  setSize(width, height) {
    this.resolution.set(width, height);
    this.renderResolution.set(
      (width / this.pixelSize) | 0,
      (height / this.pixelSize) | 0
    );
    const { x, y } = this.renderResolution;
    this.luminanceRenderTarget.setSize(x, y);
    this.luminanceMaterial.uniforms.resolution.value.set(
      x * this.pixelSize,
      y * this.pixelSize,
      1 / x,
      1 / y
    );
    this.fastBloomMaterial.uniforms.resolution.value.set(
      x * this.pixelSize,
      y * this.pixelSize,
      1 / x,
      1 / y
    );
  }

  setPixelSize(pixelSize) {
    this.pixelSize = pixelSize;
    this.setSize(this.resolution.x, this.resolution.y);
  }

  render(renderer, writeBuffer, readBuffer, deltaTime) {
    if (this.gl === null) {
      this.gl = renderer.getContext();
    }

    renderer.setRenderTarget(this.luminanceRenderTarget);
    this.fsQuad.material = this.luminanceMaterial;
    this.luminanceMaterial.uniforms.tDiffuse.value = readBuffer.texture;
    this.fsQuad.render(renderer);

    // Generate mipmaps after rendering to luminanceRenderTarget
    generateMipmaps(this.gl, renderer, this.luminanceRenderTarget.texture);

    // Rebind the main texture after the luminance pass
    this.gl.bindTexture(
      this.gl.TEXTURE_2D,
      renderer.properties.get(readBuffer.texture).__webglTexture
    );

    // Now, use the luminance texture for the fast bloom pass
    this.fsQuad.material = this.fastBloomMaterial;

    this.fastBloomMaterial.uniforms.tDiffuse.value = readBuffer.texture;
    this.fastBloomMaterial.uniforms.tLuminance.value =
      this.luminanceRenderTarget.texture;
    this.fsQuad.material["tTime"] += deltaTime;
    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
      this.fsQuad.render(renderer);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) {
        renderer.clear(
          renderer.autoClearColor,
          renderer.autoClearDepth,
          renderer.autoClearStencil
        );
      }
      this.fsQuad.render(renderer);
    }
  }

  createLuminanceMaterial() {
    return new ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        luminanceTreshold: { value: 0.0 },
        smoothWidth: { value: 0.5 },
        resolution: {
          value: new Vector4(
            this.renderResolution.x,
            this.renderResolution.y,
            1 / this.renderResolution.x,
            1 / this.renderResolution.y
          ),
        },
      },
      vertexShader: /* glsl */ `
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
        `,
      fragmentShader: `
  
  uniform sampler2D tDiffuse;
  uniform vec2 resolution;
  uniform float luminanceTreshold;
  uniform float smoothWidth;
    
  void main() {
    vec2 uv = gl_FragCoord.xy/resolution.xy;
  	vec4 texel = texture( tDiffuse, uv);
  	float v = dot(vec3(0.2125, 0.7154, 0.0721 ), texel.rgb );
  	float alpha = smoothstep( luminanceTreshold, luminanceTreshold + smoothWidth, v );
  	gl_FragColor = mix( vec4(0.), texel, alpha );
    
  }`,
    });
  }

  createFastBloomMaterial() {
    return new ShaderMaterial({
      uniforms: {
        strength: { value: 1.0 },
        disk: { value: 36.0 },
        samples: { value: 24.0 },
        lods: { value: 4.0 },
        lodSteps: { value: 2.0 },
        compression: { value: 6.0 },
        saturation: { value: 1.0 },
        tDiffuse: { value: null },
        tLuminance: { value: null },
        blendMode: { value: false },
        tTime: { value: 0 },
        resolution: {
          value: new Vector4(
            this.renderResolution.x,
            this.renderResolution.y,
            1 / this.renderResolution.x,
            1 / this.renderResolution.y
          ),
        },
      },
      vertexShader: /* glsl */ `void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
        `,
      /* glsl */
      fragmentShader: `
  uniform vec4 resolution;
  
  uniform float tTime;
  uniform sampler2D tDiffuse;
  uniform sampler2D tLuminance;

  uniform float strength;
  uniform float split;
  uniform float disk;
  uniform int samples;
  uniform int lods;
  uniform float lodSteps;
  uniform float compression;
  uniform float saturation;
  uniform bool blendMode;
  
  #define T tTime
  #define R resolution.xy
  #define PI 3.14159265358
  #define PI2 6.28318530718
  // rounding up to the closest power of two, https://stackoverflow.com/questions/466204/rounding-up-to-next-power-of-2
  #define NOISE_SCALE pow(2., ceil(log(max(R.x,R.y))/log(2.)))
  #define EPSILON 1e-5

const float sqrtPI = sqrt(PI2);
const float sigma = 1. / 3.0;
const float goldenAngle = PI * (3.0 - sqrt(5.0));

float gaussian(float x) {
    return exp(-0.5 * (x * x) / (sigma * sigma)) / (sigma * sqrtPI);
}

${leanpsrdnoise}
// GPU friendly if statement
// https://codepen.io/brunoimbrizi/pen/MoRJaN?editors=1000
// the expressions bellow are equivalent to
// if (texelOld.a < cutoff) texelOld.a = 0.0;
// texelOld.a *= when(texelOld.a, cutoff);
//float whenGreaterThan(float x, float y) {
    // return max(sign(x - y), 0.0);
//}


vec4 goldenBlur(vec2 uv, vec2 polar, vec2 radii, int samplers, float lod){
  vec4 samples = vec4(0.);
  float weight = 0.;
  for (int i = 1; i <= samplers; i++) {
    vec2 radius =  radii * sqrt(float(i) / float(samplers));
    float theta = float(i) * goldenAngle;
    vec2 off = vec2(polar.x  * cos(theta) - polar.y * sin(theta),  
                    polar.y  * cos(theta) + polar.x * sin(theta)); 
    float gauss = gaussian(length(off));
    weight += gauss;                       
    samples += textureLod(tLuminance, uv+(off * radius), lod)*gauss;
  }
  return samples/weight;
}

vec4 add(vec4 src, vec4 dst, bool clamped) {
    if(!clamped) return src + dst;
    return clamp(src + dst, 0.0, 1.0);
}

vec4 screen(vec4 src, vec4 dst, bool clamped) {
    if(!clamped) return vec4(1.0) - (vec4(1.0) - src) * (vec4(1.0) - dst);
    return clamp(vec4(1.0) - (vec4(1.0) - src) * (vec4(1.0) - dst), 0.0, 1.0);
}

vec4 blending(vec4 src, vec4 dst, bool clamped, bool blendMode) {
    if (blendMode) {
        return screen(src, dst, clamped);
    } else {
        return add(src, dst, clamped);
    }
}

/*
todo :
scale blur on lod
*/

  void main(){
    vec2 uv = (gl_FragCoord.xy/R);
    vec2 radii = vec2(disk * max(R.x,R.y)/min(R.x,R.y))/R;
    vec4 frame = texture(tDiffuse,uv);
    vec4 color = vec4(0.);
    float noise = psrdnoise(uv * NOISE_SCALE);
    float angle = PI + (noise * 2.- 1.) * PI;
    vec2 polar = vec2(cos(angle), sin(angle));
    for(int i = 0; i<lods; i++){
      float lod = float(i) * lodSteps;
      color = add(goldenBlur(uv, polar, radii, samples, lod ),color, false);
    }
    color /= compression;
    gl_FragColor = add(frame, color*saturation, true);
    gl_FragColor = mix(frame, gl_FragColor, strength);
    gl_FragColor = clamp(gl_FragColor, 0., 1.);
  }
  `,
    });
  }
}
export { FastBloomPass };
