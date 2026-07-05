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
        const slidersCollection = db.collection('sliders');



                                         //  Get apis here  



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


        // get the settings based on the email/domain name
        
        app.get('/settings', async(req,res)=>{
            const {email} = req.query;
            const query = {email : email};
            const result = await settingsCollection.findOne(query);
            res.send(result);
        })


        // get the slider data 

        app.get('/slider',async(req,res)=>{
            const  {domain} = req.query;
            const query = {domain:domain};
            const result = await slidersCollection.find(query).toArray();
            res.send(result);

        })


        // get  testimonial data

        app.get('/testimonial',async(req,res)=>{
        
        })


                                  // post apis here 



    //   add projects 
        app.post('/projects',async(req,res)=>{
            const projectData = req.body;
            const result = await projectsCollection.insertOne(projectData);
            res.send(result);
        })

        // add setting data 

        app.post('/settings',async(req,res)=>{
            const settingsData = req.body;
            const result = await settingsCollection.insertOne(settingsData);
            res.send(result);
        })


        // add slider data 

        app.post('/slider',async(req,res)=>{
            const sliderData = req.body;
            const result = await slidersCollection.insertOne(sliderData);
            res.send(result);
        })



                                //   update/patch apis 


        // update the projects data 

        app.patch('/projects/:id',async(req,res)=>{
            const id = req.params.id;
            const query = {_id: new ObjectId(id)};
            const updatedData = req.body;
            const update = {
                $set:updatedData
             
            }
            const options = {};
            const result = await projectsCollection.updateOne(query,update,options);
            res.send(result);

        })
        // update the settings

        app.patch('/settings',async(req,res)=>{
            const email = req.query.email;
            const query = {email: email};
            const updatedData = req.body;
            const update = {
                $set:updatedData
             
            }
            const options = {};
            const result = await settingsCollection.updateOne(query,update,options);
            res.send(result);

        })

        // update any slider data 

        app.patch('/slider',async(req,res)=>{
            const {domain,id}= req.query;
            const updatedData = req.body;
            const query = {domain:domain, _id: new ObjectId(id)};

            const update = {
                $set:updatedData
            }
            const options = {};
            const result = await slidersCollection.updateOne(query,update,options);
            res.send(result);

        })



                                     //   delete apis here 


        // delete any project 

        app.delete('/projects/:id',async(req,res)=>{
            const id = req.params.id;
            const query = {_id: new ObjectId(id)};
            const result = await projectsCollection.deleteOne(query);
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