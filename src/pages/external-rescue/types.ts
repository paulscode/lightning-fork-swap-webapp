import type { Swap } from "../../components/SwapList";
import type { RescueAction } from "../../utils/rescue";

export enum BtcSearchState {
    Idle = "idle",
    Loading = "loading",
    Ready = "ready",
    Errored = "errored",
}

export type RescueResult = {
    key: string;
    action: RescueAction;
    actionable: boolean;
    sortValue: number;
    swap: Swap;
};
