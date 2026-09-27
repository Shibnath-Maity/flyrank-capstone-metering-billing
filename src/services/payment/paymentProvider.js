class PaymentProvider {
    async createOrder() {
        throw new Error("createOrder() must be implemented");
    }

    async getOrder() {
        throw new Error("getOrder() must be implemented");
    }
}

module.exports = PaymentProvider;