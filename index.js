require('dotenv').config()
const express = require('express');
const cors = require('cors');
const app = express()
const nodemailer = require('nodemailer');
const port = process.env.PORT || 3000
const { MongoClient, ObjectId } = require('mongodb');
const { uploadImagesMiddleware, uploadToCloudinary, settingsUploadMiddleware, upload } = require('./utils/CloudinaryConfig');


app.use(cors());
app.use(express.json());

// ১. নোডমেইলার ট্রান্সপোর্টার তৈরি (গুগল অ্যাপ পাসওয়ার্ড দিয়ে)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, // আপনার জিমেইল আইডি
        pass: process.env.EMAIL_PASS  // গুগল থেকে পাওয়া ১৬ অক্ষরের অ্যাপ পাসওয়ার্ড
    }
});


const client = new MongoClient(process.env.MONGO_URI);
async function connectToMongoDB() {
    try {
        await client.connect();

        const db = client.db('realEstate');
        const projectsCollection = db.collection('projects');
        const settingsCollection = db.collection('settings');
        const slidersCollection = db.collection('sliders');
        const agentsCollection = db.collection('agents');



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
                const { agentId, id } = req.query;

                if (agentId && id) {
                    const query = { agentId: agentId, _id: new ObjectId(id) };
                    const result = await projectsCollection.findOne(query);

                    if (!result) {
                        return res.status(404).send({ message: "We dont get the project" });
                    }
                    return res.send(result);
                }


                if (agentId) {
                    const query = { agentId: agentId };
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
            const { agentId } = req.query;
            const query = { agentId: agentId };
            const result = await settingsCollection.findOne(query);
            res.send(result);
        })


        // get the slider data 

        app.get('/slider', async (req, res) => {
            const { agentId } = req.query;
            const query = { agentId: agentId };
            const result = await slidersCollection.find(query).toArray();
            res.send(result);

        })


        // get  testimonial data

        app.get('/testimonial', async (req, res) => {

        })


        // get all the agents data 

        app.get('/agents', async (req, res) => {
            const { hostname } = req.query;
            const query = { targetDomain: hostname };

            const result = await agentsCollection.find(query).toArray();

            res.send(result);
        })


        // post apis here 



        //   add projects 
        app.post('/projects', uploadImagesMiddleware, async (req, res) => {
            try {
                // ১. টেক্সট ডাটা আলাদা করা
                const { title, price, location, category, tag, beds, baths, sqft, status, description, videoLink, amenities, domain, agentId } = req.body;

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
                    domain: req.body.domain,
                    agentId
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


        // add agent data 

        app.post('/api/agents/register', upload.single('avatar'), async (req, res) => {
            try {
                // ১. টেক্সট ডাটা আলাদা করা
                const {
                    agentId,
                    firstName,
                    lastName,
                    email,
                    authProvider,
                    agencyName,
                    whatsappNumber,
                    domainType,
                    targetDomain,
                    subdomain,
                    customDomain,
                    paymentStatus
                } = req.body;

                // ২. ডুপ্লিকেট এজেন্ট বা ডোমেন চেক (Pure MongoDB ড্রাইভার দিয়ে)
                const existingAgent = await agentsCollection.findOne({
                    $or: [
                        { agentId: agentId },
                        { email: email },
                        { targetDomain: targetDomain }
                    ]
                });

                if (existingAgent) {
                    return res.status(400).send({ error: true, message: "This Agent, Email, or Domain is already registered!" });
                }

                // ৩. আপনার আগের প্রজেক্টের মতোই ক্লাউডিনারিতে আপলোড ও URL আনা
                let finalAvatarUrl = "";

                if (req.file) {
                    // আপনার প্রোজেক্টে যেমন 'uploadToCloudinary' তে req.files পাস করেছিলেন, 
                    // এখানে যেহেতু সিঙ্গেল ফাইল (avatar), তাই সরাসরি req.file নিয়ে বাফার করে আপলোড করব:
                    const b64 = Buffer.from(req.file.buffer).toString("base64");
                    let dataURI = "data:" + req.file.mimetype + ";base64," + b64;

                    const uploadResponse = await cloudinary.uploader.upload(dataURI, {
                        folder: "agent_profiles",
                    });
                    finalAvatarUrl = uploadResponse.secure_url;
                } else if (req.body.avatar) {
                    // যদি গুগল সাইন-আপ হয়, তবে ফ্রন্টএন্ড থেকে গুগলের প্রোফাইল ইমেজের ডিরেক্ট URL আসবে
                    finalAvatarUrl = req.body.avatar;
                } else {
                    // কোনো ইমেজ না থাকলে ডিফল্ট প্লেসহোল্ডার ইমেজ
                    finalAvatarUrl = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80";
                }

                // ৪. ফাইনাল ডাটা অবজেক্ট তৈরি
                const finalAgentData = {
                    agentId,
                    firstName,
                    lastName,
                    email,
                    avatar: finalAvatarUrl,
                    authProvider,
                    agencyName,
                    whatsappNumber,
                    domainType,
                    targetDomain,
                    subdomain: subdomain || null,
                    customDomain: customDomain || null,
                    paymentStatus: paymentStatus || 'pending',
                    createdAt: new Date()
                };

                // ৫. ডাটাবেজে ইনসার্ট (insertOne)
                const result = await agentsCollection.insertOne(finalAgentData);

                // ৬. ফ্রন্টএন্ডে রিয়েল-টাইম আপডেটের জন্য আইডি সহ সেভড অবজেক্ট পাঠানো
                const savedAgent = {
                    _id: result.insertedId,
                    ...finalAgentData
                };

                res.status(201).send(savedAgent);

            } catch (error) {
                console.error("Error in agent registration API:", error);
                res.status(500).send({ error: true, message: "Internal Server Error" });
            }
        });






        // ২. কন্টাক্ট এজেন্ট এপিআই এন্ডপয়েন্ট for email service
        app.post('/api/contact-agent', async (req, res) => {
            try {
                const {
                    userName, userEmail, userPhone, userMessage,
                    agentEmail, agencyName,
                    propertyTitle, propertyPrice, propertyLink
                } = req.body;

                // ডাটা ভ্যালিডেশন
                if (!userEmail || !agentEmail || !propertyTitle) {
                    return res.status(400).send({ success: false, message: "Required fields are missing." });
                }

                // ৩. চিঠির খাম ও সুন্দর এইচটিএমএল (HTML) টেমপ্লেট
                const mailOptions = {
                    from: `"PrimeState Portal" <${process.env.EMAIL_USER}>`, // মেইল পাঠাচ্ছে আপনার সিস্টেম
                    to: agentEmail,      // 🎯 যে এজেন্টের প্রোপার্টি, সরাসরি তার পার্সোনাল জিমেইলে যাবে
                    replyTo: userEmail,   // 🎯 এজেন্ট রিপ্লাই দিলে সরাসরি কাস্টমারের মেইলে চলে যাবে
                    subject: `🔥 New Lead for "${propertyTitle}" - PrimeState`,
                    html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #1e3a8a; border-bottom: 2px solid #1e3a8a; padding-bottom: 10px;">Hello ${agencyName},</h2>
          <p style="font-size: 16px;">You have received a new customer inquiry for one of your listed properties on PrimeState.</p>
          
          <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <h3 style="color: #0f766e; margin-top: 0;">🏠 Property Details</h3>
            <p style="margin: 5px 0;"><strong>Title:</strong> ${propertyTitle}</p>
            <p style="margin: 5px 0;"><strong>Price:</strong> ${propertyPrice}</p>
            <p style="margin: 15px 0 0 0;"><a href="${propertyLink}" target="_blank" style="background-color: #1e3a8a; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; font-size: 14px;">View Listed Property</a></p>
          </div>
          
          <div style="background-color: #fff; padding: 15px; border: 1px solid #e2e8f0; border-radius: 6px; margin: 20px 0;">
            <h3 style="color: #1e3a8a; margin-top: 0;">👤 Client Information</h3>
            <p style="margin: 5px 0;"><strong>Name:</strong> ${userName}</p>
            <p style="margin: 5px 0;"><strong>Email:</strong> ${userEmail}</p>
            <p style="margin: 5px 0;"><strong>Phone:</strong> ${userPhone || 'Not provided'}</p>
            <p style="margin: 10px 0 0 0;"><strong>Client Message:</strong></p>
            <blockquote style="background: #f1f5f9; padding: 12px; border-left: 4px solid #1e3a8a; margin: 5px 0; font-style: italic;">
              "${userMessage}"
            </blockquote>
          </div>
          
          <p style="font-size: 12px; color: #64748b; text-align: center; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px;">
            This is an automated email from PrimeState System. Please hit "Reply" to contact the client directly.
          </p>
        </div>
      `
                };

                // ৪. নোডমেইলার দিয়ে মেইল পাঠানো
                await transporter.sendMail(mailOptions);

                res.status(200).send({ success: true, message: "Email sent to agent successfully!" });

            } catch (error) {
                console.error("Nodemailer Error:", error);
                res.status(500).send({ success: false, message: "Internal server error while sending email." });
            }
        });




        // add setting data 

        app.post('/settings', settingsUploadMiddleware, async (req, res) => {
            try {

                const settingsData = { ...req.body };


                if (req.files && req.files['logo']) {
                    const logoFile = req.files['logo'];
                    const logoUrlResult = await uploadToCloudinary(logoFile);
                    if (logoUrlResult.length > 0) {
                        settingsData.logo = logoUrlResult[0];
                    }
                }


                if (req.files && req.files['favIcon']) {
                    const favIconFile = req.files['favIcon'];
                    const favIconUrlResult = await uploadToCloudinary(favIconFile);
                    if (favIconUrlResult.length > 0) {
                        settingsData.favIcon = favIconUrlResult[0];
                    }
                }





                const result = await settingsCollection.insertOne(settingsData);

                res.status(200).send({
                    success: true,
                    message: "Settings successfully saved with Cloudinary links!",
                    data: result
                });

            } catch (error) {
                console.error("Backend Error:", error);
                res.status(500).send({ success: false, message: "Internal Server Error" });
            }
        });


        // add slider data 

        // 🚀 POST: স্লাইডার ক্রিয়েট API (Cloudinary Integration সহ)
        app.post('/slider', upload.single('photo'), async (req, res) => {
            try {
                const { headerTitle, title, description, position, domain, agentId } = req.body;
                let photoUrl = '';

                // যদি ফ্রন্টএন্ড থেকে ফাইল আসে, ক্লাউডিনারিতে আপলোড হবে
                if (req.file) {
                    const uploadedUrls = await uploadToCloudinary([req.file]);
                    if (uploadedUrls.length > 0) {
                        photoUrl = uploadedUrls[0];
                    }
                }

                // ডেটাবেজে সেভ করার অবজেক্ট
                const sliderData = {
                    headerTitle,
                    title,
                    description,
                    position,
                    domain: req.body.domain,
                    agentId,
                    photo: photoUrl, // ক্লাউডিনারির Image URL
                    createdAt: new Date()
                };


                const result = await slidersCollection.insertOne(sliderData);
                res.status(201).send(result);

            } catch (error) {
                console.error("Error creating slider:", error);
                res.status(500).send({ message: "Failed to upload and save slider", error: error.message });
            }
        });


        //   update/patch apis 


        // update the projects data 

        app.patch('/projects', async (req, res) => {
            const id = req.query.id;
            const domain = req.query.domain
            const query = { domain: domain, _id: new ObjectId(id) };
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
        app.put('/slider/:id', upload.single('photo'), async (req, res) => {
            try {
                const { id } = req.params;
                const updatedData = req.body;

                if (!id) {
                    return res.status(400).send({ message: "ID is required" });
                }

                const query = { _id: new ObjectId(id) };

                const updateDoc = {
                    $set: {
                        headerTitle: updatedData.headerTitle,
                        title: updatedData.title,
                        description: updatedData.description,
                        position: updatedData.position,
                        domain: updatedData.domain,
                    }
                };

                // 🟢 ২. নতুন ছবি আপলোড হলে Cloudinary-তে পাঠাবো
                if (req.file) {
                    // uploadToCloudinary অ্যারে (array) আশা করে, তাই [req.file] পাঠানো হয়েছে
                    const uploadedUrls = await uploadToCloudinary([req.file]);

                    if (uploadedUrls.length > 0) {
                        // Cloudinary-র দেওয়া সিউকিওর (HTTPS) ইমেজ URL ডাটাবেজে সেভ হবে
                        updateDoc.$set.photo = uploadedUrls[0];
                    }
                }

                // ৩. ডাটাবেজে আপডেট
                const result = await slidersCollection.updateOne(query, updateDoc);

                if (result.matchedCount === 0) {
                    return res.status(404).send({ message: "Slider not found" });
                }

                // ৪. ডাটাবেজ থেকে আপডেট হওয়া সর্বশেষ ডাটা রেসপন্স পাঠানো
                const updatedSlider = await slidersCollection.findOne(query);

                res.status(200).send(updatedSlider);

            } catch (error) {
                console.error("Error updating slider:", error);
                res.status(500).send({ message: "Failed to update slider", error: error.message });
            }
        });



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