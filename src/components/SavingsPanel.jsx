// src/components/SavingsPanel.jsx
import { useEffect, useMemo, useState } from "react";
import { Button, Flex, Grid, Heading, TextField } from "@aws-amplify/ui-react";
import { useMonth } from "../MonthContext";

const card = { background:"#fff", border:"1px solid #e6e6e6", padding:"1rem", borderRadius:12 };
const pad  = (n)=> (n<10?`0${n}`:`${n}`);
// helper: od niza {createdAt, updatedAt} uzmi najnoviji
const pickLatest = (arr=[]) => {
    return [...arr].sort((a,b) => {
        const ua = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const ub = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return ub - ua; // desc
    })[0];
};

// --- helpers (iste “YYYY-MM” pravilnosti kao na Dashboardu) ---
const ymLocal = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
};
const sum = (arr, f="amount") => (arr||[]).reduce((a,x)=> a + (Number(x?.[f])||0), 0);

// status za Bills/Income po mjesecu
const isPaidForMonth = (b, ym) =>
    (Array.isArray(b?.paidMonths) && b.paidMonths.includes(ym)) ||
    (b?.lastPaidMonth === ym) ||
    (b?.paidMonth === ym) ||
    (b?.paidAt && ymLocal(b.paidAt) === ym);

const isReceivedForMonth = (i, ym) =>
    (Array.isArray(i?.receivedMonths) && i.receivedMonths.includes(ym)) ||
    (i?.lastReceivedMonth === ym) ||
    (i?.receivedMonth === ym) ||
    (i?.receivedAt && ymLocal(i.receivedAt) === ym);

// jednostavan progress bar
const Progress = ({ value=0, max=0 }) => {
    const pct = max>0 ? Math.min(100, Math.round((value/max)*100)) : 0;
    return (
        <div style={{width:"100%", height:8, background:"#eee", borderRadius:999}}>
            <div style={{width:`${pct}%`, height:8, borderRadius:999, background:"#10b981"}}/>
        </div>
    );
};

// mini kolone: siva target, zelena actual (12 mjeseci tekuće godine)
// sićušni kolumnarni “chart” bez libova (12 mjeseci)
// mini kolone (12 mjeseci) – SVG varijanta, pouzdano radi u svim browserima
function MiniBars({ months, actual, target }) {
    const a = (actual || []).map(v => Number(v ?? 0));
    const t = (target || []).map(v => Number(v ?? 0));
    const absA = a.map(v => Math.abs(v));
    const maxV = Math.max(1, ...absA, ...t);

    const allZero = absA.every(v => v === 0) && t.every(v => v === 0);
    if (allZero) {
        return (
            <div style={{ padding: "0.5rem 0", color: "#6b7280", fontSize: 12 }}>
                No data yet for this year.
            </div>
        );
    }

    // layout
    const H = 150;            // ukupna visina crteža
    const padX = 10;          // lijevi/ desni padding
    const gap = 8;            // razmak između mjeseci
    const wTarget = 20;       // širina target stubića (sivi)
    const wActual = 12;       // širina actual stubića (zeleni/crveni)
    const labelH = 12;        // prostor za labelu mjeseca na dnu
    const barMaxH = H - labelH - 8; // kolika je maksimalna visina stubića

    const totalWidth = padX * 2 + months.length * (wTarget + gap);

    return (
        <svg viewBox={`0 0 ${totalWidth} ${H}`} width="100%" height={H}>
            {months.map((m, i) => {
                const x = padX + i * (wTarget + gap);

                const tVal = t[i] ?? 0;
                const aVal = a[i] ?? 0;

                const hT = Math.min(barMaxH, (Math.abs(tVal) / maxV) * barMaxH);
                const hA = Math.min(barMaxH, (Math.abs(aVal) / maxV) * barMaxH);

                const yT = H - labelH - hT;
                const yA = H - labelH - hA;

                const color = aVal >= 0 ? "#22c55e" : "#ef4444"; // green / red

                return (
                    <g key={m}>
                        {/* target (sivo) */}
                        <rect x={x} y={yT} width={wTarget} height={hT} fill="#e5e7eb" rx="3" />
                        {/* actual (preko, uže) */}
                        <rect x={x + (wTarget - wActual) / 2} y={yA} width={wActual} height={hA} fill={color} rx="3" />
                        {/* label mjeseca */}
                        <text
                            x={x + wTarget / 2}
                            y={H - 2}
                            fontSize="10"
                            fill="#6b7280"
                            textAnchor="middle"
                        >
                            {m.slice(5)}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}

export default function SavingsPanel({ client }) {
    const { month, setMonth } = useMonth();

    // podaci
    const [txAll, setTxAll]       = useState([]);   // sve transakcije (filtriramo lokalno po YYYY-MM)
    const [bills, setBills]       = useState([]);
    const [incomes, setIncomes]   = useState([]);

    // ciljevi štednje
    const [configId, setConfigId] = useState(null);
    const [targets, setTargets]   = useState({ monthly: "100", yearly: "" });

    // učitaj ciljeve
// učitaj ciljeve (GLOBALNO po korisniku; nevezano za mjesec)
    useEffect(()=>{(async()=>{
        try {
            if (!client?.models?.SavingsConfig) return;
            // Uzmemo više pa izaberemo najnoviji
            const { data } = await client.models.SavingsConfig.list({ limit: 100 });
            const latest = pickLatest(data || []);
            if (latest) {
                setConfigId(latest.id);
                setTargets({
                    monthly: String(latest.monthlyTarget ?? "0"),
                    yearly : latest.yearlyTarget != null ? String(latest.yearlyTarget) : "",
                });
            } else {
                // nema zapisa za ovog korisnika – ostavi podrazumijevano
                setConfigId(null);
            }
        } catch(e){ console.error(e); }
    })()}, [client]);

    async function saveTargets(e){
        e?.preventDefault?.();
        if (!client?.models?.SavingsConfig) {
            alert("Add model SavingsConfig (monthlyTarget, yearlyTarget) and run `amplify push`.");
            return;
        }

        const payload = {
            monthlyTarget: parseFloat(targets.monthly) || 0,
            yearlyTarget : targets.yearly !== "" ? parseFloat(targets.yearly) : undefined,
        };

        try {
            if (configId) {
                // imamo id – samo update
                const { data } = await client.models.SavingsConfig.update({ id: configId, ...payload });
                setConfigId(data.id); // osiguraj da ostane
            } else {
                // možda već postoji (npr. ako je state resetovan) – pokušaj uzeti najnoviji i update,
                // u suprotnom kreiraj novi
                const listRes = await client.models.SavingsConfig.list({ limit: 100 });
                const latest = pickLatest(listRes.data || []);
                if (latest) {
                    const { data } = await client.models.SavingsConfig.update({ id: latest.id, ...payload });
                    setConfigId(data.id);
                } else {
                    const { data } = await client.models.SavingsConfig.create(payload);
                    setConfigId(data.id);
                }
            }
        } catch (err) {
            console.error("Save targets failed:", err);
            alert("Save targets failed");
        }
    }

    // učitaj SVE, pa lokalno filtriraj po YYYY-MM (isto kao Dashboard)
    useEffect(()=>{(async()=>{
        // Transactions: sve
        const txRes = await client.models.Transaction.list({ limit: 1000 });
        setTxAll(txRes.data || []);

        // Bills: sve (status plaćanja čuvamo po mjesecu)
        const billModel = client.models.Bill || client.models.Bills;
        if (billModel) {
            const { data } = await billModel.list({ filter: { active: { ne: false } }, limit: 1000 });
            setBills((data||[]).map(b => ({
                ...b,
                paidMonths: Array.isArray(b.paidMonths) ? b.paidMonths : [],
            })));
        } else {
            setBills([]);
        }

        // IncomeSource: aktivni (markiranje po mjesecu)
        const incRes = await client.models.IncomeSource.list({ filter: { active: { ne: false } }, limit: 1000 });
        setIncomes((incRes.data||[]).map(i => ({
            ...i,
            receivedMonths: Array.isArray(i.receivedMonths) ? i.receivedMonths : [],
        })));
    })().catch(console.error);}, [client, month]); // refresh pri promjeni mjeseca (npr. da badge-i budu aktuelni)

    // KPI + serije — sve izvedeno iz istih pravila kao Dashboard
    const calc = useMemo(()=>{
        // transakcije samo za izabrani mjesec
        const tx = txAll.filter(t => t?.date && ymLocal(t.date) === month);
        const txIncome  = sum(tx.filter(t => (t.type||"").toLowerCase()==="income"));
        const txExpense = sum(tx.filter(t => (t.type||"").toLowerCase()==="expense"));

        // income “standard” i markirani kao primljeni za izabrani mjesec
        const expectedIncome = incomes.reduce((a,i)=> a + (Number(i.amount)||0), 0);
        const incomeMarked   = incomes.reduce((a,i)=> a + (isReceivedForMonth(i, month) ? (Number(i.amount)||0) : 0), 0);

        // bills: total (standard) i plaćeni u izabranom mjesecu
        const billsTotal = sum(bills);
        const paidBills  = bills.reduce((a,b)=> a + (isPaidForMonth(b, month) ? (Number(b.amount)||0) : 0), 0);
        const remainingBills = Math.max(0, billsTotal - paidBills);

        // štednja u izabranom mjesecu
        const incomeReceivedThisMonth = incomeMarked + txIncome;
        const savingsThisMonth = incomeReceivedThisMonth - (paidBills + txExpense);

        // YTD serije (po mjesecima tekuće godine, iz istog izvora)
        const year   = Number(month.slice(0,4));
        const months = Array.from({length:12},(_,i)=>`${year}-${pad(i+1)}`);

        const seriesActual = months.map(m=>{
            const txM = txAll.filter(t => t?.date && ymLocal(t.date) === m);
            const incTx = sum(txM.filter(t=> (t.type||"").toLowerCase()==="income"));
            const expTx = sum(txM.filter(t=> (t.type||"").toLowerCase()==="expense"));
            const incMarkedM = incomes.reduce((a,i)=> a + (isReceivedForMonth(i, m) ? (Number(i.amount)||0) : 0), 0);
            const paidM = bills.reduce((a,b)=> a + (isPaidForMonth(b, m) ? (Number(b.amount)||0) : 0), 0);
            return incMarkedM + incTx - (paidM + expTx);
        });

        const idx       = Number(month.slice(5,7)) - 1;
        const ytdActual = seriesActual.slice(0, idx+1).reduce((a,v)=>a+v, 0);

        const monthlyTarget = Number(targets.monthly) || 0;
        const targetYTD     = targets.yearly ? Number(targets.yearly) : monthlyTarget * (idx+1);

        return {
            expectedIncome, incomeMarked, txIncome, txExpense,
            billsTotal, paidBills, remainingBills,
            incomeReceivedThisMonth, savingsThisMonth,
            months, seriesActual, seriesTarget: months.map(()=>monthlyTarget),
            ytdActual, targetYTD
        };
    }, [txAll, incomes, bills, month, targets]);

    return (
        <Flex direction="column" gap="1rem" style={{width:"100%"}}>
            {/* KPI */}
            <Grid gap="1rem" templateColumns="repeat(auto-fit, minmax(220px, 1fr))">
                <Flex direction="column" gap="0.5rem" style={card}>
                    <Heading level={5}>Mjesec</Heading>
                    <TextField type="month" value={month} onChange={(e)=>setMonth(e.target.value)} />
                </Flex>

                <Flex direction="column" gap="0.25rem" style={card}>
                    <Heading level={5}>Mjesečni cilj</Heading>
                    <Heading level={3}>€{Number(targets.monthly||0).toFixed(2)}</Heading>
                </Flex>

                <Flex direction="column" gap="0.25rem" style={card}>
                    <Heading level={5}>Ušteda za ovaj mjesec</Heading>
                    <Heading level={3} style={{color: calc.savingsThisMonth>=0? "#059669":"#dc2626"}}>
                        €{Number(calc.savingsThisMonth||0).toFixed(2)}
                    </Heading>
                    <div style={{fontSize:12, opacity:.7}}>
                        Received €{(calc.incomeMarked + calc.txIncome).toFixed(2)}
                        {" "}− (Bills €{calc.paidBills.toFixed(2)} + Other €{calc.txExpense.toFixed(2)})
                    </div>
                </Flex>

                <Flex direction="column" gap="0.25rem" style={card}>
                    <Heading level={5}>Dosadašnja ušteda/Godišnji cilj</Heading>
                    <Heading level={3}>€{calc.ytdActual.toFixed(2)} / €{(calc.targetYTD||0).toFixed(2)}</Heading>
                    <Progress value={calc.ytdActual} max={calc.targetYTD||1}/>
                </Flex>
            </Grid>

            {/* Godišnji pregled (target vs actual) */}
            <Flex direction="column" gap="0.5rem" style={card}>
                <Heading level={5} style={{margin:0}}>Godišnji pregled</Heading>
                <MiniBars months={calc.months} actual={calc.seriesActual} target={calc.seriesTarget}/>
            </Flex>

            {/* Podešavanje ciljeva */}
            <form onSubmit={saveTargets} style={{width:"100%"}}>
                <Flex gap="0.75rem" wrap="wrap" alignItems="flex-end" style={card}>
                    <TextField
                        label="Mjesečni cilj (€)"
                        type="number" step="0.01"
                        value={targets.monthly}
                        onChange={(e)=>setTargets({...targets, monthly:e.target.value})}
                    />
                    <TextField
                        label="Godišnji cilj (€)"
                        type="number" step="0.01"
                        value={targets.yearly}
                        onChange={(e)=>setTargets({...targets, yearly:e.target.value})}
                    />
                    <Button type="submit">Sačuvaj</Button>
                </Flex>
            </form>
        </Flex>
    );
}
