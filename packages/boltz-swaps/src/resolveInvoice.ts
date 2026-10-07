import { type InvoiceType, decodeInvoice, isInvoice } from "./invoice.ts";
import { fetchLnurl, isLnurl, stripLightningPrefix } from "./lnurl.ts";
import type { FetchOptions } from "./types.ts";

export type ResolveInvoiceResult = { invoice: string; type: InvoiceType };

export type ResolveInvoiceOptions = FetchOptions;

// Resolves a Lightning destination (LNURL, Lightning address or a plain
// BOLT11 invoice) into a payable invoice for the given amount. Every result
// goes through decodeInvoice, which refuses invoices without the BLAKE2b
// feature bit.
export const resolveInvoice = async (
    param: string,
    amountSat: number,
    opts?: ResolveInvoiceOptions,
): Promise<ResolveInvoiceResult> => {
    const p = stripLightningPrefix(param.trim());

    if (isLnurl(p)) {
        const invoice = await fetchLnurl(p, amountSat, {
            signal: opts?.signal,
            timeoutMs: opts?.timeoutMs,
        });
        const decoded = decodeInvoice(invoice);
        // The service picks the invoice: it must be for what was asked
        if (decoded.satoshis !== Math.round(amountSat)) {
            throw new Error(
                `LNURL service returned an invoice for ${decoded.satoshis} sat instead of ${Math.round(amountSat)}`,
            );
        }
        return { invoice, type: decoded.type };
    }

    // Network-aware gate: rejects e.g. BOLT11 invoices for another network,
    // which decodeInvoice alone would accept.
    if (!isInvoice(p)) {
        throw new Error("invalid invoice");
    }

    const { type } = decodeInvoice(p);
    return { invoice: p, type };
};
