// Enter the API key for the currently seeded/demo tenant.
//
// IMPORTANT:
// Do not commit a real API key to GitHub.
// For local testing only, paste the current API key here.
const apiKey = prompt("Enter your API key:");

const payButton = document.getElementById("payButton");

async function startCheckout() {
    if (!apiKey) {
        alert("API key is required.");
        return;
    }

    payButton.disabled = true;
    payButton.textContent = "Processing...";

    try {
        const response = await fetch("/api/billing/checkout", {
            method: "POST",

            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.message || `Server error: ${response.status}`
            );
        }

        if (!data.success) {
            throw new Error(
                data.message || "Unable to start checkout"
            );
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

                            instruments: [
                                {
                                    method: "upi"
                                }
                            ]
                        }
                    },

                    sequence: [
                        "block.upi",
                        "block.cards",
                        "block.netbanking",
                        "block.wallet"
                    ],

                    preferences: {
                        show_default_blocks: true
                    }
                }
            },

            handler: function (response) {
                /*
                 * Payment verification happens server-side
                 * through the Razorpay webhook.
                 *
                 * Do NOT trust this client-side callback
                 * as proof of successful payment.
                 */

                console.log(
                    "Payment submitted:",
                    response.razorpay_payment_id
                );

                alert(
                    "Payment submitted! " +
                    "Your Pro plan will activate shortly " +
                    "after Razorpay confirms the payment."
                );
            },

            modal: {
                ondismiss: function () {
                    console.log(
                        "Razorpay checkout closed"
                    );
                }
            },

            theme: {
                color: "#3399cc"
            }
        };

        if (typeof Razorpay === "undefined") {
            throw new Error(
                "Razorpay Checkout SDK is not loaded."
            );
        }

        const razorpay = new Razorpay(options);

        razorpay.on(
            "payment.failed",
            function (response) {
                console.error(
                    "Payment failed:",
                    response.error
                );

                alert(
                    "Payment failed: " +
                    (
                        response.error.description ||
                        "Unknown error"
                    )
                );
            }
        );

        razorpay.open();

    } catch (error) {
        console.error(
            "Payment error:",
            error
        );

        alert(
            error.message ||
            "Unable to start payment. Please try again."
        );

    } finally {
        payButton.disabled = false;
        payButton.textContent = "Pay ₹999";
    }
}


// Check whether Razorpay SDK has loaded.
if (typeof Razorpay === "undefined") {
    payButton.disabled = true;
    payButton.textContent = "Loading payment...";

    window.addEventListener(
        "load",
        () => {
            if (typeof Razorpay !== "undefined") {
                payButton.disabled = false;
                payButton.textContent = "Pay ₹999";
            } else {
                payButton.disabled = true;
                payButton.textContent =
                    "Payment SDK unavailable";
            }
        }
    );
}


// Start checkout when button is clicked.
payButton.onclick = startCheckout;