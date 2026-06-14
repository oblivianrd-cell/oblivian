import sharp from "sharp";
import { mkdirSync } from "fs";

mkdirSync("assets", { recursive: true });
const art = "_art";
const jobs = [
  ["icon-foreground.svg", "assets/icon-foreground.png", 1024],
  ["icon-background.svg", "assets/icon-background.png", 1024],
  ["icon-only.svg",       "assets/icon-only.png",       1024],
  ["splash.svg",          "assets/splash.png",          2732],
  ["splash.svg",          "assets/splash-dark.png",     2732],
];
for (const [src, out, size] of jobs) {
  await sharp(`${art}/${src}`, { density: 300 }).resize(size, size).png().toFile(out);
  console.log("ok", out);
}
