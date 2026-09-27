const PaymentProvider = require("./paymentProvider");
const razorpay = require("../../config/razorpay");

class RazorpayProvider extends PaymentProvider {

    async createOrder({
        amountInMinorUnits,
        receipt,
        notes = {}
    }) {
        const order = await razorpay.orders.create({
            amount: amountInMinorUnits,
            currency: "INR",
            receipt,
            notes
        });

        return order;
    }

    async getOrder(orderId) {
        return razorpay.orders.fetch(orderId);
    }
}

module.exports = RazorpayProvider;