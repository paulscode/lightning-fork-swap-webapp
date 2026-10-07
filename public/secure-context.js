// Shown instead of the app outside a secure context (HTTPS). A file, not an
// inline script, so the Content-Security-Policy can allow scripts from this
// origin only.
if (!window.isSecureContext) {
    // eslint-disable-next-line no-console
    console.error(
        "Error: This site requires a secure context (HTTPS) to function.",
    );

    document.body.classList.remove("loading");
    document.body.innerHTML = "";
    document.body.style.cssText = `
        margin: 0;
        padding: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--backgroundColor);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    `;

    const errorContainer = document.createElement("div");
    errorContainer.style.cssText = `
        max-width: 600px;
        padding: 48px 32px;
        text-align: center;
        color: white;
    `;

    errorContainer.innerHTML = `
        <div style="font-size: 64px; margin-bottom: 24px;">🔒</div>
        <h1 style="font-size: 32px; font-weight: 600; margin: 0 0 16px 0; color: #dc2626;">
            Secure Connection Required
        </h1>
        <p style="font-size: 18px; line-height: 1.6; margin: 0 0 24px 0; color: #e5e7eb;">
            This site requires a secure context (HTTPS) to function.
        </p>
        <p style="font-size: 14px; line-height: 1.6; margin: 0; color: #9ca3af;">
            Please access this site via HTTPS or localhost.
        </p>
    `;

    document.body.appendChild(errorContainer);

    throw new Error("Insecure context - blocking app initialization");
}
