import cors from "cors";
import dotenv from "dotenv";
dotenv.config();
import express from "express";
import { MongoClient, ServerApiVersion } from "mongodb";

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

    // Health check root route
    app.get("/", (req, res) => res.send("OK"));

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

    // Define POST endpoint for updating waifu stats
    app.post("/waifu/update", async (req, res) => {
      const { id, field, operation } = req.body;
      if (
        !id ||
        !["wins", "losses"].includes(field) ||
        !["increment", "decrement"].includes(operation)
      ) {
        return res.status(400).json({ error: "Invalid request body" });
      }

      const updateValue = operation === "increment" ? 1 : 1;

      try {
        const collection = client.db(dbName).collection(collectionName);
        const result = await collection.updateOne(
          { "waifus.id": id },
          { $inc: { [`waifus.$.${field}`]: updateValue } }
        );
        if (result.modifiedCount === 0) {
          return res.status(404).json({ error: "Waifu not found" });
        }
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Define POST endpoint for comparing two waifus
    app.post("/waifu/compare", async (req, res) => {
      const { winner, loser } = req.body;
      if (!winner || !loser || !winner.id || !loser.id) {
        return res.status(400).json({ error: "Invalid request body" });
      }

      const collection = client.db(dbName).collection(collectionName);

      try {
        // Update winner: increment wins if exists
        let result = await collection.updateOne(
          { "waifus.id": winner.id },
          { $inc: { "waifus.$.wins": 1 } }
        );
        // If winner not found, add to array
        if (result.modifiedCount === 0) {
          await collection.updateOne(
            {},
            {
              $push: {
                waifus: {
                  id: winner.id,
                  imageUrl: winner.imageUrl,
                  wins: 1,
                  losses: 0,
                },
              },
            }
          );
        }

        // Update loser: increment losses if exists
        result = await collection.updateOne(
          { "waifus.id": loser.id },
          { $inc: { "waifus.$.losses": 1 } }
        );
        // If loser not found, add to array
        if (result.modifiedCount === 0) {
          await collection.updateOne(
            {},
            {
              $push: {
                waifus: {
                  id: loser.id,
                  imageUrl: loser.imageUrl,
                  wins: 0,
                  losses: 1,
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
