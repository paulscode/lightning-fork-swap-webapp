import {
    type LockupTransaction,
    getReverseTransaction,
} from "boltz-swaps/client";
import { SwapType } from "boltz-swaps/types";
import { parseTransaction } from "boltz-swaps/utxo";
import log from "loglevel";
import {
    type Accessor,
    type JSX,
    type Setter,
    createContext,
    createEffect,
    createSignal,
    on,
    useContext,
} from "solid-js";

import { hiddenInformation } from "../components/settings/PrivacyMode";
import { swapStatusPending, swapStatusSuccess } from "../consts/SwapStatus";
import { createSwapModifier } from "../hooks/useModifySwap";
import { getTransactionOutSpend } from "../utils/blockchain";
import {
    claim,
    createSubmarineSignature,
    findSwapOutputVout,
} from "../utils/claim";
import { formatError } from "../utils/errors";
import { getPair } from "../utils/helper";
import { isSwapClaimable } from "../utils/rescue";
import type {
    ReverseSwap,
    SomeSwap,
    SubmarineSwap,
} from "../utils/swapCreator";
import { useGlobalContext } from "./Global";

type SwapStatus = {
    id: string;
    status: string;

    failureReason?: string;
    transaction?: SwapStatusTransaction;
};

export type PayContextType = {
    failureReason: Accessor<string>;
    setFailureReason: Setter<string>;
    swap: Accessor<SomeSwap | null>;
    setSwap: Setter<SomeSwap | null>;
    swapStatus: Accessor<string>;
    setSwapStatus: Setter<string>;
    swapStatusTransaction: Accessor<SwapStatusTransaction>;
    setSwapStatusTransaction: Setter<SwapStatusTransaction>;
    refundableUTXOs: Accessor<
        (Partial<LockupTransaction> & Pick<LockupTransaction, "hex">)[]
    >;
    setRefundableUTXOs: Setter<
        (Partial<LockupTransaction> & Pick<LockupTransaction, "hex">)[]
    >;
    shouldIgnoreBackendStatus: Accessor<boolean>;
    setShouldIgnoreBackendStatus: Setter<boolean>;
    claimSwap: (swapId: string, data: SwapStatus) => Promise<void>;
    isSwapClaiming: (swapId: string) => boolean;
};

const PayContext = createContext<PayContextType>();

type SwapStatusTransaction = {
    hex?: string;
    id?: string;
};

const PayProvider = (props: { children: JSX.Element }) => {
    const {
        t,
        deriveKey,
        getSwap,
        privacyMode,
        notify,
        pairs,
        modifySwapStorage,
        zeroConf,
        getSwaps,
    } = useGlobalContext();
    const [failureReason, setFailureReason] = createSignal<string>("");
    const [swap, setSwap] = createSignal<SomeSwap | null>(null, {
        // To allow updating properties of the swap object without replacing it completely
        equals: () => false,
    });

    // Locked read-modify-write of a stored swap that also keeps the displayed
    // swap signal in sync. PayProvider cannot call usePayContext on itself, so
    // it builds the helper directly from the factory.
    const modifySwap = createSwapModifier(modifySwapStorage, swap, setSwap);
    const [swapStatus, setSwapStatus] = createSignal<string>("");
    const [swapStatusTransaction, setSwapStatusTransaction] =
        createSignal<SwapStatusTransaction>({});
    const [refundableUTXOs, setRefundableUTXOs] = createSignal<
        (Partial<LockupTransaction> & Pick<LockupTransaction, "hex">)[]
    >([]);
    const [shouldIgnoreBackendStatus, setShouldIgnoreBackendStatus] =
        createSignal<boolean>(false);

    const [claimingSwaps, setClaimingSwaps] = createSignal(new Set<string>(), {
        equals: false,
    });
    const isSwapClaiming = (swapId: string) => claimingSwaps().has(swapId);
    const claimSwap = async (swapId: string, data: SwapStatus) => {
        if (claimingSwaps().has(swapId)) {
            return;
        }

        const currentSwap = await getSwap(swapId);
        if (currentSwap === null) {
            log.warn(`claimSwap: swap ${swapId} not found`);
            return;
        }

        if (
            (currentSwap.type === SwapType.Reverse &&
                zeroConf() &&
                data.status === swapStatusPending.TransactionMempool) || // necessary for the autoclaim when zeroConf is toggled with a pending swap
            data.status === swapStatusSuccess.InvoiceSettled
        ) {
            data.transaction = await getReverseTransaction(currentSwap.id);
        }

        if (
            currentSwap.claimTx === undefined &&
            data.transaction !== undefined &&
            isSwapClaimable({
                status: data.status,
                type: currentSwap.type,
                includeSuccess: true,
                zeroConf: zeroConf(),
            })
        ) {
            try {
                setClaimingSwaps((swaps) => {
                    swaps.add(swapId);
                    return swaps;
                });

                const transaction = data.transaction as { hex: string };
                const res = await navigator.locks.request(
                    `claim:${swapId}`,
                    async () => {
                        const claimableSwap =
                            await getSwap<ReverseSwap>(swapId);
                        if (
                            claimableSwap === null ||
                            claimableSwap.claimTx !== undefined
                        ) {
                            return undefined;
                        }
                        if (
                            !Number.isFinite(claimableSwap.receiveAmount) ||
                            claimableSwap.receiveAmount <= 0
                        ) {
                            throw new Error(
                                `swap ${swapId} has an invalid persisted receive amount`,
                            );
                        }

                        const result = await claim(
                            deriveKey,
                            claimableSwap,
                            transaction,
                            true,
                            data.status === swapStatusSuccess.InvoiceSettled,
                        );
                        const claimedSwap = await modifySwap(result.id, (s) => {
                            s.claimTx = result.claimTx;
                        });
                        return claimedSwap === null ? undefined : result;
                    },
                );
                if (res === undefined) {
                    return;
                }

                notify(
                    "success",
                    t("swap_completed", {
                        id: privacyMode() ? hiddenInformation : res.id,
                    }),
                );
            } catch (e) {
                if (
                    typeof e === "string" &&
                    (e.includes("bad-txns-inputs-missingorspent") ||
                        e.includes("Transaction outputs already in utxo set") ||
                        e.includes("Inputs missing or spent"))
                ) {
                    if (
                        data.transaction === undefined ||
                        data.transaction.hex === undefined
                    ) {
                        return;
                    }
                    const lockupTx = parseTransaction(data.transaction.hex);
                    const vout = findSwapOutputVout(
                        deriveKey,
                        currentSwap as ReverseSwap,
                        lockupTx,
                    );

                    if (vout !== undefined) {
                        try {
                            log.debug(
                                `swap ${currentSwap.id}: checking for spent status of tx output ${data.transaction.id}:${vout}`,
                            );
                            if (data.transaction.id === undefined) {
                                return;
                            }
                            const outspend = await getTransactionOutSpend(
                                currentSwap.assetReceive,
                                data.transaction.id,
                                vout,
                            );

                            if (outspend?.spent && outspend.txid) {
                                log.debug(
                                    `swap ${currentSwap.id}: lockup tx was already claimed, updating claimTx id to ${outspend.txid}`,
                                );
                                const claimTxId = outspend.txid;
                                await modifySwap(currentSwap.id, (s) => {
                                    s.claimTx = claimTxId;
                                });

                                return;
                            }
                            log.debug(
                                `got bad-txns-inputs-missingorspent when claiming swap ${currentSwap.id} but tx ${data.transaction.id} is not spent`,
                            );
                        } catch (e) {
                            log.error(
                                `could not check if lockup tx from swap ${currentSwap.id} is spent: ${formatError(e)}`,
                            );
                        }
                    }
                }

                const msg = t("claim_fail", {
                    id: privacyMode() ? hiddenInformation : currentSwap.id,
                });
                log.error(msg, e);
                notify("error", msg);
            } finally {
                setClaimingSwaps((swaps) => {
                    swaps.delete(swapId);
                    return swaps;
                });
            }
        } else if (
            currentSwap.type === SwapType.Submarine &&
            data.status === swapStatusPending.TransactionClaimPending &&
            currentSwap.receiveAmount >=
                (getPair(
                    pairs(),
                    currentSwap.type,
                    currentSwap.assetSend,
                    currentSwap.assetReceive,
                )?.limits.minimal ?? Number.MAX_SAFE_INTEGER)
        ) {
            try {
                await createSubmarineSignature(
                    deriveKey,
                    currentSwap as SubmarineSwap,
                );
                notify(
                    "success",
                    t("swap_completed", {
                        id: privacyMode() ? hiddenInformation : currentSwap.id,
                    }),
                );
            } catch (e) {
                if (e === "swap not eligible for a cooperative claim") {
                    log.debug(
                        `Server did not want help claiming ${currentSwap.id}`,
                    );
                    return;
                }

                const msg =
                    "creating cooperative signature for submarine swap claim failed";
                log.warn(msg, e);
                notify("error", msg);
            }
        }
    };

    createEffect(
        on([zeroConf], async () => {
            if (!zeroConf()) {
                return;
            }

            // Attempt to claim eligible swaps when zeroConf changes to true
            const swaps = await getSwaps();
            for (const swap of swaps) {
                if (swap.status === undefined) {
                    continue;
                }
                if (
                    isSwapClaimable({
                        status: swap.status,
                        type: swap.type,
                        zeroConf: zeroConf(),
                    })
                ) {
                    try {
                        await claimSwap(swap.id, {
                            id: swap.id,
                            status: swap.status,
                        });
                    } catch (e) {
                        log.warn(
                            `Error claiming swap ${swap.id}: ${formatError(e)}`,
                        );
                        continue;
                    }
                }
            }
        }),
    );

    return (
        <PayContext.Provider
            value={{
                failureReason,
                setFailureReason,
                swap,
                setSwap,
                swapStatus,
                setSwapStatus,
                swapStatusTransaction,
                setSwapStatusTransaction,
                refundableUTXOs,
                setRefundableUTXOs,
                shouldIgnoreBackendStatus,
                setShouldIgnoreBackendStatus,
                claimSwap,
                isSwapClaiming,
            }}>
            {props.children}
        </PayContext.Provider>
    );
};

const usePayContext = () => {
    const context = useContext(PayContext);
    if (!context) {
        throw new Error("usePayContext: cannot find a PayContext");
    }
    return context;
};

export { usePayContext, PayProvider, SwapStatusTransaction };
