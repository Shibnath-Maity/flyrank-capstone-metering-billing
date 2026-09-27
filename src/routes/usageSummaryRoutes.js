const express = require("express");

const apiKeyAuth = require("../middleware/apiKeyAuth");

const {
    getUsageSummary
} = require("../controllers/usageSummaryController");

const router = express.Router();

router.get(
    "/usage/summary",
    apiKeyAuth,
    getUsageSummary
);

module.exports = router;