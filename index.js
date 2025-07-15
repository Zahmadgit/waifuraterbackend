import cors from "cors";
import dotenv from "dotenv";
dotenv.config();
import express from "express";
import { MongoClient, ServerApiVersion } from "mongodb";
import jwt from "jsonwebtoken";

const app = express();
app.use(cors());
const PORT = process.env.PORT || 8080;

const uri = process.env.MONGO_URI;
const dbName = process.env.MONGO_DB || "WaifuPicks"; // Set your default DB name
const collectionName = process.env.MONGO_COLLECTION || "Waifus"; // Set your default collection name

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function main() {
  try {
    // Connect the client to the server (only once)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    app.use(express.json());

    // Health check root route and issue JWT token
    app.get("/", (req, res) => {
      const user = { name: "guest" };
      const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "1h" });
      res.json({ token });
    });

    // Define GET endpoint
    app.get("/items", async (req, res) => {
      try {
        const collection = client.db(dbName).collection(collectionName);
        const items = await collection.find({}).toArray();
        res.json(items);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // JWT authentication middleware
    const authenticateToken = (req, res, next) => {
      const authHeader = req.headers["authorization"];
      const token = authHeader && authHeader.split(" ")[1]; // Expect "Bearer <token>"
      if (!token) return res.sendStatus(401);
      jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
      });
    };

    // Define POST endpoint for updating both winner and loser waifu stats (protected)
    app.post("/waifu/update", authenticateToken, async (req, res) => {
      const { winner, loser } = req.body;
      if (
        !winner ||
        !loser ||
        !winner.id ||
        !loser.id ||
        !winner.imageUrl ||
        !loser.imageUrl ||
        !winner.source ||
        !loser.source ||
        !["wins", "losses"].includes(winner.field) ||
        !["wins", "losses"].includes(loser.field) ||
        !["increment", "decrement"].includes(winner.operation) ||
        !["increment", "decrement"].includes(loser.operation)
      ) {
        return res.status(400).json({ error: "Invalid request body" });
      }

      const winnerUpdateValue = winner.operation === "increment" ? 1 : -1;
      const loserUpdateValue = loser.operation === "increment" ? 1 : -1;

      try {
        const collection = client.db(dbName).collection(collectionName);
        // Update winner
        let winnerResult = await collection.updateOne(
          { "waifus.id": winner.id },
          { $inc: { [`waifus.$.${winner.field}`]: winnerUpdateValue } }
        );
        if (winnerResult.modifiedCount === 0) {
          // Add winner if not found
          const wins =
            winner.field === "wins" && winner.operation === "increment" ? 1 : 0;
          const losses =
            winner.field === "losses" && winner.operation === "increment"
              ? 1
              : 0;
          await collection.updateOne(
            {},
            {
              $push: {
                waifus: {
                  id: winner.id,
                  imageUrl: winner.imageUrl,
                  source: winner.source,
                  wins,
                  losses,
                },
              },
            }
          );
        }
        // Update loser
        let loserResult = await collection.updateOne(
          { "waifus.id": loser.id },
          { $inc: { [`waifus.$.${loser.field}`]: loserUpdateValue } }
        );
        if (loserResult.modifiedCount === 0) {
          // Add loser if not found
          const wins =
            loser.field === "wins" && loser.operation === "increment" ? 1 : 0;
          const losses =
            loser.field === "losses" && loser.operation === "increment" ? 1 : 0;
          await collection.updateOne(
            {},
            {
              $push: {
                waifus: {
                  id: loser.id,
                  imageUrl: loser.imageUrl,
                  source: loser.source,
                  wins,
                  losses,
                },
              },
            }
          );
        }
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    app.listen(process.env.PORT || 8080, () => {
      console.log(`Server running on port ${process.env.PORT}`);
    });
  } catch (err) {
    console.error("Failed to connect to MongoDB:", err);
    process.exit(1);
  }
  console.log("PORT:", process.env.PORT);
}

main();
