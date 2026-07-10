import { useEffect, useState, useCallback } from "react";

const KEY = "scramble-mode";
const EVT = "scramble-mode-change";

function read(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY) === "1";
}

export function useScramble() {
  const [enabled, setEnabled] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setEnabled(read());
    setMounted(true);
    const onChange = () => setEnabled(read());
    window.addEventListener(EVT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const setScramble = useCallback((v: boolean) => {
    window.localStorage.setItem(KEY, v ? "1" : "0");
    window.dispatchEvent(new Event(EVT));
    setEnabled(v);
  }, []);

  // Deterministic pseudo-random from string (so same input → same fake)
  const hash = (s: string) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  };

  const FIRST = ["Alex", "Jordan", "Casey", "Morgan", "Taylor", "Riley", "Sam", "Jamie", "Drew", "Quinn", "Avery", "Cameron"];
  const LAST = ["Smith", "Johnson", "Lee", "Brown", "Davis", "Wilson", "Clark", "Lewis", "Walker", "Hall", "Young", "King"];
  const STREETS = ["Oak", "Maple", "Cedar", "Pine", "Elm", "Birch", "Willow", "Ash", "Spruce", "Hazel"];
  const TYPES = ["St", "Ave", "Rd", "Ln", "Dr", "Way"];
  const CITIES = ["Springfield", "Riverton", "Fairview", "Kingston", "Ashford", "Bristol", "Clifton", "Milton"];

  const scrambleFirst = useCallback((s?: string | null) => {
    if (!enabled || !s) return s ?? "";
    return FIRST[hash("f" + s) % FIRST.length];
  }, [enabled]);

  const scrambleLast = useCallback((s?: string | null) => {
    if (!enabled || !s) return s ?? "";
    return LAST[hash("l" + s) % LAST.length];
  }, [enabled]);

  const scrambleAddress = useCallback((s?: string | null) => {
    if (!enabled || !s) return s ?? "";
    const h = hash("a" + s);
    const num = (h % 9000) + 100;
    return `${num} ${STREETS[h % STREETS.length]} ${TYPES[(h >> 3) % TYPES.length]}`;
  }, [enabled]);

  const scrambleCity = useCallback((s?: string | null) => {
    if (!enabled || !s) return s ?? "";
    return CITIES[hash("c" + s) % CITIES.length];
  }, [enabled]);

  const scrambleText = useCallback((s?: string | null) => {
    if (!enabled || !s) return s ?? "";
    return s.replace(/[a-zA-Z]/g, "x");
  }, [enabled]);

  const scramblePhone = useCallback((s?: string | null) => {
    if (!enabled || !s) return s ?? "";
    const h = hash("p" + s);
    const d = String(h).padStart(8, "0").slice(0, 8);
    return `04${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)}`;
  }, [enabled]);

  const scrambleEmail = useCallback((s?: string | null) => {
    if (!enabled || !s) return s ?? "";
    const h = hash("e" + s);
    const first = FIRST[h % FIRST.length].toLowerCase();
    const last = LAST[(h >> 3) % LAST.length].toLowerCase();
    return `${first}.${last}@example.com`;
  }, [enabled]);

  return {
    enabled,
    mounted,
    setScramble,
    scrambleFirst,
    scrambleLast,
    scrambleAddress,
    scrambleCity,
    scrambleText,
    scramblePhone,
    scrambleEmail,
  };
}
