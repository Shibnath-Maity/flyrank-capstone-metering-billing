const express = require("express");

const apiKeyAuth = require("../middleware/apiKeyAuth");

const {
    generate
} = require("../controllers/generateController");

const router = express.Router();

router.post(
    "/generate",
    apiKeyAuth,
    generate
);

module.exports = router;