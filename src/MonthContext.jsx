import { createContext, useContext, useEffect, useMemo, useState } from "react";

const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
const now = new Date();
const defaultMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;

const MonthContext = createContext({ month: defaultMonth, setMonth: () => {} });

export function MonthProvider({ children }) {
    const [month, setMonth] = useState(
        () => localStorage.getItem("selectedMonth") || defaultMonth
    );

    useEffect(() => {
        if (typeof month === "string") {
            localStorage.setItem("selectedMonth", month);
        }
    }, [month]);

    const value = useMemo(() => ({ month, setMonth }), [month]);
    return <MonthContext.Provider value={value}>{children}</MonthContext.Provider>;
}

export function useMonth() {
    return useContext(MonthContext);
}
