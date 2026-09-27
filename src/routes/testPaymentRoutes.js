const express = require("express");
const router = express.Router();

const apiKeyAuth = require("../middleware/apiKeyAuth");
const { generate } = require("../controllers/generateController");

router.post("/generate", apiKeyAuth, generate);

module.exports = router;