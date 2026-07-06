require('dotenv').config()
const express = require('express');
const cors = require('cors');
const app = express()
const port = process.env.PORT || 3000
const { MongoClient, ObjectId } = require('mongodb');
const { uploadImagesMiddleware, uploadToCloudinary } = require('./utils/CloudinaryConfig');


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
        // app.get('/projects', async (req, res) => {
        //     const cursor = projectsCollection.find();
        //     const result = await cursor.toArray();
        //     res.send(result);
        // })

        // get single project 

        app.get('/projects', async (req, res) => {
            try {
                const { domain, id } = req.query;

                if (domain && id) {
                    const query = { domain: domain, _id: new ObjectId(id) };
                    const result = await projectsCollection.findOne(query);

                    if (!result) {
                        return res.status(404).send({ message: "We dont get the project" });
                    }
                    return res.send(result);
                }


                if (domain) {
                    const query = { domain: domain };
                    const result = await projectsCollection.find(query).toArray();
                    return res.send(result);
                }


                const result = await projectsCollection.find().toArray();
                res.send(result);

            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Server error", error });
            }
        });


        // get the settings based on the email/domain name

        app.get('/settings', async (req, res) => {
            const { email } = req.query;
            const query = { email: email };
            const result = await settingsCollection.findOne(query);
            res.send(result);
        })


        // get the slider data 

        app.get('/slider', async (req, res) => {
            const { domain } = req.query;
            const query = { domain: domain };
            const result = await slidersCollection.find(query).toArray();
            res.send(result);

        })


        // get  testimonial data

        app.get('/testimonial', async (req, res) => {

        })


        // post apis here 



        //   add projects 
        app.post('/projects', uploadImagesMiddleware, async (req, res) => {
            try {
                // ১. টেক্সট ডাটা আলাদা করা
                const { title, price, location, category, tag, beds, baths, sqft, status, description, videoLink, amenities} = req.body;
             
                // ২. আলাদা ফাইলে তৈরি করা ফাংশন দিয়ে ক্লাউডিনারিতে আপলোড ও URL আনা
                const imageUrls = await uploadToCloudinary(req.files);

                // ৩. Amenities পার্স করা
                let parsedAmenities = amenities ? JSON.parse(amenities) : [];

                // ৪. ফাইনাল ডাটা অবজেক্ট তৈরি
                const finalProjectData = {
                    title,
                    price,
                    location,
                    category,
                    tag,
                    beds: Number(beds) || 0,
                    baths: Number(baths) || 0,
                    sqft,
                    status,
                    description,
                    videoLink,
                    amenities: parsedAmenities,
                    // প্রথম ইমেজটি মেইন 'img' ফিল্ডে যাবে
                    img: imageUrls.length > 0 ? imageUrls[0] : "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=600&q=80",
                    allImages: imageUrls,
                    domain: req.body.domain
                };

                // console.log(finalProjectData.domain);

                // ৫. ডাটাবেজে ইনসার্ট
                const result = await projectsCollection.insertOne(finalProjectData);

                // ফ্রন্টএন্ডে রিয়েল-টাইম আপডেটের জন্য আইডি সহ অবজেক্ট পাঠানো
                const savedProject = {
                    _id: result.insertedId,
                    ...finalProjectData
                };

                res.status(201).send(savedProject);

            } catch (error) {
                console.error("Error in /projects route:", error);
                res.status(500).send({ error: true, message: "Internal Server Error" });
            }
        });

        // add setting data 

        app.post('/settings', async (req, res) => {
            const settingsData = req.body;
            const result = await settingsCollection.insertOne(settingsData);
            res.send(result);
        })


        // add slider data 

        app.post('/slider', async (req, res) => {
            const sliderData = req.body;
            const result = await slidersCollection.insertOne(sliderData);
            res.send(result);
        })



        //   update/patch apis 


        // update the projects data 

        app.patch('/projects/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const updatedData = req.body;
            const update = {
                $set: updatedData

            }
            const options = {};
            const result = await projectsCollection.updateOne(query, update, options);
            res.send(result);

        })
        // update the settings

        app.patch('/settings', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const updatedData = req.body;
            const update = {
                $set: updatedData

            }
            const options = {};
            const result = await settingsCollection.updateOne(query, update, options);
            res.send(result);

        })

        // update any slider data 

        app.patch('/slider', async (req, res) => {
            const { domain, id } = req.query;
            const updatedData = req.body;
            const query = { domain: domain, _id: new ObjectId(id) };

            const update = {
                $set: updatedData
            }
            const options = {};
            const result = await slidersCollection.updateOne(query, update, options);
            res.send(result);

        })



        //   delete apis here 


        // delete any project 

        app.delete('/projects/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
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