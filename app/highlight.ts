// One generated stylesheet turns the selection into CSS (section 9.8 of the spec): every
// element that carries the id in data-part gets --hl, and the table, chip, sheet and drawing
// styles in theme.css mix it in. Thousands of SVG elements update without being touched.
import { useWb } from "./store.ts";
import { highlightCss } from "./highlight-css.ts";

function installHighlight(): () => void {
  let el = document.getElementById("wb-hl") as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = "wb-hl";
    document.head.appendChild(el);
  }
  const style = el;
  const write = () => {
    const s = useWb.getState();
    style.textContent = highlightCss(s.selected, s.hovered);
  };
  write();
  return useWb.subscribe((s, p) => {
    if (s.selected !== p.selected || s.hovered !== p.hovered) write();
  });
}

const uninstall = installHighlight();
if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => uninstall());
}
