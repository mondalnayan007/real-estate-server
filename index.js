require('dotenv').config()
const express = require('express');
const cors = require('cors');
const app = express()
const port = process.env.PORT || 3000
const { MongoClient, ObjectId } = require('mongodb');


app.use(cors());
app.use(express.json());


const client = new MongoClient(process.env.MONGO_URI);
async function connectToMongoDB() {
    try {
        await client.connect();

        const db = client.db('realEstate');
        const projectsCollection = db.collection('projects');
        const settingsCollection = db.collection('settings');


         // get all proects
        app.get('/projects', async (req, res) => {
            const cursor = projectsCollection.find();
            const result = await cursor.toArray();
            res.send(result);
        })

        // get single project 

        app.get('/projects/:id',async(req,res)=>{
            const  id = req.params.id;
            const query = {_id: new ObjectId(id)};
            const result = await projectsCollection.findOne(query);
            res.send(result);
        })

    //   add projects 
        app.post('/projects',async(req,res)=>{
            const projectData = req.body;
            const result = await projectsCollection.insertOne(projectData);
            res.send(result);
        })

        // setting data 

        app.post('/settings',async(req,res)=>{
            const settingsData = req.body;
            const result = await settingsCollection.insertOne(settingsData);
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