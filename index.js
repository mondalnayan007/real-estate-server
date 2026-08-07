require('dotenv').config()
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
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
        const usersCollection = db.collection('users');
        const bookingsCollection = db.collection('bookings');
        const transactionsCollection = db.collection('transactions');
        const membersCollection = db.collection('members');
        const blogsCollection = db.collection('blogs');




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




        app.get('/api/my-bookings', async (req, res) => {
            try {
                const { userId } = req.query;

                // ১. userId না থাকলে বা ইনভ্যালিড ObjectId হলে হ্যান্ডেল করা
                if (!userId || !ObjectId.isValid(userId)) {
                    return res.status(400).json({
                        success: false,
                        message: 'Valid User ID is required'
                    });
                }

                // ২. নির্দিষ্ট ইউজারের বুকিং ডাটা ফেচ করা
                const userBookings = await bookingsCollection
                    .find({ userId: new ObjectId(userId) })
                    .toArray();


                if (userBookings.length === 0) {
                    return res.json({ success: true, bookings: [] });
                }


                // ৩. বুকিং ডাটা থেকে সব projectId এক্সট্র্যাক্ট করা (ইনভ্যালিড আইডি এড়ানোর জন্য সেফটি ফিল্টার সহ)
                const projectIds = userBookings
                    .filter(b => b.projectId && ObjectId.isValid(b.projectId))
                    .map(b => new ObjectId(b.projectId));

                // ৪. projectsCollection থেকে সংশ্লিষ্ট সব প্রজেক্ট ডাটা একবারে আনা
                const projects = await projectsCollection
                    .find({ _id: { $in: projectIds } })
                    .toArray();

                // ৫. প্রতিটি বুকিং অবজেক্টের ভেতর `projectDetails` ফিল্ডে ওই প্রজেক্টের ডাটা বসিয়ে দেওয়া
                const fullBookingsData = userBookings.map(booking => {
                    const project = projects.find(
                        p => p._id.toString() === booking.projectId?.toString()
                    );

                    return {
                        ...booking,
                        projectDetails: project || null // প্রজেক্ট পাওয়া না গেলে null বসবে
                    };
                });

                // ৬. প্রজেক্টের ডাটা সহ সম্পূর্ণ বুকিং অ্যারে ফ্রন্টএন্ডে রেসপন্স পাঠানো
                res.json({ success: true, bookings: fullBookingsData });

            } catch (error) {
                console.error('Error fetching bookings:', error);
                res.status(500).json({ success: false, message: error.message });
            }
        });

        // ২. ইউজার নতুন পেমেন্ট দিলে 'bookingsCollection'-এ Push করার API
        // app.post('/api/submit-payment', async (req, res) => {
        //     try {
        //         const { bookingId, paymentMethod, bankName, transactionId, amount } = req.body;

        //         if (!bookingId || !transactionId || !amount) {
        //             return res.status(400).json({ success: false, message: 'All required fields must be provided' });
        //         }

        //         const newTransaction = {
        //             _id: new ObjectId(),
        //             paymentMethod, // 'cash' or 'bank'
        //             bankName: paymentMethod === 'bank' ? bankName : 'N/A',
        //             transactionId,
        //             amount: Number(amount),
        //             status: 'pending', // অ্যাডমিন পরবর্তীতে এটি 'approved' করবে
        //             createdAt: new Date()
        //         };

        //         // bookingsCollection-এ নির্দিষ্ট বুকিং ডকুমেন্টের 'transactions' অ্যারেতে Push করা
        //         const result = await bookingsCollection.updateOne(
        //             { _id: new ObjectId(bookingId) },
        //             { $push: { transactions: newTransaction } }
        //         );

        //         if (result.modifiedCount > 0) {
        //             res.json({ success: true, message: 'Payment submitted for Admin approval!' });
        //         } else {
        //             res.status(400).json({ success: false, message: 'Booking not found' });
        //         }

        //     } catch (error) {
        //         console.error('Error submitting payment:', error);
        //         res.status(500).json({ success: false, message: error.message });
        //     }
        // });


        // 🔄 GET API: Query অনুযায়ী Specific Agent-এর Team Members Fetch করা
        app.get('/api/admin/team-members', async (req, res) => {
            try {
                const { agentId } = req.query; // 👈 ফ্রন্টএন্ড থেকে Query string ধরা হলো (?agentId=...)

                // ১. কোয়েরি অবজেক্ট তৈরি করা
                let filterQuery = {};

                // যদি ফ্রন্টএন্ড থেকে agentId পাঠানো হয়, তবেই সেটা দিয়ে ফিল্টার হবে
                if (agentId) {
                    filterQuery.agentId = agentId;

                }

                // ২. ডাটাবেজ থেকে ডাটা খোঁজা
                const members = await membersCollection
                    .find(filterQuery)
                    .toArray();

                // ৩. রেসপন্স পাঠানো
                res.status(200).send(members);

            } catch (error) {
                console.error('Error fetching team members:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to fetch team members.',
                    error: error.message,
                });
            }
        });

        app.get('/admin/transactions', async (req, res) => {
            const { bookingId } = req.query;
            const query = { bookingId: new ObjectId(bookingId) };
            const result = await transactionsCollection.find(query).toArray();
            res.send(result);
        })


        // blog collection find api 

        app.get('/api/blogs', async (req, res) => {
            try {
                const { agentId, id } = req.query;

                if (agentId && id) {
                    const query = { agentId: agentId, _id: new ObjectId(id) };
                    const result = await blogsCollection.findOne(query);

                    if (!result) {
                        return res.status(404).send({ message: "We dont get the blog" });
                    }
                    return res.send(result);
                }


                if (agentId) {
                    const query = { agentId: agentId };
                    const result = await blogsCollection.find(query).sort({ createdAt: -1 }).toArray();
                    return res.send(result);
                }


                const result = await blogsCollection.find().toArray();
                res.send(result);

            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Server error", error });
            }
        });








        // ==========================================
        // ২. এডমিন প্যানেল: অল ট্রানজ্যাকশন লিস্ট পাওয়ার API (Pending, Approved & Rejected)
        // ==========================================
        app.get('/api/admin/pending-payments', async (req, res) => {
            try {
                // Aggregate দিয়ে User এবং Booking-এর সাথে JOIN করা
                // 🔥 $match থেকে status: 'pending' সরিয়ে দেওয়া হলো যাতে সব ডাটা রিটার্ন করে
                const allTxns = await transactionsCollection.aggregate([
                    { $sort: { createdAt: -1 } }, // নতুন ট্রানজ্যাকশন সবার উপরে থাকবে
                    {
                        $lookup: {
                            from: 'users',
                            localField: 'userId',
                            foreignField: '_id',
                            as: 'user'
                        }
                    },
                    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
                    {
                        $lookup: {
                            from: 'bookings',
                            localField: 'bookingId',
                            foreignField: '_id',
                            as: 'booking'
                        }
                    },
                    { $unwind: { path: '$booking', preserveNullAndEmptyArrays: true } },
                    {
                        $project: {
                            amount: 1,
                            paymentMethod: 1,
                            bankName: 1,
                            transactionId: 1,
                            status: 1, // status: 'approved', 'rejected', or 'pending'
                            createdAt: 1,
                            'user.name': 1,
                            'user.email': 1,
                            'user.phone': 1,
                            'booking.projectName': 1,
                            'booking.totalAmount': 1,
                            'booking.totalPaid': 1
                        }
                    }
                ]).toArray();

                res.status(200).json({
                    success: true,
                    count: allTxns.length,
                    data: allTxns
                });

            } catch (error) {
                console.error("Error fetching transactions:", error);
                res.status(500).json({ success: false, message: error.message });
            }
        });


        // post apis here 



        // add projects (Updated for PropertyManagement.jsx)
        app.post('/projects', uploadImagesMiddleware, async (req, res) => {
            try {
                // ১. টেক্সট ডাটা ও নতুন ফিল্ডসমূহ রিসিভ করা
                const {
                    title,
                    price,
                    location,
                    category,
                    tag,
                    land,
                    status,
                    description,
                    brochureLink,
                    totalShares,
                    sharePrice,
                    bookingPrice,
                    buildingType,
                    frontRoad,
                    floors,
                    unitPerFloor,
                    passengerLift,
                    cargoLift,
                    electricityBackup,
                    rooftopGardening,
                    carParking,
                    conventionHall,
                    domain,
                    agentId,
                    amenities,
                    availableUnits,
                    availableShares
                } = req.body;

                // ২. ক্লাউডিনারিতে ফাইল আপলোড ও URL আনা (ফাইল না থাকলে ক্র্যাশ প্রতিরোধ সহ)
                let imageUrls = [];
                if (req.files && req.files.length > 0) {
                    imageUrls = await uploadToCloudinary(req.files);
                }

                // ৩. JSON ডাটা সেফলি পার্স করা (amenities ও availableUnits)
                let parsedAmenities = [];
                if (amenities) {
                    try {
                        parsedAmenities = typeof amenities === 'string' ? JSON.parse(amenities) : amenities;
                    } catch (err) {
                        console.warn("Amenities JSON parse error:", err.message);
                    }
                }

                let parsedUnits = [];
                if (availableUnits) {
                    try {
                        parsedUnits = typeof availableUnits === 'string' ? JSON.parse(availableUnits) : availableUnits;
                    } catch (err) {
                        console.warn("AvailableUnits JSON parse error:", err.message);
                    }
                }

                // ৪. ফাইনাল ডাটা অবজেক্ট তৈরি
                const finalProjectData = {
                    title: title || "",
                    price: price || "",
                    location: location || "",
                    category: category || "Apartments",
                    tag: tag || "",
                    land: land || "",
                    status: status || "completed",
                    description: description || "",
                    brochureLink: brochureLink || "",
                    domain: domain || "",
                    agentId: agentId || "",

                    // Share Structure
                    totalShares: Number(totalShares) || 0,
                    bookingPrice: Number(bookingPrice) || 0,
                    sharePrice: Number(sharePrice) || 0,
                    availableShares: Number(availableShares ?? totalShares) || 0,

                    // Building Specifications
                    buildingType: buildingType || "Residential",
                    floors: floors || 'B+G+6',
                    frontRoad: frontRoad || "",
                    unitPerFloor: Number(unitPerFloor) || 0,
                    passengerLift: Number(passengerLift) || 0,
                    cargoLift: Number(cargoLift) || 0,

                    // Features (FormData-র স্ট্রিং 'true'/'false' কে বুলিয়ানে কাস্ট করা)
                    electricityBackup: electricityBackup === 'true' || electricityBackup === true,
                    rooftopGardening: rooftopGardening === 'true' || rooftopGardening === true,
                    carParking: carParking === 'true' || carParking === true,
                    conventionHall: conventionHall === 'true' || conventionHall === true,

                    // Dynamic Data
                    amenities: parsedAmenities,
                    availableUnits: parsedUnits,

                    // ইমেজ হ্যান্ডলিং (পূর্বের মতো)
                    img: imageUrls.length > 0 ? imageUrls[0] : "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=600&q=80",
                    allImages: imageUrls,
                    images: imageUrls, // UI টেবিলের p.images এর সুবিধার্থে

                    createdAt: new Date()
                };

                // ৫. ডাটাবেজে ইনসার্ট
                const result = await projectsCollection.insertOne(finalProjectData);

                // ফ্রন্টএন্ডে রিয়েল-টাইম আপডেটের জন্য আইডি সহ অবজেক্ট পাঠানো
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



        // 🚀 POST: /api/bookings
        app.post('/api/bookings', async (req, res) => {
            try {
                const bookingData = req.body;
                const { email, applicantName, contactNo, projectId } = bookingData;


                if (!email) {
                    return res.status(400).json({ success: false, message: "Email is required!" });
                }


                // ১. চেক করা ইউজার আগে থেকে আছে কি না
                let user = await usersCollection.findOne({ email: email.toLowerCase() });
                let autoGeneratedPassword = null;

                if (!user) {
                    // ইউজার না থাকলে নতুন পাসওয়ার্ড জেনারেট করা (যেমন: pass_8a3f9)
                    autoGeneratedPassword = 'pass_' + Math.random().toString(36).slice(-5);
                    const hashedPassword = await bcrypt.hash(autoGeneratedPassword, 10);

                    const newUser = {
                        name: applicantName,
                        email: email.toLowerCase(),
                        phone: contactNo,
                        password: hashedPassword,
                        role: 'client',
                        createdAt: new Date()
                    };

                    // 💥 'users' কালেকশনে অটো ক্রিয়েট ও ইনসার্ট
                    const userResult = await usersCollection.insertOne(newUser);
                    user = { _id: userResult.insertedId, ...newUser };

                    // 📧 নতুন ইউজারকে পাসওয়ার্ড ইমেইল করে দেওয়া
                    try {
                        await transporter.sendMail({
                            from: '"Property Management" <noreply@yourdomain.com>',
                            to: email,
                            subject: 'Your Account Credentials for Property Portal',
                            html: `
            <h3>Dear ${applicantName},</h3>
            <p>Thank you for submitting your property booking application.</p>
            <p>An account has been automatically created for you to track your booking status.</p>
            <br/>
            <p><strong>Your Account Login Credentials:</strong></p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Password:</strong> <code style="background:#f4f4f4; padding:4px 8px; font-weight:bold;">${autoGeneratedPassword}</code></p>
            <br/>
            <p>Please log in to your dashboard to view your booking details and updates.</p>
          `
                        });
                    } catch (mailError) {
                        console.error("Failed to send email:", mailError);
                        // ইমেইল ফেল করলেও বুকিং আটকে থাকবে না
                    }
                }

                // ২. বুকিং অবজেক্টের সাথে userId লিঙ্ক করা
                const newBookingDocument = {
                    ...bookingData,
                    userId: user._id, // লিঙ্ক করা হলো ইউজার আইডির সাথে
                    status: 'pending', // প্রারম্ভিক স্ট্যাটাস
                    createdAt: new Date()
                };

                // 💥 'bookings' কালেকশনে ইনসার্ট
                const bookingResult = await bookingsCollection.insertOne(newBookingDocument);

              

                res.status(201).json({
                    success: true,
                    message: "Booking application submitted successfully!",
                    bookingId: bookingResult.insertedId,
                    accountCreated: !!autoGeneratedPassword
                });

            } catch (error) {
                console.error("Booking API Error:", error);
                res.status(500).json({ success: false, message: "Internal server error during booking." });
            }
        });


        // blogs post api 


        app.post('/api/blogs', upload.single('image'), async (req, res) => {
            try {
                const { title, category, excerpt, content, readTime, author, agentId, tags, socials } = req.body;

                // ১. ব্যাকএন্ড ভ্যালিডেশন
                if (!title || !req.file) {
                    return res.status(400).json({
                        success: false,
                        message: 'Title and cover image are required!'
                    });
                }

                // ২. ক্লাউডিনারিতে ইমেজ আপলোড (Memory Buffer handle)
                let imageUrl = '';
                if (req.file) {
                    const uploadResult = await uploadToCloudinary([req.file]); // array তে পাস করা হচ্ছে
                    if (uploadResult.length > 0) {
                        imageUrl = uploadResult[0];
                    }
                }

                // ৩. FormData এর মাধ্যমে পাঠানো Tags (Array) এবং Socials (Object) Parse করা
                let parsedTags = [];
                let parsedSocials = { facebook: '', linkedin: '', pinterest: '', twitter: '' };

                if (tags) {
                    try {
                        parsedTags = JSON.parse(tags);
                    } catch (err) {
                        parsedTags = [];
                    }
                }

                if (socials) {
                    try {
                        parsedSocials = JSON.parse(socials);
                    } catch (err) {
                        parsedSocials = {};
                    }
                }

                // ৪. MongoDB তে সেভ করার জন্য ডকুমেন্ট তৈরি
                const newBlog = {
                    title,
                    category: category || 'Market Insights',
                    excerpt: excerpt || '',
                    content: content || '',
                    readTime: readTime || '5 min read',
                    author: author || 'Admin',
                    img: imageUrl, // Cloudinary Image URL
                    tags: parsedTags, // ['RealEstate', 'Dhaka']
                    agentId: agentId,
                    socials: parsedSocials, // { facebook: '...', linkedin: '...' }
                    createdAt: new Date(),
                    publishedDate: new Date().toISOString().split('T')[0] // 'YYYY-MM-DD'
                };

                // 🗄️ ৫. MongoDB Collection এ ডাটা ইনসার্ট
                const result = await blogsCollection.insertOne(newBlog);

                res.status(201).json({
                    success: true,
                    message: 'Blog published successfully!',
                    blogId: result.insertedId,
                    blog: newBlog
                });

            } catch (error) {
                console.error('Error uploading blog:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to upload blog to server or Cloudinary.',
                    error: error.message
                });
            }
        });





        app.post('/api/submit-payment', async (req, res) => {
            try {
                const { bookingId, userId, amount, paymentMethod, bankName, transactionId } = req.body;

                // ১. প্রয়োজনীয় ফিল্ড চেক
                if (!bookingId || !userId || !amount || !transactionId || !paymentMethod) {
                    return res.status(400).json({ success: false, message: 'All required fields are needed.' });
                }

                // ২. ID গুলো ভ্যালিড MongoDB ObjectId কি না চেক
                if (!ObjectId.isValid(bookingId) || !ObjectId.isValid(userId)) {
                    console.log("Invalid ObjectId passed:", { bookingId, userId });
                    return res.status(400).json({ success: false, message: 'Invalid bookingId or userId format.' });
                }

                // ৩. Transaction ID ডুপ্লিকেট চেক
                const existingTxn = await transactionsCollection.findOne({ transactionId });
                if (existingTxn) {
                    return res.status(400).json({ success: false, message: 'Transaction ID already exists!' });
                }

                // ৪. নতুন অবজেক্ট তৈরি
                const newTransaction = {
                    bookingId: new ObjectId(bookingId),
                    userId: new ObjectId(userId),
                    amount: Number(amount),
                    paymentMethod,
                    bankName: bankName || 'N/A',
                    transactionId,
                    status: 'pending',
                    createdAt: new Date()
                };

                // ৫. Transactions Collection এ ইনসার্ট
                const txnResult = await transactionsCollection.insertOne(newTransaction);

                // ৬. Bookings Collection আপডেট
                await bookingsCollection.updateOne(
                    { _id: new ObjectId(bookingId) },
                    { $push: { transactions: txnResult.insertedId } }
                );

                res.status(201).json({
                    success: true,
                    message: 'Payment request submitted successfully. Pending verification.',
                    data: { _id: txnResult.insertedId, ...newTransaction }
                });

            } catch (error) {
                // 🔴 আসল এররটি সার্ভার টার্মিনালে দেখতে এই console.error টি দেওয়া জরুরি
                console.error("Error in /api/submit-payment:", error);
                res.status(500).json({ success: false, message: error.message });
            }
        });




        // ==========================================
        // ৩. এডমিন প্যানেল: Approve / Reject করার API
        // ==========================================
        app.patch('/api/admin/update-payment-status/:txnId', async (req, res) => {
            try {
                const { txnId } = req.params;
                const { status } = req.body; // 'approved' অথবা 'rejected'

                if (!['approved', 'rejected'].includes(status)) {
                    return res.status(400).json({ success: false, message: 'Invalid status value.' });
                }

                // ১. Transaction টি খুঁজে বের করা
                const transaction = await transactionsCollection.findOne({ _id: new ObjectId(txnId) });

                if (!transaction) {
                    return res.status(404).json({ success: false, message: 'Transaction not found.' });
                }

                if (transaction.status === 'approved') {
                    return res.status(400).json({ success: false, message: 'Transaction is already approved.' });
                }

                // ২. Transaction এর স্ট্যাটাস আপডেট করা
                await transactionsCollection.updateOne(
                    { _id: new ObjectId(txnId) },
                    { $set: { status: status, updatedAt: new Date() } }
                );

                // ৩. এডমিন যদি APPROVE করে
                if (status === 'approved') {
                    // ৩.১ Booking ডকুমেন্ট খুঁজে বের করা (যাতে projectId পাওয়া যায়)
                    const booking = await bookingsCollection.findOne({ _id: new ObjectId(transaction.bookingId) });

                    if (booking) {
                        // ৩.২ Booking এর totalPaid বৃদ্ধি করা
                        await bookingsCollection.updateOne(
                            { _id: new ObjectId(transaction.bookingId) },
                            { $inc: { totalPaid: Number(transaction.amount) } }
                        );

                        // ৩.৩ Booking-এ থাকা projectId ব্যবহার করে Projects-এর totalShare ১ বাড়ানো
                        if (booking.projectId) {
                            await projectsCollection.updateOne(
                                { _id: new ObjectId(booking.projectId) },
                                { $inc: { totalShare: 1 } } // totalShare ১ করে বাড়াবে
                            );
                        }
                    }
                }

                res.status(200).json({
                    success: true,
                    message: `Transaction ${status} successfully and project share updated!`
                });

            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });


        // ------------------------------------------------------------------
        // 🔑 Login API: POST /api/login
        // ------------------------------------------------------------------
        app.post('/api/login', async (req, res) => {
            try {
                const { email, password } = req.body;

                // ১. ইনপুট ভ্যালিডেশন
                if (!email || !password) {
                    return res.status(400).json({
                        success: false,
                        message: 'Email and password are required!'
                    });
                }

                // ২. Native MongoDB কালেকশন থেকে ইমেইল অনুযায়ী ইউজার খোঁজা
                const user = await usersCollection.findOne({ email: email });
                if (!user) {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid email or password!'
                    });
                }

                // ৩. পাসওয়ার্ড ভ্যালিডেশন 
                // (যদি রেজিস্ট্রেশনের সময় bcrypt দিয়ে হ্যাশ করে থাকেন)
                const isPasswordValid = await bcrypt.compare(password, user.password);

                // ⚠️ নোট: আপনি যদি ডাটাবেজে প্লেন টেক্সট (Plain Text) পাসওয়ার্ড সেভ করে থাকেন, 
                // তবে উপরের চেনের বদলে নিচের কমেন্ট করা লাইনটি ব্যবহার করতে পারেন:
                // const isPasswordValid = (user.password === password);

                if (!isPasswordValid) {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid email or password!'
                    });
                }

                // ৪. JWT টোকেন তৈরি করা
                const token = jwt.sign(
                    {
                        id: user._id,
                        email: user.email,
                        role: 'client'
                    },
                    process.env.JWT_SECRET || 'secret_key_123',
                    { expiresIn: '7d' }
                );

                // ৫. পাসওয়ার্ড বাদ দিয়ে ইউজার ডাটা প্রস্তুত করা
                const userData = {
                    _id: user._id,
                    name: user.name || user.fullName || 'User',
                    email: user.email,
                    role: 'client'
                };

                return res.status(200).json({
                    success: true,
                    message: 'Login successful!',
                    token,
                    user: userData
                });

            } catch (error) {
                console.error('Login API Error:', error);
                return res.status(500).json({
                    success: false,
                    message: 'Server error during login. Please try again.'
                });
            }
        });






        // ২. কন্টাক্ট এজেন্ট এপিআই এন্ডপয়েন্ট for email service

        app.post('/api/contact-agent', async (req, res) => {
            try {
                const {
                    propertyId,       // 👈 প্রোপার্টি আইডি
                    userName,
                    userEmail,
                    userPhone,
                    userMessage,
                    subject,          // Contact page-এর জন্য
                    agentEmail,
                    agencyName,
                    propertyTitle,
                    propertyPrice,
                    propertyLink
                } = req.body;


                // ডাটা ভ্যালিডেশন
                if (!userEmail || !userMessage) {
                    return res.status(400).send({ success: false, message: "Email and message are required." });
                }

                let mailOptions;

                // 🔀 condition: propertyId থাকলে এজেন্টের কাছে যাবে, না থাকলে এডমিনের কাছে
                if (propertyId) {

                    // 🏠 ১. এজেন্টের জন্য মেইলের খাম (Agent Email Template)
                    mailOptions = {
                        from: `"PrimeState Portal" <${process.env.EMAIL_USER}>`,
                        to: agentEmail,       // এজেন্টের পার্সোনাল মেইলে যাবে
                        replyTo: userEmail,   // রিপ্লাই দিলে সরাসরি ক্লায়েন্টের কাছে যাবে
                        subject: `🔥 New Lead for "${propertyTitle}" - PrimeState`,
                        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #1e3a8a; border-bottom: 2px solid #1e3a8a; padding-bottom: 10px;">Hello ${agencyName || 'Agent'},</h2>
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

                } else {

                    // 📩 ২. কন্টাক্ট পেজের নরমাল মেসেজের জন্য মেইলের খাম (Contact Form Email Template)
                    mailOptions = {
                        from: `"PrimeState Portal" <${process.env.EMAIL_USER}>`,
                        to: agentEmail,   // এডমিনের নিজস্ব মেইলে যাবে
                        replyTo: userEmail,           // রিপ্লাই দিলে সরাসরি ইউজারের কাছে যাবে
                        subject: `📩 Contact Form Message: ${subject || 'New Message'}`,
                        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #0b4d34; border-bottom: 2px solid #0b4d34; padding-bottom: 10px;">New Message from Contact Us Page</h2>
          <p style="font-size: 15px;">You have received a new contact submission from your website.</p>
          
          <div style="background-color: #fff; padding: 15px; border: 1px solid #e2e8f0; border-radius: 6px; margin: 20px 0;">
            <h3 style="color: #0b4d34; margin-top: 0;">👤 Sender Details</h3>
            <p style="margin: 5px 0;"><strong>Name:</strong> ${userName || 'N/A'}</p>
            <p style="margin: 5px 0;"><strong>Email:</strong> ${userEmail}</p>
            <p style="margin: 5px 0;"><strong>Phone:</strong> ${userPhone || 'Not provided'}</p>
            <p style="margin: 5px 0;"><strong>Subject:</strong> ${subject || 'General Inquiry'}</p>
            <p style="margin: 10px 0 0 0;"><strong>Message:</strong></p>
            <blockquote style="background: #f1f5f9; padding: 12px; border-left: 4px solid #0b4d34; margin: 5px 0; font-style: italic;">
              "${userMessage}"
            </blockquote>
          </div>
          
          <p style="font-size: 12px; color: #64748b; text-align: center; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px;">
            This is an automated email from PrimeState Contact Form. Hit "Reply" to respond directly to the sender.
          </p>
        </div>
      `
                    };

                }

                // ✉️ মেইল সেন্ড করা
                await transporter.sendMail(mailOptions);

                res.status(200).send({
                    success: true,
                    message: propertyId ? "Email sent to agent successfully!" : "Contact message sent successfully!"
                });

            } catch (error) {
                console.error("Nodemailer Error:", error);
                res.status(500).send({ success: false, message: "Internal server error while sending email." });
            }
        });


        // posting the team member data 

        app.post('/api/admin/team-members',
            upload.single('image'),
            async (req, res) => {
                try {
                    const { name, designation, bio, facebook, linkedin, agentId } = req.body;

                    // ১. ফর্ম ভ্যালিডেশন চেক
                    if (!name || !designation || !bio) {
                        return res.status(400).json({
                            success: false,
                            message: 'Name, designation, and bio are required fields.',
                        });
                    }

                    // ২. ছবি আপলোড হয়েছে কিনা চেক করা
                    if (!req.file) {
                        return res.status(400).json({
                            success: false,
                            message: 'Please upload a profile image for the team member.',
                        });
                    }

                    // ৩. ক্লাউডিনারিতে আপলোড প্রসেসিং
                    // (আপনার ইউটিলিটি ফাংশন `uploadToCloudinary` অ্যারে গ্রহণ করে, তাই ফাইলটিকে অ্যারে আকারে পাঠানো হচ্ছে)
                    const uploadedImages = await uploadToCloudinary([req.file]);
                    const imageUrl = uploadedImages[0]; // প্রথম আপলোড হওয়া ছবির URL

                    // ৪. ডাটাবেজে সেভ করার জন্য অবজেক্ট রেডি করা
                    const newMember = {
                        name,
                        designation,
                        bio,
                        facebook: facebook || '',
                        linkedin: linkedin || '',
                        imageUrl,
                        agentId,
                        createdAt: new Date(),
                    };

                    // ৫. MongoDB-র membersCollection-এ ডাটা ইনসার্ট করা
                    const result = await membersCollection.insertOne(newMember);

                    // ০০০. রেসপন্স পাঠানো
                    res.status(201).json({
                        success: true,
                        message: 'Team member added successfully!',
                        data: {
                            _id: result.insertedId,
                            ...newMember,
                        },
                    });

                } catch (error) {
                    console.error('Error adding team member:', error);
                    res.status(500).json({
                        success: false,
                        message: 'Internal Server Error. Failed to add team member.',
                        error: error.message,
                    });
                }
            }
        );




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