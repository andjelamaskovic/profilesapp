import { useEffect, useMemo, useState } from "react";
import { Button, Flex, Grid, Heading, SelectField, TextField, Badge } from "@aws-amplify/ui-react";
import { useMonth } from "../MonthContext.jsx";

const card = { background:"#fff", border:"1px solid #e6e6e6", padding:"0.9rem 1rem", borderRadius:12 };
const pad  = (n) => (n < 10 ? `0${n}` : `${n}`);
const now  = new Date();
const currentMonth = `${now.getFullYear()}-${pad(now.getMonth()+1)}`;

// helper: status po mjesecu (podržava i novi niz i stara polja)
function isPaidForMonth(b, ym) {
    if (Array.isArray(b.paidMonths)) return b.paidMonths.includes(ym);
    if (b.lastPaidMonth) return b.lastPaidMonth === ym;
    if (b.paidAt) return new Date(b.paidAt).toISOString().slice(0,7) === ym;
    return false;
}

export default function BillsPanel({ categories = [], client }) {
    const { month, setMonth } = useMonth();
    const [bills, setBills] = useState([]);
    const [form, setForm] = useState({ name:"", amount:"", dueDay:"", categoryId:"" });
    const [editingId, setEditingId] = useState(null);

    useEffect(()=>{ loadBills().catch(console.error); },[]);
    async function loadBills() {
        const { data, errors } = await client.models.Bill.list({ filter: { active: { ne: false } }, limit: 1000 });
        if (errors?.length) throw new Error(errors.map(e=>e.message).join(", "));
        const norm = (data||[]).map(b => ({
            ...b,
            paidMonths: Array.isArray(b.paidMonths) ? b.paidMonths : [],
        }));
        setBills(norm.sort((a,b)=> (a.dueDay||0)-(b.dueDay||0)));
    }

    function startEdit(b) {
        setEditingId(b.id);
        setForm({
            name: b.name ?? "",
            amount: String(b.amount ?? ""),
            dueDay: String(b.dueDay ?? ""),
            categoryId: b.categoryId || "",
        });
    }
    function cancelEdit() {
        setEditingId(null);
        setForm({ name:"", amount:"", dueDay:"", categoryId:"" });
    }

    async function saveBill(e) {
        e.preventDefault();
        const payload = {
            name: form.name.trim(),
            amount: parseFloat(form.amount),
            dueDay: parseInt(form.dueDay, 10),
            categoryId: form.categoryId || undefined,
            active: true,
        };

        if (!editingId) {
            const { data, errors } = await client.models.Bill.create({
                ...payload, paidMonths: []
            });
            if (errors?.length) throw new Error(errors.map(e=>e.message).join(", "));
            setBills(curr=>[data, ...curr].sort((a,b)=>(a.dueDay||0)-(b.dueDay||0)));
        } else {
            const { data, errors } = await client.models.Bill.update({ id: editingId, ...payload });
            if (errors?.length) throw new Error(errors.map(e=>e.message).join(", "));
            setBills(curr=>curr.map(x=>x.id===editingId? data : x).sort((a,b)=>(a.dueDay||0)-(b.dueDay||0)));
            setEditingId(null);
        }
        setForm({ name:"", amount:"", dueDay:"", categoryId:"" });
    }

    async function deleteBill(id) {
        if (!confirm("Delete this bill?")) return;
        const { errors } = await client.models.Bill.delete({ id });
        if (errors?.length) throw new Error(errors.map(e=>e.message).join(", "));
        setBills(curr=>curr.filter(b=>b.id!==id));
    }

    async function togglePaid(b) {
        if (Array.isArray(b.paidMonths)) {
            const exists = b.paidMonths.includes(month);
            const next = exists ? b.paidMonths.filter(m => m !== month) : [...b.paidMonths, month];
            const { data, errors } = await client.models.Bill.update({ id: b.id, paidMonths: next });
            if (errors?.length) throw new Error(errors.map(e=>e.message).join(", "));
            setBills(curr => curr.map(x => x.id === b.id ? data : x));
            return;
        }
        // fallback
        const newPaid = (b.lastPaidMonth === month) ? undefined : month;
        const { data, errors } = await client.models.Bill.update({ id: b.id, lastPaidMonth: newPaid });
        if (errors?.length) throw new Error(errors.map(e=>e.message).join(", "));
        setBills(curr=>curr.map(x=>x.id===b.id? data : x));
    }

    const summary = useMemo(()=>{
        let dueTotal = 0, remaining = 0;
        for (const b of bills) {
            if (!b.active) continue;
            const amt = Number(b.amount)||0;
            dueTotal += amt;
            if (!isPaidForMonth(b, month)) remaining += amt;
        }
        return { dueTotal, remaining };
    }, [bills, month]);

    return (
        <Flex direction="column" gap="1rem" style={{ width:"100%" }}>
            <Grid gap="1rem" templateColumns="repeat(auto-fit, minmax(220px, 1fr))">
                <Flex direction="column" gap="0.5rem" style={card}>
                    <Heading level={5}>Mjesec</Heading>
                    <TextField type="month" value={month} onChange={(e)=>setMonth(e.target.value)} />
                </Flex>
                <Flex direction="column" gap="0.25rem" style={card}>
                    <Heading level={5}>Ukupni računi</Heading>
                    <Heading level={3}>€{summary.dueTotal.toFixed(2)}</Heading>
                </Flex>
                <Flex direction="column" gap="0.25rem" style={card}>
                    <Heading level={5}>Neplaćeno za ovaj mjesec</Heading>
                    <Heading level={3}>€{summary.remaining.toFixed(2)}</Heading>
                </Flex>
            </Grid>

            {/* Forma */}
            <form onSubmit={saveBill} style={{ width:"100%", margin:"0.5rem 0 1rem" }}>
                <Flex gap="0.75rem" wrap="wrap" alignItems="flex-end">
                    <TextField label="Naziv" value={form.name} onChange={(e)=>setForm({...form, name:e.target.value})} required />
                    <TextField label="Vrijednost (€)" type="number" step="0.01" value={form.amount} onChange={(e)=>setForm({...form, amount:e.target.value})} required />
                    <TextField label="Krajnji datum (1-28)" type="number" min={1} max={28} value={form.dueDay} onChange={(e)=>setForm({...form, dueDay:e.target.value})} required />
                    <SelectField label="Kategorija" value={form.categoryId} onChange={(e)=>setForm({...form, categoryId:e.target.value})}>
                        <option value="">— none —</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </SelectField>
                    <Button type="submit">{editingId ? "Sačuvaj" : "Dodaj račun"}</Button>
                    {editingId && <Button type="button" variation="link" onClick={cancelEdit}>Otkaži</Button>}
                </Flex>
            </form>

            {/* Lista */}
            <Grid gap="0.75rem" autoFlow="row" width="100%">
                {bills.length === 0 ? (
                    <Flex style={card}><p>Trenutno nema računa. Dodaj novi račun.</p></Flex>
                ) : bills.map((b)=> {
                    const cat = b.categoryId ? categories.find(c=>c.id===b.categoryId) : null;
                    const paid = isPaidForMonth(b, month);
                    return (
                        <Flex key={b.id} style={card} alignItems="center" justifyContent="space-between" gap="0.75rem">
                            <div>
                                <Heading level={5} style={{margin:0}}>{b.name} — €{Number(b.amount).toFixed(2)}</Heading>
                                <div style={{opacity:0.8, fontSize:14}}>
                                    Datum: {b.dueDay}. {cat ? `| Kategorija: ${cat.name}` : ""}
                                </div>
                            </div>
                            <Flex gap="0.5rem" alignItems="center">
                                <Badge size="small" variation={paid ? "success" : "warning"}>
                                    {paid ? "Plaćeno" : "Neplaćeno"}
                                </Badge>
                                <Button size="small" onClick={()=>togglePaid(b)}>
                                    {paid ? "Neplaćeno" : "Označi kao plaćeno"}
                                </Button>
                                <Button size="small" onClick={()=>startEdit(b)}>Izmijeni</Button>
                                <Button size="small" variation="destructive" onClick={()=>deleteBill(b.id)}>Izbriši</Button>
                            </Flex>
                        </Flex>
                    );
                })}
            </Grid>
        </Flex>
    );
}
