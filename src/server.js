require("dotenv").config();

const app = require("./app");
const connectDB = require("./config/database");
const startUsageRollupJob = require("./services/usageRollupJob");

const PORT = process.env.PORT || 5000;

const startServer = async () => {
    await connectDB();

    // Start background jobs after database connection
    startUsageRollupJob();

    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
};

startServer();