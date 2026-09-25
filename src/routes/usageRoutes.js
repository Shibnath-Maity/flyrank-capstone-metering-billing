const express = require("express");

const { getUsage } = require("../controllers/usageController");

const router = express.Router();

router.get("/usage", getUsage);

module.exports = router;