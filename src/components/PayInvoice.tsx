import { BigNumber } from "bignumber.js";
import { Show } from "solid-js";

import CopyButton from "../components/CopyButton";
import QrCode from "../components/QrCode";
import { BTC } from "../consts/Assets";
import { useGlobalContext } from "../context/Global";
import { formatAmount, formatDenomination } from "../utils/denomination";
import { isMobile } from "../utils/helper";
import { invoicePrefix } from "../utils/invoice";
import CopyBox from "./CopyBox";

const PayInvoice = (props: { sendAmount: number; invoice: string }) => {
    const { t, denomination, separator } = useGlobalContext();

    return (
        <div>
            <h2 data-testid="pay-invoice-title">
                {t("pay_invoice_to", {
                    amount: formatAmount(
                        BigNumber(props.sendAmount ?? 0),
                        denomination(),
                        separator(),
                        BTC,
                    ),
                    denomination: formatDenomination(denomination(), BTC),
                })}
            </h2>
            <hr />
            <a href={invoicePrefix + props.invoice}>
                <QrCode data={props.invoice} />
            </a>
            <hr />
            <CopyBox value={props.invoice} />
            <hr />
            <Show when={isMobile()}>
                <h3>{t("warning_return")}</h3>
                <hr />
            </Show>
            <Show when={isMobile()}>
                <a href={invoicePrefix + props.invoice} class="btn btn-light">
                    {t("open_in_wallet")}
                </a>
            </Show>
            <hr class="spacer" />
            <CopyButton label="copy_invoice" data={props.invoice} />
        </div>
    );
};

export default PayInvoice;
