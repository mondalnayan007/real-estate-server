require('dotenv').config()
const express = require('express');
const cors = require('cors');
const app = express()
const port = process.env.PORT || 3000
const { MongoClient } = require('mongodb');


app.use(cors());
app.use(express.json());


const client = new MongoClient(process.env.MONGO_URI);
async function connectToMongoDB() {
    try {
        await client.connect();

        app.get('/projects', async (req, res) => {
            const cursor = projectsCollection.find();
            const result = await cursor.toArray();
            res.send(result);
        })


        console.log("You successfully connected to MongoDB!");
        return client;
    } catch (err) {
        console.dir(err);
    }
}
connectToMongoDB();






app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})