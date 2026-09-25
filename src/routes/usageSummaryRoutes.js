const express = require("express");

const {
    getUsageSummary
} = require("../controllers/usageSummaryController");

const router = express.Router();

router.get("/usage/summary", getUsageSummary);

module.exports = router;