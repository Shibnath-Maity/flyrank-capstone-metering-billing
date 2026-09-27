const express = require("express");
const router = express.Router();

const apiKeyAuth = require("../middleware/apiKeyAuth");
const { generateAI } = require("../controllers/aiController");

router.post("/ai/generate", apiKeyAuth, generateAI);

module.exports = router;