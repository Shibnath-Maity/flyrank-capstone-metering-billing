const tenantId = "6ab365d325eae25e529dffd4";

const payButton = document.getElementById("payButton");

async function startCheckout() {
    payButton.disabled = true;
    payButton.textContent = "Processing...";

    try {
        const response = await fetch("/api/billing/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tenantId })
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        const data = await response.json();

        if (!data.success) {
            alert(data.message || "Unable to start checkout");
            return;
        }

        const options = {
            key: data.razorpayKeyId,
            amount: data.order.amount,
            currency: data.order.currency,
            name: "FlyRank",
            description: "Pro Plan",
            order_id: data.order.id,

            config: {
                display: {
                    blocks: {
                        upi: {
                            name: "Pay using UPI",
                            instruments: [{ method: "upi" }]
                        }
                    },
                    sequence: ["block.upi", "block.cards", "block.netbanking", "block.wallet"],
                    preferences: { show_default_blocks: true }
                }
            },

            handler: function (response) {
                // Verification happens server-side via the Razorpay webhook
                // (see webhookRoutes.js / webhookController.js), not here.
                // This just confirms Checkout completed on the client and
                // the payment was submitted to Razorpay.
                console.log("Payment submitted:", response.razorpay_payment_id);
                alert("Payment submitted! Your Pro plan will activate shortly once confirmed.");
                // Optional: poll /api/billing/status/:tenantId or redirect
                // to a "processing" page here instead of a bare alert.
            },

            modal: {
                ondismiss: function () {
                    console.log("Razorpay checkout closed");
                }
            },

            theme: { color: "#3399cc" }
        };

        const razorpay = new Razorpay(options);

        razorpay.on("payment.failed", function (response) {
            console.error("Payment failed:", response.error);
            alert("Payment failed: " + (response.error.description || "Unknown error"));
        });

        razorpay.open();

    } catch (error) {
        console.error("Payment error:", error);
        alert("Unable to start payment. Please try again.");
    } finally {
        payButton.disabled = false;
        payButton.textContent = "Pay ₹999";
    }
}

if (typeof Razorpay === "undefined") {
    payButton.disabled = true;
    payButton.textContent = "Loading payment...";
    window.addEventListener("load", () => {
        payButton.disabled = false;
        payButton.textContent = "Pay ₹999";
    });
}

payButton.onclick = startCheckout;