/* @refresh reload */
import "@fontsource/noto-mono/index.css";
import "@fontsource/noto-sans/200.css";
import "@fontsource/noto-sans/800.css";
import "@fontsource/noto-sans/index.css";
import {
    Route,
    type RouteSectionProps,
    Router,
    useLocation,
} from "@solidjs/router";
import { setLogger } from "boltz-swaps/logger";
import log from "loglevel";
import { Show } from "solid-js";
import { render } from "solid-js/web";

import { configureBoltzSwaps } from "./boltzSwapsConfig";
import Footer from "./components/Footer";
import { legacyRescueRedirects } from "./components/LegacyRescueRedirects";
import Nav from "./components/Nav";
import Notification from "./components/Notification";
import { SwapChecker } from "./components/SwapChecker";
import { config } from "./config";
import { CreateProvider } from "./context/Create";
import { GlobalProvider } from "./context/Global";
import { PayProvider } from "./context/Pay";
import { RescueProvider } from "./context/Rescue";
import ClaimRescue from "./pages/ClaimRescue";
import Create from "./pages/Create";
import Error from "./pages/Error";
import Hero from "./pages/Hero";
import History from "./pages/History";
import NotFound from "./pages/NotFound";
import Pay from "./pages/Pay";
import Privacy from "./pages/Privacy";
import RefundRescue from "./pages/RefundRescue";
import Rescue from "./pages/Rescue";
import Suspension from "./pages/Suspension";
import Terms from "./pages/Terms";
import "./style/index.scss";

setLogger(log);
configureBoltzSwaps();

if ("serviceWorker" in navigator) {
    void navigator.serviceWorker
        .register("/service-worker.js", { scope: "/" })
        .then((reg) => {
            log.info(`Registration succeeded. Scope is ${reg.scope}`);
        });
}

log.setLevel(config.loglevel as log.LogLevelDesc);

const resourceErrorHandler = (event: Event) => {
    const target = event.target;
    if (
        target instanceof HTMLScriptElement ||
        target instanceof HTMLLinkElement
    ) {
        const url =
            target instanceof HTMLScriptElement ? target.src : target.href;
        log.error(`failed to load resource: ${url}`);
    }
};
window.addEventListener("error", resourceErrorHandler, true);

const urlParams = new URLSearchParams(window.location.search);
const embeddedParam = urlParams.get("embedded");
const parentOriginParam = urlParams.get("parentOrigin");

// There is a single dark theme
document.documentElement.setAttribute("boltz-theme", "default");
document.body.classList.remove("loading");

const App = (props: RouteSectionProps) => {
    const isEmbedded = embeddedParam === "true";
    const location = useLocation();

    const isEmbeddedRoot = () => isEmbedded && location.pathname === "/";

    return (
        <GlobalProvider
            initialEmbeddedMode={isEmbedded}
            initialParentOrigin={parentOriginParam ?? undefined}>
            <CreateProvider>
                <PayProvider>
                    <RescueProvider>
                        <SwapChecker />
                        <Show when={!isEmbedded}>
                            <Nav network={config.network} />
                        </Show>
                        <Show when={!isEmbeddedRoot()} fallback={<Create />}>
                            {props.children}
                        </Show>
                        <Notification />
                        <Show when={!isEmbedded}>
                            <Footer />
                        </Show>
                    </RescueProvider>
                </PayProvider>
            </CreateProvider>
        </GlobalProvider>
    );
};

const cleanup = render(
    () => (
        <Router root={App}>
            <Route
                path="/"
                component={config.swapsSuspended ? Suspension : Hero}
            />
            <Route
                path="/swap"
                component={config.swapsSuspended ? Suspension : Create}
            />
            <Route path="/swap/:id" component={Pay} />
            <Route path="/swap/:id/claim" component={ClaimRescue} />
            <Route path="/error" component={() => <Error />} />
            <Route path="/rescue" component={Rescue} />
            <Route path="/rescue/claim/:id" component={ClaimRescue} />
            <Route path="/rescue/refund/:id" component={RefundRescue} />
            {legacyRescueRedirects()}
            <Route path="/history" component={History} />
            <Route path="/terms" component={Terms} />
            <Route path="/privacy" component={Privacy} />
            <Route path="*404" component={NotFound} />
        </Router>
    ),
    document.getElementById("root")!,
);

if (import.meta.hot) {
    log.info("Hot reload");
    import.meta.hot.dispose(() => {
        cleanup();
        window.removeEventListener("error", resourceErrorHandler, true);
    });
}
