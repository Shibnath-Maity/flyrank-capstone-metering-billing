const express = require("express");

const apiKeyAuth = require("../middleware/apiKeyAuth");
const { createCheckout } = require("../controllers/billingController");

const router = express.Router();

router.post(
    "/billing/checkout",
    apiKeyAuth,
    createCheckout
);

module.exports = router;