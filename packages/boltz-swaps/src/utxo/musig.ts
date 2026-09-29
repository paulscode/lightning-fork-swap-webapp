import { type Transaction as BtcTransaction, SigHash } from "@scure/btc-signer";
import { Musig, TaprootUtils, type Types } from "boltz-core";

export interface ECKeys {
    privateKey: Uint8Array;
    publicKey: Uint8Array;
}

export const createMusig = (
    ourKeys: ECKeys,
    theirPublicKey: Uint8Array,
): Musig.MusigKeyAgg =>
    Musig.create(new Uint8Array(ourKeys.privateKey), [
        // The key of the server always comes first
        theirPublicKey,
        new Uint8Array(ourKeys.publicKey),
    ]);

export const tweakMusig = (
    musig: Musig.MusigKeyAgg,
    tree: Types.TapTree,
): Musig.MusigKeyAgg => TaprootUtils.tweakMusig(musig, tree);

export const hashForWitnessV1 = (
    inputs: { script: Uint8Array; amount: bigint }[],
    tx: BtcTransaction,
    index: number,
) =>
    tx.preimageWitnessV1(
        index,
        inputs.map((i) => i.script),
        SigHash.DEFAULT,
        inputs.map((i) => i.amount),
    );
