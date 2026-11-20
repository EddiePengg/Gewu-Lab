import { useEffect, useState } from "react";

const STORAGE_KEY = "gewu-math-source-hidden";
const CHANGE_EVENT = "gewu:math-visibility-change";

export function useMathSourceHidden() {
  const [hidden, setHidden] = useState(() => localStorage.getItem(STORAGE_KEY) !== "false");

  useEffect(() => {
    const handleChange = (event: Event) => setHidden((event as CustomEvent<boolean>).detail);
    window.addEventListener(CHANGE_EVENT, handleChange);
    return () => window.removeEventListener(CHANGE_EVENT, handleChange);
  }, []);

  return hidden;
}

export function setMathSourceHidden(hidden: boolean) {
  localStorage.setItem(STORAGE_KEY, String(hidden));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: hidden }));
}
