import { useEffect, useMemo, useState } from "react";
import { Flex, Grid, Heading, Text, Button, TextField } from "@aws-amplify/ui-react";
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from "recharts";
import { useMonth } from "../MonthContext.jsx";

const card = { background:"#fff", border:"1px solid #e6e6e6", padding:"0.9rem 1rem", borderRadius:12 };

// Lokalni YYYY-MM iz ISO datuma
function ymLocal(iso) {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
}

// Fallback provjere za Bills/Income (status po mjesecu)
const isPaidForMonth = (b, ym) =>
    (Array.isArray(b.paidMonths) && b.paidMonths.includes(ym)) ||
    (b.lastPaidMonth && b.lastPaidMonth === ym) ||
    (b.paidAt && new Date(b.paidAt).toISOString().slice(0,7) === ym);

const isReceivedForMonth = (i, ym) =>
    (Array.isArray(i.receivedMonths) && i.receivedMonths.includes(ym)) ||
    (i.lastReceivedMonth && i.lastReceivedMonth === ym) ||
    (i.receivedAt && new Date(i.receivedAt).toISOString().slice(0,7) === ym);

export default function DashboardPanel({ client, categories, exportPdf }) {
    const { month, setMonth } = useMonth();
    const [txs, setTxs] = useState([]);
    const [incomeSources, setIncomeSources] = useState([]);
    const [bills, setBills] = useState([]);

    useEffect(() => {
        (async () => {
            // 1) Transakcije: čitaj sve i filtriraj po lokalnom mjesecu
            const txRes = await client.models.Transaction.list({ limit: 1000 });
            const allTx = txRes.data || [];
            setTxs(allTx.filter(t => t?.date && ymLocal(t.date) === month));

            // 2) Income i Bills – standardno (aktivni), status se tumači po *month* poljima
            const incRes = await client.models.IncomeSource.list({ filter: { active: { ne: false } }, limit: 1000 });
            setIncomeSources((incRes.data || []).map(s => ({
                ...s,
                receivedMonths: Array.isArray(s.receivedMonths) ? s.receivedMonths : [],
            })));

            const billModel = client.models.Bill || client.models.Bills;
            if (billModel) {
                const bRes = await billModel.list({ filter: { active: { ne: false } }, limit: 1000 });
                setBills((bRes.data || []).map(b => ({
                    ...b,
                    paidMonths: Array.isArray(b.paidMonths) ? b.paidMonths : [],
                })));
            } else {
                setBills([]);
            }
        })().catch(console.error);
    }, [client, month]);

    // Izračuni (actual uključuje i TX income/expense)
    const summary = useMemo(() => {
        const incomeExpected = incomeSources.reduce((s, x) => s + (Number(x.amount) || 0), 0);
        const billsTotal     = bills.reduce((s, b) => s + (Number(b.amount) || 0), 0);

        const incomeReceivedRecurring = incomeSources.reduce(
            (s, x) => s + (isReceivedForMonth(x, month) ? (Number(x.amount) || 0) : 0),
            0
        );
        const txIncome = txs.reduce(
            (s, t) => s + ((t.type || "").toLowerCase() === "income" ? (Number(t.amount) || 0) : 0),
            0
        );
        const billsPaid = bills.reduce(
            (s, b) => s + (isPaidForMonth(b, month) ? (Number(b.amount) || 0) : 0),
            0
        );
        const txExpense = txs.reduce(
            (s, t) => s + ((t.type || "").toLowerCase() === "expense" ? (Number(t.amount) || 0) : 0),
            0
        );

        const incomeActual   = incomeReceivedRecurring + txIncome;
        const expensesActual = billsPaid + txExpense;

        return {
            incomeExpected,
            billsTotal,
            incomeReceivedRecurring,
            txIncome,
            incomeActual,
            billsPaid,
            txExpense,
            expensesActual,
            remainingIncome: Math.max(0, incomeExpected - incomeReceivedRecurring),
            remainingBills : Math.max(0, billsTotal - billsPaid),
            balance        : incomeActual - expensesActual,
        };
    }, [incomeSources, bills, txs, month]);

    const latestTx = useMemo(
        () => [...txs]
            .sort((a, b) =>
                (b.date || "").localeCompare(a.date || "") ||
                (b.createdAt || "").localeCompare(a.createdAt || "")
            )
            .slice(0, 5),
        [txs]
    );

    const unpaidBills = bills.filter((b) => !isPaidForMonth(b, month)).slice(0, 5);
    const unreceivedIncome = incomeSources.filter((i) => !isReceivedForMonth(i, month)).slice(0, 5);

    const chartData = [
        { name: "Prihodi",  Standard: summary.incomeExpected, Actual: summary.incomeActual },
        { name: "Rashodi", Standard: summary.billsTotal,     Actual: summary.expensesActual },
    ];
    function buildSnapshot() {
        return {
            month,
            kpi: {
                incomeExpected: summary.incomeExpected,
                incomeActual: summary.incomeActual,
                incomeReceivedRecurring: summary.incomeReceivedRecurring,
                txIncome: summary.txIncome,
                expensesActual: summary.expensesActual,
                billsPaid: summary.billsPaid,
                txExpense: summary.txExpense,
                remainingIncome: summary.remainingIncome,
                remainingBills: summary.remainingBills,
                balance: summary.balance,
            },
            latestTx: latestTx.map(t => ({
                date: t.date,
                type: t.type,
                amount: Number(t.amount) || 0,
                description: t.description || "",
            })),
            unpaidBills: unpaidBills.map(b => ({ name: b.name, amount: Number(b.amount) || 0 })),
            unreceivedIncome: unreceivedIncome.map(i => ({ name: i.name, amount: Number(i.amount) || 0 })),
        };
    }
    return (
        <Flex direction="column" gap="1rem" style={{ width: "100%" }}>
            <Flex justifyContent="space-between" alignItems="center" wrap="wrap" gap="0.75rem">
                <Flex direction="column" gap="0.5rem" style={card}>
                    <Heading level={5} style={{ margin: 0 }}>Mjesec</Heading>
                    <TextField type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
                </Flex>
                <Button onClick={() => exportPdf(buildSnapshot())}>Štampaj PDF</Button>
            </Flex>

            {/* KPI */}
            <Grid gap="1rem" templateColumns="repeat(auto-fit, minmax(240px, 1fr))">
                <Flex direction="column" gap="0.25rem" style={card}>
                    <Heading level={5}>Prihodi (očekivano)</Heading>
                    <Heading level={3}>€{summary.incomeExpected.toFixed(2)}</Heading>
                    <Text style={{ opacity: 0.75 }}>Preostalo: €{summary.remainingIncome.toFixed(2)}</Text>
                </Flex>
                <Flex direction="column" gap="0.25rem" style={card}>
                    <Heading level={5}>Uplaćeni prihodi</Heading>
                    <Heading level={3}>€{summary.incomeActual.toFixed(2)}</Heading>
                    <Text style={{ opacity: 0.75 }}>
                        Mjesečni prihod: €{summary.incomeReceivedRecurring.toFixed(2)} · Dadatni prihod: €{summary.txIncome.toFixed(2)}
                    </Text>
                </Flex>
                <Flex direction="column" gap="0.25rem" style={card}>
                    <Heading level={5}>Troškovi za trenutni mjesec</Heading>
                    <Heading level={3}>€{summary.expensesActual.toFixed(2)}</Heading>
                    <Text style={{ opacity: 0.75 }}>
                        Plaćeni računi: €{summary.billsPaid.toFixed(2)} · Ostali troškovi: €{summary.txExpense.toFixed(2)} · Neplaćeni računi: €
                        {summary.remainingBills.toFixed(2)}
                    </Text>
                </Flex>
                <Flex direction="column" gap="0.25rem" style={card}>
                    <Heading level={5}>Balans</Heading>
                    <Heading level={3} style={{ color: summary.balance >= 0 ? "var(--amplify-colors-green-60)" : "crimson" }}>
                        €{summary.balance.toFixed(2)}
                    </Heading>
                    <Text style={{ opacity: 0.75 }}></Text>
                </Flex>
            </Grid>

            {/* Grafikon */}
            <Flex direction="column" gap="0.5rem" style={card}>
                <Heading level={5} style={{ margin: 0 }}>Mjesečna potrošnja u odnosu na prosijek</Heading>
                <div style={{ width: "100%", height: 280 }}>
                    <ResponsiveContainer>
                        <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="Standard" fill="green" />
                            <Bar dataKey="Actual" fill="red" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </Flex>

            {/* Brzi pregledi */}
            <Grid gap="1rem" templateColumns="repeat(auto-fit, minmax(280px, 1fr))">
                <Flex direction="column" gap="0.5rem" style={card}>
                    <Heading level={5} style={{ margin: 0 }}>Neplaćeni računi</Heading>
                    {unpaidBills.length === 0 ? <Text>Nema neplaćenih računa za ovaj mjesec.</Text> : (
                        unpaidBills.map((b) => (
                            <Flex key={b.id} justifyContent="space-between">
                                <Text>{b.name}</Text><Text>€{Number(b.amount).toFixed(2)}</Text>
                            </Flex>
                        ))
                    )}
                </Flex>

                <Flex direction="column" gap="0.5rem" style={card}>
                    <Heading level={5} style={{ margin: 0 }}>Očekivani prihodi koji još uvijek nisu uplaćeni</Heading>
                    {unreceivedIncome.length === 0 ? <Text>Svi prihodi su uplaćeni.</Text> : (
                        unreceivedIncome.map((i) => (
                            <Flex key={i.id} justifyContent="space-between">
                                <Text>{i.name}</Text><Text>€{Number(i.amount).toFixed(2)}</Text>
                            </Flex>
                        ))
                    )}
                </Flex>

                <Flex direction="column" gap="0.5rem" style={card}>
                    <Heading level={5} style={{ margin: 0 }}>Vaše transakcije za ovaj mejsec:</Heading>
                    {latestTx.length === 0 ? <Text>Nema dodatnih transakcija ovog mjeseca.</Text> : (
                        latestTx.map((t) => {
                            const cat = t.categoryId ? categories.find((c) => c.id === t.categoryId) : null;
                            return (
                                <Flex key={t.id} justifyContent="space-between">
                                    <Text>
                                        {t.type === "income" ? "Prihodi" : t.type === "expense" ? "Rashodi" : (t.type || "")} {cat ? `· ${cat.name}` : ""} ·{" "}
                                        {t.date ? new Date(t.date).toLocaleDateString() : ""}
                                    </Text>
                                    <Text>€{Number(t.amount).toFixed(2)}</Text>
                                </Flex>
                            );
                        })
                    )}
                </Flex>
            </Grid>
        </Flex>
    );
}
