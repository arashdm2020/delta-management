import sharp from "sharp";
import { mkdirSync } from "node:fs";
mkdirSync("public/icons", { recursive: true });
const svg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="100" fill="#2563EB"/><g fill="none" stroke="white" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"><path d="M166 364V174l90-34 90 34v190zM142 364h228M218 364v-58h76v58M218 204h4m68 0h4m-76 49h4m68 0h4"/></g></svg>',
);
for (const size of [192, 512])
  await sharp(svg)
    .resize(size, size)
    .png()
    .toFile("public/icons/icon-" + size + ".png");
await sharp(Buffer.from(svg.toString().replace('rx="100"','rx="0"'))).resize(512, 512).png().toFile("public/icons/maskable-512.png");
