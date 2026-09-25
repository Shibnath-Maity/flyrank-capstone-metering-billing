const crypto = require("crypto");

const verifyRazorpaySignature = (rawBody, signature) => {
    if (!rawBody || !signature) {
        return false;
    }

    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!secret) {
        console.error("RAZORPAY_WEBHOOK_SECRET is not configured");
        return false;
    }

    try {
        const expectedSignature = crypto
            .createHmac("sha256", secret)
            .update(rawBody)
            .digest("hex");

        const expectedBuffer = Buffer.from(expectedSignature, "utf8");
        const signatureBuffer = Buffer.from(signature, "utf8");

        if (expectedBuffer.length !== signatureBuffer.length) {
            return false;
        }

        return crypto.timingSafeEqual(
            expectedBuffer,
            signatureBuffer
        );

    } catch (err) {
        console.error("Signature verification failed:", err);
        return false;
    }
};

module.exports = {
    verifyRazorpaySignature
};