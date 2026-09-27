const ApiKey = require("../models/ApiKey");

const apiKeyAuth = async (req, res, next) => {
    try {
        const apiKey = req.headers["x-api-key"];

        if (!apiKey) {
            return res.status(401).json({
                success: false,
                message: "API key is required"
            });
        }

        const apiKeyRecord = await ApiKey.findOne({
            key: apiKey,
            active: true
        });

        if (!apiKeyRecord) {
            return res.status(401).json({
                success: false,
                message: "Invalid API key"
            });
        }

        req.tenantId = apiKeyRecord.tenantId;

        next();

    } catch (error) {
        console.error("API key authentication error:", error);

        return res.status(500).json({
            success: false,
            message: "Authentication failed"
        });
    }
};

module.exports = apiKeyAuth;