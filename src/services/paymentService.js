const razorpay = require("../config/razorpay");

class PaymentService {

    static async createOrder({
        amountInMinorUnits,
        receipt,
        notes
    }) {
        const order = await razorpay.orders.create({
            amount: amountInMinorUnits,
            currency: "INR",
            receipt,
            notes
        });

        return order;
    }
}

module.exports = PaymentService;