import { createContext, useContext, useMemo, useState } from "react";

const Ctx = createContext({
    savingSnapshot: null,
    setSavingSnapshot: () => {},
});

export function SavingsSnapshotProvider({ children }) {
    const [savingSnapshot, setSavingSnapshot] = useState(null);
    const value = useMemo(() => ({ savingSnapshot, setSavingSnapshot }), [savingSnapshot]);
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSavingsSnapshot() {
    return useContext(Ctx);
}
