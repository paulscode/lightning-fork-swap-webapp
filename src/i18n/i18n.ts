const dict = {
    en: {
        language: "English",
        or: "or",
        status: "Status",
        error: "Error",
        error_subline: "Invalid response from the API, something is wrong.",
        error_wasm: "WebAssembly not supported",
        history: "History",
        swap: "Swap",
        refund: "Refund",
        support: "Support",
        onion: "Onion",
        terms: "Terms",
        privacy: "Privacy",
        blockexplorer: "Open {{ typeLabel }}",
        blockexplorer_lockup_address: "lockup address",
        blockexplorer_lockup_tx: "Lockup Transaction",
        blockexplorer_claim_tx: "claim transaction",
        blockexplorer_refund_tx: "refund transaction",
        network_fee: "Network Fee",
        swap_fees: "Swap Fees",
        fee: "Service Fee",
        denomination: "Denomination",
        send: "Send",
        continue: "Continue",
        receive: "Receive",
        max: "Max",
        minimum_amount: "Minimum amount is {{ amount }} {{ denomination }}",
        maximum_amount: "Maximum amount is {{ amount }} {{ denomination }}",
        create_swap: "Create Swap",
        new_swap: "New Swap",
        feecheck:
            "Network fee was updated based on network situation, please confirm new amounts and continue with swap.",
        amount_limits_changed:
            "Swap limits changed. Please confirm new amounts and continue with swap.",
        create_and_paste:
            "Paste a Lightning invoice, LNURL or Lightning address",
        invoice_cleared_amount_changed:
            "Invoice cleared because the amount changed.",
        congrats: "Congratulations!",
        successfully_swapped:
            "You successfully received {{ amount }} {{ denomination }}!",
        timeout_eta: "Timeout ETA",
        pay_invoice: "Swap: {{ id }}",
        pay_swap_404: "Swap not found!",
        pay_timeout_blockheight: "Timeout Block Height ({{ network }})",
        send_to: "Send {{ amount }} {{ denomination }} to",
        send_between:
            "Send between {{ min }} and {{ max }} {{ denomination }} to",
        pay_invoice_to:
            "Pay this invoice about {{ amount }} {{ denomination }}",
        lockup_failed: "Lockup Failed!",
        failure_reason: "Failure reason",
        invoice_payment_failure: "Could not pay your lightning invoice",
        onchain_address: "Enter {{ asset }} address to receive funds",
        onchain_address_no_asset: "Enter address",
        invalid_refund_file: "Invalid rescue key",
        invalid_invoice:
            "Please provide a valid Lightning invoice, LNURL or Lightning address",
        invalid_0_amount: "Invoices without amount are not supported",
        copy_invoice: "Lightning invoice",
        copy_address: "Address",
        copy_amount: "Amount",
        copy_bip21: "BIP21",
        rescue_a_swap_mnemonic:
            "Enter your rescue key to rescue a swap that is not available in this browser’s swap history.",
        refund_past_swaps: "Past swaps",
        refund_past_swaps_subline:
            "Swaps that got saved into your browsers storage",
        history_no_swaps: "Looks like you didn't do any swaps yet.",
        refund_address_header:
            "Enter a {{ asset }} address to receive your refund on:",
        refund_address_header_no_asset:
            "Enter an address to receive your refund on:",
        history_export: "Export",
        refund_clear: "Delete storage",
        delete_storage:
            "Are you sure you want to clear your storage?\nYour swap information and you refund / claim private keys will be lost.",
        delete_storage_single_swap:
            "Are you sure you want to clear Swap {{ id }} from your storage?\nYour swap information and you refund / claim private keys will be lost.",
        delete_logs: "Are you sure you want to clear your logs?",
        tx_in_mempool: "Transaction is in mempool",
        tx_in_mempool_subline: "Waiting for confirmation to complete the swap.",
        invoice_pending: "Transaction received, paying invoice.",
        invoice_expired: "Invoice expired, try again!",
        create_invoice_webln: "Create invoice via WebLN",
        pay_invoice_webln: "Pay invoice via WebLN",
        search: "Search",
        tx_confirmed: "Transaction confirmed",
        tx_ready_to_claim: "Claiming transaction now...",
        refunded: "Swap has been refunded successfully!",
        locktime_not_satisfied: "Locktime requirement not satisfied",
        already_refunded: "Swap already refunded",
        api_offline: "API is offline",
        api_offline_msg:
            "Could not connect to the swap API, please try again later",
        refund_explainer: "You will be able to refund after the swap timeout!",
        wasm_not_supported: "Please activate WebAssembly in your browser",
        created: "Created",
        id: "ID",
        headline: "Lightning Fork Swap",
        subline:
            "Swap between the Bitcoin (BLAKE2b) chain and its Lightning network. Non-custodial: your keys never leave your browser.",
        start_swapping: "Start Swapping",
        warning_return:
            "Return to this page after paying the invoice! The payment might show pending until you return to this page.",
        warning_expiry:
            "Make sure your transaction confirms within ~24 hours after creation of this swap!",
        not_found: "404 - Not Found",
        not_found_subline: "This page seems to have vanished.",
        back_to_home: "Back to Home",
        invalid_address: "Invalid {{ asset }} address",
        scan_qr_code: "Scan QR Code",
        version: "Version",
        commithash: "Commit Hash",
        open_in_wallet: "Open in Wallet",
        broadcasting_claim: "Broadcasting claim transaction...",
        paste_invalid:
            "Clipboard contains invalid characters or maximum amount is exceeded",
        switch_paste: "Switched swap direction/asset based on pasted content",
        settings: "Settings",
        decimal_separator: "Decimal Separator",
        denomination_tooltip: "Choose your preferred denomination: BTC or sats",
        decimal_tooltip:
            "Choose your preferred decimal separator: dot or comma",
        swap_completed: "Swap {{ id }} completed successfully!",
        claim_fail: "Failed to claim swap: {{ id }}",
        logs: "Logs",
        logs_tooltip: "Logs of the web app, useful for debugging",
        hide_wallet_address: "Privacy Mode",
        hide_wallet_address_tooltip:
            "Hides swap IDs and addresses for privacy in demos and recordings",
        retry: "Retry",
        error_no_quote:
            "A quote could not be obtained. Please check your connection and try again.",
        error_zero_quote: "Increase send amount",
        zero_conf: "Zero-Conf",
        zero_conf_tooltip:
            "Accept transactions that are not yet confirmed in a block",
        on: "on",
        off: "off",
        invalid_pair: "Invalid pair",
        invalid_send_asset: "Invalid send asset",
        error_starting_qr_scanner:
            "Couldn't access camera, please check permissions!",
        block: "block",
        accept: "Accept",
        no_lockup_transaction: "No lockup transaction found",
        routing_fee_limit: "Routing Fee Limit",
        download_boltz_rescue_key: "Rescue Key",
        download_boltz_rescue_key_subline:
            "Back up all your swaps with a single Rescue Key 🙌",
        download_boltz_rescue_key_subline_second:
            "This key works on any device and for all swaps created with it.",
        download_boltz_rescue_key_subline_backup:
            "To continue, please back it up.",
        download_boltz_rescue_key_subline_privacy:
            "**Careful:** Privacy-focused browsers may delete downloaded files when closed.",
        download_boltz_rescue_key_subline_save:
            "Save the Rescue Key in a **SECURE** and **PERMANENT** location!",
        download_boltz_rescue_key_subline_warning:
            "Failing to do so may lead to **LOSS OF FUNDS**.",
        download_new_key: "Download rescue key",
        verify_boltz_rescue_key: "Verify Rescue Key",
        verify_boltz_rescue_key_subline:
            "Please select your previously saved Rescue Key to verify it.",
        verify_key: "Verify key",
        verify_key_failed:
            "Verification of the Rescue Key failed. We recommend downloading a new Rescue Key to continue.",
        rescue_key: "Rescue Key",
        reset_rescue_key_prompt:
            "⚠️ WARNING: This will delete ALL your swap data and generate a new Rescue Key.\n\nDon't proceed unless you have a backup of your existing Rescue Key or you're absolutely sure you won't need it. \n\nType 'confirm' to proceed:",
        reset_rescue_key_invalid_confirmation:
            "Invalid confirmation. Please type 'confirm' to proceed.",
        reset_rescue_key_error:
            "An error occurred while resetting the Rescue Key. Please reload this page and try again.\n\nError: {{ error }}",
        reset_rescue_key_success: "New Rescue Key generated successfully!",
        no_swaps_found: "No swaps found",
        back: "Back",
        next: "Next",
        pagination_info: "Page {{ start }} of {{ end }}",
        show_rescue_key_instead: "Show the 12-word rescue key instead",
        backup_boltz_rescue_key: "Back up your Rescue Key",
        backup_boltz_rescue_key_subline_second:
            "This new key works on any device and works for all swaps created with it.",
        backup_boltz_rescue_key_subline_third:
            "Please write down or copy this key and store it in a secure and permanent location.",
        backup_boltz_rescue_key_reminder: "Keep this safe. Do not share.",
        copy_rescue_key: "Copy rescue key",
        user_saved_key: "I have saved the rescue key",
        verify_mnemonic_word: {
            start: "What is the word at ",
            strong: "position {{ number }}",
            end: " of your rescue key?",
        },
        incorrect_word: "Incorrect word. Please double-check your rescue key.",
        enter_mnemonic: "Enter rescue key",
        hint_paste_mnemonic: "Hint: you can paste all 12 words at once.",
        refresh_for_refund:
            "If you sent BTC into this swap, refresh the page to check for a refund.",
        claim: "Claim",
        claimed: "Swap has been claimed successfully!",
        rescue: "Rescue",
        rescue_swaps: "Rescue swaps",
        failed_get_swap: "Could not get swap {{ id }}",
        failed_get_swap_subline:
            "Please re-insert the rescue key and try again.",
        in_progress: "In progress",
        completed: "Completed",
        get_refundable_error:
            "Failed to load UTXO data. Refresh to try again or check your internet connection if the problem persists.",
        min_amount_destination:
            "Minimum amount for the destination address is {{ amount }} {{ denomination }}",
        max_amount_destination:
            "Maximum amount for the destination address is {{ amount }} {{ denomination }}",
        exact_amount_destination:
            "Invoice amount must be exactly {{ amount }} {{ denomination }}",
        destination: "Destination",
        destination_address: "{{ address }}",
        display: "Display",
        security: "Security",
        failed: "Failed",
        swaps_found: "Scanning swaps ({{ count }} found)",
        rescue_external_select_method: "Select your rescue key first",
        rescue_external_subtitle:
            "Use your rescue key to find and refund or claim swaps that are not in this browser's history.",
        stop_scanning: "Stop scanning",
        upload_rescue_key: "Select Rescue Key",

        suspension_status: "New swaps paused",
        suspension_p1: "New swaps are paused for now.",
        suspension_p2:
            "Pending swaps keep working, and refunds and the rescue page stay available. If a swap of yours failed, you can refund it on the rescue page.",
        source_code: "Source code",
        built_on_boltz: "Built on Boltz (AGPL-3.0)",
        hero_submarine_title: "Submarine swaps",
        hero_submarine_text:
            "Send on-chain BTC on the Bitcoin (BLAKE2b) chain; the service pays your Lightning invoice.",
        hero_reverse_title: "Reverse swaps",
        hero_reverse_text:
            "Pay a Lightning invoice and receive on-chain BTC at your Bitcoin (BLAKE2b) address.",
        hero_refund_title: "Refunds with your rescue key",
        hero_refund_text:
            "Swaps are locked in HTLCs. If a submarine swap fails, your rescue key lets you refund your BTC after the timelock, even without the service.",
        suspension_rescue_link: "Go to the rescue page",
        invoice_missing_blake2b:
            "This invoice was not made by a Lightning node on the Bitcoin BLAKE2b chain (it lacks feature bit 512). Paying it would fail.",
        copy_preimage: "Copy payment preimage",
    },
};

type NestedKeyOf<T> = {
    [K in keyof T & string]: T[K] extends object
        ? `${K}.${NestedKeyOf<T[K]>}`
        : K;
}[keyof T & string];

export type DictKey = NestedKeyOf<typeof dict.en>;

export type Language = keyof typeof dict;

export const rawDict = JSON.parse(JSON.stringify(dict));

Object.entries(dict)
    .filter(([lang]) => lang !== "en")
    .map(([, langDict]) => {
        Object.entries(dict.en).map(([key, enVal]) => {
            const dictKey = key as keyof typeof dict.en;
            if (langDict[dictKey] === undefined) {
                (langDict as Record<keyof typeof dict.en, unknown>)[dictKey] =
                    enVal;
            }
        });
    });

export default dict;
