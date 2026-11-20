import { Eye, EyeOff } from "lucide-react";
import { setMathSourceHidden, useMathSourceHidden } from "./mathVisibility";

export function MathVisibilityToggle() {
  const hidden = useMathSourceHidden();
  const label = hidden ? "展开全部公式源码" : "隐藏全部公式源码";

  return (
    <button
      type="button"
      className="secondary-button math-visibility-toggle"
      title={label}
      aria-label={label}
      aria-pressed={hidden}
      onClick={() => setMathSourceHidden(!hidden)}
    >
      {hidden ? <Eye size={15} /> : <EyeOff size={15} />}
      {hidden ? "展开公式" : "隐藏公式"}
    </button>
  );
}
