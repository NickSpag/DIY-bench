import { packer } from 'guillotine-packer';
const pre = [
  { name: 'partition-L', width: 84, height: 23.25 },
  { name: 'partition-R', width: 84, height: 23.25 },
  { name: 'center-fixed-shelf', width: 22.5, height: 23.25 },
  { name: 'adj-1', width: 22.375, height: 22.5 },
  { name: 'adj-2', width: 22.375, height: 22.5 },
  { name: 'adj-3', width: 22.375, height: 22.5 },
];
for (const [w,h] of [[96,48],[48,48]]) {
  const t=performance.now();
  const r = packer({ binWidth: w, binHeight: h, items: pre.map(x=>({...x})) }, { kerfSize: 0.125, allowRotation: true });
  console.log(`bin ${w}x${h}: ${r.length} bins in ${(performance.now()-t).toFixed(1)}ms`);
  for (const b of r) console.log('  ', b.map(p=>`${p.item.name}@${p.x},${p.y} ${p.width}x${p.height}`).join(' | '));
}
