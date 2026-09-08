const DEFAULTS = {
    deep: "#1A102F",
    mid: "#4A357A",
    surge: "#9A7BD6",
    crest: "#c7c6c7",
    speed: 0.22,
    zoom: 2.18,
    warp: 2.79,
    ridge: 0.54,
    sway: 0.24,
    detail: 3.0,
    spin: 0.24,
    hover: 0.27
};

const QUAD_VERTEX = /* glsl */ `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
    }
`

const ABYSS_FRAGMENT = /* glsl */ `
    precision highp float;

    uniform vec2 uResolution;
    uniform vec3 uDeep;
    uniform vec3 uMid;
    uniform vec3 uSurge;
    uniform vec3 uCrest;
    uniform float uTime;
    uniform float uZoom;
    uniform float uWarp;
    uniform float uRidge;
    uniform float uSway;
    uniform float uSharpness;
    uniform float uDetail;
    uniform float uExposure;
    uniform float uYaw;
    uniform vec2 uPointer;
    uniform float uActive;
    uniform float uHover;

    varying vec2 vUv;

    float hash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
    }

    /** Value noise with a smoothstep fade, so no cell edges show. */
    float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }

    /**
     * Five octaves, each half the amplitude and twice the frequency of the one
     * before. "oct" fades the tail in by weight rather than by count — dropping
     * a whole octave at once is visible as a pop.
     *
     * The zero-weight octaves are branched around rather than multiplied out:
     * "oct" is the same for every pixel in a given call, so the branch is
     * uniform across the wavefront and costs nothing, where letting the noise
     * run and scaling it by zero would be the most expensive no-op in the file.
     */
    float fbm(vec2 p, float oct) {
        float sum = 0.0;
        float amp = 0.5;
        float norm = 0.0;
        for (int i = 0; i < 5; i++) {
            float w = clamp(oct - float(i), 0.0, 1.0);
            if (w > 0.0) {
                sum += noise(p) * amp * w;
                norm += amp * w;
            }
            p *= 2.03;
            // Rotated between octaves, which breaks up the lattice alignment
            // that otherwise shows as faint plaid across the body.
            p = mat2(0.8, 0.6, -0.6, 0.8) * p;
            amp *= 0.5;
        }
        return sum / max(0.0001, norm);
    }

    /**
     * The same stack, ridged.
     *
     * Each octave is folded about its midpoint and inverted, so what were the
     * noise's zero crossings become sharp crests. Squaring the result narrows
     * them further. That is the difference between a field of blobs and a field
     * of veins, and it cannot be had by contrast-stretching plain fbm — a
     * stretch keeps the peaks where the blobs already were, and the whole point
     * is that the crests land on the boundaries between them.
     */
    float ridged(vec2 p, float oct) {
        float sum = 0.0;
        float amp = 0.5;
        float norm = 0.0;
        for (int i = 0; i < 5; i++) {
            float w = clamp(oct - float(i), 0.0, 1.0);
            if (w > 0.0) {
                float v = 1.0 - abs(noise(p) * 2.0 - 1.0);
                sum += v * v * amp * w;
                norm += amp * w;
            }
            p *= 2.03;
            p = mat2(0.8, 0.6, -0.6, 0.8) * p;
            amp *= 0.5;
        }
        return sum / max(0.0001, norm);
    }

    /**
     * Four stops with overlapping windows, weighted late — most of the water is
     * dark and the pale end is meant to be rare. The overlap matters: butted
     * ranges leave a seam where one blend ends and the next begins, which shows
     * up as a contour line drawn across the body.
     */
    vec3 ramp(float t) {
        vec3 c = mix(uDeep, uMid, smoothstep(0.05, 0.45, t));
        c = mix(c, uSurge, smoothstep(0.42, 0.78, t));
        return mix(c, uCrest, smoothstep(0.74, 1.0, t));
    }

    void main() {
        vec2 uv = vUv - 0.5;
        // Corrected on the wider axis, so the noise cells stay square in any
        // frame rather than stretching into ovals.
        uv.x *= uResolution.x / max(1.0, uResolution.y);

        /*
         * Two clocks. The field rises on its own; the warp crawls sideways at
         * about a fifth of that rate. Driving both from one time makes the
         * columns travel with the current they are carving, and the result
         * slides as a single printed sheet rather than churning.
         */
        vec2 p = uv * uZoom - vec2(uYaw, 0.0);

        /*
         * The pointer doesn't pan the field anymore — it reaches into it. A
         * radial falloff around the pointer's position, taken in the same
         * aspect-corrected, pre-zoom space as uv so it holds its size across
         * Zoom settings, drives a tangential push that curls the current into
         * a gentle eddy where the water is touched. The same falloff lifts the
         * ramp value near the end of main, so the flow and the colour react
         * to the pointer together instead of the whole sheet sliding under it.
         */
        vec2 toPointer = uv - uPointer;
        float influence = uActive * exp(-dot(toPointer, toPointer) * 5.0) * uHover;
        vec2 tangent = vec2(-toPointer.y, toPointer.x);
        p += tangent * influence;
        vec2 flow = vec2(0.0, uTime);
        vec2 lateral = vec2(uTime * 0.21, 0.0);

        /*
         * The sway, applied to the coordinate before anything samples it, so
         * the warp bands, the body and the veining all bend together as one
         * body of water. Applied to the body field alone it would slide against
         * a warp that stayed put, and the two would visibly come apart.
         *
         * Two waves of different length and rate rather than one. A single sine
         * has a period, and a period is a beat — the water returns to the same
         * shape on a count you can follow, which is the tell that it is a
         * texture being pushed rather than something moving. Crossed like this
         * the pattern only repeats when both come back round together, which at
         * these frequencies is far longer than anyone watches.
         *
         * The vertical partner is a third the strength and driven by the
         * already-swayed x, so the rise and fall follows the horizontal bend
         * instead of running independently of it. Pure side-to-side reads as a
         * sheet sliding; the small rise against it is what gives it volume.
         */
        float sway = sin(p.y * 1.9 - uTime * 1.3) * 0.55
                   + sin(p.y * 3.7 + uTime * 0.9 + 1.7) * 0.25;
        p.x += sway * uSway;
        p.y += sin(p.x * 2.3 + uTime * 1.1) * uSway * 0.35;

        /*
         * The two warp bands, sampled on a coordinate squashed to a third of its
         * height. That squash is the whole reason this reads as current: the
         * bands vary slowly up the frame and quickly across it, so the
         * displacement they apply is long and vertical. Sampled square, the same
         * two fields warp the body into an even mottle with no direction in it.
         */
        vec2 wq = p * vec2(1.0, 0.32);
        vec2 warp = vec2(
            fbm(wq + lateral, uDetail),
            fbm(wq + lateral * 1.4 + vec2(4.3, 2.1), uDetail)
        );
        vec2 push = warp * uWarp;

        float calm = fbm(p + push - flow, uDetail);
        // The veining runs finer than the body and drifts a little faster, so
        // the two never lock together into one shape.
        float veins = ridged(p * 1.35 + push * 0.8 - flow * 1.15, uDetail);

        float v = mix(calm, veins, uRidge);
        v = clamp(pow(clamp(v, 0.0, 1.0), uSharpness) * uExposure, 0.0, 1.0);
        // The same influence that curls the current also pales it, so the
        // touched water reads brighter rather than just differently shaped.
        v = clamp(v + influence * 0.6, 0.0, 1.0);

        vec3 col = ramp(v);
        gl_FragColor = vec4(col, 1.0);
    }
`

let time = 0;
let yaw = 0;
let pointerX = 0, pointerY = 0;
let targetPointerX = 0, targetPointerY = 0;
let active = 0, targetActive = 0;
let lastT = performance.now();
let renderer; 

let uniforms;

window.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('bg-container');
    if (!container) return;

    uniforms = {
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        uDeep: { value: new THREE.Color(DEFAULTS.deep) },
        uMid: { value: new THREE.Color(DEFAULTS.mid) },
        uSurge: { value: new THREE.Color(DEFAULTS.surge) },
        uCrest: { value: new THREE.Color(DEFAULTS.crest) },
        uTime: { value: 0 },
        uZoom: { value: DEFAULTS.zoom },
        uWarp: { value: DEFAULTS.warp },
        uRidge: { value: DEFAULTS.ridge },
        uSway: { value: DEFAULTS.sway },
        uSharpness: { value: 0.7 }, 
        uDetail: { value: DEFAULTS.detail },
        uExposure: { value: 1.3 },
        uYaw: { value: 0 },
        uPointer: { value: new THREE.Vector2(0, 0) },
        uActive: { value: 0 },
        uHover: { value: DEFAULTS.hover }
    };

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    const scene = new THREE.Scene();
    const camera = new THREE.Camera();

    renderer.setPixelRatio(0.75); 

    const material = new THREE.ShaderMaterial({
        vertexShader: QUAD_VERTEX,
        fragmentShader: ABYSS_FRAGMENT,
        uniforms: uniforms,
        transparent: true,
        depthTest: false,
        depthWrite: false
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    window.addEventListener('resize', () => {
        renderer.setSize(window.innerWidth, window.innerHeight);
        uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
    });

    function animate() {
        requestAnimationFrame(animate);

        const now = performance.now();
        let dt = (now - lastT) / 1000;
        lastT = now;
        if (dt > 0.05) dt = 0.05;
            
        time += dt * DEFAULTS.speed;
        yaw += dt * DEFAULTS.spin;

        pointerX += (targetPointerX - pointerX) * (1 - Math.exp(-dt * 8));
        pointerY += (targetPointerY - pointerY) * (1 - Math.exp(-dt * 8));
        active += (targetActive - active) * (1 - Math.exp(-dt * 3));

        uniforms.uTime.value = time;
        uniforms.uYaw.value = yaw;
        uniforms.uPointer.value.set(pointerX, pointerY);
        uniforms.uActive.value = active;
            
        renderer.render(scene, camera);
    }

    container.appendChild(renderer.domElement);
    window.dispatchEvent(new Event('resize'));
    animate();
});