import log from "loglevel";
import {
    type Accessor,
    type Setter,
    Show,
    createEffect,
    createMemo,
    createSignal,
    untrack,
} from "solid-js";

import RefundEta from "../components/RefundEta";
import { type deriveKeyFn, useGlobalContext } from "../context/Global";
import { usePayContext } from "../context/Pay";
import { useModifySwap } from "../hooks/useModifySwap";
import { getSwapUTXOs } from "../utils/blockchain";
import { validateAddress } from "../utils/compat";
import { formatError } from "../utils/errors";
import { RefundType, refund } from "../utils/rescue";
import type { SubmarineSwap } from "../utils/swapCreator";
import LoadingSpinner from "./LoadingSpinner";

export const RefundBtc = (props: {
    swap: Accessor<SubmarineSwap>;
    setRefundTxId: Setter<string>;
    buttonOverride?: string;
    deriveKeyFn?: deriveKeyFn;
}) => {
    const { setRefundAddress, refundAddress, notify, t, deriveKey } =
        useGlobalContext();
    const { refundableUTXOs, setRefundableUTXOs } = usePayContext();

    const [timeoutEta, setTimeoutEta] = createSignal<number>(0);
    const [timeoutBlockheight, setTimeoutBlockheight] = createSignal<number>(0);

    const [valid, setValid] = createSignal<boolean>(false);
    const [refundRunning, setRefundRunning] = createSignal<boolean>(false);

    const validateRefundAddress = () => {
        if (!refundAddress()) {
            setValid(false);
            return;
        }

        if (refundAddress() === props.swap().address) {
            log.debug("refunds to lockup address are blocked");
            setValid(false);
            return;
        }

        const asset = props.swap()?.assetSend;
        if (!asset) return;
        const address = refundAddress();
        if (address === null) {
            setValid(false);
            return;
        }

        setValid(validateAddress(asset, address));
    };

    // Re-read the real outpoint from the explorer; true if it changed.
    const refetchRefundableUTXOs = async (): Promise<boolean> => {
        try {
            const fresh = await getSwapUTXOs(props.swap());
            if (fresh.length === 0) {
                return false;
            }
            const idsOf = (utxos: { id?: string }[]) =>
                utxos
                    .map((u) => u.id ?? "")
                    .sort()
                    .join(",");
            if (idsOf(fresh) === idsOf(refundableUTXOs())) {
                return false;
            }
            setRefundableUTXOs(fresh);
            return true;
        } catch (e) {
            log.warn("failed to refetch refundable UTXOs for self-heal", e);
            return false;
        }
    };

    const refundAction = async (isRetry = false) => {
        setRefundRunning(true);

        try {
            const address = refundAddress();
            if (address === null) {
                throw new Error("missing refund address");
            }
            const refundTxId = await refund(
                props.deriveKeyFn || deriveKey,
                props.swap(),
                address,
                refundableUTXOs(),
                RefundType.Cooperative,
            );

            props.setRefundTxId?.(refundTxId);

            setRefundAddress("");
        } catch (error) {
            log.warn("refund failed", error);

            // The cached lockup tx may be wrong (e.g. the backend reported a
            // stale or invalid lockup tx). Refetch the real address UTXOs and
            // retry once if they changed.
            if (!isRetry && (await refetchRefundableUTXOs())) {
                return refundAction(true);
            }

            if (typeof error === "string") {
                let msg = error;
                if (
                    msg.includes("bad-txns-inputs-missingorspent") ||
                    msg.includes("Inputs missing or spent") ||
                    msg === "Transaction already in block chain" ||
                    msg.startsWith("insufficient fee")
                ) {
                    msg = t("already_refunded");
                } else if (
                    msg.endsWith("script-verify-flag-failed") ||
                    msg === "non-final"
                ) {
                    msg = t("locktime_not_satisfied");
                    const legacyTx = refundableUTXOs().find(
                        (tx) => tx.timeoutEta && tx.timeoutBlockHeight,
                    );
                    if (legacyTx) {
                        setTimeoutEta(legacyTx.timeoutEta ?? 0);
                        setTimeoutBlockheight(legacyTx.timeoutBlockHeight ?? 0);
                    }
                }
                log.error(msg);
                notify("error", msg);
            } else {
                log.error(formatError(error));
                notify("error", formatError(error));
            }
        }

        setRefundRunning(false);
    };

    const buttonMessage = createMemo(() => {
        if (refundableUTXOs()?.length === 0) {
            return t("no_lockup_transaction");
        }
        if (valid() || !refundAddress() || !props.swap()) {
            return t("refund");
        }
        return t("invalid_address", {
            asset: props.swap()?.assetSend ?? "",
        });
    });

    return (
        <Show when={refundableUTXOs()} fallback={<LoadingSpinner />}>
            <Show when={timeoutEta() > 0 || timeoutBlockheight() > 0}>
                <RefundEta
                    timeoutEta={timeoutEta}
                    timeoutBlockHeight={timeoutBlockheight}
                    asset={props.swap().assetSend}
                />
            </Show>
            <Show when={refundableUTXOs().length > 0}>
                <h3 style={{ color: "var(--color-text)" }}>
                    {props.swap()
                        ? t("refund_address_header", {
                              asset: props.swap()?.assetSend ?? "",
                          })
                        : t("refund_address_header_no_asset")}
                </h3>
                <input
                    data-testid="refundAddress"
                    id="refundAddress"
                    value={refundAddress() ?? ""}
                    onInput={(e) => {
                        setRefundAddress(e.target.value.trim());
                        validateRefundAddress();
                    }}
                    disabled={refundRunning()}
                    type="text"
                    name="refundAddress"
                    placeholder={
                        props.swap()
                            ? t("onchain_address", {
                                  asset: props.swap()?.assetSend ?? "",
                              })
                            : t("onchain_address_no_asset")
                    }
                />
            </Show>
            <Show
                when={!props.buttonOverride && refundableUTXOs().length === 0}>
                <p class="frame-text">{t("refresh_for_refund")}</p>
            </Show>
            <button
                data-testid="refundButton"
                class="btn"
                disabled={!valid() || refundRunning()}
                onClick={() => refundAction()}>
                {refundRunning() ? (
                    <LoadingSpinner class="inner-spinner" />
                ) : (
                    (props.buttonOverride ?? buttonMessage())
                )}
            </button>
        </Show>
    );
};

const RefundButton = (props: {
    swap: Accessor<SubmarineSwap>;
    setRefundTxId?: Setter<string>;
    buttonOverride?: string;
    deriveKeyFn?: deriveKeyFn;
}) => {
    const modifySwap = useModifySwap();

    const [refundTxId, setRefundTxId] = createSignal<string>("");

    createEffect(() => {
        const txId = refundTxId();
        if (txId === "") {
            return;
        }

        const currentSwap = untrack(props.swap);
        props.setRefundTxId?.(txId);
        void modifySwap(currentSwap.id, (s) => {
            s.refundTx = txId;
        });
    });
    return (
        <RefundBtc
            swap={props.swap}
            buttonOverride={props.buttonOverride}
            deriveKeyFn={props.deriveKeyFn}
            setRefundTxId={setRefundTxId}
        />
    );
};

export default RefundButton;
