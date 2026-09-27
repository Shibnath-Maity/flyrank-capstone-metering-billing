const RazorpayProvider = require("./payment/razorpayProvider");

class BillingService {

    constructor() {
        this.paymentProvider = new RazorpayProvider();
    }

    async createCheckout({
        amountInMinorUnits,
        receipt,
        notes
    }) {
        return this.paymentProvider.createOrder({
            amountInMinorUnits,
            receipt,
            notes
        });
    }

    async getOrder(orderId) {
        return this.paymentProvider.getOrder(orderId);
    }
}

module.exports = new BillingService();