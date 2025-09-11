import { useEffect, useMemo, useState } from "react";
import {
    Button, Flex, Grid, Heading, TextField, SelectField, Badge,
} from "@aws-amplify/ui-react";
import { useMonth } from "../MonthContext.jsx";

const card = { background:"#fff", border:"1px solid #e6e6e6", padding:"0.9rem 1rem", borderRadius:12 };

function toISOFromDateInput(d) {
    if (!d) return new Date().toISOString();
    if (d.includes("T")) return new Date(d).toISOString();
    const parts = d.split("-");
    const y = Number(parts[0]);
    const m = Number(parts[1]);
    const day = parts[2] ? Number(parts[2]) : 1;
    // snimi kao UTC midnight (stabilno)
    return new Date(Date.UTC(y, m - 1, day, 0, 0, 0)).toISOString();
}
function toDateInputValue(iso) {
    if (!iso) return "";
    try { return new Date(iso).toISOString().slice(0,10); } catch { return ""; }
}
const sortTx = (a, b) =>
    (b.date || "").localeCompare(a.date || "") ||
    (b.createdAt || "").localeCompare(a.createdAt || "");

// Lokalni mjesec iz ISO datuma (u tvojoj vremenskoj zoni)
function ymLocal(iso) {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
}

export default function TransactionsPanel({ client, categories = [] }) {
    const { month, setMonth } = useMonth();
    const [txs, setTxs] = useState([]);

    // forma + edit stanje
    const [form, setForm] = useState({
        amount: "", type: "", description: "", date: "", categoryId: "",
    });
    const [editingId, setEditingId] = useState(null);

    // lokalni filteri (unutar već izabranog mjeseca)
    const [typeFilter, setTypeFilter] = useState("");
    const [catFilter,  setCatFilter]  = useState("");

    // Učitaj sve i filtriraj po lokalnom mjesecu -> nema više “between” UTC zamki
    useEffect(() => {
        (async () => {
            const { data, errors } = await client.models.Transaction.list({ limit: 1000 });
            if (errors?.length) throw new Error(errors.map(e => e.message).join(", "));
            const all = (data || []);
            const forMonth = all.filter(t => t?.date && ymLocal(t.date) === month);
            setTxs(forMonth.sort(sortTx));
        })().catch(console.error);
    }, [client, month]);

    function startEdit(t) {
        setEditingId(t.id);
        setForm({
            amount: String(t.amount ?? ""),
            type: t.type ?? "",
            description: t.description ?? "",
            date: toDateInputValue(t.date),
            categoryId: t.categoryId ?? "",
        });
        const el = document.getElementById("tx-form");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    function cancelEdit() {
        setEditingId(null);
        setForm({ amount:"", type:"", description:"", date:"", categoryId:"" });
    }

    async function onSubmit(e) {
        e.preventDefault();
        const payload = {
            amount: parseFloat(form.amount),
            type: form.type,
            description: form.description || undefined,
            date: toISOFromDateInput(form.date || `${month}-01`), // UTC midnight
            categoryId: form.categoryId || undefined,
        };

        if (!editingId) {
            const { data, errors } = await client.models.Transaction.create(payload);
            if (errors?.length) throw new Error(errors.map(x => x.message).join(", "));
            // ubaci samo ako je lokalni mjesec isti
            if (data?.date && ymLocal(data.date) === month) {
                setTxs(curr => [data, ...curr].sort(sortTx));
            }
            setForm({ amount:"", type:"", description:"", date:"", categoryId:"" });
        } else {
            const { data, errors } = await client.models.Transaction.update({ id: editingId, ...payload });
            if (errors?.length) throw new Error(errors.map(x => x.message).join(", "));
            setTxs(curr => {
                const next = curr.map(t => (t.id === editingId ? data : t));
                // Ako promjenom datuma ode u drugi mjesec — izbaci iz liste
                return next.filter(t => t?.date && ymLocal(t.date) === month).sort(sortTx);
            });
            setEditingId(null);
            setForm({ amount:"", type:"", description:"", date:"", categoryId:"" });
        }
    }

    async function onDelete(id) {
        if (!confirm("Delete this transaction?")) return;
        const { errors } = await client.models.Transaction.delete({ id });
        if (errors?.length) throw new Error(errors.map(x => x.message).join(", "));
        setTxs(curr => curr.filter(t => t.id !== id));
    }

    // sekundarni filteri (tip/kategorija)
    const filtered = useMemo(() => {
        return txs.filter(t => {
            if (typeFilter && (t.type || "") !== typeFilter) return false;
            if (catFilter && (t.categoryId || "") !== catFilter) return false;
            return true;
        });
    }, [txs, typeFilter, catFilter]);

    // KPI
    const kpi = useMemo(() => {
        let income = 0, expense = 0;
        for (const t of filtered) {
            const amt = Number(t.amount) || 0;
            const tt  = (t.type || "").toLowerCase();
            if (tt === "income") income += amt;
            if (tt === "expense") expense += amt;
        }
        return { income, expense, balance: income - expense };
    }, [filtered]);

    return (
        <Flex direction="column" gap="1rem" style={{ width: "100%" }}>
            {/* MJESEC + KPI */}
            <Grid gap="1rem" templateColumns="repeat(auto-fit, minmax(220px, 1fr))">
                <Flex direction="column" gap="0.5rem" style={card}>
                    <Heading level={5}>Mjesec</Heading>
                    <TextField type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
                </Flex>

                <Flex direction="column" gap="0.25rem" style={card}>
                    <Heading level={5}>Prihodi za ovaj mjesec</Heading>
                    <Heading level={3}>€{kpi.income.toFixed(2)}</Heading>
                </Flex>

                <Flex direction="column" gap="0.25rem" style={card}>
                    <Heading level={5}>Troškovi za ovaj mjesec</Heading>
                    <Heading level={3}>€{kpi.expense.toFixed(2)}</Heading>
                </Flex>

                <Flex direction="column" gap="0.25rem" style={card}>
                    <Heading level={5}>Balans</Heading>
                    <Heading level={3} style={{ color: kpi.balance >= 0 ? "var(--amplify-colors-green-60)" : "crimson" }}>
                        €{kpi.balance.toFixed(2)}
                    </Heading>
                </Flex>
            </Grid>

            {/* LOKALNI FILTERI */}
            <Flex gap="0.75rem" wrap="wrap" style={card} alignItems="flex-end">
                <SelectField label="Tip" value={typeFilter} onChange={(e)=>setTypeFilter(e.target.value)}>
                    <option value="">—  —</option>
                    <option value="income">Prihodi</option>
                    <option value="expense">Troškovi</option>
                </SelectField>

                <SelectField label="Kategorija" value={catFilter} onChange={(e)=>setCatFilter(e.target.value)}>
                    <option value="">—  —</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </SelectField>

                {(typeFilter || catFilter) && (
                    <Button variation="link" onClick={()=>{ setTypeFilter(""); setCatFilter(""); }}>
                        Ukloni filtere
                    </Button>
                )}
            </Flex>

            {/* FORMA CREATE/EDIT */}
            <form id="tx-form" onSubmit={onSubmit} style={{ width: "100%", margin: "0.5rem 0 1rem" }}>
                <Flex gap="0.75rem" wrap="wrap" alignItems="flex-end" style={card}>
                    <TextField
                        label="Iznos (€)"
                        type="number"
                        step="0.01"
                        value={form.amount}
                        onChange={(e) => setForm({ ...form, amount: e.target.value })}
                        required
                    />

                    <SelectField
                        label="Tip"
                        value={form.type}
                        onChange={(e) => setForm({ ...form, type: e.target.value })}
                        required
                    >
                        <option value="">—  —</option>
                        <option value="income">Prihodi</option>
                        <option value="expense">Troškovi</option>
                    </SelectField>

                    <TextField
                        label="Opis"
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                    />

                    {/* Ako želiš ručno unijeti tačan dan u mjesecu, odkomentariši:
          <TextField
            label="Date"
            type="date"
            value={form.date}
            onChange={(e)=>setForm({ ...form, date: e.target.value })}
          />
          */}

                    <SelectField
                        label="Kategorija"
                        value={form.categoryId}
                        onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                    >
                        <option value="">—  —</option>
                        {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name}
                            </option>
                        ))}
                    </SelectField>

                    <Button type="submit">
                        {editingId ? "Sačuvaj" : "Dodaj transakciju"}
                    </Button>
                    {editingId && (
                        <Button type="button" variation="link" onClick={cancelEdit}>
                            Otkaži
                        </Button>
                    )}
                </Flex>
            </form>

            {/* LISTA */}
            <Grid gap="0.75rem" autoFlow="row" width="100%">
                {filtered.length === 0 ? (
                    <Flex style={card}><p>Nema dodatnih transakcija za ovaj mjesec</p></Flex>
                ) : (
                    filtered.map((t) => {
                        const cat = t.categoryId ? categories.find((c) => c.id === t.categoryId) : null;
                        const tt  = (t.type || "").toLowerCase();
                        return (
                            <Flex
                                key={t.id}
                                style={card}
                                alignItems="center"
                                justifyContent="space-between"
                                gap="0.75rem"
                            >
                                <div>
                                    <Heading level={5} style={{ margin: 0 }}>
                                        {tt === "income" ? "Prihodi" : tt === "expense" ? "Troškovi" : tt} — €{Number(t.amount).toFixed(2)}
                                    </Heading>
                                    <div style={{ opacity: 0.8, fontSize: 14 }}>
                                        {t.date ? new Date(t.date).toLocaleString() : ""}
                                        {cat ? ` · ${cat.name}` : ""}
                                        {t.description ? ` · ${t.description}` : ""}
                                    </div>
                                </div>

                                <Flex gap="0.5rem" alignItems="center">
                                    <Badge size="small" variation={tt === "income" ? "success" : "warning"}>
                                        {tt === "income" ? "Prihodi" : "Troškovi"}
                                    </Badge>
                                    <Button size="small" onClick={() => startEdit(t)}>Izmijeni</Button>
                                    <Button size="small" variation="destructive" onClick={() => onDelete(t.id)}>
                                        Izbriši
                                    </Button>
                                </Flex>
                            </Flex>
                        );
                    })
                )}
            </Grid>
        </Flex>
    );
}
