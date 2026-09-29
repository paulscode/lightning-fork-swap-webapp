const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;

export const toError = (value: unknown): Error =>
    value instanceof Error ? value : new Error(formatError(value));

export enum LnurlAmountErrorKind {
    Min = "min",
    Max = "max",
}

export class LnurlAmountError extends Error {
    public readonly kind: LnurlAmountErrorKind;
    public readonly limitMsat: number;
    public readonly limitSat: number;

    constructor(kind: LnurlAmountErrorKind, limitMsat: number) {
        super(kind === LnurlAmountErrorKind.Min ? "minAmount" : "maxAmount", {
            cause: limitMsat,
        });
        this.name = "LnurlAmountError";
        this.kind = kind;
        this.limitMsat = limitMsat;
        // Rounded into the satisfiable range: up for a minimum, down for a maximum.
        this.limitSat =
            kind === LnurlAmountErrorKind.Min
                ? Math.ceil(limitMsat / 1_000)
                : Math.floor(limitMsat / 1_000);
    }
}

export const isLnurlAmountError = (value: unknown): value is LnurlAmountError =>
    value instanceof LnurlAmountError;

export const formatError = (message: unknown): string => {
    if (typeof message === "string") {
        return message;
    }

    if (isRecord(message)) {
        const msgObj = message;

        if (isRecord(msgObj.error)) {
            const err = msgObj.error;

            if (typeof err.message === "string") {
                return err.message;
            }
        }

        if (typeof msgObj.message === "string") {
            return msgObj.message;
        }

        if (typeof msgObj.error === "string") {
            return msgObj.error;
        }

        if (typeof msgObj.data === "string") {
            return msgObj.data;
        }

        if (
            typeof message.toString === "function" &&
            // eslint-disable-next-line @typescript-eslint/no-base-to-string
            message.toString() !== "[object Object]"
        ) {
            // eslint-disable-next-line @typescript-eslint/no-base-to-string
            return message.toString();
        }
    }

    return JSON.stringify(message);
};
