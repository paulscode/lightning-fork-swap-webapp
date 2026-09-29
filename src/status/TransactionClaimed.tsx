import { hex } from "@scure/base";
import { useNavigate } from "@solidjs/router";
import { BigNumber } from "bignumber.js";
import { getSubmarinePreimage } from "boltz-swaps/client";
import { assertPreimageHash, decodeInvoice } from "boltz-swaps/invoice";
import { SwapType } from "boltz-swaps/types";
import log from "loglevel";
import { Show, createEffect, createResource, createSignal } from "solid-js";

import CopyButton from "../components/CopyButton";
import { useGlobalContext } from "../context/Global";
import { usePayContext } from "../context/Pay";
import { useModifySwap } from "../hooks/useModifySwap";
import { formatAmount, formatDenomination } from "../utils/denomination";
import { formatError } from "../utils/errors";
import {
    type SubmarineSwap,
    getFinalAssetReceive,
} from "../utils/swapCreator";
import Broadcasting from "./Broadcasting";

const TransactionClaimed = () => {
    const navigate = useNavigate();

    const { notify, t, denomination, separator } = useGlobalContext();
    const { swap } = usePayContext();
    const modifySwap = useModifySwap();

    const [claimBroadcast, setClaimBroadcast] = createSignal<
        boolean | undefined
    >(undefined);

    const [preimage] = createResource(async () => {
        const submarine = swap() as SubmarineSwap;
        if (submarine?.type !== SwapType.Submarine) {
            return undefined;
        }

        if (submarine.preimage !== undefined) {
            return submarine.preimage;
        }

        const res = await getSubmarinePreimage(submarine.id);
        try {
            assertPreimageHash(
                decodeInvoice(submarine.invoice).preimageHash,
                hex.decode(res.preimage),
            );
        } catch (e) {
            log.error("Preimage check failed", e);
            notify("error", formatError(e));
            return undefined;
        }

        await modifySwap<SubmarineSwap>(submarine.id, (s) => {
            s.preimage = res.preimage;
        });
        return res.preimage;
    });

    createEffect(() => {
        const s = swap();
        if (s === undefined || s === null) {
            return;
        }

        // For reverse swaps, make sure the claim transaction was broadcast
        setClaimBroadcast(s.type !== SwapType.Reverse || s.claimTx !== undefined);
    });

    const receiveAmount = () => {
        const current = swap()!;
        return formatAmount(
            BigNumber(current.receiveAmount ?? 0),
            denomination(),
            separator(),
            getFinalAssetReceive(current),
        );
    };

    const receiveDenomination = () =>
        formatDenomination(denomination(), getFinalAssetReceive(swap()!));

    return (
        <div>
            <Show when={claimBroadcast() === true} fallback={<Broadcasting />}>
                <h2>{t("congrats")}</h2>
                <p>
                    {t("successfully_swapped", {
                        amount: receiveAmount(),
                        denomination: receiveDenomination(),
                    })}
                </p>
                <hr />
                <span class="btn" onClick={() => navigate("/swap")}>
                    {t("new_swap")}
                </span>
                <Show when={!preimage.loading && preimage() !== undefined}>
                    <CopyButton
                        label="copy_preimage"
                        btnClass="btn btn-light"
                        data={preimage()!}
                    />
                </Show>
            </Show>
        </div>
    );
};

export default TransactionClaimed;
