import { Route, Router } from "@solidjs/router";
import type { JSX } from "solid-js";

import {
    type CreateContextType,
    CreateProvider,
    useCreateContext,
} from "../src/context/Create";
import {
    type GlobalContextType,
    GlobalProvider,
    useGlobalContext,
} from "../src/context/Global";
import {
    type PayContextType,
    PayProvider,
    usePayContext,
} from "../src/context/Pay";
import { RescueProvider } from "../src/context/Rescue";
import { pairs as testPairs } from "./pairs";

export let signals: CreateContextType;
export let globalSignals: GlobalContextType;
export let payContext: PayContextType;

export const TestComponent = () => {
    const createSignals = useCreateContext();
    payContext = usePayContext();
    globalSignals = useGlobalContext();

    // Keep test behavior stable by providing default routable pairs.
    if (globalSignals.pairs() === undefined) {
        globalSignals.setPairs(testPairs);
    }

    signals = createSignals;

    return "";
};

export const contextWrapper = (props: { children: JSX.Element }) => {
    const App = () => (
        <GlobalProvider>
            <CreateProvider>
                <PayProvider>
                    <RescueProvider>
                        <Router>
                            <Route path="/" component={() => props.children} />
                        </Router>
                    </RescueProvider>
                </PayProvider>
            </CreateProvider>
        </GlobalProvider>
    );

    return (
        <Router root={App}>
            <Route path="/" component={() => props.children} />
        </Router>
    );
};
