// amplify/functions/export-transactions/handler.ts
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../data/resource";
import awsExports from "../../../amplify_outputs.json";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

Amplify.configure(awsExports);

const s3 = new S3Client({});
const client = generateClient<Schema>({ authMode: "apiKey" });

type AnyEvent = {
    headers?: Record<string, string>;
    body?: string | null;
    requestContext?: { http?: { method?: string } };
};

function cors(statusCode: number, body: any, origin = "*") {
    return {
        statusCode,
        headers: {
            "content-type": "application/json",
            "access-control-allow-origin": origin,
            "access-control-allow-methods": "POST,OPTIONS",
            "access-control-allow-headers": "content-type",
        },
        body: JSON.stringify(body),
    };
}

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const ymLocal = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

const isPaidForMonth = (b: any, ym: string) =>
    (Array.isArray(b.paidMonths) && b.paidMonths.includes(ym)) ||
    (b.lastPaidMonth && b.lastPaidMonth === ym) ||
    (b.paidAt && new Date(b.paidAt).toISOString().slice(0, 7) === ym);

const isReceivedForMonth = (i: any, ym: string) =>
    (Array.isArray(i.receivedMonths) && i.receivedMonths.includes(ym)) ||
    (i.lastReceivedMonth && i.lastReceivedMonth === ym) ||
    (i.receivedAt && new Date(i.receivedAt).toISOString().slice(0, 7) === ym);

// ---- PDF helper (koristi se i u snapshot i u fallback grani)
async function renderAndUploadPDF(params: {
    owner?: string;
    month: string;
    kpi: {
        incomeExpected: number;
        incomeActual: number;
        incomeReceivedRecurring: number;
        txIncome: number;
        expensesActual: number;
        billsPaid: number;
        txExpense: number;
        remainingIncome: number;
        remainingBills: number;
        balance: number;
    };
    latestTx: Array<{ date?: string; type?: string; amount?: number; description?: string }>;
    unpaidBills: Array<{ name: string; amount: number }>;
    unreceivedIncome: Array<{ name: string; amount: number }>;
}) {
    const { owner, month, kpi, latestTx, unpaidBills, unreceivedIncome } = params;

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]); // A4
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    let y = 800;
    const left = 50;
    const right = 545;
    const lineSpacing = 14;

    const drawText = (
        text: string,
        opts: { x?: number; y?: number; size?: number; bold?: boolean; align?: "left" | "right" } = {}
    ) => {
        const { x = left, y: yy = y, size = 12, bold = false, align = "left" } = opts;
        const textWidth = font.widthOfTextAtSize(text, size);
        const xPos = align === "right" ? right - textWidth : x;
        page.drawText(text, { x: xPos, y: yy, size, font: bold ? fontBold : font, color: rgb(0, 0, 0) });
        y = yy - size - 6;
    };

    const drawSectionHeader = (title: string) => {
        y -= 10;
        drawText(title, { size: 14, bold: true });
        y -= 4;
        page.drawLine({
            start: { x: left, y },
            end: { x: right, y },
            thickness: 1,
            color: rgb(0.5, 0.5, 0.5),
        });
        y -= 10;
    };

    drawText(`Mjesecni izvjestaj — ${month}`, { size: 20, bold: true }); y -= 20;

    drawText(`Prihodi (ocekivani):`, { bold: true });
    drawText(`€${kpi.incomeExpected.toFixed(2)}`, { align: "right" });
    drawText(`Primljeni prihodi:`, { bold: true });
    drawText(`€${kpi.incomeActual.toFixed(2)} (Ocekivani: €${kpi.incomeReceivedRecurring.toFixed(2)} · Transakcije: €${kpi.txIncome.toFixed(2)})`, { align: "right" });
    drawText(`Troskovi:`, { bold: true });
    drawText(`€${kpi.expensesActual.toFixed(2)} (Placeni racuni: €${kpi.billsPaid.toFixed(2)} · Ostalo: €${kpi.txExpense.toFixed(2)})`, { align: "right" });
    drawText(`Neplaceni racuni:`, { bold: true });
    drawText(`€${kpi.remainingBills.toFixed(2)}`, { align: "right" });
    drawText(`Neuplaceni prihodi:`, { bold: true });
    drawText(`€${kpi.remainingIncome.toFixed(2)}`, { align: "right" });
    drawText(`Balans:`, { bold: true });
    drawText(`€${kpi.balance.toFixed(2)}`, { align: "right" });

    drawSectionHeader("Poslednje transakcije");
    latestTx.slice(0, 10).forEach((t) => {
        const when = t.date ? new Date(t.date).toISOString().slice(0, 10) : "";
        drawText(`• ${when} ${(t.type || "").toUpperCase()} €${Number(t.amount || 0).toFixed(2)} ${t.description || ""}`, { size: 10 });
    });

    drawSectionHeader("Neplaceni racuni");
    unpaidBills.slice(0, 10).forEach((b) => {
        drawText(`• ${b.name}`, { size: 10 });
        drawText(`€${Number(b.amount || 0).toFixed(2)}`, { size: 10, align: "right" });
    });

    drawSectionHeader("Neuplaceni prihodi");
    unreceivedIncome.slice(0, 10).forEach((i) => {
        drawText(`• ${i.name}`, { size: 10 });
        drawText(`€${Number(i.amount || 0).toFixed(2)}`, { size: 10, align: "right" });
    });

    const pdfBytes = await pdf.save();

    const Bucket = process.env.EXPORT_BUCKET!;
    const Key = `exports/${owner ?? "all"}/${month}-${Date.now()}.pdf`;

    await s3.send(
        new PutObjectCommand({
            Bucket,
            Key,
            Body: Buffer.from(pdfBytes),
            ContentType: "application/pdf",
        })
    );

    const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket, Key }), { expiresIn: 600 });
    return url;
}

export const handler = async (event: AnyEvent) => {
    const origin = event?.headers?.origin || "*";

    if (event?.requestContext?.http?.method === "OPTIONS") {
        return cors(200, { ok: true }, origin);
    }

    // Body
    let owner: string | undefined;
    let month: string | undefined;
    let snapshot: any | undefined;
    try {
        const payload = event?.body ? JSON.parse(event.body) : {};
        owner = payload?.owner;
        month = payload?.month;
        snapshot = payload?.snapshot;
    } catch {
        // ignore
    }
    if (!month) {
        const now = new Date();
        month = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
    }

    // --- 1) SNAPSHOT PUT: renderuj tacno ono sto stize iz UI ---
    if (snapshot) {
        try {
            const url = await renderAndUploadPDF({
                owner,
                month,
                kpi: snapshot.kpi,
                latestTx: snapshot.latestTx || [],
                unpaidBills: snapshot.unpaidBills || [],
                unreceivedIncome: snapshot.unreceivedIncome || [],
            });
            return cors(200, { ok: true, url }, origin);
        } catch (e: any) {
            console.error("Snapshot PDF error:", e);
            return cors(500, { ok: false, message: String(e?.message || e) }, origin);
        }
    }

    // --- 2) FALLBACK: (ostaje kao backup kada nema snapshot-a) ---
    // Transactions
    const txArgs: any = owner ? { filter: { owner: { eq: owner } }, limit: 1000 } : { limit: 1000 };
    const { data: txData, errors: txErr } = await client.models.Transaction.list(txArgs);
    if (txErr?.length) {
        return cors(500, { ok: false, message: txErr.map((e: any) => e.message).join(", ") }, origin);
    }

    // Income
    let incData: any[] = [];
    try {
        const inc = await client.models.IncomeSource.list({ filter: { active: { ne: false } }, limit: 1000 });
        if (inc.errors?.length) throw new Error(inc.errors.map((e: any) => e.message).join(", "));
        incData = inc.data || [];
    } catch (e) {
        console.log("IncomeSource unauthorized or error; continuing with []:", e);
        incData = [];
    }

    // Bills
    const billModel: any = (client as any).models.Bill || (client as any).models.Bills;
    let billsData: any[] = [];
    if (billModel) {
        try {
            const b = await billModel.list({ filter: { active: { ne: false } }, limit: 1000 });
            if (b.errors?.length) throw new Error(b.errors.map((e: any) => e.message).join(", "));
            billsData = b.data || [];
        } catch (e) {
            console.log("Bill unauthorized or error; continuing with []:", e);
            billsData = [];
        }
    }

    const txsMonth = (txData || []).filter((t: any) => ymLocal(t.date) === month);
    const incomeSources = incData || [];
    const bills = billsData || [];

    const incomeExpected = incomeSources.reduce((s: number, x: any) => s + (Number(x.amount) || 0), 0);
    const billsTotal = bills.reduce((s: number, b: any) => s + (Number(b.amount) || 0), 0);
    const incomeReceivedRecurring = incomeSources.reduce(
        (s: number, x: any) => s + (isReceivedForMonth(x, month!) ? (Number(x.amount) || 0) : 0),
        0
    );
    const txIncome = txsMonth.reduce(
        (s: number, t: any) => s + ((t.type || "").toLowerCase() === "income" ? (Number(t.amount) || 0) : 0),
        0
    );
    const billsPaid = bills.reduce(
        (s: number, b: any) => s + (isPaidForMonth(b, month!) ? (Number(b.amount) || 0) : 0),
        0
    );
    const txExpense = txsMonth.reduce(
        (s: number, t: any) => s + ((t.type || "").toLowerCase() === "expense" ? (Number(t.amount) || 0) : 0),
        0
    );

    const url = await renderAndUploadPDF({
        owner,
        month,
        kpi: {
            incomeExpected,
            incomeActual: incomeReceivedRecurring + txIncome,
            incomeReceivedRecurring,
            txIncome,
            expensesActual: billsPaid + txExpense,
            billsPaid,
            txExpense,
            remainingIncome: Math.max(0, incomeExpected - incomeReceivedRecurring),
            remainingBills: Math.max(0, billsTotal - billsPaid),
            balance: (incomeReceivedRecurring + txIncome) - (billsPaid + txExpense),
        },
        latestTx: [...txsMonth]
            .sort((a: any, b: any) =>
                (b.date || "").localeCompare(a.date || "") ||
                (b.createdAt || "").localeCompare(a.createdAt || "")
            )
            .slice(0, 10)
            .map((t: any) => ({ date: t.date, type: t.type, amount: t.amount, description: t.description })),
        unpaidBills: bills.filter((b: any) => !isPaidForMonth(b, month!)).slice(0, 10).map((b: any) => ({ name: b.name, amount: b.amount })),
        unreceivedIncome: incomeSources.filter((i: any) => !isReceivedForMonth(i, month!)).slice(0, 10).map((i: any) => ({ name: i.name, amount: i.amount })),
    });

    return cors(200, { ok: true, url }, origin);
};

