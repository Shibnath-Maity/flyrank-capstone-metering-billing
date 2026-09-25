const express = require("express");

const { generateAI } = require("../controllers/aiController");

const router = express.Router();

router.post("/ai/generate", generateAI);

module.exports = router;