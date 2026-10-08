import BigNumber from "bignumber.js";
import type {
    Pairs,
    ReversePairTypeTaproot,
    SubmarinePairTypeTaproot,
} from "boltz-swaps/client";
import { SwapType } from "boltz-swaps/types";
import log from "loglevel";

import { config } from "../config";
import { BTC, LN } from "../consts/Assets";
import {
    calculateBoltzFeeOnSend,
    calculateReceiveAmount,
    calculateSendAmount,
} from "./calculate";

export const enum RequiredInput {
    Address,
    Invoice,
    Unknown,
}

type Hop = {
    type: SwapType;
    from: string;
    to: string;
    pair: SubmarinePairTypeTaproot | ReversePairTypeTaproot;
};

export type CreationData = {
    type: SwapType;
    sendAmount: BigNumber;
    receiveAmount: BigNumber;
    from: string;
    to: string;
    pairHash: string;
};

// A swap direction between on-chain BTC and Lightning: submarine
// (BTC -> LN) or reverse (LN -> BTC)
export default class Pair {
    private readonly hop: Hop | undefined;

    constructor(
        public readonly pairs: Pairs | undefined,
        private readonly from: string,
        private readonly to: string,
    ) {
        if (
            config.assets?.[from]?.canSend === false ||
            config.assets?.[from]?.disabled === true ||
            config.assets?.[to]?.disabled === true
        ) {
            log.info(`Pair ${from} -> ${to} is disabled`);
            return;
        }

        this.hop = Pair.findPair(pairs, from, to);
        // Before the pairs have loaded there is nothing to find yet
        if (this.hop === undefined && pairs !== undefined) {
            log.info(`No pair found for ${from} -> ${to}`);
        }
    }

    private static findPair = (
        pairs: Pairs | undefined,
        from: string,
        to: string,
    ): Hop | undefined => {
        if (pairs === undefined) {
            return undefined;
        }

        if (to === LN && from !== LN) {
            const pair = pairs[SwapType.Submarine]?.[from]?.[BTC];
            return pair === undefined
                ? undefined
                : { type: SwapType.Submarine, from, to, pair };
        }

        if (from === LN && to !== LN) {
            const pair = pairs[SwapType.Reverse]?.[BTC]?.[to];
            return pair === undefined
                ? undefined
                : { type: SwapType.Reverse, from, to, pair };
        }

        return undefined;
    };

    public get isRoutable() {
        return this.hop !== undefined;
    }

    public get requiredInput() {
        if (this.hop === undefined) {
            return RequiredInput.Unknown;
        }

        return this.hop.type === SwapType.Submarine
            ? RequiredInput.Invoice
            : RequiredInput.Address;
    }

    // Submarine swaps lock funds on chain that can only be refunded with the
    // rescue key
    public get needsBackup() {
        return this.hop?.type === SwapType.Submarine;
    }

    public get fromAsset() {
        return this.from;
    }

    public get toAsset() {
        return this.to;
    }

    public get swapType(): SwapType | undefined {
        return this.hop?.type;
    }

    public get feePercentage() {
        return this.hop?.pair.fees.percentage ?? 0;
    }

    public get maxRoutingFee() {
        if (this.hop?.type !== SwapType.Submarine) {
            return undefined;
        }

        const fee = (this.hop.pair as SubmarinePairTypeTaproot).fees
            .maximalRoutingFee;
        return fee === undefined || fee === 0 ? undefined : fee;
    }

    public get minerFees() {
        if (this.hop === undefined) {
            return 0;
        }

        if (this.hop.type === SwapType.Submarine) {
            return (this.hop.pair as SubmarinePairTypeTaproot).fees.minerFees;
        }

        const fees = (this.hop.pair as ReversePairTypeTaproot).fees.minerFees;
        return fees.claim + fees.lockup;
    }

    public getMinimum = (): Promise<number> => {
        if (this.hop === undefined) {
            return Promise.resolve(0);
        }

        if (this.hop.type !== SwapType.Submarine) {
            return Promise.resolve(this.hop.pair.limits.minimal);
        }

        const pair = this.hop.pair as SubmarinePairTypeTaproot;
        return Promise.resolve(
            calculateSendAmount(
                BigNumber(pair.limits.minimalBatched || pair.limits.minimal),
                this.feePercentage,
                this.minerFees,
                this.hop.type,
            ).toNumber(),
        );
    };

    public getMaximum = (): Promise<number> => {
        if (this.hop === undefined) {
            return Promise.resolve(0);
        }

        if (this.hop.type !== SwapType.Submarine) {
            return Promise.resolve(this.hop.pair.limits.maximal);
        }

        return Promise.resolve(
            calculateSendAmount(
                BigNumber(this.hop.pair.limits.maximal),
                this.feePercentage,
                this.minerFees,
                this.hop.type,
            ).toNumber(),
        );
    };

    public feeOnSend = (sendAmount: BigNumber) => {
        if (this.hop === undefined) {
            return BigNumber(0);
        }

        return calculateBoltzFeeOnSend(
            sendAmount,
            this.feePercentage,
            this.minerFees,
            this.hop.type,
        );
    };

    public calculateReceiveAmount = (
        sendAmount: BigNumber,
        minerFees: number,
    ): Promise<BigNumber> => {
        if (this.hop === undefined) {
            return Promise.resolve(BigNumber(0));
        }

        return Promise.resolve(
            calculateReceiveAmount(
                sendAmount,
                this.feePercentage,
                minerFees,
                this.hop.type,
            ),
        );
    };

    public calculateSendAmount = (
        receiveAmount: BigNumber,
        minerFees: number,
    ): Promise<BigNumber> => {
        if (this.hop === undefined) {
            return Promise.resolve(BigNumber(0));
        }

        return Promise.resolve(
            calculateSendAmount(
                receiveAmount,
                this.feePercentage,
                minerFees,
                this.hop.type,
            ),
        );
    };

    public creationData = async (
        sendAmount: BigNumber,
        minerFees: number,
    ): Promise<CreationData | undefined> => {
        if (this.hop === undefined) {
            return undefined;
        }

        return {
            type: this.hop.type,
            sendAmount,
            receiveAmount: await this.calculateReceiveAmount(
                sendAmount,
                minerFees,
            ),
            // The API calls the Lightning side of a pair BTC as well
            from: this.hop.from === LN ? BTC : this.hop.from,
            to: this.hop.to === LN ? BTC : this.hop.to,
            pairHash: this.hop.pair.hash,
        };
    };
}
