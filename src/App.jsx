import { useState, useEffect } from "react";
import { Button, Heading, Flex, Divider } from "@aws-amplify/ui-react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { Amplify } from "aws-amplify";
import "@aws-amplify/ui-react/styles.css";
import { generateClient } from "aws-amplify/data";
import outputs from "../amplify_outputs.json";
import IncomePanel from "./components/IncomePanel";

// Panely
import DashboardPanel from "./components/DashboardPanel";
import TransactionsPanel from "./components/TransactionsPanel";
import CategoriesPanel from "./components/CategoriesPanel";
import ProfilePanel from "./components/ProfilePanel";
import SavingsPanel from "./components/SavingsPanel.jsx";
import BillsPanel from "./components/BillsPanel";
import { MonthProvider } from "./MonthContext";

const FUNCTION_URL = "https://ktioznsw7opvny4xmbmhuwxprm0wpzvq.lambda-url.eu-north-1.on.aws/";

// Amplify
Amplify.configure(outputs);
const client = generateClient({ authMode: "userPool" });

// ===== pomoćnici (ostaju ovdje) =========================================
function toISOFromDateInput(d) {
    if (!d) return new Date().toISOString();
    if (d.includes("T")) return new Date(d).toISOString();
    return new Date(`${d}T00:00`).toISOString();
}
function toDateInputValue(iso) {
    if (!iso) return "";
    try {
        return new Date(iso).toISOString().slice(0, 10);
    } catch {
        return "";
    }
}
function sortTx(a, b) {
    return (
        (b.date || "").localeCompare(a.date || "") ||
        (b.createdAt || "").localeCompare(a.createdAt || "")
    );
}

export default function App() {
    const [userprofiles, setUserProfiles] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [categories, setCategories] = useState([]);

    // Categories state
    const [newCategory, setNewCategory] = useState({ name: "", color: "", icon: "" });
    const [editingCategoryId, setEditingCategoryId] = useState(null);

    // Filters + totals
    const [filters, setFilters] = useState({ from:"", to:"", categoryId:"", type:"" });
    const [totals, setTotals] = useState({ income: 0, expense: 0, balance: 0 });

    // Transaction form
    const [form, setForm] = useState({ amount:"", type:"", description:"", date:"", categoryId:"" });
    const [editingId, setEditingId] = useState(null);

    // Tabs
    const TABS = ["Pregled", "Transakcije", "Kategorije", "Računi", "Prihodi", "Štednja"];
    const [activeTab, setActiveTab] = useState("Pregled");

    const { user, signOut } = useAuthenticator((ctx) => [ctx.user]);

    // init
    useEffect(() => {
        (async () => {
            const { data: profiles } = await client.models.UserProfile.list();
            setUserProfiles(profiles || []);

            const { data: txs } = await client.models.Transaction.list({ limit: 1000 });
            const sorted = (txs || []).sort(sortTx);
            setTransactions(sorted);
            recomputeTotals(sorted);

            await fetchCategories();
        })().catch((e) => {
            console.error(e);
            alert(e.message);
        });
    }, []);

    // totals
    function recomputeTotals(list = []) {
        let income = 0, expense = 0;
        for (const t of list) {
            const amt = Number(t.amount) || 0;
            const type = (t.type || "").toLowerCase();
            if (type === "income") income += amt;
            if (type === "expense") expense += amt;
        }
        setTotals({ income, expense, balance: income - expense });
    }
// ... sve tvoje postojeće import-e i kod iz App.jsx

// App.jsx (unutar export funkcija)
    async function exportPdf(snapshot) {
        try {
            const owner =
                user?.username || user?.userId || user?.signInDetails?.loginId || undefined;

            const res = await fetch(FUNCTION_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ owner, snapshot }),
            });

            const text = await res.text();
            let out;
            try { out = JSON.parse(text); } catch { throw new Error("bad-json"); }

            if (!res.ok || !out?.ok || !out?.url) {
                console.error("PDF – server error:", { status: res.status, out });
                throw new Error(out?.message || "server-error");
            }

            const win = window.open(out.url, "_blank");
            if (!win) alert("Popup blocked. Copy URL from console.");
        } catch (e) {
            console.error("Export PDF – failed:", e);
            alert("Export failed");
        }
    }

    // filters
    async function applyFilters() {
        try {
            const filter = {};
            if (filters.categoryId) filter.categoryId = { eq: filters.categoryId };
            if (filters.type) filter.type = { eq: filters.type };
            if (filters.from && filters.to) {
                filter.date = { between: [toISOFromDateInput(filters.from), toISOFromDateInput(filters.to)] };
            } else if (filters.from) {
                filter.date = { ge: toISOFromDateInput(filters.from) };
            } else if (filters.to) {
                filter.date = { le: toISOFromDateInput(filters.to) };
            }

            const args = Object.keys(filter).length ? { filter, limit: 1000 } : { limit: 1000 };
            const { data, errors } = await client.models.Transaction.list(args);
            if (errors?.length) throw new Error(errors.map(e => e.message).join(", "));
            const sorted = (data || []).sort(sortTx);
            setTransactions(sorted);
            recomputeTotals(sorted);
        } catch (e) {
            console.error("Apply filters failed:", e);
            alert("Apply filters failed: " + e.message);
        }
    }
    async function clearFilters() {
        setFilters({ from:"", to:"", categoryId:"", type:"" });
        const { data } = await client.models.Transaction.list({ limit: 1000 });
        const sorted = (data || []).sort(sortTx);
        setTransactions(sorted);
        recomputeTotals(sorted);
    }

    // categories
    async function fetchCategories() {
        try {
            const { data, errors } = await client.models.Category.list({ limit: 1000 });
            if (errors?.length) throw new Error(errors.map(e => e.message).join(", "));
            setCategories(data || []);
        } catch (e) {
            console.error("Category list error:", e);
            alert("Category list error: " + e.message);
        }
    }
    async function onSubmitCategory(e) {
        e.preventDefault();
        try {
            const payload = {
                name: newCategory.name,
                color: newCategory.color || undefined,
                icon: newCategory.icon || undefined,
            };

            if (!editingCategoryId) {
                const { data, errors } = await client.models.Category.create(payload);
                if (errors?.length) throw new Error(errors.map(e => e.message).join(", "));
                setCategories(curr => [data, ...curr]);
            } else {
                const { data, errors } = await client.models.Category.update({
                    id: editingCategoryId,
                    ...payload,
                });
                if (errors?.length) throw new Error(errors.map(e => e.message).join(", "));
                setCategories(curr => curr.map(c => (c.id === editingCategoryId ? data : c)));
                setEditingCategoryId(null);
            }

            setNewCategory({ name: "", color: "", icon: "" });
        } catch (e) {
            console.error("Save category failed:", e);
            alert("Save category failed: " + e.message);
        }
    }
    async function deleteCategory(id) {
        if (!confirm("Delete this category?")) return;
        try {
            const { errors } = await client.models.Category.delete({ id });
            if (errors?.length) throw new Error(errors.map(e => e.message).join(", "));
            setCategories(curr => curr.filter(c => c.id !== id));
        } catch (e) {
            console.error("Delete category failed:", e);
            alert("Delete category failed: " + e.message);
        }
    }
    const startEditCategory = (c) => {
        setEditingCategoryId(c.id);
        setNewCategory({ name: c.name ?? "", color: c.color ?? "", icon: c.icon ?? "" });
    };
    const cancelEditCategory = () => {
        setEditingCategoryId(null);
        setNewCategory({ name: "", color: "", icon: "" });
    };

    // export (lambda)
    async function exportCsv() {
        try {
            const owner =
                user?.username || user?.userId || user?.signInDetails?.loginId || undefined;

            const res = await fetch(FUNCTION_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ owner }),
            });

            const text = await res.text();
            let out;
            try { out = JSON.parse(text); }
            catch { throw new Error("bad-json"); }

            if (!res.ok || !out?.ok || !out?.url) {
                throw new Error(out?.message || "server-error");
            }
            const win = window.open(out.url, "_blank");
            if (!win) alert("Popup blocked. Copy URL from console.");
        } catch (e) {
            console.error("Export CSV – failed:", e);
            alert("Export failed");
        }
    }

    // transactions
    async function onSubmit(e) {
        e.preventDefault();
        try {
            const payload = {
                amount: parseFloat(form.amount),
                type: form.type,
                description: form.description || undefined,
                date: toISOFromDateInput(form.date),
                categoryId: form.categoryId || undefined,
            };

            if (!editingId) {
                const { data, errors } = await client.models.Transaction.create(payload);
                if (errors?.length) throw new Error(errors.map((x) => x.message).join(", "));
                const next = [data, ...transactions].sort(sortTx);
                setTransactions(next);
                recomputeTotals(next);
            } else {
                const { data, errors } = await client.models.Transaction.update({ id: editingId, ...payload });
                if (errors?.length) throw new Error(errors.map((x) => x.message).join(", "));
                const next = transactions.map(t => (t.id === editingId ? data : t)).sort(sortTx);
                setTransactions(next);
                recomputeTotals(next);
            }

            setForm({ amount: "", type: "", description: "", date: "", categoryId: "" });
            setEditingId(null);
        } catch (err) {
            console.error(err);
            alert((err && err.message) || "Save failed");
        }
    }
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
        setForm({ amount: "", type: "", description: "", date: "", categoryId: "" });
    }
    async function onDelete(id) {
        if (!confirm("Delete this transaction?")) return;
        try {
            const { errors } = await client.models.Transaction.delete({ id });
            if (errors?.length) throw new Error(errors.map((x) => x.message).join(", "));
            const next = transactions.filter(t => t.id !== id);
            setTransactions(next);
            recomputeTotals(next);
        } catch (err) {
            console.error(err);
            alert("Delete failed: " + err.message);
        }
    }

    return (
        <Flex
            className="App"
            justifyContent="flex-start"
            alignItems="stretch"
            direction="column"
            width="min(100%, 1000px)"
            margin="0 auto"
            padding="1rem"
            gap="1rem"
            style={{ background: "#fafafa", minHeight: "100vh" }}
        >
            {/* Header */}
            <Flex justifyContent="space-between" alignItems="center">
                <Heading level={2}><img src="/download.png" alt="Budget Tracker" style={{ height: "50px" }} /></Heading>
                <Flex gap="0.5rem">
                    {TABS.map((t) => (
                        <Button
                            key={t}
                            onClick={() => setActiveTab(t)}
                            variation={activeTab === t ? "primary" : "link"}
                        >
                            {t}
                        </Button>
                    ))}
                </Flex>
                <Button onClick={signOut} variation="destructive">Odjava</Button>

            </Flex>
            <Divider />
            <Heading level={3} style={{ marginTop: "-0.5rem" }}>{activeTab}</Heading>
            <MonthProvider>

            {activeTab === "Pregled" && (
                <DashboardPanel
                    client={client}
                    categories={categories}
                    exportPdf={exportPdf}
                />
            )}

            {activeTab === "Transakcije" && (
                <TransactionsPanel
                    client={client}
                    form={form} setForm={setForm}
                    categories={categories}
                    editingId={editingId}
                    onSubmit={onSubmit} cancelEdit={cancelEdit}
                    transactions={transactions} startEdit={startEdit} onDelete={onDelete}
                />
            )}

            {activeTab === "Kategorije" && (
                <CategoriesPanel
                    newCategory={newCategory} setNewCategory={setNewCategory}
                    editingCategoryId={editingCategoryId}
                    onSubmitCategory={onSubmitCategory} cancelEditCategory={cancelEditCategory}
                    categories={categories} startEditCategory={startEditCategory} deleteCategory={deleteCategory}
                />
            )}
            {activeTab === "Prihodi" && (
                <IncomePanel client={client} categories={categories} />
            )}
            {activeTab === "Računi" && (
                <BillsPanel client={client} categories={categories} />
            )}
            {activeTab === "Štednja" && (
                <SavingsPanel client={client} categories={categories} />
            )}


            </MonthProvider>

        </Flex>
    );
}
