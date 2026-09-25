const tenantId = "6ab365d325eae25e529dffd4";

document.getElementById("payButton").onclick = async () => {
    try {
        const response = await fetch("/api/billing/checkout", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                tenantId
            })
        });

        const data = await response.json();

        if (!data.success) {
            alert(data.message);
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
                console.log("Payment successful");
                console.log("Razorpay Payment ID:", response.razorpay_payment_id);
                console.log("Razorpay Order ID:", response.razorpay_order_id);
                console.log("Razorpay Signature:", response.razorpay_signature);

                alert("Payment successful!");
            },

            modal: {
                ondismiss: function () {
                    console.log("Razorpay checkout closed");
                }
            },

            theme: {
                color: "#3399cc"
            }
        };

        const razorpay = new Razorpay(options);

        razorpay.on("payment.failed", function (response) {
            console.error("Payment failed:", response.error);

            alert(
                "Payment failed: " +
                (response.error.description || "Unknown error")
            );
        });

        razorpay.open();

    } catch (error) {
        console.error("Payment error:", error);
        alert("Unable to start payment");
    }
};