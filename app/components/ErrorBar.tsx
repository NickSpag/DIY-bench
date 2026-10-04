// Shown only when the current model failed to evaluate: the message, the line that threw,
// and a reminder that every view still shows the last good model.
import { useWb } from "../store.ts";
import { vscodeLink } from "../srcmap.ts";

export function ErrorBar() {
  const error = useWb((s) => s.error);
  const hasModel = useWb((s) => s.resolved !== null);
  if (!error) return null;
  const where = error.src ? `${error.src.file.split("/").pop()}:${error.src.line}` : null;
  const link = error.src ? vscodeLink(error.src) : null;
  return (
    <div className="errorbar" role="alert" data-testid="error-bar">
      <span className="tag">Model error</span>
      <span className="msg">{error.message}</span>
      {where && (link ? <a className="where" href={link} title={`${error.src?.file}:${error.src?.line}:${error.src?.col}`}>{where}</a> : <span className="where">{where}</span>)}
      {hasModel && <span className="last">showing last good model</span>}
    </div>
  );
}
