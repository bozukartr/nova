/* NOVA · WebGL bulutsu arka planı
 *
 * Tek üçgen + tek fragment shader. Sıradaki oyuncunun rengine doğru yavaşça
 * kayar. WebGL yoksa ya da bağlam kaybolursa null döner; oyun aynen sürer,
 * sadece arka plan düz kalır.
 */

const VERT = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;

const FRAG = `
precision mediump float;
uniform vec2 uRes; uniform float uT; uniform vec3 uTint;
float hash(vec2 p){p=fract(p*vec2(233.34,851.73));p+=dot(p,p+23.45);return fract(p.x*p.y);}
void main(){
  vec2 uv=(gl_FragCoord.xy-.5*uRes)/uRes.y;
  float t=uT*.05;
  vec2 q=uv*1.5;
  q+=.40*vec2(sin(q.y*2.3+t*1.7),cos(q.x*2.1-t*1.4));
  q+=.28*vec2(sin(q.y*4.1-t*1.1),cos(q.x*3.6+t*1.9));
  float neb=exp(-length(q)*1.35);
  float neb2=exp(-length(q*.55+vec2(.35,-.25))*2.1);
  vec3 col=vec3(.026,.022,.062);
  col+=uTint*neb*.30;
  col+=vec3(.34,.16,.72)*neb2*.20;
  vec2 sp=uv*13.0; vec2 ip=floor(sp), fp=fract(sp)-.5;
  float h=hash(ip);
  float tw=.55+.45*sin(uT*1.9+h*44.0);
  float s=smoothstep(.13,.0,length(fp-(vec2(hash(ip+7.),hash(ip+13.))-.5)*.62));
  col+=vec3(.78,.83,1.)*s*tw*step(.87,h)*.55;
  col*=1.-.58*pow(length(uv*vec2(.82,.58)),2.);
  gl_FragColor=vec4(col,1.);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export function createBackground(canvas) {
  let gl = null;
  try {
    gl = canvas.getContext('webgl', {
      antialias: false, depth: false, alpha: false, powerPreference: 'high-performance'
    });
  } catch {
    gl = null;
  }
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, 'uRes');
  const uT = gl.getUniformLocation(prog, 'uT');
  const uTint = gl.getUniformLocation(prog, 'uTint');

  const tint = [1, .23, .36];
  let lost = false;
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; });

  return {
    tint,
    /** Hedef renge doğru yumuşak geçiş (kare bağımsız). */
    drift(rgb, dt) {
      const k = Math.min(1, dt * 1.6);
      for (let i = 0; i < 3; i++) tint[i] += (rgb[i] / 255 - tint[i]) * k;
    },
    size(w, h) {
      if (lost) return;
      canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
    },
    draw(t) {
      if (lost) return;
      gl.uniform1f(uT, t);
      gl.uniform3f(uTint, tint[0], tint[1], tint[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  };
}
