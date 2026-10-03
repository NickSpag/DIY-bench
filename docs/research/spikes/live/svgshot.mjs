import { chromium } from "playwright-core"; import fs from "node:fs";
const b = await chromium.launch({ channel: "chrome", headless: true }); const p = await b.newPage({ viewport: { width: 900, height: 900 } });
const svg = fs.readFileSync("../kernel/front.svg", "utf8");
await p.setContent(`<body style="margin:0;background:#fff">${svg.replace(/<\?xml[^>]*>/, "")}</body>`);
await p.evaluate(() => { const s = document.querySelector("svg"); s.setAttribute("width", "880"); s.removeAttribute("height"); });
await p.screenshot({ path: "../kernel/front.png" }); await b.close();
