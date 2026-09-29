import { BigNumber } from "bignumber.js";
import { SwapType } from "boltz-swaps/types";

import { BTC, LN } from "../../src/consts/Assets";
import Pair, { RequiredInput } from "../../src/utils/Pair";
import { pairs } from "../pairs";

describe("Pair", () => {
    describe("routing", () => {
        test.each`
            from   | to     | routable | swapType              | requiredInput
            ${BTC} | ${LN}  | ${true}  | ${SwapType.Submarine} | ${RequiredInput.Invoice}
            ${LN}  | ${BTC} | ${true}  | ${SwapType.Reverse}   | ${RequiredInput.Address}
            ${BTC} | ${BTC} | ${false} | ${undefined}          | ${RequiredInput.Unknown}
            ${LN}  | ${LN}  | ${false} | ${undefined}          | ${RequiredInput.Unknown}
        `(
            "$from -> $to routable: $routable",
            ({ from, to, routable, swapType, requiredInput }) => {
                const pair = new Pair(pairs, from, to);
                expect(pair.isRoutable).toEqual(routable);
                expect(pair.swapType).toEqual(swapType);
                expect(pair.requiredInput).toEqual(requiredInput);
                expect(pair.fromAsset).toEqual(from);
                expect(pair.toAsset).toEqual(to);
            },
        );

        test("should not be routable without pairs", async () => {
            const pair = new Pair(undefined, BTC, LN);
            expect(pair.isRoutable).toEqual(false);
            expect(pair.swapType).toBeUndefined();
            expect(pair.requiredInput).toEqual(RequiredInput.Unknown);
            expect(pair.feePercentage).toEqual(0);
            expect(pair.minerFees).toEqual(0);
            expect(await pair.getMinimum()).toEqual(0);
            expect(await pair.getMaximum()).toEqual(0);
            expect(
                await pair.creationData(BigNumber(100_000), 0),
            ).toBeUndefined();
        });

        test("should only need a backup for submarine swaps", () => {
            expect(new Pair(pairs, BTC, LN).needsBackup).toEqual(true);
            expect(new Pair(pairs, LN, BTC).needsBackup).toEqual(false);
        });
    });

    describe("submarine BTC -> LN", () => {
        const pair = new Pair(pairs, BTC, LN);

        test("should read fees from the submarine pair", () => {
            expect(pair.feePercentage).toEqual(0.1);
            expect(pair.minerFees).toEqual(6800);
            expect(pair.maxRoutingFee).toBeUndefined();
        });

        test("should add fees to the limits", async () => {
            // 50_000 + ceil(50_000 * 0.1%) + 6_800
            expect(await pair.getMinimum()).toEqual(56_850);
            // 4_294_967 + ceil(4_294_967 * 0.1%) + 6_800
            expect(await pair.getMaximum()).toEqual(4_306_062);
        });

        test("should round trip send and receive amounts", async () => {
            const send = await pair.calculateSendAmount(
                BigNumber(100_000),
                pair.minerFees,
            );
            expect(send).toEqual(BigNumber(106_900));
            expect(
                await pair.calculateReceiveAmount(send, pair.minerFees),
            ).toEqual(BigNumber(100_000));
            expect(pair.feeOnSend(send)).toEqual(BigNumber(100));
        });

        test("should map LN to BTC in the creation data", async () => {
            expect(
                await pair.creationData(BigNumber(106_900), pair.minerFees),
            ).toEqual({
                type: SwapType.Submarine,
                sendAmount: BigNumber(106_900),
                receiveAmount: BigNumber(100_000),
                from: BTC,
                to: BTC,
                pairHash: pairs[SwapType.Submarine][BTC][BTC].hash,
            });
        });
    });

    describe("reverse LN -> BTC", () => {
        const pair = new Pair(pairs, LN, BTC);

        test("should read fees from the reverse pair", () => {
            expect(pair.feePercentage).toEqual(0.5);
            expect(pair.minerFees).toEqual(5520 + 6120);
            expect(pair.maxRoutingFee).toBeUndefined();
        });

        test("should use the pair limits as they are", async () => {
            expect(await pair.getMinimum()).toEqual(50_000);
            expect(await pair.getMaximum()).toEqual(4_294_967);
        });

        test("should round trip send and receive amounts", async () => {
            const send = await pair.calculateSendAmount(
                BigNumber(100_000),
                pair.minerFees,
            );
            // ceil((100_000 + 11_640) / 0.995)
            expect(send).toEqual(BigNumber(112_202));
            expect(
                await pair.calculateReceiveAmount(send, pair.minerFees),
            ).toEqual(BigNumber(100_000));
            expect(pair.feeOnSend(send)).toEqual(BigNumber(562));
        });

        test("should map LN to BTC in the creation data", async () => {
            expect(
                await pair.creationData(BigNumber(112_202), pair.minerFees),
            ).toEqual({
                type: SwapType.Reverse,
                sendAmount: BigNumber(112_202),
                receiveAmount: BigNumber(100_000),
                from: BTC,
                to: BTC,
                pairHash: pairs[SwapType.Reverse][BTC][BTC].hash,
            });
        });
    });
});
