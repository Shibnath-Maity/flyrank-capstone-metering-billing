const express = require("express");

const {
    simulatePayment
} = require("../controllers/testPaymentController");

const router = express.Router();

router.post("/test-payment", simulatePayment);

module.exports = router;