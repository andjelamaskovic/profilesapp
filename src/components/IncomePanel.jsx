import { useEffect, useMemo, useState } from "react";
import {
    Button, Flex, Grid, Heading, SelectField, TextField, Badge,
} from "@aws-amplify/ui-react";
import { useMonth } from "../MonthContext.jsx";

const card = { background:"#fff", border:"1px solid #e6e6e6", padding:"0.9rem 1rem", borderRadius:12 };
const pad  = (n) => (n < 10 ? `0${n}` : `${n}`);
const now  = new Date();
const currentMonth = `${now.getFullYear()}-${pad(now.getMonth()+1)}`;

// helper: status za izabrani mjesec (podržava i novi niz i stara polja)
const isReceivedForMonth = (x, ym) =>
    (Array.isArray(x.receivedMonths) && x.receivedMonths.includes(ym)) ||
    (x.lastReceivedMonth && x.lastReceivedMonth === ym) ||
    (x.receivedAt && new Date(x.receivedAt).toISOString().slice(0,7) === ym);

export default function IncomePanel({ categories = [], client }) {
    const { month, setMonth } = useMonth();
    const [items, setItems] = useState([]);
    const [form, setForm] = useState({ name:"", amount:"", payDay:"", categoryId:"" });
    const [editingId, setEditingId] = useState(null);

    useEffect(() => { loadAll().catch(console.error); }, []);
    async function loadAll() {
        const { data, errors } = await client.models.IncomeSource.list({
            filter: { active: { ne: false } }, limit: 1000
        });
        if (errors?.length) throw new Error(errors.map(e=>e.message).join(", "));
        const norm = (data||[]).map(x => ({
            ...x,
            receivedMonths: Array.isArray(x.receivedMonths) ? x.receivedMonths : [],
        }));
        setItems(norm.sort((a,b)=> (a.payDay||0)-(b.payDay||0)));
    }

    function startEdit(x) {
        setEditingId(x.id);
        setForm({
            name: x.name ?? "",
            amount: String(x.amount ?? ""),
            payDay: String(x.payDay ?? ""),
            categoryId: x.categoryId || "",
        });
    }
    function cancelEdit() {
        setEditingId(null);
        setForm({ name:"", amount:"", payDay:"", categoryId:"" });
    }

    async function save(e) {
        e.preventDefault();
        const payload = {
            name: form.name.trim(),
            amount: parseFloat(form.amount),
            payDay: parseInt(form.payDay, 10),
            categoryId: form.categoryId || undefined,
            active: true,
        };

        if (!editingId) {
            // novi model: inicijalno prazno
            const { data, errors } = await client.models.IncomeSource.create({
                ...payload, receivedMonths: []
            });
            if (errors?.length) throw new Error(errors.map(e=>e.message).join(", "));
            setItems(curr => [data, ...curr].sort((a,b)=>(a.payDay||0)-(b.payDay||0)));
        } else {
            const { data, errors } = await client.models.IncomeSource.update({ id: editingId, ...payload });
            if (errors?.length) throw new Error(errors.map(e=>e.message).join(", "));
            setItems(curr => curr.map(x => x.id === editingId ? data : x).sort((a,b)=>(a.payDay||0)-(b.payDay||0)));
            setEditingId(null);
        }
        setForm({ name:"", amount:"", payDay:"", categoryId:"" });
    }

    async function remove(id) {
        if (!confirm("Delete this income source?")) return;
        const { errors } = await client.models.IncomeSource.delete({ id });
        if (errors?.length) throw new Error(errors.map(e=>e.message).join(", "));
        setItems(curr=>curr.filter(x=>x.id!==id));
    }

    async function toggleReceived(x) {
        // model sa nizom mjeseci (preferirano)
        if (Array.isArray(x.receivedMonths)) {
            const exists = x.receivedMonths.includes(month);
            const next = exists ? x.receivedMonths.filter(m => m !== month) : [...x.receivedMonths, month];
            const { data, errors } = await client.models.IncomeSource.update({ id: x.id, receivedMonths: next });
            if (errors?.length) throw new Error(errors.map(e=>e.message).join(", "));
            setItems(curr => curr.map(i => i.id === x.id ? data : i));
            return;
        }
        // fallback: staro polje
        const newVal = (x.lastReceivedMonth === month) ? undefined : month;
        const { data, errors } = await client.models.IncomeSource.update({ id: x.id, lastReceivedMonth: newVal });
        if (errors?.length) throw new Error(errors.map(e=>e.message).join(", "));
        setItems(curr => curr.map(i => i.id === x.id ? data : i));
    }

    // SUMA za izabrani mjesec (expected vs received)
    const summary = useMemo(() => {
        let total = 0, received = 0;
        for (const x of items) {
            if (!x.active) continue;
            const amt = Number(x.amount) || 0;
            total += amt;
            if (isReceivedForMonth(x, month)) received += amt;
        }
        return { total, received, remaining: total - received };
    }, [items, month]);

    return (
        <Flex direction="column" gap="1rem" style={{ width:"100%" }}>
            <Grid gap="1rem" templateColumns="repeat(auto-fit, minmax(220px, 1fr))">
                <Flex direction="column" gap="0.5rem" style={card}>
                    <Heading level={5}>Mjesec</Heading>
                    <TextField type="month" value={month} onChange={(e)=>setMonth(e.target.value)} />
                </Flex>
                <Flex direction="column" gap="0.25rem" style={card}>
                    <Heading level={5}>Očekivano</Heading>
                    <Heading level={3}>€{summary.total.toFixed(2)}</Heading>
                </Flex>
                <Flex direction="column" gap="0.25rem" style={card}>
                    <Heading level={5}>Primljeno</Heading>
                    <Heading level={3}>€{summary.received.toFixed(2)}</Heading>
                </Flex>
                <Flex direction="column" gap="0.25rem" style={card}>
                    <Heading level={5}>Preostalo za isplatu</Heading>
                    <Heading level={3}>€{summary.remaining.toFixed(2)}</Heading>
                </Flex>
            </Grid>

            {/* Forma */}
            <form onSubmit={save} style={{ width:"100%", margin:"0.5rem 0 1rem" }}>
                <Flex gap="0.75rem" wrap="wrap" alignItems="flex-end">
                    <TextField label="Naziv" value={form.name} onChange={(e)=>setForm({...form, name:e.target.value})} required />
                    <TextField label="Iznos (€)" type="number" step="0.01" value={form.amount} onChange={(e)=>setForm({...form, amount:e.target.value})} required />
                    <TextField label="Očekivani dan isplate(1-28)" type="number" min={1} max={28} value={form.payDay} onChange={(e)=>setForm({...form, payDay:e.target.value})} required />
                    <SelectField label="Kategorija" value={form.categoryId} onChange={(e)=>setForm({...form, categoryId:e.target.value})}>
                        <option value="">—  —</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </SelectField>
                    <Button type="submit">{editingId ? "Sačuvaj" : "Dodaj"}</Button>
                    {editingId && <Button type="button" variation="link" onClick={cancelEdit}>Cancel</Button>}
                </Flex>
            </form>

            {/* Lista */}
            <Grid gap="0.75rem" autoFlow="row" width="100%">
                {items.length === 0 ? (
                    <Flex style={card}><p>Nema očekivanih prihoda.Dodaj novi prihod.</p></Flex>
                ) : items.map((x)=> {
                    const cat = x.categoryId ? categories.find(c=>c.id===x.categoryId) : null;
                    const received = isReceivedForMonth(x, month);
                    return (
                        <Flex key={x.id} style={card} alignItems="center" justifyContent="space-between" gap="0.75rem">
                            <div>
                                <Heading level={5} style={{margin:0}}>{x.name} — €{Number(x.amount).toFixed(2)}</Heading>
                                <div style={{opacity:0.8, fontSize:14}}>
                                    Pay day: {x.payDay}. | {cat ? `Category: ${cat.name}` : "No category"}
                                </div>
                            </div>
                            <Flex gap="0.5rem" alignItems="center">
                                <Badge size="small" variation={received ? "success" : "warning"}>
                                    {received ? "Received" : "Not received"}
                                </Badge>
                                <Button size="small" onClick={()=>toggleReceived(x)}>
                                    {received ? "Poništi" : "Označi kao primljeno"}
                                </Button>
                                <Button size="small" onClick={()=>startEdit(x)}>Izmijeni</Button>
                                <Button size="small" variation="destructive" onClick={()=>remove(x.id)}>Izbriši</Button>
                            </Flex>
                        </Flex>
                    );
                })}
            </Grid>
        </Flex>
    );
}
