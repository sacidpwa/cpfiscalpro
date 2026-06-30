import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const KEY = "contamx.currentOrg";

export type CurrentOrg = {
  id: string;
  rfc: string;
  razon_social: string;
  role: string;
  regimen_fiscal: string | null;
} | null;

type Ctx = {
  current: CurrentOrg;
  setCurrent: (o: CurrentOrg) => void;
  organizations: Array<NonNullable<CurrentOrg>>;
  refresh: () => void;
};

const OrgContext = createContext<Ctx | null>(null);

export function OrgProvider({
  children,
  initial,
  refresh,
}: {
  children: ReactNode;
  initial: Array<NonNullable<CurrentOrg>>;
  refresh: () => void;
}) {
  const [current, setCurrent] = useState<CurrentOrg>(() => {
    if (!initial.length) return null;
    const stored = typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
    const match = stored ? initial.find((o) => o.id === stored) : null;
    return match ?? initial[0];
  });

  useEffect(() => {
    if (!initial.length) {
      setCurrent(null);
      return;
    }
    setCurrent((prev) => {
      if (prev && initial.find((o) => o.id === prev.id)) return prev;
      const stored = typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
      const match = stored ? initial.find((o) => o.id === stored) : null;
      return match ?? initial[0];
    });
  }, [initial]);

  const update = (o: CurrentOrg) => {
    setCurrent(o);
    if (typeof window !== "undefined") {
      if (o) localStorage.setItem(KEY, o.id);
      else localStorage.removeItem(KEY);
    }
  };

  return (
    <OrgContext.Provider value={{ current, setCurrent: update, organizations: initial, refresh }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrg must be used within OrgProvider");
  return ctx;
}

export function useRequireOrg() {
  const { current } = useOrg();
  if (!current) throw new Error("No hay organización seleccionada");
  return current;
}
