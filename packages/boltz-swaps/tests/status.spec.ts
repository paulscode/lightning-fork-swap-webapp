import {
    SwapStatus,
    isFailureStatus,
    isFinalStatus,
    isSuccessStatus,
} from "boltz-swaps/status";

describe("status predicates", () => {
    describe("isFailureStatus", () => {
        it.each([
            SwapStatus.SwapExpired,
            SwapStatus.SwapRefunded,
            SwapStatus.SwapWaitingForRefund,
            SwapStatus.InvoiceExpired,
            SwapStatus.InvoiceFailedToPay,
            SwapStatus.TransactionFailed,
            SwapStatus.TransactionLockupFailed,
            SwapStatus.TransactionRefunded,
        ])("returns true for failure status %s", (status) => {
            expect(isFailureStatus(status)).toBe(true);
        });

        it.each([
            SwapStatus.InvoiceSettled,
            SwapStatus.InvoicePending,
            SwapStatus.TransactionServerConfirmed,
            SwapStatus.TransactionServerMempool,
            "totally.unknown",
        ])("returns false for non-failure status %s", (status) => {
            expect(isFailureStatus(status)).toBe(false);
        });
    });

    describe("isSuccessStatus", () => {
        it.each([SwapStatus.InvoiceSettled, SwapStatus.TransactionClaimed])(
            "returns true for success status %s",
            (status) => {
                expect(isSuccessStatus(status)).toBe(true);
            },
        );

        it.each([
            SwapStatus.SwapExpired,
            SwapStatus.TransactionServerConfirmed,
            SwapStatus.InvoicePending,
            "totally.unknown",
        ])("returns false for non-success status %s", (status) => {
            expect(isSuccessStatus(status)).toBe(false);
        });
    });

    describe("isFinalStatus", () => {
        it.each([
            SwapStatus.SwapExpired,
            SwapStatus.SwapRefunded,
            SwapStatus.SwapWaitingForRefund,
            SwapStatus.InvoiceExpired,
            SwapStatus.InvoiceFailedToPay,
            SwapStatus.TransactionFailed,
            SwapStatus.TransactionLockupFailed,
            SwapStatus.TransactionRefunded,
            SwapStatus.InvoiceSettled,
            SwapStatus.TransactionClaimed,
        ])("returns true for final status %s", (status) => {
            expect(isFinalStatus(status)).toBe(true);
        });

        it.each([
            SwapStatus.InvoicePending,
            SwapStatus.SwapCreated,
            SwapStatus.TransactionServerMempool,
            SwapStatus.TransactionServerConfirmed,
            "totally.unknown",
        ])("returns false for non-final status %s", (status) => {
            expect(isFinalStatus(status)).toBe(false);
        });
    });

    describe("cross-predicate invariants", () => {
        test("server lockup statuses are never final", () => {
            expect(isFinalStatus(SwapStatus.TransactionServerConfirmed)).toBe(
                false,
            );
            expect(isFinalStatus(SwapStatus.TransactionServerMempool)).toBe(
                false,
            );
        });
    });

    describe("edge cases", () => {
        test("empty string is never failure, success, or final", () => {
            expect(isFailureStatus("")).toBe(false);
            expect(isSuccessStatus("")).toBe(false);
            expect(isFinalStatus("")).toBe(false);
        });

        test("matching is exact-string and case-sensitive", () => {
            expect(isFinalStatus("Swap.Expired")).toBe(false);
            expect(isFailureStatus("SWAP.EXPIRED")).toBe(false);
            expect(isSuccessStatus("Invoice.Settled")).toBe(false);
        });
    });
});
