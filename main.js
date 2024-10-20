import * as THREE from "three";
import Stats from "stats-gl";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { FastBloomPass } from "./fastBloomPass";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
const renderer = new THREE.WebGLRenderer({
  // powerPreference: "high-performance",
  antialias: false,
  stencil: false,
  depth: false,
  transparent: true,
});

renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const stats = new Stats({
  precision: 3,
  horizontal: true,
});
stats.init(renderer);
document.body.appendChild(stats.dom);

const light = new THREE.DirectionalLight(0xffffff, 2);
const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
// Add magenta and cyan lights
const lightColors = [0xff00ff, 0x00ffff]; // Magenta and Cyan
const numLights = 6; // 3 of each color

// Load HDRI environment map

const loader = new RGBELoader();
const hdrEquirect = loader.load(
  "src/autumn_field_puresky_1k.hdr",
  () => {
    hdrEquirect.mapping = THREE.EquirectangularReflectionMapping;
    hdrEquirect.encoding = THREE.sRGBEncoding;
    console.log(hdrEquirect);
  },
  null,
  (e) => {
    console.log(e);
  }
);

for (let i = 0; i < numLights; i++) {
  const radius = 300 + Math.random() * 800;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  const color = lightColors[i % 2]; // Alternate between magenta and cyan
  const directionalLight = new THREE.DirectionalLight(
    color,
    Math.random() * 2.5 + 3.5
  ); // Random intensity between 5 and 10
  directionalLight.position.set(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.sin(phi) * Math.sin(theta),
    radius * Math.cos(phi)
  );
  directionalLight.lookAt(scene.position); // Point the light at the center of the scene

  // scene.add(directionalLight);
}

scene.add(light);
scene.add(ambientLight);

const object = new THREE.Object3D();
scene.add(object);

const geometry = new THREE.IcosahedronGeometry(1, 0);
for (let i = 0; i < 100; i++) {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff * (0.5 + Math.random() * 0.5),
    metalness: 0.25,
    roughness: 0.25,
    reflectivity: 0.9,
    envMap: hdrEquirect,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position
    .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
    .normalize();
  mesh.position.multiplyScalar(Math.random() * 400);
  mesh.rotation.set(Math.random() * 2, Math.random() * 2, Math.random() * 2);
  mesh.scale.x = mesh.scale.y = mesh.scale.z = Math.random() * 50;
  object.add(mesh);
}
camera.position.z = 400;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.25;
controls.enableZoom = true;
controls.update();

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new FastBloomPass());
composer.addPass(new OutputPass());
// Handle window resizing
function onWindowResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);
  composer.setSize(width, height);
}

window.addEventListener("resize", onWindowResize);

// Initial call to set the correct size
onWindowResize();

function animate() {
  requestAnimationFrame(animate);
  object.rotation.x += 0.0025;
  object.rotation.y += 0.005;
  controls.update();
  composer.render(scene, camera);
  stats.update();
}

animate();
