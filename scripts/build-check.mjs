import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import path from "node:path";

const requiredFiles = [
  "index.html",
  "css/styles.css",
  "css/magical-extras.css",
  "js/app.js",
  "js/magical-extras.js"
];

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    console.error(`Missing required file: ${file}`);
    process.exit(1);
  }
}

const checkFiles = [
  "js/app.js",
  "js/magical-extras.js",
  ...readdirSync("data")
    .filter((file) => file.endsWith(".js"))
    .map((file) => `data/${file}`)
];

for (const file of checkFiles) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function exactPathExists(relativePath) {
  const segments = String(relativePath || "").split(/[\\/]+/).filter(Boolean);
  let current = process.cwd();

  for (const segment of segments) {
    if (!existsSync(current)) return false;
    const entries = readdirSync(current);
    if (!entries.includes(segment)) return false;
    current = path.join(current, segment);
  }

  return existsSync(current);
}

function fillNumberedPattern(template, number) {
  const padded = String(number).padStart(2, "0");
  return String(template || "")
    .replace(/\{nn\}/g, padded)
    .replace(/\{n\}/g, String(number));
}

function expandNumberedImages(items) {
  return (items || []).flatMap((item) => {
    if (!item || !item.imagePattern) return [item];
    const start = Number.isFinite(Number(item.start)) ? Number(item.start) : 1;
    const count = Number.isFinite(Number(item.count)) ? Number(item.count) : 1;
    return Array.from({ length: Math.max(0, count) }, (_, offset) => ({
      ...item,
      image: fillNumberedPattern(item.imagePattern, start + offset)
    }));
  }).filter(Boolean);
}

function collectAssetPaths() {
  const context = {
    window: {},
    console
  };
  vm.createContext(context);

  for (const file of readdirSync("data").filter((item) => item.endsWith(".js")).sort()) {
    vm.runInContext(readFileSync(path.join("data", file), "utf8"), context, { filename: `data/${file}` });
  }

  const paths = new Set();
  const letters = context.window.TAANI_LETTERS || [];
  const playlist = context.window.TAANI_PLAYLIST || { songs: [] };
  const friends = context.window.TAANI_FRIENDS || [];
  const memories = context.window.TAANI_MEMORIES || [];

  for (const letter of letters) {
    if (letter.image && letter.imageAvailable !== false) paths.add(letter.image);
  }

  for (const song of playlist.songs || []) {
    if (song.cover) paths.add(song.cover);
    if (song.audio) paths.add(song.audio);
  }

  for (const friend of friends) {
    if (friend.profilePicture) paths.add(friend.profilePicture);
    for (const photo of expandNumberedImages(friend.photos || [])) {
      if (photo.image) paths.add(photo.image);
    }
  }

  for (const folder of memories) {
    for (const memory of expandNumberedImages(folder.memories || [])) {
      if (memory.image) paths.add(memory.image);
    }
  }

  return [...paths].filter((assetPath) => !/^https?:\/\//i.test(assetPath));
}

for (const assetPath of collectAssetPaths()) {
  if (!exactPathExists(assetPath)) {
    fail(`Missing or incorrectly capitalized asset path: ${assetPath}`);
  }
}

const distDir = "dist";
rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

for (const file of ["index.html"]) {
  cpSync(file, path.join(distDir, file));
}

for (const directory of ["css", "js", "data", "assets", "public", "audio", "videos"]) {
  if (existsSync(directory)) {
    cpSync(directory, path.join(distDir, directory), { recursive: true });
  }
}

cpSync("index.html", path.join(distDir, "404.html"));
writeFileSync(path.join(distDir, ".nojekyll"), "");

console.log("Static build checks passed. Wrote dist/ for GitHub Pages.");
