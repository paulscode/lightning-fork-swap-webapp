import { useNavigate } from "@solidjs/router";
import BigNumber from "bignumber.js";
import { isLnurlAmountError } from "boltz-swaps/errors";
import { isMissingBlake2bFeatureError } from "boltz-swaps/invoice";
import { resolveInvoice } from "boltz-swaps/resolveInvoice";
import { SwapType } from "boltz-swaps/types";
import log from "loglevel";
import { createEffect, createMemo, createSignal, on } from "solid-js";

import { BTC, LN } from "../consts/Assets";
import type { ButtonLabelParams } from "../consts/Types";
import { useCreateContext } from "../context/Create";
import { useGlobalContext } from "../context/Global";
import type { DictKey } from "../i18n/i18n";
import { validateAddress as validateOnchainAddress } from "../utils/compat";
import {
    formatAmount,
    formatDenomination,
    formatSwapAmountForLog,
} from "../utils/denomination";
import { formatError } from "../utils/errors";
import { handleCreateSwapError } from "../utils/handleCreateSwapError";
import { getDestinationAddress } from "../utils/helper";
import { canSendAsset } from "../utils/selectableAsset";
import {
    type ReverseSwap,
    type SubmarineSwap,
    createReverse,
    createSubmarine,
} from "../utils/swapCreator";
import { validateResponse } from "../utils/validation";
import LoadingSpinner from "./LoadingSpinner";

// In milliseconds
const invoiceFetchTimeout = 25_000;

const userErrorLabelKeys = new Set<DictKey>([
    "invalid_pair",
    "invalid_send_asset",
    "maximum_amount",
    "invalid_0_amount",
    "min_amount_destination",
    "max_amount_destination",
    "invoice_missing_blake2b",
]);

const CreateButton = () => {
    const navigate = useNavigate();
    const {
        separator,
        setSwapStorage,
        denomination,
        pairs,
        setPairs,
        online,
        notify,
        t,
        newKey,
        deriveKey,
        rescueFile,
    } = useGlobalContext();
    const {
        pair,
        invoice,
        lnurl,
        onchainAddress,
        receiveAmount,
        sendAmount,
        amountChanged,
        amountValid,
        setInvoice,
        setInvoiceValid,
        setLnurl,
        setOnchainAddress,
        valid,
        addressValid,
        setAddressValid,
        minimum,
        maximum,
        invoiceValid,
        invoiceError,
        setSendAmount,
        quoteLoading,
        quoteError,
        setAmountChanged,
    } = useCreateContext();

    const [buttonDisable, setButtonDisable] = createSignal(false);
    const [loading, setLoading] = createSignal(false);
    const [buttonLabel, setButtonLabel] = createSignal<ButtonLabelParams>({
        key: "create_swap",
    });
    const pairsLoading = () => online() && pairs() === undefined;
    const invalidPairState = () => pairs() !== undefined && !pair().isRoutable;
    const buttonClass = createMemo(() => {
        if (!online()) {
            return "btn btn-danger";
        }
        if (!pairsLoading() && userErrorLabelKeys.has(buttonLabel().key)) {
            return "btn btn-error";
        }
        return "btn";
    });
    const [originalDestination, setOriginalDestination] = createSignal<
        string | undefined
    >(undefined);

    const swapType = () => pair().swapType;
    const assetSend = () => pair().fromAsset;
    const assetReceive = () => pair().toAsset;
    const deferredInvoiceDestination = () => lnurl() || undefined;
    const getSwapCreationLogContext = () => ({
        swapType: swapType() ?? "unknown",
        assetSend: assetSend(),
        assetReceive: assetReceive(),
        sendAmount: formatSwapAmountForLog(sendAmount(), assetSend()),
        receiveAmount: formatSwapAmountForLog(receiveAmount(), assetReceive()),
        onchainAddress: onchainAddress(),
        originalDestination: originalDestination(),
        hasInvoice: Boolean(invoice()),
        hasLnurl: Boolean(lnurl()),
    });

    const validWayToFetchInvoice = (): boolean =>
        swapType() === SwapType.Submarine &&
        deferredInvoiceDestination() !== undefined &&
        amountValid() &&
        sendAmount().isGreaterThan(0);

    const canCreateSwap = () => valid() || validWayToFetchInvoice();

    createEffect(
        on(
            [
                valid,
                amountValid,
                addressValid,
                invoiceValid,
                invoiceError,
                quoteError,
                amountChanged,
                pair,
                lnurl,
                online,
                minimum,
                denomination,
                sendAmount,
                receiveAmount,
                onchainAddress,
                invoice,
            ],
            () => {
                setButtonDisable(false);
                if (!online()) {
                    setButtonLabel({ key: "api_offline" });
                    return;
                }
                if (pairs() === undefined) {
                    return;
                }
                if (!pair().isRoutable) {
                    if (!canSendAsset(pair().fromAsset)) {
                        setButtonLabel({ key: "invalid_send_asset" });
                    } else {
                        setButtonLabel({ key: "invalid_pair" });
                    }
                    return;
                }

                const isSubmarine = swapType() === SwapType.Submarine;

                const hasInvalidDestinationInput = () => {
                    if (isSubmarine) {
                        return (
                            Boolean(invoiceError()) ||
                            (invoice() !== "" &&
                                !invoiceValid() &&
                                lnurl() === "")
                        );
                    }
                    return onchainAddress() !== "" && !addressValid();
                };

                const shouldShowAmountError = () =>
                    !amountValid() &&
                    (!isSubmarine || !invoiceError()) &&
                    !(sendAmount().isZero() && hasInvalidDestinationInput());

                if (shouldShowAmountError()) {
                    const quoteErrorKey = quoteError();
                    if (
                        quoteErrorKey !== undefined &&
                        (sendAmount().isGreaterThan(0) ||
                            receiveAmount().isGreaterThan(0))
                    ) {
                        setButtonLabel({ key: quoteErrorKey });
                        return;
                    }

                    if (
                        sendAmount().isGreaterThan(0) &&
                        receiveAmount().isZero()
                    ) {
                        setButtonLabel({ key: "error_zero_quote" });
                        return;
                    }

                    const lessThanMin =
                        sendAmount().isZero() ||
                        Number(sendAmount()) < minimum();
                    setButtonLabel({
                        key: lessThanMin ? "minimum_amount" : "maximum_amount",
                        params: {
                            amount: formatAmount(
                                BigNumber(lessThanMin ? minimum() : maximum()),
                                denomination(),
                                separator(),
                                assetSend(),
                            ),
                            denomination: formatDenomination(
                                denomination(),
                                assetSend(),
                            ),
                        },
                    });
                    return;
                }

                if (!isSubmarine) {
                    if (!addressValid()) {
                        setButtonLabel({
                            key: "invalid_address",
                            params: {
                                asset: assetReceive(),
                            },
                        });
                        return;
                    }
                } else {
                    if (validWayToFetchInvoice()) {
                        setButtonLabel({ key: "create_swap" });
                        return;
                    }
                    if (!invoiceValid()) {
                        setButtonLabel({
                            key: invoiceError() || "invalid_invoice",
                        });
                        return;
                    }
                }
                setButtonLabel({ key: "create_swap" });
            },
        ),
    );

    const getOriginalDestination = () =>
        originalDestination() ||
        (assetReceive() !== LN && onchainAddress() !== ""
            ? onchainAddress()
            : undefined);

    const showInvalidAddress = (asset: string) => {
        setAddressValid(false);
        notify(
            "error",
            t("invalid_address", {
                asset,
            }),
        );
    };

    // Resolves an LNURL or Lightning address into an invoice. The SDK refuses
    // invoices without the BLAKE2b feature bit here as well.
    const fetchInvoice = async (): Promise<boolean> => {
        const destination = deferredInvoiceDestination();
        if (destination === undefined) {
            return false;
        }

        log.info("Resolving invoice for LNURL", destination);

        try {
            const { invoice } = await resolveInvoice(
                destination,
                Number(receiveAmount()),
                { timeoutMs: invoiceFetchTimeout },
            );

            setOriginalDestination(destination);
            setInvoice(invoice);
            setLnurl("");
            setInvoiceValid(true);
            return true;
        } catch (e) {
            log.warn("Resolving invoice failed", e);
            setInvoiceValid(false);

            if (isLnurlAmountError(e)) {
                const value = {
                    amount: formatAmount(
                        BigNumber(e.limitSat),
                        denomination(),
                        separator(),
                        BTC,
                    ),
                    denomination: formatDenomination(denomination(), BTC),
                };
                const errorMsg: DictKey = `${e.kind}_amount_destination`;

                setButtonDisable(true);
                setButtonLabel({ key: errorMsg, params: value });
                notify("error", t(errorMsg, value));
                return false;
            }

            if (isMissingBlake2bFeatureError(e)) {
                setButtonDisable(true);
                setButtonLabel({ key: "invoice_missing_blake2b" });
                notify("error", t("invoice_missing_blake2b"));
                return false;
            }

            notify("error", formatError(e));
            return false;
        }
    };

    const createSwap = async (claimAddress: string): Promise<boolean> => {
        try {
            const creationData = await pair().creationData(
                sendAmount(),
                pair().minerFees,
            );
            if (creationData === undefined) {
                throw new Error("missing swap creation data");
            }

            let data: SubmarineSwap | ReverseSwap;
            if (creationData.type === SwapType.Submarine) {
                data = await createSubmarine(
                    creationData.from,
                    creationData.to,
                    creationData.sendAmount,
                    creationData.receiveAmount,
                    invoice(),
                    creationData.pairHash,
                    newKey,
                    originalDestination(),
                );
            } else {
                const rescue = rescueFile();
                if (rescue === null) {
                    throw new Error("missing rescue file");
                }
                data = await createReverse(
                    creationData.from,
                    creationData.to,
                    creationData.sendAmount,
                    creationData.receiveAmount,
                    claimAddress,
                    creationData.pairHash,
                    rescue,
                    newKey,
                    getOriginalDestination(),
                );
            }

            try {
                await validateResponse(data, deriveKey);
            } catch (e) {
                const error = e instanceof Error ? e : new Error(String(e));
                log.error(
                    `failed to create ${swapType()} swap: ${error.stack}`,
                );
                log.error("server response for swap creation:", data);
                navigate("/error");
                return false;
            }

            log.debug(`Created swap ${data.id}:`, {
                destination: getDestinationAddress(data),
                receiveAmount: formatSwapAmountForLog(
                    data.receiveAmount,
                    data.assetReceive,
                ),
            });

            await setSwapStorage(data);

            setInvoice("");
            setInvoiceValid(false);
            setOnchainAddress("");
            setAddressValid(false);
            setOriginalDestination(undefined);

            navigate("/swap/" + data.id);

            return true;
        } catch (err) {
            log.error("Swap creation failed", {
                ...getSwapCreationLogContext(),
                error: formatError(err),
            });

            const recovered = await handleCreateSwapError(
                err,
                notify,
                t,
                pair,
                setPairs,
                setSendAmount,
                setAmountChanged,
            );

            if (!recovered) {
                notify("error", formatError(err));
            }

            return false;
        }
    };

    const buttonClick = async () => {
        setLoading(true);
        try {
            if (validWayToFetchInvoice()) {
                if (!(await fetchInvoice())) {
                    return;
                }
            }

            const claimAddress = onchainAddress();
            if (
                assetReceive() === BTC &&
                !validateOnchainAddress(assetReceive(), claimAddress)
            ) {
                showInvalidAddress(assetReceive());
                return;
            }

            if (!valid()) return;

            await createSwap(claimAddress);
        } catch (e) {
            log.error("Swap creation setup failed", {
                ...getSwapCreationLogContext(),
                error: formatError(e),
            });
            notify("error", formatError(e));
        } finally {
            setLoading(false);
        }
    };

    const getButtonLabel = (label: ButtonLabelParams) => {
        return t(label.key, label.params);
    };

    return (
        <button
            id="create-swap-button"
            data-testid="create-swap-button"
            class={buttonClass()}
            disabled={
                !online() ||
                pairsLoading() ||
                !canCreateSwap() ||
                buttonDisable() ||
                loading() ||
                quoteLoading() ||
                (onchainAddress() === "" &&
                    invoice() === "" &&
                    deferredInvoiceDestination() === undefined)
            }
            onClick={buttonClick}>
            {(pairsLoading() || loading() || quoteLoading()) &&
            !invalidPairState() ? (
                <LoadingSpinner class="inner-spinner" />
            ) : (
                getButtonLabel(buttonLabel())
            )}
        </button>
    );
};

export default CreateButton;
