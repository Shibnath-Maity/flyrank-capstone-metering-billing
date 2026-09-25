const express = require("express");
const { createCheckout } = require("../controllers/billingController");

const router = express.Router();

router.post("/billing/checkout", createCheckout);

module.exports = router;