import * as THREE from "three";
import Stats from "stats-gl";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
const renderer = new THREE.WebGLRenderer({
  powerPreference: "high-performance",
  antialias: false,
  stencil: false,
  depth: false,
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
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(light);
scene.add(ambientLight);

const object = new THREE.Object3D();
scene.add(object);

const geometry = new THREE.IcosahedronGeometry(1, 0);
for (let i = 0; i < 100; i++) {
  const material = new THREE.MeshPhongMaterial({
    color: 0xffffff * Math.random(),
    flatShading: true,
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
composer.addPass(new UnrealBloomPass(512, 1, 1, 0.1));
// composer.addPass(
//   new EffectPass(
//     camera,
//     new BloomEffect({
//       mipmapBlur: true,
//       intensity: 0.5,
//     })
//   )
// );
composer.addPass(new OutputPass());

function animate() {
  requestAnimationFrame(animate);
  object.rotation.x += 0.005;
  object.rotation.y += 0.01;
  controls.update();
  composer.render(scene, camera);
  stats.update();
}

animate();
